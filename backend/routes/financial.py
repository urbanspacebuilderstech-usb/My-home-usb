"""
Financial Routes - Income, Enhanced Project View, Expenses (Material, Labour, Vendor), Payment Recording, Summary, Settings, Materials, Vendor Master, Users
Migrated from server.py monolith
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import os
import io
import json
import asyncio
import logging
from bson import ObjectId

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== INTERNAL HELPERS ====================

async def _sync_addition_cost_received(stage_id: str):
    """Re-sync `additional_costs.income_received` to the linked payment_stage's
    `amount_received` whenever the stage's received amount changes (income
    rejected / sent-for-correction / cheque bounced). Without this the
    Addition row on ProjectDetail keeps showing a stale `income_received`
    value (and `cre_approved=True`) even though the money has been reversed
    everywhere else — causing "ghost received" amounts in the Client Portal
    and Planning boards.

    Idempotent: safe to call repeatedly. Only acts on stages flagged as
    additions with a linked_addition_id.
    """
    if not stage_id:
        return
    try:
        stage = await db.payment_stages.find_one(
            {"stage_id": stage_id},
            {"_id": 0, "is_addition": 1, "is_section_addition": 1, "linked_addition_id": 1, "linked_addition_ids": 1, "amount_received": 1, "amount": 1},
        )
        if not stage or not stage.get("is_addition"):
            return
        received = float(stage.get("amount_received", 0) or 0)
        cost_amount = float(stage.get("amount", 0) or 0)

        # ─── Section-level stage (Feb 2026): distribute received pro-rata across
        # every linked addition row so each row's income_received tracks the
        # section's collection ratio. ────────────────────────────────────────
        if stage.get("is_section_addition") and stage.get("linked_addition_ids"):
            cost_ids = stage["linked_addition_ids"]
            if not cost_ids:
                return
            rows = await db.additional_costs.find(
                {"cost_id": {"$in": cost_ids}},
                {"_id": 0, "cost_id": 1, "estimated_amount": 1, "actual_amount": 1, "qty": 1, "price": 1},
            ).to_list(len(cost_ids))
            totals = {}
            grand = 0.0
            for r in rows:
                amt = float(r.get("estimated_amount") or r.get("actual_amount") or ((r.get("qty") or 0) * (r.get("price") or 0)) or 0)
                totals[r["cost_id"]] = amt
                grand += amt
            if grand <= 0:
                return
            for cid in cost_ids:
                row_total = totals.get(cid, 0)
                share = (row_total / grand) * received if grand else 0
                set_doc = {"income_received": share}
                if row_total and share < row_total - 0.5:
                    set_doc["cre_approved"] = False
                    set_doc["cre_approved_at"] = None
                await db.additional_costs.update_one({"cost_id": cid}, {"$set": set_doc})
            return

        # ─── Single-row stage (legacy path) ──────────────────────────────────
        if not stage.get("linked_addition_id"):
            return
        cost_id = stage["linked_addition_id"]
        set_doc = {"income_received": received}
        # If it dropped below the full-collection threshold, clear cre_approved
        # so the row visibly returns to "With CRE · Payment Schedule" state.
        if cost_amount and received < cost_amount - 0.5:
            set_doc["cre_approved"] = False
            set_doc["cre_approved_at"] = None
        await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": set_doc})
    except Exception as e:
        logger.warning(f"Addition-cost income_received resync skipped for stage {stage_id}: {e}")


# ==================== INCOME MODULE ENDPOINTS ====================

class IncomeCreate(BaseModel):
    project_id: str
    amount: float
    payment_mode: str  # cash, cheque, bank_transfer, upi, petty_cash
    payment_date: str  # ISO date string
    cheque_number: Optional[str] = None
    bank_name: Optional[str] = None
    reference_number: Optional[str] = None
    remarks: Optional[str] = None


class IncomeUpdate(BaseModel):
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_date: Optional[str] = None
    cheque_number: Optional[str] = None
    bank_name: Optional[str] = None
    reference_number: Optional[str] = None
    remarks: Optional[str] = None



# ==================== ACCOUNTANT DASHBOARD OVERVIEW ====================


# ==================== CARRY FORWARD / CLOSING BALANCE ====================
# Feb 12 2026 — single-row "closing balance" snapshot the Super Admin uses to
# manually record the firm's true cash position across 4 buckets + a manual
# overall number. The Accountant board surfaces it on a dedicated
# Carry Forward tab; only Super Admin can edit.

CLOSING_BALANCE_DOC_ID = "closing_balance_singleton"

# Feb 22 2026 — Mapping from closing-balance bucket key → payment_mode
# value stored on `db.income`. Frontend `classifyMode` knows about these
# values and renders them with the right colour/label (e.g. HDFC SAVINGS,
# CASH D/T) so no extra normalisation is needed UI-side.
_CF_LOCK_MODE_MAP = {
    "cash": "cash",
    "current_account": "current_account",
    "savings": "savings_account",
    "cheque": "cheque",
    "direct_transfer": "direct_transfer",
}
_CF_LOCK_SOURCE = "carry_forward_lock"


async def _sync_carry_forward_to_cashbook(buckets: Dict[str, Dict[str, float]], locked_at: str, user_id: str, user_name: str):
    """Reflect Lock Closing Balance bucket-wise INCOME values as Cashbook
    Income entries tagged `source=carry_forward_lock` so they surface
    under the new "Carry Forward" sub-tab inside Accountant → Cashbook →
    Income, and contribute to the Main Account totals.

    Idempotent: every call first purges previous `carry_forward_lock`
    rows and re-creates fresh ones from the current bucket totals. Zero-
    amount buckets get no row so the tab stays clean.

    Entries are created WITHOUT a `project_id` so they only appear in
    the Cashbook Main Account view — when an Accountant filters by
    project they are excluded automatically by the `project_id`
    query clause on `/accountant/cashbook-filtered`.
    """
    # 1. Purge any prior auto-locked rows so re-locking is a clean
    #    overwrite (option `a` confirmed by user).
    try:
        await db.income.delete_many({"source": _CF_LOCK_SOURCE})
    except Exception as e:
        logger.warning("carry_forward_lock purge failed: %s", e)

    # 2. Create one income row per non-zero bucket.
    now = datetime.now(timezone.utc).isoformat()
    for bucket_key, mode in _CF_LOCK_MODE_MAP.items():
        b = (buckets or {}).get(bucket_key) or {}
        try:
            inc_amount = float(b.get("income") or 0)
        except (TypeError, ValueError):
            inc_amount = 0.0
        if inc_amount <= 0:
            continue
        row = {
            "income_id": f"cflk_{uuid.uuid4().hex[:12]}",
            "project_id": None,           # firm-level → Main Account only
            "project_name": "Carry Forward",
            "amount": inc_amount,
            "payment_mode": mode,
            "payment_date": locked_at,
            "created_at": locked_at,
            "approved_at": locked_at,
            "status": "approved",
            "source": _CF_LOCK_SOURCE,
            "stage": "Carry Forward",
            "description": f"Carry-forward lock — {mode} bucket",
            "remarks": "Auto-generated from Lock Closing Balance",
            "recorded_by": user_id,
            "recorded_by_name": user_name,
            "reference_number": "CF-LOCK",
        }
        try:
            await db.income.insert_one(row)
        except Exception as e:
            logger.warning("carry_forward_lock insert failed (%s): %s", bucket_key, e)


@router.get("/accountant/closing-balance")
async def get_closing_balance(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    doc = await db.closing_balances.find_one({"_id": CLOSING_BALANCE_DOC_ID})
    bucket_keys = ["current_account", "savings", "cash", "cheque", "direct_transfer"]
    empty_bucket = {"income": 0, "expense": 0, "balance": 0}
    if not doc:
        return {
            "manual_amount": 0,
            "buckets": {k: dict(empty_bucket) for k in bucket_keys},
            "total_income": 0,
            "total_expense": 0,
            "total_balance": 0,
            # Legacy mirrors
            "current_account": 0, "savings": 0, "cash": 0, "cheque": 0, "total": 0,
            "locked_at": None, "locked_by_name": None,
        }
    doc.pop("_id", None)
    # Back-fill the new `buckets` shape for legacy docs that only have flat keys.
    if "buckets" not in doc or not isinstance(doc.get("buckets"), dict):
        legacy = {k: float(doc.get(k) or 0) for k in ["current_account", "savings", "cash", "cheque"]}
        doc["buckets"] = {
            "current_account": {"income": legacy["current_account"], "expense": 0, "balance": legacy["current_account"]},
            "savings": {"income": legacy["savings"], "expense": 0, "balance": legacy["savings"]},
            "cash": {"income": legacy["cash"], "expense": 0, "balance": legacy["cash"]},
            "cheque": {"income": legacy["cheque"], "expense": 0, "balance": legacy["cheque"]},
            "direct_transfer": dict(empty_bucket),
        }
        doc["total_income"] = sum(b["income"] for b in doc["buckets"].values())
        doc["total_expense"] = 0
        doc["total_balance"] = doc["total_income"]
    else:
        # Ensure all 5 buckets are present
        for k in bucket_keys:
            if k not in doc["buckets"]:
                doc["buckets"][k] = dict(empty_bucket)
    return doc


@router.post("/accountant/closing-balance")
async def save_closing_balance(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can lock the closing balance")

    def _num(v):
        try:
            return float(v or 0)
        except (TypeError, ValueError):
            return 0.0

    # Feb 12 2026 — closing balance now tracks income + expense per bucket
    # (5 modes: Current Account, Savings, Cash, Cheque, Direct Transfer). The
    # legacy single `current_account/savings/cash/cheque` shape is still
    # accepted on the wire so older clients keep working — they just write to
    # the Income side of each bucket.
    bucket_keys = ["current_account", "savings", "cash", "cheque", "direct_transfer"]
    buckets_in = payload.get("buckets") or {}
    buckets_out = {}
    total_income = 0.0
    total_expense = 0.0
    for k in bucket_keys:
        b = buckets_in.get(k) or {}
        inc = _num(b.get("income")) if "income" in b else _num(payload.get(k))
        exp = _num(b.get("expense"))
        buckets_out[k] = {"income": inc, "expense": exp, "balance": inc - exp}
        total_income += inc
        total_expense += exp
    total_balance = total_income - total_expense

    manual = _num(payload.get("manual_amount"))
    if not manual:  # Auto-derive when caller omits it
        manual = total_balance

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": CLOSING_BALANCE_DOC_ID,
        "buckets": buckets_out,
        "total_income": total_income,
        "total_expense": total_expense,
        "total_balance": total_balance,
        "manual_amount": manual,
        # Legacy mirrors (kept so old clients reading top-level keys still work)
        "current_account": buckets_out["current_account"]["balance"],
        "savings": buckets_out["savings"]["balance"],
        "cash": buckets_out["cash"]["balance"],
        "cheque": buckets_out["cheque"]["balance"],
        "total": total_balance,
        "locked_at": now,
        "locked_by": user.user_id,
        "locked_by_name": user.name,
    }
    await db.closing_balances.update_one(
        {"_id": CLOSING_BALANCE_DOC_ID}, {"$set": doc}, upsert=True,
    )
    # Sync bucket-wise INCOME totals into the Cashbook Income ledger so
    # they appear under the "Carry Forward" sub-tab and contribute to
    # Main Account totals. Best-effort: a failure here must not block
    # the lock itself.
    try:
        await _sync_carry_forward_to_cashbook(buckets_out, now, user.user_id, user.name)
    except Exception as e:
        logger.warning("carry_forward_lock sync skipped: %s", e)
    await create_audit_log(
        user.user_id, "lock_closing_balance", "closing_balance",
        CLOSING_BALANCE_DOC_ID,
        {"manual_amount": manual, "total_balance": total_balance},
    )
    doc.pop("_id", None)
    return doc


@router.post("/accountant/closing-balance/sync-cashbook")
async def backfill_closing_balance_to_cashbook(user: User = Depends(get_current_user)):
    """One-shot backfill: take the CURRENT locked closing-balance doc and
    sync its bucket INCOME values to the Cashbook Income ledger as
    `source=carry_forward_lock` rows. Used immediately after the
    Feb 22 2026 deploy so the lock the user already saved (before this
    feature shipped) starts appearing under the new Carry Forward tab
    without forcing them to re-enter the numbers.

    Idempotent: every call cleanly overwrites any prior carry_forward_lock
    rows.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can backfill the closing balance")
    doc = await db.closing_balances.find_one({"_id": CLOSING_BALANCE_DOC_ID})
    if not doc:
        return {"message": "No closing balance locked yet — nothing to backfill", "inserted": 0}
    locked_at = doc.get("locked_at") or datetime.now(timezone.utc).isoformat()
    await _sync_carry_forward_to_cashbook(
        doc.get("buckets") or {}, locked_at, user.user_id, user.name,
    )
    count = await db.income.count_documents({"source": _CF_LOCK_SOURCE})
    return {"message": "Carry-forward Cashbook entries refreshed from current lock", "inserted": count}


# ==================== PROJECT-WISE CARRY FORWARD ====================
# Feb 12 2026 — per-project manual adjustment + carry-forward amounts so the
# Super Admin can align the live ledger with offline / historical books.
# Stored as one doc per project with both income & expense fields.


