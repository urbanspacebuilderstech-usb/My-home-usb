"""
Project Management Routes - CRUD, Search, Vendor Portal, Comprehensive View, Payment Schedule, Scope Items, Deductions, Bulk Operations, Work Order Assignments, Commitments, Notifications
Migrated from server.py monolith
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query, Body
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
import random
import hashlib
import resend
from bson import ObjectId

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from security import InputValidator

# Resend (transactional email) — initialised at module load so all email-OTP
# endpoints (work-order freeze, archive project, etc.) share the same client.
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

logger = logging.getLogger(__name__)

router = APIRouter()



@router.get("/projects")
async def get_projects(include_deleted: bool = False, planning_person_id: Optional[str] = None, user: User = Depends(get_current_user)):
    # IDOR Fix: Role-based project filtering
    full_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT, UserRole.CRE
    ]
    # Soft-deleted filter (only Super Admin can opt-in to see them)
    deleted_filter = {} if (include_deleted and user.role == UserRole.SUPER_ADMIN) else \
                     {"$or": [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]}
    if user.role == UserRole.CLIENT:
        projects = await db.projects.find({"client_user_id": user.user_id, **deleted_filter}, {"_id": 0}).to_list(1000)
    elif user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        projects = await db.projects.find(
            {"$and": [
                {"$or": [{"assigned_to": user.user_id}, {"team_members": user.user_id}]},
                deleted_filter,
            ]},
            {"_id": 0}
        ).to_list(1000)
    elif user.role == UserRole.PLANNING_PERSON:
        # Planning Person only sees projects assigned to them by the Planning Head
        projects = await db.projects.find(
            {"$and": [{"assigned_planning_person_id": user.user_id}, deleted_filter]},
            {"_id": 0}
        ).to_list(1000)
    elif user.role in full_access_roles:
        # Planning Head & full-access roles can additionally narrow by planning_person_id query param
        base_filter = dict(deleted_filter)
        if planning_person_id:
            base_filter["assigned_planning_person_id"] = planning_person_id
        projects = await db.projects.find(base_filter, {"_id": 0}).to_list(1000)
    else:
        projects = await db.projects.find(deleted_filter, {"_id": 0}).to_list(1000)
    
    # Collect all project IDs for batch queries
    project_ids = [p["project_id"] for p in projects]
    
    # Batch fetch payment stages and income for all projects
    all_payment_stages = await db.payment_stages.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0}
    ).to_list(10000)
    
    all_expenses = await db.expenses.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0}
    ).to_list(10000)
    
    # Group payment stages and expenses by project_id
    stages_by_project = {}
    for stage in all_payment_stages:
        pid = stage["project_id"]
        if pid not in stages_by_project:
            stages_by_project[pid] = []
        stages_by_project[pid].append(stage)
    
    expenses_by_project = {}
    for expense in all_expenses:
        pid = expense["project_id"]
        if pid not in expenses_by_project:
            expenses_by_project[pid] = []
        expenses_by_project[pid].append(expense)
    
    for proj in projects:
        if isinstance(proj.get("start_date"), str):
            proj["start_date"] = datetime.fromisoformat(proj["start_date"])
        if isinstance(proj.get("expected_completion"), str):
            proj["expected_completion"] = datetime.fromisoformat(proj["expected_completion"])
        if isinstance(proj.get("created_at"), str):
            proj["created_at"] = datetime.fromisoformat(proj["created_at"])
        
        # Calculate total received = advance payment + stage payments received
        advance_amount = proj.get("advance_amount", 0) or 0
        project_stages = stages_by_project.get(proj["project_id"], [])
        stages_received = sum(s.get("amount_received", 0) or 0 for s in project_stages)
        proj["total_received"] = advance_amount + stages_received
        
        # Calculate total spent from expenses
        project_expenses = expenses_by_project.get(proj["project_id"], [])
        proj["total_spent"] = sum(e.get("amount", 0) or 0 for e in project_expenses if e.get("status") == "approved")
        
        # Calculate balance = total_value - total_spent  (or total_received - total_spent for cash flow)
        proj["balance"] = proj.get("total_value", 0) - proj["total_spent"]
    
    return projects


@router.post("/projects")
async def create_project(project: Project, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    project_dict = project.model_dump()
    project_dict["start_date"] = project_dict["start_date"].isoformat()
    project_dict["expected_completion"] = project_dict["expected_completion"].isoformat()
    project_dict["created_at"] = project_dict["created_at"].isoformat()
    
    await db.projects.insert_one(project_dict)
    
    await create_audit_log(user.user_id, "create", "project", project.project_id, {"project_name": project.name})
    return project


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: User = Depends(get_current_user)):
    project_doc = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project_doc:
        raise HTTPException(status_code=404, detail="Project not found")

    # IDOR guard: scope the project view by role
    # CLIENT — only their own project
    if user.role == UserRole.CLIENT and project_doc.get("client_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    # VENDOR — only projects they have an active PO/assignment on
    if user.role == UserRole.VENDOR:
        po_match = await db.purchase_orders.find_one({
            "project_id": project_id,
            "$or": [{"vendor_id": user.user_id}, {"vendor_user_id": user.user_id}],
        }, {"_id": 0, "po_id": 1})
        assignment = None
        if not po_match:
            assignment = await db.project_vendor_assignments.find_one({
                "project_id": project_id,
                "$or": [{"vendor_id": user.user_id}, {"vendor_user_id": user.user_id}],
            }, {"_id": 0})
        if not po_match and not assignment:
            raise HTTPException(status_code=403, detail="Permission denied")
    # SITE_ENGINEER / SR_SITE_ENGINEER / ASSOCIATE_PM — only assigned/team-member projects
    if user.role in (UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM):
        if (
            project_doc.get("assigned_to") != user.user_id
            and user.user_id not in (project_doc.get("team_members") or [])
        ):
            assigned = await db.site_engineer_assignments.find_one({
                "project_id": project_id, "user_id": user.user_id
            }, {"_id": 0, "assignment_id": 1})
            if not assigned:
                raise HTTPException(status_code=403, detail="Permission denied")
    # PLANNING_PERSON — only projects assigned to them by Planning Head
    if user.role == UserRole.PLANNING_PERSON:
        if project_doc.get("assigned_planning_person_id") != user.user_id:
            raise HTTPException(status_code=403, detail="Permission denied — project not assigned to you")

    if isinstance(project_doc.get("start_date"), str):
        project_doc["start_date"] = datetime.fromisoformat(project_doc["start_date"])
    if isinstance(project_doc.get("expected_completion"), str):
        project_doc["expected_completion"] = datetime.fromisoformat(project_doc["expected_completion"])
    if isinstance(project_doc.get("created_at"), str):
        project_doc["created_at"] = datetime.fromisoformat(project_doc["created_at"])
    
    return project_doc


@router.post("/projects/{project_id}/assign-planning-person")
async def assign_planning_person(
    project_id: str,
    body: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    """Planning Head assigns a Planning Person to a project.

    Body: { "planning_person_id": "user_xxx" }  — pass null/empty to unassign.
    """
    if user.role not in (UserRole.PLANNING, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Only Planning Head can assign Planning Person")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pp_id = (body or {}).get("planning_person_id")
    set_fields: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    unset_fields: Dict[str, Any] = {}

    if not pp_id:
        # Unassign
        unset_fields = {"assigned_planning_person_id": "", "assigned_planning_person_name": "", "assigned_planning_person_at": ""}
        await db.projects.update_one({"project_id": project_id}, {"$set": set_fields, "$unset": unset_fields})
        await create_audit_log(user.user_id, "unassign_planning_person", "project", project_id, {"project_name": project.get("name")})
        return {"message": "Planning Person unassigned", "assigned_planning_person_id": None}

    pp_user = await db.users.find_one({"user_id": pp_id, "role": UserRole.PLANNING_PERSON.value, "is_active": True}, {"_id": 0, "user_id": 1, "name": 1})
    if not pp_user:
        raise HTTPException(status_code=404, detail="Planning Person not found or inactive")

    set_fields["assigned_planning_person_id"] = pp_user["user_id"]
    set_fields["assigned_planning_person_name"] = pp_user.get("name") or ""
    set_fields["assigned_planning_person_at"] = datetime.now(timezone.utc).isoformat()
    set_fields["assigned_planning_person_by"] = user.user_id
    set_fields["assigned_planning_person_by_name"] = user.name

    await db.projects.update_one({"project_id": project_id}, {"$set": set_fields})
    try:
        await create_notification(
            pp_user["user_id"],
            f"You have been assigned to project: {project.get('name')}",
        )
    except Exception:
        pass
    await create_audit_log(user.user_id, "assign_planning_person", "project", project_id, {
        "project_name": project.get("name"),
        "planning_person_id": pp_user["user_id"],
        "planning_person_name": pp_user.get("name"),
    })
    return {
        "message": "Planning Person assigned",
        "assigned_planning_person_id": pp_user["user_id"],
        "assigned_planning_person_name": pp_user.get("name"),
    }


@router.patch("/projects/{project_id}/critical")
async def toggle_project_critical(
    project_id: str,
    body: Dict[str, Any] = Body(...),
    user: User = Depends(get_current_user),
):
    """Mark / unmark a project as Critical with an optional note.

    Body: { "is_critical": true/false, "critical_notes": "..." }
    """
    if user.role not in (UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.GENERAL_MANAGER):
        raise HTTPException(status_code=403, detail="Permission denied")
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    set_doc = {
        "is_critical": bool((body or {}).get("is_critical")),
        "critical_notes": ((body or {}).get("critical_notes") or "").strip(),
        "critical_marked_by": user.user_id,
        "critical_marked_by_name": user.name,
        "critical_marked_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if not set_doc["is_critical"]:
        # Keep history of last note but clear active flag/note
        set_doc["critical_notes"] = ""
    await db.projects.update_one({"project_id": project_id}, {"$set": set_doc})
    return {
        "message": "Project critical flag updated",
        "is_critical": set_doc["is_critical"],
        "critical_notes": set_doc["critical_notes"],
    }


@router.get("/projects/{project_id}/value-summary")
async def get_project_value_summary(project_id: str, user: User = Depends(get_current_user)):
    """Returns the locked Project Value (= approved FE grand_total) along with
    the live scope/additions/deductions snapshot. Used by ProjectDetail header
    to show "Project Value: ₹X (from Final Estimate)" with a lock icon.
    """
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    scope = await db.scope_items.find({"project_id": project_id}, {"_id": 0, "total_amount": 1}).to_list(500)
    adds = await db.additional_costs.find({"project_id": project_id}, {"_id": 0, "estimated_amount": 1}).to_list(500)
    deds = await db.deductions.find({"project_id": project_id}, {"_id": 0, "amount": 1}).to_list(500)
    scope_total = sum((s.get("total_amount") or 0) for s in scope)
    add_total = sum((a.get("estimated_amount") or 0) for a in adds)
    ded_total = sum((d.get("amount") or 0) for d in deds)
    # PROJECT VALUE = Scope only (FE scope total).
    # GRAND PROJECT VALUE = Project Value + Additions − Deductions.
    locked = float(project.get("total_value") or 0)
    project_value = locked if locked > 0 else round(scope_total, 2)
    grand = max(0, round(project_value + add_total - ded_total, 2))
    live_grand = grand  # backwards-compatible alias
    fe = project.get("fe") or {}
    is_locked = bool(project.get("fe_locked_at"))
    return {
        "project_id": project_id,
        "project_value": project_value,
        "grand_project_value": grand,
        "fe_locked_value": float(project.get("fe_locked_value") or 0),
        "fe_locked_at": project.get("fe_locked_at"),
        "fe_locked_by": project.get("fe_locked_by"),
        "is_locked": is_locked,
        "live_scope_total": round(scope_total, 2),
        "live_additions_total": round(add_total, 2),
        "live_deductions_total": round(ded_total, 2),
        "live_grand_total": live_grand,
        "fe_status": fe.get("status") if isinstance(fe, dict) else None,
        "fe_revision": fe.get("revision") if isinstance(fe, dict) else None,
        # Drift = live scope vs locked value (only scope drives Project Value)
        "has_drift": is_locked and abs(round(scope_total, 2) - project_value) > 0.5,
    }


@router.get("/boq/{project_id}")
async def get_boq(project_id: str, user: User = Depends(get_current_user)):
    boq_items = await db.boq_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for item in boq_items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    return boq_items


@router.post("/boq")
async def create_boq_item(boq_item: BOQItem, user: User = Depends(get_current_user)):
    if user.role != UserRole.PLANNING:
        raise HTTPException(status_code=403, detail="Only Planning Department can create BOQ")
    
    boq_dict = boq_item.model_dump()
    boq_dict["created_at"] = boq_dict["created_at"].isoformat()
    await db.boq_items.insert_one(boq_dict)
    
    await create_audit_log(user.user_id, "create", "boq", boq_item.boq_id, {"item_name": boq_item.item_name})
    return boq_item


@router.get("/work-orders")
async def get_work_orders(user: User = Depends(get_current_user)):
    if user.role == UserRole.ACCOUNTANT:
        work_orders = await db.work_orders.find({"status": WorkOrderStatus.SUBMITTED}, {"_id": 0}).to_list(1000)
    elif user.role == UserRole.PROJECT_MANAGER:
        work_orders = await db.work_orders.find({"created_by_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    elif user.role == UserRole.PROCUREMENT:
        work_orders = await db.work_orders.find({"status": WorkOrderStatus.APPROVED}, {"_id": 0}).to_list(1000)
    else:
        work_orders = await db.work_orders.find({}, {"_id": 0}).to_list(1000)
    
    for wo in work_orders:
        if isinstance(wo.get("created_at"), str):
            wo["created_at"] = datetime.fromisoformat(wo["created_at"])
        if wo.get("approved_at") and isinstance(wo["approved_at"], str):
            wo["approved_at"] = datetime.fromisoformat(wo["approved_at"])
    
    return work_orders


class WorkOrderCreate(BaseModel):
    project_id: str
    boq_id: str
    requested_quantity: float
    purpose: str


@router.post("/work-orders")
async def create_work_order(work_order_input: WorkOrderCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    boq_item = await db.boq_items.find_one({"boq_id": work_order_input.boq_id}, {"_id": 0})
    if not boq_item:
        raise HTTPException(status_code=404, detail="BOQ item not found")
    
    # Calculate estimated cost
    estimated_cost = boq_item["unit_rate"] * work_order_input.requested_quantity
    
    work_order = WorkOrder(
        project_id=work_order_input.project_id,
        boq_id=work_order_input.boq_id,
        created_by_user_id=user.user_id,
        requested_quantity=work_order_input.requested_quantity,
        estimated_cost=estimated_cost,
        purpose=work_order_input.purpose,
        status=WorkOrderStatus.DRAFT
    )
    
    wo_dict = work_order.model_dump()
    wo_dict["created_at"] = wo_dict["created_at"].isoformat()
    
    await db.work_orders.insert_one(wo_dict)
    await create_audit_log(user.user_id, "create", "work_order", work_order.work_order_id, {"status": work_order.status})
    
    return work_order


@router.patch("/work-orders/{work_order_id}/submit")
async def submit_work_order(work_order_id: str, user: User = Depends(get_current_user)):
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id},
        {"$set": {"status": WorkOrderStatus.SUBMITTED}}
    )
    
    await create_audit_log(user.user_id, "submit", "work_order", work_order_id, {"status": "submitted"})
    
    accountants = await db.users.find({"role": UserRole.ACCOUNTANT}, {"_id": 0}).to_list(100)
    for acc in accountants:
        notif = Notification(
            user_id=acc["user_id"],
            title="New Work Order",
            message=f"Work order {work_order_id} submitted for approval",
            link="/approvals"
        )
        notif_dict = notif.model_dump()
        notif_dict["created_at"] = notif_dict["created_at"].isoformat()
        await db.notifications.insert_one(notif_dict)
        
        if acc.get("email"):
            await send_notification_email(
                acc["email"],
                "New Work Order for Approval",
                f"<p>Work order {work_order_id} has been submitted for approval.</p>"
            )
    
    return {"message": "Work order submitted"}


@router.patch("/work-orders/{work_order_id}/approve")
async def approve_work_order(work_order_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")
    
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id},
        {"$set": {
            "status": WorkOrderStatus.APPROVED,
            "approved_by_user_id": user.user_id,
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await create_audit_log(user.user_id, "approve", "work_order", work_order_id, {"status": "approved"})
    
    pm = await db.users.find_one({"user_id": wo["created_by_user_id"]}, {"_id": 0})
    if pm and pm.get("email"):
        await send_notification_email(
            pm["email"],
            "Work Order Approved",
            f"<p>Work order {work_order_id} has been approved.</p>"
        )
    
    return {"message": "Work order approved"}


@router.patch("/work-orders/{work_order_id}/reject")
async def reject_work_order(work_order_id: str, reason: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id},
        {"$set": {
            "status": WorkOrderStatus.REJECTED,
            "rejection_reason": reason
        }}
    )
    
    await create_audit_log(user.user_id, "reject", "work_order", work_order_id, {"status": "rejected", "reason": reason})
    
    return {"message": "Work order rejected"}


@router.get("/vendors")
async def get_vendors(user: User = Depends(get_current_user)):
    # RBAC: Restrict vendor list to management/procurement roles
    vendor_access = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
                     UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER, UserRole.CRE]
    if user.role not in vendor_access:
        raise HTTPException(status_code=403, detail="Access denied")
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(1000)
    for v in vendors:
        if isinstance(v.get("created_at"), str):
            v["created_at"] = datetime.fromisoformat(v["created_at"])
    return vendors


@router.post("/vendors")
async def create_vendor(vendor: Vendor, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor_dict = vendor.model_dump()
    vendor_dict["created_at"] = vendor_dict["created_at"].isoformat()
    await db.vendors.insert_one(vendor_dict)
    
    await create_audit_log(user.user_id, "create", "vendor", vendor.vendor_id, {"name": vendor.name})
    return vendor


@router.get("/purchase-orders")
async def get_purchase_orders(user: User = Depends(get_current_user)):
    if user.role == UserRole.VENDOR:
        vendor = await db.vendors.find_one({"user_id": user.user_id}, {"_id": 0})
        if vendor:
            pos = await db.purchase_orders.find({"vendor_id": vendor["vendor_id"]}, {"_id": 0}).to_list(1000)
        else:
            pos = []
    else:
        pos = await db.purchase_orders.find({}, {"_id": 0}).to_list(1000)
    
    for po in pos:
        if isinstance(po.get("expected_delivery"), str):
            po["expected_delivery"] = datetime.fromisoformat(po["expected_delivery"])
        if po.get("dispatch_date") and isinstance(po["dispatch_date"], str):
            po["dispatch_date"] = datetime.fromisoformat(po["dispatch_date"])
        if isinstance(po.get("created_at"), str):
            po["created_at"] = datetime.fromisoformat(po["created_at"])
    
    return pos


@router.post("/purchase-orders")
async def create_purchase_order(po: PurchaseOrder, user: User = Depends(get_current_user)):
    if user.role != UserRole.PROCUREMENT:
        raise HTTPException(status_code=403, detail="Only Procurement can create PO")
    
    po_dict = po.model_dump()
    po_dict["expected_delivery"] = po_dict["expected_delivery"].isoformat()
    po_dict["created_at"] = po_dict["created_at"].isoformat()
    
    await db.purchase_orders.insert_one(po_dict)
    await create_audit_log(user.user_id, "create", "purchase_order", po.po_id, {"vendor_id": po.vendor_id})
    
    return po


@router.post("/site-receipts/upload-image")
async def upload_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineer can upload")
    
    contents = await file.read()
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    return {"file_id": str(file_id)}


@router.get("/site-receipts/image/{file_id}")
async def get_image(file_id: str, request: Request):
    # Cookie-based auth (needed for <img> tags)
    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "image/jpeg") if grid_out.metadata else "image/jpeg"
        return Response(content=contents, media_type=content_type)
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")


@router.post("/site-receipts")
async def create_site_receipt(receipt: SiteReceipt, user: User = Depends(get_current_user)):
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineer can create receipt")
    
    receipt.site_engineer_user_id = user.user_id
    receipt_dict = receipt.model_dump()
    receipt_dict["captured_at"] = receipt_dict["captured_at"].isoformat()
    receipt_dict["created_at"] = receipt_dict["created_at"].isoformat()
    
    await db.site_receipts.insert_one(receipt_dict)
    
    wo = await db.work_orders.find_one({"work_order_id": receipt.work_order_id}, {"_id": 0})
    if wo:
        await db.work_orders.update_one(
            {"work_order_id": receipt.work_order_id},
            {"$set": {"status": WorkOrderStatus.CLOSED}}
        )
        
        expense = Expense(
            project_id=wo["project_id"],
            category="Material",
            amount=wo["estimated_cost"],
            description=f"Auto-generated from site receipt {receipt.receipt_id}",
            work_order_id=receipt.work_order_id,
            created_by_user_id=user.user_id
        )
        
        expense_dict = expense.model_dump()
        expense_dict["created_at"] = expense_dict["created_at"].isoformat()
        await db.expenses.insert_one(expense_dict)
    
    await create_audit_log(user.user_id, "create", "site_receipt", receipt.receipt_id, {"work_order_id": receipt.work_order_id})
    
    return receipt


@router.get("/expenses")
async def get_expenses(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    # RBAC: Financial data restricted
    finance_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
                     UserRole.PROJECT_MANAGER, UserRole.CRE]
    if user.role not in finance_roles:
        raise HTTPException(status_code=403, detail="Access denied to expense data")
    query = {}
    if project_id:
        query["project_id"] = project_id
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    for exp in expenses:
        if isinstance(exp.get("created_at"), str):
            exp["created_at"] = datetime.fromisoformat(exp["created_at"])
    return expenses


@router.get("/payments")
async def get_payments(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    # RBAC: Financial data restricted
    finance_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
                     UserRole.PROJECT_MANAGER, UserRole.CRE]
    if user.role not in finance_roles:
        raise HTTPException(status_code=403, detail="Access denied to payment data")
    query = {}
    if project_id:
        query["project_id"] = project_id
    
    payments = await db.payments.find(query, {"_id": 0}).to_list(1000)
    for payment in payments:
        if isinstance(payment.get("payment_date"), str):
            payment["payment_date"] = datetime.fromisoformat(payment["payment_date"])
        if isinstance(payment.get("created_at"), str):
            payment["created_at"] = datetime.fromisoformat(payment["created_at"])
    return payments


@router.post("/payments")
async def create_payment(payment: Payment, user: User = Depends(get_current_user)):
    # RBAC: Only accountant/admin can create payments
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant or Admin can create payments")
    payment_dict = payment.model_dump()
    payment_dict["payment_date"] = payment_dict["payment_date"].isoformat()
    payment_dict["created_at"] = payment_dict["created_at"].isoformat()
    await db.payments.insert_one(payment_dict)
    
    await create_audit_log(user.user_id, "create", "payment", payment.payment_id, {"amount": payment.amount})
    return payment


@router.post("/expenses")
async def create_expense(expense: Expense, user: User = Depends(get_current_user)):
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can create manual expense")
    
    expense.created_by_user_id = user.user_id
    expense_dict = expense.model_dump()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    await db.expenses.insert_one(expense_dict)
    
    await create_audit_log(user.user_id, "create", "expense", expense.expense_id, {"amount": expense.amount})
    return expense


@router.get("/dashboards/super-admin")
async def get_super_admin_dashboard(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({}, {"_id": 0}).to_list(1000)
    
    total_project_value = sum(p.get("total_value", 0) for p in projects)
    total_spent = sum(e.get("amount", 0) for e in expenses)
    total_received = sum(p.get("amount", 0) for p in payments)
    
    return {
        "total_projects": len(projects),
        "total_project_value": total_project_value,
        "total_received": total_received,
        "total_spent": total_spent,
        "balance": total_received - total_spent
    }


@router.get("/dashboards/project/{project_id}")
async def get_project_dashboard(project_id: str, user: User = Depends(get_current_user)):
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    boq_items = await db.boq_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    boq_budget = sum(item.get("total_cost", 0) for item in boq_items)
    
    work_orders = await db.work_orders.find({"project_id": project_id, "status": WorkOrderStatus.APPROVED}, {"_id": 0}).to_list(1000)
    approved_cost = sum(wo.get("estimated_cost", 0) for wo in work_orders)
    
    expenses = await db.expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    actual_spend = sum(exp.get("amount", 0) for exp in expenses)
    
    payments = await db.payments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    return {
        "project_value": project.get("total_value", 0),
        "boq_budget": boq_budget,
        "approved_cost": approved_cost,
        "actual_spend": actual_spend,
        "remaining_balance": boq_budget - actual_spend,
        "total_paid": total_paid
    }


@router.get("/client-portal/project/{project_id}")
async def get_client_portal_data(project_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Client access only")
    
    project = await db.projects.find_one({"project_id": project_id, "client_user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    payments = await db.payments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    # Get payment stages (schedule) - exclude internal notes; honour the
    # user's manual reorder via the persisted `sort_order` field.
    payment_stages = await db.payment_stages.find(
        {"project_id": project_id}, 
        {"_id": 0, "internal_notes": 0}
    ).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(500)
    
    # Get scope items for client view
    scope_items = await db.scope_items.find(
        {"project_id": project_id, "workflow_status": {"$in": ["verified", "approved"]}}, 
        {"_id": 0, "internal_notes": 0}
    ).sort("sort_order", 1).to_list(500)
    
    stages = await db.site_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).sort("captured_at", -1).to_list(1000)
    
    documents = await db.documents.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Additional Work (variations) + Deductions — same data Planning team manages.
    additional_costs = await db.additional_costs.find(
        {"project_id": project_id},
        {"_id": 0, "internal_notes": 0},
    ).sort("sort_order", 1).to_list(500)
    deductions = await db.deductions.find(
        {"project_id": project_id},
        {"_id": 0, "internal_notes": 0},
    ).sort("sort_order", 1).to_list(500)

    # Income entries (read-only, dates + amounts only — no internal fields)
    raw_income = await db.income.find({"project_id": project_id}, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    income_entries = []
    total_income = 0.0
    for e in raw_income:
        amt = float(e.get("amount", 0) or 0)
        total_income += amt
        income_entries.append({
            "income_id": e.get("income_id"),
            "payment_date": e.get("payment_date"),
            "amount": amt,
            "payment_mode": e.get("payment_mode") or "",
            "description": e.get("description") or "",
            "category": e.get("category") or "",
        })

    # Final estimate scope (scope_items already in result) - normalize legacy field names so frontend reads consistently
    normalized_scope_items = []
    for it in scope_items:
        normalized_scope_items.append({
            **it,
            "name": it.get("name") or it.get("item_name") or it.get("description") or "",
            "rate": it.get("rate") or it.get("unit_rate") or 0,
            "total": it.get("total") if it.get("total") is not None else (it.get("total_amount") or 0),
        })

    # Pre-Construction stage data captured by CRE — embedded on the project doc.
    # Uses the canonical 7 stages (bhoomi_pooja, soil_test, structural_approval, hut,
    # borewell, agreement, eb_connection) defined in routes/pre_construction.py.
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
        })

    return {
        "project": project,
        "total_paid": total_paid,
        "balance": project.get("total_value", 0) - total_paid,
        "payment_stages": payment_stages,
        "scope_items": normalized_scope_items,
        "stages": stages,
        "photos": photos,
        "documents": documents,
        "additional_costs": additional_costs,
        "deductions": deductions,
        "income_entries": income_entries,
        "total_income": total_income,
        "pre_construction": pre_construction,
    }


@router.get("/client-portal/my-projects")
async def get_client_projects(user: User = Depends(get_current_user)):
    """Get all projects linked to the current client user"""
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Client access only")
    
    projects = await db.projects.find(
        {"client_user_id": user.user_id}, 
        {"_id": 0}
    ).to_list(100)
    
    # Enrich with summary data
    result = []
    for p in projects:
        payment_stages = await db.payment_stages.find({"project_id": p["project_id"]}, {"_id": 0}).to_list(100)
        total_scheduled = sum(s.get("amount", 0) for s in payment_stages)
        total_received = sum(s.get("amount_received", 0) or 0 for s in payment_stages)
        
        result.append({
            **p,
            "payment_scheduled": total_scheduled,
            "payment_received": total_received,
            "payment_balance": total_scheduled - total_received
        })
    
    return result


@router.post("/site-photos/upload")
async def upload_site_photo(
    project_id: str = Form(...),
    caption: str = Form(None),
    category: str = Form("progress"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    BLOCKED_EXT = {'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'js', 'vbs', 'ps1', 'msi', 'dll'}
    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
    if ext in BLOCKED_EXT:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed.")
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    photo = SitePhoto(
        project_id=project_id,
        file_id=str(file_id),
        caption=caption,
        category=category,
        uploaded_by_user_id=user.user_id
    )
    
    photo_dict = photo.model_dump()
    photo_dict["captured_at"] = photo_dict["captured_at"].isoformat()
    photo_dict["created_at"] = photo_dict["created_at"].isoformat()
    await db.site_photos.insert_one(photo_dict)
    
    await create_audit_log(user.user_id, "upload", "site_photo", photo.photo_id, {"project_id": project_id})
    
    return photo


@router.get("/site-photos/{project_id}")
async def get_site_photos(project_id: str, user: User = Depends(get_current_user)):
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).sort("captured_at", -1).to_list(1000)
    for photo in photos:
        if isinstance(photo.get("captured_at"), str):
            photo["captured_at"] = datetime.fromisoformat(photo["captured_at"])
        if isinstance(photo.get("created_at"), str):
            photo["created_at"] = datetime.fromisoformat(photo["created_at"])
    return photos


@router.post("/documents/upload")
async def upload_document(
    project_id: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    BLOCKED_EXT = {'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'js', 'vbs', 'ps1', 'msi', 'dll'}
    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
    if ext in BLOCKED_EXT:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed.")
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    document = ProjectDocument(
        project_id=project_id,
        file_id=str(file_id),
        title=title,
        category=category,
        uploaded_by_user_id=user.user_id
    )
    
    doc_dict = document.model_dump()
    doc_dict["created_at"] = doc_dict["created_at"].isoformat()
    await db.documents.insert_one(doc_dict)
    
    await create_audit_log(user.user_id, "upload", "document", document.document_id, {"project_id": project_id, "title": title})
    
    return document


@router.get("/documents/{project_id}")
async def get_documents(project_id: str, user: User = Depends(get_current_user)):
    documents = await db.documents.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for doc in documents:
        if isinstance(doc.get("created_at"), str):
            doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return documents


@router.get("/files/{file_id}")
async def get_file(file_id: str, request: Request):
    # Cookie-based auth (needed for <img> tags and embedded content)
    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        return Response(content=contents, media_type=content_type)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


@router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for n in notifs:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"])
    return notifs


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}


@router.post("/users")
async def create_user(user_data: User, current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can create users")
    
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_dict = user_data.model_dump()
    user_dict["created_at"] = user_dict["created_at"].isoformat()
    await db.users.insert_one(user_dict)
    
    return user_data


@router.get("/users")
async def get_users(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for u in users:
        if isinstance(u.get("created_at"), str):
            u["created_at"] = datetime.fromisoformat(u["created_at"])
    return users


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update roles")
    
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": role}})
    return {"message": "Role updated"}


async def create_audit_log(user_id: str, action: str, entity_type: str, entity_id: str, changes: Optional[Dict] = None):
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        changes=changes
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    log_dict["audit_id"] = log_dict.get("log_id", f"aud_{uuid.uuid4().hex[:8]}")
    await db.audit_logs.insert_one(log_dict)


# ==================== WORK ORDER ASSIGNMENT ENDPOINTS ====================

class WorkOrderAssignmentCreate(BaseModel):
    work_order_id: str
    project_id: str
    assigned_to_user_id: str
    due_date: str
    priority: str = "medium"
    notes: Optional[str] = None


# ==================== WORK ORDER NOTE TEMPLATES ====================
# Reusable note templates the Planning team can pick from when creating a
# Work Order. Templates are shared org-wide so HR/Planning Head doesn't have
# to retype standard verbiage like "Material at contractor's cost" etc.

@router.get("/wo-note-templates")
async def list_wo_note_templates(user: User = Depends(get_current_user)):
    items = await db.wo_note_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.post("/wo-note-templates")
async def create_wo_note_template(body: Dict[str, Any] = Body(...), user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    text = (body or {}).get("text", "").strip()
    label = (body or {}).get("label", "").strip() or (text[:60] + ("…" if len(text) > 60 else ""))
    if not text:
        raise HTTPException(status_code=400, detail="Note text is required")
    tpl = {
        "template_id": f"wnt_{uuid.uuid4().hex[:10]}",
        "label": label,
        "text": text,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wo_note_templates.insert_one(tpl)
    tpl.pop("_id", None)
    return tpl


@router.delete("/wo-note-templates/{template_id}")
async def delete_wo_note_template(template_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.wo_note_templates.delete_one({"template_id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Deleted"}


@router.get("/work-order-assignments/{project_id}")
async def get_work_order_assignments(project_id: str, user: User = Depends(get_current_user)):
    assignments = await db.work_order_assignments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for assignment in assignments:
        if isinstance(assignment.get("assignment_date"), str):
            assignment["assignment_date"] = datetime.fromisoformat(assignment["assignment_date"])
        if isinstance(assignment.get("due_date"), str):
            assignment["due_date"] = datetime.fromisoformat(assignment["due_date"])
        if isinstance(assignment.get("created_at"), str):
            assignment["created_at"] = datetime.fromisoformat(assignment["created_at"])
    return assignments


@router.get("/work-order-assignments")
async def get_all_work_order_assignments(user: User = Depends(get_current_user)):
    if user.role == UserRole.SITE_ENGINEER:
        assignments = await db.work_order_assignments.find({"assigned_to_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    else:
        assignments = await db.work_order_assignments.find({}, {"_id": 0}).to_list(1000)
    
    for assignment in assignments:
        if isinstance(assignment.get("assignment_date"), str):
            assignment["assignment_date"] = datetime.fromisoformat(assignment["assignment_date"])
        if isinstance(assignment.get("due_date"), str):
            assignment["due_date"] = datetime.fromisoformat(assignment["due_date"])
        if isinstance(assignment.get("created_at"), str):
            assignment["created_at"] = datetime.fromisoformat(assignment["created_at"])
    return assignments


@router.post("/work-order-assignments")
async def create_work_order_assignment(assignment_input: WorkOrderAssignmentCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    assignment = WorkOrderAssignment(
        work_order_id=assignment_input.work_order_id,
        project_id=assignment_input.project_id,
        assigned_to_user_id=assignment_input.assigned_to_user_id,
        assigned_by_user_id=user.user_id,
        assignment_date=datetime.now(timezone.utc),
        due_date=datetime.fromisoformat(assignment_input.due_date),
        priority=assignment_input.priority,
        notes=assignment_input.notes
    )
    
    assignment_dict = assignment.model_dump()
    assignment_dict["assignment_date"] = assignment_dict["assignment_date"].isoformat()
    assignment_dict["due_date"] = assignment_dict["due_date"].isoformat()
    assignment_dict["created_at"] = assignment_dict["created_at"].isoformat()
    
    await db.work_order_assignments.insert_one(assignment_dict)
    
    # Notify assigned user
    assigned_user = await db.users.find_one({"user_id": assignment.assigned_to_user_id}, {"_id": 0})
    if assigned_user:
        notif = Notification(
            user_id=assignment.assigned_to_user_id,
            title="New Work Order Assignment",
            message=f"You have been assigned work order {assignment.work_order_id}",
            link="/work-orders"
        )
        notif_dict = notif.model_dump()
        notif_dict["created_at"] = notif_dict["created_at"].isoformat()
        await db.notifications.insert_one(notif_dict)
    
    await create_audit_log(user.user_id, "create", "work_order_assignment", assignment.assignment_id, {"work_order_id": assignment.work_order_id})
    return assignment


@router.patch("/work-order-assignments/{assignment_id}/status")
async def update_assignment_status(assignment_id: str, status: str, user: User = Depends(get_current_user)):
    await db.work_order_assignments.update_one(
        {"assignment_id": assignment_id},
        {"$set": {"status": status}}
    )
    await create_audit_log(user.user_id, "update", "work_order_assignment", assignment_id, {"status": status})
    return {"message": "Assignment status updated"}


# ==================== PROJECT COMMITMENT ENDPOINTS ====================

class ProjectCommitmentCreate(BaseModel):
    project_id: str
    item_name: str
    quantity: float
    units: str
    unit_rate: float
    category: str


@router.get("/project-commitments/{project_id}")
async def get_project_commitments(project_id: str, user: User = Depends(get_current_user)):
    commitments = await db.project_commitments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for commitment in commitments:
        if isinstance(commitment.get("committed_date"), str):
            commitment["committed_date"] = datetime.fromisoformat(commitment["committed_date"])
        if isinstance(commitment.get("created_at"), str):
            commitment["created_at"] = datetime.fromisoformat(commitment["created_at"])
    return commitments


@router.post("/project-commitments")
async def create_project_commitment(commitment_input: ProjectCommitmentCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    total_cost = commitment_input.quantity * commitment_input.unit_rate
    
    commitment = ProjectCommitment(
        project_id=commitment_input.project_id,
        item_name=commitment_input.item_name,
        quantity=commitment_input.quantity,
        units=commitment_input.units,
        unit_rate=commitment_input.unit_rate,
        total_cost=total_cost,
        category=commitment_input.category
    )
    
    commitment_dict = commitment.model_dump()
    commitment_dict["committed_date"] = commitment_dict["committed_date"].isoformat()
    commitment_dict["created_at"] = commitment_dict["created_at"].isoformat()
    
    await db.project_commitments.insert_one(commitment_dict)
    await create_audit_log(user.user_id, "create", "project_commitment", commitment.commitment_id, {"item": commitment.item_name})
    
    return commitment


@router.delete("/project-commitments/{commitment_id}")
async def delete_project_commitment(commitment_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.project_commitments.delete_one({"commitment_id": commitment_id})
    await create_audit_log(user.user_id, "delete", "project_commitment", commitment_id, {})
    return {"message": "Commitment deleted"}


# ==================== SUPER ADMIN NOTIFICATION ENDPOINTS ====================

@router.get("/admin/notifications")
async def get_admin_notifications(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    # Get all notifications across all users
    notifs = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for n in notifs:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"])
    return notifs


@router.get("/admin/pending-approvals")
async def get_pending_approvals(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    pending_work_orders = await db.work_orders.find({"status": WorkOrderStatus.SUBMITTED}, {"_id": 0}).to_list(1000)
    for wo in pending_work_orders:
        if isinstance(wo.get("created_at"), str):
            wo["created_at"] = datetime.fromisoformat(wo["created_at"])
    
    return {
        "pending_work_orders": pending_work_orders,
        "count": len(pending_work_orders)
    }


@router.get("/admin/dashboard-summary")
async def get_admin_dashboard_summary(user: User = Depends(get_current_user)):
    """Get comprehensive Super Admin dashboard data — optimized with bulk queries"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    # Get all projects
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    project_ids = [p.get("project_id") for p in projects]
    
    # Bulk-fetch all related data in parallel
    scope_all, additions_all, stages_all, deductions_all, expenses_all = await asyncio.gather(
        db.scope_items.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "total_amount": 1}).to_list(10000),
        db.additional_costs.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "estimated_amount": 1, "income_received": 1}).to_list(10000),
        db.payment_stages.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "amount_received": 1}).to_list(10000),
        db.deductions.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "amount": 1}).to_list(10000),
        db.expenses.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "amount": 1}).to_list(10000),
    )
    
    # Index by project_id
    from collections import defaultdict
    scope_by_proj = defaultdict(list)
    for s in scope_all: scope_by_proj[s["project_id"]].append(s)
    add_by_proj = defaultdict(list)
    for a in additions_all: add_by_proj[a["project_id"]].append(a)
    stages_by_proj = defaultdict(list)
    for st in stages_all: stages_by_proj[st["project_id"]].append(st)
    ded_by_proj = defaultdict(list)
    for d in deductions_all: ded_by_proj[d["project_id"]].append(d)
    exp_by_proj = defaultdict(list)
    for e in expenses_all: exp_by_proj[e["project_id"]].append(e)
    
    totals = {
        "project_total_value": 0, "project_addition_cost": 0, "project_value_total": 0,
        "income_project": 0, "income_additional": 0, "income_total": 0,
        "balance_project": 0, "balance_additional": 0, "balance_grand_total": 0,
        "total_expense": 0, "cash_in_book": 0, "total_projects": len(projects)
    }
    
    project_summaries = []
    for p in projects:
        pid = p.get("project_id")
        scope_items = scope_by_proj.get(pid, [])
        scope_total = sum(i.get("total_amount", 0) for i in scope_items)
        project_value = scope_total if scope_items else p.get("total_value", 0)
        
        additions_total = sum(c.get("estimated_amount", 0) for c in add_by_proj.get(pid, []))
        additions_income = sum(c.get("income_received", 0) for c in add_by_proj.get(pid, []))
        payment_received = sum(s.get("amount_received", 0) for s in stages_by_proj.get(pid, []))
        deductions_total = sum(d.get("amount", 0) for d in ded_by_proj.get(pid, []))
        expenses_total = sum(e.get("amount", 0) for e in exp_by_proj.get(pid, []))
        
        value_total = project_value + additions_total
        income_total = payment_received + additions_income
        balance_project = project_value - payment_received
        balance_additional = additions_total - additions_income
        balance_total = balance_project + balance_additional - deductions_total
        cash_in_book = income_total - expenses_total
        
        totals["project_total_value"] += project_value
        totals["project_addition_cost"] += additions_total
        totals["project_value_total"] += value_total
        totals["income_project"] += payment_received
        totals["income_additional"] += additions_income
        totals["income_total"] += income_total
        totals["balance_project"] += balance_project
        totals["balance_additional"] += balance_additional
        totals["balance_grand_total"] += balance_total
        totals["total_expense"] += expenses_total
        totals["cash_in_book"] += cash_in_book
        
        project_summaries.append({
            "project_id": pid, "name": p.get("name"), "client_name": p.get("client_name"),
            "location": p.get("location"), "status": p.get("status"),
            "project_value": project_value, "additions": additions_total,
            "total_value": value_total, "income_received": income_total,
            "deductions": deductions_total, "balance": balance_total,
            "expenses": expenses_total, "cash_in_book": cash_in_book
        })
    
    return {"totals": totals, "projects": project_summaries}


