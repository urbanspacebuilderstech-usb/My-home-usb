"""
CRE (Customer Relationship Executive) Routes

Handles:
- New deals from Sales
- Convert deal to project
- Project management for CRE
- Payment collection
- Dashboard metrics
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import secrets

from core.database import db
from core.dependencies import get_current_user, User
from core.enums import UserRole, ProjectStage

router = APIRouter(prefix="/cre", tags=["CRE"])

# Project stages for dashboard
PROJECT_STAGES = [
    "drawing", "yet_to_start", "foundation", "basement",
    "ss_brick_work", "ss_plastering", "finishing", "handover"
]


# ==================== MODELS ====================

class ConvertDealInput(BaseModel):
    """Input for converting a deal to a project"""
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: Optional[str] = "residential"
    expected_start_date: Optional[str] = None
    package_id: Optional[str] = None
    advance_amount: float
    payment_mode: str
    payment_reference: Optional[str] = ""
    accountant_confirmed: bool = False


# ==================== ROUTES ====================

@router.get("/new-deals")
async def get_cre_new_deals(user: User = Depends(get_current_user)):
    """Get closed deals from Sales that need to be converted to projects"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    # Find Deal Closed stage
    deal_closed_stage = await db.lead_stages.find_one({"name": "Deal Closed", "stage_type": "sales"})
    if not deal_closed_stage:
        deal_closed_stage = await db.crm_stages.find_one({"name": "Deal Closed", "stage_type": "sales"})
    if not deal_closed_stage:
        return []
    
    # Get leads in deal_closed stage that don't have a project yet
    cursor = db.leads.find({
        "current_stage_id": deal_closed_stage["stage_id"],
        "stage_type": "sales",
        "$or": [
            {"project_created": {"$ne": True}},
            {"project_created": {"$exists": False}}
        ]
    }).sort("updated_at", -1)
    
    deals = []
    async for lead in cursor:
        lead.pop("_id", None)
        deals.append(lead)
    
    return deals


@router.post("/convert-deal/{lead_id}")
async def convert_deal_to_project(
    lead_id: str,
    data: ConvertDealInput,
    user: User = Depends(get_current_user)
):
    """Convert a closed deal into a project with advance payment"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can convert deals")
    
    # Get the lead
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check if already converted
    if lead.get("project_created"):
        raise HTTPException(status_code=400, detail="Deal already converted to project")
    
    # Verify accountant confirmation
    if not data.accountant_confirmed:
        raise HTTPException(status_code=400, detail="Accountant confirmation required")
    
    # Get RE project if available
    re_project = None
    if lead.get("re_project_id"):
        re_project = await db.re_projects.find_one({"re_project_id": lead["re_project_id"]})
    
    now = datetime.now(timezone.utc)
    project_id = f"proj_{secrets.token_hex(6)}"
    project_code = f"PRJ-{datetime.now().strftime('%Y%m')}-{secrets.token_hex(3).upper()}"
    
    # Calculate expected completion
    handover_months = re_project.get("handover_months", 12) if re_project else 12
    expected_completion = now + timedelta(days=handover_months * 30)
    
    # Build project from form data + defaults
    project_name = data.project_name or (re_project.get("project_name") if re_project else None) or lead.get("name", "New Project")
    client_name = data.client_name or lead.get("name")
    client_phone = data.client_phone or lead.get("phone")
    client_email = data.client_email or lead.get("email")
    location = data.location or (re_project.get("location") if re_project else None) or lead.get("city", "")
    sqft = data.sqft or (re_project.get("sqft") if re_project else None) or 0
    building_type = data.building_type or (re_project.get("building_type") if re_project else None) or "residential"
    total_value = re_project.get("estimated_total", 0) if re_project else 0
    
    main_project = {
        "project_id": project_id,
        "project_code": project_code,
        "name": project_name,
        "client_name": client_name,
        "client_email": client_email,
        "client_phone": client_phone,
        "location": location,
        "sqft": sqft,
        "building_type": building_type,
        "total_value": total_value,
        "advance_amount": data.advance_amount,
        "advance_payment_mode": data.payment_mode,
        "advance_payment_reference": data.payment_reference,
        "advance_received_at": now.isoformat(),
        "advance_collected_by": user.user_id,
        "additional_cost": 0,
        "income_project": data.advance_amount,
        "income_additional": 0,
        "total_expense": 0,
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        "start_date": now.isoformat(),
        "expected_completion": expected_completion.isoformat(),
        "status": "pending_payment",
        "accountant_verified": False,
        "re_project_id": lead.get("re_project_id"),
        "lead_id": lead_id,
        "package_id": data.package_id,
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "converted_by_cre": user.user_id,
        "converted_at": now.isoformat()
    }
    
    await db.projects.insert_one(main_project)
    
    # Update lead
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "project_created": True,
            "project_id": project_id,
            "converted_at": now.isoformat(),
            "converted_by": user.user_id
        }}
    )
    
    # Update RE project status if exists
    if lead.get("re_project_id"):
        await db.re_projects.update_one(
            {"re_project_id": lead["re_project_id"]},
            {"$set": {"status": "converted", "project_id": project_id}}
        )
    
    return {
        "success": True,
        "project_id": project_id,
        "project_code": project_code,
        "message": "Project created successfully",
        "advance_collected": data.advance_amount,
        "status": "pending_payment"
    }


@router.patch("/projects/{project_id}/accountant-verify")
async def accountant_verify_advance(project_id: str, user: User = Depends(get_current_user)):
    """Accountant verifies the advance payment"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can verify payments")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "pending_payment":
        raise HTTPException(status_code=400, detail=f"Project must be in pending_payment status")
    
    now = datetime.now(timezone.utc)
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "payment_received",
            "accountant_verified": True,
            "accountant_verified_by": user.user_id,
            "accountant_verified_at": now.isoformat()
        }}
    )
    
    # Record income entry
    income_entry = {
        "income_id": f"inc_{secrets.token_hex(6)}",
        "project_id": project_id,
        "type": "advance",
        "amount": project.get("advance_amount", 0),
        "payment_mode": project.get("advance_payment_mode"),
        "payment_reference": project.get("advance_payment_reference"),
        "verified_by": user.user_id,
        "verified_at": now.isoformat(),
        "created_at": now.isoformat()
    }
    await db.income_entries.insert_one(income_entry)
    
    return {"message": "Advance payment verified", "status": "payment_received"}