async def _compute_project_carry_forward_row(project, cf_doc):
    """Compute the live numbers shown in the Carry Forward project table.
    Returns dict matching the frontend table columns."""
    pid = project["project_id"]

    # Income (approved) — payment_collection + any approved income for project
    inc_pipeline = [
        {"$match": {
            "project_id": pid,
            "status": "approved",
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    inc_total = 0
    async for r in db.income.aggregate(inc_pipeline):
        inc_total = float(r.get("total") or 0)

    # Direct expense buckets — match Cashbook's "approved" filter so the
    # Carry Forward Total Expense reconciles with the Cashbook Expense card.
    # Cashbook (`/accountant/cashbook-filtered`, sf=approved) treats these
    # statuses as the canonical "live ledger expense":
    #   material  → accounts_approved / issued / settled / completed
    #   labour    → accounts_approved / settled / completed (paid_full/paid_partial mirror these)
    #   vendor    → accounts_approved / settled / completed
    # Previously this query filtered ["paid", "approved"] which under-counted
    # by ~93% (₹67,070 in Cashbook vs ₹4,650 in Carry Forward). Feb 12 2026.
    # Feb 20 2026 — Carry Forward direct expense must reconcile with Project
    # Wise (cashbook-filtered) and Project Board (/projects/{id}/expenses).
    # All three now read from the same authoritative sources:
    #   • recorded_expenses (excl. rejected / cheque_bounced / under_correction)
    #   • labour_expenses   (accounts_approved / paid / settled / completed)
    #   • material_requests (approved / paid / accounts_approved)
    # Legacy `material_expenses` / `direct_expenses` are kept as fallbacks for
    # older data that hasn't migrated yet.
    EXCLUDED_RE = ["rejected", "accountant_rejected", "accounts_rejected", "under_correction", "cheque_bounced"]
    re_total = 0
    async for r in db.recorded_expenses.aggregate([
        {"$match": {"project_id": pid, "status": {"$nin": EXCLUDED_RE}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]):
        re_total = float(r.get("total") or 0)

    MATERIAL_APPROVED = ["accounts_approved", "issued", "settled", "completed", "paid"]
    LABOUR_APPROVED = ["accounts_approved", "settled", "completed", "paid", "paid_full", "paid_partial"]
    # Feb 20 2026 — Strict accountant-approval rule: "approved" alone is
    # planning-approved, NOT accountant-approved, so it does NOT count as an
    # actual project expense. Same goes for `procurement_verifying`,
    # `pm_approved`, `pending_accounts_approval`. Only post-accountant-approval
    # statuses (`accounts_approved` onward) are considered real expense.
    MR_APPROVED = ["accounts_approved", "approved_for_po", "po_issued", "in_transit", "received", "delivered", "paid", "issued", "completed", "settled"]

    mat_total = 0
    async for r in db.material_expenses.aggregate([
        {"$match": {"project_id": pid, "status": {"$in": MATERIAL_APPROVED}}},
        {"$group": {"_id": None, "total": {"$sum": "$final_amount"}}},
    ]):
        mat_total = float(r.get("total") or 0)
    if mat_total == 0:
        async for r in db.material_expenses.aggregate([
            {"$match": {"project_id": pid, "status": {"$in": MATERIAL_APPROVED}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]):
            mat_total = float(r.get("total") or 0)
    # Newer material_requests collection (Mrs Abinaya & others use this path).
    async for r in db.material_requests.aggregate([
        {"$match": {"project_id": pid, "status": {"$in": MR_APPROVED}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$total_amount", "$amount"]}}}},
    ]):
        mat_total += float(r.get("total") or 0)

    wo_total = 0
    async for r in db.labour_expenses.aggregate([
        {"$match": {"project_id": pid, "status": {"$in": LABOUR_APPROVED}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
    ]):
        wo_total = float(r.get("total") or 0)

    # Petty cash on a site — pulled from direct_expenses (PM site expenses).
    # Feb 20 2026 — Strict accountant-approval rule: only count items inside
    # docs that have been accountant-approved (or legacy docs without a
    # status field). PM-approved / pending docs do NOT count as expense.
    DIRECT_APPROVED = ["accounts_approved", "paid", "completed", "acknowledged", "payment_done"]
    pc_total = 0
    async for r in db.direct_expenses.aggregate([
        {"$match": {
            "project_id": pid,
            "$or": [
                {"status": {"$in": DIRECT_APPROVED}},
                {"status": {"$exists": False}},
                {"status": None},
            ],
        }},
        {"$unwind": "$items"},
        {"$group": {"_id": None, "total": {"$sum": "$items.amount"}}},
    ]):
        pc_total = float(r.get("total") or 0)

    direct_total = re_total + mat_total + wo_total + pc_total

    cf = cf_doc or {}
    # Feb 12 2026 — expense carry-forward now broken into 4 explicit buckets
    # per user request: Material / Labour / Petty Cash (direct) + Indirect.
    # Legacy `expense_carry_forward` (rolled-up) and `expense_adjustment`
    # fields are still read so existing data survives the migration.
    mat_cf = float(cf.get("material_carry_forward") or 0)
    lab_cf = float(cf.get("labour_carry_forward") or 0)
    pc_cf = float(cf.get("petty_cash_carry_forward") or 0)
    indirect_cf = float(cf.get("indirect_carry_forward") or 0)
    # Backward compat: if new fields are all zero AND legacy fields are set,
    # surface the legacy values under Indirect so the user can re-bucket them.
    if (mat_cf + lab_cf + pc_cf + indirect_cf) == 0:
        legacy_total = float(cf.get("expense_carry_forward") or 0) + float(cf.get("expense_adjustment") or 0)
        if legacy_total:
            indirect_cf = legacy_total

    direct_cf = mat_cf + lab_cf + pc_cf
    expense_cf_total = direct_cf + indirect_cf

    inc_cf = float(cf.get("income_carry_forward") or 0)
    inc_adj = float(cf.get("income_adjustment") or 0)

    grand_expense = direct_total + expense_cf_total
    grand_income = inc_total + inc_adj + inc_cf

    project_value = float(project.get("original_estimate") or project.get("total_value") or 0)

    return {
        "project_id": pid,
        "project_name": project.get("name"),
        "project_value": project_value,
        # Income side
        "total_income": inc_total,
        "income_adjustment": inc_adj,
        "income_carry_forward": inc_cf,
        "grand_income": grand_income,
        # Expense actuals (live ledger)
        "material_expense": mat_total,
        "work_order_expense": wo_total,
        "petty_cash_expense": pc_total,
        "direct_expense_total": direct_total,
        # Expense carry-forward (manual) — per-bucket
        "material_carry_forward": mat_cf,
        "labour_carry_forward": lab_cf,
        "petty_cash_carry_forward": pc_cf,
        "indirect_carry_forward": indirect_cf,
        "direct_carry_forward": direct_cf,
        "expense_carry_forward": expense_cf_total,  # rolled-up CF (kept for table column)
        "expense_adjustment": indirect_cf,           # alias for indirect (backward compat for frontend)
        "grand_expense": grand_expense,
        # Diff
        "difference": grand_income - grand_expense,
        "note": cf.get("note"),
        "updated_at": cf.get("updated_at"),
        "updated_by_name": cf.get("updated_by_name"),
    }


@router.get("/accountant/carry-forward/projects")
async def list_carry_forward_projects(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Match Planning's project filter so Carry Forward only lists projects
    # that appear under Planning's New / Current / Delivered tabs. Source
    # of truth is `planning_status` — the RE- regex was dropped (Feb 19
    # 2026) because legitimate Planning projects like "RE - Aldrin Jones"
    # were being incorrectly hidden. The explicit name $nin still removes
    # specific demo / test rows that linger in Planning.
    projects = await db.projects.find(
        {
            "planning_status": {"$in": ["new", "active", "delivered"]},
            "name": {"$nin": ["Swathi 60LG+2", "Swathi 60L G+2", "Swathi 60LG +2", "Mr. Joseph Vijay", "Mr. Joseph Vijay ", "Mr Joseph Vijay", "Mr Joseph Vijay ", "RE - Mr. Joseph Vijay", "RE - Mr. Joseph Vijay ", "RE-Mr. Joseph Vijay", "Mani Demo Project - Onbording", "Mani Demo Project - Onbording ", "Mani Demo Project - Onboarding"]},
        },
        {"_id": 0, "project_id": 1, "name": 1, "original_estimate": 1, "total_value": 1, "planning_status": 1},
    ).sort("name", 1).to_list(5000)
    cf_docs = await db.project_carry_forwards.find({}, {"_id": 0}).to_list(1000)
    cf_map = {d.get("project_id"): d for d in cf_docs}

    rows = []
    for p in projects:
        try:
            row = await _compute_project_carry_forward_row(p, cf_map.get(p["project_id"]))
            rows.append(row)
        except Exception as e:
            # Don't fail the whole list if one project's aggregation throws —
            # surface a minimal row so the table still loads. Feb 12 2026.
            import logging
            logging.getLogger("financial").warning(
                "carry_forward row failed for %s: %s", p.get("project_id"), e,
            )
            rows.append({
                "project_id": p.get("project_id"),
                "project_name": p.get("name"),
                "project_value": float(p.get("original_estimate") or p.get("total_value") or 0),
                "total_income": 0, "income_adjustment": 0, "income_carry_forward": 0, "grand_income": 0,
                "material_expense": 0, "work_order_expense": 0, "petty_cash_expense": 0,
                "direct_expense_total": 0,
                "material_carry_forward": 0, "labour_carry_forward": 0,
                "petty_cash_carry_forward": 0, "indirect_carry_forward": 0,
                "direct_carry_forward": 0, "expense_carry_forward": 0,
                "expense_adjustment": 0, "grand_expense": 0,
                "difference": 0,
                "note": "(computation failed — see backend logs)",
            })

    totals = {
        "project_value": sum(r["project_value"] for r in rows),
        "total_income": sum(r["total_income"] for r in rows),
        "income_carry_forward": sum(r["income_carry_forward"] for r in rows),
        "grand_income": sum(r["grand_income"] for r in rows),
        "direct_expense_total": sum(r["direct_expense_total"] for r in rows),
        "expense_carry_forward": sum(r["expense_carry_forward"] for r in rows),
        "expense_adjustment": sum(r["expense_adjustment"] for r in rows),
        "grand_expense": sum(r["grand_expense"] for r in rows),
        "difference": sum(r["difference"] for r in rows),
    }
    return {"rows": rows, "totals": totals}


@router.get("/accountant/carry-forward/{project_id}")
async def get_project_carry_forward(project_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    cf = await db.project_carry_forwards.find_one({"project_id": project_id}, {"_id": 0})
    row = await _compute_project_carry_forward_row(project, cf)
    return row


@router.post("/accountant/carry-forward/{project_id}")
async def save_project_carry_forward(project_id: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Save income or expense carry-forward / adjustment for a project.

    Body:
      { "type": "income" | "expense",
        "carry_forward_amount": <float>,
        "adjustment_amount": <float>   (expense only — optional),
        "note": <str>                   (optional) }
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update carry forward")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "project_id": 1, "name": 1, "total_value": 1, "original_estimate": 1, "status": 1, "planning_status": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    kind = (payload.get("type") or "").lower()
    if kind not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="type must be 'income' or 'expense'")

    def _num(v):
        try:
            return float(v or 0)
        except (TypeError, ValueError):
            return 0.0

    cf_amount = _num(payload.get("carry_forward_amount"))
    set_doc = {
        "project_id": project_id,
        "project_name": project.get("name"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.user_id,
        "updated_by_name": user.name,
    }
    if kind == "income":
        set_doc["income_carry_forward"] = cf_amount
        set_doc["income_adjustment"] = _num(payload.get("adjustment_amount"))
        set_doc["income_note"] = payload.get("note") or ""
    else:
        # Feb 12 2026 — per-bucket expense carry-forward
        mat = _num(payload.get("material_carry_forward"))
        lab = _num(payload.get("labour_carry_forward"))
        pc = _num(payload.get("petty_cash_carry_forward"))
        indirect = _num(payload.get("indirect_carry_forward"))
        # Back-compat: if caller still posts `carry_forward_amount`/`adjustment_amount`,
        # treat them as Indirect to avoid losing data.
        if (mat + lab + pc + indirect) == 0:
            indirect = cf_amount + _num(payload.get("adjustment_amount"))
        set_doc["material_carry_forward"] = mat
        set_doc["labour_carry_forward"] = lab
        set_doc["petty_cash_carry_forward"] = pc
        set_doc["indirect_carry_forward"] = indirect
        # Roll-up for the table column
        set_doc["expense_carry_forward"] = mat + lab + pc + indirect
        set_doc["expense_adjustment"] = indirect
        set_doc["expense_note"] = payload.get("note") or ""

    await db.project_carry_forwards.update_one(
        {"project_id": project_id}, {"$set": set_doc}, upsert=True,
    )
    await create_audit_log(
        user.user_id, "save_project_carry_forward", "project_carry_forward",
        project_id, {"type": kind, "amount": cf_amount},
    )
    cf = await db.project_carry_forwards.find_one({"project_id": project_id}, {"_id": 0})
    row = await _compute_project_carry_forward_row(project, cf)
    return row




@router.get("/accountant/overview")
async def get_accountant_overview(user: User = Depends(get_current_user)):
    """Comprehensive accountant overview: income/expense by payment mode, project-wise"""
    allowed = [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Income query: same status filter as cashbook — only count approved entries
    # (or legacy entries with no status field). Pending/rejected belong on the
    # Approvals page, not the cashbook overview cards.
    income_status_filter = {"$or": [
        {"status": "approved"},
        {"status": {"$exists": False}},
        {"status": None},
    ]}

    # Expense status filter — exclude rejected / under-correction rows. Once
    # the accountant pulls back an Approved expense for correction the ledger
    # entry is reversed AND the recorded_expenses row's status flips to
    # `under_correction`, so it should disappear from every cashbook total
    # until re-approved.
    EXCLUDED_EXPENSE_STATUSES = ["under_correction", "rejected", "accountant_rejected", "accounts_rejected", "cheque_bounced"]

    (incomes, recorded_exps, labour_exps, material_reqs, petty_cash_list, projects_list, suspense_txns, petty_requests, suspense_entries, vendor_credits_v2, credit_ledger_v1, labour_open_exps) = await asyncio.gather(
        db.income.find(income_status_filter, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.recorded_expenses.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.labour_expenses.find({"status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.material_requests.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.petty_cash.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.projects.find(
            {
                "planning_status": {"$in": ["new", "active", "delivered"]},
                "name": {"$nin": ["Swathi 60LG+2", "Swathi 60L G+2", "Swathi 60LG +2", "Mr. Joseph Vijay", "Mr. Joseph Vijay ", "Mr Joseph Vijay", "Mr Joseph Vijay ", "RE - Mr. Joseph Vijay", "RE - Mr. Joseph Vijay ", "RE-Mr. Joseph Vijay", "Mani Demo Project - Onbording", "Mani Demo Project - Onbording ", "Mani Demo Project - Onboarding"]},
            },
            {"_id": 0, "project_id": 1, "name": 1, "status": 1, "planning_status": 1},
        ).to_list(5000),
        db.suspense_transactions.find({}, {"_id": 0}).to_list(5000),
        db.petty_cash_requests.find({}, {"_id": 0}).to_list(2000),
        db.suspense_entries.find({}, {"_id": 0}).to_list(5000),
        db.vendor_credit_ledger.find({"status": {"$in": ["pending", "active", "overdue", "partially_paid"]}}, {"_id": 0}).to_list(2000),
        db.credit_ledger.find({"status": {"$in": ["pending", "active", "overdue", "partially_paid"]}}, {"_id": 0}).to_list(2000),
        db.labour_expenses.find({"status": {"$in": ["pm_approved", "accounts_pending"]}}, {"_id": 0}).to_list(2000),
    )
    
    project_map = {p["project_id"]: p["name"] for p in projects_list}
    
    # Payment mode categories
    mode_keys = ["cash", "current_account", "savings_account", "cheque", "petty_cash", "miscellaneous", "direct_transfer", "suspense_account"]
    
    def classify_mode(mode):
        if not mode:
            return "cash"
        mode = mode.lower().replace(" ", "_")
        mapping = {
            "cash": "cash", "bank_transfer": "current_account", "neft": "current_account",
            "rtgs": "current_account", "imps": "current_account", "escrow": "current_account",
            "cheque": "cheque", "petty_cash": "petty_cash", "savings": "savings_account",
            "savings_account": "savings_account", "current_account": "current_account",
            "miscellaneous": "miscellaneous", "direct_transfer": "direct_transfer",
            "dt": "direct_transfer", "suspense": "suspense_account", "suspense_account": "suspense_account"
        }
        return mapping.get(mode, "miscellaneous")
    
    # Income by mode
    income_by_mode = {k: 0 for k in mode_keys}
    income_by_mode["total"] = 0
    for i in incomes:
        amt = i.get("amount", 0)
        mode = classify_mode(i.get("payment_mode"))
        income_by_mode[mode] = income_by_mode.get(mode, 0) + amt
        income_by_mode["total"] += amt
    
    # Expense by mode
    expense_by_mode = {k: 0 for k in mode_keys}
    expense_by_mode["total"] = 0
    all_expenses = []
    
    for e in recorded_exps:
        amt = e.get("amount", 0)
        mode = classify_mode(e.get("payment_method") or e.get("payment_mode"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**e, "expense_type": e.get("category", "other"), "project_name": project_map.get(e.get("project_id"), "")})
    
    for l in labour_exps:
        amt = l.get("total_amount", 0)
        mode = classify_mode(l.get("payment_method"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**l, "expense_type": "labour", "amount": amt, "project_name": project_map.get(l.get("project_id"), "")})
    
    for m in material_reqs:
        amt = m.get("estimated_price", 0) or m.get("final_price", 0)
        mode = classify_mode(m.get("payment_method"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**m, "expense_type": "material", "amount": amt, "project_name": project_map.get(m.get("project_id"), "")})
    
    # Petty cash totals
    petty_total_issued = sum(pc.get("amount_issued", 0) for pc in petty_cash_list)
    petty_total_spent = sum(pc.get("amount_spent", 0) for pc in petty_cash_list)
    
    # Suspense balance = Petty Cash (issued − spent) + Material Suspense + Labour Suspense
    # Compute from the same data sources used by /suspense/overview so the
    # Accountant Dashboard tile matches the Suspense A/c page exactly.
    legacy_suspense_total = sum(t.get("amount", 0) for t in suspense_txns if t.get("type") == "credit") - sum(t.get("amount", 0) for t in suspense_txns if t.get("type") == "debit")

    # Petty Cash suspense — active petty cash (from db.petty_cash collection)
    PETTY_ACTIVE_STATUSES = ("payment_done", "acknowledged", "partially_spent", "issued")
    petty_active_v2 = [p for p in petty_cash_list if p.get("status") in PETTY_ACTIVE_STATUSES]
    petty_cash_suspense = sum(p.get("amount_issued", 0) or 0 for p in petty_active_v2) - sum(p.get("amount_spent", 0) or 0 for p in petty_active_v2)

    # Material suspense — outstanding vendor credit (both v1 + v2 collections)
    material_suspense_total = 0.0
    for entry in (vendor_credits_v2 + credit_ledger_v1):
        outstanding = entry.get("balance")
        if outstanding is None or outstanding == 0:
            outstanding = entry.get("amount", 0) or 0
        if outstanding > 0:
            material_suspense_total += outstanding

    # Labour suspense — open labour expenses awaiting accountant payout
    labour_suspense_total = 0.0
    for exp in labour_open_exps:
        outstanding = (exp.get("total_amount", 0) or 0) - (exp.get("paid_amount", 0) or 0)
        if outstanding > 0:
            labour_suspense_total += outstanding

    # Legacy collection (kept for back-compat; usually 0)
    for entry in suspense_entries:
        amt = entry.get("amount", 0) or 0
        etype = (entry.get("type") or "").lower()
        if etype == "material":
            material_suspense_total += amt
        elif etype == "labour":
            labour_suspense_total += amt

    suspense_total = petty_cash_suspense + material_suspense_total + labour_suspense_total + legacy_suspense_total
    
    # Project-wise breakdown — seed EVERY real project (Planning's New /
    # Current / Delivered) so the table always shows the full set, even
    # when there are no incomes/expenses yet against that project. Income
    # and expense entries that point at a project NOT in this real-project
    # set are skipped (legacy RE-leads etc. shouldn't pollute totals).
    real_pid_set = {p["project_id"] for p in projects_list}
    project_wise = {p["project_id"]: {
        "project_id": p["project_id"],
        "project_name": p.get("name", "Unknown"),
        "income": 0,
        "expense": 0,
    } for p in projects_list}

    for i in incomes:
        pid = i.get("project_id")
        if pid not in real_pid_set:
            continue
        project_wise[pid]["income"] += i.get("amount", 0)

    for e in all_expenses:
        pid = e.get("project_id")
        if not pid or pid not in real_pid_set:
            continue
        project_wise[pid]["expense"] += e.get("amount", 0)

    # Sort and add P&L
    for pw in project_wise.values():
        pw["balance"] = pw["income"] - pw["expense"]

    project_list_sorted = sorted(project_wise.values(), key=lambda x: (-x["income"], x["project_name"]))
    
    return {
        "income_by_mode": income_by_mode,
        "expense_by_mode": expense_by_mode,
        "income_entries": incomes[:200],
        "expense_entries": sorted(all_expenses, key=lambda x: x.get("created_at", ""), reverse=True)[:200],
        "petty_cash": {"issued": petty_total_issued, "spent": petty_total_spent, "balance": petty_total_issued - petty_total_spent},
        "suspense_balance": suspense_total,
        "suspense_breakdown": {
            "petty_cash": petty_cash_suspense,
            "material": material_suspense_total,
            "labour": labour_suspense_total,
            "legacy": legacy_suspense_total,
            "total": suspense_total,
        },
        "project_wise": project_list_sorted,
        "totals": {
            "total_income": income_by_mode["total"],
            "total_expense": expense_by_mode["total"],
            "net_balance": income_by_mode["total"] - expense_by_mode["total"]
        }
    }


@router.get("/income")
async def get_all_income(
    project_id: Optional[str] = None,
    payment_mode: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all income entries with optional filters"""
    # IDOR Fix: Only financial/management roles can access income data
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    # Exclude bounced incomes by default (consistent with /accountant/overview &
    # /projects/{id}/income). The bounce cascade already deducted them from
    # the owning stage so re-listing them here would double-count.
    query = {"status": {"$ne": "cheque_bounced"}}
    
    if project_id:
        query["project_id"] = project_id
    
    if payment_mode:
        query["payment_mode"] = payment_mode
    
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            query["payment_date"] = date_query
    
    income_entries = await db.income.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    
    # Get project names for display
    project_ids = list(set(e.get("project_id") for e in income_entries if e.get("project_id")))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}

    # Enrich stage description from the LIVE payment_stages collection.
    # Regular Payment Schedule stages → "<position> <stage_name>" matching Planning's row index
    # Addition stages → "Additional: <stage_name>" (no number)
    # Vendor/labour rows and missing links → keep existing stage text.
    stage_ids = list({(e.get("payment_stage_id") or e.get("stage_id")) for e in income_entries if (e.get("payment_stage_id") or e.get("stage_id"))})
    psid_map: Dict[str, Dict[str, Any]] = {}
    if stage_ids:
        linked = await db.payment_stages.find(
            {"stage_id": {"$in": stage_ids}}, {"_id": 0, "stage_id": 1, "project_id": 1}
        ).to_list(5000)
        proj_ids = list({d["project_id"] for d in linked if d.get("project_id")})
        if proj_ids:
            all_stages = await db.payment_stages.find(
                {"project_id": {"$in": proj_ids}},
                {"_id": 0, "stage_id": 1, "project_id": 1, "stage_name": 1, "stage_label": 1,
                 "sort_order": 1, "stage_number": 1, "created_at": 1,
                 "category": 1, "kind": 1, "rab_request_id": 1, "rab_number": 1,
                 "contractor_id": 1, "vendor_id": 1, "is_addition": 1, "linked_addition_id": 1},
            ).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(5000)
            def _is_vendor_or_labour_row(s):
                cat = (s.get("category") or "").lower()
                kind = (s.get("kind") or "").lower()
                if cat in ("labour", "vendor", "material", "expense"):
                    return True
                if kind in ("labour_rab", "vendor_payment", "material_expense"):
                    return True
                if s.get("rab_request_id") or s.get("rab_number") or s.get("contractor_id") or s.get("vendor_id"):
                    return True
                sname = (s.get("stage_name") or "").lower()
                if sname.startswith("rab-") or sname.startswith("rab "):
                    return True
                return False
            def _is_addition_row(s):
                if s.get("is_addition") is True:
                    return True
                if s.get("linked_addition_id"):
                    return True
                sname = (s.get("stage_name") or "")
                if sname.startswith("Additional:") or sname.startswith("Additional Work"):
                    return True
                return False
            by_proj: Dict[str, List[Dict[str, Any]]] = {}
            for s in all_stages:
                by_proj.setdefault(s["project_id"], []).append(s)
            for pid, slist in by_proj.items():
                position = 0
                for s in slist:
                    if _is_vendor_or_labour_row(s):
                        continue
                    if _is_addition_row(s):
                        psid_map[s["stage_id"]] = {**s, "_is_addition": True}
                        continue
                    position += 1
                    psid_map[s["stage_id"]] = {**s, "_position": position}

    for entry in income_entries:
        entry["project_name"] = project_map.get(entry.get("project_id"), "Unknown")
        sid = entry.get("payment_stage_id") or entry.get("stage_id")
        if sid and sid in psid_map:
            s = psid_map[sid]
            nm = s.get("stage_name") or s.get("stage_label") or ""
            if s.get("_is_addition"):
                clean = nm.replace("Additional:", "", 1).strip() if nm.startswith("Additional:") else nm
                entry["stage"] = f"Additional: {clean}".strip() if clean else "Additional"
            else:
                pos = s.get("_position")
                if pos and nm:
                    entry["stage"] = f"{pos} {nm}".strip()
                elif nm:
                    entry["stage"] = nm
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])
    
    return income_entries


@router.get("/income/summary")
async def get_income_summary(user: User = Depends(get_current_user)):
    """Get income summary with totals by payment mode"""
    # IDOR Fix: Only financial/management roles can access income summary
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    income_entries = await db.income.find({}, {"_id": 0}).to_list(10000)
    
    summary = {
        "total_income": 0,
        "cash": 0,
        "cheque": 0,
        "bank_transfer": 0,
        "escrow": 0,
        "petty_cash": 0,
        "entry_count": len(income_entries)
    }
    
    for entry in income_entries:
        amount = entry.get("amount", 0)
        mode = entry.get("payment_mode", "cash")
        summary["total_income"] += amount
        if mode in summary:
            summary[mode] += amount
    
    return summary


@router.get("/projects/{project_id}/income")
async def get_project_income(project_id: str, user: User = Depends(get_current_user)):
    """Get all income entries for a specific project"""
    # IDOR Fix: Only financial/management roles can access project income
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    # Exclude bounced incomes — their amount has already been deducted from the
    # owning payment stage during the bounce cascade. Showing them here would
    # double-count or mislead the project Payment Summary cards.
    income_entries = await db.income.find(
        {"project_id": project_id, "status": {"$ne": "cheque_bounced"}},
        {"_id": 0},
    ).sort("payment_date", -1).to_list(1000)
    
    for entry in income_entries:
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])
    
    # Calculate project income summary
    summary = {
        "total_income": sum(e.get("amount", 0) for e in income_entries),
        "cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cash"),
        "cheque": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cheque"),
        "bank_transfer": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "bank_transfer"),
        "escrow": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "escrow"),
        "petty_cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "petty_cash"),
    }
    
    return {
        "entries": income_entries,
        "summary": summary
    }


@router.post("/income")
async def create_income_entry(income_input: IncomeCreate, user: User = Depends(get_current_user)):
    """Create a new income entry and update project payment received"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate project exists
    project = await db.projects.find_one({"project_id": income_input.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    income = IncomeEntry(
        project_id=income_input.project_id,
        amount=income_input.amount,
        payment_mode=PaymentMode(income_input.payment_mode),
        payment_date=datetime.fromisoformat(income_input.payment_date),
        cheque_number=income_input.cheque_number,
        bank_name=income_input.bank_name,
        reference_number=income_input.reference_number,
        remarks=income_input.remarks,
        recorded_by=user.user_id
    )
    
    income_dict = income.model_dump()
    income_dict["payment_mode"] = income_dict["payment_mode"].value
    income_dict["payment_date"] = income_dict["payment_date"].isoformat()
    income_dict["created_at"] = income_dict["created_at"].isoformat()
    income_dict["source"] = "manual"
    
    await db.income.insert_one(income_dict)
    
    # Update project's income_project field (payment received)
    current_income = project.get("income_project", 0)
    await db.projects.update_one(
        {"project_id": income_input.project_id},
        {"$set": {"income_project": current_income + income_input.amount}}
    )
    
    await create_audit_log(user.user_id, "create", "income", income.income_id, {
        "project_id": income_input.project_id,
        "amount": income_input.amount,
        "payment_mode": income_input.payment_mode
    })
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_income_recorded
        asyncio.ensure_future(notify_income_recorded(
            project.get("name", "Unknown"), income_input.amount, income_input.payment_mode, user.name
        ))
    except Exception:
        pass
    
    return income


@router.patch("/income/{income_id}")
async def update_income_entry(income_id: str, update_data: IncomeUpdate, user: User = Depends(get_current_user)):
    """Update an income entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Income entry not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # If amount changed, update project income
    if "amount" in update_dict:
        old_amount = existing.get("amount", 0)
        new_amount = update_dict["amount"]
        difference = new_amount - old_amount
        
        project = await db.projects.find_one({"project_id": existing["project_id"]}, {"_id": 0})
        if project:
            current_income = project.get("income_project", 0)
            await db.projects.update_one(
                {"project_id": existing["project_id"]},
                {"$set": {"income_project": current_income + difference}}
            )
    
    await db.income.update_one({"income_id": income_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "income", income_id, update_dict)
    
    return {"message": "Income entry updated"}


@router.delete("/income/{income_id}")
async def delete_income_entry(income_id: str, user: User = Depends(get_current_user)):
    """Delete an income entry and roll back all linked project finance state.

    Side-effects (so the Project Payment Summary, Cashflow Engine, and
    Cashbook totals stay consistent the moment the row is deleted):
      1. Reverse the cashflow_ledger split entry tied to this income_id
         (removes Direct + Indirect allocations).
      2. Roll back any payment_stages.amount_received that was credited
         from this income. Looks up stage via payment_stage_id OR stage_id.
         If the income was silently partial-bounce-reduced earlier
         (partial_bounce_deducted > 0), we ADD that back so the stage's
         received column reflects the original collection.
      3. If the stage drops to received=0, clear cheque-bounce flags and
         workflow_status so the row goes back to clean Pending.
      4. Unlink the cheque that was used to pay this income (status -> open).
      5. Roll back project.advance_amount if this income was tagged as
         category='advance' / stage='advance_payment'.
      6. Keep the legacy project.income_project counter in sync.
      7. Audit log the rollback summary.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    existing = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Income entry not found")

    amount = float(existing.get("amount", 0) or 0)
    # If a previous cheque-bounce silently reduced this income, the rollback
    # must restore the ORIGINAL collected amount (otherwise the cashbook keeps
    # missing money that was "really" collected before the bounce reduction).
    partial_ded = float(existing.get("partial_bounce_deducted", 0) or 0)
    restore_amount = amount + partial_ded
    project_id = existing.get("project_id")
    summary = {
        "income_id": income_id,
        "amount_deleted": amount,
        "partial_bounce_restored": partial_ded,
        "rollback_applied": restore_amount,
        "stage_id": None,
        "stage_old_received": None,
        "stage_new_received": None,
        "stage_new_status": None,
        "cheque_unlinked": None,
    }

    # 1. Reverse cashflow_ledger split entry
    try:
        from routes.cashflow import reverse_allocation
        await reverse_allocation(income_id, kind="income")
    except Exception as e:
        import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

    # 2-3. Payment stage rollback (lookup by either payment_stage_id or stage_id)
    stage_id = existing.get("payment_stage_id") or existing.get("stage_id")
    if stage_id:
        stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
        if stage:
            stage_amount = float(stage.get("amount", 0) or 0)
            old_received = float(stage.get("amount_received", 0) or 0)
            new_received = max(0.0, old_received - restore_amount)
            # Gate "paid" on amount > 0 — a ₹0 placeholder stage should never
            # flip back to "paid" just because received drops to 0.
            if stage_amount > 0 and new_received >= stage_amount:
                new_status = "paid"
            elif new_received > 0:
                new_status = "partial"
            else:
                new_status = "pending"
            set_fields: Dict[str, Any] = {
                "amount_received": new_received,
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            unset_fields: Dict[str, Any] = {}
            # If everything has been reversed, clear lifecycle flags so the
            # row goes back to clean Pending (no bounce banner, no paid_at).
            if new_received <= 0:
                set_fields["workflow_status"] = "pending"
                unset_fields.update({
                    "cheque_bounced": "",
                    "last_bounce_amount": "",
                    "last_bounce_cheque_id": "",
                    "last_bounce_cheque_number": "",
                    "bounce_banner": "",
                    "bounce_reason": "",
                    "bounced_at": "",
                    "paid_at": "",
                    "collected_at": "",
                    "collected_by": "",
                    "collected_by_name": "",
                })
            elif new_status == "partial":
                # Partial – clear the "paid_at" if it was set; bounce flags
                # may still be relevant if a bounce is in progress so leave them.
                unset_fields["paid_at"] = ""
            update_doc: Dict[str, Any] = {"$set": set_fields}
            if unset_fields:
                update_doc["$unset"] = unset_fields
            await db.payment_stages.update_one({"stage_id": stage_id}, update_doc)
            # Mirror the rollback onto linked additional_costs.income_received
            # so the Client Portal Income Status synth + the Additional Work
            # row stop showing the deleted receipt as a ghost Direct Transfer.
            # Without this the count diverges (e.g. 6 entries on Client Portal
            # vs 5 in the Accountant Cashbook after a delete).
            await _sync_addition_cost_received(stage_id)
            summary.update({
                "stage_id": stage_id,
                "stage_old_received": old_received,
                "stage_new_received": new_received,
                "stage_new_status": new_status,
            })

    # 4. Unlink cheque
    cheque_id = existing.get("cheque_id")
    if cheque_id:
        await db.cheques.update_one(
            {"cheque_id": cheque_id, "income_id": income_id},
            {"$unset": {"income_id": "", "used_for_expense_id": ""},
             "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        summary["cheque_unlinked"] = cheque_id

    # 5-6. Project counters
    if project_id:
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project:
            update_ops: Dict[str, Any] = {}
            category = (existing.get("category") or "").lower()
            stage_label = (existing.get("stage") or "").lower()
            if category in ("advance", "advance_payment") or "advance" in stage_label:
                cur_advance = float(project.get("advance_amount", 0) or 0)
                update_ops["advance_amount"] = max(0, cur_advance - restore_amount)
            cur_income_project = float(project.get("income_project", 0) or 0)
            update_ops["income_project"] = max(0, cur_income_project - restore_amount)
            update_ops["updated_at"] = datetime.now(timezone.utc).isoformat()
            if update_ops:
                await db.projects.update_one({"project_id": project_id}, {"$set": update_ops})

    await db.income.delete_one({"income_id": income_id})
    await create_audit_log(user.user_id, "delete", "income", income_id, {
        "amount": amount, "rollback": True, "summary": summary,
    })

    return {"message": "Income entry deleted and project totals rolled back", "summary": summary}


@router.delete("/cashbook/expense/{expense_type}/{record_id}")
async def delete_cashbook_expense(expense_type: str, record_id: str, user: User = Depends(get_current_user)):
    """Delete an expense from the cashbook view.

    The cashbook now surfaces FIVE different collections —
    recorded_expenses, labour_expenses, material_requests (new flow),
    material_expenses (legacy POs) and direct_expenses (petty cash items).
    We probe all of them by both their native primary-id fields and the
    generic `expense_id` alias so the unified frontend `expense_id` always
    resolves regardless of source.
    Only Accountant / Super Admin can delete.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can delete expenses")

    # Probe order: most specific collections first.
    candidates = [
        (db.material_requests, "request_id"),
        (db.material_requests, "expense_id"),
        (db.labour_expenses, "labour_expense_id"),
        (db.labour_expenses, "expense_id"),
        (db.recorded_expenses, "expense_id"),
        # Feb 20 2026 — legacy `material_expenses` (Cement/Sand/Steel paid
        # POs) and `direct_expenses` (petty cash) were added to the
        # Cashbook Expense list but their delete path was missing, so
        # users hit "Expense record not found in any cashbook collection"
        # when clicking the trash icon on those rows.
        (db.material_expenses, "material_expense_id"),
        (db.material_expenses, "expense_id"),
        (db.direct_expenses, "direct_expense_id"),
        (db.direct_expenses, "petty_cash_id"),
    ]
    for coll, id_field in candidates:
        existing = await coll.find_one({id_field: record_id}, {"_id": 0})
        if existing:
            await coll.delete_one({id_field: record_id})
            # Side-effect: reverse the matching work_order payment_request so
            # the Site Engineer view stops showing "Paid" for the deleted
            # advance. recorded_expenses from `wo_stage_release` carry the
            # link (work_order_id + stage_id + request_id). We reset the PR
            # to `planning_approved` (the state immediately before release)
            # so accountant can release again with corrected data.
            try:
                wo_id = existing.get("work_order_id")
                stage_id = existing.get("stage_id")
                req_id = existing.get("request_id")
                if wo_id and stage_id and req_id:
                    await db.project_work_orders.update_one(
                        {"work_order_id": wo_id, "stages.stage_id": stage_id, "stages.payment_requests.request_id": req_id},
                        {"$set": {
                            "stages.$[s].payment_requests.$[p].status": "planning_approved",
                            "stages.$[s].payment_requests.$[p].released_at": None,
                            "stages.$[s].payment_requests.$[p].released_by": None,
                            "stages.$[s].payment_requests.$[p].reverted_by_accountant_at": datetime.now(timezone.utc).isoformat(),
                            "stages.$[s].payment_requests.$[p].reverted_by_accountant_id": user.user_id,
                        }},
                        array_filters=[{"s.stage_id": stage_id}, {"p.request_id": req_id}],
                    )
            except Exception as e:
                import logging; logging.getLogger(__name__).warning(f"PR revert skipped: {e}")
            # Feb 20 2026 — Reverse the contractor-suspense debit that was
            # applied during this release so the suspense balance is
            # restored (RAB-27 / Appala Naidu ₹15,000 case where the
            # suspense was permanently lost on delete).
            try:
                suspense_amt = float(existing.get("suspense_applied") or 0)
                contractor_id_h = existing.get("contractor_id")
                if suspense_amt > 0 and contractor_id_h:
                    _now_iso = datetime.now(timezone.utc).isoformat()
                    await db.contractor_suspense_ledger.insert_one({
                        "ledger_id": f"susp_{uuid.uuid4().hex[:12]}",
                        "contractor_id": contractor_id_h,
                        "contractor_name": existing.get("contractor_name", ""),
                        "project_id": existing.get("project_id"),
                        "amount": suspense_amt,
                        # Use the canonical "type" field that balance aggregation
                        # in projects._get_contractor_suspense_balance reads from.
                        "type": "credit",
                        "source_type": "expense_delete_reversal",
                        "source_id": record_id,
                        "reference_id": record_id,
                        "date": _now_iso,
                        "notes": f"Reversal of suspense debit on deletion of expense {record_id}",
                        "remarks": f"Reversal of suspense debit on deletion of expense {record_id}",
                        "created_at": _now_iso,
                        "created_by": user.user_id,
                    })
            except Exception as e:
                import logging; logging.getLogger(__name__).warning(f"Suspense reversal skipped: {e}")
            await create_audit_log(
                user.user_id, "delete", f"expense_{expense_type}", record_id,
                {"amount": existing.get("amount") or existing.get("total_amount") or existing.get("estimated_price") or existing.get("final_amount", 0),
                 "collection": coll.name}
            )
            return {"message": "Expense deleted", "type": expense_type, "from": coll.name}

    # Feb 20 2026 — Final fallback: petty cash item-level delete. The
    # cashbook surfaces one row PER `direct_expenses.items[]` entry. If the
    # frontend passes the inner `item_id`, the parent doc-level lookups
    # above won't match — $pull the single item from the parent instead.
    # IMPORTANT: filter the update by `items.item_id` directly (not by
    # `direct_expense_id`) — older legacy docs may have an empty / missing
    # direct_expense_id field, which would silently target the wrong doc
    # and leave the user-visible row unchanged ("Expense deleted" toast
    # but nothing actually removed).
    parent = await db.direct_expenses.find_one({"items.item_id": record_id}, {"_id": 0})
    if parent:
        upd = await db.direct_expenses.update_one(
            {"items.item_id": record_id},
            {"$pull": {"items": {"item_id": record_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if upd.modified_count > 0:
            await create_audit_log(
                user.user_id, "delete", f"expense_{expense_type}", record_id,
                {"collection": "direct_expenses.items", "parent_id": parent.get("direct_expense_id") or parent.get("petty_cash_id") or "legacy"}
            )
            return {"message": "Petty cash item deleted", "type": expense_type, "from": "direct_expenses.items"}
        # If $pull didn't actually modify anything, fall through to the
        # 404 — better than lying to the user with a "deleted" toast.

    raise HTTPException(status_code=404, detail="Expense record not found in any cashbook collection")



# ==================== UNIFIED APPROVALS ENDPOINT ====================

@router.get("/approvals/unified")
async def get_unified_approvals(
    status_filter: str = "pending",
    user: User = Depends(get_current_user)
):
    """Approvals queue. Supports status_filter to show approved / rejected /
    under_correction rows alongside pending ones so the Accountant can audit
    and pull back already-approved entries.

    status_filter values:
      - 'pending'   (default)  → only items awaiting approval
      - 'approved'             → approved-and-not-yet-corrected rows
      - 'rejected'             → rejected rows (CRE/Sales must re-collect)
      - 'under_correction'     → was approved, now pulled back for correction
      - 'all'                  → everything
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")

    sf = (status_filter or "pending").lower()

    # Status sets per filter — incomes and expenses use slightly different
    # vocabularies, so we keep two maps.
    if sf == "pending":
        income_statuses = ["pending_approval"]
        material_statuses = ["requested", "planning_approved", "procurement_priced", "pending_accounts_approval", "pending_advance_payment", "pending_balance_payment"]
        labour_statuses = ["requested", "planning_approved", "pending_accounts_approval"]
        vendor_statuses = ["requested", "planning_approved", "pending_accounts_approval"]
    elif sf == "approved":
        income_statuses = ["approved", "verified", "accountant_verified"]
        material_statuses = ["accounts_approved", "issued", "settled", "completed"]
        labour_statuses = ["accounts_approved", "settled", "completed"]
        vendor_statuses = ["accounts_approved", "settled", "completed"]
    elif sf == "rejected":
        income_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        material_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        labour_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        vendor_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
    elif sf == "under_correction":
        income_statuses = ["under_correction"]
        material_statuses = ["under_correction"]
        labour_statuses = ["under_correction"]
        vendor_statuses = ["under_correction"]
    else:  # 'all'
        income_statuses = None  # None = no status filter
        material_statuses = None
        labour_statuses = None
        vendor_statuses = None

    def _q(statuses):
        return {} if statuses is None else {"status": {"$in": statuses}}

    # Parallel fetch
    (incomes, materials, labour, vendor, projects_list) = await asyncio.gather(
        db.income.find(_q(income_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.material_expenses.find(_q(material_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.labour_expenses.find(_q(labour_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.vendor_service_expenses.find(_q(vendor_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )

    project_map = {p["project_id"]: p["name"] for p in projects_list}
    for item in incomes:
        item["project_name"] = project_map.get(item.get("project_id"), "Unknown")
    for item in materials + labour + vendor:
        item["project_name"] = project_map.get(item.get("project_id"), "Unknown")

    return {
        "status_filter": sf,
        "income": incomes,
        "materials": materials,
        "labour": labour,
        "vendor": vendor,
        "summary": {
            "income_count": len(incomes),
            "income_total": sum(i.get("amount", 0) for i in incomes),
            "material_count": len(materials),
            "material_total": sum(m.get("estimated_cost", 0) or m.get("final_amount", 0) for m in materials),
            "labour_count": len(labour),
            "labour_total": sum(l.get("total_amount", 0) for l in labour),
            "vendor_count": len(vendor),
            "vendor_total": sum(v.get("amount", 0) for v in vendor),
        }
    }


@router.post("/approvals/income/{income_id}/approve")
async def approve_income(income_id: str, user: User = Depends(get_current_user)):
    """Approve an income entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can approve income")
    
    result = await db.income.find_one_and_update(
        {"income_id": income_id, "status": "pending_approval"},
        {"$set": {"status": "approved", "approved_by": user.user_id, "approved_at": datetime.now(timezone.utc).isoformat()}},
        return_document=False
    )
    if not result:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")
    
    # If this is an advance payment, auto-route to Planning Head (NEW Feb 2026 workflow — skip CRE)
    if result.get("category") == "advance_payment" and result.get("project_id"):
        _now_iso = datetime.now(timezone.utc).isoformat()
        project_upd = await db.projects.find_one_and_update(
            {"project_id": result["project_id"]},
            {"$set": {
                "status": "in_planning",
                "accountant_verified": True,
                "accountant_verified_by": user.user_id,
                "accountant_verified_at": _now_iso,
                "planning_status": "new",
                "planning_new_date": _now_iso,
                "sent_to_planning_by": user.user_id,
                "sent_to_planning_at": _now_iso,
                "auto_sent_to_planning": True,
            }},
            return_document=False
        )

        # Find the lead linked to this project/income and auto-move to Project Onboarded stage
        lead_id_to_move = result.get("lead_id") or (project_upd or {}).get("lead_id")
        if lead_id_to_move:
            lead_doc = await db.leads.find_one({"lead_id": lead_id_to_move}, {"_id": 0})
            if lead_doc and lead_doc.get("current_stage_id") != "stg_project_onboarded":
                user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
                user_name = (user_doc or {}).get("name", "Accountant")
                stage_history = lead_doc.get("stage_history", [])
                stage_history.append({
                    "stage_id": "stg_project_onboarded",
                    "from_stage_id": lead_doc.get("current_stage_id"),
                    "moved_at": datetime.now(timezone.utc).isoformat(),
                    "moved_by": user.user_id,
                    "moved_by_name": user_name,
                    "action": "accountant_verified_advance",
                    "remark": "Advance payment verified by Accountant"
                })
                await db.leads.update_one(
                    {"lead_id": lead_id_to_move},
                    {"$set": {
                        "current_stage_id": "stg_project_onboarded",
                        "stage_history": stage_history,
                        "onboarding_status": "project_onboarded",
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
    
    await create_audit_log(user.user_id, "approve", "income", income_id, {"action": "approved"})

    # Cashflow Engine: split this income into Direct/Indirect pools per project/global config
    try:
        from routes.cashflow import allocate_income as _cf_allocate_income
        inc_doc = await db.income.find_one({"income_id": income_id}, {"_id": 0, "amount": 1, "project_id": 1, "project_name": 1})
        if inc_doc and float(inc_doc.get("amount") or 0) > 0:
            await _cf_allocate_income(
                income_id=income_id,
                project_id=inc_doc.get("project_id"),
                amount=float(inc_doc.get("amount") or 0),
                project_name=inc_doc.get("project_name", ""),
                source="income_approved",
            )
    except Exception as e:
        # Never fail the approval if cashflow side-effect errors
        import logging; logging.getLogger(__name__).warning(f"Cashflow allocation skipped: {e}")

    # Sync linked additional_cost.income_received when the approved income
    # belongs to an Addition stage. Without this, the Additional Work row on
    # ProjectDetail keeps showing "With CRE · Payment Schedule" forever because
    # `balance > 0` stays true. We pull the stage to confirm it's an addition
    # and stamp the cost with the cumulative received amount.
    try:
        inc = await db.income.find_one({"income_id": income_id}, {"_id": 0, "payment_stage_id": 1, "project_id": 1, "amount": 1, "payment_date": 1, "received_date": 1})
        stage_id = inc.get("payment_stage_id") if inc else None
        if stage_id:
            stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "is_addition": 1, "linked_addition_id": 1, "amount_received": 1, "amount": 1, "project_id": 1, "paid_at": 1, "collected_at": 1})
            # Always stamp the payment_stages row with the collection timestamp
            # the moment Accountant approves the income — this is the source of
            # truth used by the monthly Payment Schedule view to attribute the
            # collected portion to the correct month (otherwise we have to fall
            # back to due_date, which loses real cash-flow visibility).
            if stage:
                ts = inc.get("payment_date") or inc.get("received_date") or datetime.now(timezone.utc).isoformat()
                stage_set = {}
                if not stage.get("paid_at"):
                    stage_set["paid_at"] = ts
                if not stage.get("collected_at"):
                    stage_set["collected_at"] = ts
                if stage_set:
                    stage_set["updated_at"] = datetime.now(timezone.utc).isoformat()
                    await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": stage_set})
            if stage and stage.get("is_addition") and stage.get("linked_addition_id"):
                cost_id = stage["linked_addition_id"]
                # Adopt the stage's received total as the cost's income_received.
                # Using the stage's number (not summed from incomes) keeps us
                # consistent with the planning/CRE views which read off the stage.
                received = stage.get("amount_received", 0) or 0
                cost_amount = stage.get("amount", 0) or 0
                set_doc = {"income_received": received}
                # When fully collected, also mark CRE-approved so the row visibly
                # exits the "With CRE · Payment Schedule" state.
                if cost_amount and received >= cost_amount - 0.5:
                    set_doc["cre_approved"] = True
                    set_doc["cre_approved_at"] = datetime.now(timezone.utc).isoformat()
                await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": set_doc})
    except Exception as e:
        import logging; logging.getLogger(__name__).warning(f"Addition-cost sync skipped: {e}")

    return {"message": "Income approved successfully"}


@router.post("/approvals/income/{income_id}/send-for-correction")
async def send_income_for_correction(income_id: str, payload: Dict[str, Any] = None, reason: str = "", user: User = Depends(get_current_user)):
    """Accountant pulls back an Approved income for correction.

    Status flips to `under_correction`. Cashflow ledger is reversed and the
    project's payment_stage / advance_amount counters are rolled back so the
    amount disappears from Cashbook + Cashflow Engine + Project header
    immediately. The original collector (CRE/Sales) gets notified to edit and
    resubmit.

    Body: { "reason": "..." }  OR  ?reason=... (query param for back-compat)
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can send for correction")

    body_reason = (payload or {}).get("reason") if isinstance(payload, dict) else None
    final_reason = (body_reason or reason or "").strip()
    if not final_reason:
        raise HTTPException(status_code=400, detail="Correction reason is required")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    prev = (inc.get("status") or "").lower()
    if prev not in ("approved", "verified", "accountant_verified"):
        raise HTTPException(status_code=400, detail=f"Can only send approved income for correction (current: '{prev}')")

    now = datetime.now(timezone.utc).isoformat()
    history = inc.get("correction_history", [])
    history.append({
        "action": "sent_for_correction",
        "by": user.user_id,
        "by_name": user.name,
        "at": now,
        "reason": final_reason,
        "extra": {"prev_status": prev},
    })

    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "status": "under_correction",
            "prev_approved_status": prev,
            "correction_requested_by": user.user_id,
            "correction_requested_by_name": user.name,
            "correction_requested_at": now,
            "correction_reason": final_reason,
            "correction_history": history,
            "updated_at": now,
        }}
    )

    # Reverse cashflow ledger split
    try:
        from routes.cashflow import reverse_allocation
        await reverse_allocation(income_id, kind="income")
    except Exception as e:
        import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

    # Roll back payment_stage / advance counters
    amount = float(inc.get("amount", 0) or 0)
    project_id = inc.get("project_id")
    if project_id:
        stage_id = inc.get("payment_stage_id")
        if stage_id:
            stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "amount_received": 1, "amount": 1})
            if stage:
                new_received = max(0, float(stage.get("amount_received", 0) or 0) - amount)
                new_status = "partial" if new_received > 0 else "pending"
                await db.payment_stages.update_one(
                    {"stage_id": stage_id},
                    {"$set": {"amount_received": new_received, "status": new_status}}
                )
            # Mirror the rollback onto linked additional_costs.income_received.
            await _sync_addition_cost_received(stage_id)
        category = (inc.get("category") or "").lower()
        stage_label = (inc.get("stage") or "").lower()
        if category in ("advance", "advance_payment") or "advance" in stage_label:
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "advance_amount": 1, "income_project": 1})
            if project:
                cur_adv = float(project.get("advance_amount", 0) or 0)
                cur_ip = float(project.get("income_project", 0) or 0)
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"advance_amount": max(0, cur_adv - amount), "income_project": max(0, cur_ip - amount)}}
                )

    # Notify the original collector
    if inc.get("collected_by") or inc.get("created_by"):
        try:
            await create_notification(
                inc.get("collected_by") or inc.get("created_by"),
                f"Approved income ₹{amount:,.0f} for {inc.get('project_name', 'project')} was sent back for correction. Reason: {final_reason}. The amount has been removed from Cashbook until you correct & resubmit."
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "send_for_correction", "income", income_id, {"reason": final_reason, "prev_status": prev, "amount": amount})
    return {"message": "Approved income sent back for correction. Cashbook & cashflow rolled back.", "status": "under_correction"}


@router.post("/approvals/income/{income_id}/resubmit")
async def resubmit_income(income_id: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Original collector (CRE/Sales) edits and resubmits a rejected or
    under_correction income. Whitelisted editable fields:
      amount, payment_mode, payment_reference, payment_date, remarks,
      description, transaction_id, cheque_details, stage, category.
    Status flips back to `pending_approval` so it lands in the queue again.
    """
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    cur = (inc.get("status") or "").lower()
    if cur not in ("rejected", "accountant_rejected", "accounts_rejected", "under_correction"):
        raise HTTPException(status_code=400, detail=f"Cannot resubmit from status '{cur}'")

    if user.role not in [UserRole.SUPER_ADMIN]:
        owner = inc.get("collected_by") or inc.get("created_by")
        if owner and owner != user.user_id:
            raise HTTPException(status_code=403, detail="Only the original collector can resubmit this income")

    EDITABLE = {"amount", "payment_mode", "payment_reference", "payment_date",
                "remarks", "description", "transaction_id", "cheque_details",
                "stage", "category", "sub_category"}
    edits = {k: v for k, v in (payload or {}).items() if k in EDITABLE and v is not None}
    if not edits:
        raise HTTPException(status_code=400, detail="At least one editable field must be provided")

    now = datetime.now(timezone.utc).isoformat()
    history = inc.get("correction_history", [])
    history.append({
        "action": "resubmitted",
        "by": user.user_id,
        "by_name": user.name,
        "at": now,
        "extra": {"edited_fields": list(edits.keys())},
    })

    await db.income.update_one(
        {"income_id": income_id},
        {
            "$set": {
                **edits,
                "status": "pending_approval",
                "resubmitted_by": user.user_id,
                "resubmitted_by_name": user.name,
                "resubmitted_at": now,
                "correction_history": history,
                "updated_at": now,
            },
            "$unset": {
                "rejection_reason": "",
                "rejected_by": "",
                "rejected_by_name": "",
                "rejected_at": "",
                "correction_reason": "",
            }
        }
    )

    # Notify all accountants
    accountants = await db.users.find({"role": UserRole.ACCOUNTANT, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    for a in accountants:
        try:
            await create_notification(a["user_id"], f"Income ₹{(edits.get('amount') or inc.get('amount', 0)):,.0f} for {inc.get('project_name', 'project')} was edited and resubmitted by {user.name}.")
        except Exception:
            pass

    await create_audit_log(user.user_id, "resubmit", "income", income_id, {"edited_fields": list(edits.keys())})
    return {"message": "Income resubmitted for accountant approval", "status": "pending_approval"}


@router.post("/approvals/income/{income_id}/reject")
async def reject_income(income_id: str, reason: str = "", user: User = Depends(get_current_user)):
    """Reject an income entry — sets status='rejected' so it returns to CRE for re-submission.

    Accepts BOTH pre-approval rows (status='pending_approval') and
    already-approved rows (status='approved'/'verified'). For approved rows we
    additionally REVERSE the cashflow_ledger split + payment_stage rollback so
    the amount disappears from Cashbook, Cashflow Engine, project Total Income,
    and Receivable balance the moment the Accountant rejects it.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can reject income")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")
    prev_status = (inc.get("status") or "pending_approval")
    if prev_status in ("rejected", "under_correction"):
        raise HTTPException(status_code=400, detail=f"Income already in {prev_status} state")

    was_approved = prev_status in ("approved", "verified", "accountant_verified")

    update_set = {
        "status": "rejected",
        "prev_approved_status": prev_status if was_approved else None,
        "rejected_by": user.user_id,
        "rejected_by_name": user.name,
        "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": reason or "Rejected without remarks",
    }
    result = await db.income.find_one_and_update(
        {"income_id": income_id},
        {"$set": update_set},
        return_document=False,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")

    # Post-approval reversal: cashflow ledger + payment_stage rollback so the
    # amount stops counting everywhere (Cashbook totals, Cashflow Engine
    # Direct/Indirect pools, Project header Total Income, Receivable).
    if was_approved:
        amount = float(inc.get("amount", 0) or 0)
        project_id = inc.get("project_id")
        try:
            from routes.cashflow import reverse_allocation
            await reverse_allocation(income_id, kind="income")
        except Exception as e:
            import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

        if project_id:
            # Roll back payment_stage credit if this income was linked to one.
            stage_id = inc.get("payment_stage_id")
            if stage_id:
                stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "amount_received": 1, "amount": 1})
                if stage:
                    new_received = max(0, float(stage.get("amount_received", 0) or 0) - amount)
                    new_status = "partial" if new_received > 0 else "pending"
                    await db.payment_stages.update_one(
                        {"stage_id": stage_id},
                        {"$set": {"amount_received": new_received, "status": new_status}}
                    )
                # Mirror the rollback onto linked additional_costs.income_received
                # so the Client Portal / Planning boards don't show ghost amounts.
                await _sync_addition_cost_received(stage_id)
            # Advance amount rollback if applicable.
            category = (inc.get("category") or "").lower()
            stage_label = (inc.get("stage") or "").lower()
            if category in ("advance", "advance_payment") or "advance" in stage_label:
                project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "advance_amount": 1})
                if project:
                    cur = float(project.get("advance_amount", 0) or 0)
                    await db.projects.update_one({"project_id": project_id}, {"$set": {"advance_amount": max(0, cur - amount)}})

    # Notify the originator (CRE/Sales who collected it) so they can fix and resubmit.
    if inc.get("created_by") or inc.get("collected_by"):
        try:
            await create_notification(
                inc.get("created_by") or inc.get("collected_by"),
                f"Income ₹{inc.get('amount', 0):,.0f} for {inc.get('project_name', 'project')} was rejected by Accounts. Reason: {reason or 'No remarks'}"
            )
        except Exception:
            pass

    # Payment-collection rejection (Planning → CRE → Accountant flow):
    # roll the originating payment_stage back to 'requested' so CRE can
    # re-collect (or reject again), and notify BOTH the Planning user who
    # raised it and the CRE who collected it. This mirrors the Sales Lead
    # advance reject branch below.
    inc_category = (inc.get("category") or "").lower()
    payment_stage_id = inc.get("payment_stage_id")
    if inc_category == "payment_collection" and payment_stage_id:
        import logging as _logging
        _log = _logging.getLogger(__name__)
        stage = await db.payment_stages.find_one({"stage_id": payment_stage_id}, {"_id": 0})
        if stage:
            amt = float(inc.get("amount", 0) or 0)
            # DOUBLE-DECREMENT GUARD (Feb 2026): when `was_approved=True`, the
            # block above (lines 1108-1131) ALREADY decremented
            # `amount_received` by this income's amount. Decrementing again
            # here was driving the Payment Schedule's Received column to ₹0
            # even when other sibling cheques on the same stage are still
            # approved (e.g. Mr Sudharsan: 2 rejected + 1 approved cheque
            # showed Received=₹0 instead of ₹3.44L). Only re-decrement when
            # we're rejecting from pending_approval (no prior credit reversal).
            if was_approved:
                set_payload = {
                    "workflow_status": "requested",
                    "accountant_rejection_reason": reason or "Rejected by Accountant",
                    "accountant_rejected_at": datetime.now(timezone.utc).isoformat(),
                    "accountant_rejected_by_name": user.name,
                }
            else:
                new_received = max(0, float(stage.get("amount_received", 0) or 0) - amt)
                new_status = "paid" if new_received >= float(stage.get("amount", 0) or 0) and new_received > 0 else ("partial" if new_received > 0 else "pending")
                set_payload = {
                    "amount_received": new_received,
                    "status": new_status,
                    "workflow_status": "requested",
                    "accountant_rejection_reason": reason or "Rejected by Accountant",
                    "accountant_rejected_at": datetime.now(timezone.utc).isoformat(),
                    "accountant_rejected_by_name": user.name,
                }
            await db.payment_stages.update_one(
                {"stage_id": payment_stage_id},
                {"$set": set_payload}
            )
            # Mirror the rollback to additional_costs.income_received for addition stages.
            await _sync_addition_cost_received(payment_stage_id)
            project_name = inc.get("project_name") or "Project"
            stage_name = stage.get("stage_name") or stage.get("stage_label") or "stage"
            notif_count = 0

            # Notify the Planning user who raised the request (priority recipient).
            requester = stage.get("requested_by") or inc.get("planning_user_id")
            if requester:
                try:
                    await create_notification(
                        requester,
                        f"Accountant rejected the payment for {project_name} - {stage_name}. Reason: {reason or 'No remarks'}. The stage has been returned to the CRE queue."
                    )
                    notif_count += 1
                except Exception as e:
                    _log.error(f"notify requester failed: {e}", exc_info=True)

            # Notify all CRE users so the row reappears in their collect queue.
            cre_users = await db.users.find({"role": "cre", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
            for u in cre_users:
                try:
                    await create_notification(
                        u["user_id"],
                        f"Accountant rejected payment ₹{amt:,.0f} for {project_name} - {stage_name}. Please re-collect."
                    )
                    notif_count += 1
                except Exception as e:
                    _log.error(f"notify cre {u['user_id']} failed: {e}", exc_info=True)

            # Notify all Planning users (besides the original requester).
            planning_users = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
            for pu in planning_users:
                if pu["user_id"] == requester:
                    continue
                try:
                    await create_notification(
                        pu["user_id"],
                        f"Accountant rejected a payment for {project_name} - {stage_name}. Reason: {reason or 'No remarks'}."
                    )
                    notif_count += 1
                except Exception as e:
                    _log.error(f"notify planning {pu['user_id']} failed: {e}", exc_info=True)

            _log.info(f"income reject: notified {notif_count} users for income={income_id} stage={payment_stage_id}")
        else:
            _log.warning(f"income reject: payment_stage_id={payment_stage_id} not found for income={income_id}")

    # If this income originated from a Sales Lead advance (lead_id is set), bounce
    # the lead back to Deal Close + flip its onboarding_status to
    # 'accountant_rejected'. This is what fires the red banner on the Sales
    # board so the CRE/Sales user can re-enter the advance — matching the
    # parity behaviour of POST /api/crm/leads/{lead_id}/accountant-reject.
    lead_id = inc.get("lead_id")
    if lead_id:
        lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
        if lead:
            now = datetime.now(timezone.utc)
            stage_history = lead.get("stage_history", [])
            stage_history.append({
                "stage_id": "stg_payment_collect",
                "from_stage_id": lead.get("current_stage_id"),
                "moved_at": now.isoformat(),
                "moved_by": user.user_id,
                "action": "accountant_rejected_via_income",
                "reason": reason or "No remarks",
            })
            advance_update = lead.get("advance_payment") or {}
            advance_update.update({
                "rejection_reason": reason or "No remarks",
                "rejected_by_name": user.name,
                "rejected_at": now.isoformat(),
            })
            await db.leads.update_one(
                {"lead_id": lead_id},
                {"$set": {
                    "onboarding_status": "accountant_rejected",
                    "current_stage_id": "stg_payment_collect",
                    "stage_history": stage_history,
                    "advance_payment": advance_update,
                    "rejection_reason": reason or "No remarks",
                    "rejected_by_name": user.name,
                    "rejected_at": now.isoformat(),
                    "updated_at": now,
                }}
            )
            # Notify the lead's assigned sales/CRE user.
            assigned = lead.get("assigned_to")
            if assigned:
                try:
                    await create_notification(
                        assigned,
                        f"Advance payment for lead '{lead.get('name')}' was REJECTED by Accountant. Reason: {reason or 'No remarks'}. Please re-enter the advance from the Deal Close column."
                    )
                except Exception:
                    pass

    await create_audit_log(user.user_id, "reject", "income", income_id, {"reason": reason, "was_approved": was_approved, "lead_id": lead_id})
    return {
        "message": "Income rejected. Cashbook & cashflow rolled back." if was_approved else "Income rejected and returned for correction",
        "was_approved_before_reject": was_approved,
        "lead_bounced": bool(lead_id),
    }


class IncomeResubmitRequest(BaseModel):
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    stage: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/income/{income_id}/resubmit")
async def resubmit_rejected_income(income_id: str, data: IncomeResubmitRequest, user: User = Depends(get_current_user)):
    """Originator (CRE/Sales/Admin) fixes a rejected income entry and resubmits for approval.

    The full record stays in db.income (so audit history is preserved). Status flips
    from 'rejected' back to 'pending_approval' and the rejection metadata is cleared,
    but we keep `last_rejection_reason` + `last_rejected_at` for traceability.
    """
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")
    if inc.get("status") != "rejected":
        raise HTTPException(status_code=400, detail=f"Only rejected entries can be resubmitted (current status={inc.get('status')})")
    # Allow originator OR admin/CRE/Sales roles to resubmit
    allowed = (inc.get("created_by") == user.user_id) or (user.role in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.SALES, UserRole.ACCOUNTANT])
    if not allowed:
        raise HTTPException(status_code=403, detail="Only the originator (or Admin/CRE/Sales) can resubmit this entry")

    update: Dict[str, Any] = {
        "status": "pending_approval",
        "last_rejection_reason": inc.get("rejection_reason"),
        "last_rejected_by_name": inc.get("rejected_by_name"),
        "last_rejected_at": inc.get("rejected_at"),
        "resubmitted_by": user.user_id,
        "resubmitted_by_name": user.name,
        "resubmitted_at": datetime.now(timezone.utc).isoformat(),
    }
    # Clear current rejection so the row shows up cleanly in the approval queue
    unset = {"rejection_reason": "", "rejected_by": "", "rejected_by_name": "", "rejected_at": ""}

    payload = data.model_dump(exclude_none=True) if hasattr(data, "model_dump") else data.dict(exclude_none=True)
    for k, v in payload.items():
        update[k] = v

    await db.income.update_one({"income_id": income_id}, {"$set": update, "$unset": unset})
    await create_audit_log(user.user_id, "resubmit", "income", income_id, {"fields_changed": list(payload.keys())})

    # Notify the accountant who rejected (if any), or all accountants
    try:
        rejector_id = inc.get("rejected_by")
        if rejector_id:
            await create_notification(rejector_id, f"Income ₹{inc.get('amount', 0):,.0f} resubmitted by {user.name} — please review.")
    except Exception:
        pass

    return {"message": "Income resubmitted for approval"}


class ExpenseRejectRequest(BaseModel):
    reason: str


@router.post("/expenses/{expense_id}/reject")
async def reject_expense(expense_id: str, data: ExpenseRejectRequest, user: User = Depends(get_current_user)):
    """Accountant rejects a recorded expense; sends it back to the originator."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can reject expenses")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.get("status") == "rejected":
        raise HTTPException(status_code=400, detail="Already rejected")
    now = datetime.now(timezone.utc).isoformat()
    await db.recorded_expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": user.user_id,
            "rejected_by_name": user.name,
            "rejected_at": now,
            "rejection_reason": data.reason or "Rejected without remarks",
        }}
    )
    if exp.get("created_by"):
        try:
            await create_notification(
                exp["created_by"],
                f"Expense ₹{exp.get('amount', 0):,.0f} for {exp.get('project_name', 'project')} was rejected. Reason: {data.reason or 'No remarks'}"
            )
        except Exception:
            pass
    await create_audit_log(user.user_id, "reject", "expense", expense_id, {"reason": data.reason})
    return {"message": "Expense rejected and returned to originator"}


class ExpenseResubmitRequest(BaseModel):
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    category: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/expenses/{expense_id}/resubmit")
async def resubmit_rejected_expense(expense_id: str, data: ExpenseResubmitRequest, user: User = Depends(get_current_user)):
    """Originator fixes a rejected expense and resubmits for approval (status -> pending_approval)."""
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.get("status") != "rejected":
        raise HTTPException(status_code=400, detail=f"Only rejected entries can be resubmitted (current status={exp.get('status')})")
    allowed = (exp.get("created_by") == user.user_id) or (user.role in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT])
    if not allowed:
        raise HTTPException(status_code=403, detail="Only the originator (or Admin/Accountant) can resubmit this expense")

    update: Dict[str, Any] = {
        "status": "pending_approval",
        "last_rejection_reason": exp.get("rejection_reason"),
        "last_rejected_by_name": exp.get("rejected_by_name"),
        "last_rejected_at": exp.get("rejected_at"),
        "resubmitted_by": user.user_id,
        "resubmitted_by_name": user.name,
        "resubmitted_at": datetime.now(timezone.utc).isoformat(),
    }
    unset = {"rejection_reason": "", "rejected_by": "", "rejected_by_name": "", "rejected_at": ""}
    payload = data.model_dump(exclude_none=True) if hasattr(data, "model_dump") else data.dict(exclude_none=True)
    for k, v in payload.items():
        update[k] = v
    await db.recorded_expenses.update_one({"expense_id": expense_id}, {"$set": update, "$unset": unset})
    await create_audit_log(user.user_id, "resubmit", "expense", expense_id, {"fields_changed": list(payload.keys())})
    return {"message": "Expense resubmitted for approval"}


@router.get("/income/rejected/mine")
async def get_my_rejected_income(user: User = Depends(get_current_user)):
    """Income entries the current user originated that the Accountant rejected."""
    q = {"status": "rejected"}
    # Show all rejected for admin/accountant; others see only their own
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        q["created_by"] = user.user_id
    rows = await db.income.find(q, {"_id": 0}).sort("rejected_at", -1).to_list(200)
    return rows


@router.get("/expenses/rejected/mine")
async def get_my_rejected_expenses(user: User = Depends(get_current_user)):
    """Recorded expenses the current user originated that the Accountant rejected."""
    q = {"status": "rejected"}
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        q["created_by"] = user.user_id
    rows = await db.recorded_expenses.find(q, {"_id": 0}).sort("rejected_at", -1).to_list(200)
    return rows


class IncomeReviewRequest(BaseModel):
    verification_mode: str  # cash, cheque, bank, dt
    denomination: Optional[Dict[str, int]] = None  # for cash: {"2000": 1, "500": 4, ...}
    cheque_number: Optional[str] = None  # for single cheque
    cheque_verifications: Optional[List[Dict[str, Any]]] = None  # for multiple cheques: [{"cheque_id": "...", "entered_number": "...", "amount": ...}]
    transaction_id: Optional[str] = None  # for bank
    dt_id: Optional[str] = None  # for dt
    notes: Optional[str] = None


@router.get("/approvals/income/{income_id}/cheques")
async def get_income_cheques(income_id: str, user: User = Depends(get_current_user)):
    """Cheques tied to a SPECIFIC income approval.

    Strict scoping (was broken before — used to fall back to every project cheque
    so a fresh approval popup would show every previous-request cheque).

    Order of resolution:
      1. cheques with cheque.income_id == this income
      2. cheques with cheque.bulk_collection_id == income.bulk_collection_id
      3. cheques whose stage_id matches income.payment_stage_id / stage_id AND
         that were created within the same bulk window
      4. Empty list — NEVER fall back to project-wide cheques.

    Disabled and bounced cheques are always excluded — they don't need
    re-verification by the accountant during this approval.
    """
    income = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")

    base_filter = {
        "cheque_type": "incoming",
        "is_disabled": {"$ne": True},
        "status": {"$nin": ["bounced", "cancelled", "deleted"]},
    }

    # 1. Direct income_id link (most reliable, set at create-time)
    cheques = await db.cheques.find(
        {**base_filter, "income_id": income_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    # 2. Bulk collection link (multi-income / multi-cheque scenario)
    if not cheques and income.get("bulk_collection_id"):
        cheques = await db.cheques.find(
            {**base_filter, "bulk_collection_id": income["bulk_collection_id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(50)

    # 3. Stage-linked cheques (incoming advances that pre-create cheque before income)
    stage_id = income.get("payment_stage_id") or income.get("stage_id")
    if not cheques and stage_id:
        cheques = await db.cheques.find(
            {**base_filter, "stage_id": stage_id},
            {"_id": 0},
        ).sort("created_at", -1).to_list(50)

    # NO project-wide fallback. If the cheque isn't linked, the accountant
    # should fix the income first (or use Cheque Management to link manually).
    return {"cheques": cheques}


@router.post("/approvals/income/{income_id}/review")
async def review_income(income_id: str, data: IncomeReviewRequest, user: User = Depends(get_current_user)):
    """Accountant reviews and verifies an income entry with payment verification details"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can review income")

    income = await db.income.find_one({"income_id": income_id, "status": "pending_approval"})
    if not income:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")

    # Build verification record
    verification = {
        "verification_mode": data.verification_mode,
        "verified_by": user.user_id,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.denomination:
        verification["denomination"] = data.denomination
        denomination_total = sum(int(k) * v for k, v in data.denomination.items())
        verification["denomination_total"] = denomination_total
    if data.cheque_number:
        verification["cheque_number"] = data.cheque_number
    if data.cheque_verifications:
        verification["cheque_verifications"] = data.cheque_verifications
    if data.transaction_id:
        verification["transaction_id"] = data.transaction_id
    if data.dt_id:
        verification["dt_id"] = data.dt_id
    if data.notes:
        verification["notes"] = data.notes

    # Approve the income with verification data
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "verification": verification,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    # Update payment stage collected amount if linked to a stage
    project_id = income.get("project_id")
    stage_id = income.get("stage_id")
    amount = income.get("amount", 0)

    if project_id and stage_id:
        stage = await db.payment_stages.find_one({"stage_id": stage_id, "project_id": project_id})
        if stage:
            current_collected = stage.get("collected", 0)
            new_collected = current_collected + amount
            stage_amount = stage.get("amount", 0)
            update_fields = {
                "collected": new_collected,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if new_collected >= stage_amount:
                update_fields["status"] = "paid"
                update_fields["completed_date"] = datetime.now(timezone.utc).isoformat()
            await db.payment_stages.update_one(
                {"stage_id": stage_id, "project_id": project_id},
                {"$set": update_fields}
            )

    await create_audit_log(user.user_id, "review_approve", "income", income_id, {"verification": verification})
    
    # If this is an advance payment, update project status + move lead to Project Onboarded
    if income.get("category") == "advance_payment" and project_id:
        # NEW WORKFLOW (Feb 2026): auto-route to Planning Head (skip CRE entirely)
        _now_iso = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one(
            {"project_id": project_id, "status": "pending_payment"},
            {"$set": {
                "status": "in_planning",
                "accountant_verified": True,
                "accountant_verified_by": user.user_id,
                "accountant_verified_at": _now_iso,
                "planning_status": "new",
                "planning_new_date": _now_iso,
                "sent_to_planning_by": user.user_id,
                "sent_to_planning_at": _now_iso,
                "auto_sent_to_planning": True,
                # Feb 20 2026 — Revive soft-deleted / archived projects on
                # re-onboarding (see crm.py advance-verify for context).
                "is_deleted": False,
                "is_archived": False,
            }, "$unset": {
                "deleted_at": "",
                "deleted_by": "",
                "deleted_by_name": "",
                "archived_at": "",
            }}
        )

        # Auto-move the linked lead to "Project Onboarded" so Sales doesn't have
        # to manually move the stage after approving the advance.
        lead_id_to_move = income.get("lead_id")
        if not lead_id_to_move:
            proj_doc = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "lead_id": 1})
            lead_id_to_move = (proj_doc or {}).get("lead_id")
        if not lead_id_to_move:
            ld = await db.leads.find_one({"project_id": project_id}, {"_id": 0, "lead_id": 1})
            lead_id_to_move = (ld or {}).get("lead_id")
        if lead_id_to_move:
            lead_doc = await db.leads.find_one({"lead_id": lead_id_to_move}, {"_id": 0})
            if lead_doc and lead_doc.get("current_stage_id") != "stg_project_onboarded":
                user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
                user_name = (user_doc or {}).get("name", "Accountant")
                now_iso = datetime.now(timezone.utc).isoformat()
                await db.leads.update_one(
                    {"lead_id": lead_id_to_move},
                    {"$set": {
                        "current_stage_id": "stg_project_onboarded",
                        "onboarding_status": "project_onboarded",
                        "advance_payment.verified_by": user.user_id,
                        "advance_payment.verified_by_name": user_name,
                        "advance_payment.verified_at": now_iso,
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$push": {"stage_history": {
                        "stage_id": "stg_project_onboarded",
                        "from_stage_id": lead_doc.get("current_stage_id"),
                        "moved_at": now_iso,
                        "moved_by": user.user_id,
                        "moved_by_name": user_name,
                        "action": "auto_after_accountant_review",
                        "remark": "Advance payment reviewed & approved by Accountant",
                    }}}
                )

    return {"message": "Income reviewed and approved", "verification": verification}


# ==================== CASHBOOK ENDPOINTS ====================

@router.get("/cashbook")
async def get_cashbook(
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get cashbook - all income and expense records"""
    allowed = [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    income_q = {"status": {"$in": ["approved", "verified"]}} if not project_id else {"status": {"$in": ["approved", "verified"]}, "project_id": project_id}
    # Exclude rejected / under-correction expense rows from cashbook + totals.
    # The correction engine flips these statuses when an approved row is
    # pulled back; the row should vanish from cashbook until re-approved.
    EXCLUDED_EXPENSE_STATUSES = ["under_correction", "rejected", "accountant_rejected", "accounts_rejected", "cheque_bounced"]
    expense_q = {"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}
    if project_id:
        expense_q["project_id"] = project_id
    
    (incomes, recorded_exps, labour_exps, material_reqs, projects_list) = await asyncio.gather(
        db.income.find(income_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.recorded_expenses.find(expense_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.labour_expenses.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.material_requests.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )
    
    total_income = sum(i.get("amount", 0) for i in incomes)
    total_expense = sum(e.get("amount", 0) for e in recorded_exps) + sum(l.get("total_amount", 0) for l in labour_exps) + sum(m.get("estimated_price", 0) for m in material_reqs)
    
    # Income by payment mode
    mode_totals = {"cash": 0, "cheque": 0, "bank_transfer": 0, "escrow": 0}
    for i in incomes:
        mode = i.get("payment_mode", "cash")
        mode_totals[mode] = mode_totals.get(mode, 0) + i.get("amount", 0)
    
    return {
        "income": incomes,
        "expenses": recorded_exps,
        "labour_expenses": labour_exps,
        "material_expenses": material_reqs,
        "projects": projects_list,
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": total_income - total_expense,
            "income_by_mode": mode_totals,
        }
    }


class ManualExpenseCreate(BaseModel):
    project_id: str
    category: str  # material, labour, vendor, petty_cash, other
    description: str
    amount: float
    payment_method: str = "cash"  # cash, cheque, bank_transfer, upi
    vendor_name: Optional[str] = None
    remarks: Optional[str] = None
    site_allocation: Optional[List[Dict[str, Any]]] = None  # [{project_id, amount}]


@router.post("/cashbook/manual-expense")
async def create_manual_expense(data: ManualExpenseCreate, user: User = Depends(get_current_user)):
    """Record a manual expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can record expenses")
    
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    
    expense = {
        "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
        "project_id": data.project_id,
        "project_name": project.get("name") if project else "Unknown",
        "category": data.category,
        "description": data.description,
        "amount": data.amount,
        "payment_method": data.payment_method,
        "vendor_name": data.vendor_name,
        "remarks": data.remarks,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "source": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.recorded_expenses.insert_one(expense)
    del expense["_id"]
    
    await create_audit_log(user.user_id, "create", "expense", expense["expense_id"], {"amount": data.amount, "category": data.category})
    return expense


# ==================== SUSPENSE ACCOUNT ENDPOINTS ====================

@router.get("/suspense/overview")
async def get_suspense_overview(user: User = Depends(get_current_user)):
    """Get suspense account overview - petty cash, materials (vendor credit), labour balances.
    
    Pulls from the ACTUAL data sources used by the app:
      - Petty Cash: db.petty_cash (status payment_done/acknowledged/partially_spent/issued)
      - Material Suspense: db.vendor_credit_ledger + db.credit_ledger (pending credit purchases)
      - Labour Suspense: db.labour_expenses (status pm_approved — approved but awaiting accountant payout)
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    PETTY_ACTIVE_STATUSES = ["payment_done", "acknowledged", "partially_spent", "issued"]
    VENDOR_OPEN_STATUSES = ["pending", "active", "overdue", "partially_paid"]
    LABOUR_OPEN_STATUSES = ["pm_approved", "accounts_pending"]
    
    (petty_cash, vendor_credits_v2, credit_ledger_v1, labour_expenses, projects_list) = await asyncio.gather(
        db.petty_cash.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.vendor_credit_ledger.find({"status": {"$in": VENDOR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.credit_ledger.find({"status": {"$in": VENDOR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.labour_expenses.find({"status": {"$in": LABOUR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )
    
    # ---- Petty Cash ----
    petty_active = [p for p in petty_cash if p.get("status") in PETTY_ACTIVE_STATUSES]
    petty_total_issued = sum(p.get("amount_issued", 0) or 0 for p in petty_active)
    petty_total_spent = sum(p.get("amount_spent", 0) or 0 for p in petty_active)
    petty_balance = petty_total_issued - petty_total_spent
    
    # ---- Material Suspense (vendor credit) ----
    material_suspense = {}  # vendor_name -> { balance, entries:[] }
    for entry in vendor_credits_v2 + credit_ledger_v1:
        vendor = entry.get("vendor_name") or "Unknown Vendor"
        outstanding = entry.get("balance")
        if outstanding is None or outstanding == 0:
            outstanding = entry.get("amount", 0) or 0
        if outstanding <= 0:
            continue
        bucket = material_suspense.setdefault(vendor, {"name": vendor, "balance": 0, "entries": []})
        bucket["balance"] += outstanding
        bucket["entries"].append({
            "ledger_id": entry.get("ledger_id"),
            "material": entry.get("material") or entry.get("material_name", ""),
            "project_id": entry.get("project_id"),
            "amount": entry.get("amount", 0),
            "balance": outstanding,
            "due_date": entry.get("due_date"),
            "status": entry.get("status"),
        })
    
    # ---- Labour Suspense ----
    labour_suspense = {}
    for exp in labour_expenses:
        contractor = exp.get("contractor_name") or "Unknown Contractor"
        outstanding = (exp.get("total_amount", 0) or 0) - (exp.get("paid_amount", 0) or 0)
        if outstanding <= 0:
            continue
        bucket = labour_suspense.setdefault(contractor, {"name": contractor, "balance": 0, "entries": []})
        bucket["balance"] += outstanding
        bucket["entries"].append({
            "labour_expense_id": exp.get("labour_expense_id"),
            "description": exp.get("description"),
            "project_id": exp.get("project_id"),
            "amount": exp.get("total_amount", 0),
            "balance": outstanding,
            "status": exp.get("status"),
        })
    
    return {
        "petty_cash": {
            "active_requests": petty_active,
            "total_issued": petty_total_issued,
            "total_spent": petty_total_spent,
            "balance": petty_balance,
            "all_requests": petty_cash,
        },
        "material_suspense": {
            "balances": list(material_suspense.values()),
            "total": sum(b["balance"] for b in material_suspense.values()),
        },
        "labour_suspense": {
            "balances": list(labour_suspense.values()),
            "total": sum(b["balance"] for b in labour_suspense.values()),
        },
        "total_suspense_balance": (
            petty_balance
            + sum(b["balance"] for b in material_suspense.values())
            + sum(b["balance"] for b in labour_suspense.values())
        ),
        "projects": projects_list,
    }


# ── Super Admin destructive cleanup for suspense entries ─────────────────────
# These endpoints permanently delete the underlying source records, which is
# how an aggregate balance row in the UI gets "cleared". Restricted to
# Super Admin because they bypass the normal Process Payment flow.

@router.delete("/suspense/petty-cash/{petty_cash_id}")
async def delete_petty_cash_request(petty_cash_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete suspense entries")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")
    await db.petty_cash.delete_one({"petty_cash_id": petty_cash_id})
    await create_audit_log(user.user_id, "delete_petty_cash", "petty_cash", petty_cash_id, {
        "amount_issued": pc.get("amount_issued"), "purpose": pc.get("purpose"),
    })
    return {"message": "Petty cash request deleted", "petty_cash_id": petty_cash_id}


@router.delete("/suspense/material-entry/{ledger_id}")
async def delete_material_suspense_entry(ledger_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete suspense entries")
    # Entry could live in either ledger collection — try both.
    res_v2 = await db.vendor_credit_ledger.delete_one({"ledger_id": ledger_id})
    res_v1 = await db.credit_ledger.delete_one({"ledger_id": ledger_id})
    if res_v2.deleted_count == 0 and res_v1.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material suspense entry not found")
    await create_audit_log(user.user_id, "delete_material_suspense", "credit_ledger", ledger_id, {})
    return {"message": "Material suspense entry deleted", "ledger_id": ledger_id}


@router.delete("/suspense/labour-entry/{labour_expense_id}")
async def delete_labour_suspense_entry(labour_expense_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete suspense entries")
    exp = await db.labour_expenses.find_one({"labour_expense_id": labour_expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Labour suspense entry not found")
    await db.labour_expenses.delete_one({"labour_expense_id": labour_expense_id})
    await create_audit_log(user.user_id, "delete_labour_suspense", "labour_expense", labour_expense_id, {
        "total_amount": exp.get("total_amount"), "contractor_name": exp.get("contractor_name"),
    })
    return {"message": "Labour suspense entry deleted", "labour_expense_id": labour_expense_id}


class PaymentWithSuspense(BaseModel):
    payment_type: str  # material, labour
    vendor_or_contractor: str
    requested_amount: float
    cheque_amount: float
    payment_method: str = "cheque"
    site_allocations: List[Dict[str, Any]]  # [{project_id, project_name, amount}]
    remarks: Optional[str] = None


@router.post("/suspense/payment")
async def process_payment_with_suspense(data: PaymentWithSuspense, user: User = Depends(get_current_user)):
    """Process payment with smart suspense balance deduction.
    
    Example: Labour asks 80K, Finance pays 1L cheque.
    80K goes to labour expense, 20K goes to suspense.
    Next time same labour asks 60K, only 40K needs to be sent (20K deducted from suspense).
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can process payments")
    
    now = datetime.now(timezone.utc).isoformat()
    payment_id = f"pay_{uuid.uuid4().hex[:12]}"
    
    # Check existing suspense balance for this vendor/contractor
    existing_suspense = await db.suspense_entries.aggregate([
        {"$match": {"type": data.payment_type, "$or": [
            {"vendor_name": data.vendor_or_contractor},
            {"contractor_name": data.vendor_or_contractor}
        ]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    current_balance = existing_suspense[0]["total"] if existing_suspense else 0
    
    # Calculate actual payment needed
    actual_needed = max(0, data.requested_amount - current_balance)
    suspense_used = min(current_balance, data.requested_amount)
    excess = data.cheque_amount - data.requested_amount  # Excess goes to suspense
    
    # Record the payment
    payment_record = {
        "payment_id": payment_id,
        "payment_type": data.payment_type,
        "vendor_or_contractor": data.vendor_or_contractor,
        "requested_amount": data.requested_amount,
        "cheque_amount": data.cheque_amount,
        "suspense_used": suspense_used,
        "actual_paid": actual_needed,
        "excess_to_suspense": excess if excess > 0 else 0,
        "payment_method": data.payment_method,
        "site_allocations": data.site_allocations,
        "remarks": data.remarks,
        "processed_by": user.user_id,
        "processed_by_name": user.name,
        "created_at": now,
    }
    await db.payment_records.insert_one({**payment_record})
    
    # If suspense was used, record a deduction entry
    if suspense_used > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"sus_{uuid.uuid4().hex[:12]}",
            "type": data.payment_type,
            "vendor_name": data.vendor_or_contractor if data.payment_type == "material" else None,
            "contractor_name": data.vendor_or_contractor if data.payment_type == "labour" else None,
            "amount": -suspense_used,
            "description": f"Deducted from suspense for payment {payment_id}",
            "payment_id": payment_id,
            "created_at": now,
        })
    
    # If excess, add to suspense
    if excess > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"sus_{uuid.uuid4().hex[:12]}",
            "type": data.payment_type,
            "vendor_name": data.vendor_or_contractor if data.payment_type == "material" else None,
            "contractor_name": data.vendor_or_contractor if data.payment_type == "labour" else None,
            "amount": excess,
            "description": f"Excess from cheque payment {payment_id} (Cheque: {data.cheque_amount}, Requested: {data.requested_amount})",
            "payment_id": payment_id,
            "created_at": now,
        })
    
    # Record expenses per site allocation
    for alloc in data.site_allocations:
        project = await db.projects.find_one({"project_id": alloc["project_id"]}, {"_id": 0, "name": 1})
        expense_entry = {
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": alloc["project_id"],
            "project_name": project.get("name") if project else alloc.get("project_name", "Unknown"),
            "category": data.payment_type,
            "description": f"Payment to {data.vendor_or_contractor}",
            "amount": alloc["amount"],
            "payment_method": data.payment_method,
            "vendor_name": data.vendor_or_contractor,
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "payment_id": payment_id,
            "created_at": now,
        }
        await db.recorded_expenses.insert_one(expense_entry)
    
    # Notify site managers for each site
    for alloc in data.site_allocations:
        await create_notification(
            None,
            f"Payment of ₹{alloc['amount']:,.0f} recorded for {data.vendor_or_contractor} on site {alloc.get('project_name', '')}"
        )
    
    new_balance = current_balance - suspense_used + (excess if excess > 0 else 0)
    
    await create_audit_log(user.user_id, "payment", "suspense", payment_id, {
        "type": data.payment_type, "vendor": data.vendor_or_contractor,
        "requested": data.requested_amount, "cheque": data.cheque_amount,
        "suspense_used": suspense_used, "new_balance": new_balance
    })
    
    return {
        "payment_id": payment_id,
        "requested_amount": data.requested_amount,
        "cheque_amount": data.cheque_amount,
        "suspense_used": suspense_used,
        "actual_paid": actual_needed,
        "excess_to_suspense": excess if excess > 0 else 0,
        "new_suspense_balance": new_balance,
        "message": f"Payment processed. Suspense balance for {data.vendor_or_contractor}: ₹{new_balance:,.0f}"
    }


@router.post("/suspense/petty-cash/{petty_cash_id}/settle")
async def settle_petty_cash(petty_cash_id: str, user: User = Depends(get_current_user)):
    """Approve petty cash settlement - moves from suspense to real expense"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can settle petty cash")
    
    pc = await db.petty_cash_requests.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")
    
    if pc.get("status") not in ["submitted", "partially_settled"]:
        raise HTTPException(status_code=400, detail=f"Cannot settle - current status: {pc.get('status')}")
    
    now = datetime.now(timezone.utc).isoformat()
    amount_spent = pc.get("amount_spent", 0)
    
    # Record each expense line as a real expense
    for exp in pc.get("expenses", []):
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": pc.get("project_id"),
            "project_name": pc.get("project_name"),
            "category": "petty_cash",
            "description": exp.get("description", "Petty cash expense"),
            "amount": exp.get("amount", 0),
            "payment_method": "cash",
            "vendor_name": exp.get("vendor_name", ""),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "petty_cash_id": petty_cash_id,
            "created_at": now,
        })
    
    # Update petty cash status
    refund = pc.get("amount_issued", 0) - amount_spent
    await db.petty_cash_requests.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {"status": "settled", "settled_by": user.user_id, "settled_at": now, "refund_amount": refund}}
    )
    
    await create_audit_log(user.user_id, "settle", "petty_cash", petty_cash_id, {"amount_spent": amount_spent, "refund": refund})
    return {"message": f"Petty cash settled. Amount spent: ₹{amount_spent:,.0f}, Refund: ₹{refund:,.0f}"}


@router.get("/project-finance")
async def get_project_finance_view(user: User = Depends(get_current_user)):
    """Project-wise income and expense breakdown for accountant"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    (projects, incomes, recorded_exps, labour_exps, material_reqs) = await asyncio.gather(
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "total_value": 1, "status": 1}).to_list(1000),
        db.income.find({"status": {"$in": ["approved", "verified"]}}, {"_id": 0, "project_id": 1, "amount": 1, "payment_mode": 1}).to_list(5000),
        db.recorded_expenses.find({}, {"_id": 0, "project_id": 1, "amount": 1, "category": 1}).to_list(5000),
        db.labour_expenses.find({"status": "accounts_approved"}, {"_id": 0, "project_id": 1, "total_amount": 1}).to_list(1000),
        db.material_requests.find({"status": "accounts_approved"}, {"_id": 0, "project_id": 1, "estimated_price": 1}).to_list(1000),
    )
    
    from collections import defaultdict
    inc_by_proj = defaultdict(float)
    for i in incomes:
        inc_by_proj[i.get("project_id")] += i.get("amount", 0)
    
    exp_by_proj = defaultdict(lambda: {"material": 0, "labour": 0, "vendor": 0, "petty_cash": 0, "other": 0, "total": 0})
    for e in recorded_exps:
        pid = e.get("project_id")
        cat = e.get("category", "other")
        amt = e.get("amount", 0)
        if cat in exp_by_proj[pid]:
            exp_by_proj[pid][cat] += amt
        else:
            exp_by_proj[pid]["other"] += amt
        exp_by_proj[pid]["total"] += amt
    for l in labour_exps:
        pid = l.get("project_id")
        exp_by_proj[pid]["labour"] += l.get("total_amount", 0)
        exp_by_proj[pid]["total"] += l.get("total_amount", 0)
    for m in material_reqs:
        pid = m.get("project_id")
        exp_by_proj[pid]["material"] += m.get("estimated_price", 0)
        exp_by_proj[pid]["total"] += m.get("estimated_price", 0)
    
    result = []
    for p in projects:
        pid = p["project_id"]
        income = inc_by_proj.get(pid, 0)
        expenses = dict(exp_by_proj.get(pid, {"material": 0, "labour": 0, "vendor": 0, "petty_cash": 0, "other": 0, "total": 0}))
        result.append({
            "project_id": pid, "name": p["name"], "client_name": p.get("client_name"),
            "total_value": p.get("total_value", 0), "status": p.get("status"),
            "income": income, "expenses": expenses,
            "profit": income - expenses["total"],
        })
    
    result.sort(key=lambda x: x["income"], reverse=True)
    return {"projects": result}


# ==================== ENHANCED PROJECT VIEW ENDPOINT ====================

@router.get("/projects/{project_id}/full-details")
async def get_project_full_details(project_id: str, user: User = Depends(get_current_user)):
    """Get complete project details with scope, payments, additions, and deductions"""
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Hide client contact info for roles other than sales, pre_sales, cre, super_admin
    if user.role not in [UserRole.SALES, UserRole.PRE_SALES, UserRole.CRE, UserRole.SUPER_ADMIN]:
        project.pop("client_phone", None)
        project.pop("client_email", None)
    
    # Get scope items
    scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)]).to_list(1000)
    for item in scope_items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    
    # Get payment stages (honour user's manual reorder via sort_order)
    payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(1000)

    # Project Payment Schedule is for **client income collection only**.
    # Auto-inserted vendor/labour/RAB rows (e.g. "RAB-XX · Contractor · advance"
    # rows created by the RAB release flow) live in payment_stages for cashbook
    # accounting but must NOT surface on the client Payment Schedule UI.
    def _is_vendor_or_labour_row(s):
        cat = (s.get("category") or "").lower()
        kind = (s.get("kind") or "").lower()
        if cat in ("labour", "vendor", "material", "expense"):
            return True
        if kind in ("labour_rab", "vendor_payment", "material_expense"):
            return True
        if s.get("rab_request_id") or s.get("rab_number") or s.get("contractor_id") or s.get("vendor_id"):
            return True
        sname = (s.get("stage_name") or "").lower()
        if sname.startswith("rab-") or sname.startswith("rab "):
            return True
        return False

    # Additional-cost driven payment_stages (created when "Req Payment" is
    # clicked on an Additional Work row) live in payment_stages for income
    # tracking but must NOT pollute the milestone Payment Schedule — they
    # belong to the Additions tab. Excluding them here keeps the backend
    # `payment_schedule_total` / `payment_received` aligned with the rows
    # the frontend actually renders (which already filters is_addition).
    def _is_addition_row(s):
        if s.get("is_addition") is True:
            return True
        if s.get("linked_addition_id"):
            return True
        sname = (s.get("stage_name") or "")
        if sname.startswith("Additional:") or sname.startswith("Additional Work"):
            return True
        return False

    payment_stages = [
        s for s in payment_stages
        if not _is_vendor_or_labour_row(s) and not _is_addition_row(s)
    ]

    for stage in payment_stages:
        if isinstance(stage.get("due_date"), str):
            stage["due_date"] = datetime.fromisoformat(stage["due_date"])
        if isinstance(stage.get("completed_date"), str):
            stage["completed_date"] = datetime.fromisoformat(stage["completed_date"])
        if isinstance(stage.get("created_at"), str):
            stage["created_at"] = datetime.fromisoformat(stage["created_at"])
    
    # Get additional costs
    additional_costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)]).to_list(1000)
    for cost in additional_costs:
        if isinstance(cost.get("created_at"), str):
            cost["created_at"] = datetime.fromisoformat(cost["created_at"])
    
    # Get deductions
    deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)]).to_list(1000)
    for d in deductions:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])

    # Get addition sections (folders that group additional_costs)
    addition_sections = await db.addition_sections.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)

    # Get deduction sections (folders that group deductions — mirrors addition_sections)
    deduction_sections = await db.deduction_sections.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    
    # Calculate totals — Additions only count toward project value when the
    # CLIENT has approved them (matches /value-summary rule). Pending /
    # under-review / rejected additions contribute ₹0.
    # Likewise the Scope (Final Estimate) total only counts once the client
    # has approved the FE on the public share link (fe.status == 'approved').
    # Until then it's surfaced as `scope_total_pending` for header pills.
    fe_doc = project.get("fe") or {}
    fe_client_approved = fe_doc.get("status") == "approved"
    raw_scope_total = sum(item.get("total_amount", 0) for item in scope_items)
    scope_total = raw_scope_total if fe_client_approved else 0
    client_approved_additions = [
        c for c in additional_costs
        if c.get("client_approval_status") == "client_approved" or c.get("client_approved") is True
    ]
    additions_total = sum(cost.get("estimated_amount", 0) for cost in client_approved_additions)
    additions_received = sum(cost.get("income_received", 0) for cost in client_approved_additions)
    deductions_total = sum(d.get("amount", 0) for d in deductions if d.get("client_approval_status") == "client_approved")

    # ── SELF-HEAL PAYMENT STAGE AMOUNTS (same logic as /payment-summary) ────
    # Anchor every stage's `amount` to (FE scope_total × percentage / 100) so
    # the Payment Schedule list at the bottom of the project page always
    # matches the live Final Estimate. User rule: "Final Estimate value IS the
    # Payment Schedule value" — scope edits propagate immediately, no need to
    # wait for a CRE re-approval to refresh the lock.
    # Without this, /full-details races with /payment-summary on the frontend
    # (Promise.all) and the UI flickers between healed and un-healed amounts.
    # NOTE: payment_stages still anchor against the LIVE scope total (raw_scope_total)
    # so the schedule keeps working before client approval; the gating is only
    # applied to user-facing project_value / total_value / balance below.
    locked_project_value = float(project.get("total_value") or 0)
    anchor_value = raw_scope_total if raw_scope_total > 0 else locked_project_value
    # If the live FE scope has drifted from the stored lock, refresh the lock.
    if raw_scope_total > 0 and abs(raw_scope_total - locked_project_value) > 0.5:
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"total_value": raw_scope_total, "fe_locked_value": raw_scope_total}}
        )
        project["total_value"] = raw_scope_total
    if anchor_value > 0:
        for stage in payment_stages:
            pct = stage.get("percentage")
            try:
                pct_f = float(pct) if pct not in (None, "") else None
            except Exception:
                pct_f = None
            already = stage.get("amount_received") or 0
            if pct_f is not None:
                new_amount = round((anchor_value * pct_f) / 100)
                if new_amount < already:
                    new_amount = already
                if abs((stage.get("amount") or 0) - new_amount) > 0.5:
                    stage["amount"] = new_amount
                    await db.payment_stages.update_one(
                        {"stage_id": stage["stage_id"]},
                        {"$set": {"amount": new_amount}}
                    )
            else:
                # No stored percentage — derive one from the existing amount.
                stage["percentage"] = round(((stage.get("amount") or 0) / anchor_value) * 100, 2)
    
    # Get income entries for this project (actual received payments)
    income_entries = await db.income.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for entry in income_entries:
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])

    # ── SELF-HEAL: amount_received must include the linked advance income ──
    # When CRE convert-deal creates Stage 01 with `linked_income_id` pointing at
    # the RE advance, that advance is sometimes NOT counted in the stage's
    # stored `amount_received` (older bulk-collect runs reset the counter).
    # Heal here so the Payment Schedule row never shows a phantom balance.
    EXCLUDED_INC = {"rejected", "accountant_rejected", "under_correction", "pending_approval", "cheque_bounced"}
    income_by_id = {e.get("income_id"): e for e in income_entries if e.get("income_id")}
    income_by_stage = {}
    for e in income_entries:
        psid = e.get("payment_stage_id")
        if psid and (e.get("status") or "approved") not in EXCLUDED_INC:
            income_by_stage.setdefault(psid, []).append(e)
    for stage in payment_stages:
        sid = stage.get("stage_id")
        linked_id = stage.get("linked_income_id")
        if not linked_id:
            continue
        adv_inc = income_by_id.get(linked_id)
        if not adv_inc:
            continue
        if (adv_inc.get("status") or "approved") in EXCLUDED_INC:
            continue
        # If advance already back-references this stage, it's already in the
        # by_stage sum — don't double count.
        already_linked = adv_inc.get("payment_stage_id") == sid
        attached_sum = sum((i.get("amount") or 0) for i in income_by_stage.get(sid, []))
        adv_amount = adv_inc.get("amount") or 0
        expected_min = attached_sum if already_linked else attached_sum + adv_amount
        stage_amt = stage.get("amount") or 0
        # Cap at stage amount so a tiny rounding overshoot doesn't show "over-collected".
        if expected_min > stage_amt + 0.5:
            expected_min = stage_amt
        current = stage.get("amount_received") or 0
        if expected_min - current > 0.5:
            new_recv = expected_min
            new_status = "paid" if new_recv >= stage_amt - 0.5 else ("partial" if new_recv > 0 else "pending")
            stage["amount_received"] = new_recv
            stage["status"] = new_status
            set_doc = {"amount_received": new_recv, "status": new_status}
            if new_status == "paid":
                set_doc["paid_at"] = stage.get("paid_at") or adv_inc.get("payment_date") or datetime.now(timezone.utc).isoformat()
            await db.payment_stages.update_one({"stage_id": sid}, {"$set": set_doc})
        # Also stamp back-ref on the advance income so Incomes(N) popup includes it.
        # Rescue BOTH orphan incomes (payment_stage_id=null) AND incomes pointing
        # to a dangling/deleted stage. The latter is the Mr Achyuth case: a
        # materialized advance stage was deleted but the income's pointer was
        # never updated, leaving it invisible to every downstream view.
        if not already_linked:
            current_psid = adv_inc.get("payment_stage_id")
            should_relink = False
            if current_psid in (None, "", False):
                should_relink = True
            else:
                # Check if current target still exists. If not, this income
                # is pointing to a deleted stage — rescue it.
                existing = await db.payment_stages.find_one(
                    {"stage_id": current_psid}, {"_id": 0, "stage_id": 1}
                )
                if not existing:
                    should_relink = True
            if should_relink:
                await db.income.update_one(
                    {"income_id": linked_id},
                    {"$set": {"payment_stage_id": sid}}
                )
                adv_inc["payment_stage_id"] = sid

    # Income summary by payment mode — APPROVED-only across the board so the
    # project header Total Income card stops counting rejected / under_correction
    # / pending entries. Rejected/under_correction rows still appear in
    # income_entries so the UI can render the per-row correction banner.
    EXCLUDED_INCOME_STATUSES = ["rejected", "accountant_rejected", "under_correction", "pending_approval", "cheque_bounced"]
    approved_income_entries = [
        e for e in income_entries
        if (e.get("status") or "approved") not in EXCLUDED_INCOME_STATUSES
    ]
    income_total = sum(e.get("amount", 0) for e in approved_income_entries)
    income_by_mode = {
        "cash": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "cash"),
        "cheque": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "cheque"),
        "bank_transfer": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "bank_transfer"),
        "escrow": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "escrow"),
        "petty_cash": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "petty_cash"),
    }
    
    # Payment schedule totals (requested payments - milestones)
    payment_total = sum(stage.get("amount", 0) for stage in payment_stages)
    payment_received = sum(stage.get("amount_received", 0) for stage in payment_stages)
    
    # Project value — gated by client approval just like scope_total.
    # Before client-approves the FE, the "Project Value Calculation" card shows ₹0.
    # After approval it falls back to the same anchor_value used by the schedule.
    project_value = anchor_value if fe_client_approved else 0
    project_value_pending = anchor_value if not fe_client_approved else 0
    
    # Total value = Project Value + Additions
    total_value = project_value + additions_total
    
    # Balance = Total Value - Income Received - Deductions
    balance = total_value - income_total - additions_received - deductions_total
    
    # Pre-Construction stages captured by CRE — embedded on the project doc
    # under `pre_construction.<stage_key>`. Normalize to the canonical 7 stages so
    # the UI always has a stable shape.
    pc_raw = project.get("pre_construction") or {}
    PC_STAGES = [
        {"key": "bhoomi_pooja",         "label": "Bhoomi Pooja"},
        {"key": "soil_test",            "label": "Soil Test"},
        {"key": "structural_approval",  "label": "Structural Approval"},
        {"key": "hut",                  "label": "Hut"},
        {"key": "borewell",             "label": "Borewell"},
        {"key": "agreement",            "label": "Agreement"},
        {"key": "eb_connection",        "label": "EB Connection"},
    ]
    pre_construction = []
    for s in PC_STAGES:
        st = pc_raw.get(s["key"]) or {}
        pre_construction.append({
            "key": s["key"],
            "label": s["label"],
            "status": st.get("status", "pending"),
            "scheduled_at": st.get("scheduled_at"),
            "completed_at": st.get("completed_at"),
            "notes": st.get("notes"),
        })

    # Feb 20 2026 — Aggregate Total Expense from the same 5 authoritative
    # sources as Cashbook, Project Board (/projects/{id}/expenses) and
    # Carry Forward. Without this the project header Financial Performance
    # strip showed ₹0 for projects like Mr Mohan - Sithalapakkam even when
    # ₹50,000 of approved labour expense existed in recorded_expenses.
    EXCLUDED_RE = ["rejected", "accountant_rejected", "accounts_rejected", "under_correction", "cheque_bounced"]
    MATERIAL_APPROVED = ["accounts_approved", "issued", "settled", "completed", "paid"]
    LABOUR_APPROVED = ["accounts_approved", "settled", "completed", "paid", "paid_full", "paid_partial", "accountant_approved"]
    # Feb 20 2026 — Strict accountant-approval rule (removed planning-only
    # "approved" status from material_requests).
    MR_APPROVED = ["accounts_approved", "approved_for_po", "po_issued", "in_transit", "received", "delivered", "paid", "issued", "completed", "settled"]
    DIRECT_APPROVED = ["accounts_approved", "paid", "completed", "acknowledged", "payment_done"]
    expense_total = 0.0
    async for r in db.recorded_expenses.aggregate([
        {"$match": {"project_id": project_id, "status": {"$nin": EXCLUDED_RE}}},
        {"$group": {"_id": None, "amt": {"$sum": "$amount"}}},
    ]):
        expense_total += float(r.get("amt") or 0)
    async for r in db.material_expenses.aggregate([
        {"$match": {"project_id": project_id, "status": {"$in": MATERIAL_APPROVED}}},
        {"$group": {"_id": None, "amt": {"$sum": {"$ifNull": ["$final_amount", "$amount"]}}}},
    ]):
        expense_total += float(r.get("amt") or 0)
    async for r in db.material_requests.aggregate([
        {"$match": {"project_id": project_id, "status": {"$in": MR_APPROVED}}},
        {"$group": {"_id": None, "amt": {"$sum": {"$ifNull": ["$total_amount", "$amount"]}}}},
    ]):
        expense_total += float(r.get("amt") or 0)
    async for r in db.labour_expenses.aggregate([
        {"$match": {"project_id": project_id, "status": {"$in": LABOUR_APPROVED}}},
        {"$group": {"_id": None, "amt": {"$sum": "$total_amount"}}},
    ]):
        expense_total += float(r.get("amt") or 0)
    async for r in db.direct_expenses.aggregate([
        {"$match": {"project_id": project_id, "$or": [
            {"status": {"$in": DIRECT_APPROVED}},
            {"status": {"$exists": False}},
            {"status": None},
        ]}},
        {"$unwind": "$items"},
        {"$group": {"_id": None, "amt": {"$sum": "$items.amount"}}},
    ]):
        expense_total += float(r.get("amt") or 0)

    # Feb 20 2026 — Roll Carry Forward Income & Expense into the project
    # header totals so the Financial Performance strip and Project Wise tab
    # always show the same ledger numbers (live + CF).
    cf_doc = await db.project_carry_forwards.find_one({"project_id": project_id}, {"_id": 0}) or {}
    cf_income = float(cf_doc.get("income_carry_forward") or 0) + float(cf_doc.get("income_adjustment") or 0)
    mat_cf = float(cf_doc.get("material_carry_forward") or 0)
    lab_cf = float(cf_doc.get("labour_carry_forward") or 0)
    pc_cf = float(cf_doc.get("petty_cash_carry_forward") or 0)
    ind_cf = float(cf_doc.get("indirect_carry_forward") or 0)
    cf_expense = mat_cf + lab_cf + pc_cf + ind_cf
    if cf_expense == 0:
        cf_expense = float(cf_doc.get("expense_carry_forward") or 0) + float(cf_doc.get("expense_adjustment") or 0)
    expense_total_with_cf = expense_total + cf_expense
    income_total_with_cf = income_total + cf_income

    return {
        "project": project,
        "scope_items": scope_items,
        "payment_stages": payment_stages,
        "additional_costs": additional_costs,
        "addition_sections": addition_sections,
        "additional_attachments": project.get("additional_attachments", []),
        "deductions": deductions,
        "deduction_sections": deduction_sections,
        "deduction_attachments": project.get("deduction_attachments", []),
        "income_entries": income_entries,
        "pre_construction": pre_construction,
        "summary": {
            "scope_total": scope_total,
            "scope_total_pending": raw_scope_total if not fe_client_approved else 0,
            "fe_client_approved": fe_client_approved,
            "project_value": project_value,
            "project_value_pending": project_value_pending,
            "additions_total": additions_total,
            "additions_received": additions_received,
            "total_value": total_value,
            "payment_schedule_total": payment_total,
            "payment_received": payment_received,
            # Feb 20 2026 — `income_total` now rolls CF Income in so the
            # project header Total Income matches the Project Wise tab.
            # `income_total_live` keeps the un-adjusted approved-income sum
            # for callers that need the raw ledger figure.
            "income_total": income_total_with_cf,
            "income_total_live": income_total,
            "cf_income": cf_income,
            "income_by_mode": income_by_mode,
            "deductions_total": deductions_total,
            "balance": balance,
            # Feb 20 2026 — authoritative Total Expense used by the project
            # header Financial Performance strip (reconciled with Cashbook /
            # Project Board / Carry Forward, AND includes CF Expense).
            "total_expense": expense_total_with_cf,
            "total_expense_live": expense_total,
            "cf_expense": cf_expense,
            "expenses_total": expense_total_with_cf,  # alias kept for legacy FE code
        }
    }