@router.get("/admin/financial-overview")
async def get_financial_overview(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    summary = {
        "total_project_value": 0,
        "total_additional_cost": 0,
        "total_value": 0,
        "total_income_project": 0,
        "total_income_additional": 0,
        "total_income": 0,
        "total_balance_project": 0,
        "total_balance_additional": 0,
        "total_balance": 0,
        "total_expense": 0,
        "total_cash_in_book": 0
    }
    
    project_details = []
    for idx, p in enumerate(projects):
        project_value = p.get("total_value", 0)
        additional_cost = p.get("additional_cost", 0)
        income_project = p.get("income_project", 0)
        income_additional = p.get("income_additional", 0)
        total_expense = p.get("total_expense", 0)
        
        # Auto-calculated fields
        value_total = project_value + additional_cost
        income_total = income_project + income_additional
        balance_project = project_value - income_project
        balance_additional = additional_cost - income_additional
        balance_total = balance_project + balance_additional
        cash_in_book = income_total - total_expense
        
        project_details.append({
            "sno": idx + 1,
            "project_id": p.get("project_id"),
            "name": p.get("name"),
            "status": p.get("status", "planning"),
            # Input fields (red)
            "project_value": project_value,
            "additional_cost": additional_cost,
            "income_project": income_project,
            "income_additional": income_additional,
            "total_expense": total_expense,
            # Calculated fields
            "value_total": value_total,
            "income_total": income_total,
            "balance_project": balance_project,
            "balance_additional": balance_additional,
            "balance_total": balance_total,
            "cash_in_book": cash_in_book
        })
        
        # Update summary
        summary["total_project_value"] += project_value
        summary["total_additional_cost"] += additional_cost
        summary["total_value"] += value_total
        summary["total_income_project"] += income_project
        summary["total_income_additional"] += income_additional
        summary["total_income"] += income_total
        summary["total_balance_project"] += balance_project
        summary["total_balance_additional"] += balance_additional
        summary["total_balance"] += balance_total
        summary["total_expense"] += total_expense
        summary["total_cash_in_book"] += cash_in_book
    
    return {
        "summary": summary,
        "projects": project_details
    }


# ==================== PROJECT SEARCH & FILTER ====================

@router.get("/projects/search")
async def search_projects(
    q: Optional[str] = None,
    project_id: Optional[str] = None,
    project_code: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Search projects by name, ID, code, or client name - available to all authenticated users"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    elif project_code:
        query["project_code"] = {"$regex": project_code, "$options": "i"}
    elif q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"project_id": {"$regex": q, "$options": "i"}},
            {"project_code": {"$regex": q, "$options": "i"}},
            {"client_name": {"$regex": q, "$options": "i"}}
        ]
    
    projects = await db.projects.find(query, {
        "_id": 0,
        "project_id": 1,
        "project_code": 1,
        "name": 1,
        "client_name": 1,
        "location": 1,
        "status": 1,
        "current_stage": 1,
        "total_value": 1
    }).sort("created_at", -1).to_list(50)
    
    return projects


@router.get("/projects/list-for-filter")
async def get_projects_for_filter(user: User = Depends(get_current_user)):
    """Get minimal project list for dropdown filters across all boards"""
    projects = await db.projects.find({}, {
        "_id": 0,
        "project_id": 1,
        "project_code": 1,
        "name": 1,
        "client_name": 1,
        "status": 1
    }).sort("name", 1).to_list(500)
    
    return projects


@router.post("/projects/{project_id}/link-client")
async def link_client_to_project(project_id: str, client_user_id: str, user: User = Depends(get_current_user)):
    """Link a client user to a project for portal access"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Verify client exists
    client = await db.users.find_one({"user_id": client_user_id, "role": "client"}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client user not found")
    
    # Update project
    result = await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "client_user_id": client_user_id,
            "client_email": client.get("email")
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await create_audit_log(user.user_id, "link_client", "project", project_id, {"client_user_id": client_user_id})
    
    # Notify client
    await create_notification(client_user_id, "You now have access to view your project in the Client Portal.")
    
    return {"message": "Client linked successfully"}


@router.post("/projects/{project_id}/create-client-portal")
async def create_client_portal(project_id: str, data: dict, user: User = Depends(get_current_user)):
    """CRE creates client login credentials for a specific project.
    Body: { email, password }
    - If a client user with that email exists, links it to the project (and updates password).
    - If not, creates a new 'client' user.
    Returns the credentials so CRE can copy/share via WhatsApp.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Only CRE / PM / Super Admin can create client portal access")

    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Lazy-import auth helper
    from .auth import hash_password as _hash
    pw_hash = _hash(password)

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()

    if existing:
        # Re-use this account; ensure role is client (or already client) & update password.
        if existing.get("role") not in (UserRole.CLIENT.value, "client"):
            # Don't downgrade an internal account
            raise HTTPException(status_code=400, detail="An account with this email already exists with a different role. Use a different email.")
        await db.users.update_one(
            {"user_id": existing["user_id"]},
            {"$set": {"password_hash": pw_hash, "is_active": True, "name": existing.get("name") or project.get("client_name", "Client"), "updated_at": now}}
        )
        client_user_id = existing["user_id"]
    else:
        client_user_id = f"u_{uuid.uuid4().hex[:8]}"
        client_doc = {
            "user_id": client_user_id,
            "name": project.get("client_name") or "Client",
            "email": email,
            "phone": project.get("client_phone") or "",
            "role": UserRole.CLIENT.value,
            "password_hash": pw_hash,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "created_by": user.user_id,
        }
        await db.users.insert_one(client_doc)

    # Link to project (always overwrite so CRE can transfer access)
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"client_user_id": client_user_id, "client_email": email, "client_portal_created_at": now, "client_portal_created_by": user.user_id}}
    )

    await create_audit_log(user.user_id, "create_client_portal", "project", project_id, {"client_user_id": client_user_id, "email": email})

    return {
        "message": "Client portal created",
        "project_id": project_id,
        "project_name": project.get("name"),
        "client_user_id": client_user_id,
        "email": email,
        "password": password,  # returned ONCE so CRE can share. Not stored in plain text anywhere else.
        "portal_url": f"/client",
    }


# ==================== FULL CRUD - UPDATE/DELETE ENDPOINTS ====================

# Project Update/Delete
class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_user_id: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    location: Optional[str] = None
    total_value: Optional[float] = None
    additional_cost: Optional[float] = None
    income_project: Optional[float] = None
    income_additional: Optional[float] = None
    total_expense: Optional[float] = None
    status: Optional[str] = None
    package_id: Optional[str] = None


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, update_data: ProjectUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    # Allow explicitly clearing package_id
    raw = update_data.model_dump()
    if "package_id" in raw and raw["package_id"] == "":
        update_dict["package_id"] = None
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.projects.update_one({"project_id": project_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "project", project_id, update_dict)
    return {"message": "Project updated"}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, hard: bool = False, user: User = Depends(get_current_user)):
    """Soft-delete a project (default) or permanently delete (Super Admin + no financials).

    SOFT DELETE (default):
      - Sets is_deleted=true on the project doc
      - Project disappears from ALL lists / boards / dashboards
      - Income, expenses, payment stages, scope items, deductions — ALL preserved
      - Reversible via /projects/{id}/restore by Super Admin
      - Allowed for: Super Admin, and Planning if project is in planning stage or already archived

    HARD DELETE (?hard=true):
      - Super Admin only
      - REJECTED if the project has ANY financial records (income / expenses / payments)
      - This protects accounting/audit history
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Super Admin or Planning can delete projects")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Permission gate for Planning role (unchanged)
    if user.role == UserRole.PLANNING:
        allowed_statuses = ["in_planning", "planning", "draft", "pending"]
        project_status = project.get("status", "").lower()
        project_stage = project.get("project_stage", "").lower()
        is_archived = bool(project.get("is_archived"))
        if not is_archived and project_status not in allowed_statuses and project_stage not in allowed_statuses:
            raise HTTPException(status_code=403, detail="Planning can only delete projects in planning/draft stage or archived projects")

    # ----- HARD DELETE path -----
    if hard:
        # Super Admin can hard-delete any project (subject to finance check below).
        # Planning can hard-delete only ARCHIVED projects (subject to finance check).
        if user.role == UserRole.PLANNING:
            if not bool(project.get("is_archived")):
                raise HTTPException(status_code=403, detail="Planning can only permanently delete projects that are already archived")
        elif user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only Super Admin or Planning (archived projects) can permanently delete")

        # Refuse if any financial record exists for this project
        finance_collections = [
            ("income", "incoming payments"),
            ("recorded_expenses", "expenses"),
            ("labour_expenses", "labour expenses"),
            ("material_expenses", "material expenses"),
            ("vendor_service_expenses", "vendor service expenses"),
        ]
        # payment_stages with any collected_amount > 0 also counts as financial
        for coll, label in finance_collections:
            count = await db[coll].count_documents({"project_id": project_id})
            if count > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot permanently delete: project has {count} {label} record(s). Use soft delete to hide the project while preserving accounting history.",
                )
        # Check for collected payments on payment stages
        collected = await db.payment_stages.count_documents({
            "project_id": project_id,
            "$or": [
                {"collected_amount": {"$gt": 0}},
                {"status": {"$in": ["paid", "completed", "received", "verified"]}},
            ],
        })
        if collected > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot permanently delete: project has {collected} collected payment record(s). Use soft delete instead.",
            )

        # Safe to hard-delete — wipe project doc + non-financial child rows only
        await db.scope_items.delete_many({"project_id": project_id})
        await db.payment_stages.delete_many({"project_id": project_id})  # all uncollected
        await db.additional_costs.delete_many({"project_id": project_id})
        await db.deductions.delete_many({"project_id": project_id})
        await db.projects.delete_one({"project_id": project_id})
        await create_audit_log(user.user_id, "hard_delete", "project", project_id, {"deleted_by_role": user.role})
        return {"message": "Project permanently deleted (no financial records existed)", "hard_deleted": True}

    # ----- SOFT DELETE path (default) -----
    if project.get("is_deleted"):
        return {"message": "Project already deleted (soft)", "soft_deleted": True}

    now = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now,
            "deleted_by": user.user_id,
            "deleted_by_name": user.name,
        }},
    )
    await create_audit_log(user.user_id, "soft_delete", "project", project_id, {"deleted_by_role": user.role})
    return {
        "message": "Project hidden. All income/expense/payment records preserved for accounting.",
        "soft_deleted": True,
    }


@router.post("/projects/{project_id}/restore")
async def restore_project(project_id: str, user: User = Depends(get_current_user)):
    """Restore a soft-deleted project. Super Admin only."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can restore deleted projects")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project.get("is_deleted"):
        return {"message": "Project is not deleted", "restored": False}

    await db.projects.update_one(
        {"project_id": project_id},
        {"$unset": {"deleted_at": "", "deleted_by": "", "deleted_by_name": ""},
         "$set": {"is_deleted": False}},
    )
    await create_audit_log(user.user_id, "restore", "project", project_id, {})
    return {"message": "Project restored. It will reappear in its original tab.", "restored": True}



# ==================== ARCHIVE / UNARCHIVE PROJECT ====================

@router.post("/projects/{project_id}/archive/send-otp")
async def archive_project_send_otp(project_id: str, user: User = Depends(get_current_user)):
    """Send a 6-digit OTP to Super Admin's email to authorize archiving a project.

    Archive is a high-impact action (project disappears from regular tabs and can
    only be deleted by Planning/Super Admin afterwards) — gating it with email-OTP
    prevents accidental clicks and creates an audit trail of the verifying email."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can archive projects")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1, "is_archived": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("is_archived"):
        raise HTTPException(status_code=400, detail="Project is already archived")

    otp_code = str(random.randint(100000, 999999))
    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Replace any prior OTP for this user/project
    await db.archive_otps.delete_many({"user_id": user.user_id, "project_id": project_id})
    await db.archive_otps.insert_one({
        "user_id": user.user_id,
        "project_id": project_id,
        "otp_hash": otp_hash,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "name": 1})
    user_email = (user_doc or {}).get("email", "")
    user_name = (user_doc or {}).get("name", "Admin")

    if resend.api_key and user_email:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [user_email],
                "subject": f"Archive Project OTP — {project.get('name', '')}",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                    <div style="background: #1F2937; padding: 16px; text-align: center;">
                        <h2 style="margin: 0; color: #FBBF24;">My Home USB</h2>
                    </div>
                    <div style="padding: 24px; background: #fff; border: 1px solid #E5E7EB;">
                        <p style="color: #1F2937;">Hi {user_name},</p>
                        <p style="color: #4B5563;">You requested to <strong>archive</strong> project <strong>{project.get('name', '')}</strong>.</p>
                        <div style="text-align: center; margin: 24px 0; padding: 16px; background: #FEF3C7; border-radius: 8px;">
                            <p style="margin: 0; color: #92400E; font-size: 13px;">Your OTP Code</p>
                            <p style="margin: 8px 0 0; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1F2937;">{otp_code}</p>
                        </div>
                        <p style="color: #9CA3AF; font-size: 12px;">This OTP expires in 10 minutes. If you did not request this, please ignore this email.</p>
                    </div>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Archive OTP sent to {user_email}")
        except Exception as e:
            logger.error(f"Failed to send archive OTP email: {e}")

    masked_email = (user_email[:3] + "***" + user_email[user_email.index("@"):]) if user_email and "@" in user_email else "your email"
    return {"message": f"OTP sent to {masked_email}", "expires_in": 600}


@router.post("/projects/{project_id}/archive")
async def archive_project(project_id: str, data: dict = Body(default={}), user: User = Depends(get_current_user)):
    """Archive a project. SUPER ADMIN ONLY. Requires a valid email-OTP previously
    issued via /archive/send-otp. Archived projects move to the Archive tab and
    are excluded from regular New / Current / Delivered tabs."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can archive projects")

    otp_code = (data or {}).get("otp", "")
    if not otp_code:
        raise HTTPException(status_code=400, detail="OTP is required to archive a project")

    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    record = await db.archive_otps.find_one({
        "user_id": user.user_id,
        "project_id": project_id,
        "otp_hash": otp_hash,
    }, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        await db.archive_otps.delete_many({"user_id": user.user_id, "project_id": project_id})
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.get("is_archived"):
        return {"message": "Project already archived", "archived": True}

    now = datetime.now(timezone.utc).isoformat()
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "is_archived": True,
            "archived_at": now,
            "archived_by": user.user_id,
            "archived_by_name": user.name,
        }},
    )
    # OTP single-use
    await db.archive_otps.delete_many({"user_id": user.user_id, "project_id": project_id})
    await create_audit_log(user.user_id, "archive", "project", project_id, {"archived_by_role": user.role})
    return {"message": "Project archived", "archived": True}


@router.post("/projects/{project_id}/unarchive")
async def unarchive_project(project_id: str, user: User = Depends(get_current_user)):
    """Restore an archived project back to its previous tab."""
    archive_roles = [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER,
                     UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]
    if user.role not in archive_roles:
        raise HTTPException(status_code=403, detail="You don't have permission to unarchive projects")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.projects.update_one(
        {"project_id": project_id},
        {"$unset": {"archived_at": "", "archived_by": "", "archived_by_name": ""},
         "$set": {"is_archived": False}},
    )
    await create_audit_log(user.user_id, "unarchive", "project", project_id, {})
    return {"message": "Project restored", "archived": False}


# ==================== PROJECT PACKAGE MATERIALS ====================

class PackageMaterialEntry(BaseModel):
    name: str
    brand: Optional[str] = ""

class PackageMaterialsPayload(BaseModel):
    materials: List[PackageMaterialEntry]

@router.get("/projects/{project_id}/package-materials")
async def get_project_package_materials(project_id: str, user: User = Depends(get_current_user)):
    """Get project's saved package materials list"""
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "package_materials": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.get("package_materials", [])