@router.patch("/projects/{project_id}/send-to-planning")
async def send_project_to_planning(project_id: str, user: User = Depends(get_current_user)):
    """CRE sends verified project to Planning department"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can send projects to planning")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "payment_received":
        raise HTTPException(status_code=400, detail="Project must have payment verified first")
    
    now = datetime.now(timezone.utc)
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "in_planning",
            "sent_to_planning_by": user.user_id,
            "sent_to_planning_at": now.isoformat()
        }}
    )
    
    return {"message": "Project sent to Planning", "status": "in_planning"}


@router.get("/dashboard")
async def get_cre_dashboard(user: User = Depends(get_current_user)):
    """Get CRE dashboard metrics"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    base_query = {}
    draft_count = await db.projects.count_documents({**base_query, "status": "draft"})
    pending_payment_count = await db.projects.count_documents({**base_query, "status": "pending_payment"})
    payment_received_count = await db.projects.count_documents({**base_query, "status": "payment_received"})
    in_planning_count = await db.projects.count_documents({**base_query, "status": {"$in": ["in_planning", "planning", "planning_review"]}})
    approved_count = await db.projects.count_documents({**base_query, "status": {"$in": ["planning_approved", "active", "gm_approved"]}})
    
    # Total ongoing projects
    total_ongoing = await db.projects.count_documents({
        "status": {"$nin": ["completed", "cancelled", "draft"]}
    })
    
    # Total project value
    pipeline = [
        {"$match": {"status": {"$nin": ["completed", "cancelled"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_value"}}}
    ]
    result = await db.projects.aggregate(pipeline).to_list(1)
    total_project_value = result[0]["total"] if result else 0
    
    # Recent projects
    recent_projects = await db.projects.find(
        {}, {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Packages
    packages = await db.packages.find({}, {"_id": 0}).to_list(100)
    
    # Stage counts
    stage_counts = {}
    for stage in PROJECT_STAGES:
        count = await db.projects.count_documents({
            "current_stage": stage,
            "status": {"$nin": ["completed", "cancelled"]}
        })
        stage_counts[stage] = count
    
    # Payments to collect
    pipeline = [
        {"$match": {"status": {"$in": ["pending", "partial"]}}},
        {"$lookup": {
            "from": "projects",
            "localField": "project_id",
            "foreignField": "project_id",
            "as": "project"
        }},
        {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "stage_id": 1,
            "stage_name": 1,
            "project_id": 1,
            "project_name": "$project.name",
            "amount": 1,
            "amount_received": 1,
            "balance": {"$subtract": ["$amount", {"$ifNull": ["$amount_received", 0]}]}
        }},
        {"$match": {"balance": {"$gt": 0}}},
        {"$limit": 50}
    ]
    payments_to_collect = await db.payment_stages.aggregate(pipeline).to_list(50)
    
    return {
        "draft_count": draft_count,
        "pending_payment_count": pending_payment_count,
        "payment_received_count": payment_received_count,
        "in_planning_count": in_planning_count,
        "approved_count": approved_count,
        "total_ongoing": total_ongoing,
        "total_project_value": total_project_value,
        "recent_projects": recent_projects,
        "packages": packages,
        "project_stages": PROJECT_STAGES,
        "stage_counts": stage_counts,
        "payments_to_collect": payments_to_collect
    }


@router.get("/payment-requests")
async def get_payment_requests(user: User = Depends(get_current_user)):
    """Get pending payment requests for CRE to collect"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    pipeline = [
        {"$match": {"status": {"$in": ["pending", "partial"]}}},
        {"$lookup": {
            "from": "projects",
            "localField": "project_id",
            "foreignField": "project_id",
            "as": "project"
        }},
        {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "stage_id": 1,
            "stage_name": 1,
            "project_id": 1,
            "project_name": "$project.name",
            "client_name": "$project.client_name",
            "amount": 1,
            "amount_received": {"$ifNull": ["$amount_received", 0]},
            "balance": {"$subtract": ["$amount", {"$ifNull": ["$amount_received", 0]}]},
            "due_date": 1,
            "status": 1
        }},
        {"$match": {"balance": {"$gt": 0}}},
        {"$sort": {"due_date": 1}},
        {"$limit": 100}
    ]
    
    payment_requests = await db.payment_stages.aggregate(pipeline).to_list(100)
    return payment_requests


@router.get("/projects/all")
async def get_all_cre_projects(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all projects visible to CRE"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    query = {}
    if status:
        statuses = status.split(",")
        query["status"] = {"$in": statuses}
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return projects