# ==================== EXPENSE MODULE ENDPOINTS ====================

# Pydantic models for request/response
class MaterialExpenseCreate(BaseModel):
    project_id: str
    material_name: str
    material_type: Optional[str] = None
    quantity: float
    unit: str = "units"
    required_date: str
    remarks: Optional[str] = None


class LabourExpenseCreate(BaseModel):
    project_id: str
    labour_type: str
    num_workers: int
    days_worked: float
    rate_per_day: float
    work_date: str
    remarks: Optional[str] = None


class VendorServiceExpenseCreate(BaseModel):
    project_id: str
    vendor_name: str
    vendor_id: Optional[str] = None
    service_type: str
    amount: float
    invoice_number: Optional[str] = None
    remarks: Optional[str] = None


class VendorQuoteInput(BaseModel):
    vendor_id: str
    vendor_name: str
    unit_price: float
    quantity: float


class ApprovalAction(BaseModel):
    action: str  # approved, rejected
    comments: Optional[str] = None


class PaymentInput(BaseModel):
    payment_type: str  # credit, advance, full
    amount: float = 0
    payment_mode: Optional[str] = None
    reference: Optional[str] = None


# Helper function to get expense from any collection
async def get_expense_by_id(expense_id: str):
    """Get expense from any collection based on prefix"""
    if expense_id.startswith("mexp_"):
        return await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "material_expenses"
    elif expense_id.startswith("lexp_"):
        return await db.labour_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "labour_expenses"
    elif expense_id.startswith("vexp_"):
        return await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "vendor_service_expenses"
    return None, None


