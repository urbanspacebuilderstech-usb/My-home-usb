"""
Cashflow Engine — splits every approved income into Direct vs Indirect pools.

Concepts:
- `cashflow_config.global = { direct_pct, indirect_pct }`     ← global default (85/15)
- `cashflow_config.projects[project_id] = { direct_pct, indirect_pct }`  ← per-project override
- `cashflow_ledger` rows record each allocation with a frozen snapshot of the
  split used at the time. So changing the split later does NOT automatically
  rewrite the past — admin must invoke /recompute or accept the modal prompt.

Expense allocation (category-based, per spec 3a):
- Direct pool drained by: material, labour, vendor (project-attributable)
- Indirect pool drained by: salaries, office, marketing, petrol_allowance,
  misc, statutory (non-project / overhead)
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter(tags=["Cashflow Engine"])

# ===================== CONSTANTS =====================
DEFAULT_GLOBAL_SPLIT = {"direct_pct": 85.0, "indirect_pct": 15.0}
DIRECT_EXPENSE_CATEGORIES = {"material", "labour", "labour_advance", "vendor", "vendor_service", "subcontractor"}
INDIRECT_EXPENSE_CATEGORIES = {"salary", "office", "marketing", "petrol_allowance", "misc", "statutory", "overhead", "admin"}


# ===================== MODELS =====================
class GlobalSplitUpdate(BaseModel):
    direct_pct: float = Field(ge=0, le=100)
    indirect_pct: float = Field(ge=0, le=100)


class ProjectOverrideUpdate(BaseModel):
    direct_pct: float = Field(ge=0, le=100)
    indirect_pct: float = Field(ge=0, le=100)
    apply_retroactively: bool = False


# ===================== HELPERS =====================
async def _get_global_split() -> Dict[str, float]:
    doc = await db.cashflow_config.find_one({"_id": "global"}, {"direct_pct": 1, "indirect_pct": 1})
    if not doc:
        await db.cashflow_config.update_one(
            {"_id": "global"}, {"$set": DEFAULT_GLOBAL_SPLIT}, upsert=True
        )
        return dict(DEFAULT_GLOBAL_SPLIT)
    return {"direct_pct": float(doc.get("direct_pct", 85.0)), "indirect_pct": float(doc.get("indirect_pct", 15.0))}


async def _get_effective_split(project_id: Optional[str]) -> Dict[str, float]:
    """Project override → global default fallback."""
    if project_id:
        override = await db.cashflow_config.find_one({"_id": f"project:{project_id}"}, {"direct_pct": 1, "indirect_pct": 1})
        if override:
            return {"direct_pct": float(override["direct_pct"]), "indirect_pct": float(override["indirect_pct"])}
    return await _get_global_split()


def _classify_expense_pool(category: Optional[str]) -> str:
    cat = (category or "").strip().lower()
    if cat in DIRECT_EXPENSE_CATEGORIES:
        return "direct"
    if cat in INDIRECT_EXPENSE_CATEGORIES:
        return "indirect"
    return "direct"  # safe default — project-tied expenses tend to be direct


async def allocate_income(income_id: str, project_id: Optional[str], amount: float, project_name: str = "", source: str = "income") -> Dict[str, Any]:
    """Idempotent — re-running on the same income_id is a no-op. Used by the income-approval hook."""
    existing = await db.cashflow_ledger.find_one({"source_id": income_id, "kind": "income"}, {"_id": 0})
    if existing:
        return existing
    split = await _get_effective_split(project_id)
    direct = round(amount * (split["direct_pct"] / 100.0), 2)
    indirect = round(amount * (split["indirect_pct"] / 100.0), 2)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "ledger_id": f"cf_{uuid.uuid4().hex[:10]}",
        "kind": "income",
        "source": source,
        "source_id": income_id,
        "project_id": project_id,
        "project_name": project_name,
        "amount": float(amount),
        "direct_amount": direct,
        "indirect_amount": indirect,
        "pool": None,  # n/a for income — split into two pools
        "snapshot_split": split,
        "created_at": now,
    }
    await db.cashflow_ledger.insert_one(row)
    row.pop("_id", None)
    return row


async def allocate_expense(expense_id: str, project_id: Optional[str], amount: float, category: str, project_name: str = "", source: str = "expense") -> Dict[str, Any]:
    """Drains the appropriate pool. Idempotent on (expense_id, kind='expense')."""
    existing = await db.cashflow_ledger.find_one({"source_id": expense_id, "kind": "expense"}, {"_id": 0})
    if existing:
        return existing
    pool = _classify_expense_pool(category)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "ledger_id": f"cf_{uuid.uuid4().hex[:10]}",
        "kind": "expense",
        "source": source,
        "source_id": expense_id,
        "project_id": project_id,
        "project_name": project_name,
        "amount": float(amount),
        "direct_amount": float(amount) if pool == "direct" else 0.0,
        "indirect_amount": float(amount) if pool == "indirect" else 0.0,
        "pool": pool,
        "category": category,
        "snapshot_split": None,
        "created_at": now,
    }
    await db.cashflow_ledger.insert_one(row)
    row.pop("_id", None)
    return row


# ===================== ENDPOINTS — CONFIG =====================
@router.get("/cashflow/config")
async def get_config(user: User = Depends(get_current_user)):
    """Global split + all per-project overrides."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    glob = await _get_global_split()
    overrides_cursor = db.cashflow_config.find({"_id": {"$regex": "^project:"}}, {"_id": 1, "direct_pct": 1, "indirect_pct": 1, "updated_by_name": 1, "updated_at": 1})
    overrides: List[Dict[str, Any]] = []
    async for d in overrides_cursor:
        pid = d["_id"].split(":", 1)[1]
        proj = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1, "client_name": 1})
        overrides.append({
            "project_id": pid,
            "project_name": (proj or {}).get("name", ""),
            "client_name": (proj or {}).get("client_name", ""),
            "direct_pct": float(d["direct_pct"]),
            "indirect_pct": float(d["indirect_pct"]),
            "updated_by_name": d.get("updated_by_name"),
            "updated_at": d.get("updated_at"),
        })
    return {"global": glob, "overrides": overrides}


