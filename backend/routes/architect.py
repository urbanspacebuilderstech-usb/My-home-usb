"""Architect routes - Site Plans, Design Files, 3D/Elevation management"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.database import db
from routes.auth import get_current_user, User

router = APIRouter(prefix="/architect", tags=["Architect"])

ARCHITECT_ROLES = ["architect", "super_admin", "general_manager"]

def require_architect(user: User):
    if user.role not in ARCHITECT_ROLES:
        raise HTTPException(status_code=403, detail="Architect access required")

# ---- Models ----

class SitePlanCreate(BaseModel):
    floor_name: str
    drive_link: Optional[str] = None
    remarks: Optional[str] = None

class SitePlanUpdate(BaseModel):
    floor_name: Optional[str] = None
    drive_link: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None  # yet_to_start, design, approval_waiting, approved

class DesignFileCreate(BaseModel):
    file_name: str
    file_type: str = "3d_photo"  # 3d_photo or elevation
    drive_link: Optional[str] = None
    remarks: Optional[str] = None

class DesignFileUpdate(BaseModel):
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    drive_link: Optional[str] = None
    remarks: Optional[str] = None


# ---- Projects (no financial data) ----

@router.get("/projects")
async def get_architect_projects(status: Optional[str] = None, user: User = Depends(get_current_user)):
    require_architect(user)
    query = {}
    if status:
        query["status"] = status
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    result = []
    for p in projects:
        # Get design stats for this project
        site_plans_count = await db.site_plans.count_documents({"project_id": p["project_id"]})
        design_files_count = await db.design_files.count_documents({"project_id": p["project_id"]})
        pending_approval = await db.site_plans.count_documents({"project_id": p["project_id"], "status": "approval_waiting"})

        result.append({
            "project_id": p["project_id"],
            "project_code": p.get("project_code", ""),
            "name": p.get("name", ""),
            "client_name": p.get("client_name", ""),
            "client_phone": p.get("client_phone", ""),
            "location": p.get("location", ""),
            "city": p.get("city", ""),
            "building_type": p.get("building_type", ""),
            "total_area": p.get("total_area", ""),
            "floors": p.get("floors", ""),
            "status": p.get("status", ""),
            "current_stage": p.get("current_stage", ""),
            "created_at": p.get("created_at", ""),
            "site_plans_count": site_plans_count,
            "design_files_count": design_files_count,
            "pending_approval": pending_approval,
        })
    return result


# ---- Site Plans (floor-wise with status workflow) ----

@router.get("/projects/{project_id}/site-plans")
async def get_site_plans(project_id: str, status: Optional[str] = None, user: User = Depends(get_current_user)):
    require_architect(user)
    query = {"project_id": project_id}
    if status:
        query["status"] = status
    plans = await db.site_plans.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    return plans

@router.post("/projects/{project_id}/site-plans")
async def create_site_plan(project_id: str, data: SitePlanCreate, user: User = Depends(get_current_user)):
    require_architect(user)
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    plan = {
        "plan_id": f"sp_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "floor_name": data.floor_name,
        "drive_link": data.drive_link or "",
        "remarks": data.remarks or "",
        "status": "yet_to_start",
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.site_plans.insert_one(plan)
    plan.pop("_id", None)
    return plan

@router.patch("/projects/{project_id}/site-plans/{plan_id}")
async def update_site_plan(project_id: str, plan_id: str, data: SitePlanUpdate, user: User = Depends(get_current_user)):
    require_architect(user)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = user.user_id

    result = await db.site_plans.update_one(
        {"plan_id": plan_id, "project_id": project_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Site plan not found")
    return {"message": "Site plan updated"}

@router.post("/projects/{project_id}/site-plans/{plan_id}/submit")
async def submit_site_plan(project_id: str, plan_id: str, user: User = Depends(get_current_user)):
    """Submit site plan for GM approval (changes status to approval_waiting)"""
    require_architect(user)
    plan = await db.site_plans.find_one({"plan_id": plan_id, "project_id": project_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Site plan not found")
    if plan["status"] == "approved":
        raise HTTPException(status_code=400, detail="Already approved")

    await db.site_plans.update_one(
        {"plan_id": plan_id},
        {"$set": {
            "status": "approval_waiting",
            "submitted_by": user.user_id,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Create notification for GM
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "type": "design_approval",
        "title": f"Site Plan Approval: {plan['floor_name']}",
        "message": f"Architect submitted '{plan['floor_name']}' for project approval",
        "project_id": project_id,
        "plan_id": plan_id,
        "target_roles": ["general_manager", "super_admin"],
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_read": False,
    }
    await db.notifications.insert_one(notification)

    return {"message": "Site plan submitted for GM approval"}

@router.delete("/projects/{project_id}/site-plans/{plan_id}")
async def delete_site_plan(project_id: str, plan_id: str, user: User = Depends(get_current_user)):
    require_architect(user)
    result = await db.site_plans.delete_one({"plan_id": plan_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Site plan not found")
    return {"message": "Site plan deleted"}


# ---- GM Approval for Site Plans ----

@router.get("/pending-approvals")
async def get_pending_design_approvals(user: User = Depends(get_current_user)):
    """Get all site plans awaiting GM approval"""
    if user.role not in ["general_manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="GM access required")

    plans = await db.site_plans.find({"status": "approval_waiting"}, {"_id": 0}).to_list(500)

    # Enrich with project info
    for plan in plans:
        project = await db.projects.find_one({"project_id": plan["project_id"]}, {"_id": 0, "name": 1, "client_name": 1})
        plan["project_name"] = project.get("name", "") if project else ""
        plan["client_name"] = project.get("client_name", "") if project else ""

    return plans

@router.patch("/site-plans/{plan_id}/approve")
async def approve_site_plan(plan_id: str, approved: bool = True, rejection_reason: str = "", user: User = Depends(get_current_user)):
    """GM approves or rejects a site plan"""
    if user.role not in ["general_manager", "super_admin"]:
        raise HTTPException(status_code=403, detail="GM access required")

    plan = await db.site_plans.find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Site plan not found")

    new_status = "approved" if approved else "design"
    updates = {
        "status": new_status,
        "approved_by": user.user_id if approved else None,
        "approved_at": datetime.now(timezone.utc).isoformat() if approved else None,
        "rejection_reason": rejection_reason if not approved else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.site_plans.update_one({"plan_id": plan_id}, {"$set": updates})

    return {"message": f"Site plan {'approved' if approved else 'rejected'}"}


# ---- Design Files (3D Photos / Elevations - simple upload) ----

@router.get("/projects/{project_id}/design-files")
async def get_design_files(project_id: str, file_type: Optional[str] = None, user: User = Depends(get_current_user)):
    require_architect(user)
    query = {"project_id": project_id}
    if file_type:
        query["file_type"] = file_type
    files = await db.design_files.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return files

@router.post("/projects/{project_id}/design-files")
async def create_design_file(project_id: str, data: DesignFileCreate, user: User = Depends(get_current_user)):
    require_architect(user)
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    file_doc = {
        "file_id": f"df_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "file_name": data.file_name,
        "file_type": data.file_type,
        "drive_link": data.drive_link or "",
        "remarks": data.remarks or "",
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.design_files.insert_one(file_doc)
    file_doc.pop("_id", None)
    return file_doc

@router.patch("/projects/{project_id}/design-files/{file_id}")
async def update_design_file(project_id: str, file_id: str, data: DesignFileUpdate, user: User = Depends(get_current_user)):
    require_architect(user)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.design_files.update_one(
        {"file_id": file_id, "project_id": project_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Design file not found")
    return {"message": "Design file updated"}

@router.delete("/projects/{project_id}/design-files/{file_id}")
async def delete_design_file(project_id: str, file_id: str, user: User = Depends(get_current_user)):
    require_architect(user)
    result = await db.design_files.delete_one({"file_id": file_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Design file not found")
    return {"message": "Design file deleted"}


# ---- Endpoint for ProjectDetail Documents tab to fetch architect files ----

@router.get("/projects/{project_id}/all-design-data")
async def get_all_design_data(project_id: str, user: User = Depends(get_current_user)):
    """Returns all site plans + design files for a project (used by Documents tab)"""
    site_plans = await db.site_plans.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    design_files = await db.design_files.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {
        "site_plans": site_plans,
        "design_files": design_files,
    }