# ==================== MATERIAL EXPENSE ENDPOINTS ====================

@router.get("/expenses/material")
async def get_material_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material expenses - filtered by role"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    # Role-based filtering
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    elif user.role == UserRole.PLANNING:
        query["status"] = {"$in": ["requested", "planning_approved", "planning_rejected"]}
    elif user.role == UserRole.PROCUREMENT:
        query["status"] = {"$in": ["planning_approved", "procurement_priced"]}
    elif user.role == UserRole.ACCOUNTANT:
        query["status"] = {"$in": ["procurement_priced", "accounts_approved", "accounts_rejected"]}
    
    expenses = await db.material_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get project names
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/material")
async def create_material_expense(expense_input: MaterialExpenseCreate, user: User = Depends(get_current_user)):
    """Create material expense request - Site Engineer only"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create material requests")
    
    expense = MaterialExpense(
        project_id=expense_input.project_id,
        material_name=expense_input.material_name,
        material_type=expense_input.material_type,
        quantity=expense_input.quantity,
        unit=expense_input.unit,
        required_date=datetime.fromisoformat(expense_input.required_date),
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name
    )
    
    expense_dict = expense.model_dump()
    expense_dict["required_date"] = expense_dict["required_date"].isoformat()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.material_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "material_expense", expense.expense_id, {
        "material_name": expense.material_name,
        "quantity": expense.quantity
    })
    
    # Create notification for Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New material request: {expense.material_name} for review")
    
    return expense


@router.patch("/expenses/material/{expense_id}/planning-approval")
async def planning_approve_material(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning department approval for material expense"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning department can approve")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "requested":
        raise HTTPException(status_code=400, detail="Expense is not in requested status")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    # Notify relevant parties
    if action.action == "approved":
        procurement_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(100)
        for pu in procurement_users:
            await create_notification(pu["user_id"], f"Material request approved for pricing: {expense['material_name']}")
    else:
        await create_notification(expense["requested_by"], f"Material request rejected: {expense['material_name']}")
    
    await create_audit_log(user.user_id, "approve", "material_expense", expense_id, {"action": action.action})
    
    return {"message": f"Material expense {action.action}"}


@router.patch("/expenses/material/{expense_id}/procurement-pricing")
async def procurement_price_material(expense_id: str, quotes: List[VendorQuoteInput], selected_vendor_id: str, user: User = Depends(get_current_user)):
    """Procurement adds vendor pricing"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can add pricing")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "planning_approved":
        raise HTTPException(status_code=400, detail="Expense must be planning approved first")
    
    vendor_quotes = []
    final_amount = 0
    
    for q in quotes:
        total_price = q.unit_price * q.quantity
        vendor_quotes.append({
            "vendor_id": q.vendor_id,
            "vendor_name": q.vendor_name,
            "unit_price": q.unit_price,
            "quantity": q.quantity,
            "total_price": total_price,
            "is_selected": q.vendor_id == selected_vendor_id
        })
        if q.vendor_id == selected_vendor_id:
            final_amount = total_price
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "procurement",
        "action": "priced",
        "comments": f"Selected vendor: {selected_vendor_id}, Amount: {final_amount}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {
                "status": "procurement_priced",
                "vendor_quotes": vendor_quotes,
                "selected_vendor_id": selected_vendor_id,
                "final_amount": final_amount,
                "balance": final_amount,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"approvals": approval}
        }
    )
    
    # Notify Accounts
    accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
    for au in accounts_users:
        await create_notification(au["user_id"], f"Material expense ready for approval: {expense['material_name']} - ₹{final_amount}")
    
    await create_audit_log(user.user_id, "price", "material_expense", expense_id, {"final_amount": final_amount})
    
    return {"message": "Pricing added", "final_amount": final_amount}


@router.patch("/expenses/material/{expense_id}/accounts-approval")
async def accounts_approve_material(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts department final approval"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can give final approval")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "procurement_priced":
        raise HTTPException(status_code=400, detail="Expense must have procurement pricing first")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    # Notify
    if action.action == "approved":
        await create_notification(expense["requested_by"], f"Material expense approved for payment: {expense['material_name']}")
    else:
        await create_notification(expense["requested_by"], f"Material expense rejected by accounts: {expense['material_name']}")
    
    await create_audit_log(user.user_id, "accounts_approve", "material_expense", expense_id, {"action": action.action})
    
    return {"message": f"Material expense {action.action}"}


# ==================== LABOUR EXPENSE ENDPOINTS ====================