@router.put("/projects/{project_id}/package-materials")
async def save_project_package_materials(project_id: str, payload: PackageMaterialsPayload, user: User = Depends(get_current_user)):
    """Save/update project's package materials list"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    mats = [{"name": m.name, "brand": m.brand or ""} for m in payload.materials]
    await db.projects.update_one({"project_id": project_id}, {"$set": {"package_materials": mats}})
    return {"message": "Materials saved", "count": len(mats)}



# BOQ Update/Delete
class BOQUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[float] = None
    unit_rate: Optional[float] = None
    locked: Optional[bool] = None


@router.patch("/boq/{boq_id}")
async def update_boq_item(boq_id: str, update_data: BOQUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can update BOQ")
    
    # Check if BOQ is locked
    boq_item = await db.boq_items.find_one({"boq_id": boq_id}, {"_id": 0})
    if boq_item and boq_item.get("locked") and not update_data.locked:
        raise HTTPException(status_code=400, detail="BOQ item is locked")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Recalculate total_cost if quantity or rate changed
    if "quantity" in update_dict or "unit_rate" in update_dict:
        qty = update_dict.get("quantity", boq_item.get("quantity", 0))
        rate = update_dict.get("unit_rate", boq_item.get("unit_rate", 0))
        update_dict["total_cost"] = qty * rate
    
    await db.boq_items.update_one({"boq_id": boq_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "boq", boq_id, update_dict)
    return {"message": "BOQ item updated"}


@router.delete("/boq/{boq_id}")
async def delete_boq_item(boq_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can delete BOQ")
    
    boq_item = await db.boq_items.find_one({"boq_id": boq_id}, {"_id": 0})
    if boq_item and boq_item.get("locked"):
        raise HTTPException(status_code=400, detail="Cannot delete locked BOQ item")
    
    await db.boq_items.delete_one({"boq_id": boq_id})
    await create_audit_log(user.user_id, "delete", "boq", boq_id, {})
    return {"message": "BOQ item deleted"}


# Vendor Update/Delete
class VendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


@router.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, update_data: VendorUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.vendors.update_one({"vendor_id": vendor_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "vendor", vendor_id, update_dict)
    return {"message": "Vendor updated"}


@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.vendors.delete_one({"vendor_id": vendor_id})
    await create_audit_log(user.user_id, "delete", "vendor", vendor_id, {})
    return {"message": "Vendor deleted"}


# Expense Update/Delete
class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None


@router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, update_data: ExpenseUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update expenses")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.expenses.update_one({"expense_id": expense_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "expense", expense_id, update_dict)
    return {"message": "Expense updated"}


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can delete expenses")
    
    await db.expenses.delete_one({"expense_id": expense_id})
    await create_audit_log(user.user_id, "delete", "expense", expense_id, {})
    return {"message": "Expense deleted"}


# Payment Update/Delete
class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None


@router.patch("/payments/{payment_id}")
async def update_payment(payment_id: str, update_data: PaymentUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update payments")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.payments.update_one({"payment_id": payment_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "payment", payment_id, update_dict)
    return {"message": "Payment updated"}


@router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can delete payments")
    
    await db.payments.delete_one({"payment_id": payment_id})
    await create_audit_log(user.user_id, "delete", "payment", payment_id, {})
    return {"message": "Payment deleted"}


# Purchase Order Update
class POUpdate(BaseModel):
    status: Optional[str] = None
    vehicle_number: Optional[str] = None
    dispatch_date: Optional[str] = None


@router.patch("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, update_data: POUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.VENDOR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if "dispatch_date" in update_dict and update_dict["dispatch_date"]:
        update_dict["dispatch_date"] = datetime.fromisoformat(update_dict["dispatch_date"]).isoformat()
    
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "purchase_order", po_id, update_dict)
    return {"message": "Purchase order updated"}


# User Delete
@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.users.delete_one({"user_id": user_id})
    await create_audit_log(current_user.user_id, "delete", "user", user_id, {})
    return {"message": "User deleted"}


# ==================== VENDOR PORTAL ENDPOINTS ====================

@router.get("/vendor-portal/dashboard")
async def get_vendor_dashboard(user: User = Depends(get_current_user)):
    if user.role != UserRole.VENDOR:
        raise HTTPException(status_code=403, detail="Vendor access only")
    
    # Get vendor linked to this user
    vendor = await db.vendors.find_one({"user_id": user.user_id}, {"_id": 0})
    if not vendor:
        return {
            "vendor": None,
            "purchase_orders": [],
            "stats": {"total_orders": 0, "pending": 0, "dispatched": 0, "completed": 0}
        }
    
    # Get all POs for this vendor
    pos = await db.purchase_orders.find({"vendor_id": vendor["vendor_id"]}, {"_id": 0}).to_list(1000)
    for po in pos:
        if isinstance(po.get("expected_delivery"), str):
            po["expected_delivery"] = datetime.fromisoformat(po["expected_delivery"])
        if po.get("dispatch_date") and isinstance(po["dispatch_date"], str):
            po["dispatch_date"] = datetime.fromisoformat(po["dispatch_date"])
        if isinstance(po.get("created_at"), str):
            po["created_at"] = datetime.fromisoformat(po["created_at"])
    
    stats = {
        "total_orders": len(pos),
        "pending": len([p for p in pos if p.get("status") == "pending"]),
        "dispatched": len([p for p in pos if p.get("status") == "dispatched"]),
        "completed": len([p for p in pos if p.get("status") == "completed"])
    }
    
    return {
        "vendor": vendor,
        "purchase_orders": pos,
        "stats": stats
    }


@router.patch("/vendor-portal/purchase-orders/{po_id}/dispatch")
async def vendor_dispatch_order(po_id: str, vehicle_number: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.VENDOR:
        raise HTTPException(status_code=403, detail="Vendor access only")
    
    # Verify this PO belongs to the vendor
    vendor = await db.vendors.find_one({"user_id": user.user_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    po = await db.purchase_orders.find_one({"po_id": po_id, "vendor_id": vendor["vendor_id"]}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    
    await db.purchase_orders.update_one(
        {"po_id": po_id},
        {"$set": {
            "status": "dispatched",
            "vehicle_number": vehicle_number,
            "dispatch_date": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify procurement
    procurement_users = await db.users.find({"role": UserRole.PROCUREMENT}, {"_id": 0}).to_list(100)
    for proc_user in procurement_users:
        notif = Notification(
            user_id=proc_user["user_id"],
            title="Order Dispatched",
            message=f"PO {po_id} has been dispatched. Vehicle: {vehicle_number}",
            link="/procurement"
        )
        notif_dict = notif.model_dump()
        notif_dict["created_at"] = notif_dict["created_at"].isoformat()
        await db.notifications.insert_one(notif_dict)
    
    await create_audit_log(user.user_id, "dispatch", "purchase_order", po_id, {"vehicle_number": vehicle_number})
    return {"message": "Order dispatched successfully"}


# Link vendor to user account
@router.patch("/vendors/{vendor_id}/link-user")
async def link_vendor_to_user(vendor_id: str, target_user_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Update user role to vendor
    await db.users.update_one({"user_id": target_user_id}, {"$set": {"role": UserRole.VENDOR}})
    
    # Link vendor to user
    await db.vendors.update_one({"vendor_id": vendor_id}, {"$set": {"user_id": target_user_id}})
    
    await create_audit_log(user.user_id, "link", "vendor", vendor_id, {"linked_user": target_user_id})
    return {"message": "Vendor linked to user"}


# ==================== COMPREHENSIVE PROJECT VIEW ENDPOINTS ====================

class PaymentStageCreate(BaseModel):
    project_id: str
    stage_label: str = "1"  # e.g., "1", "2a", "2b"
    stage_name: str
    percentage: float
    amount: float
    due_date: Optional[str] = None
    remarks: Optional[str] = None


class PaymentStageUpdate(BaseModel):
    stage_name: Optional[str] = None
    stage_label: Optional[str] = None
    percentage: Optional[float] = None
    amount: Optional[float] = None
    amount_received: Optional[float] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    remarks: Optional[str] = None


class PaymentCollectionInput(BaseModel):
    """Input for CRE to collect a payment"""
    amount_received: float
    payment_mode: Optional[str] = None  # Legacy single mode
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    remarks: Optional[str] = None
    cheque_details: Optional[list] = None  # [{cheque_number, bank_name, amount, cheque_date}]
    payment_entries: Optional[list] = None  # [{amount, payment_mode, reference, cheque_details}]


class AdditionalCostCreate(BaseModel):
    project_id: str
    description: str
    estimated_amount: float
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None
    section_id: Optional[str] = None


class AdditionalCostUpdate(BaseModel):
    description: Optional[str] = None
    estimated_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    income_received: Optional[float] = None
    status: Optional[str] = None
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None
    section_id: Optional[str] = None  # Move addition between sections (or to ungrouped via empty string)


@router.get("/projects/{project_id}/comprehensive")
async def get_comprehensive_project_view(project_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive project data including BOQ, payment schedule, and additional costs"""
    # IDOR Fix: Only management/financial roles can access comprehensive project view
    comprehensive_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING
    ]
    if user.role not in comprehensive_roles:
        raise HTTPException(status_code=403, detail="Access denied to comprehensive project data")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get BOQ items
    boq_items = await db.boq_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    boq_total = sum(item.get("total_cost", 0) for item in boq_items)
    
    # Get payment schedule stages (sorted by user-assigned sort_order, fallback to created_at)
    payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("created_at", 1)]).to_list(1000)
    for stage in payment_stages:
        if isinstance(stage.get("due_date"), str):
            stage["due_date"] = datetime.fromisoformat(stage["due_date"])
        if isinstance(stage.get("completed_date"), str):
            stage["completed_date"] = datetime.fromisoformat(stage["completed_date"])
        if isinstance(stage.get("created_at"), str):
            stage["created_at"] = datetime.fromisoformat(stage["created_at"])
    
    # Get additional cost items
    additional_costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for cost in additional_costs:
        if isinstance(cost.get("created_at"), str):
            cost["created_at"] = datetime.fromisoformat(cost["created_at"])
    
    # Get payments and expenses for summary
    payments = await db.payments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    total_payments = sum(p.get("amount", 0) for p in payments)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # Calculate payment schedule totals
    payment_schedule_total = sum(s.get("amount", 0) for s in payment_stages)
    payment_schedule_received = sum(s.get("amount_received", 0) for s in payment_stages)
    
    # Calculate additional cost totals
    additional_estimated = sum(c.get("estimated_amount", 0) for c in additional_costs)
    additional_actual = sum(c.get("actual_amount", 0) for c in additional_costs)
    additional_income = sum(c.get("income_received", 0) for c in additional_costs)
    
    # Project summary calculations
    project_value = project.get("total_value", 0)
    
    return {
        "project": project,
        "boq_items": boq_items,
        "boq_total": boq_total,
        "payment_stages": payment_stages,
        "additional_costs": additional_costs,
        "summary": {
            "project_value": project_value,
            "boq_total": boq_total,
            "payment_schedule_total": payment_schedule_total,
            "payment_schedule_received": payment_schedule_received,
            "payment_schedule_balance": payment_schedule_total - payment_schedule_received,
            "additional_estimated": additional_estimated,
            "additional_actual": additional_actual,
            "additional_income": additional_income,
            "additional_balance": additional_estimated - additional_income,
            "total_payments": total_payments,
            "total_expenses": total_expenses,
            "overall_balance": (project_value + additional_estimated) - (total_payments),
            "cash_in_book": total_payments - total_expenses
        }
    }


# Payment Stage CRUD
@router.get("/projects/{project_id}/payment-stages")
async def get_payment_stages(project_id: str, user: User = Depends(get_current_user)):
    stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(1000)
    for stage in stages:
        if isinstance(stage.get("due_date"), str):
            stage["due_date"] = datetime.fromisoformat(stage["due_date"])
        if isinstance(stage.get("completed_date"), str):
            stage["completed_date"] = datetime.fromisoformat(stage["completed_date"])
        if isinstance(stage.get("created_at"), str):
            stage["created_at"] = datetime.fromisoformat(stage["created_at"])
    return stages


@router.post("/payment-stages")
async def create_payment_stage(stage_input: PaymentStageCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Get project to calculate amount from percentage
    project = await db.projects.find_one({"project_id": stage_input.project_id}, {"_id": 0, "total_value": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    total_value = project.get("total_value", 0) or 0

    # Validate total percentage does not exceed 100%
    existing_stages = await db.payment_stages.find(
        {"project_id": stage_input.project_id}, {"_id": 0, "percentage": 1}
    ).to_list(200)
    existing_pct = sum(s.get("percentage", 0) for s in existing_stages)
    new_pct = stage_input.percentage or 0

    if existing_pct + new_pct > 100:
        remaining = round(100 - existing_pct, 2)
        raise HTTPException(
            status_code=400,
            detail=f"Total percentage would be {existing_pct + new_pct}%. Only {remaining}% remaining. Please reduce the percentage."
        )

    # Auto-calculate amount from percentage if not provided or recalculate
    amount = round((total_value * new_pct) / 100) if total_value > 0 and new_pct > 0 else (stage_input.amount or 0)

    stage = PaymentStage(
        project_id=stage_input.project_id,
        stage_name=stage_input.stage_name,
        percentage=new_pct,
        amount=amount,
        due_date=datetime.fromisoformat(stage_input.due_date) if stage_input.due_date else None
    )
    
    stage_dict = stage.model_dump()
    if stage_dict.get("due_date"):
        stage_dict["due_date"] = stage_dict["due_date"].isoformat()
    stage_dict["created_at"] = stage_dict["created_at"].isoformat()
    stage_dict["is_advance"] = stage_input.stage_name.lower().startswith("advance")
    
    await db.payment_stages.insert_one(stage_dict)
    await create_audit_log(user.user_id, "create", "payment_stage", stage.stage_id, {"stage_name": stage.stage_name})
    return stage


@router.patch("/payment-stages/{stage_id}")
async def update_payment_stage(stage_id: str, update_data: PaymentStageUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if "due_date" in update_dict and update_dict["due_date"]:
        update_dict["due_date"] = datetime.fromisoformat(update_dict["due_date"]).isoformat()
    if "completed_date" in update_dict and update_dict["completed_date"]:
        update_dict["completed_date"] = datetime.fromisoformat(update_dict["completed_date"]).isoformat()
    
    # If only percentage was edited, recompute amount from the LOCKED Project
    # Value (= Final Estimate grand_total). Scope items are NOT used here —
    # scope changes are independent of payment-schedule math. The locked value
    # is set on FE approval via _lock_project_value_to_fe(); falls back to the
    # live scope total only if FE has never been approved yet.
    if "percentage" in update_dict and "amount" not in update_dict:
        stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "project_id": 1})
        if stage:
            project_id = stage["project_id"]
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0}) or {}
            total_value = float(project.get("total_value") or 0)
            if not total_value:
                # FE never approved — fall back to live scope sum so the UI still
                # shows reasonable amounts before the first FE lock.
                scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0, "total_amount": 1}).to_list(2000)
                total_value = sum((i.get("total_amount") or 0) for i in scope_items)
            if total_value > 0:
                update_dict["amount"] = round(total_value * float(update_dict["percentage"]) / 100)
    
    await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "payment_stage", stage_id, update_dict)
    return {"message": "Payment stage updated"}


@router.delete("/payment-stages/{stage_id}")
async def delete_payment_stage(stage_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.payment_stages.delete_one({"stage_id": stage_id})
    await create_audit_log(user.user_id, "delete", "payment_stage", stage_id, {})
    return {"message": "Payment stage deleted"}


class MaterializeAdvanceBody(BaseModel):
    percentage: Optional[float] = None
    amount: Optional[float] = None  # override the stated stage amount (₹). Defaults to income amount.
    stage_name: Optional[str] = None  # default "Advance (Sales)"
    expected_payment_date: Optional[str] = None  # ISO date (YYYY-MM-DD) — when balance is expected
    generate_remaining_schedule: bool = False  # If true, auto-create the remaining (100 - %) template rows
    remaining_template_id: Optional[str] = None  # If set, use this saved Payment Schedule template's rows instead of DEFAULT_PAYMENT_SCHEDULE
    remaining_template_rows_override: Optional[List[Dict[str, Any]]] = None  # If set, USE THESE rows directly (e.g. user edited the template inline before applying)


@router.post("/projects/{project_id}/materialize-advance-stage")
async def materialize_advance_stage(project_id: str, data: MaterializeAdvanceBody, user: User = Depends(get_current_user)):
    """Convert the virtual "Auto-collected (Sales)" row into a real, editable payment stage.
    
    Planning sees an auto-generated advance row whenever a project has received
    income but no explicit advance payment_stage. This endpoint materializes
    that row, optionally with a custom rate (%) and/or stated stage amount (₹).
    Received amount (cash already collected) remains tied to the linked income.
    
    If `generate_remaining_schedule=True`, also creates the remaining milestone
    rows from `DEFAULT_PAYMENT_SCHEDULE` (skipping the first row since that's
    the one we just created from the income), proportionally scaled to fill
    the remaining (100 − %).
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Advance percentage is calculated against the LOCKED Project Value
    # (= Final Estimate grand_total). Scope items are not consulted directly
    # so that Scope edits never silently change payment math. Falls back to
    # live scope sum only if FE has not been approved yet.
    project_total_for_pct = float(project.get("total_value") or 0)
    if not project_total_for_pct:
        scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0, "total_amount": 1}).to_list(2000)
        project_total_for_pct = sum((i.get("total_amount") or 0) for i in scope_items)
    if not project_total_for_pct:
        project_total_for_pct = float(project.get("scope_total") or 0)
    total_value = project_total_for_pct
    
    # Find the earliest income entry to link. Try both collections (legacy + new).
    income = await db.income.find_one({"project_id": project_id}, sort=[("payment_date", 1), ("received_date", 1), ("created_at", 1)])
    if not income:
        income = await db.project_income.find_one({"project_id": project_id}, sort=[("received_date", 1), ("created_at", 1)])
    if not income:
        # Final fallback: sum any income and fabricate a placeholder reference
        all_income = await db.income.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        if not all_income:
            all_income = await db.project_income.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        if not all_income:
            raise HTTPException(status_code=400, detail="No collected income found for this project. Add an income entry first.")
        income = all_income[0]
    income_amount = float(income.get("amount") or 0)
    
    # Resolve final percentage + amount. User may pass either, both, or none.
    user_pct = data.percentage if data.percentage is not None else None
    user_amt = data.amount if data.amount is not None else None
    
    if user_pct is None and user_amt is None:
        # Defaults match the current virtual-row display (amount = received income)
        amount = income_amount
        percentage = round((amount / total_value) * 10000) / 100 if total_value > 0 else 0
    elif user_pct is not None and user_amt is None:
        # Edit % only → treat as a PLANNED advance percentage of total project value.
        # This is the contractually-agreed advance; cash received stays at income.
        percentage = float(user_pct)
        amount = round((total_value * percentage) / 100) if total_value > 0 else income_amount
    elif user_amt is not None and user_pct is None:
        amount = float(user_amt)
        percentage = round((amount / total_value) * 10000) / 100 if total_value > 0 else 0
    else:
        percentage = float(user_pct)
        amount = float(user_amt)
    
    if percentage < 0 or percentage > 100:
        raise HTTPException(status_code=400, detail="Percentage must be between 0 and 100")
    if amount < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")
    
    # Refuse if a TRULY-collected advance stage already exists. We only block
    # if the existing "advance" has actually received money (linked income or
    # amount_received > 0). Template-seeded rows that merely START with "Advance"
    # or are flagged is_advance:True with 0 received should NOT block — they
    # will be auto-cleared below before the new advance stage is inserted.
    existing_real_advance = await db.payment_stages.find_one(
        {
            "project_id": project_id,
            "$or": [
                {"linked_income_id": {"$exists": True, "$nin": [None, "", False]}},
                {"amount_received": {"$gt": 0}, "is_advance": True},
            ],
        },
        {"_id": 0}
    )
    if existing_real_advance:
        raise HTTPException(status_code=400, detail="An advance payment stage with collected money already exists for this project.")

    # Clean up any leftover template-seeded "advance" rows or "Stage 01 Payment"
    # placeholder rows so the new advance stage takes their place cleanly.
    await db.payment_stages.delete_many({
        "project_id": project_id,
        "amount_received": {"$in": [0, None]},
        "$or": [
            {"is_advance": True},
            {"stage_name": {"$regex": r"^stage\s*0?1\s*payment\s*$", "$options": "i"}},
            {"stage_name": {"$regex": r"^advance\b", "$options": "i"}},
        ],
    })
    
    # Validate combined percentage stays <= 100 — re-read AFTER cleanup above
    # so the deleted template-seeded rows are no longer counted.
    other_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0, "percentage": 1}).to_list(200)
    other_pct = sum(s.get("percentage", 0) for s in other_stages)
    # If "generate_remaining_schedule" is true, we'll be wiping pending non-collected rows
    # before inserting the new template, so only count rows that have been collected
    # (i.e. amount_received > 0).
    if data.generate_remaining_schedule:
        collected_only = await db.payment_stages.find(
            {"project_id": project_id, "amount_received": {"$gt": 0}}, {"_id": 0, "percentage": 1}
        ).to_list(200)
        other_pct = sum(s.get("percentage", 0) for s in collected_only)
    if other_pct + percentage > 100.01:
        raise HTTPException(status_code=400, detail=f"Total percentage would be {round(other_pct + percentage, 2)}%. Reduce the rate so it fits within 100%.")

    # When auto-generating the remaining schedule, first wipe all pending (non-collected) rows
    # so the new template can be laid down cleanly.
    if data.generate_remaining_schedule:
        await db.payment_stages.delete_many({
            "project_id": project_id,
            "amount_received": {"$in": [0, None]},
        })
    
    stage = PaymentStage(
        project_id=project_id,
        stage_name=(data.stage_name or "Advance (Sales)").strip() or "Advance (Sales)",
        percentage=percentage,
        amount=round(amount),
    )
    stage_dict = stage.model_dump()
    stage_dict["created_at"] = stage_dict["created_at"].isoformat()
    stage_dict["is_advance"] = True
    stage_dict["linked_income_id"] = income.get("income_id") or income.get("entry_id") or income.get("_id")
    stage_dict["amount_received"] = round(income_amount)
    stage_dict["workflow_status"] = "paid" if income_amount >= amount else "partial"
    stage_dict["status"] = "received" if income_amount >= amount else "partial"
    stage_dict["actual_payment_date"] = (income.get("payment_date") or income.get("received_date") or income.get("created_at"))
    if stage_dict.get("actual_payment_date") and not isinstance(stage_dict["actual_payment_date"], str):
        stage_dict["actual_payment_date"] = stage_dict["actual_payment_date"].isoformat() if hasattr(stage_dict["actual_payment_date"], "isoformat") else str(stage_dict["actual_payment_date"])
    # Optional expected balance collection date (used for Req Payment)
    if data.expected_payment_date:
        try:
            stage_dict["expected_payment_date"] = datetime.fromisoformat(data.expected_payment_date).date().isoformat()
            stage_dict["due_date"] = stage_dict["expected_payment_date"]
        except Exception:
            pass
    stage_dict.pop("_id", None)
    
    await db.payment_stages.insert_one(stage_dict)
    
    # Optionally generate remaining schedule from DEFAULT_PAYMENT_SCHEDULE or a saved template
    extra_stages = []
    if data.generate_remaining_schedule:
        remaining_pct = max(0, 100 - percentage)

        # Resolve which rows to use: user-edited override, saved template, or built-in default
        template_rows = None
        if data.remaining_template_rows_override:
            template_rows = [
                {"stage_name": r.get("stage_name", ""), "percentage": float(r.get("percentage") or 0), "remarks": r.get("notes", "") or r.get("remarks", "")}
                for r in data.remaining_template_rows_override
                if (r.get("stage_name") or "").strip()
            ]
        elif data.remaining_template_id:
            tpl_doc = await db.payment_schedule_templates.find_one(
                {"template_id": data.remaining_template_id}, {"_id": 0, "rows": 1}
            )
            if tpl_doc and tpl_doc.get("rows"):
                template_rows = [
                    {"stage_name": r.get("stage_name", ""), "percentage": r.get("percentage") or 0, "remarks": r.get("notes", "")}
                    for r in tpl_doc["rows"]
                    if (r.get("stage_name") or "").strip()
                ]
        if template_rows is None:
            # Built-in default's first row is the "Advance" header which we just materialized — skip it.
            template_rows = [{**r} for r in DEFAULT_PAYMENT_SCHEDULE[1:]]

        template_total = sum((r.get("percentage") or 0) for r in template_rows) or 1
        # Build & insert the remaining rows scaled so their sum == remaining_pct
        for idx, tpl in enumerate(template_rows, start=2):
            tpl_pct = tpl.get("percentage") or 0
            row_pct = round((tpl_pct / template_total) * remaining_pct, 2) if tpl_pct else 0
            row_amount = round((total_value * row_pct) / 100) if total_value > 0 else 0
            new_stage = PaymentStage(
                project_id=project_id,
                stage_number=idx,
                stage_label=str(tpl.get("stage_label") or idx),
                stage_name=tpl.get("stage_name", "") or f"Stage {idx}",
                percentage=row_pct,
                amount=row_amount,
                remarks=tpl.get("remarks") or "",
                workflow_status="draft",
                created_by=user.user_id,
            )
            d = new_stage.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            d.pop("_id", None)
            await db.payment_stages.insert_one(d)
            extra_stages.append(d.get("stage_id"))
    
    await create_audit_log(user.user_id, "materialize_advance", "payment_stage", stage.stage_id, {
        "percentage": percentage,
        "amount": amount,
        "generated_remaining": bool(data.generate_remaining_schedule),
        "remaining_stages": len(extra_stages),
    })
    return {
        "message": "Advance stage materialized",
        "stage_id": stage.stage_id,
        "percentage": percentage,
        "amount": round(amount),
        "generated_remaining_stages": extra_stages,
    }


class PaymentRequestBody(BaseModel):
    expected_payment_date: Optional[str] = None  # ISO date (YYYY-MM-DD) when Planning expects this payment to be collected


@router.patch("/payment-stages/{stage_id}/request")
async def request_payment(stage_id: str, body: Optional[PaymentRequestBody] = None, user: User = Depends(get_current_user)):
    """Planning/PM requests payment from CRE - updates workflow_status to 'requested'.

    Optionally accepts an expected_payment_date so CRE can prioritize / filter by month."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning / PM / GM can request payments")
    
    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    
    project = await db.projects.find_one({"project_id": stage["project_id"]}, {"_id": 0})
    
    set_fields = {
        "workflow_status": "requested",
        "requested_by": user.user_id,
        "requested_by_name": user.name,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    if body and body.expected_payment_date:
        set_fields["expected_payment_date"] = body.expected_payment_date

    # Update workflow status to requested
    await db.payment_stages.update_one(
        {"stage_id": stage_id},
        {"$set": set_fields}
    )

    # Auto-create a monthly_schedule_entries row so the stage shows up
    # on the Planning Payment Schedule + new CRE Payment Schedule tab.
    if body and body.expected_payment_date:
        try:
            dt = datetime.strptime(body.expected_payment_date, "%Y-%m-%d")
            existing = await db.monthly_schedule_entries.find_one(
                {"stage_id": stage_id, "month": dt.month, "year": dt.year},
                {"_id": 0, "entry_id": 1},
            )
            if not existing:
                # Remove any old entry for the same stage in another month so it only appears once
                await db.monthly_schedule_entries.delete_many({"stage_id": stage_id})
                await db.monthly_schedule_entries.insert_one({
                    "entry_id": f"mse_{uuid.uuid4().hex[:12]}",
                    "month": dt.month,
                    "year": dt.year,
                    "project_id": stage["project_id"],
                    "stage_id": stage_id,
                    "expected_payment_date": body.expected_payment_date,
                    "added_by": user.user_id,
                    "added_at": datetime.now(timezone.utc).isoformat(),
                })
        except (ValueError, TypeError):
            # Bad date format — silently skip schedule entry; main request still succeeds
            pass
    
    # Notify all CRE users about the payment request
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1}).to_list(10)
    balance = stage.get("amount", 0) - stage.get("amount_received", 0)
    for cre in cre_users:
        await create_notification(
            cre["user_id"],
            f"Payment Request: ₹{balance:,.0f} for {project.get('name', 'Project')} - {stage.get('stage_name', 'Stage')}"
        )
    
    await create_audit_log(user.user_id, "request_payment", "payment_stage", stage_id, {"amount": balance})
    
    return {"message": "Payment request sent to CRO", "stage_id": stage_id}


# ==================== PAYMENT SCHEDULE MANAGEMENT ====================

@router.post("/projects/{project_id}/payment-schedule/generate")
async def generate_payment_schedule(project_id: str, user: User = Depends(get_current_user)):
    """Planning team generates payment schedule from template based on project value (minus advance)"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can create payment schedule")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if schedule already exists
    existing = await db.payment_stages.count_documents({"project_id": project_id})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Payment schedule already exists. Delete existing stages first.")
    
    # Calculate total project value from scopes + additional costs
    scope_total = project.get("scope_total", 0) or project.get("total_value", 0) or 0
    additional_cost = project.get("additional_cost", 0) or 0
    project_value = scope_total + additional_cost
    
    # Get advance payment (already received)
    advance_amount = project.get("advance_amount", 0) or 0
    
    # Balance to be scheduled = Project Value - Advance Payment
    balance_to_schedule = project_value - advance_amount
    
    if balance_to_schedule <= 0:
        raise HTTPException(status_code=400, detail="No balance to schedule. Project value is less than or equal to advance payment.")
    
    stages_created = []
    
    for idx, template in enumerate(DEFAULT_PAYMENT_SCHEDULE):
        # Calculate amount from balance (not total project value)
        amount = (balance_to_schedule * template["percentage"]) / 100 if template["percentage"] > 0 else 0
        
        stage = PaymentStage(
            project_id=project_id,
            stage_number=idx + 1,
            stage_label=template["stage_label"],
            stage_name=template["stage_name"],
            percentage=template["percentage"],
            amount=amount,
            remarks=template["remarks"],
            workflow_status="pending_collection",
            created_by=user.user_id
        )
        
        stage_dict = stage.model_dump()
        stage_dict["created_at"] = stage_dict["created_at"].isoformat()
        await db.payment_stages.insert_one(stage_dict)
        # Exclude _id from response
        stage_dict.pop("_id", None)
        stages_created.append(stage_dict)
    
    await create_audit_log(user.user_id, "generate_schedule", "payment_schedule", project_id, {
        "stages": len(stages_created),
        "project_value": project_value,
        "advance_amount": advance_amount,
        "balance_scheduled": balance_to_schedule
    })
    
    # Notify CRE about new payment schedule
    if project.get("created_by"):
        await create_notification(project["created_by"], f"Payment schedule created for {project.get('name')}. Advance: ₹{advance_amount:,}, Balance: ₹{balance_to_schedule:,}. Start collecting payments.")
    
    return {"message": f"Payment schedule generated with {len(stages_created)} stages", "stages": stages_created}


@router.post("/projects/{project_id}/payment-schedule/submit")
async def submit_payment_schedule(project_id: str, user: User = Depends(get_current_user)):
    """Submit all draft payment stages for collection - makes them visible to CRO"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning/PM can submit payment schedule")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find all draft payment stages for this project
    draft_stages = await db.payment_stages.find(
        {"project_id": project_id, "workflow_status": "draft"},
        {"_id": 0}
    ).to_list(100)
    
    if not draft_stages:
        raise HTTPException(status_code=400, detail="No draft payment stages to submit")
    
    # Update all draft stages to 'requested' status (pending collection)
    result = await db.payment_stages.update_many(
        {"project_id": project_id, "workflow_status": "draft"},
        {"$set": {"workflow_status": "requested"}}
    )
    
    await create_audit_log(user.user_id, "submit_schedule", "payment_schedule", project_id, {"count": result.modified_count})
    
    # Notify CRE users about new payment requests
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1, "name": 1}).to_list(50)
    for cre in cre_users:
        await create_notification(
            cre["user_id"], 
            f"Payment schedule submitted for {project.get('name')}. {result.modified_count} stages ready for collection."
        )
    
    return {"message": f"Payment schedule submitted. {result.modified_count} stages sent for collection.", "count": result.modified_count}


