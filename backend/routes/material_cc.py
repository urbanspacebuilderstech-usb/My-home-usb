"""
Finance Board > Project Wise > Material CC - planned against actual quantity.

Nov 23 2026. Two groups per project, each a list of items in their own unit:

  material  Theoretical = Theoretical Qty Planning enters on the project's
            Materials list (projects.package_materials).
            Purchase    = received on site and verified by Purchasing
            (material_requests). Received but not yet verified is returned
            separately as `awaiting` and is not in Purchase.
  labour    Theoretical = quantities Planning enters on Materials >
            Theoretical Quantity > Labour (projects.labour_theoretical).
            Purchase    = scope quantity in the project's active work orders.

Units differ between items (bags, kg, cft), so quantities are never added
across items. The project figure is the Difference % weighted by rate, over
the items that can be compared.
"""
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.deps import create_audit_log, get_current_user
from core.fastjson import fast_json
from core.models import User, UserRole
from routes.site_ops import reconciled_unit_rate

router = APIRouter(tags=["Material CC"])

# On site and past Procurement's verification.
_VERIFIED_STATUSES = {
    "pending_accounts_approval", "pending_balance_payment",
    "partially_paid", "paid", "delivered", "received_completed",
}
# On site, Procurement has not verified it yet.
_AWAITING_STATUSES = {"collected", "procurement_verifying"}
# Older orders that closed without a received_quantity or a receipt.
_CLOSED_DELIVERED = {"delivered", "received_completed"}

_UNIT_ALIASES = {
    "bags": "bag", "no": "nos", "number": "nos", "numbers": "nos", "pc": "pcs", "piece": "pcs", "pieces": "pcs",
    "kgs": "kg", "kilogram": "kg", "tons": "ton", "tonne": "ton", "tonnes": "ton", "mt": "mton",
    "squarefeet": "sqft", "squarefoot": "sqft", "cubicfeet": "cft", "runningfeet": "rft",
    "litre": "ltr", "litres": "ltr", "liter": "ltr", "liters": "ltr", "units": "unit", "sets": "set", "loads": "load",
}