@router.get("/expenses/labour")
async def get_labour_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get labour expenses"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    # Role-based filtering
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    elif user.role == UserRole.PLANNING:
        query["status"] = {"$in": ["requested", "planning_approved", "planning_rejected"]}
    elif user.role == UserRole.ACCOUNTANT:
        query["status"] = {"$in": ["planning_approved", "accounts_approved", "accounts_rejected"]}
    
    expenses = await db.labour_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get project names
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/labour")
async def create_labour_expense(expense_input: LabourExpenseCreate, user: User = Depends(get_current_user)):
    """Create labour expense - Site Engineer"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create labour expenses")
    
    total_amount = expense_input.num_workers * expense_input.days_worked * expense_input.rate_per_day
    
    expense = LabourExpense(
        project_id=expense_input.project_id,
        labour_type=expense_input.labour_type,
        num_workers=expense_input.num_workers,
        days_worked=expense_input.days_worked,
        rate_per_day=expense_input.rate_per_day,
        total_amount=total_amount,
        work_date=datetime.fromisoformat(expense_input.work_date),
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name,
        balance=total_amount
    )
    
    expense_dict = expense.model_dump()
    expense_dict["work_date"] = expense_dict["work_date"].isoformat()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.labour_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "labour_expense", expense.expense_id, {
        "labour_type": expense.labour_type,
        "total_amount": total_amount
    })
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New labour expense: {expense.labour_type} - ₹{total_amount}")
    
    return expense


@router.patch("/expenses/labour/{expense_id}/planning-approval")
async def planning_approve_labour(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning approval for labour expense"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can approve")
    
    expense = await db.labour_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.labour_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    if action.action == "approved":
        accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
        for au in accounts_users:
            await create_notification(au["user_id"], f"Labour expense for approval: {expense['labour_type']}")
    
    return {"message": f"Labour expense {action.action}"}


@router.patch("/expenses/labour/{expense_id}/accounts-approval")
async def accounts_approve_labour(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts approval for labour expense"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve")
    
    expense = await db.labour_expenses.find_one(
        {"$or": [{"labour_expense_id": expense_id}, {"expense_id": expense_id}]}, {"_id": 0}
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    id_field = "labour_expense_id" if expense.get("labour_expense_id") else "expense_id"
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.labour_expenses.update_one(
        {id_field: expense.get(id_field)},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    await create_notification(expense["requested_by"], f"Labour expense {action.action}: {expense.get('labour_type', 'Labour')}")
    
    return {"message": f"Labour expense {action.action}"}


# ==================== VENDOR SERVICE EXPENSE ENDPOINTS ====================

@router.get("/expenses/vendor-service")
async def get_vendor_service_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get vendor/service expenses"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    
    expenses = await db.vendor_service_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/vendor-service")
async def create_vendor_service_expense(expense_input: VendorServiceExpenseCreate, user: User = Depends(get_current_user)):
    """Create vendor/service expense"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = VendorServiceExpense(
        project_id=expense_input.project_id,
        vendor_name=expense_input.vendor_name,
        vendor_id=expense_input.vendor_id,
        service_type=expense_input.service_type,
        amount=expense_input.amount,
        invoice_number=expense_input.invoice_number,
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name,
        balance=expense_input.amount
    )
    
    expense_dict = expense.model_dump()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.vendor_service_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "vendor_service_expense", expense.expense_id, {
        "vendor_name": expense.vendor_name,
        "amount": expense.amount
    })
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New vendor expense: {expense.vendor_name} - ₹{expense.amount}")
    
    return expense


@router.patch("/expenses/vendor-service/{expense_id}/planning-approval")
async def planning_approve_vendor_service(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning approval for vendor/service expense"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can approve")
    
    expense = await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.vendor_service_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    if action.action == "approved":
        accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
        for au in accounts_users:
            await create_notification(au["user_id"], f"Vendor expense for approval: {expense['vendor_name']}")
    
    return {"message": f"Vendor expense {action.action}"}


@router.patch("/expenses/vendor-service/{expense_id}/accounts-approval")
async def accounts_approve_vendor_service(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts approval for vendor/service expense"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve")
    
    expense = await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.vendor_service_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    await create_notification(expense["requested_by"], f"Vendor expense {action.action}: {expense['vendor_name']}")
    
    return {"message": f"Vendor expense {action.action}"}


# ==================== PAYMENT RECORDING FOR EXPENSES ====================

@router.patch("/expenses/{expense_id}/payment")
async def record_expense_payment(expense_id: str, payment_input: PaymentInput, user: User = Depends(get_current_user)):
    """Record payment for any expense type"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can record payments")
    
    expense, collection_name = await get_expense_by_id(expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") not in ["accounts_approved", "super_admin_approved"]:
        raise HTTPException(status_code=400, detail="Expense must be approved first")
    
    payment = {
        "payment_id": f"epay_{uuid.uuid4().hex[:12]}",
        "payment_type": payment_input.payment_type,
        "amount": payment_input.amount,
        "payment_date": datetime.now(timezone.utc).isoformat(),
        "payment_mode": payment_input.payment_mode,
        "reference": payment_input.reference,
        "recorded_by": user.user_id
    }
    
    # Calculate new totals
    final_amount = expense.get("final_amount") or expense.get("total_amount") or expense.get("amount", 0)
    current_paid = expense.get("total_paid", 0)
    
    if payment_input.payment_type == "credit":
        new_paid = current_paid
        new_balance = final_amount - current_paid
        payment_status = "credit"
    elif payment_input.payment_type == "advance":
        new_paid = current_paid + payment_input.amount
        new_balance = final_amount - new_paid
        payment_status = "partial" if new_balance > 0 else "paid"
    else:  # full
        new_paid = final_amount
        new_balance = 0
        payment_status = "paid"
        payment["amount"] = final_amount - current_paid
    
    update_data = {
        "payment_type": payment_input.payment_type,
        "payment_status": payment_status,
        "total_paid": new_paid,
        "balance": new_balance,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if payment_status == "paid":
        update_data["status"] = "completed"
    
    await db[collection_name].update_one(
        {"expense_id": expense_id},
        {
            "$set": update_data,
            "$push": {"payments": payment}
        }
    )
    
    # Update project expense total
    project_id = expense.get("project_id")
    if project_id and payment_input.amount > 0:
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project:
            current_expense = project.get("total_expense", 0)
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"total_expense": current_expense + payment_input.amount}}
            )
    
    await create_audit_log(user.user_id, "payment", collection_name.replace("_expenses", "_expense"), expense_id, {
        "payment_type": payment_input.payment_type,
        "amount": payment_input.amount
    })
    
    return {"message": "Payment recorded", "payment_status": payment_status, "balance": new_balance}


# ==================== EXPENSE SUMMARY ENDPOINTS ====================

@router.get("/expenses/summary")
async def get_expense_summary(user: User = Depends(get_current_user)):
    """Get overall expense summary"""
    material_expenses = await db.material_expenses.find({}, {"_id": 0}).to_list(10000)
    labour_expenses = await db.labour_expenses.find({}, {"_id": 0}).to_list(10000)
    vendor_expenses = await db.vendor_service_expenses.find({}, {"_id": 0}).to_list(10000)
    
    def sum_expenses(expenses, amount_field):
        return sum(e.get(amount_field, 0) for e in expenses)
    
    def sum_paid(expenses):
        return sum(e.get("total_paid", 0) for e in expenses)
    
    def count_by_status(expenses, status):
        return len([e for e in expenses if e.get("status") == status])
    
    return {
        "material": {
            "count": len(material_expenses),
            "total_amount": sum_expenses(material_expenses, "final_amount"),
            "total_paid": sum_paid(material_expenses),
            "pending_approval": count_by_status(material_expenses, "requested") + count_by_status(material_expenses, "planning_approved") + count_by_status(material_expenses, "procurement_priced"),
            "approved": count_by_status(material_expenses, "accounts_approved"),
            "completed": count_by_status(material_expenses, "completed")
        },
        "labour": {
            "count": len(labour_expenses),
            "total_amount": sum_expenses(labour_expenses, "total_amount"),
            "total_paid": sum_paid(labour_expenses),
            "pending_approval": count_by_status(labour_expenses, "requested") + count_by_status(labour_expenses, "planning_approved"),
            "approved": count_by_status(labour_expenses, "accounts_approved"),
            "completed": count_by_status(labour_expenses, "completed")
        },
        "vendor_service": {
            "count": len(vendor_expenses),
            "total_amount": sum_expenses(vendor_expenses, "amount"),
            "total_paid": sum_paid(vendor_expenses),
            "pending_approval": count_by_status(vendor_expenses, "requested") + count_by_status(vendor_expenses, "planning_approved"),
            "approved": count_by_status(vendor_expenses, "accounts_approved"),
            "completed": count_by_status(vendor_expenses, "completed")
        },
        "totals": {
            "total_expenses": sum_expenses(material_expenses, "final_amount") + sum_expenses(labour_expenses, "total_amount") + sum_expenses(vendor_expenses, "amount"),
            "total_paid": sum_paid(material_expenses) + sum_paid(labour_expenses) + sum_paid(vendor_expenses),
            "total_credit": sum(e.get("balance", 0) for e in material_expenses + labour_expenses + vendor_expenses if e.get("payment_status") == "credit")
        }
    }


@router.get("/expenses/pending-approvals")
async def get_pending_expense_approvals(user: User = Depends(get_current_user)):
    """Get pending expense approvals based on user role"""
    result = {
        "material": [],
        "labour": [],
        "vendor_service": []
    }
    
    if user.role == UserRole.PLANNING or user.role == UserRole.SUPER_ADMIN:
        result["material"] = await db.material_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
        result["labour"] = await db.labour_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
        result["vendor_service"] = await db.vendor_service_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
    
    if user.role == UserRole.PROCUREMENT or user.role == UserRole.SUPER_ADMIN:
        result["material"].extend(await db.material_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
    
    if user.role == UserRole.ACCOUNTANT or user.role == UserRole.SUPER_ADMIN:
        result["material"].extend(await db.material_expenses.find({"status": "procurement_priced"}, {"_id": 0}).to_list(100))
        result["labour"].extend(await db.labour_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
        result["vendor_service"].extend(await db.vendor_service_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
    
    # Add project names
    all_expenses = result["material"] + result["labour"] + result["vendor_service"]
    project_ids = list(set(e.get("project_id") for e in all_expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp_list in [result["material"], result["labour"], result["vendor_service"]]:
        for exp in exp_list:
            exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return result


@router.get("/projects/{project_id}/expenses")
async def get_project_expenses(project_id: str, user: User = Depends(get_current_user)):
    """Get all expenses for a project.

    Feb 19 2026 — `total_expenses` / `total_paid` now read from the same
    sources the Cashbook (and Project-Wise view) trust:
      • `recorded_expenses` (status != rejected / cheque_bounced / under_correction)
      • `labour_expenses` (accounts_approved / paid)
      • `material_requests` (approved / paid)
    Feb 20 2026 — Added `material_expenses` (paid legacy POs) and
    `direct_expenses` (petty cash issued items) so Project Board, Cashbook
    and Carry Forward all reconcile to the same Total Expense.
    The per-section arrays still come from the legacy collections for
    backward-compat with the breakdown tables.
    """
    material = await db.material_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    labour = await db.labour_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    vendor = await db.vendor_service_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)

    # Legacy per-section totals (kept for backward compat with the
    # material/labour/vendor breakdown UIs).
    material_total = sum(e.get("final_amount", 0) for e in material)
    labour_total = sum(e.get("total_amount", 0) for e in labour)
    vendor_total = sum(e.get("amount", 0) for e in vendor)
    material_paid = sum(e.get("total_paid", 0) for e in material)
    labour_paid = sum(e.get("total_paid", 0) for e in labour)
    vendor_paid = sum(e.get("total_paid", 0) for e in vendor)

    # Authoritative project-wide totals — same sources as Cashbook + CF.
    # Feb 20 2026 — Strict accountant-approval rule: removed planning-only
    # "approved" status from material_requests, and gated direct_expenses by
    # accountant-approval status (legacy docs without status still counted).
    EXCLUDED_STATUSES = ["rejected", "accountant_rejected", "accounts_rejected", "under_correction", "cheque_bounced"]
    re_pipeline = [
        {"$match": {"project_id": project_id, "status": {"$nin": EXCLUDED_STATUSES}}},
        {"$group": {"_id": None, "amt": {"$sum": "$amount"}, "paid": {"$sum": {"$ifNull": ["$paid_amount", "$amount"]}}}},
    ]
    le_pipeline = [
        {"$match": {"project_id": project_id, "status": {"$in": ["accounts_approved", "paid", "paid_full", "paid_partial", "settled", "completed", "accountant_approved"]}}},
        {"$group": {"_id": None, "amt": {"$sum": "$total_amount"}, "paid": {"$sum": {"$ifNull": ["$paid_amount", 0]}}}},
    ]
    mr_pipeline = [
        {"$match": {"project_id": project_id, "status": {"$in": ["accounts_approved", "approved_for_po", "po_issued", "in_transit", "received", "delivered", "paid", "issued", "completed", "settled"]}}},
        {"$group": {"_id": None, "amt": {"$sum": {"$ifNull": ["$total_amount", "$amount"]}}, "paid": {"$sum": {"$ifNull": ["$paid_amount", 0]}}}},
    ]
    # Legacy material_expenses paid POs.
    mx_pipeline = [
        {"$match": {"project_id": project_id, "status": {"$in": ["accounts_approved", "issued", "settled", "completed", "paid"]}}},
        {"$group": {"_id": None, "amt": {"$sum": {"$ifNull": ["$final_amount", "$amount"]}}, "paid": {"$sum": {"$ifNull": ["$total_paid", "$final_amount"]}}}},
    ]
    # Petty cash issued items — only accountant-approved docs (or legacy
    # docs without a status field).
    de_pipeline = [
        {"$match": {"project_id": project_id, "$or": [
            {"status": {"$in": ["accounts_approved", "paid", "completed", "acknowledged", "payment_done"]}},
            {"status": {"$exists": False}},
            {"status": None},
        ]}},
        {"$unwind": "$items"},
        {"$group": {"_id": None, "amt": {"$sum": "$items.amount"}}},
    ]
    re_doc = (await db.recorded_expenses.aggregate(re_pipeline).to_list(1)) or [{}]
    le_doc = (await db.labour_expenses.aggregate(le_pipeline).to_list(1)) or [{}]
    mr_doc = (await db.material_requests.aggregate(mr_pipeline).to_list(1)) or [{}]
    mx_doc = (await db.material_expenses.aggregate(mx_pipeline).to_list(1)) or [{}]
    de_doc = (await db.direct_expenses.aggregate(de_pipeline).to_list(1)) or [{}]
    cb_total = float(
        (re_doc[0].get("amt") or 0)
        + (le_doc[0].get("amt") or 0)
        + (mr_doc[0].get("amt") or 0)
        + (mx_doc[0].get("amt") or 0)
        + (de_doc[0].get("amt") or 0)
    )
    cb_paid = float(
        (re_doc[0].get("paid") or 0)
        + (le_doc[0].get("paid") or 0)
        + (mr_doc[0].get("paid") or 0)
        + (mx_doc[0].get("paid") or 0)
        + (de_doc[0].get("amt") or 0)
    )

    return {
        "material": material,
        "labour": labour,
        "vendor_service": vendor,
        "summary": {
            "material_total": material_total,
            "material_paid": material_paid,
            "labour_total": labour_total,
            "labour_paid": labour_paid,
            "vendor_total": vendor_total,
            "vendor_paid": vendor_paid,
            "total_expenses": cb_total,
            "total_paid": cb_paid,
            "total_balance": cb_total - cb_paid,
        }
    }


# ==================== COMPANY SETTINGS ENDPOINTS ====================

class CompanySettingsCreate(BaseModel):
    company_name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: str = "INR"
    financial_year_start: str = "April"
    indirect_cost_percent: Optional[float] = 20.0


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: Optional[str] = None
    financial_year_start: Optional[str] = None
    indirect_cost_percent: Optional[float] = None


@router.get("/settings/company")
async def get_company_settings(user: User = Depends(get_current_user)):
    """Get company settings (creates default if not exists)"""
    settings = await db.company_settings.find_one({}, {"_id": 0})
    if not settings:
        # Return default settings
        return {
            "settings_id": None,
            "company_name": "ConstructionOS",
            "logo_url": None,
            "address": "",
            "contact_number": "",
            "email": "",
            "gst_number": "",
            "default_currency": "INR",
            "financial_year_start": "April",
            "indirect_cost_percent": 20.0
        }
    # Ensure indirect_cost_percent is always present
    if "indirect_cost_percent" not in settings:
        settings["indirect_cost_percent"] = 20.0
    return settings



@router.get("/settings/workflow")
async def get_workflow_settings(user: User = Depends(get_current_user)):
    """Read the Super Architect's workflow toggles.

    Right now exposes a single toggle — `wo_stage_flow` — controlling whether
    Site Engineers can request stage open or whether Planning must unlock
    stages directly. Always returns a sensible default so the UI never
    crashes on a fresh tenant.
    """
    row = await db.app_workflow_settings.find_one({"_id": "global"}, {"_id": 0})
    return row or {"wo_stage_flow": "planning_open"}


@router.patch("/settings/workflow")
async def update_workflow_settings(payload: dict, user: User = Depends(get_current_user)):
    """Persist a workflow toggle. Restricted to Super Admin and Super
    Architect — the two roles that own platform-wide flow decisions.

    Adds a password-confirmation gate so an accidental toggle from an
    already-authenticated session can't flip the whole flow silently. The
    UI surfaces a password dialog before sending the PATCH.
    """
    role_val = getattr(user.role, 'value', user.role)
    if role_val not in ("super_admin", "super_architect"):
        raise HTTPException(status_code=403, detail="Only Super Admin / Super Architect can change workflow")
    flow = payload.get("wo_stage_flow")
    if flow not in ("se_request", "planning_open"):
        raise HTTPException(status_code=400, detail="wo_stage_flow must be 'se_request' or 'planning_open'")

    # Password confirmation gate — verify the caller's password against the
    # stored hash before persisting any flow change.
    password = (payload.get("password") or "").strip()
    if not password:
        raise HTTPException(status_code=401, detail="Password required to change workflow")
    me = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 1})
    stored_hash = (me or {}).get("password_hash")
    from routes.auth import verify_password  # local import avoids circular
    if not stored_hash or not verify_password(password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    await db.app_workflow_settings.update_one(
        {"_id": "global"},
        {"$set": {"wo_stage_flow": flow, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.user_id}},
        upsert=True,
    )
    return {"wo_stage_flow": flow}


@router.get("/settings/dlr-date-mode")
async def get_dlr_date_mode(user: User = Depends(get_current_user)):
    """Global DLR Date Module — controls whether Site Engineers can only
    record DLR for today ("ontime") or can pick any date provided they
    enter a remark explaining the back-date ("custom"). Defaults to "ontime".
    """
    doc = await db.module_settings.find_one({"module": "dlr_date"}, {"_id": 0}) or {}
    mode = doc.get("mode")
    if mode not in ("ontime", "custom"):
        mode = "ontime"
    return {"mode": mode}


@router.patch("/settings/dlr-date-mode")
async def update_dlr_date_mode(payload: dict, user: User = Depends(get_current_user)):
    """Persist the DLR Date Module mode. Restricted to Super Admin / Super
    Architect. Password gate prevents accidental flips from an authenticated session.
    """
    role_val = getattr(user.role, 'value', user.role)
    if role_val not in ("super_admin", "super_architect"):
        raise HTTPException(status_code=403, detail="Only Super Admin / Super Architect can change DLR mode")
    mode = (payload.get("mode") or "").strip()
    if mode not in ("ontime", "custom"):
        raise HTTPException(status_code=400, detail="mode must be 'ontime' or 'custom'")

    password = (payload.get("password") or "").strip()
    if not password:
        raise HTTPException(status_code=401, detail="Password required to change DLR mode")
    me = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 1})
    stored_hash = (me or {}).get("password_hash")
    from routes.auth import verify_password
    if not stored_hash or not verify_password(password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    await db.module_settings.update_one(
        {"module": "dlr_date"},
        {"$set": {"mode": mode, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.user_id}},
        upsert=True,
    )
    return {"mode": mode}



@router.get("/settings/cre-module")
async def get_cre_module_settings(user: User = Depends(get_current_user)):
    doc = await db.module_settings.find_one({"module": "cre"}, {"_id": 0}) or {}
    return {
        "show_all_projects_tab": bool(doc.get("show_all_projects_tab", False)),
        "show_income_tab": bool(doc.get("show_income_tab", False)),
    }


class CREModuleSettings(BaseModel):
    show_all_projects_tab: bool
    show_income_tab: bool


@router.patch("/settings/cre-module")
async def update_cre_module_settings(payload: CREModuleSettings, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update module settings")
    await db.module_settings.update_one(
        {"module": "cre"},
        {"$set": {
            "module": "cre",
            "show_all_projects_tab": payload.show_all_projects_tab,
            "show_income_tab": payload.show_income_tab,
            "updated_by": user.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "CRE module settings updated", **payload.model_dump()}


@router.post("/settings/company")
async def create_or_update_company_settings(
    settings_input: CompanySettingsCreate,
    user: User = Depends(get_current_user)
):
    """Create or update company settings (only Super Admin)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update company settings")
    
    existing = await db.company_settings.find_one({}, {"_id": 0})
    
    if existing:
        # Update existing
        update_data = settings_input.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.company_settings.update_one({}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "company_settings", existing.get("settings_id", ""), update_data)
        updated = await db.company_settings.find_one({}, {"_id": 0})
        return updated
    else:
        # Create new
        settings = CompanySettings(**settings_input.model_dump())
        settings_dict = settings.model_dump()
        settings_dict["created_at"] = settings_dict["created_at"].isoformat()
        settings_dict["updated_at"] = settings_dict["updated_at"].isoformat()
        await db.company_settings.insert_one(settings_dict)
        await create_audit_log(user.user_id, "create", "company_settings", settings.settings_id, {"company_name": settings.company_name})
        # Remove _id if MongoDB added it
        settings_dict.pop("_id", None)
        return settings_dict


@router.patch("/settings/company")
async def patch_company_settings(
    settings_input: CompanySettingsUpdate,
    user: User = Depends(get_current_user)
):
    """Partially update company settings"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update company settings")
    
    existing = await db.company_settings.find_one({}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Company settings not found. Create settings first.")
    
    update_data = {k: v for k, v in settings_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.company_settings.update_one({}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "company_settings", existing.get("settings_id", ""), update_data)
    
    return await db.company_settings.find_one({}, {"_id": 0})


# ==================== MATERIAL MANAGEMENT ENDPOINTS ====================

class MaterialCreate(BaseModel):
    name: str
    category: str  # MaterialCategory enum value
    unit: str
    description: Optional[str] = None
    hsn_code: Optional[str] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    hsn_code: Optional[str] = None
    standard_rate: Optional[float] = None
    is_active: Optional[bool] = None


@router.get("/materials")
async def get_materials(
    category: Optional[str] = None,
    active_only: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all materials with optional filters"""
    query = {}
    if category:
        query["category"] = category
    if active_only:
        query["is_active"] = True
    
    materials = await db.materials.find(query, {"_id": 0}).to_list(10000)
    for mat in materials:
        if isinstance(mat.get("created_at"), str):
            mat["created_at"] = datetime.fromisoformat(mat["created_at"])
        if isinstance(mat.get("updated_at"), str):
            mat["updated_at"] = datetime.fromisoformat(mat["updated_at"])
    return materials


@router.get("/materials/categories")
async def get_material_categories(user: User = Depends(get_current_user)):
    """Get all material categories"""
    return [{"value": cat.value, "label": cat.value.replace("_", " ").title()} for cat in MaterialCategory]


@router.get("/materials/{material_id}")
async def get_material(material_id: str, user: User = Depends(get_current_user)):
    """Get a specific material"""
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.post("/materials")
async def create_material(
    material_input: MaterialCreate,
    user: User = Depends(get_current_user)
):
    """Create a new material (Planning, Procurement, Super Admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for duplicate name
    existing = await db.materials.find_one({"name": {"$regex": f"^{material_input.name}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Material with this name already exists")
    
    material = Material(
        name=material_input.name,
        category=MaterialCategory(material_input.category),
        unit=material_input.unit,
        description=material_input.description,
        hsn_code=material_input.hsn_code,
        created_by=user.user_id
    )
    
    mat_dict = material.model_dump()
    mat_dict["category"] = mat_dict["category"].value
    mat_dict["created_at"] = mat_dict["created_at"].isoformat()
    mat_dict["updated_at"] = mat_dict["updated_at"].isoformat()
    
    await db.materials.insert_one(mat_dict)
    await create_audit_log(user.user_id, "create", "material", material.material_id, {"name": material.name})
    
    # Remove _id if MongoDB added it
    mat_dict.pop("_id", None)
    return mat_dict


@router.patch("/materials/{material_id}")
async def update_material(
    material_id: str,
    material_input: MaterialUpdate,
    user: User = Depends(get_current_user)
):
    """Update a material"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    update_data = {k: v for k, v in material_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.materials.update_one({"material_id": material_id}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "material", material_id, update_data)
    
    return await db.materials.find_one({"material_id": material_id}, {"_id": 0})


@router.delete("/materials/{material_id}")
async def delete_material(material_id: str, user: User = Depends(get_current_user)):
    """Soft delete a material (set is_active to false)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    await db.materials.update_one(
        {"material_id": material_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_audit_log(user.user_id, "delete", "material", material_id, {})
    
    return {"message": "Material deleted"}


# ==================== VENDOR MASTER ENDPOINTS ====================

class VendorMasterCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    vendor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    brands: List[dict] = []
    payment_cycle: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
    materials_supplied: List[str] = []
    payment_terms: str = "full"
    credit_limit: float = 0
    credit_days: int = 0


class VendorMasterUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    vendor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    brands: Optional[List[dict]] = None
    payment_cycle: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
    materials_supplied: Optional[List[str]] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/vendor-master")
async def get_vendor_master_list(
    active_only: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all vendors from master list"""
    # IDOR Fix: Only procurement/management roles can access vendor master
    vendor_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
        UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER
    ]
    if user.role not in vendor_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    query = {}
    if active_only:
        query["is_active"] = True
    
    vendors = await db.vendor_master.find(query, {"_id": 0}).to_list(10000)
    for v in vendors:
        if isinstance(v.get("created_at"), str):
            v["created_at"] = datetime.fromisoformat(v["created_at"])
        if isinstance(v.get("updated_at"), str):
            v["updated_at"] = datetime.fromisoformat(v["updated_at"])
    return vendors


@router.get("/vendor-master/{vendor_id}")
async def get_vendor_master(vendor_id: str, user: User = Depends(get_current_user)):
    """Get a specific vendor from master"""
    # IDOR Fix: Only procurement/management roles can access vendor details
    vendor_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
        UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER
    ]
    if user.role not in vendor_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@router.post("/vendor-master")
async def create_vendor_master(
    vendor_input: VendorMasterCreate,
    user: User = Depends(get_current_user)
):
    """Create a new vendor in master (Procurement, Planning, Super Admin)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = VendorMaster(
        name=vendor_input.name,
        contact_person=vendor_input.contact_person,
        phone=vendor_input.phone,
        email=vendor_input.email,
        address=vendor_input.address,
        vendor_type=vendor_input.vendor_type,
        bank_name=vendor_input.bank_name,
        account_number=vendor_input.account_number,
        ifsc_code=vendor_input.ifsc_code,
        upi_id=vendor_input.upi_id,
        brands=vendor_input.brands,
        payment_cycle=vendor_input.payment_cycle,
        gst_number=vendor_input.gst_number,
        gst_type=vendor_input.gst_type,
        materials_supplied=vendor_input.materials_supplied,
        payment_terms=vendor_input.payment_terms,
        credit_limit=vendor_input.credit_limit,
        credit_days=vendor_input.credit_days,
        created_by=user.user_id
    )
    
    vend_dict = vendor.model_dump()
    vend_dict["created_at"] = vend_dict["created_at"].isoformat()
    vend_dict["updated_at"] = vend_dict["updated_at"].isoformat()
    
    await db.vendor_master.insert_one(vend_dict)
    await create_audit_log(user.user_id, "create", "vendor_master", vendor.vendor_id, {"name": vendor.name})
    
    # Remove _id if MongoDB added it
    vend_dict.pop("_id", None)
    return vend_dict


@router.patch("/vendor-master/{vendor_id}")
async def update_vendor_master(
    vendor_id: str,
    vendor_input: VendorMasterUpdate,
    user: User = Depends(get_current_user)
):
    """Update a vendor in master"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    update_data = {k: v for k, v in vendor_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.vendor_master.update_one({"vendor_id": vendor_id}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "vendor_master", vendor_id, update_data)
    
    return await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})


@router.delete("/vendor-master/{vendor_id}")
async def delete_vendor_master(vendor_id: str, user: User = Depends(get_current_user)):
    """Soft delete a vendor (set is_active to false)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    await db.vendor_master.update_one(
        {"vendor_id": vendor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_audit_log(user.user_id, "delete", "vendor_master", vendor_id, {})
    
    return {"message": "Vendor deleted"}



# ==================== VENDOR CATEGORIES ====================

@router.get("/vendor-categories")
async def get_vendor_categories(user: User = Depends(get_current_user)):
    """Get all vendor categories"""
    cats = await db.vendor_categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return cats


@router.post("/vendor-categories")
async def create_vendor_category(data: dict, user: User = Depends(get_current_user)):
    """Create a new vendor category - any authorized user can add"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    existing = await db.vendor_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {
        "category_id": f"vcat_{uuid.uuid4().hex[:8]}",
        "name": name,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vendor_categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


# ==================== VENDOR DETAIL / SUMMARY ====================

@router.get("/vendor-master/{vendor_id}/summary")
async def get_vendor_summary(vendor_id: str, user: User = Depends(get_current_user)):
    """Get vendor summary: orders, payments, projects"""
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Get purchase orders for this vendor
    orders = await db.purchase_orders.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Get project assignments
    assignments = await db.project_vendor_assignments.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).to_list(500)

    # Calculate totals
    total_orders = len(orders)
    total_order_value = sum(o.get("total_amount", 0) for o in orders)
    paid_amount = sum(o.get("paid_amount", 0) for o in orders)
    pending_amount = total_order_value - paid_amount

    # Get unique project IDs
    project_ids = list(set(
        [o.get("project_id") for o in orders if o.get("project_id")] +
        [a.get("project_id") for a in assignments if a.get("project_id")]
    ))
    projects = []
    if project_ids:
        projects = await db.projects.find(
            {"project_id": {"$in": project_ids}},
            {"_id": 0, "project_id": 1, "name": 1, "client_name": 1}
        ).to_list(500)

    return {
        "vendor": vendor,
        "orders": orders,
        "assignments": assignments,
        "projects": projects,
        "stats": {
            "total_orders": total_orders,
            "total_order_value": total_order_value,
            "paid_amount": paid_amount,
            "pending_amount": pending_amount,
            "project_count": len(project_ids)
        }
    }


# ==================== PROJECT VENDOR ASSIGNMENTS ====================

@router.get("/projects/{project_id}/vendor-assignments")
async def get_project_vendor_assignments(project_id: str, user: User = Depends(get_current_user)):
    """Get vendor assignments for a project"""
    assignments = await db.project_vendor_assignments.find(
        {"project_id": project_id}, {"_id": 0}
    ).to_list(500)
    return assignments


@router.post("/projects/{project_id}/vendor-assignments")
async def assign_vendor_to_project(project_id: str, data: dict, user: User = Depends(get_current_user)):
    """Assign a vendor to a project for a specific material category"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "project_id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    vendor_id = data.get("vendor_id")
    category = data.get("category")
    brand = data.get("brand", "")

    if not vendor_id or not category:
        raise HTTPException(status_code=400, detail="vendor_id and category required")

    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0, "vendor_id": 1, "name": 1})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Upsert assignment
    assignment_id = f"pva_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.project_vendor_assignments.find_one({
        "project_id": project_id, "category": category
    })

    if existing:
        await db.project_vendor_assignments.update_one(
            {"project_id": project_id, "category": category},
            {"$set": {
                "vendor_id": vendor_id,
                "vendor_name": vendor["name"],
                "brand": brand,
                "updated_by": user.user_id,
                "updated_at": now
            }}
        )
        return {"message": "Assignment updated"}
    else:
        assignment = {
            "assignment_id": assignment_id,
            "project_id": project_id,
            "project_name": project.get("name", ""),
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "category": category,
            "brand": brand,
            "created_by": user.user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.project_vendor_assignments.insert_one(assignment)
        assignment.pop("_id", None)
        return assignment


@router.delete("/projects/{project_id}/vendor-assignments/{category}")
async def remove_vendor_assignment(project_id: str, category: str, user: User = Depends(get_current_user)):
    """Remove a vendor assignment from a project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.project_vendor_assignments.delete_one({"project_id": project_id, "category": category})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment removed"}


# ==================== PURCHASE ORDERS ====================

