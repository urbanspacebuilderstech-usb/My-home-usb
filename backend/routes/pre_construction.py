"""Pre-Construction stage tracker.

Tracks 7 parallel pre-construction tasks per project:
  bhoomi_pooja → soil_test → structural_approval → hut → borewell → agreement → eb_connection

Each stage independently moves through:  pending → scheduled → completed

Stored embedded on the project document under `project.pre_construction.<stage_key>`:
    {
      "status": "pending" | "scheduled" | "completed",
      "scheduled_at": ISO datetime string | null,
      "completed_at": ISO datetime string | null,
      "updated_at": ISO datetime string,
      "updated_by": user_id,
    }
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user
from core.database import db
from core.models import User, UserRole

router = APIRouter()

PC_STAGES = [
    {"key": "bhoomi_pooja",         "label": "Bhoomi Pooja"},
    {"key": "soil_test",            "label": "Soil Test"},
    {"key": "structural_approval",  "label": "Structural Approval"},
    {"key": "hut",                  "label": "Hut"},
    {"key": "borewell",             "label": "Borewell"},
    {"key": "agreement",            "label": "Agreement"},
    {"key": "eb_connection",        "label": "EB Connection"},
]
PC_STAGE_KEYS = {s["key"] for s in PC_STAGES}
ALLOWED_STATUSES = {"pending", "scheduled", "completed"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_stage() -> dict:
    return {
        "status": "pending",
        "scheduled_at": None,
        "completed_at": None,
        "updated_at": None,
        "updated_by": None,
    }


def _ensure_pc(project: dict) -> dict:
    pc = project.get("pre_construction") or {}
    out = {}
    for s in PC_STAGES:
        st = pc.get(s["key"]) or {}
        out[s["key"]] = {
            "status": st.get("status", "pending"),
            "scheduled_at": st.get("scheduled_at"),
            "completed_at": st.get("completed_at"),
            "updated_at": st.get("updated_at"),
            "updated_by": st.get("updated_by"),
        }
    return out


# ──────────────────────────────────────────────────────────────────────────────
# List (overview + per-project rows for a single stage)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/cre/pre-construction")
async def list_pre_construction(stage: Optional[str] = None, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access Pre-Construction")

    if stage and stage not in PC_STAGE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage}")

    # Pull every active project (exclude soft-deleted / archived)
    projects = await db.projects.find(
        {
            "$or": [
                {"is_archived": {"$exists": False}},
                {"is_archived": False},
            ],
            "is_deleted": {"$ne": True},
        },
        {
            "_id": 0,
            "project_id": 1,
            "name": 1,
            "client_name": 1,
            "client_phone": 1,
            "location": 1,
            "total_value": 1,
            "pre_construction": 1,
            "created_at": 1,
            "project_code": 1,
        },
    ).sort("created_at", -1).to_list(2000)

    # Compute counts per (stage_key, status) and build row list
    counts = {s["key"]: {"pending": 0, "scheduled": 0, "completed": 0} for s in PC_STAGES}
    rows = []

    for p in projects:
        pc = _ensure_pc(p)
        for s in PC_STAGES:
            counts[s["key"]][pc[s["key"]]["status"]] += 1

        if stage:
            st = pc[stage]
            rows.append({
                "project_id": p.get("project_id"),
                "project_code": p.get("project_code"),
                "name": p.get("name"),
                "client_name": p.get("client_name"),
                "client_phone": p.get("client_phone"),
                "location": p.get("location"),
                "total_value": p.get("total_value"),
                "stage": stage,
                **st,
            })

    return {
        "stages": PC_STAGES,
        "counts": counts,
        "total_projects": len(projects),
        "rows": rows if stage else None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Update a stage on a project
# ──────────────────────────────────────────────────────────────────────────────
class StageUpdate(BaseModel):
    status: Optional[str] = None              # pending | scheduled | completed
    scheduled_at: Optional[str] = None        # ISO datetime
    clear_schedule: Optional[bool] = False


@router.patch("/cre/pre-construction/{project_id}/{stage_key}")
async def update_pc_stage(
    project_id: str,
    stage_key: str,
    body: StageUpdate,
    user: User = Depends(get_current_user),
):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can update Pre-Construction")
    if stage_key not in PC_STAGE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown stage: {stage_key}")
    if body.status and body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "pre_construction": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pc = _ensure_pc(project)
    stage = pc[stage_key]

    if body.clear_schedule:
        stage["scheduled_at"] = None
        if stage["status"] == "scheduled":
            stage["status"] = "pending"
    if body.scheduled_at is not None and not body.clear_schedule:
        stage["scheduled_at"] = body.scheduled_at
        # Auto-promote to scheduled if it was pending
        if stage["status"] == "pending":
            stage["status"] = "scheduled"

    if body.status:
        stage["status"] = body.status
        if body.status == "completed":
            stage["completed_at"] = _now()
        elif body.status == "pending":
            stage["completed_at"] = None
        elif body.status == "scheduled":
            stage["completed_at"] = None

    stage["updated_at"] = _now()
    stage["updated_by"] = user.user_id

    pc[stage_key] = stage
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"pre_construction": pc}},
    )

    return {"message": "Stage updated", "stage": stage_key, "data": stage}
