"""
Project Management Routes - CRUD, Search, Vendor Portal, Comprehensive View, Payment Schedule, Scope Items, Deductions, Bulk Operations, Work Order Assignments, Commitments, Notifications
Migrated from server.py monolith
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query
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
from bson import ObjectId

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()



@router.get("/projects")
async def get_projects(user: User = Depends(get_current_user)):
    # IDOR Fix: Role-based project filtering
    full_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PROCUREMENT, UserRole.CRE
    ]
    if user.role == UserRole.CLIENT:
        projects = await db.projects.find({"client_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    elif user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        projects = await db.projects.find(
            {"$or": [{"assigned_to": user.user_id}, {"team_members": user.user_id}]},
            {"_id": 0}
        ).to_list(1000)
    elif user.role in full_access_roles:
        projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    else:
        projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
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
    
    if user.role == UserRole.CLIENT and project_doc.get("client_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    if isinstance(project_doc.get("start_date"), str):
        project_doc["start_date"] = datetime.fromisoformat(project_doc["start_date"])
    if isinstance(project_doc.get("expected_completion"), str):
        project_doc["expected_completion"] = datetime.fromisoformat(project_doc["expected_completion"])
    if isinstance(project_doc.get("created_at"), str):
        project_doc["created_at"] = datetime.fromisoformat(project_doc["created_at"])
    
    return project_doc


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
            link=f"/approvals"
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
                     UserRole.PLANNING, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER, UserRole.CRE]
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
async def get_image(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "image/jpeg") if grid_out.metadata else "image/jpeg"
        return Response(content=contents, media_type=content_type)
    except Exception as e:
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
    
    # Get payment stages (schedule) - exclude internal notes
    payment_stages = await db.payment_stages.find(
        {"project_id": project_id}, 
        {"_id": 0, "internal_notes": 0}
    ).to_list(100)
    
    # Get scope items for client view
    scope_items = await db.scope_items.find(
        {"project_id": project_id, "workflow_status": {"$in": ["verified", "approved"]}}, 
        {"_id": 0, "internal_notes": 0}
    ).sort("sort_order", 1).to_list(500)
    
    stages = await db.site_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).sort("captured_at", -1).to_list(1000)
    
    documents = await db.documents.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    return {
        "project": project,
        "total_paid": total_paid,
        "balance": project.get("total_value", 0) - total_paid,
        "payment_stages": payment_stages,
        "scope_items": scope_items,
        "stages": stages,
        "photos": photos,
        "documents": documents
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
    contents = await file.read()
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
    contents = await file.read()
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
async def get_file(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        return Response(content=contents, media_type=content_type)
    except Exception as e:
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
            link=f"/work-orders"
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    await create_notification(client_user_id, f"You now have access to view your project in the Client Portal.")
    
    return {"message": "Client linked successfully"}


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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING]:
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
async def delete_project(project_id: str, user: User = Depends(get_current_user)):
    """Delete a project - Super Admin can delete any, Planning can delete 'In Planning' projects"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Super Admin or Planning can delete projects")
    
    # Get project to check status for Planning role
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Planning can only delete projects that are still in planning stage
    if user.role == UserRole.PLANNING:
        allowed_statuses = ["in_planning", "planning", "draft", "pending"]
        project_status = project.get("status", "").lower()
        project_stage = project.get("project_stage", "").lower()
        if project_status not in allowed_statuses and project_stage not in allowed_statuses:
            raise HTTPException(status_code=403, detail="Planning can only delete projects in planning/draft stage")
    
    # Delete related data
    await db.scope_items.delete_many({"project_id": project_id})
    await db.payment_stages.delete_many({"project_id": project_id})
    await db.additional_costs.delete_many({"project_id": project_id})
    await db.deductions.delete_many({"project_id": project_id})
    await db.projects.delete_one({"project_id": project_id})
    
    await create_audit_log(user.user_id, "delete", "project", project_id, {"deleted_by_role": user.role})
    return {"message": "Project and all related data deleted"}


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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


class AdditionalCostUpdate(BaseModel):
    description: Optional[str] = None
    estimated_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    income_received: Optional[float] = None
    status: Optional[str] = None


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
    
    # Get payment schedule stages
    payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
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
    stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if "due_date" in update_dict and update_dict["due_date"]:
        update_dict["due_date"] = datetime.fromisoformat(update_dict["due_date"]).isoformat()
    if "completed_date" in update_dict and update_dict["completed_date"]:
        update_dict["completed_date"] = datetime.fromisoformat(update_dict["completed_date"]).isoformat()
    
    await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "payment_stage", stage_id, update_dict)
    return {"message": "Payment stage updated"}