@router.get("/purchase-orders")
async def get_purchase_orders(
    project_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get purchase orders with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {}
    if project_id:
        query["project_id"] = project_id
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@router.post("/purchase-orders")
async def create_purchase_order(data: dict, user: User = Depends(get_current_user)):
    """Create a purchase order (usually auto-created from approved material request)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    po = {
        "po_id": f"po_{uuid.uuid4().hex[:8]}",
        "project_id": data.get("project_id"),
        "project_name": data.get("project_name", ""),
        "vendor_id": data.get("vendor_id"),
        "vendor_name": data.get("vendor_name", ""),
        "material_request_id": data.get("material_request_id"),
        "items": data.get("items", []),
        "total_amount": data.get("total_amount", 0),
        "paid_amount": 0,
        "status": "pending",  # pending, approved, dispatched, delivered, cancelled
        "payment_status": "unpaid",  # unpaid, partial, paid
        "notes": data.get("notes", ""),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.purchase_orders.insert_one(po)
    po.pop("_id", None)
    return po


@router.patch("/purchase-orders/{po_id}/status")
async def update_purchase_order_status(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update purchase order status"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    po = await db.purchase_orders.find_one({"po_id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "status" in data:
        update["status"] = data["status"]
    if "payment_status" in data:
        update["payment_status"] = data["payment_status"]
    if "paid_amount" in data:
        update["paid_amount"] = data["paid_amount"]
    if "notes" in data:
        update["notes"] = data["notes"]
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": update})
    return await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})


# ==================== ENHANCED USER MANAGEMENT ENDPOINTS ====================

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/users/{user_id}")
async def get_user_by_id(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific user"""
    if current_user.role != UserRole.SUPER_ADMIN and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return user_doc


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    user_input: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a user (Super Admin only, or self for limited fields)"""
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Non-admin can only update their own name and phone
    if current_user.role != UserRole.SUPER_ADMIN:
        if current_user.user_id != user_id:
            raise HTTPException(status_code=403, detail="Permission denied")
        # Only allow name and phone updates for self
        user_input = UserUpdate(name=user_input.name, phone=user_input.phone)
    
    update_data = {k: v for k, v in user_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"user_id": user_id}, {"$set": update_data})
        await create_audit_log(current_user.user_id, "update", "user", user_id, update_data)
    
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Delete a user (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    
    if current_user.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.delete_one({"user_id": user_id})
    # Also delete their sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    
    await create_audit_log(current_user.user_id, "delete", "user", user_id, {"email": user_doc.get("email")})
    
    return {"message": "User deleted"}


@router.get("/users/by-role/{role}")
async def get_users_by_role(role: str, current_user: User = Depends(get_current_user)):
    """Get users by role"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({"role": role, "is_active": {"$ne": False}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@router.get("/team-members")
async def list_team_members(current_user: User = Depends(get_current_user)):
    """Active staff users (any project-team role).

    Used by the Planning Head "Filter by Team Member" search bar.
    Excludes clients, vendors, prospects, and inactive users.
    NOTE: This route is intentionally placed at /team-members (not
    /users/team-members) to avoid colliding with /users/{user_id}.
    """
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.GENERAL_MANAGER, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    excluded_roles = ["client", "vendor", "prospect"]
    users = await db.users.find(
        {"role": {"$nin": excluded_roles}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
    ).sort("name", 1).to_list(1000)
    # Deduplicate — same person can appear twice (e.g. created via HR + Sales)
    # with two distinct user_ids and identical (name, role). The UI picker still
    # needs ONE entry but must remember every alias so the filter can match
    # projects assigned to either alias.
    seen: Dict[str, Dict[str, Any]] = {}
    for u in users:
        key = ((u.get("name") or "").strip().lower(), u.get("role") or "")
        if not key[0]:
            key = (u.get("user_id"), u.get("role") or "")
        if key in seen:
            seen[key]["aliases"].append(u.get("user_id"))
        else:
            seen[key] = {**u, "aliases": [u.get("user_id")]}
    return list(seen.values())


@router.get("/roles")
async def get_all_roles(user: User = Depends(get_current_user)):
    """Get all available roles"""
    return [
        {"value": role.value, "label": role.value.replace("_", " ").title()}
        for role in UserRole
    ]


# ==================== SYSTEM SETTINGS PAGE DATA ====================

@router.get("/settings/summary")
async def get_settings_summary(user: User = Depends(get_current_user)):
    """Get summary counts for settings page"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    users_count = await db.users.count_documents({})
    materials_count = await db.materials.count_documents({"is_active": True})
    vendors_count = await db.vendor_master.count_documents({"is_active": True})
    
    company_settings = await db.company_settings.find_one({}, {"_id": 0})
    
    return {
        "users_count": users_count,
        "materials_count": materials_count,
        "vendors_count": vendors_count,
        "company_configured": company_settings is not None,
        "company_name": company_settings.get("company_name") if company_settings else "ConstructionOS"
    }



# ==================== ENHANCED CASHBOOK WITH DATE RANGE ====================

@router.get("/accountant/cashbook-filtered")
async def get_cashbook_filtered(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get filtered cashbook data with date range support"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    income_q = {}
    expense_q = {}

    # Income tab should only show APPROVED entries (or legacy entries without
    # an explicit status field). Hide pending_approval / rejected so the
    # Cashbook stays a "money in the bank" view.
    income_q["$or"] = [
        {"status": "approved"},
        {"status": {"$exists": False}},
        {"status": None},
    ]

    if project_id:
        income_q["project_id"] = project_id
        expense_q["project_id"] = project_id

    if start_date:
        income_q.setdefault("created_at", {})["$gte"] = start_date
        expense_q.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        income_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
        expense_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"

    (incomes, recorded_exps, labour_exps, material_reqs, material_exps_legacy, direct_exps, projects_list) = await asyncio.gather(
        db.income.find(income_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        # Recorded (manual) expenses: only show those approved by accountant
        # or super admin in the Expense list. Pending/rejected stay in queue.
        # Legacy entries without a status field are surfaced too (backwards-
        # compatible with pre-approval-flow expenses).
        db.recorded_expenses.find(
            {**expense_q, "$or": [
                # Labour RAB releases use status="approved"; Material direct
                # accountant approvals use "accounts_approved"; manual /
                # super-admin entries use "super_admin_approved"; legacy
                # rows have no status. Include all four.
                {"status": {"$in": ["accounts_approved", "super_admin_approved", "approved"]}},
                {"status": {"$exists": False}},
                {"status": None},
            ]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(2000),
        db.labour_expenses.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        # Materials in Expense list should only include those APPROVED by
        # accountant or already paid. Pending / planning-only / procurement-
        # priced statuses stay in the Approvals queue. Without this filter
        # the same material card showed up in both Approvals AND Expense.
        db.material_requests.find(
            {**expense_q, "status": {"$in": ["accounts_approved", "approved_for_po", "po_issued", "in_transit", "received", "delivered", "paid"]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(1000),
        # Feb 20 2026 — Legacy `material_expenses` collection (Cement/Sand/
        # Steel direct POs, pre-material_requests flow). Paid rows here were
        # invisible in Cashbook / Expense > Material card / Project Wise even
        # though Carry Forward already counted them, causing the Mrs.Abinaya
        # ₹93,902.75 mismatch reported on Feb 20. Include paid / settled /
        # accounts_approved so the Material card surfaces them.
        db.material_expenses.find(
            {**expense_q, "status": {"$in": ["accounts_approved", "issued", "settled", "completed", "paid"]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(1000),
        # Feb 20 2026 — Petty cash issued items (`direct_expenses.items[]`)
        # were missing from the Cashbook Petty Cash card. They're real cash-
        # outflow once the PM/Accountant records a site spend, so include them
        # in the unified expense_entries list. They flatten one row per item.
        # Strict accountant-approval rule: only count items inside docs that
        # are accountant-approved (or legacy docs without a status field).
        db.direct_expenses.find(
            {**expense_q, "$or": [
                {"status": {"$in": ["accounts_approved", "paid", "completed", "acknowledged", "payment_done"]}},
                {"status": {"$exists": False}},
                {"status": None},
            ]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(1000),
        # Cashbook's All-Projects dropdown lists EVERY real project — those
        # surfaced under Planning's New / Current / Delivered tabs. The
        # explicit name $nin removes specific demo / test rows. The blanket
        # RE-prefix regex was dropped (Feb 19 2026) because legitimate
        # Planning projects like "RE - Aldrin Jones" were hidden — use
        # planning_status as the source of truth.
        db.projects.find(
            {
                "planning_status": {"$in": ["new", "active", "delivered"]},
                "name": {"$nin": ["Swathi 60LG+2", "Swathi 60L G+2", "Swathi 60LG +2", "Mr. Joseph Vijay", "Mr. Joseph Vijay ", "Mr Joseph Vijay", "Mr Joseph Vijay ", "RE - Mr. Joseph Vijay", "RE - Mr. Joseph Vijay ", "RE-Mr. Joseph Vijay", "Mani Demo Project - Onbording", "Mani Demo Project - Onbording ", "Mani Demo Project - Onboarding"]},
            },
            {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "status": 1, "planning_status": 1, "created_at": 1},
        ).sort("name", 1).to_list(5000),
    )

    project_map = {p["project_id"]: p["name"] for p in projects_list}

    # Feb 12 2026 — Enrich the Stage column. Some incomes were captured with
    # just the stage number/label (e.g. "1", "2", "3") because the income
    # creation flow only stored the label. The cashbook shows that bare number
    # Older income rows store only the stage NUMBER/LABEL in `stage` (e.g. "1"),
    # which is meaningless to the accountant. Whenever possible we resolve the
    # ACTUAL linked stage via `payment_stage_id` / `stage_id` (uniquely identifies
    # the row in payment_stages) and rewrite `i.stage`:
    #   • Regular Payment Schedule stages: "<position> <stage_name>" where
    #     position is the 1-based row index in Planning's Payment Schedule
    #     (additions, vendor/labour, sales-advance rows are EXCLUDED from the
    #     position counter so numbers match Planning exactly).
    #   • Addition stages: "Additional: <stage_name>" (no number prefix).
    #   • Anything else (sales advance / other-than-scope): keep stage text as-is.
    psid_list = list({(i.get("payment_stage_id") or i.get("stage_id")) for i in incomes if (i.get("payment_stage_id") or i.get("stage_id"))})
    psid_map: Dict[str, Dict[str, Any]] = {}
    if psid_list:
        stage_docs = await db.payment_stages.find(
            {"stage_id": {"$in": psid_list}},
            {"_id": 0, "stage_id": 1, "project_id": 1},
        ).to_list(5000)
        proj_ids = list({d["project_id"] for d in stage_docs if d.get("project_id")})
        all_stages_by_proj: Dict[str, List[Dict[str, Any]]] = {}
        if proj_ids:
            all_stages = await db.payment_stages.find(
                {"project_id": {"$in": proj_ids}},
                {"_id": 0, "stage_id": 1, "project_id": 1, "stage_name": 1, "stage_label": 1,
                 "sort_order": 1, "stage_number": 1, "created_at": 1,
                 "category": 1, "kind": 1, "rab_request_id": 1, "rab_number": 1,
                 "contractor_id": 1, "vendor_id": 1, "is_addition": 1, "linked_addition_id": 1},
            ).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(5000)
            def _is_vendor_or_labour_row(s):
                cat = (s.get("category") or "").lower()
                kind = (s.get("kind") or "").lower()
                if cat in ("labour", "vendor", "material", "expense"):
                    return True
                if kind in ("labour_rab", "vendor_payment", "material_expense"):
                    return True
                if s.get("rab_request_id") or s.get("rab_number") or s.get("contractor_id") or s.get("vendor_id"):
                    return True
                sname = (s.get("stage_name") or "").lower()
                if sname.startswith("rab-") or sname.startswith("rab "):
                    return True
                return False
            def _is_addition_row(s):
                if s.get("is_addition") is True:
                    return True
                if s.get("linked_addition_id"):
                    return True
                sname = (s.get("stage_name") or "")
                if sname.startswith("Additional:") or sname.startswith("Additional Work"):
                    return True
                return False
            for s in all_stages:
                all_stages_by_proj.setdefault(s["project_id"], []).append(s)
        for pid, slist in all_stages_by_proj.items():
            position = 0
            for s in slist:
                if _is_vendor_or_labour_row(s):
                    continue
                if _is_addition_row(s):
                    # Addition stages get NO position number — they're flagged.
                    psid_map[s["stage_id"]] = {**s, "_is_addition": True}
                    continue
                position += 1
                psid_map[s["stage_id"]] = {**s, "_position": position}
    for i in incomes:
        sid = i.get("payment_stage_id") or i.get("stage_id")
        if sid and sid in psid_map:
            s = psid_map[sid]
            nm = s.get("stage_name") or s.get("stage_label") or ""
            if s.get("_is_addition"):
                # Strip any existing "Additional:" prefix to avoid duplication.
                clean = nm.replace("Additional:", "", 1).strip() if nm.startswith("Additional:") else nm
                i["stage"] = f"Additional: {clean}".strip() if clean else "Additional"
            else:
                pos = s.get("_position")
                if pos and nm:
                    i["stage"] = f"{pos} {nm}".strip()
                elif nm:
                    i["stage"] = nm

    # Legacy fallback: rows without payment_stage_id — match by label/number.
    label_lookups = set()
    for i in incomes:
        if i.get("payment_stage_id") or i.get("stage_id"):
            continue
        st = str(i.get("stage") or "").strip()
        if st and (st.isdigit() or len(st) <= 4) and i.get("project_id"):
            label_lookups.add((i["project_id"], st))
    if label_lookups:
        proj_to_labels = {}
        for pid, lab in label_lookups:
            proj_to_labels.setdefault(pid, set()).add(lab)
        ps_docs = await db.payment_stages.find(
            {"project_id": {"$in": list(proj_to_labels.keys())}},
            {"_id": 0, "project_id": 1, "stage_label": 1, "stage_name": 1, "stage_number": 1},
        ).to_list(5000)
        stage_name_map = {}
        for ps in ps_docs:
            pid = ps.get("project_id")
            label = str(ps.get("stage_label") or ps.get("stage_number") or "").strip()
            if not pid or not label:
                continue
            name = (ps.get("stage_name") or "").strip()
            if name:
                stage_name_map[(pid, label)] = name
        for i in incomes:
            if i.get("payment_stage_id") or i.get("stage_id"):
                continue
            st = str(i.get("stage") or "").strip()
            if not st:
                continue
            name = stage_name_map.get((i.get("project_id"), st))
            if name:
                i["stage"] = f"{st} {name}"

    # Enrich income entries
    for i in incomes:
        i["project_name"] = project_map.get(i.get("project_id"), "Unknown")

    # Build all expenses list — every row gets a unified `expense_id` so the
    # frontend has a single field to send back when deleting, regardless of
    # which collection it came from.
    all_expenses = []
    for e in recorded_exps:
        all_expenses.append({
            **e,
            "expense_id": e.get("expense_id") or str(e.get("_id", "")),
            "expense_type": e.get("category", "other"),
            "project_name": project_map.get(e.get("project_id"), ""),
            "source": e.get("source") or ("approval" if e.get("approval_id") or e.get("from_approval") else "manual"),
        })
    for l in labour_exps:
        all_expenses.append({
            **l,
            "expense_id": l.get("labour_expense_id") or l.get("expense_id"),
            "expense_type": "labour",
            "amount": l.get("total_amount", 0),
            "project_name": project_map.get(l.get("project_id"), ""),
            "source": "approval",
        })
    for m in material_reqs:
        amt = m.get("estimated_price", 0) or m.get("final_price", 0)
        all_expenses.append({
            **m,
            "expense_id": m.get("request_id") or m.get("expense_id"),
            "expense_type": "material",
            "amount": amt,
            "project_name": project_map.get(m.get("project_id"), ""),
            "source": "approval",
        })
    # Legacy `material_expenses` collection — paid material POs (Cement,
    # Sand, Steel, etc.) recorded before the material_requests flow.
    for me in material_exps_legacy:
        amt = me.get("final_amount") or me.get("amount") or 0
        all_expenses.append({
            **me,
            "expense_id": me.get("material_expense_id") or me.get("expense_id") or str(me.get("_id", "")),
            "expense_type": "material",
            "amount": amt,
            "project_name": project_map.get(me.get("project_id"), ""),
            "source": "approval",
        })
    # Petty cash items issued at the site (`direct_expenses.items[]`). One
    # row per item so the table shows individual spends.
    for de in direct_exps:
        items = de.get("items") or []
        for it in items:
            all_expenses.append({
                "expense_id": it.get("item_id") or de.get("petty_cash_id") or de.get("direct_expense_id"),
                "expense_type": "petty_cash",
                "category": it.get("category") or "petty_cash",
                "description": it.get("expense_name") or it.get("description") or "Petty cash",
                "amount": it.get("amount") or 0,
                "project_id": de.get("project_id"),
                "project_name": project_map.get(de.get("project_id"), ""),
                "payment_method": "petty_cash",
                "created_at": de.get("created_at"),
                "source": "approval",
            })

    all_expenses.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    total_income = sum(i.get("amount", 0) for i in incomes)
    total_expense = sum(e.get("amount", 0) for e in all_expenses)

    # Build income_by_mode and expense_by_mode for the Financial Overview cards,
    # honoring the same date/project filter so cards always match the table below.
    mode_keys = ["cash", "current_account", "savings_account", "cheque", "petty_cash", "miscellaneous", "direct_transfer", "suspense_account"]
    def _classify(mode):
        if not mode:
            return "cash"
        m = str(mode).lower().replace(" ", "_")
        mp = {
            "cash": "cash", "bank_transfer": "current_account", "neft": "current_account",
            "rtgs": "current_account", "imps": "current_account", "escrow": "current_account",
            "cheque": "cheque", "petty_cash": "petty_cash", "savings": "savings_account",
            "savings_account": "savings_account", "current_account": "current_account",
            "miscellaneous": "miscellaneous", "direct_transfer": "direct_transfer",
            "dt": "direct_transfer", "suspense": "suspense_account", "suspense_account": "suspense_account",
        }
        return mp.get(m, "miscellaneous")

    income_by_mode = {k: 0 for k in mode_keys}
    income_by_mode["total"] = total_income
    for i in incomes:
        income_by_mode[_classify(i.get("payment_mode"))] += i.get("amount", 0)

    expense_by_mode = {k: 0 for k in mode_keys}
    expense_by_mode["total"] = total_expense
    for e in all_expenses:
        expense_by_mode[_classify(e.get("payment_method") or e.get("payment_mode"))] += e.get("amount", 0)

    # Build project-wise breakdown from the FULL incomes/expenses lists
    # (NOT the [:500] truncated slices below) and seed EVERY real project
    # so the Project-Wise tab always shows all 51 projects — including
    # those with zero balance and those whose entries fell outside the
    # top-500 window (e.g. Mrs. Abinaya's older incomes).
    real_pid_set = {p["project_id"] for p in projects_list}
    project_wise_map = {p["project_id"]: {
        "project_id": p["project_id"],
        "project_name": p.get("name", "Unknown"),
        "income": 0,
        "expense": 0,
        "cf_income": 0,
        "cf_expense": 0,
    } for p in projects_list}
    for i in incomes:
        pid = i.get("project_id")
        if pid in real_pid_set:
            project_wise_map[pid]["income"] += i.get("amount", 0) or 0
    for e in all_expenses:
        pid = e.get("project_id")
        if pid in real_pid_set:
            project_wise_map[pid]["expense"] += e.get("amount", 0) or 0
    # Feb 20 2026 — Add Carry Forward income / expense to each project row so
    # Project Wise totals match the Carry Forward tab. CF Income comes from
    # `income_carry_forward + income_adjustment`; CF Expense rolls up the 4
    # per-bucket fields (material + labour + petty cash + indirect) and falls
    # back to the legacy rolled-up `expense_carry_forward + expense_adjustment`
    # when the new fields are absent.
    cf_docs = await db.project_carry_forwards.find({}, {"_id": 0}).to_list(2000)
    for cf in cf_docs:
        pid = cf.get("project_id")
        if pid not in project_wise_map:
            continue
        cf_inc = float(cf.get("income_carry_forward") or 0) + float(cf.get("income_adjustment") or 0)
        mat_cf = float(cf.get("material_carry_forward") or 0)
        lab_cf = float(cf.get("labour_carry_forward") or 0)
        pc_cf = float(cf.get("petty_cash_carry_forward") or 0)
        ind_cf = float(cf.get("indirect_carry_forward") or 0)
        cf_exp = mat_cf + lab_cf + pc_cf + ind_cf
        if cf_exp == 0:
            cf_exp = float(cf.get("expense_carry_forward") or 0) + float(cf.get("expense_adjustment") or 0)
        project_wise_map[pid]["cf_income"] = cf_inc
        project_wise_map[pid]["cf_expense"] = cf_exp
    for pw in project_wise_map.values():
        # `income` / `expense` columns now include CF so Project Wise totals
        # reconcile with Carry Forward grand totals.
        pw["income"] = pw["income"] + pw["cf_income"]
        pw["expense"] = pw["expense"] + pw["cf_expense"]
        pw["balance"] = pw["income"] - pw["expense"]
    project_wise_sorted = sorted(project_wise_map.values(), key=lambda x: (-x["income"], x["project_name"]))

    # Recompute the global Total Income / Total Expense headline cards
    # to include CF roll-ups so they match the table sums below.
    cf_inc_grand = sum(pw["cf_income"] for pw in project_wise_map.values())
    cf_exp_grand = sum(pw["cf_expense"] for pw in project_wise_map.values())
    total_income_with_cf = total_income + cf_inc_grand
    total_expense_with_cf = total_expense + cf_exp_grand

    return {
        "income_entries": incomes[:500],
        "expense_entries": all_expenses[:500],
        "projects": projects_list,
        "project_wise": project_wise_sorted,
        "income_by_mode": income_by_mode,
        "expense_by_mode": expense_by_mode,
        "summary": {
            # Feb 20 2026 — headline cards now include CF so they reconcile
            # with the per-project rows (Income / Expense / Balance columns).
            "total_income": total_income_with_cf,
            "total_expense": total_expense_with_cf,
            "net_balance": total_income_with_cf - total_expense_with_cf,
            # Live-only totals kept for callers that need the un-adjusted view.
            "total_income_live": total_income,
            "total_expense_live": total_expense,
            "total_cf_income": cf_inc_grand,
            "total_cf_expense": cf_exp_grand,
            "income_count": len(incomes),
            "expense_count": len(all_expenses),
        }
    }


# ==================== SMART CHEQUE PAYMENT ====================

@router.get("/accountant/vendor-suspense/{vendor_name}")
async def get_vendor_suspense_balance(vendor_name: str, user: User = Depends(get_current_user)):
    """Get suspense balance for a specific vendor"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check cheque-based suspense
    suspense_entries = await db.cheque_suspense.find(
        {"vendor_name": vendor_name},
        {"_id": 0}
    ).to_list(500)

    total_balance = sum(e.get("amount", 0) for e in suspense_entries)

    return {
        "vendor_name": vendor_name,
        "suspense_balance": total_balance,
        "entries": suspense_entries
    }


@router.get("/accountant/all-vendor-suspense")
async def get_all_vendor_suspense(user: User = Depends(get_current_user)):
    """Get suspense balances for all vendors"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    entries = await db.cheque_suspense.find({}, {"_id": 0}).to_list(5000)

    # Group by vendor
    vendor_balances = {}
    for e in entries:
        vn = e.get("vendor_name", "Unknown")
        if vn not in vendor_balances:
            vendor_balances[vn] = {"vendor_name": vn, "balance": 0, "entries": []}
        vendor_balances[vn]["balance"] += e.get("amount", 0)
        vendor_balances[vn]["entries"].append(e)

    # Only return vendors with non-zero balance
    result = [v for v in vendor_balances.values() if v["balance"] != 0]
    result.sort(key=lambda x: x["balance"], reverse=True)

    return result


class ChequePaymentRequest(BaseModel):
    cheque_id: str
    expense_project_id: str
    expense_category: str  # material, labour, vendor, other
    expense_description: str
    expense_amount: float
    vendor_name: str
    use_suspense: bool = False
    suspense_amount_to_use: float = 0
    remarks: Optional[str] = None


@router.post("/accountant/cheque-payment")
async def process_cheque_payment(data: ChequePaymentRequest, user: User = Depends(get_current_user)):
    """Smart cheque payment: pay expense via cheque, handle excess → vendor suspense.
    
    Logic:
    - Fetch cheque details
    - If use_suspense, deduct from vendor's suspense first
    - Record expense
    - If cheque amount > expense amount, excess goes to vendor suspense
    - Update cheque status
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc).isoformat()
    payment_id = f"cpay_{uuid.uuid4().hex[:12]}"

    # Get cheque
    cheque = await db.cheques.find_one({"cheque_id": data.cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")

    cheque_amount = cheque.get("amount", 0)

    # Get project name
    project = await db.projects.find_one({"project_id": data.expense_project_id}, {"_id": 0, "name": 1})
    project_name = project.get("name") if project else "Unknown"

    # Calculate effective payment
    suspense_used = 0
    if data.use_suspense and data.suspense_amount_to_use > 0:
        # Verify suspense balance
        suspense_entries = await db.cheque_suspense.find(
            {"vendor_name": data.vendor_name}, {"_id": 0}
        ).to_list(500)
        available_suspense = sum(e.get("amount", 0) for e in suspense_entries)

        suspense_used = min(data.suspense_amount_to_use, available_suspense, data.expense_amount)

        if suspense_used > 0:
            # Debit suspense
            await db.cheque_suspense.insert_one({
                "entry_id": f"csus_{uuid.uuid4().hex[:12]}",
                "vendor_name": data.vendor_name,
                "amount": -suspense_used,
                "description": f"Used for expense: {data.expense_description}",
                "payment_id": payment_id,
                "cheque_id": data.cheque_id,
                "project_id": data.expense_project_id,
                "created_at": now,
            })

    amount_from_cheque = data.expense_amount - suspense_used
    excess = cheque_amount - amount_from_cheque

    # If excess, credit to vendor suspense
    if excess > 0:
        await db.cheque_suspense.insert_one({
            "entry_id": f"csus_{uuid.uuid4().hex[:12]}",
            "vendor_name": data.vendor_name,
            "amount": excess,
            "description": f"Excess from cheque {cheque.get('cheque_number')} (Cheque: {cheque_amount}, Used: {amount_from_cheque})",
            "payment_id": payment_id,
            "cheque_id": data.cheque_id,
            "project_id": data.expense_project_id,
            "created_at": now,
        })

    # Record the expense
    expense_record = {
        "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
        "project_id": data.expense_project_id,
        "project_name": project_name,
        "category": data.expense_category,
        "description": data.expense_description,
        "amount": data.expense_amount,
        "payment_method": "cheque",
        "vendor_name": data.vendor_name,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "payment_id": payment_id,
        "cheque_id": data.cheque_id,
        "cheque_number": cheque.get("cheque_number"),
        "suspense_used": suspense_used,
        "remarks": data.remarks,
        "created_at": now,
    }
    await db.recorded_expenses.insert_one(expense_record)
    del expense_record["_id"]

    # Update cheque status to 'used' or keep as issued
    await db.cheques.update_one(
        {"cheque_id": data.cheque_id},
        {"$set": {
            "status": "deposited",
            "linked_payment_id": payment_id,
            "linked_expense_amount": data.expense_amount,
            "updated_at": now,
        }}
    )

    # Get new suspense balance
    new_suspense_entries = await db.cheque_suspense.find(
        {"vendor_name": data.vendor_name}, {"_id": 0}
    ).to_list(500)
    new_balance = sum(e.get("amount", 0) for e in new_suspense_entries)

    await create_audit_log(user.user_id, "cheque_payment", "expense", payment_id, {
        "cheque_id": data.cheque_id,
        "cheque_amount": cheque_amount,
        "expense_amount": data.expense_amount,
        "suspense_used": suspense_used,
        "excess_to_suspense": excess if excess > 0 else 0,
        "vendor": data.vendor_name,
    })

    return {
        "payment_id": payment_id,
        "cheque_amount": cheque_amount,
        "expense_amount": data.expense_amount,
        "suspense_used": suspense_used,
        "amount_from_cheque": amount_from_cheque,
        "excess_to_suspense": excess if excess > 0 else 0,
        "new_suspense_balance": new_balance,
        "expense": expense_record,
        "message": f"Payment processed via cheque {cheque.get('cheque_number')}. Vendor suspense balance: ₹{new_balance:,.0f}"
    }


@router.get("/accountant/uncleared-cheques")
async def get_uncleared_cheques(user: User = Depends(get_current_user)):
    """Get cheques available for payment (issued/post_dated, not yet cleared/used)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    cheques = await db.cheques.find(
        {"status": {"$in": ["issued", "post_dated"]}, "cheque_type": "outgoing"},
        {"_id": 0}
    ).sort("cheque_date", -1).to_list(200)

    return cheques


# ==================== CHEQUE BOUNCE WORKFLOW ====================
# When an Accountant marks a cheque as bounced, we cascade reversals:
#  • Incoming side (cheque had income_id / linked payment_stage):
#       - The income row is flagged status='cheque_bounced' (excluded from totals)
#       - The original payment_stage row is flagged 'cheque_bounced'
#       - A NEW pending payment_stage row is cloned for re-collection, with a
#         bounce banner detailing the old cheque number/amount.
#  • Expense side (cheque had used_for_expense_id → recorded_expenses):
#       - The recorded_expense row is flagged status='cheque_bounced'
#       - The linked material_expenses (approval row) flips back to
#         'pending_accounts_approval' with cheque_bounced=true + old detail
#         so it re-appears in the Accountant Materials approval queue.
#       - Parent material_request gets a cheque_bounced banner.

class ChequeBounceRequest(BaseModel):
    reason: str
    charges: float = 0


@router.post("/accountant/cheques/{cheque_id}/bounce")
async def bounce_cheque(cheque_id: str, payload: ChequeBounceRequest, user: User = Depends(get_current_user)):
    """Mark a cheque as bounced and cascade reversal on the linked income/expense."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can bounce cheques")

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Bounce reason is required")

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("status") == "bounced":
        raise HTTPException(status_code=400, detail="Cheque is already marked as bounced")
    if cheque.get("status") == "cleared":
        raise HTTPException(status_code=400, detail="Cheque has already cleared — cannot bounce")

    now = datetime.now(timezone.utc).isoformat()
    expense_id = cheque.get("used_for_expense_id")

    # Find ALL income rows linked to this cheque. A single ₹5L cheque could have
    # been used by CRE bulk-collect to settle multiple payment stages — every
    # one of those incomes (and their stages) must be reverted. We match via
    # multiple possible links; ANY of these must match. cheque_number alone is
    # NOT unique across projects so we always scope by project_id.
    or_clauses = [{"cheque_id": cheque_id}]
    if cheque.get("income_id"):
        or_clauses.append({"income_id": cheque["income_id"]})
    if cheque.get("bulk_collection_id"):
        or_clauses.append({"bulk_collection_id": cheque["bulk_collection_id"]})
    if cheque.get("cheque_number"):
        if cheque.get("project_id"):
            or_clauses.append({"payment_mode": "cheque", "payment_reference": cheque["cheque_number"], "project_id": cheque["project_id"]})
        else:
            or_clauses.append({"payment_mode": "cheque", "payment_reference": cheque["cheque_number"], "amount": cheque.get("amount")})
    linked_incomes = await db.income.find(
        {"$or": or_clauses, "status": {"$nin": ["cheque_bounced", "rejected"]}},
        {"_id": 0},
    ).to_list(500)
    # De-duplicate
    linked_incomes = {inc["income_id"]: inc for inc in linked_incomes if inc.get("income_id")}.values()
    linked_incomes = list(linked_incomes)

    if not linked_incomes and not expense_id:
        raise HTTPException(
            status_code=400,
            detail="Cheque has not been used for income or expense yet — nothing to reverse",
        )

    # 1. Mark the cheque itself as bounced
    await db.cheques.update_one(
        {"cheque_id": cheque_id},
        {"$set": {
            "status": "bounced",
            "bounce_reason": payload.reason.strip(),
            "bounce_charges": payload.charges,
            "bounced_at": now,
            "bounced_by": user.user_id,
            "bounced_by_name": user.name,
            "updated_at": now,
        }}
    )

    reversal_summary = {"income_reversed": False, "expense_reversed": False, "stages_reverted": 0, "total_income_reversed": 0.0, "new_stage_ids": [], "stages_adjusted": [], "incomes_adjusted": []}

    # 2a. Income-side reversal — DEDUCT the bounced amount from the linked
    # incomes (newest first). Critical for bulk collections where one cheque
    # is only a portion of the overall collection:
    #   • If an income's amount > remaining bounce → reduce that income's
    #     amount in place; status stays `approved` (still shows in cashbook,
    #     just with the smaller value).
    #   • If an income's amount <= remaining bounce → mark the income
    #     `cheque_bounced` (drops out of cashbook) and carry the remainder to
    #     the next income.
    # The same delta is subtracted from each affected stage's `amount_received`
    # and the stage status is recomputed in-place (no clone row).
    bounce_amount = float(cheque.get("amount") or 0)
    remaining = bounce_amount
    stage_deltas = {}  # stage_id -> total reduction

    # Sort newest-first so the "last payment" absorbs the loss
    ordered_incomes = sorted(linked_incomes, key=lambda i: str(i.get("created_at") or ""), reverse=True)

    for income in ordered_incomes:
        if remaining <= 0:
            break
        income_id = income.get("income_id")
        project_id = income.get("project_id")
        inc_amt = float(income.get("amount") or 0)
        stage_id = income.get("payment_stage_id") or income.get("stage_id")
        if inc_amt <= 0:
            continue
        if inc_amt <= remaining:
            # Full bounce of this income
            deduct = inc_amt
            new_status = "cheque_bounced"
            update = {
                "status": new_status,
                "bounced_at": now,
                "bounced_by_cheque_id": cheque_id,
                "bounce_reason": payload.reason.strip(),
                "updated_at": now,
            }
            remaining -= deduct
        else:
            # Partial reduction — keep income visible with smaller amount
            deduct = remaining
            new_amt = round(inc_amt - deduct, 2)
            already = float(income.get("partial_bounce_deducted") or 0)
            update = {
                "amount": new_amt,
                "partial_bounce_deducted": already + deduct,
                "last_partial_bounce_at": now,
                "last_partial_bounce_cheque_id": cheque_id,
                "last_partial_bounce_reason": payload.reason.strip(),
                "updated_at": now,
            }
            remaining = 0
            new_status = income.get("status")
        await db.income.update_one({"income_id": income_id}, {"$set": update})
        if stage_id:
            stage_deltas[stage_id] = stage_deltas.get(stage_id, 0.0) + deduct
        reversal_summary["total_income_reversed"] += deduct
        reversal_summary["project_id"] = project_id
        reversal_summary["incomes_adjusted"].append({
            "income_id": income_id,
            "deducted": deduct,
            "new_status": new_status,
        })

    # Now apply the per-stage reductions
    for stage_id, reduction in stage_deltas.items():
        old_stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
        if not old_stage:
            continue
        stage_amount = float(old_stage.get("amount") or 0)
        old_received = float(old_stage.get("amount_received") or 0)
        new_received = max(old_received - reduction, 0.0)
        if new_received >= stage_amount and stage_amount > 0:
            new_status = "paid"
            new_workflow = old_stage.get("workflow_status") or "collected"
            paid_at = old_stage.get("paid_at") or now
        elif new_received > 0:
            new_status = "partial"
            new_workflow = "collected"
            paid_at = None
        else:
            new_status = "pending"
            new_workflow = "requested" if old_stage.get("requested_at") else "pending"
            paid_at = None
        update = {
            "amount_received": new_received,
            "status": new_status,
            "workflow_status": new_workflow,
            "cheque_bounced": True,
            "last_bounce_amount": reduction,
            "last_bounce_cheque_id": cheque_id,
            "last_bounce_cheque_number": cheque.get("cheque_number"),
            "bounced_at": now,
            "bounce_reason": payload.reason.strip(),
            "bounce_banner": f"₹{reduction:,.0f} bounced — cheque {cheque.get('cheque_number')} on {now[:10]}. Re-collect on the SAME stage.",
            "updated_at": now,
        }
        if paid_at is None:
            update["paid_at"] = None
        await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": update})
        # Mirror the bounce-driven reduction onto linked additional_costs.income_received.
        await _sync_addition_cost_received(stage_id)
        reversal_summary["stages_reverted"] += 1
        reversal_summary["stages_adjusted"].append({
            "stage_id": stage_id,
            "reduction": reduction,
            "new_received": new_received,
            "new_status": new_status,
        })

    if reversal_summary["incomes_adjusted"]:
        reversal_summary["income_reversed"] = True
    # Legacy keys for older tests/UI — point at the FIRST adjusted stage.
    if reversal_summary["stages_adjusted"]:
        reversal_summary["new_payment_stage_id"] = reversal_summary["stages_adjusted"][0]["stage_id"]
        reversal_summary["new_stage_ids"] = [s["stage_id"] for s in reversal_summary["stages_adjusted"]]

    reversal_summary["bounced_amount"] = bounce_amount
    reversal_summary["unallocated_bounce_remainder"] = remaining  # > 0 means total income < cheque, edge case

    # 2b. Expense-side reversal
    if expense_id:
        rec_exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
        if rec_exp:
            await db.recorded_expenses.update_one(
                {"expense_id": expense_id},
                {"$set": {
                    "status": "cheque_bounced",
                    "bounced_at": now,
                    "bounced_by_cheque_id": cheque_id,
                    "bounce_reason": payload.reason.strip(),
                    "updated_at": now,
                }}
            )
            # Re-open the approval request row so it appears in the Materials queue again
            req_id = rec_exp.get("approval_id") or rec_exp.get("request_id")
            req_type = rec_exp.get("request_type") or rec_exp.get("expense_type") or rec_exp.get("category")
            if req_id and req_type == "material":
                await db.material_expenses.update_one(
                    {"expense_id": req_id},
                    {"$set": {
                        "status": "pending_accounts_approval",
                        "cheque_bounced": True,
                        "bounced_from_cheque_id": cheque_id,
                        "bounced_from_cheque_number": cheque.get("cheque_number"),
                        "bounced_from_cheque_amount": cheque.get("amount"),
                        "bounce_reason": payload.reason.strip(),
                        "bounced_at": now,
                        "paid_via_expense_id": None,
                        "paid_at": None,
                        "paid_amount": None,
                        "updated_at": now,
                    }}
                )
                # Flag parent material_request too
                mexp = await db.material_expenses.find_one({"expense_id": req_id}, {"_id": 0})
                if mexp and mexp.get("source_request_id"):
                    await db.material_requests.update_one(
                        {"request_id": mexp["source_request_id"]},
                        {"$set": {
                            "cheque_bounced": True,
                            "bounced_from_cheque_id": cheque_id,
                            "bounced_from_cheque_number": cheque.get("cheque_number"),
                            "bounced_from_cheque_amount": cheque.get("amount"),
                            "bounce_reason": payload.reason.strip(),
                            "bounced_at": now,
                            "updated_at": now,
                        }}
                    )
            elif req_id and req_type == "labour":
                await db.labour_expenses.update_one(
                    {"labour_expense_id": req_id},
                    {"$set": {
                        "status": "pending_accounts_approval",
                        "cheque_bounced": True,
                        "bounced_from_cheque_id": cheque_id,
                        "bounced_from_cheque_number": cheque.get("cheque_number"),
                        "bounce_reason": payload.reason.strip(),
                        "bounced_at": now,
                        "paid_via_expense_id": None,
                        "paid_at": None,
                        "updated_at": now,
                    }}
                )
            elif req_id and req_type == "petty_cash":
                await db.petty_cash.update_one(
                    {"petty_cash_id": req_id},
                    {"$set": {
                        "status": "awaiting_accountant",
                        "cheque_bounced": True,
                        "bounced_from_cheque_id": cheque_id,
                        "bounced_from_cheque_number": cheque.get("cheque_number"),
                        "bounce_reason": payload.reason.strip(),
                        "bounced_at": now,
                        "updated_at": now,
                    }}
                )
            reversal_summary["expense_reversed"] = True
            reversal_summary["expense_project_id"] = rec_exp.get("project_id")

    # 3. Audit log
    await create_audit_log(user.user_id, "bounce", "cheque", cheque_id, {
        "cheque_number": cheque.get("cheque_number"),
        "amount": cheque.get("amount"),
        "reason": payload.reason.strip(),
        "charges": payload.charges,
        **reversal_summary,
    })

    return {
        "message": f"Cheque {cheque.get('cheque_number')} marked as bounced",
        "cheque_id": cheque_id,
        **reversal_summary,
    }


@router.get("/accountant/cheques/bounced")
async def list_bounced_cheques(user: User = Depends(get_current_user)):
    """List all bounced cheques for the dedicated Bounced tab."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    cheques = await db.cheques.find({"status": "bounced"}, {"_id": 0}).sort("bounced_at", -1).to_list(500)
    return cheques


class ChequeDeleteRequest(BaseModel):
    password: str


class ChequeDisableRequest(BaseModel):
    password: str
    reason: str


class ChequeRetrieveRequest(BaseModel):
    password: str
    reason: str


class ChequeHardDeleteRequest(BaseModel):
    password: str
    reason: str


@router.delete("/accountant/cheques/{cheque_id}")
async def delete_cheque(cheque_id: str, payload: ChequeDeleteRequest, user: User = Depends(get_current_user)):
    """Soft-delete an orphan cheque.

    Rules (per user spec):
      • Only Super Admin and Accountant can delete.
      • User must re-authenticate with their own password.
      • Deletion only allowed when the cheque has NO valid linked income or
        expense — i.e. the cheque is orphaned (references that no longer
        resolve to existing records, or the cheque was never used).
      • Soft delete only — sets status='deleted' so audit trail is preserved.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Super Admin or Accountant can delete cheques")

    # 1. Re-verify password
    from routes.auth import verify_password  # local import to avoid circular
    db_user = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 1, "hashed_password": 1})
    if not db_user:
        raise HTTPException(status_code=404, detail="User record not found")
    stored_hash = db_user.get("password_hash") or db_user.get("hashed_password")
    if not stored_hash or not verify_password(payload.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password — cheque not deleted")

    # 2. Fetch cheque
    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("status") == "deleted":
        raise HTTPException(status_code=400, detail="Cheque already deleted")

    # 3. Orphan check — block delete if ANY linked income/expense actually exists
    # Income side
    has_real_income = False
    if cheque.get("income_id"):
        if await db.income.find_one({"income_id": cheque["income_id"]}, {"_id": 0, "income_id": 1}):
            has_real_income = True
    if not has_real_income:
        # Look for any income that references back to this cheque
        if await db.income.find_one({"cheque_id": cheque_id}, {"_id": 0, "income_id": 1}):
            has_real_income = True
    if not has_real_income and cheque.get("bulk_collection_id"):
        if await db.income.find_one({"bulk_collection_id": cheque["bulk_collection_id"]}, {"_id": 0, "income_id": 1}):
            has_real_income = True
    # Expense side
    has_real_expense = False
    if cheque.get("used_for_expense_id"):
        if await db.recorded_expenses.find_one({"expense_id": cheque["used_for_expense_id"]}, {"_id": 0, "expense_id": 1}):
            has_real_expense = True

    if has_real_income or has_real_expense:
        raise HTTPException(
            status_code=400,
            detail="Cheque is linked to an existing income or expense — use Bounce to reverse first, then delete is not needed.",
        )

    # 4. Soft delete + audit
    now = datetime.now(timezone.utc).isoformat()
    await db.cheques.update_one(
        {"cheque_id": cheque_id},
        {"$set": {
            "status": "deleted",
            "deleted_at": now,
            "deleted_by": user.user_id,
            "deleted_by_name": user.name,
            "updated_at": now,
        }}
    )
    await create_audit_log(user.user_id, "delete", "cheque", cheque_id, {
        "cheque_number": cheque.get("cheque_number"),
        "amount": cheque.get("amount"),
        "party_name": cheque.get("party_name"),
        "had_orphan_refs": bool(cheque.get("income_id") or cheque.get("used_for_expense_id") or cheque.get("project_id")),
    })

    return {"message": f"Cheque {cheque.get('cheque_number')} deleted (orphan)", "cheque_id": cheque_id}


async def _verify_user_password(user: User, password: str):
    """Re-verify the current user's login password. Raises 401 on failure."""
    from routes.auth import verify_password  # local import to avoid circular
    db_user = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 1, "hashed_password": 1})
    if not db_user:
        raise HTTPException(status_code=404, detail="User record not found")
    stored_hash = db_user.get("password_hash") or db_user.get("hashed_password")
    if not stored_hash or not verify_password(password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")


@router.post("/accountant/cheques/{cheque_id}/disable")
async def disable_cheque(cheque_id: str, payload: ChequeDisableRequest, user: User = Depends(get_current_user)):
    """Disable a received cheque (Super Admin or Accountant).

    Rules:
      • Only Super Admin and Accountant may disable.
      • Allowed only for fresh "Received" cheques — i.e. incoming, not opened,
        not yet opened-requested, not used for any expense, not bounced.
      • Requires the user's login password and a written reason.
      • Sets `is_disabled=True` so the cheque is hidden from all normal tabs
        and shows up under the dedicated "Disabled" tab.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Super Admin or Accountant can disable cheques")
    if not (payload.reason or '').strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    await _verify_user_password(user, payload.password)

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("is_disabled"):
        raise HTTPException(status_code=400, detail="Cheque is already disabled")
    if cheque.get("status") in ("deleted", "bounced", "cancelled", "cleared"):
        raise HTTPException(status_code=400, detail=f"Cheque is {cheque.get('status')} and cannot be disabled")
    if cheque.get("cheque_type") != "incoming":
        raise HTTPException(status_code=400, detail="Only incoming cheques can be disabled")
    if cheque.get("is_opened") or cheque.get("open_requested"):
        raise HTTPException(status_code=400, detail="Only Received (not yet opened or open-requested) cheques can be disabled")
    if cheque.get("used_for_expense_id"):
        raise HTTPException(status_code=400, detail="Cheque is already used for an expense — cannot disable")

    now = datetime.now(timezone.utc).isoformat()
    await db.cheques.update_one(
        {"cheque_id": cheque_id},
        {"$set": {
            "is_disabled": True,
            "disabled_at": now,
            "disabled_by": user.user_id,
            "disabled_by_name": user.name,
            "disable_reason": payload.reason.strip(),
            "updated_at": now,
        }}
    )
    await create_audit_log(user.user_id, "disable", "cheque", cheque_id, {
        "cheque_number": cheque.get("cheque_number"),
        "amount": cheque.get("amount"),
        "reason": payload.reason.strip(),
    })
    return {"message": f"Cheque {cheque.get('cheque_number')} disabled", "cheque_id": cheque_id}


@router.post("/accountant/cheques/{cheque_id}/retrieve")
async def retrieve_cheque(cheque_id: str, payload: ChequeRetrieveRequest, user: User = Depends(get_current_user)):
    """Retrieve a previously-disabled cheque back to the Received tab.

    Rules:
      • Super Admin ONLY.
      • Requires login password + reason.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can retrieve disabled cheques")
    if not (payload.reason or '').strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    await _verify_user_password(user, payload.password)

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if not cheque.get("is_disabled"):
        raise HTTPException(status_code=400, detail="Cheque is not disabled")

    now = datetime.now(timezone.utc).isoformat()
    await db.cheques.update_one(
        {"cheque_id": cheque_id},
        {"$set": {
            "is_disabled": False,
            "retrieved_at": now,
            "retrieved_by": user.user_id,
            "retrieved_by_name": user.name,
            "retrieve_reason": payload.reason.strip(),
            "updated_at": now,
        },
         "$unset": {"disabled_at": "", "disabled_by": "", "disabled_by_name": "", "disable_reason": ""}}
    )
    await create_audit_log(user.user_id, "retrieve", "cheque", cheque_id, {
        "cheque_number": cheque.get("cheque_number"),
        "amount": cheque.get("amount"),
        "reason": payload.reason.strip(),
    })
    return {"message": f"Cheque {cheque.get('cheque_number')} retrieved to Received tab", "cheque_id": cheque_id}


@router.delete("/accountant/cheques/{cheque_id}/hard")
async def hard_delete_cheque(cheque_id: str, payload: ChequeHardDeleteRequest, user: User = Depends(get_current_user)):
    """Hard-delete a disabled cheque permanently.

    Rules:
      • Super Admin ONLY.
      • Cheque must already be disabled (use /disable first).
      • Requires login password + reason.
      • Audit log is written BEFORE the document is removed.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can permanently delete cheques")
    if not (payload.reason or '').strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    await _verify_user_password(user, payload.password)

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if not cheque.get("is_disabled"):
        raise HTTPException(status_code=400, detail="Only disabled cheques can be permanently deleted")

    await create_audit_log(user.user_id, "hard_delete", "cheque", cheque_id, {
        "cheque_number": cheque.get("cheque_number"),
        "amount": cheque.get("amount"),
        "party_name": cheque.get("party_name"),
        "project_id": cheque.get("project_id"),
        "reason": payload.reason.strip(),
        "was_disabled_reason": cheque.get("disable_reason"),
    })
    await db.cheques.delete_one({"cheque_id": cheque_id})
    return {"message": f"Cheque {cheque.get('cheque_number')} permanently deleted", "cheque_id": cheque_id}


@router.get("/cheques/{cheque_id}/usage")
async def get_cheque_usage(cheque_id: str, user: User = Depends(get_current_user)):
    """Return everywhere this cheque touched the books:
       • The cheque master record (with bank/party/project/status).
       • All payment_stages that were settled by it (with project + collected date).
       • All income rows linked to it (for incoming cheques).
       • The recorded_expense if the cheque was endorsed to a vendor.
       • The original approval row (material/labour) if this cheque paid a vendor bill.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")

    # Diagnostic flags surfaced to the popup so users understand WHY no
    # income is linked when the cheque has a dangling reference.
    diagnostics = {
        "orphan_income_id": None,
        "orphan_project_id": None,
        "orphan_used_for_expense_id": None,
    }
    if cheque.get("income_id"):
        _exists = await db.income.find_one({"income_id": cheque["income_id"]}, {"_id": 0, "income_id": 1})
        if not _exists:
            diagnostics["orphan_income_id"] = cheque["income_id"]
    if cheque.get("project_id"):
        _exists = await db.projects.find_one({"project_id": cheque["project_id"]}, {"_id": 0, "project_id": 1})
        if not _exists:
            diagnostics["orphan_project_id"] = cheque["project_id"]
    if cheque.get("used_for_expense_id"):
        _exists = await db.recorded_expenses.find_one({"expense_id": cheque["used_for_expense_id"]}, {"_id": 0, "expense_id": 1})
        if not _exists:
            diagnostics["orphan_used_for_expense_id"] = cheque["used_for_expense_id"]

    # If the cheque has no project_id but DOES have a party_name, try to resolve
    # the project by matching the party_name against client_name in projects.
    # Manually-added cheques sometimes skip project_id but their party_name maps
    # 1:1 to a project's client.
    resolved_project_id = cheque.get("project_id")
    resolved_project_name = None
    if not resolved_project_id and cheque.get("party_name"):
        proj_match = await db.projects.find_one(
            {"$or": [
                {"client_name": cheque["party_name"]},
                {"name": {"$regex": f"^{cheque['party_name']}$", "$options": "i"}},
                {"name": {"$regex": cheque["party_name"], "$options": "i"}},
            ]},
            {"_id": 0, "project_id": 1, "name": 1},
        )
        if proj_match:
            resolved_project_id = proj_match["project_id"]
            resolved_project_name = proj_match["name"]

    # Build the OR-clauses used in the bounce flow so the popup is
    # consistent with what the reversal will actually touch.
    # IMPORTANT: cheque_number is NOT unique across projects/parties — many
    # banks recycle the same numbers — so any cheque_number match MUST be
    # scoped to the same project_id when one can be determined.
    or_clauses = [{"cheque_id": cheque_id}]
    if cheque.get("income_id"):
        or_clauses.append({"income_id": cheque["income_id"]})
    if cheque.get("bulk_collection_id"):
        or_clauses.append({"bulk_collection_id": cheque["bulk_collection_id"]})
    if cheque.get("cheque_number"):
        effective_project = resolved_project_id
        # STRICT cheque_number fallback: require number + amount + project ALL
        # to match. cheque_number alone is recycled by banks and short numbers
        # like "5" leak everywhere; amount + project locks it down.
        if effective_project and cheque.get("amount") is not None:
            or_clauses.append({
                "payment_reference": cheque["cheque_number"],
                "project_id": effective_project,
                "amount": cheque["amount"],
            })
            or_clauses.append({
                "cheque_number": cheque["cheque_number"],
                "project_id": effective_project,
                "amount": cheque["amount"],
            })
        elif cheque.get("amount") is not None:
            or_clauses.append({
                "payment_reference": cheque["cheque_number"],
                "amount": cheque["amount"],
            })

    incomes = await db.income.find({"$or": or_clauses}, {"_id": 0}).to_list(500)
    incomes = list({inc["income_id"]: inc for inc in incomes if inc.get("income_id")}.values())

    # Stages linked via the incomes
    stage_ids = [i.get("payment_stage_id") or i.get("stage_id") for i in incomes if i.get("payment_stage_id") or i.get("stage_id")]
    stages = []
    if stage_ids:
        stages = await db.payment_stages.find({"stage_id": {"$in": stage_ids}}, {"_id": 0}).to_list(500)

    # Enrich each stage with project name + the income that linked it
    project_cache = {}
    async def _proj_name(pid):
        if not pid:
            return None
        if pid in project_cache:
            return project_cache[pid]
        p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
        nm = p["name"] if p else None
        project_cache[pid] = nm
        return nm

    enriched_stages = []
    income_by_stage = {i.get("payment_stage_id") or i.get("stage_id"): i for i in incomes}
    for st in stages:
        sid = st.get("stage_id")
        inc = income_by_stage.get(sid)
        enriched_stages.append({
            "stage_id": sid,
            "stage_name": st.get("stage_name"),
            "stage_label": st.get("stage_label"),
            "project_id": st.get("project_id"),
            "project_name": await _proj_name(st.get("project_id")),
            "amount": st.get("amount"),
            "collected_amount": (inc.get("amount") if inc else st.get("collected_amount")),
            "collected_at": (inc.get("payment_date") if inc else None) or st.get("collected_at"),
            "status": st.get("status"),
            "cheque_bounced": bool(st.get("cheque_bounced")),
            "collected_by_name": st.get("collected_by_name") or (inc.get("collected_by_name") if inc else None),
            "payment_mode": st.get("payment_mode") or (inc.get("payment_mode") if inc else None),
        })

    # Enriched income rows (always shown — covers advance/non-stage incomes too)
    enriched_incomes = []
    # Cache for user role/designation lookups
    user_cache = {}
    async def _user_info(uid):
        if not uid:
            return {}
        if uid in user_cache:
            return user_cache[uid]
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "name": 1, "role": 1, "designation": 1})
        info = {
            "name": (u or {}).get("name"),
            "role": (u or {}).get("role"),
            "designation": (u or {}).get("designation"),
        } if u else {}
        user_cache[uid] = info
        return info

    for inc in incomes:
        sid = inc.get("payment_stage_id") or inc.get("stage_id")
        # If income has a stage, surface that stage name from the stages list
        stage_name = None
        stage_month = None
        if sid:
            stage_obj = next((s for s in stages if s.get("stage_id") == sid), None)
            if stage_obj:
                stage_name = stage_obj.get("stage_name") or stage_obj.get("stage_label")
                stage_month = stage_obj.get("month") or stage_obj.get("scheduled_month") or stage_obj.get("month_key")
        # Resolve collector role/designation
        creator_uid = inc.get("collected_by") or inc.get("recorded_by") or inc.get("created_by")
        user_info = await _user_info(creator_uid) if creator_uid else {}
        # Infer income category for UI grouping
        raw_cat = (inc.get("category") or "").lower()
        if sid:
            inc_kind = "stage"
        elif "advance" in raw_cat or "deal" in raw_cat or "booking" in raw_cat:
            inc_kind = "advance"
        else:
            inc_kind = "manual"
        enriched_incomes.append({
            "income_id": inc.get("income_id"),
            "project_id": inc.get("project_id"),
            "project_name": inc.get("project_name") or await _proj_name(inc.get("project_id")),
            "amount": inc.get("amount"),
            "payment_mode": inc.get("payment_mode"),
            "payment_reference": inc.get("payment_reference"),
            "payment_date": inc.get("payment_date") or inc.get("created_at"),
            "stage_id": sid,
            "stage_name": stage_name or inc.get("stage") or inc.get("sub_category"),
            "stage_month": stage_month,
            "category": inc.get("category"),
            "kind": inc_kind,  # stage / manual / advance
            "collected_by_name": inc.get("collected_by_name") or user_info.get("name"),
            "collected_by_role": user_info.get("role"),
            "collected_by_designation": user_info.get("designation"),
            "status": inc.get("status"),
            "description": inc.get("description"),
        })

    # Expense side (if cheque was endorsed to a vendor)
    expense_info = None
    if cheque.get("used_for_expense_id"):
        rec_exp = await db.recorded_expenses.find_one({"expense_id": cheque["used_for_expense_id"]}, {"_id": 0})
        if rec_exp:
            req_id = rec_exp.get("approval_id") or rec_exp.get("request_id")
            req_type = rec_exp.get("request_type") or rec_exp.get("category")
            approval = None
            if req_id and req_type == "material":
                approval = await db.material_expenses.find_one({"expense_id": req_id}, {"_id": 0})
            elif req_id and req_type == "labour":
                approval = await db.labour_expenses.find_one({"labour_expense_id": req_id}, {"_id": 0})
            expense_info = {
                "expense_id": rec_exp.get("expense_id"),
                "approval_id": req_id,
                "request_type": req_type,
                "vendor_name": rec_exp.get("vendor_name"),
                "amount": rec_exp.get("amount"),
                "project_id": rec_exp.get("project_id"),
                "project_name": await _proj_name(rec_exp.get("project_id")),
                "paid_at": rec_exp.get("approved_at") or rec_exp.get("created_at"),
                "status": rec_exp.get("status"),
                "description": rec_exp.get("description") or (approval.get("material_name") if approval else None),
            }

    # Project name on the cheque itself — fall back to party_name-resolved project
    cheque_project_name = await _proj_name(cheque.get("project_id")) or resolved_project_name

    total_collected = sum(float(s.get("collected_amount") or 0) for s in enriched_stages)
    total_income = sum(float(i.get("amount") or 0) for i in enriched_incomes)

    # Diagnostic: when nothing was found, surface a list of nearby
    # candidates. Strict requirements: BOTH amount AND non-empty party_name
    # must be set on the cheque — otherwise the scan would blindly match by
    # amount alone and pull unrelated rows (e.g., a ₹5L SBI cheque with empty
    # party_name would surface every ₹5L collection in the DB).
    candidate_incomes = []
    party = (cheque.get("party_name") or "").strip()
    if not enriched_incomes and cheque.get("amount") and party:
        candidate_query = {
            "amount": cheque["amount"],
            "$or": [
                {"description": {"$regex": party, "$options": "i"}},
                {"sub_category": {"$regex": party, "$options": "i"}},
                {"remarks": {"$regex": party, "$options": "i"}},
                {"project_name": {"$regex": party, "$options": "i"}},
            ],
        }
        nearby = await db.income.find(candidate_query, {"_id": 0}).limit(20).to_list(20)
        for inc in nearby:
            candidate_incomes.append({
                "income_id": inc.get("income_id"),
                "project_name": inc.get("project_name") or await _proj_name(inc.get("project_id")),
                "amount": inc.get("amount"),
                "payment_mode": inc.get("payment_mode"),
                "payment_reference": inc.get("payment_reference"),
                "payment_date": inc.get("payment_date") or inc.get("created_at"),
                "collected_by_name": inc.get("collected_by_name"),
                "category": inc.get("category"),
                "description": inc.get("description"),
                "status": inc.get("status"),
            })

    return {
        "cheque": {
            **cheque,
            "project_name": cheque_project_name,
            "resolved_project_id": resolved_project_id,  # what we used for scoping
            "creator_name": cheque.get("recorded_by_name") or cheque.get("created_by_name"),
        },
        "incomes": enriched_incomes,
        "stages_settled": enriched_stages,
        "expense": expense_info,
        "candidate_incomes": candidate_incomes,  # diagnostic — only populated when nothing was found
        "diagnostics": diagnostics,
        "summary": {
            "total_stages_settled": len(enriched_stages),
            "total_collected_amount": total_collected,
            "total_incomes": len(enriched_incomes),
            "total_income_amount": total_income,
            "is_used_for_expense": bool(expense_info),
            "has_candidates": len(candidate_incomes) > 0,
        },
    }



