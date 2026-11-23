"""Project Cost Control split (Nov 23 2026).

Accounts > Project Wise > Project Cost Control splits each project's Grand
Total into a Direct and an Indirect budget by this percentage. It is its own
setting on purpose: the Cashflow Engine's 85/15 (cashflow_config) splits
income and stays independent; changing one never moves the other.
"""
from datetime import datetime, timezone

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


def _shape(doc: dict) -> dict:
    return {
        "direct_pct": float(doc.get("direct_pct", DEFAULT_SPLIT["direct_pct"])),
        "indirect_pct": float(doc.get("indirect_pct", DEFAULT_SPLIT["indirect_pct"])),
        "updated_by_name": doc.get("updated_by_name"),
        "updated_at": doc.get("updated_at"),
    }


@router.get("/accountant/project-cost-control/split")
async def get_cost_control_split(user: User = Depends(get_current_user)):
    doc = await db.project_cost_control_config.find_one({"_id": SPLIT_DOC_ID}, {"_id": 0}) or {}
    return _shape(doc)


@router.patch("/accountant/project-cost-control/split")
async def update_cost_control_split(data: CostControlSplit, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can change the split")
    if abs(data.direct_pct + data.indirect_pct - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="Direct % + Indirect % must add up to 100")
    now = datetime.now(timezone.utc).isoformat()
    await db.project_cost_control_config.update_one(
        {"_id": SPLIT_DOC_ID},
        {"$set": {"direct_pct": float(data.direct_pct), "indirect_pct": float(data.indirect_pct),
                  "updated_by": user.user_id, "updated_by_name": user.name, "updated_at": now}},
        upsert=True,
    )
    doc = await db.project_cost_control_config.find_one({"_id": SPLIT_DOC_ID}, {"_id": 0}) or {}
    return _shape(doc)