@router.patch("/cashflow/config")
async def update_global_split(data: GlobalSplitUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can change global split")
    if abs(data.direct_pct + data.indirect_pct - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="direct_pct + indirect_pct must sum to 100")
    now = datetime.now(timezone.utc).isoformat()
    await db.cashflow_config.update_one(
        {"_id": "global"},
        {"$set": {"direct_pct": float(data.direct_pct), "indirect_pct": float(data.indirect_pct), "updated_by": user.user_id, "updated_by_name": user.name, "updated_at": now}},
        upsert=True
    )
    return {"message": "Global split updated", "global": {"direct_pct": data.direct_pct, "indirect_pct": data.indirect_pct}}


@router.put("/cashflow/config/projects/{project_id}")
async def set_project_override(project_id: str, data: ProjectOverrideUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can change project allocation")
    if abs(data.direct_pct + data.indirect_pct - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="direct_pct + indirect_pct must sum to 100")
    proj = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.cashflow_config.update_one(
        {"_id": f"project:{project_id}"},
        {"$set": {
            "project_id": project_id,
            "direct_pct": float(data.direct_pct),
            "indirect_pct": float(data.indirect_pct),
            "updated_by": user.user_id,
            "updated_by_name": user.name,
            "updated_at": now,
        }},
        upsert=True
    )
    recomputed = 0
    if data.apply_retroactively:
        recomputed = await _recompute_project_income(project_id, {"direct_pct": data.direct_pct, "indirect_pct": data.indirect_pct})
    return {"message": "Project override saved", "retroactive_rows_updated": recomputed}


@router.delete("/cashflow/config/projects/{project_id}")
async def remove_project_override(project_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can remove project override")
    res = await db.cashflow_config.delete_one({"_id": f"project:{project_id}"})
    return {"message": "Override removed", "deleted_count": res.deleted_count}


async def _recompute_project_income(project_id: str, split: Dict[str, float]) -> int:
    """Re-split all existing income ledger rows for the given project using the new split."""
    cursor = db.cashflow_ledger.find({"kind": "income", "project_id": project_id}, {"_id": 0, "ledger_id": 1, "amount": 1})
    n = 0
    async for row in cursor:
        amt = float(row.get("amount") or 0)
        new_direct = round(amt * (split["direct_pct"] / 100.0), 2)
        new_indirect = round(amt * (split["indirect_pct"] / 100.0), 2)
        await db.cashflow_ledger.update_one(
            {"ledger_id": row["ledger_id"]},
            {"$set": {"direct_amount": new_direct, "indirect_amount": new_indirect, "snapshot_split": split}}
        )
        n += 1
    return n


# ===================== ENDPOINTS — LEDGER =====================
@router.get("/cashflow/ledger")
async def get_ledger(
    kind: Optional[str] = None,  # 'income' | 'expense'
    project_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 500,
    user: User = Depends(get_current_user)
):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    q: Dict[str, Any] = {}
    if kind in ("income", "expense"):
        q["kind"] = kind
    if project_id:
        q["project_id"] = project_id
    if date_from:
        q["created_at"] = {"$gte": date_from}
    if date_to:
        q.setdefault("created_at", {})["$lte"] = date_to + "T23:59:59"
    rows = await db.cashflow_ledger.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows


@router.get("/cashflow/summary")
async def get_summary(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Direct pool balance, Indirect pool balance, Net cash position — globally or per project."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")

    match: Dict[str, Any] = {}
    if project_id:
        match["project_id"] = project_id

    pipeline = [
        {"$match": match} if match else {"$match": {}},
        {"$group": {
            "_id": "$kind",
            "total": {"$sum": "$amount"},
            "direct": {"$sum": "$direct_amount"},
            "indirect": {"$sum": "$indirect_amount"},
        }}
    ]
    income_total = direct_in = indirect_in = 0.0
    expense_total = direct_out = indirect_out = 0.0
    async for row in db.cashflow_ledger.aggregate(pipeline):
        if row["_id"] == "income":
            income_total = row.get("total", 0.0) or 0.0
            direct_in = row.get("direct", 0.0) or 0.0
            indirect_in = row.get("indirect", 0.0) or 0.0
        elif row["_id"] == "expense":
            expense_total = row.get("total", 0.0) or 0.0
            direct_out = row.get("direct", 0.0) or 0.0
            indirect_out = row.get("indirect", 0.0) or 0.0

    # Per-project mini summary (only when not filtering by single project)
    per_project: List[Dict[str, Any]] = []
    if not project_id:
        pp_pipeline = [
            {"$group": {
                "_id": {"project_id": "$project_id", "kind": "$kind"},
                "direct": {"$sum": "$direct_amount"},
                "indirect": {"$sum": "$indirect_amount"},
                "project_name": {"$first": "$project_name"},
            }}
        ]
        agg: Dict[str, Dict[str, Any]] = {}
        async for row in db.cashflow_ledger.aggregate(pp_pipeline):
            pid = row["_id"].get("project_id") or "_unassigned_"
            kind = row["_id"].get("kind")
            agg.setdefault(pid, {"project_id": pid, "project_name": row.get("project_name") or "", "direct_in": 0.0, "indirect_in": 0.0, "direct_out": 0.0, "indirect_out": 0.0})
            if kind == "income":
                agg[pid]["direct_in"] += row.get("direct", 0.0) or 0.0
                agg[pid]["indirect_in"] += row.get("indirect", 0.0) or 0.0
            else:
                agg[pid]["direct_out"] += row.get("direct", 0.0) or 0.0
                agg[pid]["indirect_out"] += row.get("indirect", 0.0) or 0.0
        for v in agg.values():
            v["direct_balance"] = round(v["direct_in"] - v["direct_out"], 2)
            v["indirect_balance"] = round(v["indirect_in"] - v["indirect_out"], 2)
            v["net"] = round(v["direct_balance"] + v["indirect_balance"], 2)
            per_project.append(v)
        per_project.sort(key=lambda x: -(x["net"] or 0))

    return {
        "income_total": round(income_total, 2),
        "expense_total": round(expense_total, 2),
        "direct_in": round(direct_in, 2),
        "direct_out": round(direct_out, 2),
        "direct_balance": round(direct_in - direct_out, 2),
        "indirect_in": round(indirect_in, 2),
        "indirect_out": round(indirect_out, 2),
        "indirect_balance": round(indirect_in - indirect_out, 2),
        "net": round((direct_in - direct_out) + (indirect_in - indirect_out), 2),
        "per_project": per_project,
        "effective_split": await _get_effective_split(project_id) if project_id else await _get_global_split(),
    }


# ===================== ENDPOINTS — RECOMPUTE =====================
@router.post("/cashflow/recompute")
async def full_recompute(user: User = Depends(get_current_user)):
    """Rebuild the entire cashflow_ledger from approved income + recorded expenses.
    Useful when seeding the engine for the first time or after a config change."""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can run full recompute")

    await db.cashflow_ledger.delete_many({})

    # Cache project names so replay rows show real names in summary
    project_name_map: Dict[str, str] = {}
    async for p in db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1}):
        pid = p.get("project_id")
        if pid:
            project_name_map[pid] = p.get("name") or p.get("client_name") or ""

    # Replay every non-rejected income (matches whatever the cashbook treats as legit income)
    income_count = 0
    async for inc in db.income.find(
        {"status": {"$nin": ["rejected", "pending_approval", "deleted", "cancelled", "void"]}},
        {"_id": 0, "income_id": 1, "project_id": 1, "amount": 1, "project_name": 1}
    ):
        try:
            amt = float(inc.get("amount") or 0)
            if amt <= 0:
                continue
            pid = inc.get("project_id")
            pname = inc.get("project_name") or project_name_map.get(pid, "")
            await allocate_income(inc["income_id"], pid, amt, pname, source="income_replay")
            income_count += 1
        except Exception:
            continue

    # Replay recorded expenses
    expense_count = 0
    async for exp in db.recorded_expenses.find({}, {"_id": 0, "expense_id": 1, "project_id": 1, "amount": 1, "category": 1, "project_name": 1}):
        try:
            amt = float(exp.get("amount") or 0)
            if amt <= 0:
                continue
            pid = exp.get("project_id")
            pname = exp.get("project_name") or project_name_map.get(pid, "")
            await allocate_expense(exp["expense_id"], pid, amt, exp.get("category", ""), pname, source="expense_replay")
            expense_count += 1
        except Exception:
            continue

    return {"message": "Recompute complete", "income_rows": income_count, "expense_rows": expense_count}