# ==================== ACCOUNTANT APPROVAL SYSTEM ====================

class ApprovalAction(BaseModel):
    remarks: Optional[str] = None


@router.get("/accountant/approvals")
async def get_accountant_approvals(user: User = Depends(get_current_user)):
    """Get all pending and recent approval requests for the accountant"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can access approvals")

    pending = await db.approval_requests.find(
        {"status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    recent = await db.approval_requests.find(
        {"status": {"$in": ["approved", "rejected"]}}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)

    summary = {
        "pending_count": len(pending),
        "pending_income": sum(r["amount"] for r in pending if r["entry_type"] == "income"),
        "pending_expense": sum(r["amount"] for r in pending if r["entry_type"] == "expense"),
    }

    return {"pending": pending, "recent": recent, "summary": summary}


@router.patch("/accountant/approvals/{approval_id}/approve")
async def approve_request(approval_id: str, data: ApprovalAction = None, user: User = Depends(get_current_user)):
    """Accountant approves a pending income/expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")

    req = await db.approval_requests.find_one({"approval_id": approval_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")

    now = datetime.now(timezone.utc).isoformat()
    remarks = (data.remarks if data else None) or ""

    await db.approval_requests.update_one(
        {"approval_id": approval_id},
        {"$set": {"status": "approved", "approved_by": user.user_id, "approved_by_name": user.name, "approved_at": now, "remarks": remarks, "updated_at": now}}
    )

    # Record in the actual cashbook
    if req["entry_type"] == "income":
        income_doc = {
            "income_id": f"inc_{uuid.uuid4().hex[:12]}",
            "project_id": req.get("project_id"),
            "stage": req.get("stage", ""),
            "description": req.get("description", ""),
            "amount": req["amount"],
            "payment_mode": req.get("payment_mode", "cash"),
            "reference_number": req.get("reference", ""),
            "payment_date": req.get("payment_date", now),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "remarks": f"[Approval] {req.get('description','')} - {remarks}",
            "source": "approval",
            "approval_id": approval_id,
            "created_at": now,
        }
        await db.income.insert_one(income_doc)
    else:
        expense_doc = {
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": req.get("project_id"),
            "project_name": req.get("project_name", ""),
            "category": req.get("category", "other"),
            "description": req.get("description", ""),
            "amount": req["amount"],
            "payment_method": req.get("payment_mode", "cash"),
            "vendor_name": req.get("vendor_name", ""),
            "reference": req.get("reference", ""),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "source": "approval",
            "approval_id": approval_id,
            "work_order_id": req.get("work_order_id"),
            "created_at": now,
        }
        await db.recorded_expenses.insert_one(expense_doc)

    # Notify requester
    if req.get("requested_by"):
        await create_notification(req["requested_by"], f"Your {req['entry_type']} request for ₹{req['amount']:,.0f} has been approved")

    return {"message": f"{req['entry_type'].capitalize()} approved and recorded", "approval_id": approval_id}


@router.patch("/accountant/approvals/{approval_id}/reject")
async def reject_request(approval_id: str, data: ApprovalAction = None, user: User = Depends(get_current_user)):
    """Accountant rejects a pending income/expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")

    req = await db.approval_requests.find_one({"approval_id": approval_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")

    now = datetime.now(timezone.utc).isoformat()
    remarks = (data.remarks if data else None) or ""

    await db.approval_requests.update_one(
        {"approval_id": approval_id},
        {"$set": {"status": "rejected", "rejected_by": user.user_id, "rejected_by_name": user.name, "rejected_at": now, "remarks": remarks, "updated_at": now}}
    )

    if req.get("requested_by"):
        await create_notification(req["requested_by"], f"Your {req['entry_type']} request for ₹{req['amount']:,.0f} was rejected. Reason: {remarks}")

    return {"message": f"{req['entry_type'].capitalize()} rejected", "approval_id": approval_id}

# ==================== UNIFIED PAY APPROVAL ENDPOINT ====================
# Single endpoint handles payment for material/labour/petty_cash requests.
# Logic:
#   1. Look up the request by type+id, fetch bill_amount + vendor_name + project_id
#   2. Look up existing vendor suspense balance
#   3. Compute payable = max(0, bill_amount - existing_suspense)
#   4. credit_used = min(existing_suspense, bill_amount)  → debits (reduces) old suspense
#   5. If method == cheque: paid = chosen_cheque.amount; new_suspense_credit = paid - payable
#   6. Else: paid = payable; new_suspense_credit = 0
#   7. Insert recorded_expenses entry (cashbook outgoing)
#   8. Insert suspense_entries adjustments (debit + new credit if any)
#   9. Mark cheque used / set request status='paid'

class PaymentDenomination(BaseModel):
    note: int
    count: int

class PaymentLeg(BaseModel):
    method: str  # cash / current_account / savings / cheque
    amount: float
    transaction_id: Optional[str] = None
    cheque_ids: Optional[List[str]] = None
    denominations: Optional[List[PaymentDenomination]] = None

class PayApprovalRequest(BaseModel):
    # New multi-leg path (preferred): a single request can split across cheque + cash + bank
    payment_legs: Optional[List[PaymentLeg]] = None
    # Legacy single-leg fields (still supported for backward compatibility)
    payment_method: Optional[str] = None
    transaction_id: Optional[str] = None
    cheque_id: Optional[str] = None
    cheque_ids: Optional[List[str]] = None
    denominations: Optional[List[PaymentDenomination]] = None
    remarks: Optional[str] = None


def _request_collection_and_keys(req_type: str):
    """Map request type to collection + ID field + amount field + vendor field + project field"""
    if req_type == "material":
        return ("material_expenses", "expense_id",
                lambda r: r.get("final_amount") or r.get("estimated_cost") or r.get("estimated_price") or r.get("final_price") or 0,
                lambda r: r.get("vendor_name") or r.get("supplier_name") or r.get("material_name") or "Unknown",
                "project_id", "material")
    if req_type == "labour":
        return ("labour_expenses", "labour_expense_id",
                lambda r: r.get("total_amount") or 0,
                lambda r: r.get("contractor_name") or "Unknown Contractor",
                "project_id", "labour")
    if req_type == "petty_cash":
        # Petty cash collection is `db.petty_cash` (NOT petty_cash_requests).
        # Suspense for petty cash is keyed by the requesting Site Engineer
        # (one SE may have multiple petty cash requests over time).
        return ("petty_cash", "petty_cash_id",
                lambda r: r.get("amount_requested") or r.get("amount_issued") or r.get("amount_spent") or 0,
                lambda r: r.get("requested_by_name") or r.get("site_engineer_name") or r.get("vendor_name") or "Petty Cash",
                "project_id", "petty_cash")
    raise HTTPException(status_code=400, detail=f"Invalid request type: {req_type}")


@router.get("/approvals/{req_type}/{request_id}/pay-context")
async def get_pay_context(req_type: str, request_id: str, user: User = Depends(get_current_user)):
    """Returns request details + current suspense balance + active opened cheques (for the dialog)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    coll, id_field, amount_fn, vendor_fn, _project_field, suspense_type = _request_collection_and_keys(req_type)
    req = await db[coll].find_one({id_field: request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    bill_amount = float(amount_fn(req) or 0)
    vendor_name = vendor_fn(req)
    project_id = req.get("project_id")

    # Project name lookup
    project_name = None
    if project_id:
        p = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
        if p: project_name = p.get("name")

    # Vendor suspense balance — sum existing entries
    suspense_query = {"type": suspense_type}
    if suspense_type == "material":
        suspense_query["vendor_name"] = vendor_name
    elif suspense_type == "labour":
        suspense_query["contractor_name"] = vendor_name
    else:  # petty_cash — keyed by Site Engineer (requested_by) so SE-level credit rolls forward
        se_id = req.get("requested_by") or req.get("site_engineer_id")
        if se_id:
            suspense_query["site_engineer_id"] = se_id
        else:
            suspense_query["vendor_name"] = vendor_name
    suspense_entries = await db.suspense_entries.find(suspense_query, {"_id": 0}).to_list(1000)
    existing_suspense = sum(float(e.get("amount", 0) or 0) for e in suspense_entries)

    # All active CRE-opened incoming cheques that haven't been consumed yet.
    # Status sub-state (issued / received / post_dated / deposited) doesn't matter
    # for picking — we only exclude terminally-resolved ones (bounced, cancelled, cleared).
    _excluded_status = ["bounced", "cancelled", "cleared", "rejected"]
    active_cheques = await db.cheques.find({
        "cheque_type": "incoming",
        "is_opened": True,
        "status": {"$nin": _excluded_status},
        "$or": [{"used_for_expense_id": {"$exists": False}}, {"used_for_expense_id": None}],
    }, {"_id": 0}).sort("cheque_date", -1).to_list(200)

    # Inactive (locked / not yet CRE-opened) incoming cheques — Accountant can "Request Open"
    inactive_cheques = await db.cheques.find({
        "cheque_type": "incoming",
        "is_opened": {"$ne": True},
        "status": {"$nin": _excluded_status},
        "$or": [{"used_for_expense_id": {"$exists": False}}, {"used_for_expense_id": None}],
    }, {"_id": 0}).sort("cheque_date", -1).to_list(200)

    # Enrich with project name for both lists
    project_cache = {}
    for ch in (active_cheques + inactive_cheques):
        pid = ch.get("project_id")
        if pid and pid not in project_cache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            project_cache[pid] = p["name"] if p else None
        if pid:
            ch["project_name"] = project_cache.get(pid) or ch.get("project_name")

    payable = max(0.0, bill_amount - existing_suspense)
    credit_used = min(existing_suspense, bill_amount)

    # Partial payment continuation — if the request already has paid_amount from
    # a prior partial settlement, the remaining payable shrinks accordingly and
    # suspense was already consumed in the first call.
    already_paid = float(req.get("paid_amount") or 0)
    is_continuation = already_paid > 0 and req.get("status") == "partially_paid"
    if is_continuation:
        # Suspense was already credited; do not double-apply.
        credit_used = 0.0
        payable = max(0.0, bill_amount - already_paid)

    return {
        "request": {
            "id": request_id,
            "type": req_type,
            "vendor_name": vendor_name,
            "project_id": project_id,
            "project_name": project_name,
            "bill_amount": bill_amount,
            "already_paid": already_paid,
            "is_continuation": is_continuation,
            "description": req.get("material_name") or req.get("labour_type") or req.get("description") or "",
            "current_status": req.get("status"),
        },
        "suspense": {
            "vendor_balance": existing_suspense if not is_continuation else 0.0,
            "credit_to_apply": credit_used,
        },
        "payable_after_suspense": payable,
        "active_cheques": active_cheques,
        "inactive_cheques": inactive_cheques,
    }


@router.post("/approvals/{req_type}/{request_id}/pay")
async def pay_approval(req_type: str, request_id: str, data: PayApprovalRequest, user: User = Depends(get_current_user)):
    """Process payment for an expense approval (material/labour/petty_cash).

    Supports both single-method (legacy) and multi-leg payments.  When
    `payment_legs` is supplied the accountant can mix cheque + cash + bank in
    one call.  Partial payments are allowed: if the total paid across all
    legs is less than the payable, the request stays in the queue with
    status='partially_paid' and `paid_amount` accumulates.  Excess (only from
    cheque legs — cash/bank legs must be exact) flows to vendor suspense.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    coll, id_field, amount_fn, vendor_fn, _proj_field, suspense_type = _request_collection_and_keys(req_type)
    req = await db[coll].find_one({id_field: request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") in ("paid", "settled", "rejected"):
        raise HTTPException(status_code=400, detail=f"Already processed (status={req.get('status')})")

    bill_amount = float(amount_fn(req) or 0)
    vendor_name = vendor_fn(req)
    project_id = req.get("project_id")
    already_paid = float(req.get("paid_amount") or 0)
    is_continuation = already_paid > 0 and req.get("status") == "partially_paid"

    # 1. Existing suspense balance — only auto-apply on the FIRST payment call.
    # On continuation (partial) payments, the original suspense was already
    # consumed during the first call so we don't re-apply.
    existing_suspense = 0.0
    credit_used = 0.0
    if not is_continuation:
        suspense_query = {"type": suspense_type}
        if suspense_type == "material":
            suspense_query["vendor_name"] = vendor_name
        elif suspense_type == "labour":
            suspense_query["contractor_name"] = vendor_name
        else:
            se_id = req.get("requested_by") or req.get("site_engineer_id")
            if se_id:
                suspense_query["site_engineer_id"] = se_id
            else:
                suspense_query["vendor_name"] = vendor_name
        sus_entries = await db.suspense_entries.find(suspense_query, {"_id": 0}).to_list(1000)
        existing_suspense = sum(float(e.get("amount", 0) or 0) for e in sus_entries)
        credit_used = min(max(0.0, existing_suspense), bill_amount)

    # Net payable after suspense credit + prior partial payments
    payable = max(0.0, bill_amount - credit_used - already_paid)

    # 2. Normalize input → list of legs.
    # Fast-path: if there's nothing to pay (suspense fully covered the bill),
    # skip all leg parsing/validation regardless of what the caller sent.
    if payable <= 0:
        legs = []
    elif data.payment_legs:
        legs = list(data.payment_legs)
    elif data.payment_method:
        ch_ids = list(data.cheque_ids or [])
        if data.cheque_id and data.cheque_id not in ch_ids:
            ch_ids.append(data.cheque_id)
        # For legacy cheque single-method, the leg amount must equal the cheque
        # face value (cheques are indivisible). Excess flows to suspense.
        if data.payment_method == "cheque" and ch_ids:
            ch_face_total = 0.0
            for cid in ch_ids:
                _cd = await db.cheques.find_one({"cheque_id": cid}, {"_id": 0, "amount": 1})
                if _cd:
                    ch_face_total += float(_cd.get("amount", 0) or 0)
            legacy_amount = ch_face_total
        else:
            legacy_amount = payable
        legs = [PaymentLeg(
            method=data.payment_method,
            amount=legacy_amount,
            transaction_id=data.transaction_id,
            cheque_ids=ch_ids or None,
            denominations=data.denominations,
        )]
    else:
        raise HTTPException(status_code=400, detail="Either payment_legs or payment_method must be supplied")

    # 3. Validate each leg & compute totals
    total_leg_amount = 0.0
    total_cheque_amount = 0.0  # sum of face values of cheques in cheque legs
    cheque_docs = []  # all selected cheque docs across legs
    for leg in legs:
        leg_amount = float(leg.amount or 0)
        if leg_amount <= 0:
            raise HTTPException(status_code=400, detail=f"Leg amount must be > 0 (method={leg.method})")
        if leg.method == "cheque":
            if not leg.cheque_ids:
                raise HTTPException(status_code=400, detail="Cheque leg requires at least one cheque_id")
            for cid in leg.cheque_ids:
                cd = await db.cheques.find_one({"cheque_id": cid}, {"_id": 0})
                if not cd:
                    raise HTTPException(status_code=404, detail=f"Cheque {cid} not found")
                if not cd.get("is_opened"):
                    raise HTTPException(status_code=400, detail=f"Cheque {cd.get('cheque_number')} is not opened by CRE yet")
                if cd.get("used_for_expense_id"):
                    raise HTTPException(status_code=400, detail=f"Cheque {cd.get('cheque_number')} has already been used")
                if any(c["cheque_id"] == cid for c in cheque_docs):
                    raise HTTPException(status_code=400, detail=f"Cheque {cd.get('cheque_number')} selected twice")
                cheque_docs.append(cd)
                total_cheque_amount += float(cd.get("amount", 0) or 0)
            # leg.amount must equal sum of its cheques
            leg_chq_total = sum(float(c.get("amount", 0) or 0) for c in cheque_docs if c["cheque_id"] in (leg.cheque_ids or []))
            if abs(leg_chq_total - leg_amount) > 0.5:
                raise HTTPException(status_code=400, detail=f"Cheque leg amount ₹{leg_amount:,.0f} must match selected cheques total ₹{leg_chq_total:,.0f}")
        elif leg.method in ("current_account", "savings"):
            if not leg.transaction_id or not leg.transaction_id.strip():
                raise HTTPException(status_code=400, detail=f"transaction_id required for {leg.method} leg")
        elif leg.method == "cash":
            if not leg.denominations:
                raise HTTPException(status_code=400, detail="denominations required for cash leg")
            denom_total = sum(d.note * d.count for d in leg.denominations)
            if abs(denom_total - leg_amount) > 0.5:
                raise HTTPException(status_code=400, detail=f"Cash denominations ₹{denom_total:,.0f} ≠ leg amount ₹{leg_amount:,.0f}")
        else:
            raise HTTPException(status_code=400, detail=f"Invalid leg method: {leg.method}")
        total_leg_amount += leg_amount

    # 4. Excess logic: only cheque legs can produce excess (they're indivisible
    #    face values). Cash/bank legs must equal the amount stated. So the
    #    accountant's "intended-to-pay" cash+bank+cheque-face-values must NOT
    #    exceed payable + cheque-allowed-excess.
    non_cheque_total = sum(float(l.amount or 0) for l in legs if l.method != "cheque")
    if non_cheque_total > payable + 0.5:
        raise HTTPException(status_code=400, detail=f"Cash/bank legs total ₹{non_cheque_total:,.0f} exceeds payable ₹{payable:,.0f} — adjust amounts (only cheque excess is allowed to roll to suspense)")

    # 5. Bucket the payment:
    #   • effective_paid: amount that settles the bill (≤ payable)
    #   • new_suspense_credit: cheque excess that rolls to vendor suspense
    if total_leg_amount <= payable:
        effective_paid = total_leg_amount
        new_suspense_credit = 0.0
    else:
        # Only cheque-leg excess is allowed (validated above)
        effective_paid = payable
        new_suspense_credit = total_leg_amount - payable

    is_full_payment = (already_paid + effective_paid + credit_used) >= bill_amount - 0.5

    now = datetime.now(timezone.utc).isoformat()
    primary_expense_id = f"exp_{uuid.uuid4().hex[:12]}"

    # 6. Insert one recorded_expense per leg (clean audit) — first leg uses
    # `primary_expense_id`, the rest get their own ids but link to primary.
    cheque_ids_used_all = [c["cheque_id"] for c in cheque_docs] if cheque_docs else []
    cheque_numbers_used = [c.get("cheque_number") for c in cheque_docs] if cheque_docs else []
    leg_expense_ids = []
    for idx, leg in enumerate(legs):
        leg_exp_id = primary_expense_id if idx == 0 else f"exp_{uuid.uuid4().hex[:12]}"
        leg_expense_ids.append(leg_exp_id)
        leg_cheque_ids = list(leg.cheque_ids or [])
        await db.recorded_expenses.insert_one({
            "expense_id": leg_exp_id,
            "project_id": project_id,
            "category": suspense_type,
            "expense_type": suspense_type,
            "description": req.get("material_name") or req.get("labour_type") or f"{suspense_type} payment",
            "amount": float(leg.amount),  # cheque legs carry face value; excess is separately credited
            "payment_method": leg.method,
            "transaction_id": leg.transaction_id,
            "cheque_id": leg_cheque_ids[0] if leg_cheque_ids else None,
            "cheque_ids": leg_cheque_ids,
            "denominations": [d.model_dump() for d in (leg.denominations or [])],
            "vendor_name": vendor_name,
            "request_id": request_id,
            "request_type": req_type,
            "credit_applied": credit_used if idx == 0 else 0,
            "new_suspense_credit": new_suspense_credit if idx == 0 else 0,
            "leg_index": idx,
            "leg_count": len(legs),
            "primary_expense_id": primary_expense_id,
            "is_partial": not is_full_payment,
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "remarks": data.remarks,
            "status": "approved",
            "source": "approval",
            "approval_id": request_id,
            "created_at": now,
            "approved_at": now,
            "approved_by": user.user_id,
        })

    # 7. Suspense ledger updates — only on the first call so we don't double-debit
    def _suspense_key():
        if suspense_type == "material":
            return {"vendor_name": vendor_name}
        if suspense_type == "labour":
            return {"contractor_name": vendor_name}
        se_id = req.get("requested_by") or req.get("site_engineer_id")
        if se_id:
            return {"site_engineer_id": se_id, "site_engineer_name": vendor_name}
        return {"vendor_name": vendor_name}

    if credit_used > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": suspense_type,
            **_suspense_key(),
            "amount": -credit_used,
            "description": f"Suspense applied to {req_type} bill (request {request_id})",
            "linked_expense_id": primary_expense_id,
            "linked_request_id": request_id,
            "created_at": now,
            "created_by": user.user_id,
        })
    if new_suspense_credit > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": suspense_type,
            **_suspense_key(),
            "amount": new_suspense_credit,
            "description": f"Excess from cheque(s) {', '.join(cheque_numbers_used)} on {req_type} bill ({request_id})",
            "linked_expense_id": primary_expense_id,
            "linked_cheque_ids": cheque_ids_used_all,
            "created_at": now,
            "created_by": user.user_id,
        })

    # 8. Mark all selected cheques as used
    for cd in cheque_docs:
        await db.cheques.update_one(
            {"cheque_id": cd["cheque_id"]},
            {"$set": {
                "used_for_expense_id": primary_expense_id,
                "used_at": now,
                "used_by": user.user_id,
                "used_by_name": user.name,
                "status": "deposited" if cd.get("status") == "issued" else cd.get("status"),
                "updated_at": now,
            }}
        )

    # 9. Update request status — fully paid or partially paid
    new_total_paid = already_paid + effective_paid
    # Feb 19 2026 — Reflect the accountant's actual payment mode on the
    # parent request doc (labour_expenses / material_requests / petty_cash)
    # so the Cashbook Expense list shows the right mode pill. For multi-leg
    # mixed payments we store "multi" so the UI doesn't lie.
    if legs:
        leg_methods = {l.method for l in legs}
        actual_method = next(iter(leg_methods)) if len(leg_methods) == 1 else "multi"
    else:
        actual_method = req.get("payment_method")
    request_update = {
        "paid_amount": new_total_paid,
        "paid_via_expense_id": primary_expense_id,
        "payment_method": actual_method,
        "updated_at": now,
    }
    if is_full_payment:
        request_update.update({
            "status": "paid",
            "paid_by": user.user_id,
            "paid_by_name": user.name,
            "paid_at": now,
            # Clear any cheque-bounce flag once balance is settled afresh
            "cheque_bounced": False,
        })
    else:
        request_update["status"] = "partially_paid"
        request_update["last_partial_paid_at"] = now
        request_update["last_partial_paid_by"] = user.user_id
        request_update["last_partial_paid_by_name"] = user.name
        request_update["remaining_balance"] = max(0.0, bill_amount - credit_used - new_total_paid)
    await db[coll].update_one({id_field: request_id}, {"$set": request_update})

    # 10. Phase cascade for material requests — only on FULL payment
    if req_type == "material" and is_full_payment:
        source_req_id = req.get("source_request_id")
        phase = (req.get("payment_phase") or "full").lower()
        if source_req_id:
            parent = await db.material_requests.find_one({"request_id": source_req_id}, {"_id": 0})
            if parent:
                parent_update = {"updated_at": now}
                notify_se_msg = None
                if phase == "advance":
                    parent_update.update({
                        "status": "in_transit",
                        "transit_started_at": now,
                        "transit_started_by": user.user_id,
                        "advance_paid_at": now,
                        "advance_paid_by": user.user_id,
                        "advance_paid_by_name": user.name,
                        "advance_paid_amount": new_total_paid,
                        "next_payment_phase": "balance",
                    })
                    notify_se_msg = f"Advance approved — ready to collect: {parent.get('material_name')} → {parent.get('vendor_name', 'Vendor')}"
                else:
                    parent_update.update({
                        "status": "delivered",
                        "delivered_at": now,
                        "balance_paid_at": now,
                        "balance_paid_by": user.user_id,
                        "balance_paid_by_name": user.name,
                        "balance_paid_amount": new_total_paid,
                    })
                await db.material_requests.update_one(
                    {"request_id": source_req_id},
                    {"$set": parent_update},
                )
                if notify_se_msg and parent.get("site_engineer_id"):
                    try:
                        await create_notification(parent["site_engineer_id"], notify_se_msg)
                    except Exception:
                        pass

    await create_audit_log(user.user_id, "pay", req_type, request_id, {
        "bill_amount": bill_amount,
        "already_paid_before": already_paid,
        "credit_used": credit_used,
        "effective_paid_this_call": effective_paid,
        "new_total_paid": new_total_paid,
        "new_suspense": new_suspense_credit,
        "is_partial": not is_full_payment,
        "leg_count": len(legs),
    })

    return {
        "message": "Payment processed" if is_full_payment else "Partial payment recorded",
        "expense_id": primary_expense_id,
        "leg_expense_ids": leg_expense_ids,
        "bill_amount": bill_amount,
        "credit_used": credit_used,
        "payable": payable,
        "paid_amount": effective_paid,  # this call only (for backward compatibility in tests)
        "total_paid_so_far": new_total_paid,
        "remaining_balance": max(0.0, bill_amount - credit_used - new_total_paid),
        "new_suspense_credit": new_suspense_credit,
        "is_partial": not is_full_payment,
        "status": "paid" if is_full_payment else "partially_paid",
    }


# ==================== OTHER ACCOUNTS (Sub-contractors / Consultants / etc.) ====================

class OtherAccountCreate(BaseModel):
    name: str
    category: str  # free-text; standard set: sub_contractor / consultant / statutory / misc + any custom
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    branch: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None


class OtherAccountUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    branch: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None


@router.get("/other-accounts")
async def list_other_accounts(
    category: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    q: Dict[str, Any] = {}
    if category:
        q["category"] = category
    accounts = await db.other_accounts.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # Also return distinct categories so the FE can render a "type and add new" combo
    categories = await db.other_accounts.distinct("category")
    default_cats = ["sub_contractor", "consultant", "statutory", "misc"]
    merged = list(dict.fromkeys(default_cats + sorted([c for c in categories if c])))
    return {"accounts": accounts, "categories": merged}


@router.post("/other-accounts")
async def create_other_account(data: OtherAccountCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can create")
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Account name is required")
    cat = (data.category or "misc").strip().lower().replace(" ", "_") or "misc"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "account_id": f"oa_{uuid.uuid4().hex[:12]}",
        **data.model_dump(),
        "category": cat,
        "name": name,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
        "created_by_name": user.name,
    }
    await db.other_accounts.insert_one(doc)
    await create_audit_log(user.user_id, "create", "other_account", doc["account_id"], {"name": name, "category": cat})
    doc.pop("_id", None)
    return doc


@router.get("/other-accounts/{account_id}")
async def get_other_account(account_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    acc = await db.other_accounts.find_one({"account_id": account_id}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Other account not found")
    history = await db.recorded_expenses.find(
        {"other_account_id": account_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"account": acc, "history": history}


@router.patch("/other-accounts/{account_id}")
async def update_other_account(account_id: str, data: OtherAccountUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "category" in update:
        update["category"] = update["category"].strip().lower().replace(" ", "_") or "misc"
    if not update:
        return {"message": "Nothing to update"}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.other_accounts.update_one({"account_id": account_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Other account not found")
    await create_audit_log(user.user_id, "update", "other_account", account_id, update)
    return {"message": "Updated"}


@router.delete("/other-accounts/{account_id}")
async def deactivate_other_account(account_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can deactivate")
    res = await db.other_accounts.update_one(
        {"account_id": account_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Other account not found")
    return {"message": "Deactivated"}



# ==================== DIRECT TRANSFER (DT) WORKFLOW ====================

class DTSelection(BaseModel):
    kind: str  # material / labour / other_account
    request_id: Optional[str] = None  # for material/labour
    other_account_id: Optional[str] = None  # for other_account
    amount: float


class DTAssign(BaseModel):
    selections: List[DTSelection]


@router.get("/dt/payable-items")
async def list_dt_payable_items(user: User = Depends(get_current_user)):
    """Lists items the Accountant can mark for payment against a DT income.
    Returns: { material_requests, labour_requests, other_accounts }
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Material expenses awaiting payment (planning/procurement/account approved but unpaid)
    material = await db.material_expenses.find(
        {"status": {"$in": ["pending_accounts_approval", "procurement_priced", "planning_approved", "accounts_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Labour
    labour = await db.labour_expenses.find(
        {"status": {"$in": ["pending_accounts_approval", "planning_approved", "accounts_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Other accounts (active records with bank details)
    other = await db.other_accounts.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Enrich material/labour with project name
    pcache = {}
    for r in material + labour:
        pid = r.get("project_id")
        if pid and pid not in pcache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            pcache[pid] = p["name"] if p else "Unknown"
        if pid:
            r["project_name"] = pcache.get(pid, r.get("project_name") or "Unknown")

    return {
        "material_requests": material,
        "labour_requests": labour,
        "other_accounts": other,
    }


@router.post("/dt/{income_id}/assign")
async def assign_dt(income_id: str, data: DTAssign, user: User = Depends(get_current_user)):
    """Accountant assigns selected payable items to a DT income entry.
    Moves the DT into 'dt_pending_cre_recv' so CRE can mark received amounts.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can assign DT")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    if inc.get("payment_mode") != "direct_transfer":
        raise HTTPException(status_code=400, detail="This income is not a Direct Transfer")

    if not data.selections:
        raise HTTPException(status_code=400, detail="Select at least one item")

    # Allow exceeding DT amount per business rule (chunk paid later)
    enriched = []
    for s in data.selections:
        if s.amount <= 0:
            continue
        item = {"kind": s.kind, "amount": float(s.amount), "received_amount": 0.0, "status": "pending"}
        if s.kind == "material":
            mr = await db.material_expenses.find_one({"expense_id": s.request_id}, {"_id": 0}) if s.request_id else None
            if not mr:
                raise HTTPException(status_code=404, detail=f"Material expense {s.request_id} not found")
            item.update({
                "request_id": s.request_id,
                "title": mr.get("material_name") or "Material",
                "vendor_name": mr.get("vendor_name") or mr.get("supplier_name"),
                "vendor_id": mr.get("vendor_id"),
                "project_id": mr.get("project_id"),
            })
        elif s.kind == "labour":
            lr = await db.labour_expenses.find_one(
                {"$or": [{"labour_expense_id": s.request_id}, {"expense_id": s.request_id}]}, {"_id": 0}
            ) if s.request_id else None
            if not lr:
                raise HTTPException(status_code=404, detail=f"Labour expense {s.request_id} not found")
            item.update({
                "request_id": s.request_id,
                "title": lr.get("labour_type") or lr.get("description") or "Labour",
                "contractor_name": lr.get("contractor_name"),
                "contractor_id": lr.get("contractor_id"),
                "project_id": lr.get("project_id"),
            })
        elif s.kind == "other_account":
            oa = await db.other_accounts.find_one({"account_id": s.other_account_id}, {"_id": 0}) if s.other_account_id else None
            if not oa:
                raise HTTPException(status_code=404, detail=f"Other account {s.other_account_id} not found")
            item.update({
                "other_account_id": s.other_account_id,
                "title": oa.get("name"),
                "category": oa.get("category"),
            })
        else:
            raise HTTPException(status_code=400, detail=f"Invalid kind: {s.kind}")
        enriched.append(item)

    now = datetime.now(timezone.utc).isoformat()
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_status": "pending_cre_recv",
            "dt_items": enriched,
            "dt_assigned_at": now,
            "dt_assigned_by": user.user_id,
            "dt_assigned_by_name": user.name,
            "updated_at": now,
        }}
    )
    return {"message": "Assigned", "dt_status": "pending_cre_recv", "items_count": len(enriched)}


@router.get("/dt/{income_id}")
async def get_dt_detail(income_id: str, user: User = Depends(get_current_user)):
    """Get DT income with linked items + bank details (auto-fetched per item)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE, UserRole.SALES]:
        raise HTTPException(status_code=403, detail="Permission denied")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    if inc.get("payment_mode") != "direct_transfer":
        raise HTTPException(status_code=400, detail="Not a DT entry")
    items = inc.get("dt_items", []) or []
    # Enrich each item with bank details
    for it in items:
        if it.get("kind") == "material" and it.get("vendor_id"):
            v = await db.vendor_master.find_one({"vendor_id": it["vendor_id"]}, {"_id": 0})
            if v:
                it["bank"] = {
                    "name": v.get("name"),
                    "bank_name": v.get("bank_name"),
                    "branch": v.get("branch"),
                    "account_number": v.get("account_number"),
                    "ifsc_code": v.get("ifsc_code"),
                    "upi_id": v.get("upi_id"),
                }
        elif it.get("kind") == "labour" and it.get("contractor_id"):
            c = await db.contractors.find_one({"contractor_id": it["contractor_id"]}, {"_id": 0})
            if c:
                it["bank"] = {
                    "name": c.get("name"),
                    "bank_name": c.get("bank_name"),
                    "branch": c.get("branch"),
                    "account_number": c.get("account_number"),
                    "ifsc_code": c.get("ifsc_code"),
                    "upi_id": c.get("upi_id"),
                }
        elif it.get("kind") == "other_account" and it.get("other_account_id"):
            oa = await db.other_accounts.find_one({"account_id": it["other_account_id"]}, {"_id": 0})
            if oa:
                it["bank"] = {
                    "name": oa.get("name"),
                    "bank_name": oa.get("bank_name"),
                    "branch": oa.get("branch"),
                    "account_number": oa.get("account_number"),
                    "ifsc_code": oa.get("ifsc_code"),
                    "upi_id": oa.get("upi_id"),
                }
    return inc


class DTReceipt(BaseModel):
    receipts: List[Dict[str, Any]]  # [{index, received_amount}]


@router.post("/dt/{income_id}/receive")
async def cre_mark_dt_received(income_id: str, data: DTReceipt, user: User = Depends(get_current_user)):
    """CRE updates received amount per item & submits to Accountant for final approval."""
    if user.role not in [UserRole.CRE, UserRole.SALES, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE/Sales can mark received")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    items = inc.get("dt_items", []) or []
    if not items:
        raise HTTPException(status_code=400, detail="No items linked")
    for r in data.receipts:
        idx = int(r.get("index", -1))
        if 0 <= idx < len(items):
            items[idx]["received_amount"] = float(r.get("received_amount", 0) or 0)
            items[idx]["status"] = "received" if items[idx]["received_amount"] > 0 else "pending"
    now = datetime.now(timezone.utc).isoformat()
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_items": items,
            "dt_status": "pending_accountant_review",
            "dt_received_submitted_at": now,
            "dt_received_submitted_by": user.user_id,
            "dt_received_submitted_by_name": user.name,
            "updated_at": now,
        }}
    )
    return {"message": "Submitted to Accountant for review"}


@router.post("/dt/{income_id}/approve")
async def accountant_approve_dt(income_id: str, user: User = Depends(get_current_user)):
    """Accountant final approval after CRE submits received amounts.
    Books an expense entry per linked item and marks the underlying request as paid.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve DT")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    if inc.get("dt_status") != "pending_accountant_review":
        raise HTTPException(status_code=400, detail=f"Cannot approve in current state: {inc.get('dt_status')}")

    now = datetime.now(timezone.utc).isoformat()
    items = inc.get("dt_items", []) or []
    expense_ids: List[str] = []

    for it in items:
        recv = float(it.get("received_amount", 0) or 0)
        if recv <= 0:
            continue
        kind = it.get("kind")
        # category mapping for Direct-Expense reporting
        cat = "material" if kind == "material" else "labour" if kind == "labour" else "other"
        expense_id = f"exp_{uuid.uuid4().hex[:12]}"
        cashbook_entry = {
            "expense_id": expense_id,
            "project_id": it.get("project_id") or inc.get("project_id"),
            "category": cat,
            "expense_type": cat,
            "description": it.get("title") or f"{kind} payment via DT",
            "amount": recv,
            "payment_method": "direct_transfer",
            "vendor_name": it.get("vendor_name") or it.get("contractor_name") or it.get("title"),
            "request_id": it.get("request_id"),
            "request_type": kind,
            "other_account_id": it.get("other_account_id"),
            "source": "dt",
            "dt_income_id": income_id,
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "approved",
            "created_at": now,
            "approved_at": now,
            "approved_by": user.user_id,
        }
        await db.recorded_expenses.insert_one(cashbook_entry)
        expense_ids.append(expense_id)

        # Mark underlying material/labour request as paid (so it disappears from approvals)
        if kind == "material" and it.get("request_id"):
            await db.material_expenses.update_one(
                {"expense_id": it["request_id"]},
                {"$set": {
                    "status": "paid",
                    "paid_via": "direct_transfer",
                    "paid_via_dt_id": income_id,
                    "paid_via_expense_id": expense_id,
                    "paid_amount": recv,
                    "paid_by": user.user_id,
                    "paid_by_name": user.name,
                    "paid_at": now,
                    "updated_at": now,
                }}
            )
        elif kind == "labour" and it.get("request_id"):
            await db.labour_expenses.update_one(
                {"$or": [{"labour_expense_id": it["request_id"]}, {"expense_id": it["request_id"]}]},
                {"$set": {
                    "status": "paid",
                    "paid_via": "direct_transfer",
                    "paid_via_dt_id": income_id,
                    "paid_via_expense_id": expense_id,
                    "paid_amount": recv,
                    "paid_by": user.user_id,
                    "paid_by_name": user.name,
                    "paid_at": now,
                    "updated_at": now,
                }}
            )

    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_status": "completed",
            "dt_completed_at": now,
            "dt_completed_by": user.user_id,
            "dt_completed_by_name": user.name,
            "dt_expense_ids": expense_ids,
            "status": "approved",
            "updated_at": now,
        }}
    )
    return {"message": "DT cycle completed", "expense_ids": expense_ids, "expenses_recorded": len(expense_ids)}




# ==================== ADMIN: BACKFILL PAYMENT MODES ====================
# Feb 19 2026 — One-shot endpoint that rewrites stale `payment_method` on
# already-paid `labour_expenses` / `material_requests` / `petty_cash` rows
# using the *actual* leg recorded in `recorded_expenses`. Idempotent; only
# updates rows that differ from the stored leg method.
@router.post("/admin/backfill-payment-modes")
async def backfill_payment_modes(
    expense_type: Optional[str] = "labour",
    user: User = Depends(get_current_user),
):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    targets = ["labour", "material", "petty_cash"] if expense_type in ("all", None) else [expense_type]
    coll_map = {"labour": ("labour_expenses", "labour_expense_id", "expense_id"),
                "material": ("material_requests", "request_id", None),
                "petty_cash": ("petty_cash", "petty_cash_id", None)}
    total_updated = 0
    detail = {}
    for t in targets:
        if t not in coll_map:
            continue
        coll, primary_id, alt_id = coll_map[t]
        rows = await db[coll].find(
            {"$or": [
                {"paid_via_expense_id": {"$exists": True, "$ne": None}},
                {"paid_amount": {"$gt": 0}},
            ]},
            {"_id": 0},
        ).to_list(5000)
        n_updated = 0
        for r in rows:
            row_id = r.get(primary_id) or (r.get(alt_id) if alt_id else None)
            if not row_id:
                continue
            # Prefer the primary recorded_expense; fall back to ANY leg tied
            # to this request (request_id field set in step 6 of pay endpoint).
            pe = None
            if r.get("paid_via_expense_id"):
                pe = await db.recorded_expenses.find_one(
                    {"expense_id": r["paid_via_expense_id"]}, {"_id": 0, "payment_method": 1}
                )
            if not pe:
                pe = await db.recorded_expenses.find_one(
                    {"request_id": row_id, "request_type": t}, {"_id": 0, "payment_method": 1}
                )
            if not pe or not pe.get("payment_method"):
                continue
            new_method = pe["payment_method"]
            if r.get("payment_method") == new_method:
                continue
            await db[coll].update_one(
                {primary_id: row_id} if primary_id in r else {alt_id: row_id},
                {"$set": {"payment_method": new_method, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            n_updated += 1
        detail[t] = n_updated
        total_updated += n_updated
    return {"message": f"Backfill complete — {total_updated} row(s) updated.", "detail": detail}