def _f(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def norm_name(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip().lower()


def norm_unit(v) -> str:
    u = re.sub(r"[\s.]+", "", str(v or "")).lower()
    return _UNIT_ALIASES.get(u, u)


def _group(entries: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Entries of one side ({name, unit, qty, rate, awaiting}) keyed by name."""
    out: Dict[str, Dict[str, Any]] = {}
    for e in entries:
        key = norm_name(e.get("name"))
        if not key:
            continue
        g = out.setdefault(key, {"name": str(e["name"]).strip(), "units": {}, "qty": 0.0,
                                 "awaiting": 0.0, "value": 0.0, "valued_qty": 0.0})
        qty, rate = _f(e.get("qty")), _f(e.get("rate"))
        g["qty"] += qty
        g["awaiting"] += _f(e.get("awaiting"))
        g["units"].setdefault(norm_unit(e.get("unit")), str(e.get("unit") or "").strip())
        if qty > 0 and rate > 0:
            g["value"] += qty * rate
            g["valued_qty"] += qty
    return out


def _rate(g: Optional[Dict[str, Any]]) -> float:
    return g["value"] / g["valued_qty"] if g and g["valued_qty"] > 0 else 0.0


def compare_items(planned: List[Dict[str, Any]], actual: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Pure: one row per item name plus the rate-weighted project difference.

    A row's `note` says why it has no difference: "no_plan" (bought, nothing
    planned) or "unit_mismatch" (planned and bought in different units, or
    bought in more than one). Such rows are left out of the project figure.
    """
    plans, actuals = _group(planned), _group(actual)
    rows, plan_value, actual_value, compared = [], 0.0, 0.0, 0
    for key in sorted({*plans, *actuals}):
        p, a = plans.get(key), actuals.get(key)
        theo = round(p["qty"], 3) if p else None
        qty = round(a["qty"], 3) if a else 0.0
        awaiting = round(a["awaiting"], 3) if a else 0.0
        # A blank unit on one side is missing data, not a different unit.
        units = {u for g in (p, a) if g for u in g["units"] if u}
        labels = [lbl for g in (p, a) if g for lbl in g["units"].values() if lbl]
        note, diff = None, None
        if not theo:
            note = "no_plan"
        elif len(units) > 1:
            note = "unit_mismatch"
        else:
            diff = round((qty - theo) / theo * 100, 2)
            rate = _rate(p) or _rate(a)
            compared += 1
            if rate > 0:
                plan_value += theo * rate
                actual_value += qty * rate
        rows.append({
            "name": (p or a)["name"], "unit": labels[0] if labels else "",
            "actual_unit": next((lbl for lbl in (a["units"].values() if a else []) if lbl), ""),
            "theoretical": theo, "purchase": qty, "awaiting": awaiting, "diff_pct": diff, "note": note,
        })
    return {
        "items": rows,
        "count": len(rows),
        "compared": compared,
        "diff_pct": round((actual_value - plan_value) / plan_value * 100, 2) if plan_value > 0 else None,
    }


def request_quantities(req: Dict[str, Any], receipt_qty: float) -> Dict[str, float]:
    """Pure: {qty, awaiting} one material request contributes."""
    status = str(req.get("status") or "").lower()
    if status not in _VERIFIED_STATUSES and status not in _AWAITING_STATUSES:
        return {"qty": 0.0, "awaiting": 0.0}
    received = _f(req.get("received_quantity")) or receipt_qty
    if received <= 0 and status in _CLOSED_DELIVERED:
        received = _f(req.get("approved_quantity") or req.get("quantity"))
    # Bill statuses are also used before delivery (pre-paid); with nothing
    # received they contribute nothing.
    if status in _AWAITING_STATUSES:
        return {"qty": 0.0, "awaiting": received}
    return {"qty": received, "awaiting": 0.0}


@router.get("/accountant/project-wise/material-cc")
async def get_material_cc(user: User = Depends(get_current_user)):
    """READ-ONLY, all-time. {projects: {project_id: {material, labour}}}."""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    planned_m: Dict[str, list] = {}
    planned_l: Dict[str, list] = {}
    actual_m: Dict[str, list] = {}
    actual_l: Dict[str, list] = {}

    async for p in db.projects.find(
        {}, {"_id": 0, "project_id": 1, "package_materials": 1, "labour_theoretical": 1},
    ):
        pid = p.get("project_id")
        for m in p.get("package_materials") or []:
            if _f(m.get("theoretical_qty")) > 0:
                planned_m.setdefault(pid, []).append(
                    {"name": m.get("name"), "unit": m.get("unit"), "qty": m["theoretical_qty"], "rate": m.get("price")})
        for it in p.get("labour_theoretical") or []:
            planned_l.setdefault(pid, []).append(
                {"name": it.get("name"), "unit": it.get("unit"), "qty": it.get("qty")})

    requests = await db.material_requests.find(
        {"status": {"$in": sorted(_VERIFIED_STATUSES | _AWAITING_STATUSES)}},
        {"_id": 0, "request_id": 1, "project_id": 1, "status": 1, "material_name": 1, "unit": 1,
         "received_quantity": 1, "approved_quantity": 1, "quantity": 1, "unit_price": 1, "unit_rate": 1,
         "total_amount": 1, "final_price": 1, "estimated_price": 1, "transport_cost": 1, "discount": 1},
    ).to_list(50000)
    without_qty = [r["request_id"] for r in requests if r.get("request_id") and _f(r.get("received_quantity")) <= 0]
    receipts: Dict[str, float] = {}
    if without_qty:
        # Same receipts the SE's own collection total counts (site_ops.py).
        async for rc in db.material_receipts.find(
            {"request_id": {"$in": without_qty}, "otp_verified": True,
             "superseded_by_restart": {"$ne": True}, "verify_rejected": {"$ne": True}},
            {"_id": 0, "request_id": 1, "received_qty": 1},
        ):
            receipts[rc["request_id"]] = receipts.get(rc["request_id"], 0.0) + _f(rc.get("received_qty"))
    for r in requests:
        q = request_quantities(r, receipts.get(r.get("request_id"), 0.0))
        if r.get("project_id") and (q["qty"] > 0 or q["awaiting"] > 0):
            actual_m.setdefault(r["project_id"], []).append({
                "name": r.get("material_name"), "unit": r.get("unit"), **q,
                "rate": reconciled_unit_rate(r, q["qty"]) if q["qty"] > 0 else 0,
            })

    async for wo in db.project_work_orders.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "project_id": 1, "scope_items": 1},
    ):
        for s in wo.get("scope_items") or []:
            if wo.get("project_id") and _f(s.get("quantity")) > 0:
                actual_l.setdefault(wo["project_id"], []).append(
                    {"name": s.get("name"), "unit": s.get("unit"), "qty": s["quantity"], "rate": s.get("unit_rate")})

    pids = {*planned_m, *planned_l, *actual_m, *actual_l} - {None}
    return fast_json({"projects": {pid: {
        "material": compare_items(planned_m.get(pid, []), actual_m.get(pid, [])),
        "labour": compare_items(planned_l.get(pid, []), actual_l.get(pid, [])),
    } for pid in pids}})


# ==================== LABOUR THEORETICAL QUANTITY (Planning's entry) ====================

# Same roles as the project's Materials list, where material quantities are entered.
_EDIT_ROLES = [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON]


class LabourTheoreticalItem(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: str = Field(default="", max_length=40)
    qty: float = Field(gt=0, allow_inf_nan=False)


class LabourTheoreticalPayload(BaseModel):
    items: List[LabourTheoreticalItem] = Field(max_length=500)


@router.get("/projects/{project_id}/labour-theoretical")
async def get_labour_theoretical(project_id: str, user: User = Depends(get_current_user)):
    """Saved quantities, plus the project's work order scope names to pick from
    (a theoretical item is matched to a work order by its name)."""
    if user.role in [UserRole.CLIENT, UserRole.PROSPECT, UserRole.VENDOR]:
        raise HTTPException(status_code=403, detail="Access denied")
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "labour_theoretical": 1})
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    scope: Dict[str, Dict[str, str]] = {}
    async for wo in db.project_work_orders.find(
        {"project_id": project_id, "is_active": {"$ne": False}}, {"_id": 0, "scope_items": 1},
    ):
        for s in wo.get("scope_items") or []:
            key = norm_name(s.get("name"))
            if key:
                scope.setdefault(key, {"name": str(s["name"]).strip(), "unit": s.get("unit") or ""})
    return {"items": project.get("labour_theoretical") or [],
            "scope_items": sorted(scope.values(), key=lambda s: s["name"].lower()),
            "can_edit": user.role in _EDIT_ROLES}


@router.put("/projects/{project_id}/labour-theoretical")
async def save_labour_theoretical(project_id: str, payload: LabourTheoreticalPayload, user: User = Depends(get_current_user)):
    if user.role not in _EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    items, seen = [], set()
    for it in payload.items:
        key = norm_name(it.name)
        if not key:
            raise HTTPException(status_code=400, detail="Work item name is required")
        if key in seen:
            raise HTTPException(status_code=400, detail=f"'{it.name.strip()}' is entered twice")
        seen.add(key)
        items.append({"name": it.name.strip(), "unit": it.unit.strip(), "qty": it.qty})
    before = await db.projects.find_one_and_update(
        {"project_id": project_id}, {"$set": {"labour_theoretical": items}},
        projection={"_id": 0, "labour_theoretical": 1},
    )
    if before is None:
        raise HTTPException(status_code=404, detail="Project not found")
    await create_audit_log(user.user_id, "labour_theoretical", "project", project_id, {
        "before": before.get("labour_theoretical") or [], "after": items})
    return {"message": "Labour theoretical quantities saved", "items": items}