@router.delete("/payment-stages/{stage_id}")
async def delete_payment_stage(stage_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.payment_stages.delete_one({"stage_id": stage_id})
    await create_audit_log(user.user_id, "delete", "payment_stage", stage_id, {})
    return {"message": "Payment stage deleted"}


@router.patch("/payment-stages/{stage_id}/request")
async def request_payment(stage_id: str, user: User = Depends(get_current_user)):
    """Planning/PM requests payment from CRE - updates workflow_status to 'requested'"""
    if user.role not in [UserRole.PLANNING, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can request payments")
    
    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    
    project = await db.projects.find_one({"project_id": stage["project_id"]}, {"_id": 0})
    
    # Update workflow status to requested
    await db.payment_stages.update_one(
        {"stage_id": stage_id},
        {"$set": {
            "workflow_status": "requested",
            "requested_by": user.user_id,
            "requested_by_name": user.name,
            "requested_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
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
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
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
    
    # Advance payment details (from project)
    advance_amount = project.get("advance_amount", 0) or 0
    advance_payment = {
        "amount": advance_amount,
        "date": project.get("advance_date"),
        "mode": project.get("advance_payment_mode"),
        "status": "received" if advance_amount > 0 else "pending"
    }
    
    # Calculate totals - include advance payment in total_received
    total_scheduled = sum(s.get("amount", 0) for s in payment_stages)
    stages_received = sum(s.get("amount_received", 0) for s in payment_stages)
    
    # Total received includes advance payment + stages received
    total_received = advance_amount + stages_received
    
    # Project value from scopes
    project_value = project.get("total_value", 0) or 0
    scope_total = project.get("scope_total", 0) or 0
    additional_cost = project.get("additional_cost", 0) or 0
    
    # Total project value = scope total + additional cost (if any)
    total_project_value = scope_total + additional_cost if scope_total > 0 else project_value
    
    # Balance = Total Project Value - Total Received
    total_balance = total_project_value - total_received
    
    # Count stages by status
    stages_paid = len([s for s in payment_stages if s.get("status") == "paid"])
    stages_partial = len([s for s in payment_stages if s.get("status") == "partial"])
    stages_pending = len([s for s in payment_stages if s.get("status") == "pending"])
    
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "project_value": total_project_value,
        "scope_total": scope_total,
        "additional_cost": additional_cost,
        "advance_payment": advance_payment,
        "payment_stages": payment_stages,
        "income_records": income_records,
        "summary": {
            "total_scheduled": total_scheduled,
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
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.ACCOUNTANT]:
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
        estimated_amount=cost_input.estimated_amount
    )
    
    cost_dict = cost.model_dump()
    cost_dict["created_at"] = cost_dict["created_at"].isoformat()
    
    await db.additional_costs.insert_one(cost_dict)
    await create_audit_log(user.user_id, "create", "additional_cost", cost.cost_id, {"description": cost.description})
    return cost


@router.patch("/additional-costs/{cost_id}")
async def update_additional_cost(cost_id: str, update_data: AdditionalCostUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "additional_cost", cost_id, update_dict)
    return {"message": "Additional cost updated"}


@router.delete("/additional-costs/{cost_id}")
async def delete_additional_cost(cost_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.additional_costs.delete_one({"cost_id": cost_id})
    await create_audit_log(user.user_id, "delete", "additional_cost", cost_id, {})
    return {"message": "Additional cost deleted"}


@router.patch("/additional-costs/{cost_id}/request-payment")
async def request_additional_payment(cost_id: str, user: User = Depends(get_current_user)):
    """Request payment for additional work - notifies CRE"""
    if user.role not in [UserRole.PLANNING, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning/PM can request payments")
    
    cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Additional cost not found")
    
    project = await db.projects.find_one({"project_id": cost["project_id"]}, {"_id": 0})
    
    balance = (cost.get("estimated_amount", 0) or cost.get("actual_amount", 0)) - (cost.get("income_received", 0) or 0)
    
    await db.additional_costs.update_one(
        {"cost_id": cost_id},
        {"$set": {
            "payment_requested": True,
            "payment_requested_by": user.user_id,
            "payment_requested_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify CRE users
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0, "user_id": 1}).to_list(10)
    for cre in cre_users:
        await create_notification(
            cre["user_id"],
            f"Additional Payment Request: ₹{balance:,.0f} for {project.get('name', 'Project')} - {cost.get('description', 'Additional Work')}"
        )
    
    await create_audit_log(user.user_id, "request_payment", "additional_cost", cost_id, {"amount": balance})
    return {"message": "Payment request sent to CRE", "cost_id": cost_id}



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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.scope_items.delete_one({"scope_id": scope_id})
    await create_audit_log(user.user_id, "delete", "scope_item", scope_id, {})
    return {"message": "Scope item deleted"}



@router.post("/scope-items/reorder")
async def reorder_scope_items(request: Request, user: User = Depends(get_current_user)):
    """Reorder scope items by updating their sort_order field"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    body = await request.json()
    ordered_ids = body.get("deduction_ids", [])
    if not ordered_ids:
        raise HTTPException(status_code=400, detail="deduction_ids required")
    updates = [db.deductions.update_one({"deduction_id": did}, {"$set": {"sort_order": i}}) for i, did in enumerate(ordered_ids)]
    await asyncio.gather(*updates)
    return {"message": "Deductions reordered"}



# ==================== DEDUCTION ITEMS CRUD ====================

class DeductionCreate(BaseModel):
    project_id: str
    description: str
    amount: float
    remarks: Optional[str] = None


class DeductionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/projects/{project_id}/deductions")
async def get_deductions(project_id: str, user: User = Depends(get_current_user)):
    deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for d in deductions:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return deductions


@router.post("/deductions")
async def create_deduction(deduction_input: DeductionCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    deduction = DeductionItem(
        project_id=deduction_input.project_id,
        description=deduction_input.description,
        amount=deduction_input.amount,
        remarks=deduction_input.remarks
    )
    
    deduction_dict = deduction.model_dump()
    deduction_dict["created_at"] = deduction_dict["created_at"].isoformat()
    
    await db.deductions.insert_one(deduction_dict)
    await create_audit_log(user.user_id, "create", "deduction", deduction.deduction_id, {"description": deduction.description})
    return deduction


@router.patch("/deductions/{deduction_id}")
async def update_deduction(deduction_id: str, update_data: DeductionUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.deductions.update_one({"deduction_id": deduction_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "deduction", deduction_id, update_dict)
    return {"message": "Deduction updated"}


@router.delete("/deductions/{deduction_id}")
async def delete_deduction(deduction_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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


class BulkPaymentCreate(BaseModel):
    project_id: str
    items: List[BulkPaymentStageInput]


class BulkAdditionInput(BaseModel):
    description: str
    estimated_amount: float


class BulkAdditionCreate(BaseModel):
    project_id: str
    items: List[BulkAdditionInput]


class BulkDeductionInput(BaseModel):
    description: str
    amount: float
    remarks: Optional[str] = None


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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    created_items = []
    for item in data.items:
        if not item.description or not item.estimated_amount:
            continue  # Skip empty rows
        
        addition = AdditionalCostItem(
            project_id=data.project_id,
            description=item.description,
            estimated_amount=item.estimated_amount,
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PLANNING]:
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
    status: str = "yet_to_start"  # yet_to_start, started, finished
    remarks: Optional[str] = None
    order: Optional[int] = None

class ProjectStageUpdate(BaseModel):
    stage_name: Optional[str] = None
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    order: Optional[int] = None

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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
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
        "status": data.status,
        "remarks": data.remarks,
        "order": data.order if data.order is not None else count + 1,
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
            "status": s.status or "yet_to_start",
            "remarks": s.remarks,
            "order": existing + i + 1,
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
    
    updates["updated_by"] = user.user_id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.project_stages.update_one(
        {"stage_id": stage_id, "project_id": project_id},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stage not found")
    return {"message": "Stage updated"}

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
    roles = ["architect", "project_manager", "sr_site_engineer", "site_engineer", "cre", "qc", "procurement"]
    
    for role in roles:
        user_id = team_data.get(role)
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
    """Assign team members to a project by role"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning/Admin can assign team")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    body = await request.json()
    valid_roles = ["architect", "project_manager", "sr_site_engineer", "site_engineer", "cre", "qc", "procurement"]
    
    team = project.get("team", {})
    for role in valid_roles:
        if role in body:
            team[role] = body[role] if body[role] else None

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"team": team, "updated_at": datetime.now(timezone.utc).isoformat()}}
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
    
class WorkOrderAdditionalItem(BaseModel):
    description: str
    unit: str = "nos"
    quantity: float = 1
    unit_rate: float = 0

class WorkOrderCreate(BaseModel):
    contractor_id: str
    contractor_name: Optional[str] = None
    contractor_type: Optional[str] = None
    scope_items: List[WorkOrderScopeItem] = []
    stages: List[WorkOrderStage] = []
    additional_work: List[WorkOrderAdditionalItem] = []
    notes: Optional[str] = ""

@router.get("/projects/{project_id}/work-orders")
async def get_work_orders(project_id: str, user: User = Depends(get_current_user)):
    """Get all work orders for a project"""
    orders = await db.work_orders.find({"project_id": project_id, "is_active": {"$ne": False}}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders

@router.get("/projects/{project_id}/work-orders/{work_order_id}")
async def get_work_order(project_id: str, work_order_id: str, user: User = Depends(get_current_user)):
    """Get a single work order"""
    wo = await db.work_orders.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo

@router.post("/projects/{project_id}/work-orders")
async def create_work_order(project_id: str, data: WorkOrderCreate, user: User = Depends(get_current_user)):
    """Create a new work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "project_id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Lookup contractor
    contractor = await db.contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0})
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    
    # Calculate totals
    scope_total = sum((s.quantity or 0) * (s.unit_rate or 0) for s in data.scope_items)
    additional_total = sum((a.quantity or 0) * (a.unit_rate or 0) for a in data.additional_work)
    
    scope_items = []
    for s in data.scope_items:
        scope_items.append({
            "name": s.name, "unit": s.unit, "quantity": s.quantity,
            "unit_rate": s.unit_rate, "total": round(s.quantity * s.unit_rate, 2)
        })
    
    stages = []
    for st in data.stages:
        amt = st.value if st.type == "amount" else round(scope_total * st.value / 100, 2)
        stages.append({"name": st.name, "type": st.type, "value": st.value, "amount": amt, "status": "pending"})
    
    additional = []
    for a in data.additional_work:
        additional.append({
            "description": a.description, "unit": a.unit, "quantity": a.quantity,
            "unit_rate": a.unit_rate, "total": round(a.quantity * a.unit_rate, 2)
        })
    
    wo = {
        "work_order_id": f"wo_{uuid.uuid4().hex[:8]}",
        "project_id": project_id,
        "project_name": project.get("name", ""),
        "contractor_id": data.contractor_id,
        "contractor_name": contractor.get("name", data.contractor_name or ""),
        "contractor_type": contractor.get("contractor_type", data.contractor_type or ""),
        "scope_items": scope_items,
        "scope_total": round(scope_total, 2),
        "stages": stages,
        "additional_work": additional,
        "additional_total": round(additional_total, 2),
        "total_value": round(scope_total + additional_total, 2),
        "notes": data.notes or "",
        "status": "active",
        "is_active": True,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.work_orders.insert_one(wo)
    wo.pop("_id", None)
    return {"work_order_id": wo["work_order_id"], "message": "Work order created", "total_value": wo["total_value"]}

@router.patch("/projects/{project_id}/work-orders/{work_order_id}")
async def update_work_order(project_id: str, work_order_id: str, data: WorkOrderCreate, user: User = Depends(get_current_user)):
    """Update a work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    scope_total = sum((s.quantity or 0) * (s.unit_rate or 0) for s in data.scope_items)
    additional_total = sum((a.quantity or 0) * (a.unit_rate or 0) for a in data.additional_work)
    
    scope_items = [{"name": s.name, "unit": s.unit, "quantity": s.quantity, "unit_rate": s.unit_rate, "total": round(s.quantity * s.unit_rate, 2)} for s in data.scope_items]
    stages = []
    for st in data.stages:
        amt = st.value if st.type == "amount" else round(scope_total * st.value / 100, 2)
        stages.append({"name": st.name, "type": st.type, "value": st.value, "amount": amt, "status": "pending"})
    additional = [{"description": a.description, "unit": a.unit, "quantity": a.quantity, "unit_rate": a.unit_rate, "total": round(a.quantity * a.unit_rate, 2)} for a in data.additional_work]
    
    # Lookup contractor name
    contractor = await db.contractors.find_one({"contractor_id": data.contractor_id}, {"_id": 0, "name": 1, "contractor_type": 1})
    
    update = {
        "contractor_id": data.contractor_id,
        "contractor_name": contractor.get("name", "") if contractor else data.contractor_name or "",
        "contractor_type": contractor.get("contractor_type", "") if contractor else data.contractor_type or "",
        "scope_items": scope_items, "scope_total": round(scope_total, 2),
        "stages": stages,
        "additional_work": additional, "additional_total": round(additional_total, 2),
        "total_value": round(scope_total + additional_total, 2),
        "notes": data.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.work_orders.update_one({"work_order_id": work_order_id, "project_id": project_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order updated"}

@router.delete("/projects/{project_id}/work-orders/{work_order_id}")
async def delete_work_order(project_id: str, work_order_id: str, user: User = Depends(get_current_user)):
    """Soft delete a work order"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.work_orders.update_one(
        {"work_order_id": work_order_id, "project_id": project_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Work order not found")
    return {"message": "Work order deleted"}

@router.get("/contractor-types")
async def get_contractor_types(user: User = Depends(get_current_user)):
    """Get distinct contractor types"""
    types = await db.contractors.distinct("contractor_type", {"is_active": {"$ne": False}})
    return [t for t in types if t]
