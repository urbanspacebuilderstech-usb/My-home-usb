"""
Correction Engine — shared Reject / Resubmit / Send-for-Correction loop.

Unified status vocabulary (used by every entity that this engine touches):
  - awaiting_accountant : the entity is queued for accountant approval
  - accountant_rejected : the accountant rejected it; the original requester
                          must edit and resubmit before it's approved
  - approved            : approved — counts in cashbook / cashflow / totals
  - under_correction    : was approved, then the accountant pulled it back for
                          correction. Cashflow ledger entries are REVERSED
                          immediately so it disappears from every tile/total
                          until re-approval.

Each entity also keeps a `correction_history[]` audit trail with every flip.

Supported entities (keys passed to the helpers):
  - 'petty_cash'        → db.petty_cash, id field: petty_cash_id
  - 'material_request'  → db.material_requests, id field: request_id
  - 'income'            → db.income, id field: income_id
  - 'lead_advance'      → db.leads.advance_payment, id field: lead_id (special)

For now the engine is wired into 'petty_cash' end-to-end. The other entities
will plug in via the same `EntityConfig` registry without changing this module.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from core.database import db
from core.models import User, UserRole
from routes.cashflow import reverse_allocation, allocate_expense, allocate_income


# ─────────────────────────────────────────────────────────────────────────────
# Entity registry — one place to add new modules.
# ─────────────────────────────────────────────────────────────────────────────
class EntityConfig:
    """Per-entity behaviour for the correction engine."""

    def __init__(
        self,
        collection: str,
        id_field: str,
        editable_fields: List[str],
        requester_role_check,  # callable(user, doc) -> bool
        cashflow_kind: Optional[str] = None,   # 'expense' or 'income' (for ledger reversal)
        on_approve=None,                       # async callable(doc) -> None — re-allocate cashflow
    ):
        self.collection = collection
        self.id_field = id_field
        self.editable_fields = editable_fields
        self.requester_role_check = requester_role_check
        self.cashflow_kind = cashflow_kind
        self.on_approve = on_approve


def _can_edit_petty_cash(user: User, doc: Dict[str, Any]) -> bool:
    """Only the original requester (SE/PM/Asst PM) or Super Admin may edit."""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return doc.get("requested_by") == user.user_id


def _can_edit_material_request(user: User, doc: Dict[str, Any]) -> bool:
    """Original planner (or any Planning user) or Super Admin may edit."""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if doc.get("requested_by") == user.user_id:
        return True
    return user.role == UserRole.PLANNING


def _can_edit_income(user: User, doc: Dict[str, Any]) -> bool:
    """Original collector (Sales/CRE) or Super Admin may edit."""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return doc.get("collected_by") == user.user_id or doc.get("created_by") == user.user_id


ENTITY_REGISTRY: Dict[str, EntityConfig] = {
    "petty_cash": EntityConfig(
        collection="petty_cash",
        id_field="petty_cash_id",
        editable_fields=["amount_requested", "purpose", "remarks", "project_id"],
        requester_role_check=_can_edit_petty_cash,
        cashflow_kind="expense",
    ),
    "material_request": EntityConfig(
        collection="material_requests",
        id_field="request_id",
        editable_fields=["items", "remarks", "priority", "required_date"],
        requester_role_check=_can_edit_material_request,
        cashflow_kind="expense",
    ),
    "income": EntityConfig(
        collection="income",
        id_field="income_id",
        editable_fields=["amount", "payment_mode", "payment_reference", "remarks", "cheque_details"],
        requester_role_check=_can_edit_income,
        cashflow_kind="income",
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# Core helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _history_entry(action: str, user: User, reason: Optional[str] = None, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "action": action,
        "by": user.user_id,
        "by_name": user.name,
        "at": _now_iso(),
    }
    if reason:
        entry["reason"] = reason
    if extra:
        entry["extra"] = extra
    return entry


async def _load_or_404(cfg: EntityConfig, entity_id: str) -> Dict[str, Any]:
    doc = await db[cfg.collection].find_one({cfg.id_field: entity_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Entity not found")
    return doc


async def apply_rejection(
    entity: str,
    entity_id: str,
    reason: str,
    user: User,
    notify_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Accountant rejects a pending entry. Flips to `accountant_rejected`.

    Pre-condition: the entity must currently be in `awaiting_accountant` (or a
    legacy status that maps to it). Already-approved entries must use
    `apply_send_for_correction` instead.
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    cfg = ENTITY_REGISTRY.get(entity)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}")
    doc = await _load_or_404(cfg, entity_id)

    history = doc.get("correction_history", [])
    history.append(_history_entry("rejected", user, reason))

    update = {
        "status": "accountant_rejected",
        "rejected_by": user.user_id,
        "rejected_by_name": user.name,
        "rejected_at": _now_iso(),
        "rejection_reason": reason,
        "correction_history": history,
        "updated_at": _now_iso(),
    }
    await db[cfg.collection].update_one({cfg.id_field: entity_id}, {"$set": update})

    # Best-effort notification to the original requester.
    target = notify_user_id or doc.get("requested_by") or doc.get("collected_by") or doc.get("created_by")
    if target:
        await db.notifications.insert_one({
            "notification_id": f"notif_{datetime.now(timezone.utc).timestamp()}",
            "user_id": target,
            "title": "Request Rejected by Accountant",
            "message": f"Your {entity.replace('_', ' ')} request was rejected. Reason: {reason}",
            "type": f"{entity}_rejected",
            "reference_id": entity_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })

    return {"message": "Rejected and returned for correction", "status": "accountant_rejected"}


async def apply_resubmit(
    entity: str,
    entity_id: str,
    edited_payload: Dict[str, Any],
    user: User,
) -> Dict[str, Any]:
    """Original requester edits and resubmits — flips back to `awaiting_accountant`.

    Works for both `accountant_rejected` (never approved) and `under_correction`
    (was approved then pulled back) states.
    """
    cfg = ENTITY_REGISTRY.get(entity)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}")
    doc = await _load_or_404(cfg, entity_id)
    status = doc.get("status")
    if status not in ("accountant_rejected", "under_correction", "rejected", "accounts_rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot resubmit from status '{status}'")
    if not cfg.requester_role_check(user, doc):
        raise HTTPException(status_code=403, detail="Only the original requester can resubmit")

    # Whitelist-edit fields based on entity config.
    edits: Dict[str, Any] = {}
    for k in cfg.editable_fields:
        if k in edited_payload and edited_payload[k] is not None:
            edits[k] = edited_payload[k]
    if not edits:
        raise HTTPException(status_code=400, detail="At least one editable field must be provided")

    history = doc.get("correction_history", [])
    history.append(_history_entry("resubmitted", user, extra={"edited_fields": list(edits.keys())}))

    update = {
        **edits,
        "status": "awaiting_accountant",
        "resubmitted_by": user.user_id,
        "resubmitted_by_name": user.name,
        "resubmitted_at": _now_iso(),
        # Clear previous rejection markers so the UI banners hide.
        "rejection_reason": None,
        "rejected_by": None,
        "rejected_by_name": None,
        "rejected_at": None,
        "correction_history": history,
        "updated_at": _now_iso(),
    }
    await db[cfg.collection].update_one({cfg.id_field: entity_id}, {"$set": update})

    # Notify all accountants.
    accountants = await db.users.find({"role": UserRole.ACCOUNTANT, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    for a in accountants:
        await db.notifications.insert_one({
            "notification_id": f"notif_{datetime.now(timezone.utc).timestamp()}_{a['user_id']}",
            "user_id": a["user_id"],
            "title": "Re-submitted for Approval",
            "message": f"A {entity.replace('_', ' ')} request was edited and resubmitted by {user.name}.",
            "type": f"{entity}_resubmitted",
            "reference_id": entity_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })

    return {"message": "Resubmitted for accountant approval", "status": "awaiting_accountant"}


async def apply_send_for_correction(
    entity: str,
    entity_id: str,
    reason: str,
    user: User,
) -> Dict[str, Any]:
    """Accountant pulls back an Approved entry for correction.

    Pre-condition: entity status must currently be `approved` (or legacy
    equivalents like `accounts_approved`, `issued`, `settled`, `completed`).
    This is DISTINCT from `apply_rejection` which only works on never-approved
    entries.

    Side-effects:
      - Flips status to `under_correction`.
      - REVERSES the cashflow_ledger entries for this source_id so the amount
        stops counting in Direct/Indirect pools, project totals, and engine
        summary immediately.
      - Persists the reason + audit history.
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can send for correction")
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Correction reason is required")
    cfg = ENTITY_REGISTRY.get(entity)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}")
    doc = await _load_or_404(cfg, entity_id)
    current_status = (doc.get("status") or "").lower()
    APPROVED_STATES = {"approved", "accounts_approved", "issued", "settled", "completed", "partially_settled", "payment_done"}
    if current_status not in APPROVED_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Can only send for correction from an approved state (current: '{current_status}')"
        )

    history = doc.get("correction_history", [])
    history.append(_history_entry("sent_for_correction", user, reason, extra={"prev_status": current_status}))

    # Reverse cashflow ledger entries tied to this source.
    reversed_count = 0
    if cfg.cashflow_kind:
        reversed_count = await reverse_allocation(entity_id, kind=cfg.cashflow_kind)

    update = {
        "status": "under_correction",
        "prev_approved_status": current_status,
        "correction_requested_by": user.user_id,
        "correction_requested_by_name": user.name,
        "correction_requested_at": _now_iso(),
        "correction_reason": reason,
        "correction_history": history,
        "updated_at": _now_iso(),
    }
    await db[cfg.collection].update_one({cfg.id_field: entity_id}, {"$set": update})

    # Notify the original requester so they can edit + resubmit.
    target = doc.get("requested_by") or doc.get("collected_by") or doc.get("created_by")
    if target:
        await db.notifications.insert_one({
            "notification_id": f"notif_{datetime.now(timezone.utc).timestamp()}",
            "user_id": target,
            "title": "Approved Entry Sent Back for Correction",
            "message": f"An approved {entity.replace('_', ' ')} was sent back for correction. Reason: {reason}. The amount has been removed from Cashbook until you correct & resubmit.",
            "type": f"{entity}_under_correction",
            "reference_id": entity_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc),
        })

    return {
        "message": "Approved entry sent back for correction. Cashflow entries reversed.",
        "status": "under_correction",
        "ledger_rows_reversed": reversed_count,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Cashbook / Cashflow filter helper — exposed for other modules to reuse so we
# stop counting `accountant_rejected` and `under_correction` rows everywhere.
# ─────────────────────────────────────────────────────────────────────────────
EXCLUDED_FROM_TOTALS = ["accountant_rejected", "rejected", "accounts_rejected", "under_correction"]


def status_not_excluded_query() -> Dict[str, Any]:
    """MongoDB query fragment to exclude correction-engine non-final rows."""
    return {"status": {"$nin": EXCLUDED_FROM_TOTALS}}
