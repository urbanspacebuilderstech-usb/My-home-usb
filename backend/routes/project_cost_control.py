"""Project Cost Control split (Nov 23 2026).

Accounts > Project Wise > Project Cost Control splits each project's Grand
Total into a Direct and an Indirect budget by this percentage. It is its own
setting on purpose: the Cashflow Engine's 85/15 (cashflow_config) splits
income and stays independent; changing one never moves the other.

There is one all-projects split, and any project can have its own split
that overrides it (project_cost_control_project_splits).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter(tags=["Project Cost Control"])

SPLIT_DOC_ID = "split"
DEFAULT_SPLIT = {"direct_pct": 85.0, "indirect_pct": 15.0}


class CostControlSplit(BaseModel):
    direct_pct: float = Field(ge=0, le=100)
    indirect_pct: float = Field(ge=0, le=100)
    # All-projects save only: also drop every project's own split.
    reset_projects: Optional[bool] = False


def _shape(doc: dict) -> dict:
    return {
        "direct_pct": float(doc.get("direct_pct", DEFAULT_SPLIT["direct_pct"])),
        "indirect_pct": float(doc.get("indirect_pct", DEFAULT_SPLIT["indirect_pct"])),
        "updated_by_name": doc.get("updated_by_name"),
        "updated_at": doc.get("updated_at"),
    }


def _check(user: User, data: CostControlSplit) -> None:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can change the split")
    if abs(data.direct_pct + data.indirect_pct - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="Direct % + Indirect % must add up to 100")


async def _full_config() -> dict:
    doc = await db.project_cost_control_config.find_one({"_id": SPLIT_DOC_ID}, {"_id": 0}) or {}
    projects = {}
    async for p in db.project_cost_control_project_splits.find({}, {"_id": 0}):
        if p.get("project_id"):
            projects[p["project_id"]] = _shape(p)
    return {**_shape(doc), "projects": projects}


@router.get("/accountant/project-cost-control/split")
async def get_cost_control_split(user: User = Depends(get_current_user)):
    """The all-projects split plus every project's own split, keyed by project_id."""
    return await _full_config()


@router.patch("/accountant/project-cost-control/split")
async def update_cost_control_split(data: CostControlSplit, user: User = Depends(get_current_user)):
    """Set the all-projects split (optionally resetting every project's own split)."""
    _check(user, data)
    now = datetime.now(timezone.utc).isoformat()
    await db.project_cost_control_config.update_one(
        {"_id": SPLIT_DOC_ID},
        {"$set": {"direct_pct": float(data.direct_pct), "indirect_pct": float(data.indirect_pct),
                  "updated_by": user.user_id, "updated_by_name": user.name, "updated_at": now}},
        upsert=True,
    )
    if data.reset_projects:
        await db.project_cost_control_project_splits.delete_many({})
    return await _full_config()


@router.put("/accountant/project-cost-control/split/projects/{project_id}")
async def set_project_cost_control_split(project_id: str, data: CostControlSplit, user: User = Depends(get_current_user)):
    """Give one project its own split."""
    _check(user, data)
    if not await db.projects.find_one({"project_id": project_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Project not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.project_cost_control_project_splits.update_one(
        {"project_id": project_id},
        {"$set": {"project_id": project_id, "direct_pct": float(data.direct_pct), "indirect_pct": float(data.indirect_pct),
                  "updated_by": user.user_id, "updated_by_name": user.name, "updated_at": now}},
        upsert=True,
    )
    return await _full_config()


@router.delete("/accountant/project-cost-control/split/projects/{project_id}")
async def clear_project_cost_control_split(project_id: str, user: User = Depends(get_current_user)):
    """Put one project back on the all-projects split."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can change the split")
    await db.project_cost_control_project_splits.delete_one({"project_id": project_id})
    return await _full_config()
