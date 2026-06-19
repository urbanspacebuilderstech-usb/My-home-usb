"""
Expense Split — Top & Sub Categories for Indirect Cost allocation.

Concepts (per user spec, Feb 2026):
- Top Categories (e.g. Overhead, Marketing, Profit, Investment) own a
  fixed percentage of the GLOBAL Indirect Pool income. The percentages
  across all top categories must sum to ≤ 100%.
- Sub Categories live under a Top Category. They're free-form labels
  used for tagging indirect expenses; no percentage, no rollup constraint.
  A sub category may have a parent sub category (sub-of-sub, 1 level deep).
- Top Categories are GLOBAL — same set every month. The Allocated ₹ value
  comes from cashflow's `indirect_in × percentage`. Spent ₹ rolls up from
  approved indirect_costs tagged with that top_category_id.
- New 3-popup Indirect Cost flow:
    1. Header: amount + description + top_category + sub_category
       (+ optional sub_sub_category) + payment + vendor.
    2. Pick 1+ projects from a scrollable list showing IDC available
       (= cashflow_ledger indirect_in − indirect_out for that project).
    3. Split the expense amount across picked projects (% or ₹). Sum
       must equal the expense amount. Submit → one `indirect_costs`
       doc + N `indirect_cost_allocations` rows + N cashflow_ledger
       `expense` rows (`indirect_amount = allocated`).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole, IndirectCost, IndirectCostStatus, PaymentMethodType  # noqa: F401
from routes.cashflow import allocate_expense

router = APIRouter(tags=["Expense Split"])

DEFAULT_COLORS = ["violet", "rose", "amber", "emerald", "blue", "indigo", "pink", "orange", "teal", "cyan"]


# ===================== MODELS =====================
class TopCategoryCreate(BaseModel):
    name: str
    percentage: float = Field(ge=0, le=100)
    color: Optional[str] = None


class TopCategoryUpdate(BaseModel):
    name: Optional[str] = None
    percentage: Optional[float] = Field(default=None, ge=0, le=100)
    color: Optional[str] = None


class SubCategoryCreate(BaseModel):
    top_category_id: str
    name: str
    parent_sub_category_id: Optional[str] = None


class AllocationRow(BaseModel):
    project_id: str
    amount: float
    percent: Optional[float] = None


class AllocatedIndirectCostCreate(BaseModel):
    amount: float
    description: str
    top_category_id: str
    sub_category_id: Optional[str] = None
    sub_sub_category_id: Optional[str] = None
    # Use plain string — the cashbook payment-mode set ("savings_account",
    # "current_account", "direct_transfer", "cash", "cheque", "escrow") is
    # broader than the legacy PaymentMethodType enum. Validation happens
    # at the persistence layer / cashflow ledger.
    payment_method: str
    vendor_name: Optional[str] = None
    reference_number: Optional[str] = None
    invoice_number: Optional[str] = None
    remarks: Optional[str] = None
    allocations: List[AllocationRow]


# ===================== HELPERS =====================
def _can_manage(user: User) -> bool:
    return user.role in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]


def _can_create_cost(user: User) -> bool:
    return user.role in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]


async def _indirect_pool_in() -> float:
    """Sum of all indirect_in across the cashflow ledger (global pool size)."""
    pipeline = [
        {"$match": {"kind": "income"}},
        {"$group": {"_id": None, "total": {"$sum": "$indirect_amount"}}},
    ]
    async for row in db.cashflow_ledger.aggregate(pipeline):
        return float(row.get("total", 0.0) or 0.0)
    return 0.0


async def _spent_by_top_category(month: Optional[int] = None, year: Optional[int] = None) -> Dict[str, float]:
    """Sum of approved indirect_costs grouped by top_category_id, optional month/year filter on payment_date / created_at."""
    match: Dict[str, Any] = {"status": {"$in": ["approved", "confirmed", "paid"]}}
    if month and year:
        # Filter on created_at YYYY-MM prefix
        prefix = f"{year:04d}-{month:02d}"
        match["created_at"] = {"$regex": f"^{prefix}"}
    elif year:
        match["created_at"] = {"$regex": f"^{year:04d}"}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$top_category_id", "spent": {"$sum": "$amount"}}},
    ]
    out: Dict[str, float] = {}
    async for row in db.indirect_costs.aggregate(pipeline):
        tcid = row.get("_id")
        if tcid:
            out[tcid] = float(row.get("spent", 0.0) or 0.0)
    return out


# ===================== TOP CATEGORIES =====================
@router.get("/expense-split/top-categories")
async def list_top_categories(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: User = Depends(get_current_user),
):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    cats = await db.expense_split_top_categories.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    pool = await _indirect_pool_in()
    spent_map = await _spent_by_top_category(month=month, year=year)
    sub_counts_pipeline = [{"$group": {"_id": "$top_category_id", "n": {"$sum": 1}}}]
    sub_counts: Dict[str, int] = {}
    async for row in db.expense_split_sub_categories.aggregate(sub_counts_pipeline):
        sub_counts[row["_id"]] = int(row["n"])

    for c in cats:
        pct = float(c.get("percentage", 0) or 0)
        allocated = round(pool * pct / 100.0, 2)
        spent = spent_map.get(c["top_category_id"], 0.0)
        c["allocated_amount"] = allocated
        c["spent_amount"] = round(spent, 2)
        c["balance"] = round(allocated - spent, 2)
        c["sub_count"] = sub_counts.get(c["top_category_id"], 0)

    total_pct = sum(float(c.get("percentage", 0) or 0) for c in cats)
    total_allocated = sum(c["allocated_amount"] for c in cats)
    total_spent = sum(c["spent_amount"] for c in cats)
    return {
        "categories": cats,
        "indirect_pool_in": round(pool, 2),
        "total_percentage": round(total_pct, 2),
        "total_allocated": round(total_allocated, 2),
        "total_spent": round(total_spent, 2),
        "total_balance": round(total_allocated - total_spent, 2),
    }


@router.post("/expense-split/top-categories")
async def create_top_category(data: TopCategoryCreate, user: User = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.expense_split_top_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Top category with this name already exists")

    # Validate total percentage <= 100
    cats = await db.expense_split_top_categories.find({}, {"percentage": 1, "_id": 0}).to_list(200)
    total = sum(float(c.get("percentage", 0) or 0) for c in cats) + float(data.percentage)
    if total > 100.0001:
        raise HTTPException(status_code=400, detail=f"Total percentage would exceed 100% (would be {total:.2f}%)")

    color = data.color or DEFAULT_COLORS[len(cats) % len(DEFAULT_COLORS)]
    doc = {
        "top_category_id": f"tc_{uuid.uuid4().hex[:10]}",
        "name": name,
        "percentage": float(data.percentage),
        "color": color,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.expense_split_top_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/expense-split/top-categories/{top_category_id}")
async def update_top_category(top_category_id: str, data: TopCategoryUpdate, user: User = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    cat = await db.expense_split_top_categories.find_one({"top_category_id": top_category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Top category not found")

    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        nm = data.name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name cannot be blank")
        update["name"] = nm
    if data.percentage is not None:
        # Validate total
        others = await db.expense_split_top_categories.find(
            {"top_category_id": {"$ne": top_category_id}}, {"percentage": 1, "_id": 0}
        ).to_list(200)
        total = sum(float(c.get("percentage", 0) or 0) for c in others) + float(data.percentage)
        if total > 100.0001:
            raise HTTPException(status_code=400, detail=f"Total percentage would exceed 100% (would be {total:.2f}%)")
        update["percentage"] = float(data.percentage)
    if data.color is not None:
        update["color"] = data.color

    await db.expense_split_top_categories.update_one({"top_category_id": top_category_id}, {"$set": update})
    return await db.expense_split_top_categories.find_one({"top_category_id": top_category_id}, {"_id": 0})


@router.delete("/expense-split/top-categories/{top_category_id}")
async def delete_top_category(top_category_id: str, user: User = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    # Block delete if there are indirect_costs already tagged
    in_use = await db.indirect_costs.count_documents({"top_category_id": top_category_id})
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete — {in_use} indirect cost(s) are tagged to this category")
    await db.expense_split_top_categories.delete_one({"top_category_id": top_category_id})
    await db.expense_split_sub_categories.delete_many({"top_category_id": top_category_id})
    return {"deleted": True}


# ===================== SUB CATEGORIES =====================
@router.get("/expense-split/sub-categories")
async def list_sub_categories(
    top_category_id: Optional[str] = None,
    parent_sub_category_id: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    q: Dict[str, Any] = {}
    if top_category_id:
        q["top_category_id"] = top_category_id
    if parent_sub_category_id is not None:
        q["parent_sub_category_id"] = parent_sub_category_id
    subs = await db.expense_split_sub_categories.find(q, {"_id": 0}).sort("created_at", 1).to_list(500)
    return subs


@router.post("/expense-split/sub-categories")
async def create_sub_category(data: SubCategoryCreate, user: User = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    parent = await db.expense_split_top_categories.find_one({"top_category_id": data.top_category_id}, {"_id": 0, "top_category_id": 1})
    if not parent:
        raise HTTPException(status_code=404, detail="Parent top category not found")
    if data.parent_sub_category_id:
        psub = await db.expense_split_sub_categories.find_one(
            {"sub_category_id": data.parent_sub_category_id, "top_category_id": data.top_category_id},
            {"_id": 0, "sub_category_id": 1},
        )
        if not psub:
            raise HTTPException(status_code=404, detail="Parent sub category not found under this top category")

    doc = {
        "sub_category_id": f"sc_{uuid.uuid4().hex[:10]}",
        "top_category_id": data.top_category_id,
        "parent_sub_category_id": data.parent_sub_category_id,
        "name": name,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.expense_split_sub_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/expense-split/sub-categories/{sub_category_id}")
async def delete_sub_category(sub_category_id: str, user: User = Depends(get_current_user)):
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    # Cascade-delete children
    in_use = await db.indirect_costs.count_documents({
        "$or": [{"sub_category_id": sub_category_id}, {"sub_sub_category_id": sub_category_id}]
    })
    if in_use:
        raise HTTPException(status_code=400, detail=f"Cannot delete — {in_use} indirect cost(s) reference this sub category")
    children = await db.expense_split_sub_categories.count_documents({"parent_sub_category_id": sub_category_id})
    if children:
        raise HTTPException(status_code=400, detail=f"Cannot delete — {children} child sub category(ies) exist")
    await db.expense_split_sub_categories.delete_one({"sub_category_id": sub_category_id})
    return {"deleted": True}


# ===================== PROJECT IDC BALANCES =====================
@router.get("/indirect-costs/projects-balance")
async def list_projects_indirect_balance(user: User = Depends(get_current_user)):
    """Per-project IDC available = cashflow_ledger indirect_in − indirect_out."""
    if not _can_manage(user):
        raise HTTPException(status_code=403, detail="Permission denied")

    # Same real-project filter used elsewhere — Planning's New/Current/Delivered
    # tabs (excluding known demo / test rows).
    EXCLUDE = [
        "Swathi 60LG+2", "Swathi 60L G+2", "Swathi 60LG +2",
        "Mr. Joseph Vijay", "Mr. Joseph Vijay ", "Mr Joseph Vijay", "Mr Joseph Vijay ",
        "RE - Mr. Joseph Vijay", "RE - Mr. Joseph Vijay ", "RE-Mr. Joseph Vijay",
        "Mani Demo Project - Onbording", "Mani Demo Project - Onbording ", "Mani Demo Project - Onboarding",
    ]
    projects = await db.projects.find(
        {
            "planning_status": {"$in": ["new", "active", "delivered"]},
            "name": {"$nin": EXCLUDE},
        },
        {"_id": 0, "project_id": 1, "name": 1},
    ).sort("name", 1).to_list(5000)

    # Aggregate ledger per project
    pipeline = [
        {"$group": {
            "_id": {"project_id": "$project_id", "kind": "$kind"},
            "indirect": {"$sum": "$indirect_amount"},
        }}
    ]
    agg: Dict[str, Dict[str, float]] = {}
    async for row in db.cashflow_ledger.aggregate(pipeline):
        pid = row["_id"].get("project_id") or ""
        kind = row["_id"].get("kind") or ""
        agg.setdefault(pid, {"in": 0.0, "out": 0.0})
        if kind == "income":
            agg[pid]["in"] += float(row.get("indirect", 0.0) or 0.0)
        elif kind == "expense":
            agg[pid]["out"] += float(row.get("indirect", 0.0) or 0.0)

    out_rows = []
    total_in = total_out = 0.0
    for p in projects:
        pid = p["project_id"]
        info = agg.get(pid, {"in": 0.0, "out": 0.0})
        balance = round(info["in"] - info["out"], 2)
        total_in += info["in"]
        total_out += info["out"]
        out_rows.append({
            "project_id": pid,
            "project_name": (p.get("name") or "").replace("  ", " ").strip(),
            "indirect_in": round(info["in"], 2),
            "indirect_out": round(info["out"], 2),
            "balance": balance,
        })
    # Sort by available balance desc so projects with biggest IDC show first
    out_rows.sort(key=lambda x: -x["balance"])
    return {
        "projects": out_rows,
        "total_indirect_in": round(total_in, 2),
        "total_indirect_out": round(total_out, 2),
        "total_balance": round(total_in - total_out, 2),
    }


# ===================== ALLOCATED INDIRECT COST CREATE =====================
@router.post("/indirect-costs/allocated")
async def create_allocated_indirect_cost(data: AllocatedIndirectCostCreate, user: User = Depends(get_current_user)):
    """Create a single indirect cost split across multiple projects.

    Validates that the sum of allocations equals the expense amount (₹0.01 tolerance).
    Records:
      • One `indirect_costs` doc (status=approved, since this flow is the
        explicit allocation by the accountant — keeps the cashbook in sync
        immediately, matching user spec 6a).
      • One `indirect_cost_allocations` row per project.
      • One `cashflow_ledger` expense row per project with
        `indirect_amount = allocated`.
    """
    if not _can_create_cost(user):
        raise HTTPException(status_code=403, detail="Only Accountant or Super Admin can record indirect costs")

    if not data.allocations:
        raise HTTPException(status_code=400, detail="At least one project allocation is required")

    amount = float(data.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    alloc_sum = sum(float(a.amount) for a in data.allocations)
    if abs(alloc_sum - amount) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Allocations must sum to ₹{amount:.2f} (got ₹{alloc_sum:.2f})",
        )

    # Validate top category exists
    top = await db.expense_split_top_categories.find_one({"top_category_id": data.top_category_id}, {"_id": 0})
    if not top:
        raise HTTPException(status_code=404, detail="Top category not found")

    # Resolve project names
    pids = [a.project_id for a in data.allocations]
    proj_docs = await db.projects.find({"project_id": {"$in": pids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(500)
    name_map = {p["project_id"]: (p.get("name") or "").strip() for p in proj_docs}
    missing = [pid for pid in pids if pid not in name_map]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown project(s): {', '.join(missing)}")

    now = datetime.now(timezone.utc).isoformat()
    # Build raw dict instead of IndirectCost(BaseModel) — the legacy
    # PaymentMethodType enum doesn't cover savings_account / current_account
    # / direct_transfer which the accountant uses. Store the payment_method
    # string as-is to match the cashbook payment-mode vocabulary.
    cost_id = f"icost_{uuid.uuid4().hex[:10]}"
    cost_dict = {
        "indirect_cost_id": cost_id,
        "category": "other",
        "description": data.description,
        "amount": amount,
        "payment_method": data.payment_method,
        "reference_number": data.reference_number,
        "vendor_name": data.vendor_name,
        "invoice_number": data.invoice_number,
        "remarks": data.remarks,
        "status": IndirectCostStatus.APPROVED.value if hasattr(IndirectCostStatus.APPROVED, "value") else "approved",
        "created_by": user.user_id,
        "created_by_name": user.name,
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "approved_at": now,
        "created_at": now,
        "updated_at": now,
        # New-flow fields
        "top_category_id": data.top_category_id,
        "top_category_name": top.get("name"),
        "sub_category_id": data.sub_category_id,
        "sub_sub_category_id": data.sub_sub_category_id,
        "allocation_flow": "multi_project",
    }

    await db.indirect_costs.insert_one(cost_dict)

    # Resolve sub category names for snapshot
    sub_name = None
    if data.sub_category_id:
        sub = await db.expense_split_sub_categories.find_one({"sub_category_id": data.sub_category_id}, {"_id": 0, "name": 1})
        sub_name = sub.get("name") if sub else None
    sub_sub_name = None
    if data.sub_sub_category_id:
        ssub = await db.expense_split_sub_categories.find_one({"sub_category_id": data.sub_sub_category_id}, {"_id": 0, "name": 1})
        sub_sub_name = ssub.get("name") if ssub else None

    # Per-project allocation + cashflow ledger
    alloc_docs = []
    for a in data.allocations:
        if float(a.amount) <= 0:
            continue
        alloc_doc = {
            "allocation_id": f"alloc_{uuid.uuid4().hex[:10]}",
            "indirect_cost_id": cost_id,
            "project_id": a.project_id,
            "project_name": name_map.get(a.project_id, ""),
            "amount": float(a.amount),
            "percent": float(a.percent) if a.percent is not None else round(float(a.amount) / amount * 100.0, 4),
            "top_category_id": data.top_category_id,
            "top_category_name": top.get("name"),
            "sub_category_id": data.sub_category_id,
            "sub_category_name": sub_name,
            "sub_sub_category_id": data.sub_sub_category_id,
            "sub_sub_category_name": sub_sub_name,
            "description": data.description,
            "created_by": user.user_id,
            "created_at": now,
        }
        alloc_docs.append(alloc_doc)
        # Cashflow ledger — one expense row per project, indirect pool
        await allocate_expense(
            expense_id=alloc_doc["allocation_id"],
            project_id=a.project_id,
            amount=float(a.amount),
            category="overhead",  # Drains the indirect pool (see cashflow.py constants)
            project_name=name_map.get(a.project_id, ""),
            source="indirect_cost",
        )

    if alloc_docs:
        await db.indirect_cost_allocations.insert_many(alloc_docs)

    return {
        "message": "Indirect cost recorded and allocated across projects.",
        "indirect_cost_id": cost_id,
        "allocations": len(alloc_docs),
    }