@router.post("/payment-stages/{stage_id}/collect")
async def collect_stage_payment(stage_id: str, collection: PaymentCollectionInput, user: User = Depends(get_current_user)):
    """CRE collects payment for a stage"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can collect payments")
    
    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    
    # Additional Work payment stages require client + CRE approval before collection
    if stage.get("is_addition"):
        if not stage.get("client_approved"):
            raise HTTPException(status_code=400, detail="Client has not approved this Additional Work yet")
        if not stage.get("cre_approved"):
            raise HTTPException(status_code=400, detail="CRE has not approved this Additional Work yet")
    
    project = await db.projects.find_one({"project_id": stage["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found for this payment stage")
    
    # Calculate new received amount
    current_received = stage.get("amount_received", 0)
    new_received = current_received + collection.amount_received
    stage_amount = stage.get("amount", 0)
    
    # Determine new status
    if new_received >= stage_amount:
        new_status = "paid"
    elif new_received > 0:
        new_status = "partial"
    else:
        new_status = "pending"
    
    payment_date = collection.payment_date or datetime.now(timezone.utc).isoformat()
    if isinstance(payment_date, str) and "T" not in payment_date:
        payment_date = datetime.fromisoformat(payment_date).isoformat()
    
    update_data = {
        "amount_received": new_received,
        "status": new_status,
        "workflow_status": "collected",
        "payment_entries": collection.payment_entries or [{"amount": collection.amount_received, "payment_mode": collection.payment_mode or "cash", "reference": collection.payment_reference or ""}],
        "payment_mode": collection.payment_mode or (collection.payment_entries[0]["payment_mode"] if collection.payment_entries else "cash"),
        "payment_reference": collection.payment_reference,
        "payment_date": payment_date,
        "collected_by": user.user_id,
        "collected_by_name": user.name,
        "remarks": collection.remarks or stage.get("remarks")
    }
    
    await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": update_data})
    
    # Process payment entries (multi-mode) or legacy single mode
    entries = collection.payment_entries or []
    if not entries and collection.payment_mode:
        entries = [{"amount": collection.amount_received, "payment_mode": collection.payment_mode, "reference": collection.payment_reference or "", "cheque_details": collection.cheque_details}]
    
    for entry in entries:
        entry_mode = entry.get("payment_mode", "cash")
        entry_amount = float(entry.get("amount", 0))
        entry_ref = entry.get("reference", "")
        entry_cheques = entry.get("cheque_details")
        
        if entry_amount > 0:
            # Create income record for each payment entry
            income_record = {
                "income_id": f"inc_{uuid.uuid4().hex[:12]}",
                "project_id": stage["project_id"],
                "project_name": project.get("name") if project else "",
                "category": "payment_collection",
                "sub_category": f"{stage.get('stage_name', 'Payment Stage')} - {entry_mode.replace('_', ' ').title()}",
                "amount": entry_amount,
                "payment_mode": entry_mode,
                "payment_reference": entry_ref,
                "payment_date": payment_date,
                "stage": stage.get("stage_label", stage.get("stage_name", "")),
                "description": f"Payment collection ({entry_mode.replace('_', ' ')}): {stage.get('stage_label', '')} - {stage.get('stage_name', '')}",
                "collected_by": user.user_id,
                "collected_by_name": user.name,
                "status": "pending_approval",
                "source": "approval",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.income.insert_one(income_record)
            income_id = income_record["income_id"]
            # Persist the stage link on the income so accountant-reject can
            # roll the stage back + notify Planning + CRE.
            await db.income.update_one(
                {"income_id": income_id},
                {"$set": {
                    "payment_stage_id": stage_id,
                    "planning_user_id": stage.get("requested_by"),
                    "planning_user_name": stage.get("requested_by_name"),
                }}
            )
            
            # Save cheque records if payment mode is cheque
            if entry_mode == "cheque" and entry_cheques:
                for chq in entry_cheques:
                    if chq.get("cheque_number"):
                        cheque_record = {
                            "cheque_id": f"chq_{uuid.uuid4().hex[:8]}",
                            "project_id": stage["project_id"],
                            "income_id": income_id,
                            "cheque_number": chq.get("cheque_number", ""),
                            "bank_name": chq.get("bank_name", ""),
                            "amount": float(chq.get("amount", 0)),
                            "cheque_date": chq.get("cheque_date", payment_date),
                            "cheque_type": "incoming",
                            "category": "payment_collection",
                            "stage_id": stage_id,
                            "status": "received",
                            "collected_by": user.user_id,
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.cheques.insert_one(cheque_record)
    
    # Notify Planning team
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for pu in planning_users:
        await create_notification(
            pu["user_id"], 
            f"Payment collected: ₹{collection.amount_received:,.0f} for {project.get('name', 'Project')} - {stage.get('stage_name', 'Stage')}"
        )
    
    await create_audit_log(user.user_id, "collect_payment", "payment_stage", stage_id, {
        "amount": collection.amount_received,
        "mode": collection.payment_mode
    })
    
    return {
        "message": f"Payment of ₹{collection.amount_received:,.0f} collected successfully",
        "new_status": new_status,
        "total_received": new_received,
        "balance": stage_amount - new_received
    }


# ===================================================================
# Smart Bulk Payment Collection — FIFO across requested stages
# ===================================================================
class BulkCollectAllocation(BaseModel):
    stage_id: str
    amount: float


class BulkCollectInput(BaseModel):
    amount: float
    payment_mode: str = "cash"
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    remarks: Optional[str] = None
    cheque_details: Optional[List[Dict[str, Any]]] = None  # shared across all stages
    allocations: Optional[List[BulkCollectAllocation]] = None  # optional manual override


@router.post("/projects/{project_id}/collect-payment-bulk")
async def collect_payment_bulk(
    project_id: str,
    body: BulkCollectInput,
    user: User = Depends(get_current_user),
):
    """CRE collects a single client payment and auto-distributes it across the
    project's pending payment stages in Planning's requested order (FIFO).

    Example: Project A has Stage 01 pending ₹45,000 and Stage 02 pending ₹5,60,000.
    Client pays ₹5,00,000. The server:
      - Stage 01 → ₹45,000 (fully collected)
      - Stage 02 → ₹4,55,000 (partially collected, balance ₹1,05,000)
    Excess over the total outstanding spills into the next available stage
    (or stays in the wallet for the next collection).
    """
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can collect payments")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    incoming_amount = float(body.amount or 0)
    if incoming_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    # FIFO order: stages first requested by Planning are paid first.
    # Sort key — `requested_at` ascending, fall back to stage_number/sort_order/created_at.
    stages = await db.payment_stages.find(
        {"project_id": project_id, "workflow_status": "requested"},
        {"_id": 0},
    ).sort([("requested_at", 1), ("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(200)
    # Exclude already-fully-collected stages
    stages = [s for s in stages if (s.get("amount", 0) - s.get("amount_received", 0)) > 0.5]
    if not stages:
        raise HTTPException(status_code=400, detail="No pending payment requests for this project")

    # Build the allocation plan
    allocations: List[Dict[str, Any]] = []
    if body.allocations:
        # Manual mode — use exactly what CRE submitted
        stage_map = {s["stage_id"]: s for s in stages}
        for alloc in body.allocations:
            if alloc.amount <= 0:
                continue
            st = stage_map.get(alloc.stage_id)
            if not st:
                raise HTTPException(status_code=400, detail=f"Stage {alloc.stage_id} not in pending list")
            allocations.append({"stage": st, "amount": float(alloc.amount)})
        # If the manual total < incoming amount, append the excess to the last stage
        manual_total = sum(a["amount"] for a in allocations)
        excess = incoming_amount - manual_total
        if excess > 0.5 and allocations:
            allocations[-1]["amount"] += excess
    else:
        # FIFO auto-allocation
        remaining = incoming_amount
        for st in stages:
            if remaining <= 0.5:
                break
            stage_balance = (st.get("amount", 0) - st.get("amount_received", 0))
            take = min(remaining, stage_balance)
            if take > 0:
                allocations.append({"stage": st, "amount": float(take)})
                remaining -= take
        # Excess after all stages fully collected → spill into the LAST stage
        # so the project ledger captures the full client payment.
        if remaining > 0.5 and allocations:
            allocations[-1]["amount"] += remaining

    payment_date = body.payment_date or datetime.now(timezone.utc).isoformat()
    if isinstance(payment_date, str) and "T" not in payment_date:
        payment_date = datetime.fromisoformat(payment_date).isoformat()
    payment_ref = body.payment_reference or ""
    shared_collection_id = f"col_{uuid.uuid4().hex[:10]}"
    result_lines: List[Dict[str, Any]] = []

    for alloc in allocations:
        st = alloc["stage"]
        alloc_amt = alloc["amount"]
        stage_id = st["stage_id"]
        current_received = st.get("amount_received", 0)
        new_received = current_received + alloc_amt
        stage_amount = st.get("amount", 0)
        if new_received >= stage_amount - 0.5:
            new_status = "paid"
        elif new_received > 0:
            new_status = "partial"
        else:
            new_status = "pending"

        await db.payment_stages.update_one(
            {"stage_id": stage_id},
            {"$set": {
                "amount_received": new_received,
                "status": new_status,
                "workflow_status": "collected",
                "payment_mode": body.payment_mode,
                "payment_reference": payment_ref,
                "payment_date": payment_date,
                "collected_by": user.user_id,
                "collected_by_name": user.name,
                "remarks": body.remarks or st.get("remarks"),
                "bulk_collection_id": shared_collection_id,
            }}
        )

        # Income record for each stage
        income_record = {
            "income_id": f"inc_{uuid.uuid4().hex[:12]}",
            "project_id": project_id,
            "project_name": project.get("name") or "",
            "category": "payment_collection",
            "sub_category": f"{st.get('stage_name', 'Payment Stage')} - {body.payment_mode.replace('_', ' ').title()}",
            "amount": alloc_amt,
            "payment_mode": body.payment_mode,
            "payment_reference": payment_ref,
            "payment_date": payment_date,
            "stage": st.get("stage_label", st.get("stage_name", "")),
            "description": f"Payment collection: {st.get('stage_name', '')}",
            "collected_by": user.user_id,
            "collected_by_name": user.name,
            "status": "pending_approval",
            "source": "approval",
            "payment_stage_id": stage_id,
            "planning_user_id": st.get("requested_by"),
            "planning_user_name": st.get("requested_by_name"),
            "bulk_collection_id": shared_collection_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.income.insert_one(income_record)

        result_lines.append({
            "stage_id": stage_id,
            "stage_name": st.get("stage_name"),
            "collected": alloc_amt,
            "new_total": new_received,
            "stage_amount": stage_amount,
            "balance": max(0, stage_amount - new_received),
            "new_status": new_status,
        })

    # One shared cheque record covering ALL allocations (req #5)
    if body.payment_mode == "cheque" and body.cheque_details:
        for chq in body.cheque_details:
            if chq.get("cheque_number"):
                await db.cheques.insert_one({
                    "cheque_id": f"chq_{uuid.uuid4().hex[:8]}",
                    "project_id": project_id,
                    "cheque_number": chq.get("cheque_number", ""),
                    "bank_name": chq.get("bank_name", ""),
                    "amount": float(chq.get("amount", incoming_amount)),
                    "cheque_date": chq.get("cheque_date", payment_date),
                    "cheque_type": "incoming",
                    "category": "payment_collection",
                    "covers_stage_ids": [r["stage_id"] for r in result_lines],
                    "bulk_collection_id": shared_collection_id,
                    "status": "received",
                    "collected_by": user.user_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

    # Notify Planning team
    planning_users = await db.users.find(
        {"role": {"$in": ["planning", "planning_person"]}}, {"_id": 0, "user_id": 1}
    ).to_list(20)
    summary_line = ", ".join([f"{r['stage_name']} ₹{r['collected']:,.0f}" for r in result_lines])
    for pu in planning_users:
        try:
            await create_notification(
                pu["user_id"],
                f"Bulk payment collected for {project.get('name')}: ₹{incoming_amount:,.0f} → {summary_line}",
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "collect_payment_bulk", "project", project_id, {
        "amount": incoming_amount,
        "allocations": [{"stage_id": r["stage_id"], "amount": r["collected"]} for r in result_lines],
    })

    return {
        "message": f"₹{incoming_amount:,.0f} collected and distributed across {len(result_lines)} stage(s)",
        "bulk_collection_id": shared_collection_id,
        "allocations": result_lines,
    }


@router.get("/projects/{project_id}/outstanding-stages")
async def get_outstanding_stages(project_id: str, user: User = Depends(get_current_user)):
    """Pending payment stages (workflow_status='requested') in Planning's FIFO order.

    Used by the CRE Bulk Collect popup to preview what the next client payment
    will be auto-allocated to.
    """
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1, "client_name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    stages = await db.payment_stages.find(
        {"project_id": project_id, "workflow_status": "requested"},
        {"_id": 0},
    ).sort([("requested_at", 1), ("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(200)
    out: List[Dict[str, Any]] = []
    for s in stages:
        bal = (s.get("amount", 0) or 0) - (s.get("amount_received", 0) or 0)
        if bal <= 0.5:
            continue
        out.append({
            "stage_id": s.get("stage_id"),
            "stage_name": s.get("stage_name"),
            "stage_number": s.get("stage_number"),
            "amount": s.get("amount", 0),
            "amount_received": s.get("amount_received", 0),
            "balance": bal,
            "requested_at": s.get("requested_at"),
            "expected_payment_date": s.get("expected_payment_date"),
        })
    total = sum(x["balance"] for x in out)
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "client_name": project.get("client_name"),
        "stages": out,
        "total_outstanding": total,
    }


class CRERejectStageInput(BaseModel):
    reason: str


@router.post("/payment-stages/{stage_id}/cre-reject")
async def cre_reject_payment_request(stage_id: str, data: CRERejectStageInput, user: User = Depends(get_current_user)):
    """CRE rejects a Planning Payment-request before collecting.

    Use case: Planning marks a payment stage as 'requested' so it appears in
    the CRE Collect Payment queue. The CRE opens the popup, sees the request
    is wrong (amount mismatch, wrong stage, client not ready, etc.) and
    rejects it with a reason instead of collecting.

    Effect:
      * stage.workflow_status -> 'cre_rejected'
      * stage gets cre_rejection_reason + rejected_by_name + rejected_at
      * The original Planning requester gets a notification with the reason.
      * Planning Payment Schedule tab will show the stage with a red banner
        so Planning can correct (e.g. update amount) and re-submit.
    """
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can reject Planning payment requests")
    if not (data.reason or "").strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    if stage.get("workflow_status") != "requested":
        raise HTTPException(status_code=400, detail=f"Cannot CRE-reject from workflow_status '{stage.get('workflow_status')}'")

    now = datetime.now(timezone.utc)
    history = stage.get("workflow_history", [])
    history.append({
        "action": "cre_rejected",
        "by": user.user_id,
        "by_name": user.name,
        "reason": data.reason.strip(),
        "from_status": stage.get("workflow_status"),
        "at": now.isoformat(),
    })

    await db.payment_stages.update_one(
        {"stage_id": stage_id},
        {"$set": {
            "workflow_status": "cre_rejected",
            "cre_rejection_reason": data.reason.strip(),
            "cre_rejected_by": user.user_id,
            "cre_rejected_by_name": user.name,
            "cre_rejected_at": now.isoformat(),
            "workflow_history": history,
            "updated_at": now.isoformat(),
        }}
    )

    # Notify the Planning user who originally requested this stage so the
    # red banner + correct flow shows up on /planning-board → Payment Schedule.
    project = await db.projects.find_one({"project_id": stage.get("project_id")}, {"_id": 0, "name": 1})
    project_name = project.get("name") if project else "Project"
    stage_name = stage.get("stage_name") or stage.get("stage_label") or "stage"
    if stage.get("requested_by"):
        try:
            await create_notification(
                stage["requested_by"],
                f"CRE rejected the payment request for {project_name} - {stage_name}. Reason: {data.reason.strip()}. Please correct and resubmit from the Planning Payment Schedule tab."
            )
        except Exception:
            pass
    # Also notify all Planning users so the team sees the rejection on the
    # collective board (the original requester might be on leave).
    planning_users = await db.users.find({"role": {"$in": [UserRole.PLANNING, UserRole.PLANNING_PERSON]}, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    for pu in planning_users:
        if pu["user_id"] == stage.get("requested_by"):
            continue
        try:
            await create_notification(
                pu["user_id"],
                f"CRE rejected a payment request for {project_name} - {stage_name}. Reason: {data.reason.strip()}."
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "cre_reject", "payment_stage", stage_id, {"reason": data.reason.strip()})
    return {
        "message": "Payment request rejected and sent back to Planning",
        "workflow_status": "cre_rejected",
    }


class PlanningResubmitStageInput(BaseModel):
    amount: Optional[float] = None
    expected_payment_date: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/payment-stages/{stage_id}/planning-resubmit")
async def planning_resubmit_payment_request(stage_id: str, data: PlanningResubmitStageInput, user: User = Depends(get_current_user)):
    """Planning edits + resubmits a CRE-rejected payment stage.

    Status flow: cre_rejected -> requested. Editable fields = amount,
    expected_payment_date, remarks. CRE rejection markers are cleared so
    the red banner disappears on the next refresh.
    """
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning / PM can resubmit a rejected payment request")
    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    if stage.get("workflow_status") != "cre_rejected":
        raise HTTPException(status_code=400, detail=f"Cannot resubmit from workflow_status '{stage.get('workflow_status')}'")

    now = datetime.now(timezone.utc)
    updates: Dict[str, Any] = {"workflow_status": "requested", "updated_at": now.isoformat()}
    if data.amount is not None:
        updates["amount"] = float(data.amount)
    if data.expected_payment_date:
        updates["expected_payment_date"] = data.expected_payment_date
    if data.remarks is not None:
        updates["remarks"] = data.remarks
    updates["resubmitted_by"] = user.user_id
    updates["resubmitted_by_name"] = user.name
    updates["resubmitted_at"] = now.isoformat()
    history = stage.get("workflow_history", [])
    history.append({
        "action": "planning_resubmitted",
        "by": user.user_id,
        "by_name": user.name,
        "from_status": "cre_rejected",
        "at": now.isoformat(),
    })
    updates["workflow_history"] = history

    await db.payment_stages.update_one(
        {"stage_id": stage_id},
        {"$set": updates,
         "$unset": {"cre_rejection_reason": "", "cre_rejected_by": "", "cre_rejected_by_name": "", "cre_rejected_at": ""}},
    )

    # Notify CRE users that the corrected request is back in their queue.
    cre_users = await db.users.find({"role": UserRole.CRE, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    project = await db.projects.find_one({"project_id": stage.get("project_id")}, {"_id": 0, "name": 1})
    project_name = project.get("name") if project else "Project"
    stage_name = stage.get("stage_name") or stage.get("stage_label") or "stage"
    for u in cre_users:
        try:
            await create_notification(
                u["user_id"],
                f"Planning resubmitted the payment request for {project_name} - {stage_name}. Please collect."
            )
        except Exception:
            pass

    return {"message": "Resubmitted to CRE for collection", "workflow_status": "requested"}


@router.get("/projects/{project_id}/payment-summary")
async def get_payment_summary(project_id: str, user: User = Depends(get_current_user)):
    """Get complete payment summary for a project - all payments from advance to final"""
    # IDOR Fix: Only financial/management roles can access payment summaries
    financial_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING
    ]
    if user.role not in financial_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get payment stages
    payment_stages = await db.payment_stages.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("stage_number", 1).to_list(100)
    
    # Get all income records for this project
    income_records = await db.income.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    # APPROVED-only income for ALL totals shown anywhere financial (cashbook +
    # cashflow + project header). Rejected / under_correction / pending entries
    # must NEVER inflate the project's Total Income card or the Receivable
    # calculation. The income_records list still returns every row so the UI
    # can show the rejection/correction banner on the per-row view.
    EXCLUDED_INCOME_STATUSES = ["rejected", "accountant_rejected", "under_correction", "pending_approval"]
    approved_income_total = sum(
        float(i.get("amount", 0) or 0)
        for i in income_records
        if (i.get("status") or "approved") not in EXCLUDED_INCOME_STATUSES
    )

    # Advance payment details (from project)
    advance_amount = project.get("advance_amount", 0) or 0
    advance_payment = {
        "amount": advance_amount,
        "date": project.get("advance_date"),
        "mode": project.get("advance_payment_mode"),
        "status": "received" if advance_amount > 0 else "pending"
    }

    # Remove the earlier total_scheduled (it was computed before self-heal).
    # `total_scheduled` is now set after the self-heal loop above.
    stages_received = sum(s.get("amount_received", 0) for s in payment_stages)

    # SINGLE SOURCE OF TRUTH for Total Income shown on the project header:
    # sum of APPROVED income rows. We deliberately do NOT add advance_amount or
    # payment_stages.amount_received separately because both are mirrored into
    # db.income at collection-time (CRE convert-deal + accountant verify both
    # insert an income row), and if the Accountant rejects/deletes the income,
    # the income row's status (or absence) is the only authoritative signal.
    # If db.income has zero approved rows we fall back to the legacy
    # advance + stages sum so existing projects don't show ₹0.
    if approved_income_total > 0:
        total_received = approved_income_total
    else:
        total_received = advance_amount + stages_received
    
    # ── PROJECT VALUE — SINGLE SOURCE OF TRUTH ──────────────────────────────
    # Per user definition:
    #   Project Value      = Final Estimate scope total ONLY (no add/deduct)
    #   Grand Project Value = Project Value + Additions − Deductions
    # Payment-stage % math always anchors to Project Value (scope-only).
    # The "Grand" figure is purely for UI summary cards.
    live_scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0, "total_amount": 1}).to_list(2000)
    scope_total = sum((item.get("total_amount") or 0) for item in live_scope_items)
    additional_costs_list = await db.additional_costs.find({"project_id": project_id}, {"_id": 0, "estimated_amount": 1, "actual_amount": 1}).to_list(500)
    additions_total = sum((c.get("estimated_amount") or c.get("actual_amount") or 0) for c in additional_costs_list)
    deductions_list = await db.deductions.find({"project_id": project_id}, {"_id": 0, "amount": 1}).to_list(500)
    deductions_total = sum(d.get("amount", 0) for d in deductions_list)

    # Locked Project Value (= FE scope_total at last CRE approval) is just a
    # cached copy. Live FE scope_total is the actual source of truth — the user
    # rule is "Final Estimate value IS the Payment Schedule value". If the
    # cache has drifted (scope edited without CRE re-approval), refresh it.
    locked_value = float(project.get("total_value") or 0)
    if scope_total > 0 and abs(scope_total - locked_value) > 0.5:
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"total_value": scope_total, "fe_locked_value": scope_total}}
        )
        locked_value = scope_total
        project["total_value"] = scope_total
    project_value = scope_total if scope_total > 0 else locked_value
    grand_project_value = max(0, project_value + additions_total - deductions_total)
    # Keep `total_project_value` symbol for legacy local use; equals project_value
    total_project_value = project_value
    additional_cost = additions_total  # back-compat alias

    # Project-wide expenses (used by the redesigned strip) — APPROVED only.
    # Exclude rejected / under_correction so the strip stops counting amounts
    # the Accountant has pulled back.
    EXCLUDED_EXPENSE_STATUSES = ["rejected", "accountant_rejected", "accounts_rejected", "under_correction"]
    project_expenses_list = await db.recorded_expenses.find(
        {"project_id": project_id, "status": {"$nin": EXCLUDED_EXPENSE_STATUSES}},
        {"_id": 0, "amount": 1}
    ).to_list(2000)
    total_expense = sum(e.get("amount", 0) for e in project_expenses_list)
    
    # ── SELF-HEALING PAYMENT STAGE AMOUNTS ──────────────────────────────────
    # If a stage stores a percentage, ensure amount = locked × pct / 100 every
    # time we serve the payment summary. This eliminates the long-standing
    # drift where amounts ÷ project_value didn't equal the stored percentage.
    # Stages without a stored percentage are derived (amount ÷ project_value).
    # Already-collected stages are never reduced below amount_received.
    if total_project_value > 0:
        for stage in payment_stages:
            pct = stage.get("percentage")
            try:
                pct_f = float(pct) if pct not in (None, "") else None
            except Exception:
                pct_f = None
            already = stage.get("amount_received") or 0
            if pct_f is not None:
                new_amount = round((total_project_value * pct_f) / 100)
                if new_amount < already:
                    new_amount = already
                if abs((stage.get("amount") or 0) - new_amount) > 0.5:
                    stage["amount"] = new_amount
                    await db.payment_stages.update_one(
                        {"stage_id": stage["stage_id"]},
                        {"$set": {"amount": new_amount}}
                    )
            else:
                # No stored percentage — derive one from current amount so the
                # UI can always show "X% of Project Value" consistently.
                stage["percentage"] = round(((stage.get("amount") or 0) / total_project_value) * 100, 2)

    # Recompute totals after self-heal
    total_scheduled = sum(s.get("amount", 0) for s in payment_stages)
    # Total % across all stages — UI uses this to surface "must equal 100%"
    total_percentage = sum(float(s.get("percentage") or 0) for s in payment_stages)
    # Balance = Total Project Value - Total Received
    total_balance = total_project_value - total_received
    
    # Count stages by status
    stages_paid = len([s for s in payment_stages if s.get("status") == "paid"])
    stages_partial = len([s for s in payment_stages if s.get("status") == "partial"])
    stages_pending = len([s for s in payment_stages if s.get("status") == "pending"])
    
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "project_value": total_project_value,        # = Scope total only (FE-anchored)
        "grand_project_value": grand_project_value,  # = Project Value + Additions − Deductions
        "scope_total": scope_total,
        "additions_total": additions_total,
        "deductions_total": deductions_total,
        "total_expense": total_expense,
        "additional_cost": additional_cost,
        "advance_payment": advance_payment,
        "payment_stages": payment_stages,
        "income_records": income_records,
        "summary": {
            "total_scheduled": total_scheduled,
            "total_percentage": total_percentage,
            "total_received": total_received,
            "advance_received": advance_amount,
            "stages_received": stages_received,
            "total_balance": total_balance,
            "collection_percentage": (total_received / total_project_value * 100) if total_project_value > 0 else 0,
            "stages_total": len(payment_stages),
            "stages_paid": stages_paid,
            "stages_partial": stages_partial,
            "stages_pending": stages_pending
        }
    }


@router.get("/payment-schedule/due-payments")
async def get_due_payments(user: User = Depends(get_current_user)):
    """Get all payment stages that are due or overdue - for CRE dashboard"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    today = datetime.now(timezone.utc).isoformat()
    
    # Find pending/partial payments with due dates
    pipeline = [
        {
            "$match": {
                "status": {"$in": ["pending", "partial"]},
                "workflow_status": {"$ne": "draft"}
            }
        },
        {
            "$lookup": {
                "from": "projects",
                "localField": "project_id",
                "foreignField": "project_id",
                "as": "project"
            }
        },
        {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
        {
            "$project": {
                "_id": 0,
                "stage_id": 1,
                "project_id": 1,
                "project_name": "$project.name",
                "client_name": "$project.client_name",
                "stage_label": 1,
                "stage_name": 1,
                "amount": 1,
                "amount_received": 1,
                "balance": {"$subtract": ["$amount", "$amount_received"]},
                "status": 1,
                "due_date": 1
            }
        },
        {"$sort": {"due_date": 1}}
    ]
    
    due_payments = await db.payment_stages.aggregate(pipeline).to_list(100)
    return due_payments


# Additional Cost CRUD
@router.get("/projects/{project_id}/additional-costs")
async def get_additional_costs(project_id: str, user: User = Depends(get_current_user)):
    costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for cost in costs:
        if isinstance(cost.get("created_at"), str):
            cost["created_at"] = datetime.fromisoformat(cost["created_at"])
    return costs


@router.post("/additional-costs")
async def create_additional_cost(cost_input: AdditionalCostCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    cost = AdditionalCostItem(
        project_id=cost_input.project_id,
        description=cost_input.description,
        estimated_amount=cost_input.estimated_amount,
        name=cost_input.name,
        qty=cost_input.qty,
        price=cost_input.price,
        section_id=cost_input.section_id,
    )
    
    cost_dict = cost.model_dump()
    cost_dict["created_at"] = cost_dict["created_at"].isoformat()
    
    await db.additional_costs.insert_one(cost_dict)
    await create_audit_log(user.user_id, "create", "additional_cost", cost.cost_id, {"description": cost.description})
    return cost


@router.patch("/additional-costs/{cost_id}")
async def update_additional_cost(cost_id: str, update_data: AdditionalCostUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "additional_cost", cost_id, update_dict)
    return {"message": "Additional cost updated"}


@router.delete("/additional-costs/{cost_id}")
async def delete_additional_cost(cost_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.additional_costs.delete_one({"cost_id": cost_id})
    await create_audit_log(user.user_id, "delete", "additional_cost", cost_id, {})
    return {"message": "Additional cost deleted"}


# ── CLIENT APPROVAL FOR ADDITIONS ───────────────────────────────────────────
# Workflow: Planning adds addition → "Send to Client" → CRE notified, row goes
# read-only with `client_approval_status=pending_client`. Client opens portal,
# approves (status → `client_approved`) or rejects (with reason). Only after
# `client_approved` can Planning hit Req Payment.

async def _notify_cre_for_project(project_id: str, message: str):
    """Best-effort: ping every active CRE about a client-approval event."""
    cre_users = await db.users.find(
        {"role": "cre", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}
    ).to_list(100)
    for u in cre_users:
        try:
            await create_notification(u["user_id"], message)
        except Exception:
            pass


@router.post("/additional-costs/{cost_id}/send-to-client")
async def send_addition_to_client(cost_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Addition not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.additional_costs.update_one(
        {"cost_id": cost_id},
        {"$set": {
            "client_approval_status": "pending_client",
            "client_approval_sent_at": now,
            "client_approval_sent_by": user.user_id,
            "client_rejection_reason": None,
        }},
    )
    project = await db.projects.find_one({"project_id": cost["project_id"]}, {"_id": 0, "name": 1, "client_name": 1}) or {}
    amount = cost.get("estimated_amount", 0)
    await _notify_cre_for_project(
        cost["project_id"],
        f"Planning sent 1 addition worth ₹{int(amount):,} to {project.get('client_name','client')} for approval ({project.get('name','project')})",
    )
    await create_audit_log(user.user_id, "send_to_client", "additional_cost", cost_id, {"amount": amount})
    return {"message": "Sent to client for approval", "cost_id": cost_id}


@router.post("/projects/{project_id}/addition-sections/{section_id}/send-to-client")
async def send_section_to_client(project_id: str, section_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    section = await db.addition_sections.find_one({"section_id": section_id, "project_id": project_id}, {"_id": 0})
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    rows = await db.additional_costs.find({"project_id": project_id, "section_id": section_id}, {"_id": 0}).to_list(500)
    if not rows:
        raise HTTPException(status_code=400, detail="Section has no additions to send.")
    now = datetime.now(timezone.utc).isoformat()
    total_amount = sum((r.get("estimated_amount") or 0) for r in rows)
    await db.addition_sections.update_one(
        {"section_id": section_id, "project_id": project_id},
        {"$set": {
            "client_approval_status": "pending_client",
            "client_approval_sent_at": now,
            "client_approval_sent_by": user.user_id,
            "client_rejection_reason": None,
            "updated_at": now,
        }},
    )
    # Flag every child row so per-row "Req Payment" stays gated consistently.
    await db.additional_costs.update_many(
        {"project_id": project_id, "section_id": section_id},
        {"$set": {"client_approval_status": "pending_client", "client_approval_sent_at": now}},
    )
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1, "client_name": 1}) or {}
    await _notify_cre_for_project(
        project_id,
        f"Planning sent {len(rows)} additions worth ₹{int(total_amount):,} to {project.get('client_name','client')} for approval ({project.get('name','project')})",
    )
    await create_audit_log(user.user_id, "send_to_client", "addition_section", section_id, {"total_amount": total_amount, "rows": len(rows)})
    return {"message": "Section sent to client", "section_id": section_id, "count": len(rows), "total_amount": total_amount}


class ClientDecisionInput(BaseModel):
    decision: str  # "approve" | "reject"
    reason: Optional[str] = None  # required if reject


def _decision_payload(decision: str, reason: Optional[str], user: User):
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'")
    if decision == "reject" and not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    now = datetime.now(timezone.utc).isoformat()
    return {
        "client_approval_status": "client_approved" if decision == "approve" else "client_rejected",
        "client_decided_at": now,
        "client_decided_by": user.user_id,
        "client_rejection_reason": reason if decision == "reject" else None,
    }


@router.post("/additional-costs/{cost_id}/client-decision")
async def client_decide_addition(cost_id: str, body: ClientDecisionInput, user: User = Depends(get_current_user)):
    """Called by the Client Portal. Client must be the project's client_user."""
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Addition not found")
    project = await db.projects.find_one({"project_id": cost["project_id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role != UserRole.SUPER_ADMIN and project.get("client_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only the project's client can approve")
    payload = _decision_payload(body.decision, body.reason, user)
    await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": payload})
    await _notify_cre_for_project(
        cost["project_id"],
        f"Client {body.decision}d an addition worth ₹{int(cost.get('estimated_amount') or 0):,} on {project.get('name','project')}" + (f": {body.reason}" if body.decision == 'reject' else ''),
    )
    await create_audit_log(user.user_id, f"client_{body.decision}", "additional_cost", cost_id, {"reason": body.reason})
    return {"message": f"Addition {body.decision}d"}


@router.post("/projects/{project_id}/addition-sections/{section_id}/client-decision")
async def client_decide_section(project_id: str, section_id: str, body: ClientDecisionInput, user: User = Depends(get_current_user)):
    section = await db.addition_sections.find_one({"section_id": section_id, "project_id": project_id}, {"_id": 0})
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role != UserRole.SUPER_ADMIN and project.get("client_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Only the project's client can approve")
    payload = _decision_payload(body.decision, body.reason, user)
    now = payload["client_decided_at"]
    await db.addition_sections.update_one(
        {"section_id": section_id, "project_id": project_id},
        {"$set": {**payload, "updated_at": now}},
    )
    # Propagate the decision to every row inside.
    await db.additional_costs.update_many(
        {"project_id": project_id, "section_id": section_id},
        {"$set": payload},
    )
    await _notify_cre_for_project(
        project_id,
        f"Client {body.decision}d {section.get('title','section')} ({project.get('name','project')})" + (f": {body.reason}" if body.decision == 'reject' else ''),
    )
    await create_audit_log(user.user_id, f"client_{body.decision}_section", "addition_section", section_id, {"reason": body.reason})
    return {"message": f"Section {body.decision}d"}


# ── ADDITION SECTIONS ───────────────────────────────────────────────────────
# Sections are folders that group additional_costs rows under a Planning-
# managed title with optional file attachments. The frontend renders one
# table per section plus an "Ungrouped" fallback for legacy / NULL section_id
# rows. Deleting a section moves its children back to ungrouped (safe, no
# data loss). Permissions mirror the existing Add Additions flow.
SECTION_EDIT_ROLES = [
    UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON,
    UserRole.CRE, UserRole.PROJECT_MANAGER,
]


class AdditionSectionInput(BaseModel):
    title: str


@router.get("/projects/{project_id}/addition-sections")
async def list_addition_sections(project_id: str, user: User = Depends(get_current_user)):
    sections = await db.addition_sections.find(
        {"project_id": project_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(200)
    return sections


@router.post("/projects/{project_id}/addition-sections")
async def create_addition_section(
    project_id: str,
    body: AdditionSectionInput,
    user: User = Depends(get_current_user),
):
    if user.role not in SECTION_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    section_id = f"asec_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "section_id": section_id,
        "project_id": project_id,
        "title": title,
        "attachments": [],
        "created_at": now,
        "created_by": user.user_id,
        "updated_at": now,
    }
    await db.addition_sections.insert_one(doc)
    doc.pop("_id", None)
    await create_audit_log(user.user_id, "create", "addition_section", section_id, {"title": title})
    return doc


@router.patch("/projects/{project_id}/addition-sections/{section_id}")
async def update_addition_section(
    project_id: str,
    section_id: str,
    body: AdditionSectionInput,
    user: User = Depends(get_current_user),
):
    if user.role not in SECTION_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    res = await db.addition_sections.update_one(
        {"section_id": section_id, "project_id": project_id},
        {"$set": {"title": title, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    return {"message": "Section updated", "section_id": section_id, "title": title}


@router.delete("/projects/{project_id}/addition-sections/{section_id}")
async def delete_addition_section(
    project_id: str,
    section_id: str,
    user: User = Depends(get_current_user),
):
    if user.role not in SECTION_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    section = await db.addition_sections.find_one(
        {"section_id": section_id, "project_id": project_id}, {"_id": 0}
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    # Move children back to "ungrouped" (clear their section_id) — no data loss.
    await db.additional_costs.update_many(
        {"project_id": project_id, "section_id": section_id},
        {"$set": {"section_id": None}},
    )
    await db.addition_sections.delete_one({"section_id": section_id, "project_id": project_id})
    await create_audit_log(user.user_id, "delete", "addition_section", section_id, {
        "title": section.get("title"),
    })
    return {"message": "Section deleted; child additions moved to Ungrouped"}


@router.post("/projects/{project_id}/addition-sections/{section_id}/attachments")
async def upload_section_attachment(
    project_id: str,
    section_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if user.role not in SECTION_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    section = await db.addition_sections.find_one(
        {"section_id": section_id, "project_id": project_id}, {"_id": 0}
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    BLOCKED_EXT = {'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'js', 'vbs', 'ps1', 'msi', 'dll'}
    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
    if ext in BLOCKED_EXT:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed.")
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")
    file_id = await fs.upload_from_stream(
        file.filename, contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id, "scope": "addition_section"}
    )
    att = {
        "file_id": str(file_id),
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents),
        "uploaded_by": user.user_id,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.addition_sections.update_one(
        {"section_id": section_id, "project_id": project_id},
        {"$push": {"attachments": att}, "$set": {"updated_at": att["uploaded_at"]}},
    )
    await create_audit_log(user.user_id, "upload", "addition_section_attachment", section_id, {"filename": file.filename})
    return att


@router.delete("/projects/{project_id}/addition-sections/{section_id}/attachments/{file_id}")
async def delete_section_attachment(
    project_id: str,
    section_id: str,
    file_id: str,
    user: User = Depends(get_current_user),
):
    if user.role not in SECTION_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.addition_sections.update_one(
        {"section_id": section_id, "project_id": project_id},
        {"$pull": {"attachments": {"file_id": file_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    # Best-effort: drop the actual blob too.
    try:
        from bson import ObjectId
        await fs.delete(ObjectId(file_id))
    except Exception:
        pass
    return {"message": "Attachment removed"}


@router.patch("/additional-costs/{cost_id}/request-payment")
async def request_additional_payment(cost_id: str, request: Request, user: User = Depends(get_current_user)):
    """Request payment for additional work - notifies CRE and creates a payment_stages row
    so the request shows up in the project's Payment Schedule (filterable by month)."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning/PM can request payments")
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")

    # Gate Req Payment behind client approval. If the addition belongs to a
    # section, the section's batch approval also satisfies this gate.
    client_status = cost.get("client_approval_status")
    if client_status != "client_approved":
        section_id = cost.get("section_id")
        section_ok = False
        if section_id:
            section = await db.addition_sections.find_one(
                {"section_id": section_id, "client_approval_status": "client_approved"},
                {"_id": 0, "section_id": 1},
            )
            section_ok = bool(section)
        if not section_ok:
            raise HTTPException(status_code=403, detail="Client approval required before requesting payment. Click 'Send to Client' first.")
    
    # Optional body: { expected_payment_date: "YYYY-MM-DD" }
    expected_date = None
    try:
        body = await request.json()
        if isinstance(body, dict):
            expected_date = body.get("expected_payment_date") or body.get("due_date")
    except Exception:
        body = {}
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")
    
    project = await db.projects.find_one({"project_id": cost["project_id"]}, {"_id": 0}) or {}
    amount = (cost.get("estimated_amount", 0) or cost.get("actual_amount", 0))
    balance = amount - (cost.get("income_received", 0) or 0)
    
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Create a payment_stages row tied to this addition so it appears in the Payment Schedule.
    # Skip if one already exists for this cost_id (idempotent retries).
    existing_stage = await db.payment_stages.find_one({"linked_addition_id": cost_id}, {"_id": 0})
    stage_id = (existing_stage or {}).get("stage_id")
    if not existing_stage:
        stage_id = f"ps_{uuid.uuid4().hex[:12]}"
        stage_doc = {
            "stage_id": stage_id,
            "project_id": cost["project_id"],
            "stage_name": f"Additional: {cost.get('description', cost.get('name', 'Additional Work'))[:80]}",
            "percentage": 0,
            "amount": amount,
            "amount_received": cost.get("income_received", 0) or 0,
            "due_date": expected_date,
            "expected_payment_date": expected_date,
            "workflow_status": "requested",
            "status": "pending",
            "linked_addition_id": cost_id,
            "is_addition": True,
            "notes": "Auto-created from Additional Work Req Payment",
            "created_at": now_iso,
            "created_by": user.user_id,
        }
        await db.payment_stages.insert_one(stage_doc)
    elif expected_date:
        # Existing stage — update due_date if a fresh date is provided
        await db.payment_stages.update_one(
            {"stage_id": stage_id},
            {"$set": {"due_date": expected_date, "expected_payment_date": expected_date, "workflow_status": "requested"}},
        )
    
    update_fields = {
        "payment_requested": True,
        "payment_requested_by": user.user_id,
        "payment_requested_at": now_iso,
        "linked_stage_id": stage_id,
    }
    if expected_date:
        update_fields["expected_payment_date"] = expected_date
    await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": update_fields})
    
    # Auto-create a monthly_schedule_entries row so the additional work
    # shows up on the Planning Dashboard's Monthly Payment Schedule.
    # Mirrors the logic in `/payment-stages/{stage_id}/request`.
    if expected_date:
        try:
            dt = datetime.strptime(expected_date, "%Y-%m-%d")
            existing_entry = await db.monthly_schedule_entries.find_one(
                {"stage_id": stage_id, "month": dt.month, "year": dt.year},
                {"_id": 0, "entry_id": 1},
            )
            if not existing_entry:
                # Drop any prior month entry for this stage so it appears only once
                await db.monthly_schedule_entries.delete_many({"stage_id": stage_id})
                await db.monthly_schedule_entries.insert_one({
                    "entry_id": f"mse_{uuid.uuid4().hex[:12]}",
                    "month": dt.month,
                    "year": dt.year,
                    "project_id": cost["project_id"],
                    "stage_id": stage_id,
                    "expected_payment_date": expected_date,
                    "is_addition": True,
                    "linked_addition_id": cost_id,
                    "added_by": user.user_id,
                    "added_at": now_iso,
                })
        except (ValueError, TypeError):
            # Bad date format — silently skip schedule entry; main request still succeeds
            pass
    
    # Notify CRE users
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1}).to_list(10)
    for cre in cre_users:
        await create_notification(
            cre["user_id"],
            f"Additional Payment Request: ₹{balance:,.0f} for {project.get('name', 'Project')} - {cost.get('description', 'Additional Work')}"
        )
    
    await create_audit_log(user.user_id, "request_payment", "additional_cost", cost_id, {"amount": balance, "expected_date": expected_date})
    return {"message": "Payment request sent to CRE", "cost_id": cost_id, "stage_id": stage_id}


# ==================== ADDITIONAL WORK MULTI-STEP APPROVAL ====================
# Flow: Req Payment (Planning) → Client approves (Client Portal) → CRE approves → Accountant collects.

async def _notify_cre_for_collection(cost: dict, project: dict, balance: float):
    """Send CRE users a notification that an additional cost is approved and ready to collect."""
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1}).to_list(50)
    for cre in cre_users:
        await create_notification(
            cre["user_id"],
            f"Additional Work approved by client: ₹{balance:,.0f} - {project.get('name', 'Project')} ({cost.get('description', 'Additional Work')[:60]}). Please verify and forward to Accountant."
        )


@router.post("/client-portal/additional-costs/{cost_id}/approve")
async def client_approve_additional_cost(cost_id: str, user: User = Depends(get_current_user)):
    """Client approves an additional cost line item from the client portal."""
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Client access only")
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")
    project = await db.projects.find_one({"project_id": cost["project_id"], "client_user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=403, detail="You can only approve work on your own project")
    if not cost.get("payment_requested"):
        raise HTTPException(status_code=400, detail="Payment hasn't been requested yet for this item")
    if cost.get("client_approved"):
        return {"message": "Already approved", "cost_id": cost_id}
    
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.additional_costs.update_one(
        {"cost_id": cost_id},
        {"$set": {
            "client_approved": True,
            "client_approved_at": now_iso,
            "client_approved_by": user.user_id,
            "client_rejected": False,
        }, "$unset": {"client_rejected_at": "", "client_rejection_reason": ""}}
    )
    # Mirror onto the linked payment_stages so Planning + CRE + Accountant see the same state
    if cost.get("linked_stage_id"):
        await db.payment_stages.update_one(
            {"stage_id": cost["linked_stage_id"]},
            {"$set": {
                "client_approved": True,
                "client_approved_at": now_iso,
                "workflow_status": "client_approved",
            }}
        )
    
    # Notify CRE users so they can do their approval step
    balance = (cost.get("estimated_amount", 0) or cost.get("actual_amount", 0)) - (cost.get("income_received", 0) or 0)
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1}).to_list(50)
    for cre in cre_users:
        await create_notification(
            cre["user_id"],
            f"Client approved Additional Work: ₹{balance:,.0f} for {project.get('name', 'Project')} - {cost.get('description', 'Additional Work')[:60]}. Please review and approve for collection."
        )
    
    await create_audit_log(user.user_id, "client_approve", "additional_cost", cost_id, {"project_id": cost["project_id"]})
    return {"message": "Approved. CRE will be notified for the next step.", "cost_id": cost_id}


@router.post("/client-portal/additional-costs/{cost_id}/reject")
async def client_reject_additional_cost(cost_id: str, request: Request, user: User = Depends(get_current_user)):
    """Client rejects an additional cost line item."""
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Client access only")
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")
    project = await db.projects.find_one({"project_id": cost["project_id"], "client_user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=403, detail="You can only reject work on your own project")
    
    reason = ""
    try:
        body = await request.json()
        if isinstance(body, dict):
            reason = (body.get("reason") or "").strip()
    except Exception:
        pass
    
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.additional_costs.update_one(
        {"cost_id": cost_id},
        {"$set": {
            "client_rejected": True,
            "client_rejected_at": now_iso,
            "client_rejected_by": user.user_id,
            "client_rejection_reason": reason,
            "client_approved": False,
        }}
    )
    if cost.get("linked_stage_id"):
        await db.payment_stages.update_one(
            {"stage_id": cost["linked_stage_id"]},
            {"$set": {"workflow_status": "client_rejected", "client_rejection_reason": reason}}
        )
    
    # Notify Planning + CRE
    planning_users = await db.users.find({"role": {"$in": ["planning", "cre"]}}, {"_id": 0, "user_id": 1}).to_list(50)
    for u in planning_users:
        await create_notification(
            u["user_id"],
            f"Client rejected Additional Work for {project.get('name', 'Project')}: {cost.get('description', '')[:60]}. Reason: {reason or 'No reason provided'}"
        )
    await create_audit_log(user.user_id, "client_reject", "additional_cost", cost_id, {"reason": reason})
    return {"message": "Rejection recorded", "cost_id": cost_id}


@router.post("/additional-costs/{cost_id}/cre-approve")
async def cre_approve_additional_cost(cost_id: str, user: User = Depends(get_current_user)):
    """CRE approves an additional cost AFTER the client has approved it.
    Until CRE approves, the Accountant cannot collect this payment."""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE / Super Admin can approve for collection")
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")
    if not cost.get("client_approved"):
        raise HTTPException(status_code=400, detail="Client has not approved this work yet")
    if cost.get("cre_approved"):
        return {"message": "Already approved by CRE", "cost_id": cost_id}
    
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.additional_costs.update_one(
        {"cost_id": cost_id},
        {"$set": {
            "cre_approved": True,
            "cre_approved_at": now_iso,
            "cre_approved_by": user.user_id,
        }}
    )
    if cost.get("linked_stage_id"):
        await db.payment_stages.update_one(
            {"stage_id": cost["linked_stage_id"]},
            {"$set": {
                "cre_approved": True,
                "cre_approved_at": now_iso,
                "workflow_status": "approved_for_collection",
            }}
        )
    
    # Notify Accountant
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(50)
    project = await db.projects.find_one({"project_id": cost["project_id"]}, {"_id": 0}) or {}
    balance = (cost.get("estimated_amount", 0) or cost.get("actual_amount", 0)) - (cost.get("income_received", 0) or 0)
    for a in accountants:
        await create_notification(
            a["user_id"],
            f"Additional Work ready for collection: ₹{balance:,.0f} - {project.get('name', 'Project')} ({cost.get('description', '')[:60]})"
        )
    await create_audit_log(user.user_id, "cre_approve", "additional_cost", cost_id, {"project_id": cost["project_id"]})
    return {"message": "Approved for collection. Accountant has been notified.", "cost_id": cost_id}



# ==================== SCOPE ITEMS CRUD ====================

class ScopeItemCreate(BaseModel):
    project_id: str
    item_name: str
    quantity: float = 1
    unit: str = "Nos"
    unit_rate: float
    remarks: Optional[str] = None


class ScopeItemUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_rate: Optional[float] = None
    remarks: Optional[str] = None


@router.get("/projects/{project_id}/scope-items")
async def get_scope_items(project_id: str, user: User = Depends(get_current_user)):
    items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).sort("sort_order", 1).to_list(1000)
    for item in items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    return items


@router.post("/scope-items")
async def create_scope_item(item_input: ScopeItemCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    total_amount = item_input.quantity * item_input.unit_rate
    
    item = ScopeItem(
        project_id=item_input.project_id,
        item_name=item_input.item_name,
        quantity=item_input.quantity,
        unit=item_input.unit,
        unit_rate=item_input.unit_rate,
        total_amount=total_amount,
        remarks=item_input.remarks
    )
    
    item_dict = item.model_dump()
    item_dict["created_at"] = item_dict["created_at"].isoformat()
    
    await db.scope_items.insert_one(item_dict)
    await create_audit_log(user.user_id, "create", "scope_item", item.scope_id, {"item_name": item.item_name})
    return item


@router.patch("/scope-items/{scope_id}")
async def update_scope_item(scope_id: str, update_data: ScopeItemUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get existing item for recalculation
    existing = await db.scope_items.find_one({"scope_id": scope_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scope item not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Recalculate total_amount if quantity or rate changed
    qty = update_dict.get("quantity", existing.get("quantity", 1))
    rate = update_dict.get("unit_rate", existing.get("unit_rate", 0))
    update_dict["total_amount"] = qty * rate
    
    await db.scope_items.update_one({"scope_id": scope_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "scope_item", scope_id, update_dict)
    return {"message": "Scope item updated"}


@router.delete("/scope-items/{scope_id}")
async def delete_scope_item(scope_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.scope_items.delete_one({"scope_id": scope_id})
    await create_audit_log(user.user_id, "delete", "scope_item", scope_id, {})
    return {"message": "Scope item deleted"}



@router.post("/scope-items/reorder")
async def reorder_scope_items(request: Request, user: User = Depends(get_current_user)):
    """Reorder scope items by updating their sort_order field"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    ordered_ids = body.get("scope_ids", [])
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="scope_ids required")
    updates = [db.scope_items.update_one({"scope_id": sid}, {"$set": {"sort_order": i}}) for i, sid in enumerate(ordered_ids)]
    await asyncio.gather(*updates)
    return {"message": "Scope items reordered"}


@router.post("/additional-costs/reorder")
async def reorder_additional_costs(request: Request, user: User = Depends(get_current_user)):
    """Reorder additional cost items"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    ordered_ids = body.get("cost_ids", [])
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="cost_ids required")
    updates = [db.additional_costs.update_one({"cost_id": cid}, {"$set": {"sort_order": i}}) for i, cid in enumerate(ordered_ids)]
    await asyncio.gather(*updates)
    return {"message": "Additional costs reordered"}


@router.post("/deductions/reorder")
async def reorder_deductions(request: Request, user: User = Depends(get_current_user)):
    """Reorder deduction items"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    ordered_ids = body.get("deduction_ids", [])
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="deduction_ids required")
    updates = [db.deductions.update_one({"deduction_id": did}, {"$set": {"sort_order": i}}) for i, did in enumerate(ordered_ids)]
    await asyncio.gather(*updates)
    return {"message": "Deductions reordered"}


@router.post("/payment-stages/reorder")
async def reorder_payment_stages(request: Request, user: User = Depends(get_current_user)):
    """Reorder client-side payment stages (Payment Schedule)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    ordered_ids = body.get("stage_ids", [])
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="stage_ids required")
    updates = [db.payment_stages.update_one({"stage_id": sid}, {"$set": {"sort_order": i}}) for i, sid in enumerate(ordered_ids)]
    await asyncio.gather(*updates)
    return {"message": "Payment stages reordered"}



# ==================== DEDUCTION ITEMS CRUD ====================

class DeductionCreate(BaseModel):
    project_id: str
    description: str
    amount: float
    remarks: Optional[str] = None
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None


class DeductionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None


@router.get("/projects/{project_id}/deductions")
async def get_deductions(project_id: str, user: User = Depends(get_current_user)):
    deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for d in deductions:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return deductions


@router.post("/deductions")
async def create_deduction(deduction_input: DeductionCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    deduction = DeductionItem(
        project_id=deduction_input.project_id,
        description=deduction_input.description,
        amount=deduction_input.amount,
        remarks=deduction_input.remarks,
        name=deduction_input.name,
        qty=deduction_input.qty,
        price=deduction_input.price,
    )
    
    deduction_dict = deduction.model_dump()
    deduction_dict["created_at"] = deduction_dict["created_at"].isoformat()
    
    await db.deductions.insert_one(deduction_dict)
    await create_audit_log(user.user_id, "create", "deduction", deduction.deduction_id, {"description": deduction.description})
    return deduction


@router.patch("/deductions/{deduction_id}")
async def update_deduction(deduction_id: str, update_data: DeductionUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.deductions.update_one({"deduction_id": deduction_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "deduction", deduction_id, update_dict)
    return {"message": "Deduction updated"}


@router.delete("/deductions/{deduction_id}")
async def delete_deduction(deduction_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.deductions.delete_one({"deduction_id": deduction_id})
    await create_audit_log(user.user_id, "delete", "deduction", deduction_id, {})
    return {"message": "Deduction deleted"}


# ==================== BULK ITEM ENDPOINTS WITH VERIFICATION/APPROVAL WORKFLOW ====================

class BulkScopeItemInput(BaseModel):
    item_name: str
    quantity: float = 1
    unit: str = "Nos"
    unit_rate: float
    remarks: Optional[str] = None


class BulkScopeCreate(BaseModel):
    project_id: str
    items: List[BulkScopeItemInput]


class BulkPaymentStageInput(BaseModel):
    stage_name: str
    percentage: float = 0
    amount: float
    due_date: Optional[str] = None
    notes: Optional[str] = None  # Provenance marker (e.g., "From RE: <project_name>") so we can detect already-converted stages


class BulkPaymentCreate(BaseModel):
    project_id: str
    items: List[BulkPaymentStageInput]


class BulkAdditionInput(BaseModel):
    description: str
    estimated_amount: float
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None
    section_id: Optional[str] = None  # Optional grouping into an addition_sections doc


class BulkAdditionCreate(BaseModel):
    project_id: str
    items: List[BulkAdditionInput]


class BulkDeductionInput(BaseModel):
    description: str
    amount: float
    remarks: Optional[str] = None
    name: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None


class BulkDeductionCreate(BaseModel):
    project_id: str
    items: List[BulkDeductionInput]


# Bulk create scope items
@router.post("/scope-items/bulk")
async def create_bulk_scope_items(
    data: BulkScopeCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple scope items at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    created_items = []
    for item in data.items:
        if not item.item_name or not item.unit_rate:
            continue  # Skip empty rows
        
        scope_item = ScopeItem(
            project_id=data.project_id,
            item_name=item.item_name,
            quantity=item.quantity,
            unit=item.unit,
            unit_rate=item.unit_rate,
            total_amount=item.quantity * item.unit_rate,
            remarks=item.remarks,
            workflow_status="approved",
            created_by=user.user_id
        )
        scope_dict = scope_item.model_dump()
        scope_dict["created_at"] = scope_dict["created_at"].isoformat()
        await db.scope_items.insert_one(scope_dict)
        scope_dict.pop("_id", None)
        created_items.append(scope_dict)
    
    await create_audit_log(user.user_id, "bulk_create", "scope_items", data.project_id, {"count": len(created_items)})
    return {"message": f"Created {len(created_items)} scope items", "items": created_items}


# Bulk create payment stages
@router.post("/payment-stages/bulk")
async def create_bulk_payment_stages(
    data: BulkPaymentCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple payment stages at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Get project for total value
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "total_value": 1})
    total_value = (project.get("total_value", 0) or 0) if project else 0

    # Get existing percentage total
    existing_stages = await db.payment_stages.find(
        {"project_id": data.project_id}, {"_id": 0, "percentage": 1}
    ).to_list(200)
    existing_pct = sum(s.get("percentage", 0) for s in existing_stages)

    # Calculate new total percentage
    valid_items = [item for item in data.items if item.stage_name and (item.percentage or item.amount)]
    new_pct = sum(item.percentage or 0 for item in valid_items)

    if existing_pct + new_pct > 100:
        remaining = round(100 - existing_pct, 2)
        raise HTTPException(
            status_code=400,
            detail=f"Total would be {existing_pct + new_pct}%. Only {remaining}% remaining. Reduce percentages."
        )

    created_items = []
    for item in valid_items:
        pct = item.percentage or 0
        amount = round((total_value * pct) / 100) if total_value > 0 and pct > 0 else (item.amount or 0)
        
        stage = PaymentStage(
            project_id=data.project_id,
            stage_name=item.stage_name,
            percentage=pct,
            amount=amount,
            due_date=datetime.fromisoformat(item.due_date) if item.due_date else None,
            workflow_status="approved",
            created_by=user.user_id
        )
        stage_dict = stage.model_dump()
        stage_dict["created_at"] = stage_dict["created_at"].isoformat()
        if stage_dict.get("due_date"):
            stage_dict["due_date"] = stage_dict["due_date"].isoformat()
        if item.notes:
            stage_dict["notes"] = item.notes
        stage_dict["is_advance"] = item.stage_name.lower().startswith("advance")
        await db.payment_stages.insert_one(stage_dict)
        stage_dict.pop("_id", None)
        created_items.append(stage_dict)
    
    await create_audit_log(user.user_id, "bulk_create", "payment_stages", data.project_id, {"count": len(created_items)})
    return {"message": f"Created {len(created_items)} payment stages", "items": created_items}


# Bulk create additions
@router.post("/additional-costs/bulk")
async def create_bulk_additions(
    data: BulkAdditionCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple additions at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    created_items = []
    for item in data.items:
        if not item.description or not item.estimated_amount:
            continue  # Skip empty rows
        
        addition = AdditionalCostItem(
            project_id=data.project_id,
            description=item.description,
            estimated_amount=item.estimated_amount,
            name=item.name,
            qty=item.qty,
            price=item.price,
            section_id=item.section_id,
            workflow_status="approved",
            created_by=user.user_id
        )
        add_dict = addition.model_dump()
        add_dict["created_at"] = add_dict["created_at"].isoformat()
        await db.additional_costs.insert_one(add_dict)
        add_dict.pop("_id", None)
        created_items.append(add_dict)
    
    await create_audit_log(user.user_id, "bulk_create", "additional_costs", data.project_id, {"count": len(created_items)})
    return {"message": f"Created {len(created_items)} additions", "items": created_items}


# Bulk create deductions
@router.post("/deductions/bulk")
async def create_bulk_deductions(
    data: BulkDeductionCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple deductions at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    created_items = []
    for item in data.items:
        if not item.description or not item.amount:
            continue  # Skip empty rows
        
        deduction = DeductionItem(
            project_id=data.project_id,
            description=item.description,
            amount=item.amount,
            remarks=item.remarks,
            name=item.name,
            qty=item.qty,
            price=item.price,
            workflow_status="approved",
            created_by=user.user_id
        )
        ded_dict = deduction.model_dump()
        ded_dict["created_at"] = ded_dict["created_at"].isoformat()
        await db.deductions.insert_one(ded_dict)
        ded_dict.pop("_id", None)
        created_items.append(ded_dict)
    
    await create_audit_log(user.user_id, "bulk_create", "deductions", data.project_id, {"count": len(created_items)})
    return {"message": f"Created {len(created_items)} deductions", "items": created_items}


# Verification endpoints - requires typing "VERIFY"
class VerifyRequest(BaseModel):
    item_ids: List[str]
    verification_code: str  # Must be "VERIFY"


@router.post("/scope-items/verify")
async def verify_scope_items(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify scope items - requires typing VERIFY"""
    # RBAC: Only CRE, Accountant, Planning, Admin can verify
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only CRE, Accountant, Planning, or Admin can verify items")
    if data.verification_code != "VERIFY":
        raise HTTPException(status_code=400, detail="Invalid verification code. Type 'VERIFY' exactly.")
    
    result = await db.scope_items.update_many(
        {"scope_id": {"$in": data.item_ids}, "workflow_status": "draft"},
        {"$set": {"workflow_status": "pending_approval", "verified_by": user.user_id}}
    )
    await create_audit_log(user.user_id, "verify", "scope_items", ",".join(data.item_ids), {"count": result.modified_count})
    
    # Notify super admin
    admins = await db.users.find({"role": "super_admin"}, {"_id": 0}).to_list(100)
    for admin in admins:
        await create_notification(admin["user_id"], f"{result.modified_count} scope items pending your approval")
    
    return {"message": f"Verified {result.modified_count} scope items"}


@router.post("/payment-stages/verify")
async def verify_payment_stages(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify payment stages - requires typing VERIFY"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only CRE, Accountant, Planning, or Admin can verify items")
    if data.verification_code != "VERIFY":
        raise HTTPException(status_code=400, detail="Invalid verification code. Type 'VERIFY' exactly.")
    
    result = await db.payment_stages.update_many(
        {"stage_id": {"$in": data.item_ids}, "workflow_status": "draft"},
        {"$set": {"workflow_status": "pending_approval", "verified_by": user.user_id}}
    )
    await create_audit_log(user.user_id, "verify", "payment_stages", ",".join(data.item_ids), {"count": result.modified_count})
    
    # Notify super admin
    admins = await db.users.find({"role": "super_admin"}, {"_id": 0}).to_list(100)
    for admin in admins:
        await create_notification(admin["user_id"], f"{result.modified_count} payment stages pending your approval")
    
    return {"message": f"Verified {result.modified_count} payment stages"}


@router.post("/additional-costs/verify")
async def verify_additions(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify additions - requires typing VERIFY"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only CRE, Accountant, Planning, or Admin can verify items")
    if data.verification_code != "VERIFY":
        raise HTTPException(status_code=400, detail="Invalid verification code. Type 'VERIFY' exactly.")
    
    result = await db.additional_costs.update_many(
        {"cost_id": {"$in": data.item_ids}, "workflow_status": "draft"},
        {"$set": {"workflow_status": "pending_approval", "verified_by": user.user_id}}
    )
    await create_audit_log(user.user_id, "verify", "additional_costs", ",".join(data.item_ids), {"count": result.modified_count})
    
    # Notify super admin
    admins = await db.users.find({"role": "super_admin"}, {"_id": 0}).to_list(100)
    for admin in admins:
        await create_notification(admin["user_id"], f"{result.modified_count} additions pending your approval")
    
    return {"message": f"Verified {result.modified_count} additions"}


@router.post("/deductions/verify")
async def verify_deductions(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify deductions - requires typing VERIFY"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only CRE, Accountant, Planning, or Admin can verify items")
    if data.verification_code != "VERIFY":
        raise HTTPException(status_code=400, detail="Invalid verification code. Type 'VERIFY' exactly.")
    
    result = await db.deductions.update_many(
        {"deduction_id": {"$in": data.item_ids}, "workflow_status": "draft"},
        {"$set": {"workflow_status": "pending_approval", "verified_by": user.user_id}}
    )
    await create_audit_log(user.user_id, "verify", "deductions", ",".join(data.item_ids), {"count": result.modified_count})
    
    # Notify super admin
    admins = await db.users.find({"role": "super_admin"}, {"_id": 0}).to_list(100)
    for admin in admins:
        await create_notification(admin["user_id"], f"{result.modified_count} deductions pending your approval")
    
    return {"message": f"Verified {result.modified_count} deductions"}


# Approval endpoints - Super Admin only
class ApprovalRequest(BaseModel):
    item_ids: List[str]
    action: str  # approve or reject


@router.post("/scope-items/approve")
async def approve_scope_items(data: ApprovalRequest, user: User = Depends(get_current_user)):
    """Approve or reject scope items - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can approve items")
    
    new_status = "approved" if data.action == "approve" else "rejected"
    result = await db.scope_items.update_many(
        {"scope_id": {"$in": data.item_ids}, "workflow_status": "pending_approval"},
        {"$set": {"workflow_status": new_status, "approved_by": user.user_id}}
    )
    await create_audit_log(user.user_id, data.action, "scope_items", ",".join(data.item_ids), {"count": result.modified_count})
    return {"message": f"{data.action.title()}d {result.modified_count} scope items"}


@router.post("/payment-stages/approve")
async def approve_payment_stages(data: ApprovalRequest, user: User = Depends(get_current_user)):
    """Approve or reject payment stages - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can approve items")
    
    new_status = "approved" if data.action == "approve" else "rejected"
    result = await db.payment_stages.update_many(
        {"stage_id": {"$in": data.item_ids}, "workflow_status": "pending_approval"},
        {"$set": {"workflow_status": new_status, "approved_by": user.user_id}}
    )
    await create_audit_log(user.user_id, data.action, "payment_stages", ",".join(data.item_ids), {"count": result.modified_count})
    return {"message": f"{data.action.title()}d {result.modified_count} payment stages"}


@router.post("/additional-costs/approve")
async def approve_additions(data: ApprovalRequest, user: User = Depends(get_current_user)):
    """Approve or reject additions - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can approve items")
    
    new_status = "approved" if data.action == "approve" else "rejected"
    result = await db.additional_costs.update_many(
        {"cost_id": {"$in": data.item_ids}, "workflow_status": "pending_approval"},
        {"$set": {"workflow_status": new_status, "approved_by": user.user_id}}
    )
    await create_audit_log(user.user_id, data.action, "additional_costs", ",".join(data.item_ids), {"count": result.modified_count})
    return {"message": f"{data.action.title()}d {result.modified_count} additions"}


@router.post("/deductions/approve")
async def approve_deductions(data: ApprovalRequest, user: User = Depends(get_current_user)):
    """Approve or reject deductions - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can approve items")
    
    new_status = "approved" if data.action == "approve" else "rejected"
    result = await db.deductions.update_many(
        {"deduction_id": {"$in": data.item_ids}, "workflow_status": "pending_approval"},
        {"$set": {"workflow_status": new_status, "approved_by": user.user_id}}
    )
    await create_audit_log(user.user_id, data.action, "deductions", ",".join(data.item_ids), {"count": result.modified_count})
    return {"message": f"{data.action.title()}d {result.modified_count} deductions"}


# Get pending approvals for dashboard
@router.get("/approvals/pending")
async def get_pending_approvals(user: User = Depends(get_current_user)):
    """Get all pending approvals - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can view pending approvals")
    
    scope_items = await db.scope_items.find({"workflow_status": "pending_approval"}, {"_id": 0}).to_list(1000)
    payment_stages = await db.payment_stages.find({"workflow_status": "pending_approval"}, {"_id": 0}).to_list(1000)
    additions = await db.additional_costs.find({"workflow_status": "pending_approval"}, {"_id": 0}).to_list(1000)
    deductions = await db.deductions.find({"workflow_status": "pending_approval"}, {"_id": 0}).to_list(1000)
    
    return {
        "scope_items": scope_items,
        "payment_stages": payment_stages,
        "additions": additions,
        "deductions": deductions,
        "total_count": len(scope_items) + len(payment_stages) + len(additions) + len(deductions)
    }




# ==================== PROJECT STAGES & TEMPLATES ====================

class ProjectStageCreate(BaseModel):
    stage_name: str
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    duration_days: Optional[int] = None
    actual_start_date: Optional[str] = None
    actual_finish_date: Optional[str] = None
    progress: Optional[int] = None
    hindrances: Optional[str] = None
    status: str = "yet_to_start"  # yet_to_start, started, finished
    remarks: Optional[str] = None
    order: Optional[int] = None
    sl_no: Optional[str] = None             # e.g. "PO1", "FW1" — display code from template
    section_title: Optional[str] = None     # bold group title (e.g. "Foundation work")
    is_section_header: Optional[bool] = None  # True for non-task header rows
    depends_on: Optional[str] = None        # Predecessor stage_id (or sl_no)
    hindrance_type: Optional[str] = None    # 'internal' | 'external' | 'neutral'
    hindrance_reason: Optional[str] = None  # e.g. 'Drawing', 'Rain', 'Others'

class ProjectStageUpdate(BaseModel):
    stage_name: Optional[str] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    duration_days: Optional[int] = None
    actual_start_date: Optional[str] = None
    actual_finish_date: Optional[str] = None
    progress: Optional[int] = None       # 0–100
    hindrances: Optional[str] = None      # delays / blockers (replaces "remarks" semantically)
    status: Optional[str] = None
    remarks: Optional[str] = None         # kept for backward compatibility
    order: Optional[int] = None
    sl_no: Optional[str] = None
    section_title: Optional[str] = None
    is_section_header: Optional[bool] = None
    depends_on: Optional[str] = None
    hindrance_type: Optional[str] = None
    hindrance_reason: Optional[str] = None

class StageTemplateCreate(BaseModel):
    template_name: str
    stages: List[ProjectStageCreate]

@router.get("/projects/{project_id}/project-stages")
async def get_project_stages(project_id: str, user: User = Depends(get_current_user)):
    stages = await db.project_stages.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("order", 1).to_list(500)
    return stages

@router.post("/projects/{project_id}/project-stages/reorder")
async def reorder_project_stages(project_id: str, request: Request, user: User = Depends(get_current_user)):
    """Reorder project construction stages"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    stage_ids = body.get("stage_ids", [])
    if not stage_ids:
        raise HTTPException(status_code=400, detail="stage_ids required")
    updates = [db.project_stages.update_one({"stage_id": sid}, {"$set": {"order": i}}) for i, sid in enumerate(stage_ids)]
    await asyncio.gather(*updates)
    return {"message": "Stages reordered"}



@router.post("/projects/{project_id}/project-stages")
async def add_project_stage(project_id: str, data: ProjectStageCreate, user: User = Depends(get_current_user)):
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    count = await db.project_stages.count_documents({"project_id": project_id})
    
    stage = {
        "stage_id": f"pstg_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "stage_name": data.stage_name,
        "start_date": data.start_date,
        "target_date": data.target_date,
        "duration_days": data.duration_days,
        "actual_start_date": data.actual_start_date,
        "actual_finish_date": data.actual_finish_date,
        "progress": data.progress if data.progress is not None else 0,
        "hindrances": data.hindrances,
        "status": data.status,
        "remarks": data.remarks,
        "order": data.order if data.order is not None else count + 1,
        "sl_no": data.sl_no,
        "section_title": data.section_title,
        "is_section_header": bool(data.is_section_header) if data.is_section_header is not None else False,
        "depends_on": data.depends_on,
        "hindrance_type": data.hindrance_type,
        "hindrance_reason": data.hindrance_reason,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.project_stages.insert_one(stage)
    stage.pop("_id", None)
    return stage

@router.post("/projects/{project_id}/project-stages/bulk")
async def add_project_stages_bulk(project_id: str, stages: List[ProjectStageCreate], user: User = Depends(get_current_user)):
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    existing = await db.project_stages.count_documents({"project_id": project_id})
    docs = []
    for i, s in enumerate(stages):
        if not s.stage_name.strip():
            continue
        doc = {
            "stage_id": f"pstg_{uuid.uuid4().hex[:12]}",
            "project_id": project_id,
            "stage_name": s.stage_name,
            "start_date": s.start_date,
            "target_date": s.target_date,
            "duration_days": s.duration_days,
            "actual_start_date": s.actual_start_date,
            "actual_finish_date": s.actual_finish_date,
            "progress": s.progress if s.progress is not None else 0,
            "hindrances": s.hindrances,
            "status": s.status or "yet_to_start",
            "remarks": s.remarks,
            "order": existing + i + 1,
            "sl_no": s.sl_no,
            "section_title": s.section_title,
            "is_section_header": bool(s.is_section_header) if s.is_section_header is not None else False,
            "depends_on": s.depends_on,
            "hindrance_type": s.hindrance_type,
            "hindrance_reason": s.hindrance_reason,
            "created_by": user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        docs.append(doc)
    
    if docs:
        await db.project_stages.insert_many(docs)
        for d in docs:
            d.pop("_id", None)
    
    return {"message": f"Added {len(docs)} stages", "stages": docs}

@router.patch("/projects/{project_id}/project-stages/{stage_id}")
async def update_project_stage(project_id: str, stage_id: str, data: ProjectStageUpdate, user: User = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Capture the human-friendly fields that changed so the UI can show
    # "Last edited: Planned Start, Hindrance · by Diwakar on 14 May 2026 4:12 PM"
    FIELD_LABELS = {
        "stage_name": "Stage name", "start_date": "Planned Start", "target_date": "Planned Finish",
        "duration_days": "Duration", "actual_start_date": "Actual Start",
        "actual_finish_date": "Actual Finish", "progress": "Progress", "hindrances": "Hindrance notes",
        "hindrance_type": "Hindrance type", "hindrance_reason": "Hindrance reason",
        "depends_on": "Depends on", "status": "Status", "remarks": "Remarks",
        "sl_no": "Sl.No", "section_title": "Section",
    }
    changed_labels = sorted({FIELD_LABELS[k] for k in updates.keys() if k in FIELD_LABELS})
    now_iso = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = user.user_id
    updates["updated_by_name"] = user.name
    updates["updated_at"] = now_iso
    updates["last_changed_fields"] = changed_labels
    
    # Build a per-field before/after snapshot so the Timeline can show
    # "Progress: 0% → 30%" etc.
    existing = await db.project_stages.find_one(
        {"stage_id": stage_id, "project_id": project_id},
        {"_id": 0},
    ) or {}
    changes_detailed = []
    for k in list(updates.keys()):
        if k in {"updated_by", "updated_by_name", "updated_at", "last_changed_fields"}:
            continue
        before = existing.get(k)
        after = updates[k]
        if before != after:
            changes_detailed.append({"field": k, "label": FIELD_LABELS.get(k, k), "from": before, "to": after})
    history_entry = {
        "at": now_iso,
        "by": user.user_id,
        "by_name": user.name,
        "changes": changes_detailed,
    }
    
    result = await db.project_stages.update_one(
        {"stage_id": stage_id, "project_id": project_id},
        {"$set": updates, "$push": {"edit_history": {"$each": [history_entry], "$slice": -200}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stage not found")
    return {"message": "Stage updated"}


class InsertStageInput(BaseModel):
    after_stage_id: Optional[str] = None  # None → insert at top
    stage: ProjectStageCreate


@router.post("/projects/{project_id}/project-stages/insert")
async def insert_project_stage(project_id: str, body: InsertStageInput, user: User = Depends(get_current_user)):
    """Insert a new stage anywhere in the existing order, automatically shifting
    every subsequent stage's `order` down by 1 so the table stays consistent."""
    # Determine target order
    if body.after_stage_id:
        anchor = await db.project_stages.find_one(
            {"stage_id": body.after_stage_id, "project_id": project_id},
            {"_id": 0, "order": 1},
        )
        if not anchor:
            raise HTTPException(status_code=404, detail="Anchor stage not found")
        new_order = (anchor.get("order") or 0) + 1
    else:
        new_order = 1
    
    # Shift every existing stage with order >= new_order down by 1
    await db.project_stages.update_many(
        {"project_id": project_id, "order": {"$gte": new_order}},
        {"$inc": {"order": 1}},
    )
    
    now_iso = datetime.now(timezone.utc).isoformat()
    new_stage = {
        "stage_id": f"pstg_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "stage_name": body.stage.stage_name,
        "start_date": body.stage.start_date,
        "target_date": body.stage.target_date,
        "duration_days": body.stage.duration_days,
        "actual_start_date": body.stage.actual_start_date,
        "actual_finish_date": body.stage.actual_finish_date,
        "progress": body.stage.progress if body.stage.progress is not None else 0,
        "hindrances": body.stage.hindrances,
        "status": body.stage.status or "yet_to_start",
        "remarks": body.stage.remarks,
        "order": new_order,
        "sl_no": body.stage.sl_no,
        "section_title": body.stage.section_title,
        "is_section_header": bool(body.stage.is_section_header) if body.stage.is_section_header is not None else False,
        "depends_on": body.stage.depends_on,
        "hindrance_type": body.stage.hindrance_type,
        "hindrance_reason": body.stage.hindrance_reason,
        "created_by": user.user_id,
        "created_at": now_iso,
        "updated_by": user.user_id,
        "updated_by_name": user.name,
        "updated_at": now_iso,
        "last_changed_fields": ["Created"],
    }
    await db.project_stages.insert_one(new_stage)
    new_stage.pop("_id", None)
    return new_stage

@router.delete("/projects/{project_id}/project-stages/{stage_id}")
async def delete_project_stage(project_id: str, stage_id: str, user: User = Depends(get_current_user)):
    result = await db.project_stages.delete_one({"stage_id": stage_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stage not found")
    return {"message": "Stage deleted"}

# ---- Stage Templates ----

@router.get("/stage-templates")
async def get_stage_templates(user: User = Depends(get_current_user)):
    templates = await db.stage_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return templates

@router.post("/stage-templates")
async def create_stage_template(data: StageTemplateCreate, user: User = Depends(get_current_user)):
    existing = await db.stage_templates.find_one({"template_name": data.template_name})
    if existing:
        # Update existing template
        await db.stage_templates.update_one(
            {"template_name": data.template_name},
            {"$set": {
                "stages": [s.model_dump() for s in data.stages if s.stage_name.strip()],
                "updated_by": user.user_id,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": f"Template '{data.template_name}' updated"}
    
    template = {
        "template_id": f"tmpl_{uuid.uuid4().hex[:8]}",
        "template_name": data.template_name,
        "stages": [s.model_dump() for s in data.stages if s.stage_name.strip()],
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stage_templates.insert_one(template)
    template.pop("_id", None)
    return {"message": f"Template '{data.template_name}' created", "template": template}

@router.get("/stage-templates/{template_name}")
async def get_stage_template(template_name: str, user: User = Depends(get_current_user)):
    template = await db.stage_templates.find_one({"template_name": template_name}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template



# ==================== PROJECT TEAM, MATERIALS, LABOURS ====================

@router.get("/projects/{project_id}/team")
async def get_project_team(project_id: str, user: User = Depends(get_current_user)):
    """Get team members assigned to a project"""
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    team_data = project.get("team", {})
    team = {}
    roles = ["architect", "project_manager", "sr_site_engineer", "site_engineer", "cre", "qc", "procurement", "planning_person"]
    
    for role in roles:
        user_id = team_data.get(role)
        # Backfill planning_person from the legacy `assigned_planning_person_id` field
        if role == "planning_person" and not user_id:
            user_id = project.get("assigned_planning_person_id")
        if user_id:
            u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
            if u:
                team[role] = {"user_id": u["user_id"], "name": u.get("name", ""), "phone": u.get("phone", ""), "email": u.get("email", ""), "role": u.get("role", "")}
            else:
                team[role] = None
        else:
            team[role] = None

    return team


@router.patch("/projects/{project_id}/team")
async def update_project_team(project_id: str, request: Request, user: User = Depends(get_current_user)):
    """Assign team members to a project by role.

    Side-effects:
    • Updates `project.team[role]` map (legacy field used by ProjectDetail UI).
    • Mirrors site_engineer / sr_site_engineer / associate_pm assignments into the
      `site_engineer_assignments` collection so the Site Engineer / Sr SE / Associate PM
      dashboards (`GET /api/site-engineer/my-projects`) actually show the project.
    • Deactivates the previous user's assignment for that role on the project.
    • Sends an in-app notification to the newly-assigned user.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning/Admin can assign team")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    body = await request.json()
    valid_roles = ["architect", "project_manager", "sr_site_engineer", "site_engineer", "cre", "qc", "procurement", "planning_person"]
    # Roles that must mirror into `site_engineer_assignments`
    SE_LIKE_ROLES = {"site_engineer", "sr_site_engineer", "associate_pm"}

    existing_team = project.get("team", {}) or {}
    team = dict(existing_team)
    for role in valid_roles:
        if role in body:
            team[role] = body[role] if body[role] else None

    # Mirror planning_person assignment into the top-level project fields used by
    # the planning-person scoped queries (`assigned_planning_person_id`).
    pp_extra_set: Dict[str, Any] = {}
    pp_extra_unset: Dict[str, Any] = {}
    if "planning_person" in body:
        new_pp_id = body.get("planning_person") or None
        old_pp_id = existing_team.get("planning_person") or project.get("assigned_planning_person_id")
        if new_pp_id:
            pp_user = await db.users.find_one(
                {"user_id": new_pp_id, "role": UserRole.PLANNING_PERSON.value, "is_active": True},
                {"_id": 0, "user_id": 1, "name": 1},
            )
            if pp_user:
                pp_extra_set["assigned_planning_person_id"] = pp_user["user_id"]
                pp_extra_set["assigned_planning_person_name"] = pp_user.get("name") or ""
                pp_extra_set["assigned_planning_person_at"] = datetime.now(timezone.utc).isoformat()
                pp_extra_set["assigned_planning_person_by"] = user.user_id
                pp_extra_set["assigned_planning_person_by_name"] = user.name
                if old_pp_id and old_pp_id != new_pp_id:
                    try:
                        await create_notification(old_pp_id, f"You have been removed from project: {project.get('name')}")
                    except Exception:
                        pass
                try:
                    await create_notification(new_pp_id, f"You have been assigned to project: {project.get('name')}")
                except Exception:
                    pass
        else:
            pp_extra_unset = {"assigned_planning_person_id": "", "assigned_planning_person_name": "", "assigned_planning_person_at": ""}

    update_doc: Dict[str, Any] = {"$set": {"team": team, "updated_at": datetime.now(timezone.utc).isoformat(), **pp_extra_set}}
    if pp_extra_unset:
        update_doc["$unset"] = pp_extra_unset
    await db.projects.update_one({"project_id": project_id}, update_doc)

    # Mirror SE-like role changes into site_engineer_assignments + notify
    project_name = project.get("name") or project.get("project_name") or project_id
    for role in valid_roles:
        if role not in SE_LIKE_ROLES or role not in body:
            continue
        old_user_id = existing_team.get(role)
        new_user_id = team.get(role)

        # 1) Deactivate old assignment when the role-assignee changes
        if old_user_id and old_user_id != new_user_id:
            await db.site_engineer_assignments.update_many(
                {"project_id": project_id, "user_id": old_user_id, "is_active": True},
                {"$set": {
                    "is_active": False,
                    "removed_by": user.user_id,
                    "removed_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

        # 2) Ensure an active assignment exists for the new user (idempotent — also backfills legacy)
        if new_user_id:
            target_user = await db.users.find_one({"user_id": new_user_id}, {"_id": 0, "user_id": 1, "name": 1, "role": 1})
            if not target_user:
                continue
            existing_assignment = await db.site_engineer_assignments.find_one({
                "project_id": project_id,
                "user_id": new_user_id,
                "is_active": True,
            }, {"_id": 0})
            if not existing_assignment:
                await db.site_engineer_assignments.insert_one({
                    "assignment_id": f"sea_{uuid.uuid4().hex[:12]}",
                    "user_id": new_user_id,
                    "user_name": target_user.get("name", ""),
                    "user_role": target_user.get("role", role),
                    "project_id": project_id,
                    "project_name": project_name,
                    "assigned_by": user.user_id,
                    "assigned_by_name": getattr(user, "name", None),
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                # Maintain legacy shortcut for site_engineer role
                if role == "site_engineer":
                    await db.projects.update_one(
                        {"project_id": project_id},
                        {"$set": {"assigned_se": new_user_id, "assigned_se_name": target_user.get("name", "")}},
                    )
                # Notify only on a true change (skip when backfilling the same user)
                if old_user_id != new_user_id:
                    try:
                        await create_notification(new_user_id, f"You have been assigned to project: {project_name}")
                    except Exception:
                        pass

        # 3) If new_user_id is None and old_user_id existed, also clear legacy shortcut for site_engineer
        if role == "site_engineer" and old_user_id and not new_user_id:
            await db.projects.update_one(
                {"project_id": project_id},
                {"$unset": {"assigned_se": "", "assigned_se_name": ""}},
            )

    return {"message": "Team updated"}


@router.get("/projects/{project_id}/materials-summary")
async def get_project_materials(project_id: str, user: User = Depends(get_current_user)):
    """Get all material requests for a project with summary stats"""
    is_pm = user.role in ["project_manager", "associate_pm"]

    materials = await db.material_requests.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Compute stats
    total_requests = len(materials)
    requested = sum(1 for m in materials if m.get("status") == "requested")
    pm_approved = sum(1 for m in materials if m.get("status") == "pm_approved")
    delivered = sum(1 for m in materials if m.get("status") in ["received_partial", "delivered", "received"])
    approved = sum(1 for m in materials if m.get("status") in ["accounts_approved", "payment_approved"])
    in_progress = total_requests - requested - delivered - approved

    total_cost = 0
    if not is_pm:
        total_cost = sum(float(m.get("total_amount", 0) or 0) for m in materials)

    # Strip financial fields for PM
    clean_materials = []
    for m in materials:
        item = {
            "request_id": m.get("request_id"),
            "material_name": m.get("material_name"),
            "quantity": m.get("quantity"),
            "unit": m.get("unit"),
            "stage": m.get("stage"),
            "status": m.get("status"),
            "remarks": m.get("remarks"),
            "site_engineer_name": m.get("site_engineer_name"),
            "vendor_name": m.get("vendor_name"),
            "required_date": m.get("required_date"),
            "expected_delivery": m.get("expected_delivery"),
            "received_qty": m.get("received_qty"),
            "created_at": m.get("created_at"),
        }
        if not is_pm:
            item["unit_rate"] = m.get("unit_rate")
            item["total_amount"] = m.get("total_amount")
        clean_materials.append(item)

    summary = {
        "total_requests": total_requests,
        "requested": requested,
        "pm_approved": pm_approved,
        "in_progress": in_progress,
        "delivered": delivered,
        "approved": approved,
    }
    if not is_pm:
        summary["total_cost"] = total_cost

    return {"summary": summary, "materials": clean_materials}


@router.get("/projects/{project_id}/labours-summary")
async def get_project_labours(project_id: str, user: User = Depends(get_current_user)):
    """Get all labour requests for a project with summary stats"""
    is_pm = user.role in ["project_manager", "associate_pm"]

    labours = await db.labour_expenses.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    total = len(labours)
    requested = sum(1 for l in labours if l.get("status") == "requested")
    approved = sum(1 for l in labours if l.get("status") in ["accounts_approved", "payment_approved", "pm_approved"])
    total_workers = sum(int(l.get("num_workers", 0) or 0) for l in labours)
    total_days = sum(int(l.get("num_days", 0) or 0) for l in labours)

    total_cost = 0
    if not is_pm:
        total_cost = sum(float(l.get("total_amount", 0) or 0) for l in labours)

    # Strip financial fields for PM
    clean_labours = []
    for l in labours:
        item = {
            "labour_expense_id": l.get("labour_expense_id"),
            "contractor_name": l.get("contractor_name"),
            "description": l.get("description"),
            "labour_type": l.get("labour_type"),
            "num_workers": l.get("num_workers"),
            "num_days": l.get("num_days"),
            "status": l.get("status"),
            "requested_by_name": l.get("requested_by_name"),
            "work_order_id": l.get("work_order_id"),
            "created_at": l.get("created_at"),
        }
        if not is_pm:
            item["daily_rate"] = l.get("daily_rate")
            item["total_amount"] = l.get("total_amount")
        clean_labours.append(item)

    summary = {
        "total": total,
        "requested": requested,
        "approved": approved,
        "total_workers": total_workers,
        "total_days": total_days,
    }
    if not is_pm:
        summary["total_cost"] = total_cost

    return {"summary": summary, "labours": clean_labours}



# ==================== WORK ORDERS ====================

class WorkOrderScopeItem(BaseModel):
    name: str
    unit: str = "nos"
    quantity: float = 1
    unit_rate: float = 0

class WorkOrderStage(BaseModel):
    name: str
    type: str = "percentage"  # percentage or amount
    value: float = 0
    source: Optional[str] = None  # 'additional' for auto-derived stages from additional_work; None for user-defined
class WorkOrderAdditionalItem(BaseModel):
    description: str
    unit: str = "nos"
    quantity: float = 1
    unit_rate: float = 0

class WorkOrderDeductionItem(BaseModel):
    description: str
    unit: str = "nos"
    quantity: float = 1
    unit_rate: float = 0

class LabourRates(BaseModel):
    skilled: float = 0
    semi_skilled: float = 0
    unskilled: float = 0

class WorkOrderCreate(BaseModel):
    contractor_id: str
    contractor_name: Optional[str] = None
    contractor_type: Optional[str] = None
    scope_items: List[WorkOrderScopeItem] = []
    stages: List[WorkOrderStage] = []
    additional_work: List[WorkOrderAdditionalItem] = []
    deductions: List[WorkOrderDeductionItem] = []
    labour_rates: Optional[LabourRates] = None
    notes: Optional[str] = ""


# ── Work Order Templates ──────────────────────────────────────────────────
# Global library of reusable Work Order blueprints. Snapshots Scope + Stages
# + Additional + (optional) Notes & Labour Rates so a Planning user can spin
# up a new WO without re-typing everything. Templates are project-agnostic —
# contractor_id is NEVER persisted into a template.
WO_TEMPLATE_EDIT_ROLES = [
    UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER,
    UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.CRE,
]


class WorkOrderTemplateInput(BaseModel):
    name: str
    contractor_type: Optional[str] = None  # informational only — doesn't gate visibility
    description: Optional[str] = ""
    scope_items: List[WorkOrderScopeItem] = []
    stages: List[WorkOrderStage] = []
    additional_work: List[WorkOrderAdditionalItem] = []
    deductions: List[WorkOrderDeductionItem] = []
    labour_rates: Optional[LabourRates] = None
    notes: Optional[str] = ""


@router.get("/wo-templates")
async def list_wo_templates(user: User = Depends(get_current_user)):
    """All saved Work Order templates (global)."""
    rows = await db.wo_templates.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("name", 1).to_list(500)
    return rows


@router.post("/wo-templates")
async def create_wo_template(body: WorkOrderTemplateInput, user: User = Depends(get_current_user)):
    if user.role not in WO_TEMPLATE_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    template_id = f"wotpl_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "template_id": template_id,
        "name": name,
        "contractor_type": body.contractor_type or "",
        "description": body.description or "",
        "scope_items": [s.dict() for s in body.scope_items],
        "stages": [s.dict() for s in body.stages],
        "additional_work": [a.dict() for a in body.additional_work],
        "deductions": [d.dict() for d in body.deductions],
        "labour_rates": body.labour_rates.dict() if body.labour_rates else None,
        "notes": body.notes or "",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
        "created_by_name": user.name,
    }
    await db.wo_templates.insert_one(doc)
    doc.pop("_id", None)
    await create_audit_log(user.user_id, "create", "wo_template", template_id, {"name": name})
    return doc


@router.delete("/wo-templates/{template_id}")
async def delete_wo_template(template_id: str, user: User = Depends(get_current_user)):
    if user.role not in WO_TEMPLATE_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.wo_templates.delete_one({"template_id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    await create_audit_log(user.user_id, "delete", "wo_template", template_id, {})
    return {"message": "Template deleted"}


@router.patch("/wo-templates/{template_id}")
async def update_wo_template(template_id: str, body: WorkOrderTemplateInput, user: User = Depends(get_current_user)):
    """Replace the contents of a template (Scope, Stages, Additional, etc.).
    Used by the inline edit flow on the Use Template dialog."""
    if user.role not in WO_TEMPLATE_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    update = {
        "name": name,
        "contractor_type": body.contractor_type or "",
        "description": body.description or "",
        "scope_items": [s.dict() for s in body.scope_items],
        "stages": [s.dict() for s in body.stages],
        "additional_work": [a.dict() for a in body.additional_work],
        "deductions": [d.dict() for d in body.deductions],
        "labour_rates": body.labour_rates.dict() if body.labour_rates else None,
        "notes": body.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.wo_templates.update_one({"template_id": template_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    await create_audit_log(user.user_id, "update", "wo_template", template_id, {"name": name})
    doc = await db.wo_templates.find_one({"template_id": template_id}, {"_id": 0})
    return doc


@router.get("/projects/{project_id}/work-orders")
async def get_project_work_orders(project_id: str, user: User = Depends(get_current_user)):
    """Get all work orders for a project"""
    orders = await db.project_work_orders.find({"project_id": project_id, "is_active": {"$ne": False}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    from routes.site_ops import attach_advance_summary_to_work_orders
    await attach_advance_summary_to_work_orders(project_id, orders)
    return orders

@router.get("/projects/{project_id}/work-orders/{work_order_id}")
async def get_project_work_order(project_id: str, work_order_id: str, user: User = Depends(get_current_user)):
    """Get a single work order"""
    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    from routes.site_ops import attach_advance_summary_to_work_orders
    await attach_advance_summary_to_work_orders(project_id, [wo])
    return wo

@router.post("/projects/{project_id}/work-orders")
async def create_project_work_order(project_id: str, data: WorkOrderCreate, user: User = Depends(get_current_user)):
    """Create a new work order with scope, stages, and additional work"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "project_id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    contractor = await db.contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0})
    if not contractor:
        # Fall back to the new labour-contractors collection — both shapes are
        # supported by the WO dropdown so look in both before 404'ing.
        contractor = await db.labour_contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0})
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    scope_total = sum((s.quantity or 0) * (s.unit_rate or 0) for s in data.scope_items)
    additional_total = sum((a.quantity or 0) * (a.unit_rate or 0) for a in data.additional_work)
    deduction_total = sum((d.quantity or 0) * (d.unit_rate or 0) for d in (data.deductions or []))

    scope_items = []
    for s in data.scope_items:
        scope_items.append({
            "name": s.name, "unit": s.unit, "quantity": s.quantity,
            "unit_rate": s.unit_rate, "total": round(s.quantity * s.unit_rate, 2)
        })
    
    stages = []
    for st in data.stages:
        amt = st.value if st.type == "amount" else round(scope_total * st.value / 100, 2)
        stages.append({
            "stage_id": f"wos_{uuid.uuid4().hex[:6]}",
            "name": st.name, "type": st.type, "value": st.value, "amount": amt,
            "source": st.source or None,
            "status": "pending",
            "requested_by": None, "requested_at": None,
            "pm_approved_by": None, "pm_approved_at": None,
            "planning_approved_by": None, "planning_approved_at": None,
            "accountant_approved_by": None, "accountant_approved_at": None,
            "approved_amount": None, "rejection_reason": None,
        })
    
    additional = []
    for a in data.additional_work:
        additional.append({
            "description": a.description, "unit": a.unit, "quantity": a.quantity,
            "unit_rate": a.unit_rate, "total": round(a.quantity * a.unit_rate, 2)
        })

    deductions_list = []
    for d in (data.deductions or []):
        deductions_list.append({
            "description": d.description, "unit": d.unit, "quantity": d.quantity,
            "unit_rate": d.unit_rate, "total": round(d.quantity * d.unit_rate, 2)
        })

    wo = {
        "work_order_id": f"wo_{uuid.uuid4().hex[:8]}",
        "project_id": project_id,
        "project_name": project.get("name", ""),
        "contractor_id": data.contractor_id,
        "contractor_name": contractor.get("name", data.contractor_name or ""),
        "contractor_type": (contractor.get("work_types") or [None])[0] or contractor.get("contractor_type") or data.contractor_type or "",
        "scope_items": scope_items,
        "scope_total": round(scope_total, 2),
        "stages": stages,
        "additional_work": additional,
        "additional_total": round(additional_total, 2),
        "deductions": deductions_list,
        "deduction_total": round(deduction_total, 2),
        "total_value": round(scope_total + additional_total - deduction_total, 2),
        "paid_amount": 0,
        "notes": data.notes or "",
        "labour_rates": data.labour_rates.model_dump() if data.labour_rates else {"skilled": 0, "semi_skilled": 0, "unskilled": 0},
        "status": "active",
        "is_active": True,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.project_work_orders.insert_one(wo)
    wo.pop("_id", None)
    return {"work_order_id": wo["work_order_id"], "message": "Work order created", "total_value": wo["total_value"]}

@router.patch("/projects/{project_id}/work-orders/{work_order_id}")
async def update_project_work_order(project_id: str, work_order_id: str, data: WorkOrderCreate, user: User = Depends(get_current_user)):
    """Update a work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    scope_total = sum((s.quantity or 0) * (s.unit_rate or 0) for s in data.scope_items)
    additional_total = sum((a.quantity or 0) * (a.unit_rate or 0) for a in data.additional_work)
    deduction_total = sum((d.quantity or 0) * (d.unit_rate or 0) for d in (data.deductions or []))

    scope_items = [{"name": s.name, "unit": s.unit, "quantity": s.quantity, "unit_rate": s.unit_rate, "total": round(s.quantity * s.unit_rate, 2)} for s in data.scope_items]

    # Preserve existing stage statuses if they haven't changed
    existing_wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    existing_stages_map = {}
    if existing_wo:
        for es in existing_wo.get("stages", []):
            existing_stages_map[es.get("name", "")] = es

    stages = []
    for st in data.stages:
        amt = st.value if st.type == "amount" else round(scope_total * st.value / 100, 2)
        existing = existing_stages_map.get(st.name, {})
        stages.append({
            "stage_id": existing.get("stage_id", f"wos_{uuid.uuid4().hex[:6]}"),
            "name": st.name, "type": st.type, "value": st.value, "amount": amt,
            "source": st.source or existing.get("source") or None,
            "status": existing.get("status", "pending"),
            "requested_by": existing.get("requested_by"), "requested_at": existing.get("requested_at"),
            "pm_approved_by": existing.get("pm_approved_by"), "pm_approved_at": existing.get("pm_approved_at"),
            "planning_approved_by": existing.get("planning_approved_by"), "planning_approved_at": existing.get("planning_approved_at"),
            "accountant_approved_by": existing.get("accountant_approved_by"), "accountant_approved_at": existing.get("accountant_approved_at"),
            "approved_amount": existing.get("approved_amount"), "rejection_reason": existing.get("rejection_reason"),
        })
    additional = [{"description": a.description, "unit": a.unit, "quantity": a.quantity, "unit_rate": a.unit_rate, "total": round(a.quantity * a.unit_rate, 2)} for a in data.additional_work]
    deductions_list = [{"description": d.description, "unit": d.unit, "quantity": d.quantity, "unit_rate": d.unit_rate, "total": round(d.quantity * d.unit_rate, 2)} for d in (data.deductions or [])]

    contractor = await db.contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0, "name": 1, "contractor_type": 1, "work_types": 1})
    if not contractor:
        contractor = await db.labour_contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0, "name": 1, "contractor_type": 1, "work_types": 1})

    derived_type = ""
    if contractor:
        derived_type = (contractor.get("work_types") or [None])[0] or contractor.get("contractor_type") or ""

    update = {
        "contractor_id": data.contractor_id,
        "contractor_name": contractor.get("name", "") if contractor else data.contractor_name or "",
        "contractor_type": derived_type or data.contractor_type or "",
        "scope_items": scope_items, "scope_total": round(scope_total, 2),
        "stages": stages,
        "additional_work": additional, "additional_total": round(additional_total, 2),
        "deductions": deductions_list, "deduction_total": round(deduction_total, 2),
        "total_value": round(scope_total + additional_total - deduction_total, 2),
        "notes": data.notes or "",
        "labour_rates": data.labour_rates.model_dump() if data.labour_rates else {"skilled": 0, "semi_skilled": 0, "unskilled": 0},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.project_work_orders.update_one({"work_order_id": work_order_id, "project_id": project_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order updated"}

@router.delete("/projects/{project_id}/work-orders/{work_order_id}")
async def delete_project_work_order(project_id: str, work_order_id: str, user: User = Depends(get_current_user)):
    """Soft delete a work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order deleted"}

# ==================== WORK ORDER PAYMENT APPROVAL PIPELINE ====================

@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/request-payment")
async def wo_request_stage_payment(project_id: str, work_order_id: str, stage_id: str, data: dict, user: User = Depends(get_current_user)):
    """Site Engineer requests PARTIAL payment for a stage. Can be called multiple times until stage total is paid."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can request payments")
    
    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    request_amount = data.get("amount")
    if request_amount is None or request_amount == "":
        raise HTTPException(status_code=400, detail="Amount is required")
    try:
        request_amount = float(request_amount)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Amount must be a number")
    if request_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    auto_amount = False  # SE always provides amount now
    
    now = datetime.now(timezone.utc).isoformat()
    updated = False
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            if not stage.get("is_open"):
                raise HTTPException(status_code=400, detail="Stage not opened by Planning yet")
            if stage.get("stage_status") == "finished":
                raise HTTPException(status_code=400, detail="Stage is finished, no more payment requests allowed")
            
            # Initialize payment_requests array if not present
            if "payment_requests" not in stage:
                stage["payment_requests"] = []
            
            # Calculate already released + pending amounts
            released = sum(pr.get("approved_amount", 0) for pr in stage["payment_requests"] if pr.get("status") == "approved")
            pending = sum(pr.get("amount", 0) for pr in stage["payment_requests"] if pr.get("status") in ["requested", "pm_approved", "planning_approved"])
            stage_total = stage.get("amount", 0)
            balance = stage_total - released - pending
            # Note: SE may request more than current stage balance; Planning can approve and overflow will deduct from next stage.
            
            import uuid
            payment_req = {
                "request_id": f"pr_{uuid.uuid4().hex[:8]}",
                "amount": request_amount,
                # PM step skipped — request lands directly in Planning queue
                "status": "pm_approved",
                "requested_by": user.user_id,
                "requested_by_name": user.name,
                "requested_at": now,
                "pm_approved_by": user.user_id,
                "pm_approved_by_name": user.name,
                "pm_approved_at": now,
                "pm_notes": "Auto-skipped (PM approval bypassed)",
                "notes": data.get("notes", ""),
                "dlr_summary": data.get("dlr_summary", ""),
                "se_exceeds_balance": request_amount > balance + 0.01,
                "se_balance_at_request": balance,
            }
            stage["payment_requests"].append(payment_req)
            
            # Update stage amounts
            stage["amount_released"] = released
            stage["amount_pending"] = pending + request_amount
            
            # Set stage to in_progress if still pending
            if stage.get("status") == "pending":
                stage["status"] = "in_progress"
                stage["stage_status"] = "in_progress"
            
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )
    
    # Notify Planning team (PM step is skipped)
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "team": 1, "name": 1})
    planning_users = await db.users.find({"role": {"$in": [UserRole.PLANNING.value, UserRole.SUPER_ADMIN.value]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(20)
    for pu in planning_users:
        try:
            notif = Notification(
                user_id=pu.get("user_id"),
                title="Payment Request",
                message=f"₹{request_amount:,.0f} stage payment requested for {wo.get('contractor_name', '')} in {(project or {}).get('name', '')}",
                link=f"/planning-board"
            )
            notif_dict = notif.model_dump()
            notif_dict["created_at"] = notif_dict["created_at"].isoformat()
            await db.notifications.insert_one(notif_dict)
        except Exception:
            pass
    
    return {"message": "Payment requested successfully", "request_id": payment_req["request_id"]}


@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/finish")
async def wo_finish_stage(project_id: str, work_order_id: str, stage_id: str, data: dict, user: User = Depends(get_current_user)):
    """Site Engineer marks a stage's WORK as complete with remarks.

    The stage moves to a "finished" state ONLY when BOTH conditions are true:
      - work_complete = true (this endpoint sets it)
      - released amount >= stage.amount (payment fully done)

    If only payment is done → bucket = "Payment Done · Work Pending"
    If only work_complete → bucket = "Work Done · Payment Pending"
    Both true → bucket = "Finished"
    """
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can mark stages complete")
    
    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    remarks = (data.get("remarks") or "").strip()
    if not remarks:
        raise HTTPException(status_code=400, detail="Work-complete remarks are required")
    
    updated = False
    new_status = None
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            # Check for pending payment requests — these block finish until they're released or rejected.
            pending_prs = [pr for pr in stage.get("payment_requests", []) if pr.get("status") in ["requested", "pm_approved", "planning_approved"]]
            if pending_prs:
                raise HTTPException(status_code=400, detail=f"Cannot mark complete — {len(pending_prs)} payment request(s) still pending Planning/Accountant action")

            # Mark work complete (independent of payment)
            stage["work_complete"] = True
            stage["work_complete_at"] = now
            stage["work_complete_by"] = user.user_id
            stage["work_complete_by_name"] = user.name
            stage["work_complete_remarks"] = remarks

            # Compute payment-done flag
            released = sum(pr.get("approved_amount", 0) for pr in stage.get("payment_requests", []) if pr.get("status") == "approved")
            stage_amount = float(stage.get("amount") or 0)
            payment_done = stage_amount > 0 and released >= stage_amount

            if payment_done:
                stage["stage_status"] = "finished"
                stage["status"] = "completed"
                stage["finished_at"] = now
                stage["finished_remarks"] = remarks
                stage["finished_by"] = user.user_id
                new_status = "finished"
            else:
                # Work done but balance still owed — stage stays "open" so the SE/Accountant
                # can release the balance, while the work-complete flags drive bucketing.
                new_status = "work_done_pending_payment"
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )
    return {"message": "Stage work marked complete", "status": new_status}


@router.get("/planning/labour-stage-requests")
async def planning_labour_stage_requests(status: str = "new", user: User = Depends(get_current_user)):
    """Planning queue: list all WO stage payment requests grouped by status.
    status values:
      - 'new'      → pm_approved (Site Engineer just submitted, awaiting Planning)
      - 'forwarded'→ planning_approved (already forwarded to Accountant)
      - 'all'      → every non-finalised request
    """
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    target_statuses = {
        "new": ["pm_approved"],
        "forwarded": ["planning_approved"],
        "all": ["pm_approved", "planning_approved"],
    }.get(status, ["pm_approved"])

    # Pull all active work orders that have at least one matching payment request
    work_orders = await db.project_work_orders.find(
        {"is_active": {"$ne": False}, "stages.payment_requests.status": {"$in": target_statuses}},
        {"_id": 0}
    ).to_list(500)

    # Build flat list of requests
    project_ids = list({wo.get("project_id") for wo in work_orders if wo.get("project_id")})
    projects = {p["project_id"]: p for p in await db.projects.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1, "team": 1}
    ).to_list(500)}

    # Resolve site-engineer names from team
    engineer_ids = []
    for p in projects.values():
        team = p.get("team") or {}
        for k in ("site_engineer", "sr_site_engineer"):
            if team.get(k):
                engineer_ids.append(team[k])
    user_lookup = {u["user_id"]: u for u in await db.users.find(
        {"user_id": {"$in": engineer_ids}}, {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(500)} if engineer_ids else {}

    out = []
    for wo in work_orders:
        proj = projects.get(wo.get("project_id"), {})
        team = proj.get("team") or {}
        se_id = team.get("site_engineer") or team.get("sr_site_engineer")
        se_name = (user_lookup.get(se_id) or {}).get("name", "—")
        for stage in wo.get("stages", []):
            for pr in stage.get("payment_requests", []) or []:
                if pr.get("status") not in target_statuses:
                    continue
                # Recompute summary so the popup is accurate
                released = sum(p.get("approved_amount", 0) for p in stage.get("payment_requests", []) if p.get("status") == "approved")
                pending = sum(p.get("amount", 0) for p in stage.get("payment_requests", []) if p.get("status") in ["requested", "pm_approved", "planning_approved"])
                stage_total = stage.get("amount", 0)
                carryover_ded = float(stage.get("carryover_deduction", 0))
                stage_idx_ = wo.get("stages", []).index(stage)
                next_stage_obj = wo["stages"][stage_idx_ + 1] if stage_idx_ + 1 < len(wo["stages"]) else None
                next_stage_capacity = 0
                if next_stage_obj:
                    ns_rel = sum(p.get("approved_amount", 0) for p in (next_stage_obj.get("payment_requests") or []) if p.get("status") == "approved")
                    next_stage_capacity = max(0, float(next_stage_obj.get("amount", 0)) - ns_rel - float(next_stage_obj.get("carryover_deduction", 0)))
                out.append({
                    "request_id": pr.get("request_id"),
                    "status": pr.get("status"),
                    "amount": pr.get("amount", 0),
                    "notes": pr.get("notes", ""),
                    "requested_at": pr.get("requested_at"),
                    "requested_by_name": pr.get("requested_by_name", se_name),
                    "site_engineer_name": se_name,
                    "project_id": wo.get("project_id"),
                    "project_name": proj.get("name") or wo.get("project_name", ""),
                    "work_order_id": wo.get("work_order_id"),
                    "contractor_id": wo.get("contractor_id"),
                    "contractor_name": wo.get("contractor_name", ""),
                    "contractor_type": wo.get("contractor_type", ""),
                    "stage_id": stage.get("stage_id"),
                    "stage_name": stage.get("name", ""),
                    "stage_amount": stage_total,
                    "stage_released": released,
                    "stage_pending": pending,
                    "stage_carryover_deduction": carryover_ded,
                    "stage_balance": max(0, stage_total - released - pending - carryover_ded + pr.get("amount", 0)),
                    "se_exceeds_balance": pr.get("se_exceeds_balance", False),
                    "se_balance_at_request": pr.get("se_balance_at_request", 0),
                    "next_stage_name": (next_stage_obj or {}).get("name"),
                    "next_stage_capacity": next_stage_capacity,
                    "wo_total_value": wo.get("total_value", 0),
                    "wo_paid_amount": wo.get("paid_amount", 0),
                })

    # Sort newest first
    out.sort(key=lambda r: r.get("requested_at") or "", reverse=True)
    return {"count": len(out), "requests": out}




# =====================================================================
# CONTRACTOR SUSPENSE / EXTRA CREDIT — visible only to Accountant, Planning, Super Admin
# =====================================================================
async def _get_contractor_suspense_balance(contractor_id: str) -> float:
    if not contractor_id:
        return 0.0
    pipeline = [
        {"$match": {"contractor_id": contractor_id}},
        {"$group": {"_id": None, "credit": {"$sum": {"$cond": [{"$eq": ["$type", "credit"]}, "$amount", 0]}},
                    "debit": {"$sum": {"$cond": [{"$eq": ["$type", "debit"]}, "$amount", 0]}}}},
    ]
    res = await db.contractor_suspense_ledger.aggregate(pipeline).to_list(1)
    if not res:
        return 0.0
    return float(res[0].get("credit", 0)) - float(res[0].get("debit", 0))


@router.get("/contractors/{contractor_id}/suspense")
async def get_contractor_suspense(contractor_id: str, user: User = Depends(get_current_user)):
    """Returns suspense balance + ledger for a contractor."""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    balance = await _get_contractor_suspense_balance(contractor_id)
    # SE only gets the balance, not the ledger
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER]:
        return {"contractor_id": contractor_id, "balance": balance, "ledger": []}
    ledger = await db.contractor_suspense_ledger.find(
        {"contractor_id": contractor_id}, {"_id": 0}
    ).sort("date", -1).limit(200).to_list(200)
    return {"contractor_id": contractor_id, "balance": balance, "ledger": ledger}


@router.get("/accountant/labour-payments")
async def accountant_labour_payments(status: str = "pending", user: User = Depends(get_current_user)):
    """Accountant queue: stage payment requests forwarded by Planning.
    status:
      - pending → planning_approved (awaiting accountant action)
      - released → approved (already paid)
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")

    target_statuses = {"pending": ["planning_approved"], "released": ["approved"]}.get(status, ["planning_approved"])
    work_orders = await db.project_work_orders.find(
        {"is_active": {"$ne": False}, "stages.payment_requests.status": {"$in": target_statuses}},
        {"_id": 0}
    ).to_list(500)

    project_ids = list({wo.get("project_id") for wo in work_orders if wo.get("project_id")})
    projects = {p["project_id"]: p for p in await db.projects.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1, "team": 1}
    ).to_list(500)}

    # Pre-fetch suspense balances per contractor
    contractor_ids = list({wo.get("contractor_id") for wo in work_orders if wo.get("contractor_id")})
    suspense_map = {}
    for cid in contractor_ids:
        suspense_map[cid] = await _get_contractor_suspense_balance(cid)

    out = []
    for wo in work_orders:
        proj = projects.get(wo.get("project_id"), {})
        team = proj.get("team") or {}
        se_id = team.get("site_engineer") or team.get("sr_site_engineer")
        se_user = await db.users.find_one({"user_id": se_id}, {"_id": 0, "name": 1}) if se_id else None
        se_name = (se_user or {}).get("name", "—")
        for stage in wo.get("stages", []):
            for pr in stage.get("payment_requests", []) or []:
                if pr.get("status") not in target_statuses:
                    continue
                released_total = sum(p.get("approved_amount", 0) for p in stage.get("payment_requests", []) if p.get("status") == "approved")
                pending_total = sum(p.get("amount", 0) for p in stage.get("payment_requests", []) if p.get("status") in ["requested", "pm_approved", "planning_approved"])
                stage_total = stage.get("amount", 0)
                out.append({
                    "request_id": pr.get("request_id"),
                    "status": pr.get("status"),
                    "amount": pr.get("amount", 0),
                    "original_amount": pr.get("original_amount", pr.get("amount", 0)),
                    "planning_amount_changed": pr.get("planning_amount_changed", False),
                    "planning_change_reason": pr.get("planning_change_reason", ""),
                    "planning_notes": pr.get("planning_notes", ""),
                    "notes": pr.get("notes", ""),
                    "requested_at": pr.get("requested_at"),
                    "planning_approved_at": pr.get("planning_approved_at"),
                    "site_engineer_name": se_name,
                    "project_id": wo.get("project_id"),
                    "project_name": proj.get("name") or wo.get("project_name", ""),
                    "work_order_id": wo.get("work_order_id"),
                    "contractor_id": wo.get("contractor_id"),
                    "contractor_name": wo.get("contractor_name", ""),
                    "contractor_type": wo.get("contractor_type", ""),
                    "stage_id": stage.get("stage_id"),
                    "stage_name": stage.get("name", ""),
                    "stage_amount": stage_total,
                    "stage_released": released_total,
                    "stage_pending": pending_total,
                    "stage_balance": max(0, stage_total - released_total),
                    "wo_total_value": wo.get("total_value", 0),
                    "wo_paid_amount": wo.get("paid_amount", 0),
                    "suspense_balance": suspense_map.get(wo.get("contractor_id"), 0.0),
                })
    out.sort(key=lambda r: r.get("planning_approved_at") or r.get("requested_at") or "", reverse=True)
    return {"count": len(out), "requests": out}


@router.post("/accountant/labour-payments/{request_id}/release")
async def accountant_release_labour_payment(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Accountant releases a planning-approved payment.
    Body:
      - work_order_id, stage_id (required)
      - payment_method: 'cash' | 'bank' | 'cheque'
      - bank_amount: amount being released to contractor in this transaction (= approved_amount by default)
      - cheque_amount (optional, only for cheque mode): if greater than approved_amount, the extra goes into suspense
      - use_suspense_amount (optional): subtract this from contractor's suspense balance (debits suspense, contractor receives it)
      - bank_ref, cheque_no, payment_date, notes
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant / Super Admin can release labour payments")

    work_order_id = data.get("work_order_id")
    stage_id = data.get("stage_id")
    if not (work_order_id and stage_id):
        raise HTTPException(status_code=400, detail="work_order_id and stage_id are required")

    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    payment_method = (data.get("payment_method") or "bank").lower()
    if payment_method not in ("cash", "bank", "cheque"):
        raise HTTPException(status_code=400, detail="Invalid payment method")

    cheque_no = data.get("cheque_no", "")
    bank_ref = data.get("bank_ref", "")
    payment_date = data.get("payment_date") or datetime.now(timezone.utc).isoformat()
    notes = data.get("notes", "")
    use_suspense = float(data.get("use_suspense_amount") or 0)
    cheque_amount_input = data.get("cheque_amount")

    now = datetime.now(timezone.utc).isoformat()
    target_pr = None
    target_stage = None
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            target_stage = stage
            for pr in stage.get("payment_requests", []) or []:
                if pr.get("request_id") == request_id and pr.get("status") == "planning_approved":
                    target_pr = pr
                    break
            break
    if not target_pr:
        raise HTTPException(status_code=404, detail="No matching planning-approved request found")

    approved_amount = float(target_pr.get("amount", 0))

    # Handle suspense usage
    contractor_id = wo.get("contractor_id")
    if use_suspense > 0:
        current_suspense = await _get_contractor_suspense_balance(contractor_id)
        if use_suspense > current_suspense + 0.01:
            raise HTTPException(status_code=400, detail=f"Insufficient suspense balance (₹{current_suspense:,.0f})")

    # For cheque mode: if cheque_amount > approved_amount → diff credits suspense
    cheque_excess = 0.0
    cheque_amount = approved_amount
    if payment_method == "cheque" and cheque_amount_input not in (None, ""):
        try:
            cheque_amount = float(cheque_amount_input)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid cheque amount")
        if cheque_amount < approved_amount - 0.01:
            raise HTTPException(status_code=400, detail="Cheque amount cannot be less than approved amount")
        cheque_excess = max(0.0, cheque_amount - approved_amount)

    # Payment record
    payment_record = {
        "request_id": request_id,
        "method": payment_method,
        "approved_amount": approved_amount,
        "cheque_amount": cheque_amount if payment_method == "cheque" else None,
        "cheque_no": cheque_no if payment_method == "cheque" else None,
        "bank_ref": bank_ref if payment_method == "bank" else None,
        "use_suspense_amount": use_suspense,
        "suspense_credited": cheque_excess,
        "payment_date": payment_date,
        "notes": notes,
        "released_by": user.user_id,
        "released_by_name": user.name,
        "released_at": now,
    }

    # Mark request approved
    target_pr["status"] = "approved"
    target_pr["approved_amount"] = approved_amount
    target_pr["accountant_approved_by"] = user.user_id
    target_pr["accountant_approved_at"] = now
    target_pr["accountant_notes"] = notes
    target_pr["payment_record"] = payment_record

    # Update WO totals
    wo["paid_amount"] = float(wo.get("paid_amount", 0)) + approved_amount
    target_stage["amount_released"] = sum(p.get("approved_amount", 0) for p in target_stage.get("payment_requests", []) if p.get("status") == "approved")
    target_stage["amount_pending"] = sum(p.get("amount", 0) for p in target_stage.get("payment_requests", []) if p.get("status") in ["requested", "pm_approved", "planning_approved"])

    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id},
        {"$set": {"stages": wo["stages"], "paid_amount": wo["paid_amount"], "updated_at": now}}
    )

    # Suspense ledger entries
    if cheque_excess > 0:
        await db.contractor_suspense_ledger.insert_one({
            "ledger_id": f"sl_{uuid.uuid4().hex[:8]}",
            "contractor_id": contractor_id,
            "contractor_name": wo.get("contractor_name", ""),
            "project_id": wo.get("project_id"),
            "amount": cheque_excess,
            "type": "credit",
            "source_type": "cheque_excess",
            "reference_id": request_id,
            "cheque_no": cheque_no,
            "date": now,
            "notes": f"Cheque {cheque_no} excess from approved ₹{approved_amount:,.0f}",
            "created_by": user.user_id,
            "created_by_name": user.name,
        })
    if use_suspense > 0:
        await db.contractor_suspense_ledger.insert_one({
            "ledger_id": f"sl_{uuid.uuid4().hex[:8]}",
            "contractor_id": contractor_id,
            "contractor_name": wo.get("contractor_name", ""),
            "project_id": wo.get("project_id"),
            "amount": use_suspense,
            "type": "debit",
            "source_type": "release",
            "reference_id": request_id,
            "date": now,
            "notes": f"Suspense applied to {target_stage.get('name', '')} payment",
            "created_by": user.user_id,
            "created_by_name": user.name,
        })

    # Record expense in cashbook so it shows up in Accountant Expense ledger / project P&L.
    # Cash outflow = approved_amount - use_suspense (suspense usage is a non-cash settlement)
    cash_paid = max(0.0, approved_amount - use_suspense)
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    cashbook_method_map = {"bank": "bank_transfer", "cash": "cash", "cheque": "cheque"}
    project_doc = await db.projects.find_one({"project_id": wo.get("project_id")}, {"_id": 0, "name": 1})
    cashbook_entry = {
        "expense_id": expense_id,
        "project_id": wo.get("project_id"),
        "project_name": (project_doc or {}).get("name", ""),
        "category": "labour",
        "expense_type": "labour",
        "description": f"{wo.get('contractor_name', '')} - {target_stage.get('name', '')}",
        "amount": cash_paid,
        "approved_amount": approved_amount,
        "suspense_applied": use_suspense,
        "payment_method": cashbook_method_map.get(payment_method, payment_method),
        "transaction_id": bank_ref or cheque_no or "",
        "cheque_no": cheque_no if payment_method == "cheque" else None,
        "cheque_amount": cheque_amount if payment_method == "cheque" else None,
        "bank_ref": bank_ref if payment_method == "bank" else None,
        "vendor_name": wo.get("contractor_name", ""),
        "contractor_id": contractor_id,
        "contractor_type": wo.get("contractor_type", ""),
        "work_order_id": work_order_id,
        "stage_id": stage_id,
        "stage_name": target_stage.get("name", ""),
        "request_id": request_id,
        "request_type": "labour_stage_payment",
        "remarks": notes,
        "status": "approved",
        "source": "wo_stage_release",
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "created_at": now,
        "approved_at": now,
        "approved_by": user.user_id,
        "payment_date": payment_date,
    }
    await db.recorded_expenses.insert_one(cashbook_entry)

    return {
        "message": "Payment released",
        "approved_amount": approved_amount,
        "expense_id": expense_id,
        "cash_paid": cash_paid,
        "cheque_excess_to_suspense": cheque_excess,
        "suspense_used": use_suspense,
    }


@router.get("/labour-contractor-payments/summary")
async def labour_contractor_payment_summary(user: User = Depends(get_current_user)):
    """Cross-project payment summary per contractor — accountant/planning/super-admin only."""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    work_orders = await db.project_work_orders.find({"is_active": {"$ne": False}}, {"_id": 0}).to_list(2000)
    proj_ids = list({wo.get("project_id") for wo in work_orders})
    projects = {p["project_id"]: p for p in await db.projects.find({"project_id": {"$in": proj_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(2000)}

    by_contractor = {}
    for wo in work_orders:
        cid = wo.get("contractor_id") or wo.get("contractor_name")
        if not cid:
            continue
        bucket = by_contractor.setdefault(cid, {
            "contractor_id": wo.get("contractor_id"),
            "contractor_name": wo.get("contractor_name", ""),
            "contractor_type": wo.get("contractor_type", ""),
            "projects": [],
            "total_value": 0.0,
            "paid_amount": 0.0,
            "pending_amount": 0.0,
        })
        proj_name = (projects.get(wo.get("project_id")) or {}).get("name") or wo.get("project_name", "")
        if proj_name and proj_name not in bucket["projects"]:
            bucket["projects"].append(proj_name)
        bucket["total_value"] += float(wo.get("total_value", 0))
        bucket["paid_amount"] += float(wo.get("paid_amount", 0))
        for stage in wo.get("stages", []):
            for pr in stage.get("payment_requests", []) or []:
                if pr.get("status") in ["requested", "pm_approved", "planning_approved"]:
                    bucket["pending_amount"] += float(pr.get("amount", 0))

    rows = []
    for cid, bucket in by_contractor.items():
        bucket["balance"] = bucket["total_value"] - bucket["paid_amount"]
        bucket["suspense_balance"] = await _get_contractor_suspense_balance(bucket.get("contractor_id"))
        rows.append(bucket)
    rows.sort(key=lambda r: r.get("contractor_name", "").lower())
    return {"count": len(rows), "rows": rows}




@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/open")
async def wo_open_stage(project_id: str, work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Planning opens a stage so Site Engineer can request payment for it."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can open stages")

    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    now = datetime.now(timezone.utc).isoformat()
    updated = False
    target_stage_name = None
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            stage["is_open"] = True
            stage["opened_by"] = user.user_id
            stage["opened_by_name"] = user.name
            stage["opened_at"] = now
            # Clear any pending open-request
            stage["open_requested"] = False
            stage["open_request_resolved_at"] = now
            target_stage_name = stage.get("name")
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")

    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )
    # Mirror into legacy labour_work_orders (SE WorkOrderTab data source) — match by stage_name.
    if target_stage_name:
        await _mirror_stage_open_state(project_id, target_stage_name, is_open=True, user=user, now=now)
    return {"message": "Stage opened for Site Engineer"}


async def _mirror_stage_open_state(project_id: str, stage_name: str, is_open: bool, user: User, now: str) -> None:
    """Match a stage by name across labour_work_orders (legacy SE-facing) and toggle is_open."""
    legacy_wos = await db.labour_work_orders.find({"project_id": project_id}, {"_id": 0}).to_list(200)
    for lwo in legacy_wos:
        changed = False
        for st in lwo.get("payment_stages") or []:
            if (st.get("stage_name") or "").strip().lower() == (stage_name or "").strip().lower():
                st["is_open"] = is_open
                if is_open:
                    st["opened_by_name"] = user.name
                    st["opened_at"] = now
                else:
                    st["locked_by_name"] = user.name
                    st["locked_at"] = now
                changed = True
        if changed:
            await db.labour_work_orders.update_one(
                {"work_order_id": lwo["work_order_id"], "project_id": project_id},
                {"$set": {"payment_stages": lwo["payment_stages"], "updated_at": now}}
            )


@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/lock")
async def wo_lock_stage(project_id: str, work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Planning locks a previously-opened stage so it disappears from SE view."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can lock stages")

    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    now = datetime.now(timezone.utc).isoformat()
    updated = False
    target_stage_name = None
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            if stage.get("status") == "approved":
                raise HTTPException(status_code=400, detail="Approved (paid) stage cannot be locked")
            stage["is_open"] = False
            stage["locked_by"] = user.user_id
            stage["locked_by_name"] = user.name
            stage["locked_at"] = now
            target_stage_name = stage.get("name")
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")

    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )
    if target_stage_name:
        await _mirror_stage_open_state(project_id, target_stage_name, is_open=False, user=user, now=now)
    return {"message": "Stage locked"}


@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/request-open")
async def wo_request_stage_open(project_id: str, work_order_id: str, stage_id: str, data: dict = None, user: User = Depends(get_current_user)):
    """Site Engineer requests Planning to open this stage."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    data = data or {}

    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    now = datetime.now(timezone.utc).isoformat()
    target_stage = None
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            target_stage = stage
            if stage.get("is_open"):
                raise HTTPException(status_code=400, detail="Stage is already open")
            stage["open_requested"] = True
            stage["open_requested_by"] = user.user_id
            stage["open_requested_by_name"] = user.name
            stage["open_requested_at"] = now
            stage["open_request_notes"] = data.get("notes", "")
            break
    if not target_stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )

    # Notify Planning team
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    planning_users = await db.users.find(
        {"role": {"$in": [UserRole.PLANNING.value, UserRole.SUPER_ADMIN.value]}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1}
    ).to_list(20)
    for pu in planning_users:
        try:
            notif = Notification(
                user_id=pu.get("user_id"),
                title="Stage Open Request",
                message=f"{user.name} requested to open '{target_stage.get('name','')}' for {wo.get('contractor_name','')} ({(project or {}).get('name','')})",
                link=f"/planning-board",
            )
            notif_dict = notif.model_dump()
            notif_dict["created_at"] = notif_dict["created_at"].isoformat()
            await db.notifications.insert_one(notif_dict)
        except Exception:
            pass

    return {"message": "Open request sent to Planning"}


@router.get("/planning/stage-open-requests")
async def planning_stage_open_requests(user: User = Depends(get_current_user)):
    """Planning queue of stages that Site Engineers want opened."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    work_orders = await db.project_work_orders.find(
        {"is_active": {"$ne": False}, "stages.open_requested": True},
        {"_id": 0}
    ).to_list(500)

    project_ids = list({wo.get("project_id") for wo in work_orders if wo.get("project_id")})
    projects = {p["project_id"]: p for p in await db.projects.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}
    ).to_list(500)}

    out = []
    for wo in work_orders:
        proj = projects.get(wo.get("project_id"), {})
        for stage in wo.get("stages", []) or []:
            if not stage.get("open_requested") or stage.get("is_open"):
                continue
            out.append({
                "project_id": wo.get("project_id"),
                "project_name": proj.get("name") or wo.get("project_name", ""),
                "work_order_id": wo.get("work_order_id"),
                "contractor_name": wo.get("contractor_name", ""),
                "contractor_type": wo.get("contractor_type", ""),
                "stage_id": stage.get("stage_id"),
                "stage_name": stage.get("name", ""),
                "stage_amount": stage.get("amount", 0),
                "requested_by_name": stage.get("open_requested_by_name", ""),
                "requested_at": stage.get("open_requested_at"),
                "notes": stage.get("open_request_notes", ""),
            })
    out.sort(key=lambda r: r.get("requested_at") or "", reverse=True)
    return {"count": len(out), "requests": out}


@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/approve")
async def wo_approve_stage(project_id: str, work_order_id: str, stage_id: str, data: dict, user: User = Depends(get_current_user)):
    """4-level approval for a specific payment request within a stage: SE Request -> PM Approve -> Planning Approve -> Accountant Process"""
    allowed = [UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    action = data.get("action", "approve")
    request_id = data.get("request_id")  # specific payment request to approve
    
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            # New system: work with payment_requests array
            if stage.get("payment_requests"):
                target_pr = None
                if request_id:
                    target_pr = next((pr for pr in stage["payment_requests"] if pr.get("request_id") == request_id), None)
                else:
                    # Find the first request in the appropriate status for this approver
                    status_map = {
                        UserRole.PROJECT_MANAGER: "requested",
                        UserRole.PLANNING: "pm_approved",
                        UserRole.ACCOUNTANT: "planning_approved",
                    }
                    target_status = status_map.get(user.role)
                    if target_status:
                        target_pr = next((pr for pr in stage["payment_requests"] if pr.get("status") == target_status), None)
                    elif user.role == UserRole.SUPER_ADMIN:
                        target_pr = next((pr for pr in stage["payment_requests"] if pr.get("status") not in ["approved", "rejected"]), None)
                
                if not target_pr:
                    raise HTTPException(status_code=400, detail="No matching payment request found for your role")
                
                if action == "reject":
                    target_pr["status"] = "rejected"
                    target_pr["rejection_reason"] = data.get("notes", f"Rejected by {user.role}")
                    target_pr["rejected_by"] = user.user_id
                    target_pr["rejected_at"] = now
                elif action == "approve":
                    current = target_pr["status"]
                    if user.role == UserRole.PROJECT_MANAGER and current == "requested":
                        target_pr["status"] = "pm_approved"
                        target_pr["pm_approved_by"] = user.user_id
                        target_pr["pm_approved_at"] = now
                        target_pr["pm_notes"] = data.get("notes", "")
                    elif user.role == UserRole.PLANNING and current == "pm_approved":
                        # Planning may approve a different amount with reason.
                        # If approved_amount exceeds the available balance, the overflow is auto-deducted from the NEXT stage.
                        approved_amount = data.get("approved_amount")
                        try:
                            approved_amount = float(approved_amount) if approved_amount not in (None, "") else target_pr.get("amount", 0)
                        except (ValueError, TypeError):
                            approved_amount = target_pr.get("amount", 0)
                        if approved_amount <= 0:
                            raise HTTPException(status_code=400, detail="Approved amount must be positive")

                        # Compute current stage balance for overflow detection
                        released_so_far = sum(p.get("approved_amount", 0) for p in stage["payment_requests"] if p.get("status") == "approved")
                        pending_so_far = sum(p.get("amount", 0) for p in stage["payment_requests"] if p.get("status") in ["requested", "pm_approved", "planning_approved"] and p.get("request_id") != target_pr.get("request_id"))
                        carryover = float(stage.get("carryover_deduction", 0))
                        stage_balance = float(stage.get("amount", 0)) - released_so_far - pending_so_far - carryover
                        overflow = max(0.0, approved_amount - stage_balance)

                        if overflow > 0.01:
                            # Find next stage (by order in array)
                            stage_idx = wo["stages"].index(stage)
                            next_stage = wo["stages"][stage_idx + 1] if stage_idx + 1 < len(wo["stages"]) else None
                            if not next_stage:
                                raise HTTPException(status_code=400, detail="No next stage to absorb the overflow. Cannot approve more than total work order balance.")
                            # Validate next stage capacity
                            ns_released = sum(p.get("approved_amount", 0) for p in (next_stage.get("payment_requests") or []) if p.get("status") == "approved")
                            ns_carry = float(next_stage.get("carryover_deduction", 0))
                            ns_capacity = float(next_stage.get("amount", 0)) - ns_released - ns_carry
                            if overflow > ns_capacity + 0.01:
                                raise HTTPException(status_code=400, detail=f"Overflow ₹{overflow:,.0f} exceeds next stage's capacity ₹{ns_capacity:,.0f}")
                            # Deduct from next stage
                            next_stage["carryover_deduction"] = ns_carry + overflow
                            target_pr["overflow_to_next_stage"] = overflow
                            target_pr["overflow_target_stage_id"] = next_stage.get("stage_id")
                            target_pr["overflow_target_stage_name"] = next_stage.get("name")
                            target_pr["exceeds_balance"] = True

                        target_pr["status"] = "planning_approved"
                        target_pr["original_amount"] = target_pr.get("amount", 0)
                        target_pr["amount"] = approved_amount
                        target_pr["planning_approved_amount"] = approved_amount
                        if abs(approved_amount - target_pr.get("original_amount", 0)) > 0.01:
                            target_pr["planning_amount_changed"] = True
                            target_pr["planning_change_reason"] = data.get("notes", "")
                        target_pr["planning_approved_by"] = user.user_id
                        target_pr["planning_approved_at"] = now
                        target_pr["planning_notes"] = data.get("notes", "")
                    elif user.role == UserRole.ACCOUNTANT and current == "planning_approved":
                        approved_amount = data.get("approved_amount", target_pr.get("amount", 0))
                        target_pr["status"] = "approved"
                        target_pr["approved_amount"] = approved_amount
                        target_pr["accountant_approved_by"] = user.user_id
                        target_pr["accountant_approved_at"] = now
                        target_pr["accountant_notes"] = data.get("notes", "")
                        wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                        # Update stage released amount
                        stage["amount_released"] = sum(pr.get("approved_amount", 0) for pr in stage["payment_requests"] if pr.get("status") == "approved")
                    elif user.role == UserRole.SUPER_ADMIN:
                        approved_amount = data.get("approved_amount", target_pr.get("amount", 0))
                        target_pr["status"] = "approved"
                        target_pr["approved_amount"] = approved_amount
                        target_pr["accountant_approved_by"] = user.user_id
                        target_pr["accountant_approved_at"] = now
                        wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                        stage["amount_released"] = sum(pr.get("approved_amount", 0) for pr in stage["payment_requests"] if pr.get("status") == "approved")
                    else:
                        raise HTTPException(status_code=400, detail=f"Cannot {action} request in '{current}' status with role '{user.role}'")
                
                # Recalc pending
                stage["amount_pending"] = sum(pr.get("amount", 0) for pr in stage["payment_requests"] if pr.get("status") in ["requested", "pm_approved", "planning_approved"])
                break
            else:
                # Legacy: single stage status (backward compatible)
                current = stage["status"]
                if action == "reject":
                    stage["status"] = "rejected"
                    stage["rejection_reason"] = data.get("notes", f"Rejected by {user.role}")
                    stage["rejected_by"] = user.user_id
                    stage["rejected_at"] = now
                    break
                if action == "approve":
                    if user.role == UserRole.PROJECT_MANAGER and current == "requested":
                        stage["status"] = "pm_approved"
                        stage["pm_approved_by"] = user.user_id
                        stage["pm_approved_at"] = now
                        stage["pm_notes"] = data.get("notes", "")
                    elif user.role == UserRole.PLANNING and current == "pm_approved":
                        stage["status"] = "planning_approved"
                        stage["planning_approved_by"] = user.user_id
                        stage["planning_approved_at"] = now
                        stage["planning_notes"] = data.get("notes", "")
                    elif user.role == UserRole.ACCOUNTANT and current == "planning_approved":
                        approved_amount = data.get("approved_amount", stage.get("amount", 0))
                        stage["status"] = "approved"
                        stage["approved_amount"] = approved_amount
                        stage["accountant_approved_by"] = user.user_id
                        stage["accountant_approved_at"] = now
                        stage["accountant_notes"] = data.get("notes", "")
                        wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                    elif user.role == UserRole.SUPER_ADMIN:
                        approved_amount = data.get("approved_amount", stage.get("amount", 0))
                        stage["status"] = "approved"
                        stage["approved_amount"] = approved_amount
                        wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                    else:
                        raise HTTPException(status_code=400, detail=f"Cannot {action} stage in '{current}' status with role '{user.role}'")
                break
    
    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "paid_amount": wo.get("paid_amount", 0), "updated_at": now}}
    )
    return {"message": f"Stage payment request {action}d successfully"}


@router.patch("/projects/{project_id}/work-orders/{work_order_id}/stages/{stage_id}/revert")
async def wo_revert_rejected_stage(project_id: str, work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Revert a rejected stage back to pending so SE can re-request"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    wo = await db.project_work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    now = datetime.now(timezone.utc).isoformat()
    for stage in wo.get("stages", []):
        if stage.get("stage_id") == stage_id:
            if stage["status"] != "rejected":
                raise HTTPException(status_code=400, detail="Stage is not rejected")
            stage["status"] = "pending"
            stage["requested_by"] = None
            stage["requested_at"] = None
            stage["rejection_reason"] = None
            stage["rejected_by"] = None
            stage["rejected_at"] = None
            break
    
    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"stages": wo["stages"], "updated_at": now}}
    )
    return {"message": "Stage reverted to pending"}


# Legacy distinct-string endpoint removed — the authoritative
# /api/contractor-types now lives in routes/procurement.py and returns
# full objects { type_id, name, description, contractor_count }.


# ==================== WORK ORDER FREEZE & REASSIGN ====================
# (resend / random / hashlib / SENDER_EMAIL are initialised at the top of the module)


class FreezeReassignRequest(BaseModel):
    otp: str
    new_contractor_id: str
    scope_items: List[WorkOrderScopeItem] = []
    stages: List[WorkOrderStage] = []
    additional_work: List[WorkOrderAdditionalItem] = []
    notes: Optional[str] = ""


@router.post("/projects/{project_id}/work-orders/{work_order_id}/freeze/send-otp")
async def wo_freeze_send_otp(project_id: str, work_order_id: str, user: User = Depends(get_current_user)):
    """Send OTP to current Planning user's email to authorize freeze"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can freeze work orders")

    wo = await db.project_work_orders.find_one(
        {"work_order_id": work_order_id, "project_id": project_id, "is_active": {"$ne": False}}, {"_id": 0}
    )
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.get("status") == "frozen":
        raise HTTPException(status_code=400, detail="Work order is already frozen")

    # Check if there are any non-paid stages to carry over
    balance_stages = [s for s in wo.get("stages", []) if s.get("status") != "approved"]
    if not balance_stages:
        raise HTTPException(status_code=400, detail="No balance stages to reassign — all stages are already paid")

    otp_code = str(random.randint(100000, 999999))
    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Store OTP
    await db.freeze_otps.delete_many({"user_id": user.user_id, "work_order_id": work_order_id})
    await db.freeze_otps.insert_one({
        "user_id": user.user_id,
        "work_order_id": work_order_id,
        "project_id": project_id,
        "otp_hash": otp_hash,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "email": 1, "name": 1})
    user_email = (user_doc or {}).get("email", "")
    user_name = (user_doc or {}).get("name", "User")

    if resend.api_key and user_email:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [user_email],
                "subject": f"Work Order Freeze OTP - {wo.get('contractor_name', '')}",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                    <div style="background: #1F2937; padding: 16px; text-align: center;">
                        <h2 style="margin: 0; color: #FBBF24;">ConstructionOS</h2>
                    </div>
                    <div style="padding: 24px; background: #fff; border: 1px solid #E5E7EB;">
                        <p style="color: #1F2937;">Hi {user_name},</p>
                        <p style="color: #4B5563;">You requested to <strong>freeze</strong> work order for <strong>{wo.get('contractor_name', '')}</strong>.</p>
                        <div style="text-align: center; margin: 24px 0; padding: 16px; background: #FEF3C7; border-radius: 8px;">
                            <p style="margin: 0; color: #92400E; font-size: 13px;">Your OTP Code</p>
                            <p style="margin: 8px 0 0; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1F2937;">{otp_code}</p>
                        </div>
                        <p style="color: #9CA3AF; font-size: 12px;">This OTP expires in 10 minutes. If you did not request this, please ignore.</p>
                    </div>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Freeze OTP sent to {user_email}")
        except Exception as e:
            logger.error(f"Failed to send freeze OTP email: {e}")

    masked_email = user_email[:3] + "***" + user_email[user_email.index("@"):] if user_email and "@" in user_email else "your email"
    return {"message": f"OTP sent to {masked_email}", "expires_in": 600}


@router.post("/projects/{project_id}/work-orders/{work_order_id}/freeze/verify-otp")
async def wo_freeze_verify_otp(project_id: str, work_order_id: str, data: dict, user: User = Depends(get_current_user)):
    """Verify OTP for freeze authorization"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")

    otp_code = data.get("otp", "")
    if not otp_code:
        raise HTTPException(status_code=400, detail="OTP is required")

    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    record = await db.freeze_otps.find_one({
        "user_id": user.user_id,
        "work_order_id": work_order_id,
        "project_id": project_id,
        "otp_hash": otp_hash
    }, {"_id": 0})

    if not record:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        await db.freeze_otps.delete_many({"user_id": user.user_id, "work_order_id": work_order_id})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    return {"message": "OTP verified", "verified": True}


@router.post("/projects/{project_id}/work-orders/{work_order_id}/freeze/reassign")
async def wo_freeze_and_reassign(project_id: str, work_order_id: str, data: FreezeReassignRequest, user: User = Depends(get_current_user)):
    """Freeze current WO and create new WO with balance stages for new contractor"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Verify OTP again
    otp_hash = hashlib.sha256(data.otp.encode()).hexdigest()
    otp_record = await db.freeze_otps.find_one({
        "user_id": user.user_id,
        "work_order_id": work_order_id,
        "project_id": project_id,
        "otp_hash": otp_hash
    }, {"_id": 0})
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP. Please re-verify.")
    if datetime.fromisoformat(otp_record["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    # Get current work order
    wo = await db.project_work_orders.find_one(
        {"work_order_id": work_order_id, "project_id": project_id, "is_active": {"$ne": False}}, {"_id": 0}
    )
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if wo.get("status") == "frozen":
        raise HTTPException(status_code=400, detail="Work order is already frozen")

    # Get new contractor
    new_contractor = await db.contractors.find_one({"contractor_id": data.new_contractor_id}, {"_id": 0})
    if not new_contractor:
        raise HTTPException(status_code=404, detail="New contractor not found")

    now = datetime.now(timezone.utc).isoformat()

    # === FREEZE original work order ===
    await db.project_work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {
            "status": "frozen",
            "frozen_at": now,
            "frozen_by": user.user_id,
            "frozen_reason": data.notes or "Contractor replaced",
            "updated_at": now
        }}
    )

    # === CREATE new work order from balance data ===
    scope_total = sum((s.quantity or 0) * (s.unit_rate or 0) for s in data.scope_items)
    additional_total = sum((a.quantity or 0) * (a.unit_rate or 0) for a in data.additional_work)

    scope_items = [{"name": s.name, "unit": s.unit, "quantity": s.quantity, "unit_rate": s.unit_rate, "total": round(s.quantity * s.unit_rate, 2)} for s in data.scope_items]

    stages = []
    for st in data.stages:
        amt = st.value if st.type == "amount" else round(scope_total * st.value / 100, 2)
        stages.append({
            "stage_id": f"wos_{uuid.uuid4().hex[:6]}",
            "name": st.name, "type": st.type, "value": st.value, "amount": amt,
            "status": "pending",
            "requested_by": None, "requested_at": None,
            "pm_approved_by": None, "pm_approved_at": None,
            "planning_approved_by": None, "planning_approved_at": None,
            "accountant_approved_by": None, "accountant_approved_at": None,
            "approved_amount": None, "rejection_reason": None,
        })

    additional = [{"description": a.description, "unit": a.unit, "quantity": a.quantity, "unit_rate": a.unit_rate, "total": round(a.quantity * a.unit_rate, 2)} for a in data.additional_work]

    new_wo = {
        "work_order_id": f"wo_{uuid.uuid4().hex[:8]}",
        "project_id": project_id,
        "project_name": wo.get("project_name", ""),
        "contractor_id": data.new_contractor_id,
        "contractor_name": new_contractor.get("name", ""),
        "contractor_type": new_contractor.get("contractor_type", ""),
        "scope_items": scope_items,
        "scope_total": round(scope_total, 2),
        "stages": stages,
        "additional_work": additional,
        "additional_total": round(additional_total, 2),
        "total_value": round(scope_total + additional_total, 2),
        "paid_amount": 0,
        "notes": data.notes or "",
        "status": "active",
        "is_active": True,
        "reassigned_from": work_order_id,
        "reassigned_contractor": wo.get("contractor_name", ""),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.project_work_orders.insert_one(new_wo)
    new_wo.pop("_id", None)

    # Cleanup OTP
    await db.freeze_otps.delete_many({"user_id": user.user_id, "work_order_id": work_order_id})

    return {
        "message": "Work order frozen and reassigned successfully",
        "frozen_work_order_id": work_order_id,
        "new_work_order_id": new_wo["work_order_id"],
        "new_contractor": new_contractor.get("name", ""),
        "balance_stages": len(stages)
    }



# ==================== DAILY LABOUR REPORT (DLR) ====================

class DLREntry(BaseModel):
    type: str  # skilled, semi_skilled, unskilled
    count: int = 0
    day_value: float = 1.0  # 0.5, 1.0, 1.5
    rate_per_day: float = 0.0

class DLRCreate(BaseModel):
    date: str  # YYYY-MM-DD
    entries: List[DLREntry] = []
    notes: Optional[str] = ""
    stage_id: Optional[str] = None
    stage_name: Optional[str] = None
    work_summary: Optional[str] = ""

@router.post("/projects/{project_id}/work-orders/{wo_id}/dlr")
async def create_dlr(project_id: str, wo_id: str, data: DLRCreate, user: User = Depends(get_current_user)):
    """Site Engineer records daily labour attendance for a work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Only site engineers can record DLR")

    wo = await db.project_work_orders.find_one({"work_order_id": wo_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    # Check duplicate for same date + work order
    existing = await db.daily_labour_reports.find_one({
        "work_order_id": wo_id, "date": data.date
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"DLR already recorded for {data.date}. Delete the existing entry first.")

    now = datetime.now(timezone.utc).isoformat()
    entries = []
    total_workers = 0
    total_day_units = 0.0
    total_cost = 0.0

    for e in data.entries:
        if e.count <= 0:
            continue
        cost = round(e.count * e.day_value * e.rate_per_day, 2)
        day_units = round(e.count * e.day_value, 2)
        entries.append({
            "type": e.type,
            "count": e.count,
            "day_value": e.day_value,
            "rate_per_day": e.rate_per_day,
            "day_units": day_units,
            "total_cost": cost,
        })
        total_workers += e.count
        total_day_units += day_units
        total_cost += cost

    if not entries:
        raise HTTPException(status_code=400, detail="At least one entry with count > 0 is required")

    # Mandatory: Stage + Work Summary (DPR fields unified into DLR)
    stage_id = (data.stage_id or "").strip()
    stage_name = (data.stage_name or "").strip()
    work_summary = (data.work_summary or "").strip()
    if not stage_id or not stage_name:
        raise HTTPException(status_code=400, detail="Current Project Stage is required")
    if not work_summary:
        raise HTTPException(status_code=400, detail="Work Summary is required")

    # Verify the stage belongs to this project
    stage_doc = await db.project_stages.find_one(
        {"stage_id": stage_id, "project_id": project_id}, {"_id": 0, "stage_name": 1}
    )
    if not stage_doc:
        raise HTTPException(status_code=400, detail="Selected stage does not belong to this project")
    stage_name = stage_doc.get("stage_name") or stage_name

    dlr = {
        "dlr_id": f"dlr_{uuid.uuid4().hex[:8]}",
        "project_id": project_id,
        "work_order_id": wo_id,
        "contractor_id": wo.get("contractor_id", ""),
        "contractor_name": wo.get("contractor_name", ""),
        "date": data.date,
        "entries": entries,
        "total_workers": total_workers,
        "total_day_units": round(total_day_units, 2),
        "total_cost": round(total_cost, 2),
        "notes": data.notes or "",
        "stage_id": stage_id,
        "stage_name": stage_name,
        "work_summary": work_summary,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
    }
    await db.daily_labour_reports.insert_one(dlr)
    dlr.pop("_id", None)

    # Mirror to daily_progress (DPR) collection for unified reporting under Planning
    try:
        project_doc = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
        dpr_entry = {
            "progress_id": f"dp_{uuid.uuid4().hex[:12]}",
            "project_id": project_id,
            "project_name": project_doc.get("name") if project_doc else "",
            "site_engineer_id": user.user_id,
            "site_engineer_name": user.name,
            "date": data.date,
            "day": datetime.strptime(data.date, "%Y-%m-%d").strftime("%A") if data.date else "",
            "summary": work_summary,
            "current_stage": stage_name,
            "stage_id": stage_id,
            "source": "dlr",
            "dlr_id": dlr["dlr_id"],
            "work_order_id": wo_id,
            "created_at": now,
        }
        await db.daily_progress.insert_one(dpr_entry)
    except Exception as _e:
        # DPR mirror failure should not block DLR creation
        pass

    return dlr


@router.get("/projects/{project_id}/work-orders/{wo_id}/dlr")
async def get_wo_dlr(project_id: str, wo_id: str, date: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get DLR entries for a specific work order"""
    query = {"project_id": project_id, "work_order_id": wo_id}
    if date:
        query["date"] = date
    entries = await db.daily_labour_reports.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return entries


@router.delete("/projects/{project_id}/work-orders/{wo_id}/dlr/{dlr_id}")
async def delete_dlr(project_id: str, wo_id: str, dlr_id: str, user: User = Depends(get_current_user)):
    """Delete a DLR entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.daily_labour_reports.delete_one({"dlr_id": dlr_id, "project_id": project_id, "work_order_id": wo_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="DLR not found")
    # Remove mirrored DPR entry (if any)
    await db.daily_progress.delete_many({"dlr_id": dlr_id})
    return {"message": "DLR deleted"}


@router.get("/projects/{project_id}/dlr/summary")
async def get_project_dlr_summary(
    project_id: str,
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """Get DLR summary for entire project - grouped by contractor and date.

    Supports either a single `date` or a `date_from`/`date_to` range
    (used by the Site Engineer DLR & DPR filter).
    """
    query = {"project_id": project_id}
    if date:
        query["date"] = date
    elif date_from or date_to:
        rng: Dict[str, Any] = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        if rng:
            query["date"] = rng
    entries = await db.daily_labour_reports.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

    total_workers = sum(e.get("total_workers", 0) for e in entries)
    total_cost = sum(e.get("total_cost", 0) for e in entries)
    total_day_units = sum(e.get("total_day_units", 0) for e in entries)

    by_contractor = {}
    for e in entries:
        cname = e.get("contractor_name", "Unknown")
        if cname not in by_contractor:
            by_contractor[cname] = {"workers": 0, "cost": 0, "day_units": 0, "days": 0}
        by_contractor[cname]["workers"] += e.get("total_workers", 0)
        by_contractor[cname]["cost"] += e.get("total_cost", 0)
        by_contractor[cname]["day_units"] += e.get("total_day_units", 0)
        by_contractor[cname]["days"] += 1

    return {
        "project_id": project_id,
        "date_filter": date,
        "total_entries": len(entries),
        "total_workers": total_workers,
        "total_day_units": round(total_day_units, 2),
        "total_cost": round(total_cost, 2),
        "by_contractor": by_contractor,
        "entries": entries,
    }



# ==================== PAYMENT SCHEDULE TEMPLATES ====================

class PaymentTemplateRow(BaseModel):
    stage_name: str
    percentage: float = 0
    notes: Optional[str] = ""


class PaymentTemplateInput(BaseModel):
    template_name: str
    description: Optional[str] = ""
    rows: List[PaymentTemplateRow] = []


@router.get("/payment-schedule-templates")
async def list_payment_schedule_templates(user: User = Depends(get_current_user)):
    """List all saved Payment Schedule templates."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    docs = await db.payment_schedule_templates.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return docs


@router.post("/payment-schedule-templates")
async def create_payment_schedule_template(data: PaymentTemplateInput, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Super Admin / Planning can create templates")
    if not data.template_name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "template_id": f"pst_{uuid.uuid4().hex[:10]}",
        "template_name": data.template_name.strip(),
        "description": data.description or "",
        "rows": [r.model_dump() for r in data.rows],
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.payment_schedule_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/payment-schedule-templates/{template_id}")
async def update_payment_schedule_template(template_id: str, data: PaymentTemplateInput, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Super Admin / Planning can update templates")
    existing = await db.payment_schedule_templates.find_one({"template_id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.payment_schedule_templates.update_one(
        {"template_id": template_id},
        {"$set": {
            "template_name": data.template_name.strip(),
            "description": data.description or "",
            "rows": [r.model_dump() for r in data.rows],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"message": "Template updated", "template_id": template_id}


@router.delete("/payment-schedule-templates/{template_id}")
async def delete_payment_schedule_template(template_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Super Admin / Planning can delete templates")
    res = await db.payment_schedule_templates.delete_one({"template_id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


class ApplyTemplateInput(BaseModel):
    template_id: str
    mode: str = "append"  # "replace" or "append"


@router.post("/projects/{project_id}/apply-payment-template")
async def apply_payment_template_to_project(project_id: str, data: ApplyTemplateInput, user: User = Depends(get_current_user)):
    """Apply a saved Payment Schedule template to a project.
    mode='replace' deletes all existing pending payment_stages first.
    mode='append'  keeps existing rows and validates total ≤ 100%.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    tpl = await db.payment_schedule_templates.find_one({"template_id": data.template_id}, {"_id": 0})
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    rows = tpl.get("rows", [])
    if not rows:
        raise HTTPException(status_code=400, detail="Template has no rows")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "total_value": 1})
    total_value = (project.get("total_value", 0) or 0) if project else 0

    # Replace mode: delete all stages that have NOT been collected yet AND
    # are not the advance / sales-auto-collected row (so the Sales advance always
    # stays at the top of the schedule).
    if data.mode == "replace":
        await db.payment_stages.delete_many({
            "project_id": project_id,
            "$or": [
                {"status": {"$in": ["pending", "requested"]}},
                {"status": {"$exists": False}},
            ],
            "amount_received": {"$in": [0, None]},
            "is_advance": {"$ne": True},
            "linked_income_id": {"$in": [None, "", False]},
        })

    existing = await db.payment_stages.find({"project_id": project_id}, {"_id": 0, "percentage": 1}).to_list(500)
    existing_pct = sum(s.get("percentage", 0) or 0 for s in existing)
    new_pct = sum((r.get("percentage") or 0) for r in rows)
    if existing_pct + new_pct > 100.01:
        raise HTTPException(
            status_code=400,
            detail=f"Total would exceed 100% (existing {existing_pct}% + template {new_pct}%). Use 'Replace' mode or delete some existing rows first.",
        )

    created = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for r in rows:
        pct = float(r.get("percentage") or 0)
        amount = round((total_value * pct) / 100) if total_value > 0 and pct > 0 else 0
        stage_dict = {
            "stage_id": f"ps_{uuid.uuid4().hex[:10]}",
            "project_id": project_id,
            "stage_name": r.get("stage_name", ""),
            "percentage": pct,
            "amount": amount,
            "amount_received": 0,
            "status": "pending",
            "workflow_status": "approved",
            "notes": r.get("notes", ""),
            "is_advance": (r.get("stage_name", "") or "").lower().startswith("advance"),
            "created_by": user.user_id,
            "created_at": now_iso,
        }
        await db.payment_stages.insert_one(stage_dict)
        stage_dict.pop("_id", None)
        created.append(stage_dict)

    return {"message": f"Applied template '{tpl.get('template_name')}'", "created": len(created), "mode": data.mode}

# ==================== END PAYMENT SCHEDULE TEMPLATES ====================
