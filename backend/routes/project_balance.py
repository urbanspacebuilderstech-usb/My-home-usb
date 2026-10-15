"""
Finance Board > Project Wise > Balance — what each project still owes out.

Oct 15 2026. Read-only. Two all-time figures per project; the tab takes Scope
Value, Balance Receivable and Funds in Hand from the all-time
/accountant/cashbook-filtered project_wise rows so they match the Overview.

  material_payable  ordered material not yet paid for: each material request
                    from Planning's approval onward (advance / in transit /
                    collected / billed), total minus what has been paid on
                    it; credit purchases from the vendor credit ledger; and
                    legacy material bills raised outside the request flow.
  labour_payable    active work orders: contract value minus stage payments
                    released and approved advances, never below 0 per work
                    order (an overpaid work order does not offset another).
"""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from core.database import db
from core.deps import get_current_user
from core.fastjson import fast_json
from core.models import User, UserRole
from routes.site_ops import _material_payment_status

router = APIRouter(tags=["Project Balance"])

# Planning has approved the order, so the money is committed. Earlier stages
# (requested / pm_approved / procurement_priced / planning_initial_pending)
# can still be rejected and owe nothing yet.
_ORDERED_STATUSES = {
    "pending_advance_payment", "in_transit",
    "collected", "procurement_verifying", "procurement_verify_rejected",
    "pending_accounts_approval", "pending_balance_payment",
    "partially_paid", "paid", "delivered", "received_completed",
}
# Same "still pending" set /material-vendor-payments/summary uses for legacy
# material_expenses that are not a mirror of a request.
_LEGACY_BILL_PENDING = {"pending_accounts_approval", "accounts_pending", "issued"}
_CREDIT_CLOSED = {"paid", "cancelled", "rejected", "deleted"}
# Same formula as projects._resync_wo_stage_progress.
_STAGE_PAID_STATUS = "approved"


def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


@router.get("/accountant/project-wise/balance-summary")
async def get_project_wise_balance_summary(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    out: Dict[str, Dict[str, Any]] = {}

    def _row(pid: str) -> Dict[str, Any]:
        return out.setdefault(pid, {"project_id": pid, "material_payable": 0.0, "labour_payable": 0.0})

    # ---- Material ----------------------------------------------------------
    requests = await db.material_requests.find(
        {"status": {"$in": list(_ORDERED_STATUSES)}},
        {"_id": 0, "request_id": 1, "project_id": 1, "status": 1,
         "total_amount": 1, "final_price": 1, "estimated_price": 1,
         "advance_amount": 1, "balance_amount": 1,
         "advance_paid_amount": 1, "balance_paid_amount": 1, "paid_amount": 1},
    ).to_list(50000)
    req_ids = [r["request_id"] for r in requests if r.get("request_id")]

    mirrors_by_request: Dict[str, list] = {}
    if req_ids:
        async for m in db.material_expenses.find(
            {"source_request_id": {"$in": req_ids}},
            {"_id": 0, "source_request_id": 1, "status": 1, "paid_amount": 1, "remaining_balance": 1},
        ):
            mirrors_by_request.setdefault(m.get("source_request_id"), []).append(m)

    credits = await db.vendor_credit_ledger.find(
        {}, {"_id": 0, "request_id": 1, "project_id": 1, "status": 1, "amount": 1, "balance": 1},
    ).to_list(20000)
    credit_by_request = {c["request_id"]: c for c in credits if c.get("request_id")}

    counted_requests = set()
    for d in requests:
        pid = d.get("project_id")
        rid = d.get("request_id")
        total = _f(d.get("total_amount") or d.get("final_price") or d.get("estimated_price"))
        if not pid or total <= 0:
            continue
        counted_requests.add(rid)
        mirrors = mirrors_by_request.get(rid)
        paid = max(
            _f(d.get("advance_paid_amount")) + _f(d.get("balance_paid_amount")),
            _f(d.get("paid_amount")),
            sum(_f(m.get("paid_amount")) for m in (mirrors or [])),
        )
        credit = credit_by_request.get(rid)
        if credit is not None:
            # A credit purchase reads "delivered" (so "paid" to the badge)
            # until the credit is settled; the ledger says whether it was.
            owed = 0.0 if (credit.get("status") or "").lower() in _CREDIT_CLOSED else total - paid
        else:
            status = _material_payment_status(d, mirrors)
            if status == "paid":
                owed = 0.0
            elif status == "partial" and not mirrors:
                # Legacy row: the badge counts the advance as paid.
                owed = total - max(paid, _f(d.get("advance_amount")))
            else:
                owed = total - paid
        if owed > 0.5:
            _row(pid)["material_payable"] += owed

    # Credit purchases not tied to a request counted above.
    for c in credits:
        pid = c.get("project_id")
        if not pid or (c.get("request_id") and c.get("request_id") in counted_requests):
            continue
        if (c.get("status") or "").lower() in _CREDIT_CLOSED:
            continue
        owed = _f(c.get("balance") if c.get("balance") is not None else c.get("amount"))
        if owed > 0.5:
            _row(pid)["material_payable"] += owed

    async for me in db.material_expenses.find(
        {"$or": [{"source_request_id": None}, {"source_request_id": {"$exists": False}}, {"source_request_id": ""}],
         "status": {"$in": list(_LEGACY_BILL_PENDING)}},
        {"_id": 0, "project_id": 1, "final_amount": 1, "amount": 1, "paid_amount": 1},
    ):
        pid = me.get("project_id")
        owed = _f(me.get("final_amount") or me.get("amount")) - _f(me.get("paid_amount"))
        if pid and owed > 0.5:
            _row(pid)["material_payable"] += owed

    # ---- Labour ------------------------------------------------------------
    work_orders = await db.project_work_orders.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "project_id": 1, "total_value": 1, "stages.stage_id": 1, "stages.payment_requests": 1},
    ).to_list(5000)
    stage_ids = [st["stage_id"] for wo in work_orders for st in (wo.get("stages") or []) if st.get("stage_id")]
    advance_by_stage: Dict[str, float] = {}
    if stage_ids:
        async for a in db.labour_advance_requests.find(
            {"stage_id": {"$in": stage_ids}, "status": "approved"}, {"_id": 0, "stage_id": 1, "amount": 1},
        ):
            advance_by_stage[a["stage_id"]] = advance_by_stage.get(a["stage_id"], 0.0) + _f(a.get("amount"))

    for wo in work_orders:
        pid = wo.get("project_id")
        if not pid:
            continue
        released = 0.0
        for st in (wo.get("stages") or []):
            released += sum(_f(p.get("approved_amount")) for p in (st.get("payment_requests") or [])
                            if p.get("status") == _STAGE_PAID_STATUS)
            released += advance_by_stage.get(st.get("stage_id"), 0.0)
        owed = _f(wo.get("total_value")) - released
        if owed > 0.5:
            _row(pid)["labour_payable"] += owed

    rows = []
    for r in out.values():
        r["material_payable"] = round(r["material_payable"], 2)
        r["labour_payable"] = round(r["labour_payable"], 2)
        rows.append(r)
    return fast_json({"rows": rows})
