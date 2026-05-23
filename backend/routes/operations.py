"""
Operations Routes - CRE Board, Planning, Construction Stages, Approvals, Project Materials, Accounts Board, Work Orders, Accountant Board, HR, Payroll, Financial Control
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
import secrets
from bson import ObjectId

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from core.contact_visibility import strip_contact_fields, PRIVILEGED_ROLES, filter_contacts_leads
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== CRE BOARD ENDPOINTS ====================

class CREProjectCreateInput(BaseModel):
    name: str
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    location: str
    sqft: float
    building_type: str
    expected_start_date: str
    package_id: str
    # Advance payment fields
    advance_date: Optional[str] = None
    advance_amount: Optional[float] = 0
    advance_payment_mode: Optional[str] = None
    rough_estimate_url: Optional[str] = None
    cheque_details: Optional[list] = None  # [{cheque_number, bank_name, amount}]


# Project stages definition for display
PROJECT_STAGES = [
    {"id": "drawing", "name": "Drawing Stage", "order": 1},
    {"id": "yet_to_start", "name": "Yet to Start", "order": 2},
    {"id": "foundation", "name": "Foundation", "order": 3},
    {"id": "basement", "name": "Basement", "order": 4},
    {"id": "brick_work", "name": "SS - Brick Work", "order": 5},
    {"id": "plastering", "name": "SS - Plastering", "order": 6},
    {"id": "finishing", "name": "Finishing", "order": 7},
    {"id": "handover", "name": "Handover", "order": 8}
]


async def generate_project_code():
    """Generate project code in format USB-H0001 (USB-H + sequential 4-digit number)"""
    # Find the highest existing sequence number
    latest = await db.projects.find(
        {"project_code": {"$regex": r"^USB-H\d+$"}},
        {"_id": 0, "project_code": 1}
    ).sort("project_code", -1).limit(1).to_list(1)
    
    if latest:
        try:
            last_num = int(latest[0]["project_code"].replace("USB-H", ""))
        except (ValueError, KeyError):
            last_num = 0
    else:
        # Count all projects to set starting point
        last_num = await db.projects.count_documents({})
    
    return f"USB-H{str(last_num + 1).zfill(4)}"


@router.get("/cre/dashboard")
async def get_cro_dashboard(user: User = Depends(get_current_user)):
    """Get CRE dashboard data"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    import asyncio
    base_query = {}
    # CRE sees all projects (they manage customer relationships for all)
    
    # Run all DB queries in parallel
    (
        draft_count, pending_payment_count, payment_received_count,
        in_planning_count, approved_count, total_ongoing,
        total_value_agg, recent_projects, packages, payments_to_collect,
        *stage_count_results
    ) = await asyncio.gather(
        db.projects.count_documents({**base_query, "status": "draft"}),
        db.projects.count_documents({**base_query, "status": "pending_payment"}),
        db.projects.count_documents({**base_query, "status": {"$in": ["payment_received", "payment_verified"]}}),
        db.projects.count_documents({**base_query, "status": {"$in": ["in_planning", "planning", "planning_review"]}}),
        db.projects.count_documents({**base_query, "status": {"$in": ["planning_approved", "active", "gm_approved"]}}),
        db.projects.count_documents({**base_query, "status": {"$nin": ["draft", "pending_payment", "completed", "cancelled"]}}),
        db.projects.aggregate([{"$match": base_query}, {"$group": {"_id": None, "total": {"$sum": "$total_value"}}}]).to_list(1),
        db.projects.find(base_query, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20),
        db.packages.find({"is_active": True}, {"_id": 0, "package_id": 1, "name": 1, "code": 1, "base_rate_per_sqft": 1, "description": 1}).to_list(10),
        db.projects.find({**base_query, "payments_to_collect": {"$exists": True, "$ne": []}}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "payments_to_collect": 1}).to_list(50),
        *[db.projects.count_documents({**base_query, "current_stage": stage["id"], "status": {"$nin": ["draft", "pending_payment", "completed", "cancelled"]}}) for stage in PROJECT_STAGES]
    )
    
    total_project_value = total_value_agg[0]["total"] if total_value_agg else 0
    stage_counts = {stage["id"]: count for stage, count in zip(PROJECT_STAGES, stage_count_results)}
    
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


@router.get("/cre/new-deals")
async def get_cre_new_deals(user: User = Depends(get_current_user)):
    """[DEPRECATED] CRE 'New Deals' tab now reads from pendingApprovals.advance_verified
    (projects auto-arrived from accountant approval). This endpoint is kept for
    backward compatibility but returns an empty list.
    """
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    return []


class PaymentEntry(BaseModel):
    """Individual payment entry within a multi-mode collection"""
    amount: float
    payment_mode: str  # cash, cheque, bank_transfer, upi, card
    reference: Optional[str] = None
    cheque_details: Optional[list] = None  # [{cheque_number, bank_name, amount, cheque_date}]


class ConvertDealInput(BaseModel):
    # Project details (editable by CRE)
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: Optional[str] = "residential"
    expected_start_date: Optional[str] = None
    package_id: Optional[str] = None
    # Advance payment details
    advance_amount: float
    payment_mode: Optional[str] = None  # Legacy single mode
    payment_reference: Optional[str] = ""
    accountant_confirmed: bool = False
    # Cheque details (for cheque payments) - legacy
    cheque_details: Optional[list] = None
    # Multi-mode payment entries
    payment_entries: Optional[list] = None  # [{amount, payment_mode, reference, cheque_details}]


@router.post("/cre/convert-deal/{lead_id}")
async def convert_deal_to_project(
    lead_id: str,
    data: ConvertDealInput,
    user: User = Depends(get_current_user)
):
    """Convert a closed deal to a project with advance collection"""
    if user.role not in [UserRole.CRE, UserRole.SALES, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE or Sales can convert deals")
    
    if not data.accountant_confirmed:
        raise HTTPException(status_code=400, detail="Accountant confirmation required")
    
    # Get the lead - use 'leads' collection
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check if already converted
    if lead.get("project_created"):
        raise HTTPException(status_code=400, detail="Deal already converted to project")
    
    # Also check if a project already exists for this lead
    existing_project = await db.projects.find_one({"lead_id": lead_id}, {"_id": 0, "project_id": 1, "name": 1})
    if existing_project:
        # Auto-fix the lead flag if it wasn't set
        await db.leads.update_one({"lead_id": lead_id}, {"$set": {"project_created": True, "project_id": existing_project["project_id"]}})
        raise HTTPException(status_code=400, detail=f"A project already exists for this lead: {existing_project.get('name', existing_project['project_id'])}")
    
    # Check if a project exists for the linked RE project
    if lead.get("re_project_id"):
        existing_re_project = await db.projects.find_one({"re_project_id": lead["re_project_id"]})
        if existing_re_project:
            raise HTTPException(status_code=400, detail="A project already exists for the linked RE Project")
    
    now = datetime.now(timezone.utc)
    
    # Get RE project details if available
    re_project = None
    if lead.get("re_project_id"):
        re_project = await db.re_projects.find_one({"re_project_id": lead["re_project_id"]})
    
    # Calculate expected completion (default 12 months)
    handover_months = (re_project.get("handover_months") if re_project else None) or 12
    expected_completion = now + timedelta(days=handover_months * 30)
    
    # Generate project ID
    project_count = await db.projects.count_documents({})
    project_id = f"proj_{secrets.token_hex(6)}"
    project_code = await generate_project_code()
    
    # Create the main project with CRE-edited details
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
        # Client details (editable by CRE)
        "client_name": client_name,
        "client_email": client_email,
        "client_phone": client_phone,
        "location": location,
        "sqft": sqft,
        "building_type": building_type,
        # Financial
        "total_value": total_value,
        "advance_amount": data.advance_amount,
        "advance_payment_entries": data.payment_entries or [{"amount": data.advance_amount, "payment_mode": data.payment_mode or "cash", "reference": data.payment_reference or ""}],
        "advance_payment_mode": data.payment_mode or (data.payment_entries[0]["payment_mode"] if data.payment_entries else "cash"),
        "advance_payment_reference": data.payment_reference,
        "advance_received_at": now,
        "advance_collected_by": user.user_id,
        "additional_cost": 0,
        "income_project": data.advance_amount,  # Record advance as income
        "income_additional": 0,
        "total_expense": 0,
        # Stage - Not yet started construction
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        # Dates
        "start_date": now,
        "expected_completion": expected_completion,
        # Status - Set to 'pending_payment' for accountant verification
        # Flow: pending_payment → payment_received → in_planning → drawing
        "status": "pending_payment",
        "accountant_verified": False,
        # Planning board visibility
        "planning_status": "pending_planning",  # CRE moves to "new" after accountant verifies
        "pending_planning_date": now.isoformat(),
        # Links
        "re_project_id": lead.get("re_project_id"),
        "lead_id": lead_id,
        # Package if selected
        "package_id": data.package_id,
        # Workflow
        "created_by": user.user_id,
        "created_at": now,
        "converted_by_cre": user.user_id,
        "converted_at": now
    }
    
    await db.projects.insert_one(main_project)
    
    # Process payment entries (multi-mode) or legacy single mode
    payment_entries = data.payment_entries or []
    if not payment_entries and data.payment_mode:
        payment_entries = [{"amount": data.advance_amount, "payment_mode": data.payment_mode, "reference": data.payment_reference or "", "cheque_details": data.cheque_details}]
    
    for entry in payment_entries:
        entry_mode = entry.get("payment_mode", "cash")
        entry_amount = float(entry.get("amount", 0))
        entry_ref = entry.get("reference", "")
        entry_cheques = entry.get("cheque_details")
        # Per-entry payment date — defaults to today if absent
        entry_pdate = entry.get("payment_date") or now.date().isoformat()
        # Normalise to ISO datetime for storage; accept YYYY-MM-DD from frontend
        try:
            if len(entry_pdate) == 10:
                entry_pdate_iso = f"{entry_pdate}T00:00:00+00:00"
            else:
                entry_pdate_iso = entry_pdate
        except Exception:
            entry_pdate_iso = now.isoformat()

        # Create income record first so we can link cheques to it
        income_id = f"inc_{secrets.token_hex(6)}"
        if entry_amount > 0:
            income_record = {
                "income_id": income_id,
                "project_id": project_id,
                "project_name": project_name,
                "category": "advance_payment",
                "sub_category": f"Advance - {entry_mode.replace('_', ' ').title()}",
                "amount": entry_amount,
                "payment_mode": entry_mode,
                "payment_reference": entry_ref,
                "payment_date": entry_pdate_iso,
                "stage": "Advance Payment",
                "description": f"Advance payment ({entry_mode.replace('_', ' ')}) from deal conversion - {client_name}",
                "remarks": f"Deal closed by CRE. Client: {client_name}",
                "collected_by": user.user_id,
                "collected_by_name": user.name,
                "status": "pending_approval",
                "source": "approval",
                "created_at": now.isoformat()
            }
            await db.income.insert_one(income_record)
        
        # Auto-create cheque records linked to the income record
        if entry_mode == "cheque" and entry_cheques:
            for chq in entry_cheques:
                cheque_record = {
                    "cheque_id": f"chq_{secrets.token_hex(6)}",
                    "income_id": income_id,
                    "cheque_number": chq.get("cheque_number", ""),
                    "bank_name": chq.get("bank_name", ""),
                    "branch_name": chq.get("branch_name", ""),
                    "amount": float(chq.get("amount", 0)),
                    "cheque_date": chq.get("cheque_date", entry_pdate_iso),
                    "cheque_type": "incoming",
                    "party_name": client_name,
                    "party_type": "client",
                    "project_id": project_id,
                    "project_name": project_name,
                    "status": "issued",
                    "is_post_dated": chq.get("is_post_dated", False),
                    "remarks": f"Advance cheque for project {project_name}",
                    "created_by": user.user_id,
                    "created_at": now.isoformat(),
                }
                await db.cheques.insert_one(cheque_record)
    
    # Update lead - use 'leads' collection
    # Move lead to "Accountant Approval" stage automatically
    accountant_stage = await db.lead_stages.find_one({"stage_id": "stg_accountant_approval"}, {"_id": 0})
    target_stage_id = accountant_stage["stage_id"] if accountant_stage else "stg_accountant_approval"
    
    lead_stage_history = lead.get("stage_history", [])
    lead_stage_history.append({
        "stage_id": target_stage_id,
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "action": "auto_after_advance_collected"
    })
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "project_created": True,
            "project_id": project_id,
            "converted_at": now,
            "converted_by": user.user_id,
            "current_stage_id": target_stage_id,
            "stage_history": lead_stage_history,
            "onboarding_status": "accountant_pending",
            "advance_payment": {
                "advance_amount": data.advance_amount,
                "payment_entries": data.payment_entries or [{"amount": data.advance_amount, "payment_mode": data.payment_mode or "cash", "reference": data.payment_reference or ""}],
                "collected_by": user.user_id,
                "collected_at": now.isoformat(),
            },
            "updated_at": now
        }}
    )
    
    # Notify accountants about pending verification
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_accountant",
        "title": "Advance Payment Verification",
        "message": f"Advance payment for '{project_name}' needs verification. Amount: ₹{data.advance_amount:,.0f}",
        "type": "advance_verification",
        "reference_id": lead_id,
        "is_read": False,
        "created_at": now
    }
    await db.notifications.insert_one(notification)
    
    # Update RE Project if exists
    if lead.get("re_project_id"):
        await db.re_projects.update_one(
            {"re_project_id": lead["re_project_id"]},
            {"$set": {
                "status": "converted",
                "converted_project_id": project_id,
                "converted_at": now,
                "converted_by": user.user_id,
                "advance_collected": data.advance_amount
            }}
        )
    
    return {
        "success": True,
        "project_id": project_id,
        "message": "Deal converted to project successfully",
        "advance_collected": data.advance_amount,
        "status": "pending_payment"  # Waiting for accountant verification
    }


@router.post("/cre/convert-re-project/{re_project_id}")
async def convert_re_project_to_project(
    re_project_id: str,
    data: ConvertDealInput,
    user: User = Depends(get_current_user)
):
    """Convert a GM-approved RE project directly to a project (without sales lead)"""
    if user.role not in [UserRole.CRE, UserRole.SALES, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE or Sales can convert RE projects")
    
    if not data.accountant_confirmed:
        raise HTTPException(status_code=400, detail="Accountant confirmation required")
    
    # Get the RE project
    re_project = await db.re_projects.find_one({"re_project_id": re_project_id})
    if not re_project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    # Check if RE is approved — allow client_approved + re_approved + deal_closed
    if re_project.get("status") not in ["re_approved", "deal_closed", "client_approved", "re_in_progress", "re_submitted"]:
        raise HTTPException(status_code=400, detail="RE Project not in a dealable state")
    
    # Check if already converted (check both RE project flag and existing project records)
    if re_project.get("converted_to_project") or re_project.get("status") == "converted":
        raise HTTPException(status_code=400, detail="RE Project already converted to a project")
    
    existing_project = await db.projects.find_one({"re_project_id": re_project_id})
    if existing_project:
        raise HTTPException(status_code=400, detail="A project already exists for this RE Project")
    
    now = datetime.now(timezone.utc)
    
    # Calculate expected completion
    handover_months = re_project.get("handover_months") or 12
    expected_completion = now + timedelta(days=handover_months * 30)
    
    # Generate project ID
    project_id = f"proj_{secrets.token_hex(6)}"
    project_code = await generate_project_code()
    
    # Create the main project with CRE-edited details
    project_name = data.project_name or re_project.get("project_name") or f"RE - {re_project.get('client_name', 'Project')}"
    client_name = data.client_name or re_project.get("client_name")
    client_phone = data.client_phone or re_project.get("client_phone")
    client_email = data.client_email or re_project.get("client_email")
    location = data.location or re_project.get("location", "")
    sqft = data.sqft or re_project.get("sqft") or re_project.get("area_sqft") or 0
    building_type = data.building_type or re_project.get("building_type") or "residential"
    total_value = re_project.get("estimated_total", 0)
    
    main_project = {
        "project_id": project_id,
        "project_code": project_code,
        "name": project_name,
        # Client details (editable by CRE)
        "client_name": client_name,
        "client_email": client_email,
        "client_phone": client_phone,
        "location": location,
        "sqft": sqft,
        "building_type": building_type,
        # Financial
        "total_value": total_value,
        "advance_amount": data.advance_amount,
        "advance_payment_entries": data.payment_entries or [{"amount": data.advance_amount, "payment_mode": data.payment_mode or "cash", "reference": data.payment_reference or ""}],
        "advance_payment_mode": data.payment_mode or (data.payment_entries[0]["payment_mode"] if data.payment_entries else "cash"),
        "advance_payment_reference": data.payment_reference,
        "advance_received_at": now,
        "advance_collected_by": user.user_id,
        "additional_cost": 0,
        "income_project": data.advance_amount,
        "income_additional": 0,
        "total_expense": 0,
        # Stage - Not yet started construction
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        # Dates
        "start_date": now,
        "expected_completion": expected_completion,
        # Status - Set to 'pending_payment' for accountant verification
        "status": "pending_payment",
        "accountant_verified": False,
        # Planning board visibility
        "planning_status": "pending_planning",  # CRE moves to "new" after accountant verifies
        "pending_planning_date": now.isoformat(),
        # Links
        "re_project_id": re_project_id,
        "lead_id": re_project.get("lead_id"),
        # Package if selected
        "package_id": data.package_id or re_project.get("package_id"),
        # Workflow
        "created_by": user.user_id,
        "created_at": now,
        "converted_by_cre": user.user_id,
        "converted_at": now
    }
    
    await db.projects.insert_one(main_project)
    
    # Update RE Project
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "status": "converted",
            "converted_to_project": True,
            "converted_project_id": project_id,
            "converted_at": now,
            "converted_by": user.user_id,
            "advance_collected": data.advance_amount
        }}
    )
    
    # Update linked lead if exists - auto-move to Accountant Approval
    if re_project.get("lead_id"):
        lead = await db.leads.find_one({"lead_id": re_project["lead_id"]})
        lead_stage_history = (lead.get("stage_history", []) if lead else [])
        lead_stage_history.append({
            "stage_id": "stg_accountant_approval",
            "from_stage_id": lead.get("current_stage_id") if lead else None,
            "moved_at": now.isoformat(),
            "moved_by": user.user_id,
            "action": "auto_after_advance_collected"
        })
        await db.leads.update_one(
            {"lead_id": re_project["lead_id"]},
            {"$set": {
                "project_created": True,
                "project_id": project_id,
                "converted_at": now,
                "converted_by": user.user_id,
                "current_stage_id": "stg_accountant_approval",
                "stage_history": lead_stage_history,
                "onboarding_status": "accountant_pending",
                "advance_payment": {
                    "advance_amount": data.advance_amount,
                    "payment_entries": data.payment_entries or [{"amount": data.advance_amount, "payment_mode": data.payment_mode or "cash", "reference": data.payment_reference or ""}],
                    "collected_by": user.user_id,
                    "collected_at": now.isoformat(),
                },
                "updated_at": now
            }}
        )
    
    # Notify accountants
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_accountant",
        "title": "Advance Payment Verification",
        "message": f"Advance payment for '{project_name}' needs verification. Amount: ₹{data.advance_amount:,.0f}",
        "type": "advance_verification",
        "reference_id": re_project.get("lead_id") or re_project_id,
        "is_read": False,
        "created_at": now
    }
    await db.notifications.insert_one(notification)
    
    # Process payment entries (multi-mode) or legacy single mode
    payment_entries = data.payment_entries or []
    if not payment_entries and data.payment_mode:
        payment_entries = [{"amount": data.advance_amount, "payment_mode": data.payment_mode, "reference": data.payment_reference or "", "cheque_details": data.cheque_details}]
    
    for entry in payment_entries:
        entry_mode = entry.get("payment_mode", "cash")
        entry_amount = float(entry.get("amount", 0))
        entry_ref = entry.get("reference", "")
        entry_cheques = entry.get("cheque_details")
        entry_pdate = entry.get("payment_date") or now.date().isoformat()
        try:
            entry_pdate_iso = f"{entry_pdate}T00:00:00+00:00" if len(entry_pdate) == 10 else entry_pdate
        except Exception:
            entry_pdate_iso = now.isoformat()

        # Create income record first so we can link cheques to it
        income_id = f"inc_{secrets.token_hex(6)}"
        if entry_amount > 0:
            income_record = {
                "income_id": income_id,
                "project_id": project_id,
                "project_name": project_name,
                # Persist the originating lead so the income-reject endpoint
                # can bounce the lead back to Deal Close + set the red
                # rejection banner. Without this link the income reject was
                # invisible to the Sales user.
                "lead_id": re_project.get("lead_id"),
                "re_project_id": re_project_id,
                "category": "advance_payment",
                "sub_category": f"Advance - {entry_mode.replace('_', ' ').title()}",
                "amount": entry_amount,
                "payment_mode": entry_mode,
                "payment_reference": entry_ref,
                "payment_date": entry_pdate_iso,
                "stage": "Advance Payment",
                "description": f"RE advance payment ({entry_mode.replace('_', ' ')}) - {client_name}",
                "collected_by": user.user_id,
                "collected_by_name": user.name,
                "status": "pending_approval",
                "source": "approval",
                "created_at": now.isoformat()
            }
            await db.income.insert_one(income_record)
        
        if entry_mode == "cheque" and entry_cheques:
            for chq in entry_cheques:
                cheque_record = {
                    "cheque_id": f"chq_{secrets.token_hex(6)}",
                    "income_id": income_id,
                    "cheque_number": chq.get("cheque_number", ""),
                    "bank_name": chq.get("bank_name", ""),
                    "amount": float(chq.get("amount", 0)),
                    "cheque_date": chq.get("cheque_date", entry_pdate_iso),
                    "cheque_type": "incoming",
                    "party_name": client_name,
                    "party_type": "client",
                    "project_id": project_id,
                    "project_name": project_name,
                    "status": "issued",
                    "remarks": f"Advance cheque for project {project_name}",
                    "created_by": user.user_id,
                    "created_at": now.isoformat(),
                }
                await db.cheques.insert_one(cheque_record)
    
    return {
        "success": True,
        "project_id": project_id,
        "message": "RE Project converted to project successfully",
        "advance_collected": data.advance_amount,
        "status": "pending_payment"
    }


class AccountantVerifyInput(BaseModel):
    transaction_id: Optional[str] = None
    payment_type: Optional[str] = None  # cheque, bank_transfer, cash, upi
    remarks: Optional[str] = None


@router.patch("/cre/projects/{project_id}/accountant-verify")
async def accountant_verify_advance(project_id: str, data: AccountantVerifyInput = None, user: User = Depends(get_current_user)):
    """Accountant verifies the advance payment - moves project to payment_received"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can verify payments")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "pending_payment":
        raise HTTPException(status_code=400, detail=f"Project must be in pending_payment status. Current: {project.get('status')}")
    
    now = datetime.now(timezone.utc)
    txn_id = (data.transaction_id if data else None) or project.get("advance_payment_reference", "")
    pay_type = (data.payment_type if data else None) or project.get("advance_payment_mode", "cash")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "payment_verified",
            "accountant_verified": True,
            "accountant_verified_by": user.user_id,
            "accountant_verified_at": now.isoformat(),
            "advance_transaction_id": txn_id,
        }}
    )
    
    # Record income entry in income_entries collection
    income_entry = {
        "income_id": f"inc_{secrets.token_hex(6)}",
        "project_id": project_id,
        "type": "advance",
        "amount": project.get("advance_amount", 0),
        "payment_mode": pay_type,
        "payment_reference": txn_id,
        "verified_by": user.user_id,
        "verified_at": now.isoformat(),
        "created_at": now.isoformat()
    }
    await db.income_entries.insert_one(income_entry)
    
    # Record in main income collection for cashbook visibility
    main_income = {
        "income_id": f"inc_{secrets.token_hex(6)}",
        "project_id": project_id,
        "stage": "Advance Payment",
        "description": f"Advance - {project.get('name', '')}",
        "amount": project.get("advance_amount", 0),
        "payment_mode": pay_type,
        "reference_number": txn_id,
        "payment_date": now.isoformat(),
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "remarks": (data.remarks if data else None) or "Advance payment verified by accountant",
        "source": "approval",
        "created_at": now.isoformat()
    }
    await db.income.insert_one(main_income)
    
    return {"message": "Advance payment verified and recorded", "status": "payment_verified", "transaction_id": txn_id}


@router.patch("/cre/projects/{project_id}/send-to-planning")
async def send_project_to_planning(project_id: str, user: User = Depends(get_current_user)):
    """CRE sends verified project to Planning department.
    Flips planning_status from 'pending_planning' → 'new' so the project
    becomes visible in the Planning Board's New Projects tab."""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can send projects to planning")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") not in ["payment_received", "payment_verified"]:
        raise HTTPException(status_code=400, detail="Project must have payment verified before sending to planning")
    
    now = datetime.now(timezone.utc)
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "in_planning",
            # Now visible to Planning team (was 'pending_planning' until now)
            "planning_status": "new",
            "planning_new_date": now.isoformat(),
            "sent_to_planning_by": user.user_id,
            "sent_to_planning_at": now.isoformat()
        }}
    )

    # Notify planning users about the newly arrived project
    try:
        planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
        for pu in planning_users:
            await create_notification(pu["user_id"], f"New project from CRE: {project.get('name')}")
    except Exception:
        pass

    return {"message": "Project sent to Planning", "status": "in_planning", "planning_status": "new"}


@router.patch("/cre/projects/{project_id}/move-to-drawing")
async def move_project_to_drawing(project_id: str, user: User = Depends(get_current_user)):
    """Move project from Planning to Drawing stage after scopes and payments are set"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only CRE, Planning or Admin can move projects to drawing")
    
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") not in ["planning_approved", "in_planning", "planning_review"]:
        raise HTTPException(status_code=400, detail="Project must be approved by planning before moving to drawing")
    
    now = datetime.now(timezone.utc)
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "drawing",
            "moved_to_drawing_by": user.user_id,
            "moved_to_drawing_at": now.isoformat()
        }}
    )
    
    return {"message": "Project moved to Drawing Stage", "status": "drawing"}


@router.get("/cre/payment-requests")
async def get_cro_payment_requests(user: User = Depends(get_current_user)):
    """Get all payment stages that are requested for collection by CRO"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    # Get all payment stages with workflow_status = 'requested'
    pipeline = [
        {
            "$match": {
                "workflow_status": {"$in": ["requested", "pending_collection"]}
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
                "stage_name": 1,
                "stage_label": 1,
                "percentage": 1,
                "amount": 1,
                "amount_received": 1,
                "due_date": 1,
                "workflow_status": 1,
                "requested_at": 1,
                "requested_by_name": 1
            }
        },
        {"$sort": {"requested_at": -1}}
    ]
    
    payment_requests = await db.payment_stages.aggregate(pipeline).to_list(50)
    return payment_requests


@router.post("/cre/projects")
async def cro_create_project(project_input: CREProjectCreateInput, user: User = Depends(get_current_user)):
    """CRE creates a new project with package selection"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can create projects")
    
    # Get package details
    package = await db.packages.find_one({"package_id": project_input.package_id, "is_active": True}, {"_id": 0})
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    
    # Calculate project value from scope items
    total_value = sum(item.get("total", 0) for item in package.get("scope_items", []))
    
    # If base_rate_per_sqft is set, use sqft * rate
    if package.get("base_rate_per_sqft", 0) > 0:
        total_value = project_input.sqft * package["base_rate_per_sqft"]
    
    # Parse date
    try:
        start_date = datetime.strptime(project_input.expected_start_date, "%Y-%m-%d")
    except:
        start_date = datetime.now(timezone.utc)
    
    # Generate project code
    project_code = await generate_project_code()
    
    # Create project with new fields
    project = Project(
        project_code=project_code,
        name=project_input.name,
        client_name=project_input.client_name,
        client_phone=project_input.client_phone,
        client_email=project_input.client_email,
        location=project_input.location,
        sqft=project_input.sqft,
        building_type=project_input.building_type,
        package_id=project_input.package_id,
        package_name=package.get("name"),
        total_value=total_value,
        current_stage="yet_to_start",
        advance_date=project_input.advance_date,
        advance_amount=project_input.advance_amount or 0,
        advance_payment_mode=project_input.advance_payment_mode,
        rough_estimate_url=project_input.rough_estimate_url,
        start_date=start_date,
        expected_completion=start_date + timedelta(days=365),
        status=ProjectStatus.DRAFT,
        created_by=user.user_id
    )
    
    project_dict = project.model_dump()
    project_dict["start_date"] = project_dict["start_date"].isoformat()
    project_dict["expected_completion"] = project_dict["expected_completion"].isoformat()
    project_dict["created_at"] = project_dict["created_at"].isoformat()
    
    await db.projects.insert_one(project_dict)
    
    # Save cheque details if payment mode is cheque
    if project_input.advance_payment_mode == "cheque" and project_input.cheque_details:
        for chq in project_input.cheque_details:
            if chq.get("cheque_number"):
                cheque_record = {
                    "cheque_id": f"chq_{uuid.uuid4().hex[:8]}",
                    "project_id": project.project_id,
                    "income_id": None,
                    "cheque_number": chq.get("cheque_number"),
                    "bank_name": chq.get("bank_name", ""),
                    "amount": float(chq.get("amount", 0)),
                    "category": "advance_payment",
                    "collected_by": user.user_id,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.cheques.insert_one(cheque_record)
    
    # Auto-create scope items from package
    for item in package.get("scope_items", []):
        scope_item = {
            "scope_id": f"scope_{uuid.uuid4().hex[:12]}",
            "project_id": project.project_id,
            "item_name": item.get("name"),
            "description": item.get("description"),
            "quantity": item.get("quantity", 1),
            "unit": item.get("unit", "nos"),
            "unit_rate": item.get("unit_rate", 0),
            "total": item.get("total", 0),
            "remarks": f"From package: {package.get('name')}",
            "status": "draft",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.scope_items.insert_one(scope_item)
    
    # Auto-create material specifications from package (can be edited by Planning until approved)
    for item in package.get("material_items", []):
        project_material = {
            "material_id": f"pm_{uuid.uuid4().hex[:12]}",
            "project_id": project.project_id,
            "name": item.get("name"),
            "brand": item.get("brand"),
            "specification": item.get("specification"),
            "quantity": item.get("quantity", 1),
            "unit": item.get("unit", "nos"),
            "estimated_rate": item.get("estimated_rate", 0),
            "from_package": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.project_materials.insert_one(project_material)
    
    # Notify planning department
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New project created by CRO: {project.name}")
    
    return {"project_id": project.project_id, "total_value": total_value, "message": "Project created"}


@router.patch("/cre/projects/{project_id}/submit")
async def cro_submit_project(project_id: str, user: User = Depends(get_current_user)):
    """CRE submits project for planning review"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can submit projects")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft projects can be submitted")
    
    # Check if advance payment info is provided
    if not project.get("advance_amount") or project.get("advance_amount", 0) <= 0:
        raise HTTPException(status_code=400, detail="Advance payment details required before submission")
    
    # Send to Accountant for payment verification
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "pending_payment",
            "planning_status": "pending_planning",  # CRE moves to "new" after accountant verifies
            "pending_planning_date": datetime.now(timezone.utc).isoformat(),
            "submitted_for_payment_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify accountants
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
    for acc in accountants:
        await create_notification(acc["user_id"], f"New payment to verify: {project.get('name')} - ₹{project.get('advance_amount', 0):,.0f}")
    
    return {"message": "Project submitted for payment verification"}


@router.patch("/cre/projects/{project_id}/submit-to-planning")
async def cro_submit_to_planning(project_id: str, user: User = Depends(get_current_user)):
    """CRE submits project to Planning after payment verification"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can submit projects")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "payment_verified":
        raise HTTPException(status_code=400, detail="Payment must be verified before submitting to Planning")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "planning_review",
            "submitted_to_planning_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New project for review: {project.get('name')}")
    
    return {"message": "Project submitted to Planning Department"}


@router.post("/cre/projects/{project_id}/add-payment-milestone")
async def add_payment_milestone(project_id: str, milestone: dict, user: User = Depends(get_current_user)):
    """CRE adds a payment milestone to collect from client"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can add payment milestones")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    payment_milestone = {
        "milestone_id": f"pm_{uuid.uuid4().hex[:8]}",
        "description": milestone.get("description", "Payment"),
        "amount": milestone.get("amount", 0),
        "due_date": milestone.get("due_date"),
        "status": "pending",  # pending, notified, collected, approved
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.user_id
    }
    
    await db.projects.update_one(
        {"project_id": project_id},
        {"$push": {"payments_to_collect": payment_milestone}}
    )
    
    return {"message": "Payment milestone added", "milestone_id": payment_milestone["milestone_id"]}


@router.patch("/cre/projects/{project_id}/notify-client/{milestone_id}")
async def notify_client_for_payment(project_id: str, milestone_id: str, user: User = Depends(get_current_user)):
    """CRE notifies client about pending payment"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can notify clients")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update milestone status
    await db.projects.update_one(
        {"project_id": project_id, "payments_to_collect.milestone_id": milestone_id},
        {"$set": {
            "payments_to_collect.$.status": "notified",
            "payments_to_collect.$.notified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If client has user_id, create notification
    if project.get("client_user_id"):
        milestone = next((m for m in project.get("payments_to_collect", []) if m["milestone_id"] == milestone_id), None)
        if milestone:
            await create_notification(
                project["client_user_id"], 
                f"Payment reminder for {project.get('name')}: ₹{milestone.get('amount', 0):,.0f}"
            )
    
    return {"message": "Client notified for payment"}


@router.patch("/cre/projects/{project_id}/collect-payment/{milestone_id}")
async def collect_payment(project_id: str, milestone_id: str, payment_details: dict, user: User = Depends(get_current_user)):
    """CRE records payment collected from client"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can collect payments")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update milestone with collection details
    await db.projects.update_one(
        {"project_id": project_id, "payments_to_collect.milestone_id": milestone_id},
        {"$set": {
            "payments_to_collect.$.status": "collected",
            "payments_to_collect.$.collected_at": datetime.now(timezone.utc).isoformat(),
            "payments_to_collect.$.collected_by": user.user_id,
            "payments_to_collect.$.payment_mode": payment_details.get("payment_mode"),
            "payments_to_collect.$.reference_number": payment_details.get("reference_number"),
            "payments_to_collect.$.remarks": payment_details.get("remarks")
        }}
    )
    
    # Notify accountant for approval
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(acc["user_id"], f"Payment collected for {project.get('name')} - needs approval")
    
    return {"message": "Payment recorded. Sent to accountant for approval."}


@router.get("/cre/projects/all")
async def get_all_cro_projects(
    status: Optional[str] = None,
    stage: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all projects with filters for CRO"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    query = {}
    # CRE sees all projects
    
    if status:
        statuses = status.split(",")
        query["status"] = {"$in": statuses}
    
    if stage:
        query["current_stage"] = stage
    
    if date_from:
        try:
            from_date = datetime.strptime(date_from, "%Y-%m-%d")
            query["created_at"] = {"$gte": from_date.isoformat()}
        except:
            pass
    
    if date_to:
        try:
            to_date = datetime.strptime(date_to, "%Y-%m-%d")
            if "created_at" in query:
                query["created_at"]["$lte"] = to_date.isoformat()
            else:
                query["created_at"] = {"$lte": to_date.isoformat()}
        except:
            pass
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects


@router.get("/cre/additional-payment-requests")
async def get_cre_additional_payment_requests(user: User = Depends(get_current_user)):
    """Get additional cost items that have payment requested - for CRE to collect"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    pipeline = [
        {"$match": {"payment_requested": True, "status": {"$ne": "paid"}}},
        {"$lookup": {
            "from": "projects",
            "localField": "project_id",
            "foreignField": "project_id",
            "as": "project"
        }},
        {"$unwind": {"path": "$project", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": 0,
            "cost_id": 1,
            "project_id": 1,
            "project_name": "$project.name",
            "client_name": "$project.client_name",
            "description": 1,
            "estimated_amount": 1,
            "actual_amount": 1,
            "income_received": 1,
            "status": 1,
            "payment_requested": 1,
            "requested_at": 1,
            "created_at": 1
        }},
        {"$sort": {"requested_at": -1}}
    ]
    
    additional_requests = await db.additional_costs.aggregate(pipeline).to_list(100)
    return additional_requests


@router.get("/cre/income-collected")
async def get_cre_income_collected(user: User = Depends(get_current_user)):
    """Get all income records (payment ledger) for CRE dashboard"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    income_records = await db.income.find(
        {},
        {"_id": 0, "income_id": 1, "project_id": 1, "project_name": 1,
         "category": 1, "sub_category": 1, "amount": 1, "payment_mode": 1,
         "payment_reference": 1, "payment_date": 1, "stage": 1,
         "description": 1, "status": 1, "collected_by_name": 1, "created_at": 1,
         "rejection_reason": 1, "rejected_by_name": 1, "rejected_at": 1}
    ).sort("created_at", -1).to_list(200)
    return income_records


@router.get("/cre/pending-approvals")
async def get_cre_pending_approvals(user: User = Depends(get_current_user)):
    """Get projects with verified advance (ready to send to planning) and pending income approvals"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    # Projects where advance is verified by accountant — CRE can send to planning.
    # Exclude:
    #   • archived / soft-deleted (no longer actionable)
    #   • already sent to planning (sent_to_planning_at exists) — once CRE has
    #     handed over, the project belongs to Planning and shouldn't keep re-appearing.
    advance_verified = await db.projects.find(
        {
            "status": {"$in": ["payment_verified", "payment_received"]},
            "$and": [
                {"$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}]},
                {"$or": [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]},
                {"$or": [{"sent_to_planning_at": {"$exists": False}}, {"sent_to_planning_at": None}]},
            ],
        },
        {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "client_phone": 1, "location": 1,
         "total_value": 1, "advance_amount": 1, "status": 1, "created_at": 1, "planning_status": 1}
    ).sort("created_at", -1).to_list(50)
    
    # Income records pending approval (non-advance, just need confirmation)
    pending_income = await db.income.find(
        {"status": "pending_approval"},
        {"_id": 0, "income_id": 1, "project_id": 1, "project_name": 1,
         "category": 1, "sub_category": 1, "amount": 1, "payment_mode": 1,
         "payment_reference": 1, "stage": 1, "description": 1,
         "collected_by_name": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(100)
    
    return {
        "advance_verified": advance_verified,
        "pending_income": pending_income
    }


@router.post("/cre/projects/request-re")
async def create_project_request_re(project_input: dict, user: User = Depends(get_current_user)):
    """Create project and request Rough Estimate from Planning team"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can create projects")
    
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    project_code = await generate_project_code()
    now = datetime.now(timezone.utc)
    
    project = {
        "project_id": project_id,
        "project_code": project_code,
        "name": project_input.get("name", "New Project"),
        "client_name": project_input.get("client_name", ""),
        "client_phone": project_input.get("client_phone", ""),
        "client_email": project_input.get("client_email", ""),
        "location": project_input.get("location", ""),
        "sqft": float(project_input.get("sqft", 0)) if project_input.get("sqft") else 0,
        "building_type": project_input.get("building_type", "residential"),
        "total_value": 0,
        "advance_amount": 0,
        "current_stage": "yet_to_start",
        "status": "planning_review",
        "re_requested": True,
        "re_requested_at": now.isoformat(),
        "created_by": user.user_id,
        "created_at": now.isoformat(),
        "start_date": now.isoformat(),
        "expected_completion": (now + timedelta(days=365)).isoformat()
    }
    
    await db.projects.insert_one(project)
    
    # Notify planning team
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for pu in planning_users:
        await create_notification(
            pu["user_id"],
            f"New project '{project['name']}' needs Rough Estimate. Client: {project['client_name']}, Location: {project['location']}"
        )
    
    return {"project_id": project_id, "message": "Project created. RE requested from Planning team."}


# ==================== PLANNING BOARD ENDPOINTS ====================

@router.get("/planning/dashboard")
async def get_planning_dashboard(user: User = Depends(get_current_user)):
    """Get planning department dashboard"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    
    # Count by status - include 'planning' status (from CRM RE conversion)
    new_projects = await db.projects.count_documents({"status": {"$in": ["planning_review", "planning"]}})
    awaiting_approval = await db.projects.count_documents({"status": "awaiting_approval"})
    working_projects = await db.projects.count_documents({"status": {"$in": ["planning_approved", "active"]}})
    completed_projects = await db.projects.count_documents({"status": "completed"})
    
    # Pending requests from Site Engineers
    pending_material_requests = await db.material_requests.count_documents({"status": "requested"})
    pending_labour_requests = await db.labour_expenses.count_documents({"status": "requested"})
    
    return {
        "new_projects": new_projects,
        "awaiting_approval": awaiting_approval,
        "working_projects": working_projects,
        "completed_projects": completed_projects,
        "pending_material_requests": pending_material_requests,
        "pending_labour_requests": pending_labour_requests
    }


@router.get("/planning/projects")
async def get_planning_projects(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get projects for planning board"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    
    query = {}
    # Always exclude soft-deleted + archived projects from planning lists
    query["$or"] = [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]

    if status == "new":
        # Include projects sent from CRE (in_planning) and from CRM RE conversion (planning_review, planning).
        # For "in_planning" specifically, require the explicit CRE handoff (sent_to_planning_at)
        # so projects that haven't been sent by CRE don't leak into Planning's queue.
        query["$and"] = [
            {"$or": [
                {"status": {"$in": ["planning_review", "planning"]}},
                {"$and": [
                    {"status": "in_planning"},
                    {"sent_to_planning_at": {"$exists": True, "$ne": None}},
                ]},
            ]},
        ]
    elif status == "awaiting":
        query["status"] = "awaiting_approval"
    elif status == "working":
        query["status"] = {"$in": ["planning_approved", "active"]}
    elif status == "completed":
        query["status"] = "completed"
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects


@router.patch("/planning/projects/{project_id}/submit-for-approval")
async def planning_submit_for_approval(project_id: str, user: User = Depends(get_current_user)):
    """Planning submits project for GM/Admin approval"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can submit for approval")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "planning_review":
        raise HTTPException(status_code=400, detail="Project must be in planning review status")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "status": "awaiting_approval",
                "planning_modified_by": user.user_id,
                "planning_submitted_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify GM and Super Admin (in-app)
    gm_users = await db.users.find({"role": "general_manager"}, {"_id": 0, "user_id": 1}).to_list(10)
    admin_users = await db.users.find({"role": "super_admin"}, {"_id": 0, "user_id": 1}).to_list(10)
    
    for u in gm_users + admin_users:
        await create_notification(u["user_id"], f"Project awaiting approval: {project.get('name')}")
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_approval_needed
        asyncio.ensure_future(notify_approval_needed("Project", project.get("name", ""), user.name))
    except Exception:
        pass
    
    return {"message": "Project submitted for approval"}


@router.patch("/planning/projects/{project_id}/planning-status")
async def update_planning_status(project_id: str, request: Request, user: User = Depends(get_current_user)):
    """Move project between planning lifecycle: new -> active -> delivered"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can update planning status")

    body = await request.json()
    new_status = body.get("planning_status")
    if new_status not in ["new", "active", "delivered"]:
        raise HTTPException(status_code=400, detail="Invalid planning status. Must be: new, active, delivered")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    now = datetime.now(timezone.utc).isoformat()
    update = {"planning_status": new_status, "updated_at": now}

    if new_status == "active":
        update["planning_active_date"] = now
    elif new_status == "delivered":
        update["planning_delivered_date"] = now
    elif new_status == "new":
        update["planning_new_date"] = now

    await db.projects.update_one({"project_id": project_id}, {"$set": update})
    return {"message": f"Project moved to {new_status}"}


@router.get("/planning/projects-filtered")
async def get_planning_projects_filtered(
    planning_status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    planning_person_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get projects filtered by planning lifecycle status and date"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")

    query = {}
    date_field = "created_at"

    # Always exclude soft-deleted projects from planning views
    deleted_clause = {"$or": [{"is_deleted": {"$exists": False}}, {"is_deleted": False}]}

    if planning_status:
        if planning_status == "archived":
            # Archive tab — show ONLY archived (but not soft-deleted) projects
            query["is_archived"] = True
            query["$or"] = deleted_clause["$or"]
            date_field = "archived_at"
        elif planning_status == "new":
            # ONLY projects explicitly moved to Planning by CRE (after accountant verification).
            # Two requirements:
            #   1. planning_status == "new"
            #   2. sent_to_planning_at must exist (legacy data fix — projects converted
            #      before the pending_planning gate could have planning_status='new'
            #      but were never explicitly handed over by CRE).
            query["planning_status"] = "new"
            query["sent_to_planning_at"] = {"$exists": True, "$ne": None}
            query["$and"] = [
                {"$or": [
                    {"is_archived": {"$exists": False}},
                    {"is_archived": False},
                ]},
                deleted_clause,
            ]
            date_field = "planning_new_date"
        else:
            query["planning_status"] = planning_status
            query["$and"] = [
                {"$or": [
                    {"is_archived": {"$exists": False}},
                    {"is_archived": False},
                ]},
                deleted_clause,
            ]
            if planning_status == "active":
                date_field = "planning_active_date"
            elif planning_status == "delivered":
                date_field = "planning_delivered_date"

    logger.info(f"Planning projects filter: query={query}, date_field={date_field}")

    # Date filters
    if date_from and date_to:
        query[date_field] = {"$gte": date_from, "$lte": date_to + "T23:59:59"}
    elif date_from:
        query[date_field] = {"$gte": date_from}
    elif date_to:
        query[date_field] = {"$lte": date_to + "T23:59:59"}

    if month and year:
        start = f"{year}-{month:02d}-01T00:00:00"
        if month == 12:
            end = f"{year + 1}-01-01T00:00:00"
        else:
            end = f"{year}-{month + 1:02d}-01T00:00:00"
        query[date_field] = {"$gte": start, "$lt": end}
    elif year and not month:
        query[date_field] = {"$gte": f"{year}-01-01T00:00:00", "$lt": f"{year + 1}-01-01T00:00:00"}

    # Planning Person scoping & filter
    if user.role == UserRole.PLANNING_PERSON:
        # Hard scope — Planning Person only sees their own assigned projects
        query["assigned_planning_person_id"] = user.user_id
    elif planning_person_id:
        # Planning Head / Super Admin can slice by a specific Planning Person.
        # Special value "unassigned" returns projects with no assignee yet.
        if planning_person_id == "unassigned":
            query["$and"] = (query.get("$and") or []) + [{"$or": [
                {"assigned_planning_person_id": {"$exists": False}},
                {"assigned_planning_person_id": None},
                {"assigned_planning_person_id": ""},
            ]}]
        else:
            query["assigned_planning_person_id"] = planning_person_id

    logger.info(f"Final query: {query}")
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    logger.info(f"Found {len(projects)} projects")
    return projects


# ==================== PROJECT CONSTRUCTION STAGES ENDPOINTS ====================

@router.get("/planning/stage-dashboard")
async def get_planning_stage_dashboard(user: User = Depends(get_current_user)):
    """Get planning dashboard with project stages - Tab view like CRE Board"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning / GM can access this")
    
    # Count projects by construction stage (only working/active projects)
    stage_counts = {}
    for stage in PROJECT_STAGES:
        count = await db.projects.count_documents({
            "current_stage": stage["id"],
            "status": {"$in": ["in_planning", "planning_review", "planning_approved", "active", "gm_approved"]}
        })
        stage_counts[stage["id"]] = count
    
    # Count by workflow status - include in_planning from CRE
    new_projects = await db.projects.count_documents({"status": {"$in": ["in_planning", "planning_review", "planning"]}})
    awaiting_approval = await db.projects.count_documents({"status": "awaiting_approval"})
    working_projects = await db.projects.count_documents({"status": {"$in": ["planning_approved", "active", "gm_approved"]}})
    completed_projects = await db.projects.count_documents({"status": "completed"})
    
    # Pending requests
    pending_material_requests = await db.material_requests.count_documents({"status": "requested"})
    pending_labour_requests = await db.labour_expenses.count_documents({"status": "requested"})
    
    return {
        "new_projects": new_projects,
        "awaiting_approval": awaiting_approval,
        "working_projects": working_projects,
        "completed_projects": completed_projects,
        "pending_material_requests": pending_material_requests,
        "pending_labour_requests": pending_labour_requests,
        "stage_counts": stage_counts,
        "stages": PROJECT_STAGES
    }


@router.get("/planning/projects-by-stage")
async def get_projects_by_stage(stage: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get projects filtered by construction stage"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning / GM can access this")
    
    query = {"status": {"$in": ["planning", "in_planning", "planning_review", "planning_approved", "active", "gm_approved", "awaiting_approval", "working"]}}
    
    if stage and stage != "all":
        query["current_stage"] = stage
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects


@router.patch("/planning/projects/{project_id}/update-stage")
async def update_project_stage(project_id: str, stage: str, user: User = Depends(get_current_user)):
    """Update project construction stage - Planning/PM can move projects through stages"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning or PM can update project stage")
    
    # Validate stage
    valid_stages = [s["id"] for s in PROJECT_STAGES]
    if stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {valid_stages}")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    old_stage = project.get("current_stage", "yet_to_start")
    
    # Add to stage history
    stage_change = {
        "from_stage": old_stage,
        "to_stage": stage,
        "changed_by": user.user_id,
        "changed_by_name": user.name,
        "changed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {"current_stage": stage},
            "$push": {"stage_history": stage_change}
        }
    )
    
    # Create audit log
    await create_audit_log(user.user_id, "update_stage", "project", project_id, {
        "from": old_stage,
        "to": stage
    })
    
    # Get stage name for notification
    stage_name = next((s["name"] for s in PROJECT_STAGES if s["id"] == stage), stage)
    
    return {
        "message": f"Project stage updated to {stage_name}",
        "project_id": project_id,
        "new_stage": stage,
        "stage_name": stage_name
    }


@router.get("/planning/projects/{project_id}/stage-history")
async def get_project_stage_history(project_id: str, user: User = Depends(get_current_user)):
    """Get project stage change history"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "current_stage": project.get("current_stage", "yet_to_start"),
        "stage_history": project.get("stage_history", []),
        "stages": PROJECT_STAGES
    }


@router.get("/planning/payment-schedule-overview")
async def get_payment_schedule_overview(user: User = Depends(get_current_user)):
    """Get all payment schedule stages across all projects for planning dashboard"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get all payment stages
    all_stages = await db.payment_stages.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)

    # Get project names in bulk
    project_ids = list(set(s.get("project_id") for s in all_stages if s.get("project_id")))
    projects = {}
    if project_ids:
        proj_docs = await db.projects.find(
            {"project_id": {"$in": project_ids}},
            {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "total_value": 1, "current_stage": 1}
        ).to_list(1000)
        projects = {p["project_id"]: p for p in proj_docs}

    # Enrich stages with project info
    enriched = []
    for s in all_stages:
        proj = projects.get(s.get("project_id"), {})
        enriched.append({
            **s,
            "project_name": proj.get("name", "Unknown"),
            "client_name": proj.get("client_name", ""),
            "project_value": proj.get("total_value", 0),
            "project_stage": proj.get("current_stage", ""),
        })

    # Summary stats
    total_scheduled = sum(s.get("amount", 0) for s in all_stages)
    total_received = sum(s.get("amount_received", 0) or 0 for s in all_stages)
    pending_count = sum(1 for s in all_stages if s.get("status") == "pending")
    partial_count = sum(1 for s in all_stages if s.get("status") == "partial")
    collected_count = sum(1 for s in all_stages if s.get("status") in ("paid", "collected"))

    return {
        "stages": enriched,
        "summary": {
            "total_scheduled": total_scheduled,
            "total_received": total_received,
            "total_balance": total_scheduled - total_received,
            "total_stages": len(all_stages),
            "pending_count": pending_count,
            "partial_count": partial_count,
            "collected_count": collected_count,
            "project_count": len(project_ids),
        }
    }


# ==================== MONTHLY PAYMENT SCHEDULE ====================

@router.get("/planning/monthly-schedule")
async def get_monthly_schedule(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2050),
    user: User = Depends(get_current_user)
):
    """Get monthly payment schedule with auto-carryover from previous months"""
    allowed = [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # 1. Get entries for this month
    entries = await db.monthly_schedule_entries.find(
        {"month": month, "year": year}, {"_id": 0}
    ).sort("added_at", 1).to_list(1000)
    
    # 1b. Backfill: ensure any Additional Work payment_stages that were "Requested"
    # with an expected_payment_date in/before this month have a monthly_schedule_entries
    # row. Older entries may pre-date the auto-create logic in request_additional_payment.
    try:
        month_end = (datetime(year, month, 28) + timedelta(days=4)).replace(day=1).isoformat()
        addition_stages = await db.payment_stages.find(
            {
                "is_addition": True,
                "expected_payment_date": {"$ne": None, "$lt": month_end},
                "status": {"$nin": ["paid", "collected"]},
            },
            {"_id": 0},
        ).to_list(2000)
        existing_stage_ids_global = await db.monthly_schedule_entries.distinct("stage_id")
        existing_global_set = set(existing_stage_ids_global)
        for s in addition_stages:
            sid = s.get("stage_id")
            if not sid or sid in existing_global_set:
                continue
            try:
                dt = datetime.strptime(s["expected_payment_date"][:10], "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            await db.monthly_schedule_entries.insert_one({
                "entry_id": f"mse_{uuid.uuid4().hex[:12]}",
                "month": dt.month,
                "year": dt.year,
                "project_id": s["project_id"],
                "stage_id": sid,
                "expected_payment_date": s["expected_payment_date"],
                "is_addition": True,
                "linked_addition_id": s.get("linked_addition_id"),
                "added_by": "system_backfill",
                "added_at": datetime.now(timezone.utc).isoformat(),
            })
        # Re-fetch this month's entries after backfill
        entries = await db.monthly_schedule_entries.find(
            {"month": month, "year": year}, {"_id": 0}
        ).sort("added_at", 1).to_list(1000)
    except Exception:
        # Backfill is best-effort; never block the main response
        pass
    
    # 2. Get all uncollected entries from ALL previous months (carryover)
    prev_entries = await db.monthly_schedule_entries.find(
        {"$or": [
            {"year": {"$lt": year}},
            {"year": year, "month": {"$lt": month}}
        ]},
        {"_id": 0}
    ).to_list(5000)
    
    # Get stage_ids already in this month
    current_stage_ids = {e.get("stage_id") for e in entries}
    
    # 3. Check which previous entries are still uncollected
    for pe in prev_entries:
        if pe.get("stage_id") in current_stage_ids:
            continue
        stage = await db.payment_stages.find_one(
            {"stage_id": pe["stage_id"]}, {"_id": 0, "status": 1}
        )
        if stage and stage.get("status") not in ("paid", "collected"):
            carryover = {
                "entry_id": f"mse_{uuid.uuid4().hex[:12]}",
                "month": month, "year": year,
                "project_id": pe["project_id"],
                "stage_id": pe["stage_id"],
                "is_carryover": True,
                "carry_from_month": pe.get("carry_from_month") or pe["month"],
                "carry_from_year": pe.get("carry_from_year") or pe["year"],
                "added_by": "system",
                "added_at": datetime.now(timezone.utc).isoformat()
            }
            await db.monthly_schedule_entries.insert_one(carryover)
            current_stage_ids.add(pe["stage_id"])
    
    # Re-fetch all entries for this month (now includes carryovers)
    all_entries = await db.monthly_schedule_entries.find(
        {"month": month, "year": year}, {"_id": 0}
    ).sort("added_at", 1).to_list(1000)
    
    # 4. Enrich with stage + project details
    enriched = []
    project_cache = {}
    stage_ids = [e["stage_id"] for e in all_entries]
    stages_map = {}
    if stage_ids:
        stages_list = await db.payment_stages.find({"stage_id": {"$in": stage_ids}}, {"_id": 0}).to_list(5000)
        stages_map = {s["stage_id"]: s for s in stages_list}
    
    pid_set = list(set(e.get("project_id") for e in all_entries if e.get("project_id")))
    if pid_set:
        proj_docs = await db.projects.find({"project_id": {"$in": pid_set}}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "total_value": 1}).to_list(1000)
        project_cache = {p["project_id"]: p for p in proj_docs}

    # Pending-approval income roll-up per stage (so CRE can hide Collect button until Accountant approves)
    pending_by_stage = {}
    if stage_ids:
        pending_inc = await db.income.aggregate([
            {"$match": {"status": "pending_approval", "category": "payment_collection"}},
            {"$group": {
                "_id": {"project_id": "$project_id", "stage": "$stage"},
                "total": {"$sum": "$amount"},
                "count": {"$sum": 1},
            }},
        ]).to_list(5000)
        # Map by stage_id: lookup via stages_map (stage label/name)
        for item in pending_inc:
            key = (item["_id"]["project_id"], item["_id"]["stage"])
            pending_by_stage[key] = {"total": item["total"], "count": item["count"]}
    
    for entry in all_entries:
        stage = stages_map.get(entry["stage_id"])
        if not stage:
            continue
        proj = project_cache.get(entry.get("project_id"), {})
        stage_label = stage.get("stage_label", stage.get("stage_name", ""))
        pkey = (entry.get("project_id"), stage_label)
        pending = pending_by_stage.get(pkey, {"total": 0, "count": 0})
        enriched.append({
            **entry,
            "stage_name": stage.get("stage_name", ""),
            "stage_label": stage.get("stage_label", ""),
            "percentage": stage.get("percentage", 0),
            "amount": stage.get("amount", 0),
            "amount_received": stage.get("amount_received", 0),
            "pending_approval_amount": pending["total"],
            "pending_approval_count": pending["count"],
            "stage_status": stage.get("status", "pending"),
            "workflow_status": stage.get("workflow_status", "approved"),
            "due_date": stage.get("due_date"),
            "expected_payment_date": stage.get("expected_payment_date") or stage.get("due_date"),
            "requested_at": stage.get("requested_at"),
            "project_name": proj.get("name", "Unknown"),
            "client_name": proj.get("client_name", ""),
            "project_value": proj.get("total_value", 0),
        })
    
    # 5. Summary
    total_planned = sum(e.get("amount", 0) for e in enriched)
    total_received = sum(e.get("amount_received", 0) or 0 for e in enriched)
    carryover_count = sum(1 for e in enriched if e.get("is_carryover"))
    requested_count = sum(1 for e in enriched if e.get("workflow_status") in ("requested", "pending_collection"))
    collected_count = sum(1 for e in enriched if e.get("stage_status") in ("paid", "collected"))
    
    return {
        "month": month, "year": year,
        "entries": enriched,
        "summary": {
            "total_entries": len(enriched),
            "total_planned": total_planned,
            "total_received": total_received,
            "total_balance": total_planned - total_received,
            "carryover_count": carryover_count,
            "requested_count": requested_count,
            "collected_count": collected_count,
        }
    }


@router.get("/planning/monthly-schedule/available-stages")
async def get_available_stages_for_schedule(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2050),
    user: User = Depends(get_current_user)
):
    """Get payment stages not yet added to this month's schedule"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can manage schedules")
    
    existing = await db.monthly_schedule_entries.find(
        {"month": month, "year": year}, {"_id": 0, "stage_id": 1}
    ).to_list(1000)
    existing_ids = {e["stage_id"] for e in existing}
    
    all_stages = await db.payment_stages.find(
        {"status": {"$nin": ["paid", "collected"]}}, {"_id": 0}
    ).to_list(5000)
    
    available = [s for s in all_stages if s["stage_id"] not in existing_ids]
    
    pid_set = list(set(s.get("project_id") for s in available if s.get("project_id")))
    project_cache = {}
    if pid_set:
        proj_docs = await db.projects.find({"project_id": {"$in": pid_set}}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1}).to_list(1000)
        project_cache = {p["project_id"]: p for p in proj_docs}
    
    result = []
    for s in available:
        proj = project_cache.get(s.get("project_id"), {})
        result.append({
            "stage_id": s["stage_id"], "project_id": s.get("project_id"),
            "project_name": proj.get("name", "Unknown"), "client_name": proj.get("client_name", ""),
            "stage_name": s.get("stage_name", ""), "stage_label": s.get("stage_label", ""),
            "percentage": s.get("percentage", 0), "amount": s.get("amount", 0),
            "amount_received": s.get("amount_received", 0), "status": s.get("status", "pending"),
        })
    
    return result


@router.post("/planning/monthly-schedule/add-stages")
async def add_stages_to_monthly_schedule(body: dict, user: User = Depends(get_current_user)):
    """Add payment stages to a monthly schedule"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can manage schedules")
    
    month, year, stage_ids = body.get("month"), body.get("year"), body.get("stage_ids", [])
    if not month or not year or not stage_ids:
        raise HTTPException(status_code=400, detail="month, year, and stage_ids required")
    
    existing = await db.monthly_schedule_entries.find(
        {"month": month, "year": year, "stage_id": {"$in": stage_ids}}, {"_id": 0, "stage_id": 1}
    ).to_list(1000)
    existing_ids = {e["stage_id"] for e in existing}
    
    added = 0
    for sid in stage_ids:
        if sid in existing_ids:
            continue
        stage = await db.payment_stages.find_one({"stage_id": sid}, {"_id": 0})
        if not stage:
            continue
        entry = {
            "entry_id": f"mse_{uuid.uuid4().hex[:12]}",
            "month": month, "year": year,
            "project_id": stage.get("project_id"),
            "stage_id": sid,
            "is_carryover": False,
            "carry_from_month": None, "carry_from_year": None,
            "added_by": user.user_id,
            "added_at": datetime.now(timezone.utc).isoformat()
        }
        await db.monthly_schedule_entries.insert_one(entry)
        added += 1
    
    return {"message": f"Added {added} stages to {month}/{year}", "added": added}


@router.delete("/planning/monthly-schedule/{entry_id}")
async def remove_schedule_entry(entry_id: str, user: User = Depends(get_current_user)):
    """Remove a stage from the monthly schedule"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can manage schedules")
    result = await db.monthly_schedule_entries.delete_one({"entry_id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Removed from schedule"}


@router.patch("/planning/monthly-schedule/{entry_id}/request-payment")
async def request_payment_for_schedule_entry(entry_id: str, user: User = Depends(get_current_user)):
    """Planning requests payment for a scheduled stage — sends to CRE"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can request payments")
    
    entry = await db.monthly_schedule_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    
    result = await db.payment_stages.update_one(
        {"stage_id": entry["stage_id"]},
        {"$set": {
            "workflow_status": "requested",
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "requested_by": user.user_id,
            "requested_by_name": user.name
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    
    cre_users = await db.users.find({"role": "cre"}, {"_id": 0}).to_list(50)
    project = await db.projects.find_one({"project_id": entry["project_id"]}, {"_id": 0, "name": 1})
    pname = project.get("name", "Unknown") if project else "Unknown"
    for c in cre_users:
        await create_notification(c["user_id"], f"Payment requested: {pname} - scheduled for {entry['month']}/{entry['year']}")
    
    return {"message": "Payment requested — sent to CRE"}


@router.get("/planning/monthly-schedule/months-list")
async def get_schedule_months_list(user: User = Depends(get_current_user)):
    """Get list of months that have schedule entries"""
    allowed = [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    pipeline = [
        {"$group": {"_id": {"month": "$month", "year": "$year"}, "count": {"$sum": 1}}},
        {"$sort": {"_id.year": -1, "_id.month": -1}}
    ]
    months = await db.monthly_schedule_entries.aggregate(pipeline).to_list(100)
    return [{"month": m["_id"]["month"], "year": m["_id"]["year"], "count": m["count"]} for m in months]



@router.get("/approvals/projects")
async def get_projects_for_approval(user: User = Depends(get_current_user)):
    """Get projects awaiting approval"""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM and Super Admin can access this")
    
    query = {"status": "awaiting_approval"}
    if user.role == UserRole.GENERAL_MANAGER:
        # GM can only see projects not yet GM approved
        query["gm_approved_by"] = None
    
    projects = await db.projects.find(query, {"_id": 0}).sort("planning_submitted_at", -1).to_list(100)
    return projects


@router.patch("/approvals/projects/{project_id}/gm-approve")
async def gm_approve_project(project_id: str, user: User = Depends(get_current_user)):
    """GM approves a project"""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM can approve")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "awaiting_approval":
        raise HTTPException(status_code=400, detail="Project not awaiting approval")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "status": "gm_approved",
                "gm_approved_by": user.user_id,
                "gm_approved_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify Super Admin (in-app)
    admin_users = await db.users.find({"role": "super_admin"}, {"_id": 0, "user_id": 1}).to_list(10)
    for u in admin_users:
        await create_notification(u["user_id"], f"Project GM approved, awaiting final approval: {project.get('name')}")
    
    # Send email notification (non-blocking) - notify the project creator/PM
    try:
        from core.notifications import notify_project_approved
        pm_id = project.get("created_by", project.get("pm_id", ""))
        if pm_id:
            asyncio.ensure_future(notify_project_approved(project.get("name", ""), user.name, pm_id))
    except Exception:
        pass
    
    return {"message": "Project approved by GM"}


@router.patch("/approvals/projects/{project_id}/final-approve")
async def final_approve_project(project_id: str, user: User = Depends(get_current_user)):
    """Super Admin final approval"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can give final approval")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Can approve from awaiting_approval (skip GM) or from gm_approved
    if project.get("status") not in ["awaiting_approval", "gm_approved"]:
        raise HTTPException(status_code=400, detail="Project not in approval stage")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "status": "planning_approved",
                "materials_locked": True,  # Lock material brands after final approval
                "admin_approved_by": user.user_id,
                "admin_approved_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify Planning and CRO (in-app)
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for u in planning_users:
        await create_notification(u["user_id"], f"Project approved for execution: {project.get('name')}")
    
    if project.get("created_by"):
        await create_notification(project["created_by"], f"Your project has been approved: {project.get('name')}")
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_project_final_approved
        asyncio.ensure_future(notify_project_final_approved(project.get("name", ""), user.name))
    except Exception:
        pass
    
    return {"message": "Project approved - Ready for execution. Material brands are now locked."}


@router.patch("/approvals/projects/{project_id}/reject")
async def reject_project(project_id: str, reason: str, user: User = Depends(get_current_user)):
    """Reject a project"""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM and Super Admin can reject")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "status": "planning_review",  # Send back to planning
                "rejection_reason": reason,
                "gm_approved_by": None,
                "gm_approved_at": None
            }
        }
    )
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for u in planning_users:
        await create_notification(u["user_id"], f"Project rejected: {project.get('name')} - Reason: {reason}")
    
    return {"message": "Project rejected and sent back to planning"}


# ==================== PROJECT MATERIALS (BRAND MANAGEMENT) ====================

class ProjectMaterialInput(BaseModel):
    name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    quantity: float = 1
    unit: str = "nos"
    estimated_rate: float = 0


@router.get("/projects/{project_id}/materials")
async def get_project_materials(project_id: str, user: User = Depends(get_current_user)):
    """Get material specifications for a project"""
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "materials_locked": 1, "name": 1, "status": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    materials = await db.project_materials.find({"project_id": project_id}, {"_id": 0}).to_list(100)
    
    return {
        "project_name": project.get("name"),
        "materials_locked": project.get("materials_locked", False),
        "project_status": project.get("status"),
        "materials": materials
    }


@router.post("/projects/{project_id}/materials")
async def add_project_material(project_id: str, material_input: ProjectMaterialInput, user: User = Depends(get_current_user)):
    """Add a new material specification to project (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can add materials")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("materials_locked"):
        raise HTTPException(status_code=400, detail="Material brands are locked after project approval. Request re-approval to make changes.")
    
    material = {
        "material_id": f"pm_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "name": material_input.name,
        "brand": material_input.brand,
        "specification": material_input.specification,
        "quantity": material_input.quantity,
        "unit": material_input.unit,
        "estimated_rate": material_input.estimated_rate,
        "from_package": False,
        "modified_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.project_materials.insert_one(material)
    return {"material_id": material["material_id"], "message": "Material added"}


@router.patch("/projects/{project_id}/materials/{material_id}")
async def update_project_material(project_id: str, material_id: str, material_input: ProjectMaterialInput, user: User = Depends(get_current_user)):
    """Update material specification (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can update materials")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("materials_locked"):
        raise HTTPException(status_code=400, detail="Material brands are locked after project approval. Request re-approval to make changes.")
    
    existing = await db.project_materials.find_one({"material_id": material_id, "project_id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Material not found")
    
    await db.project_materials.update_one(
        {"material_id": material_id},
        {
            "$set": {
                "name": material_input.name,
                "brand": material_input.brand,
                "specification": material_input.specification,
                "quantity": material_input.quantity,
                "unit": material_input.unit,
                "estimated_rate": material_input.estimated_rate,
                "modified_by": user.user_id,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Material updated"}


@router.delete("/projects/{project_id}/materials/{material_id}")
async def delete_project_material(project_id: str, material_id: str, user: User = Depends(get_current_user)):
    """Delete material specification (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can delete materials")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("materials_locked"):
        raise HTTPException(status_code=400, detail="Material brands are locked after project approval. Request re-approval to make changes.")
    
    result = await db.project_materials.delete_one({"material_id": material_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material not found")
    
    return {"message": "Material deleted"}


@router.post("/projects/{project_id}/request-material-unlock")
async def request_material_unlock(project_id: str, reason: str, user: User = Depends(get_current_user)):
    """Request to unlock material brands (requires re-approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can request unlock")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not project.get("materials_locked"):
        return {"message": "Materials are not locked"}
    
    # Send project back for re-approval
    await db.projects.update_one(
        {"project_id": project_id},
        {
            "$set": {
                "status": "awaiting_approval",
                "materials_locked": False,
                "planning_submitted_at": datetime.now(timezone.utc).isoformat(),
                "gm_approved_by": None,
                "gm_approved_at": None,
                "admin_approved_by": None,
                "admin_approved_at": None,
                "rejection_reason": f"Re-approval requested for material changes: {reason}"
            }
        }
    )
    
    # Notify GM and Admin
    gm_users = await db.users.find({"role": "general_manager"}, {"_id": 0, "user_id": 1}).to_list(10)
    admin_users = await db.users.find({"role": "super_admin"}, {"_id": 0, "user_id": 1}).to_list(10)
    
    for u in gm_users + admin_users:
        await create_notification(u["user_id"], f"Material change requested for {project.get('name')}: {reason}")
    
    return {"message": "Material unlock requested. Project sent for re-approval."}


# ==================== ACCOUNTS BOARD ENDPOINTS ====================

@router.get("/accounts/dashboard")
async def get_accounts_dashboard(user: User = Depends(get_current_user)):
    """Get accounts dashboard"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can access this")
    
    (pending_advance_payments, advance_agg, pending_material, pending_labour,
     pending_procurement, work_orders, material_agg, labour_agg, procurement_agg) = await asyncio.gather(
        db.projects.count_documents({"status": "pending_payment"}),
        db.projects.aggregate([{"$match": {"status": "pending_payment"}}, {"$group": {"_id": None, "total": {"$sum": "$advance_amount"}}}]).to_list(1),
        db.material_expenses.count_documents({"status": "planning_approved"}),
        db.labour_expenses.count_documents({"status": "planning_approved"}),
        db.procurement_pricing.count_documents({"status": "waiting_accounts"}),
        db.work_orders.find({"stages.status": "payment_approved"}, {"_id": 0, "stages": 1}).to_list(500),
        db.material_expenses.aggregate([{"$match": {"status": "planning_approved"}}, {"$group": {"_id": None, "total": {"$sum": "$estimated_cost"}}}]).to_list(1),
        db.labour_expenses.aggregate([{"$match": {"status": "planning_approved"}}, {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}]).to_list(1),
        db.procurement_pricing.aggregate([{"$match": {"status": "waiting_accounts"}}, {"$group": {"_id": None, "total": {"$sum": "$final_amount"}}}]).to_list(1),
    )
    
    pending_stage_payments = sum(1 for wo in work_orders for s in wo.get("stages", []) if s.get("status") == "payment_approved")
    stage_payments_total = sum(s.get("amount", 0) for wo in work_orders for s in wo.get("stages", []) if s.get("status") == "payment_approved")
    
    adv_total = advance_agg[0]["total"] if advance_agg else 0
    mat_total = material_agg[0]["total"] if material_agg else 0
    lab_total = labour_agg[0]["total"] if labour_agg else 0
    proc_total = procurement_agg[0]["total"] if procurement_agg else 0
    
    return {
        "pending_advance_payments": pending_advance_payments,
        "advance_payments_total": adv_total,
        "pending_material": pending_material,
        "pending_labour": pending_labour,
        "pending_procurement": pending_procurement,
        "pending_stage_payments": pending_stage_payments,
        "material_total": mat_total,
        "labour_total": lab_total,
        "procurement_total": proc_total,
        "stage_payments_total": stage_payments_total,
        "total_pending": mat_total + lab_total + proc_total + stage_payments_total + adv_total
    }


@router.get("/accounts/pending-advance-payments")
async def get_pending_advance_payments(user: User = Depends(get_current_user)):
    """Get projects pending advance payment verification"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can access this")
    
    projects = await db.projects.find(
        {"status": "pending_payment"},
        {"_id": 0}
    ).sort("submitted_for_payment_at", -1).to_list(100)
    
    return projects


@router.patch("/accounts/verify-advance-payment/{project_id}")
async def verify_advance_payment(project_id: str, verification: dict, user: User = Depends(get_current_user)):
    """Accountant verifies advance payment and adds transaction details"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can verify payments")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "pending_payment":
        raise HTTPException(status_code=400, detail="Project not pending payment verification")
    
    # Update project with payment verification
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "payment_verified",
            "payment_verified_by": user.user_id,
            "payment_verified_at": datetime.now(timezone.utc).isoformat(),
            "payment_transaction_id": verification.get("transaction_id"),
            "payment_verification_remarks": verification.get("remarks"),
            "payment_bank_name": verification.get("bank_name")
        }}
    )
    
    # Notify CRO
    if project.get("created_by"):
        await create_notification(
            project["created_by"], 
            f"Payment verified for {project.get('name')}. You can now submit to Planning."
        )
    
    return {"message": "Payment verified successfully"}


@router.patch("/accounts/reject-advance-payment/{project_id}")
async def reject_advance_payment(project_id: str, rejection: dict, user: User = Depends(get_current_user)):
    """Accountant rejects advance payment"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject payments")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("status") != "pending_payment":
        raise HTTPException(status_code=400, detail="Project not pending payment verification")
    
    # Reject and send back to CRO
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "status": "draft",
            "payment_rejection_reason": rejection.get("reason"),
            "payment_rejected_by": user.user_id,
            "payment_rejected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify CRO
    if project.get("created_by"):
        await create_notification(
            project["created_by"], 
            f"Payment rejected for {project.get('name')}: {rejection.get('reason')}"
        )
    
    return {"message": "Payment rejected"}


@router.get("/accounts/pending-payments")
async def get_pending_payments(payment_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all pending payments for accounts"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can access this")
    
    result = []
    
    if payment_type in [None, "material"]:
        materials = await db.material_expenses.find(
            {"status": "planning_approved"},
            {"_id": 0}
        ).to_list(100)
        for m in materials:
            m["payment_type"] = "material"
        result.extend(materials)
    
    if payment_type in [None, "labour"]:
        labours = await db.labour_expenses.find(
            {"status": "planning_approved"},
            {"_id": 0}
        ).to_list(100)
        for l in labours:
            l["payment_type"] = "labour"
        result.extend(labours)
    
    if payment_type in [None, "procurement"]:
        procurements = await db.procurement_pricing.find(
            {"status": "waiting_accounts"},
            {"_id": 0}
        ).to_list(100)
        for p in procurements:
            p["payment_type"] = "procurement"
        result.extend(procurements)
    
    # Include work order stage payments approved by Planning
    if payment_type in [None, "stage"]:
        work_orders = await db.work_orders.find(
            {"stages.status": "payment_approved"},
            {"_id": 0}
        ).to_list(100)
        for wo in work_orders:
            for stage in wo.get("stages", []):
                if stage.get("status") == "payment_approved":
                    result.append({
                        "payment_type": "stage",
                        "work_order_id": wo.get("work_order_id"),
                        "work_order_number": wo.get("work_order_number"),
                        "project_id": wo.get("project_id"),
                        "project_name": wo.get("project_name"),
                        "order_type": wo.get("order_type"),
                        "work_type": wo.get("work_type"),
                        "contractor_name": wo.get("contractor_name"),
                        "stage_id": stage.get("stage_id"),
                        "stage_number": stage.get("stage_number"),
                        "stage_name": stage.get("stage_name"),
                        "amount": stage.get("amount"),
                        "approved_at": stage.get("payment_approved_at"),
                        "approved_by": stage.get("payment_approved_by")
                    })
    
    return result


class AccountsPaymentInput(BaseModel):
    payment_type: str  # credit, partial, full
    amount: Optional[float] = None
    remarks: Optional[str] = None


@router.patch("/accounts/process-payment/{item_type}/{item_id}")
async def process_payment(
    item_type: str,  # material, labour, procurement
    item_id: str,
    payment_input: AccountsPaymentInput,
    user: User = Depends(get_current_user)
):
    """Process payment for an approved item"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can process payments")
    
    collection_map = {
        "material": "material_expenses",
        "labour": "labour_expenses",
        "procurement": "procurement_pricing"
    }
    
    id_field_map = {
        "material": "expense_id",
        "labour": "expense_id",
        "procurement": "pricing_id"
    }
    
    if item_type not in collection_map:
        raise HTTPException(status_code=400, detail="Invalid item type")
    
    collection = db[collection_map[item_type]]
    id_field = id_field_map[item_type]
    
    item = await collection.find_one({id_field: item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = {
        "payment_status": payment_input.payment_type,
        "accounts_processed_by": user.user_id,
        "accounts_processed_at": datetime.now(timezone.utc).isoformat(),
        "payment_remarks": payment_input.remarks
    }
    
    if payment_input.payment_type == "full":
        update_data["status"] = "paid"
        update_data["paid_amount"] = item.get("final_amount") or item.get("total_amount") or item.get("estimated_cost", 0)
    elif payment_input.payment_type == "partial":
        update_data["status"] = "partial_paid"
        update_data["paid_amount"] = payment_input.amount or 0
    elif payment_input.payment_type == "credit":
        update_data["status"] = "credit"
        update_data["paid_amount"] = 0
    
    await collection.update_one({id_field: item_id}, {"$set": update_data})
    
    return {"message": f"Payment processed as {payment_input.payment_type}"}


# ==================== WORK ORDER ENDPOINTS ====================

class WorkOrderStageInput(BaseModel):
    stage_name: str
    description: Optional[str] = None
    amount: float = 0


class LabourWorkOrderInput(BaseModel):
    project_id: str
    work_type: str
    contractor_id: Optional[str] = None
    number_of_days: float = 0
    number_of_workers: int = 1
    daily_rate: float = 0
    stages: List[WorkOrderStageInput] = []
    assigned_to: Optional[str] = None
    remarks: Optional[str] = None


class MaterialWorkOrderInput(BaseModel):
    project_id: str
    material_id: Optional[str] = None
    material_name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    vendor_id: Optional[str] = None
    quantity: float = 0
    unit: str = "nos"
    unit_price: float = 0
    assigned_to: Optional[str] = None
    remarks: Optional[str] = None


async def get_next_work_order_number():
    """Generate next work order number"""
    count = await db.work_orders.count_documents({})
    return f"WO-{str(count + 1).zfill(4)}"


@router.get("/work-orders")
async def get_work_orders(
    project_id: Optional[str] = None,
    order_type: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get work orders with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SITE_ENGINEER, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    
    # Site engineers only see their assigned work orders
    if user.role == UserRole.SITE_ENGINEER:
        query["assigned_to"] = user.user_id
    elif assigned_to:
        query["assigned_to"] = assigned_to
    
    if project_id:
        query["project_id"] = project_id
    if order_type:
        query["order_type"] = order_type
    if status:
        query["status"] = status
    
    work_orders = await db.work_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return work_orders


@router.get("/work-orders/payment-requests")
async def get_work_order_payment_requests_v2(user: User = Depends(get_current_user)):
    """Get all payment requests for Planning to review - placed before parameterized route"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning/GM can view payment requests")
    
    # Find work orders with payment_requested stages
    work_orders = await db.work_orders.find(
        {"stages.status": "payment_requested"},
        {"_id": 0}
    ).to_list(500)
    
    # Extract payment requests
    requests = []
    for wo in work_orders:
        for stage in wo.get("stages", []):
            if stage.get("status") == "payment_requested":
                requests.append({
                    "work_order_id": wo.get("work_order_id"),
                    "work_order_number": wo.get("work_order_number"),
                    "project_id": wo.get("project_id"),
                    "project_name": wo.get("project_name"),
                    "order_type": wo.get("order_type"),
                    "work_type": wo.get("work_type"),
                    "contractor_name": wo.get("contractor_name"),
                    "stage_id": stage.get("stage_id"),
                    "stage_number": stage.get("stage_number"),
                    "stage_name": stage.get("stage_name"),
                    "amount": stage.get("amount"),
                    "requested_at": stage.get("payment_requested_at"),
                    "requested_by": stage.get("payment_requested_by"),
                    "remarks": stage.get("remarks")
                })
    
    return requests


@router.get("/work-orders/{work_order_id}")
async def get_work_order(work_order_id: str, user: User = Depends(get_current_user)):
    """Get single work order details"""
    work_order = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return work_order


@router.post("/work-orders/labour")
async def create_labour_work_order(wo_input: LabourWorkOrderInput, user: User = Depends(get_current_user)):
    """Create a labour work order (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning can create work orders")
    
    # Get project details
    project = await db.projects.find_one({"project_id": wo_input.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get contractor details if provided
    contractor_name = None
    if wo_input.contractor_id:
        contractor = await db.labour_contractors.find_one({"contractor_id": wo_input.contractor_id}, {"_id": 0})
        if contractor:
            contractor_name = contractor.get("name")
    
    # Get assigned user details
    assigned_to_name = None
    if wo_input.assigned_to:
        assigned_user = await db.users.find_one({"user_id": wo_input.assigned_to}, {"_id": 0})
        if assigned_user:
            assigned_to_name = assigned_user.get("name")
    
    # Create stages
    stages = []
    for idx, stage in enumerate(wo_input.stages):
        stages.append({
            "stage_id": f"wos_{uuid.uuid4().hex[:8]}",
            "stage_number": idx + 1,
            "stage_name": stage.stage_name,
            "description": stage.description,
            "amount": stage.amount,
            "status": "pending"
        })
    
    # Calculate total from stages
    total_amount = sum(s.amount for s in wo_input.stages) if wo_input.stages else (wo_input.number_of_days * wo_input.number_of_workers * wo_input.daily_rate)
    
    work_order = WorkOrder(
        work_order_number=await get_next_work_order_number(),
        project_id=wo_input.project_id,
        project_name=project.get("name"),
        order_type=WorkOrderType.LABOUR,
        work_type=wo_input.work_type,
        contractor_id=wo_input.contractor_id,
        contractor_name=contractor_name,
        number_of_days=wo_input.number_of_days,
        number_of_workers=wo_input.number_of_workers,
        daily_rate=wo_input.daily_rate,
        total_amount=total_amount,
        stages=stages,
        assigned_to=wo_input.assigned_to,
        assigned_to_name=assigned_to_name,
        assigned_at=datetime.now(timezone.utc) if wo_input.assigned_to else None,
        status=WorkOrderStatus.ASSIGNED if wo_input.assigned_to else WorkOrderStatus.DRAFT,
        created_by=user.user_id,
        created_by_name=user.name,
        remarks=wo_input.remarks
    )
    
    wo_dict = work_order.model_dump()
    wo_dict["created_at"] = wo_dict["created_at"].isoformat()
    wo_dict["updated_at"] = wo_dict["updated_at"].isoformat()
    if wo_dict.get("assigned_at"):
        wo_dict["assigned_at"] = wo_dict["assigned_at"].isoformat()
    
    await db.work_orders.insert_one(wo_dict)
    
    # Notify site engineer if assigned
    if wo_input.assigned_to:
        await create_notification(
            wo_input.assigned_to,
            f"New Work Order assigned: {work_order.work_order_number} - {wo_input.work_type}"
        )
    
    return {"work_order_id": work_order.work_order_id, "work_order_number": work_order.work_order_number}


@router.post("/work-orders/material")
async def create_material_work_order(wo_input: MaterialWorkOrderInput, user: User = Depends(get_current_user)):
    """Create a material work order (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning can create work orders")
    
    # Get project details
    project = await db.projects.find_one({"project_id": wo_input.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get vendor details if provided
    vendor_name = None
    if wo_input.vendor_id:
        vendor = await db.vendor_master.find_one({"vendor_id": wo_input.vendor_id}, {"_id": 0})
        if vendor:
            vendor_name = vendor.get("name")
    
    # Get assigned user details
    assigned_to_name = None
    if wo_input.assigned_to:
        assigned_user = await db.users.find_one({"user_id": wo_input.assigned_to}, {"_id": 0})
        if assigned_user:
            assigned_to_name = assigned_user.get("name")
    
    total_amount = wo_input.quantity * wo_input.unit_price
    
    work_order = WorkOrder(
        work_order_number=await get_next_work_order_number(),
        project_id=wo_input.project_id,
        project_name=project.get("name"),
        order_type=WorkOrderType.MATERIAL,
        material_id=wo_input.material_id,
        material_name=wo_input.material_name,
        brand=wo_input.brand,
        specification=wo_input.specification,
        vendor_id=wo_input.vendor_id,
        vendor_name=vendor_name,
        quantity=wo_input.quantity,
        unit=wo_input.unit,
        unit_price=wo_input.unit_price,
        total_amount=total_amount,
        assigned_to=wo_input.assigned_to,
        assigned_to_name=assigned_to_name,
        assigned_at=datetime.now(timezone.utc) if wo_input.assigned_to else None,
        status=WorkOrderStatus.ASSIGNED if wo_input.assigned_to else WorkOrderStatus.DRAFT,
        created_by=user.user_id,
        created_by_name=user.name,
        remarks=wo_input.remarks
    )
    
    wo_dict = work_order.model_dump()
    wo_dict["created_at"] = wo_dict["created_at"].isoformat()
    wo_dict["updated_at"] = wo_dict["updated_at"].isoformat()
    if wo_dict.get("assigned_at"):
        wo_dict["assigned_at"] = wo_dict["assigned_at"].isoformat()
    
    await db.work_orders.insert_one(wo_dict)
    
    # Notify site engineer if assigned
    if wo_input.assigned_to:
        await create_notification(
            wo_input.assigned_to,
            f"New Material Order assigned: {work_order.work_order_number} - {wo_input.material_name}"
        )
    
    return {"work_order_id": work_order.work_order_id, "work_order_number": work_order.work_order_number}


@router.patch("/work-orders/{work_order_id}/assign")
async def assign_work_order(work_order_id: str, site_engineer_id: str, user: User = Depends(get_current_user)):
    """Assign work order to site engineer"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning can assign work orders")
    
    # Get site engineer details
    engineer = await db.users.find_one({"user_id": site_engineer_id, "role": "site_engineer"}, {"_id": 0})
    if not engineer:
        raise HTTPException(status_code=404, detail="Site engineer not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id},
        {
            "$set": {
                "assigned_to": site_engineer_id,
                "assigned_to_name": engineer.get("name"),
                "assigned_at": datetime.now(timezone.utc).isoformat(),
                "status": "assigned",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify site engineer
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    await create_notification(
        site_engineer_id,
        f"Work Order assigned: {wo.get('work_order_number')} - {wo.get('work_type') or wo.get('material_name')}"
    )
    
    return {"message": "Work order assigned"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/start")
async def start_work_order_stage(work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Site engineer starts a stage"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Only Site Engineer can start stages")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "in_progress",
                "stages.$.started_at": datetime.now(timezone.utc).isoformat(),
                "status": "in_progress",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Stage started"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/complete")
async def complete_work_order_stage(work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Site engineer marks stage as completed"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Only Site Engineer can complete stages")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "completed",
                "stages.$.completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Stage completed"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/request-payment")
async def request_stage_payment(work_order_id: str, stage_id: str, remarks: Optional[str] = None, user: User = Depends(get_current_user)):
    """Site engineer requests payment for completed stage"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Only Site Engineer can request payment")
    
    # Verify stage is completed
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    stage = next((s for s in wo.get("stages", []) if s.get("stage_id") == stage_id), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    if stage.get("status") not in ["completed", "in_progress"]:
        raise HTTPException(status_code=400, detail="Stage must be completed before requesting payment")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "payment_requested",
                "stages.$.payment_requested_at": datetime.now(timezone.utc).isoformat(),
                "stages.$.payment_requested_by": user.user_id,
                "stages.$.remarks": remarks,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for pu in planning_users:
        await create_notification(
            pu["user_id"],
            f"Payment requested for {wo.get('work_order_number')} - Stage: {stage.get('stage_name')}"
        )
    
    return {"message": "Payment requested"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/approve-payment")
async def approve_stage_payment(work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Planning approves stage payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning can approve payments")
    
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    stage = next((s for s in wo.get("stages", []) if s.get("stage_id") == stage_id), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "payment_approved",
                "stages.$.payment_approved_at": datetime.now(timezone.utc).isoformat(),
                "stages.$.payment_approved_by": user.user_id,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify Accountant
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(
            acc["user_id"],
            f"Payment approved for {wo.get('work_order_number')} - Stage: {stage.get('stage_name')} - ₹{stage.get('amount')}"
        )
    
    # Notify Site Engineer
    if wo.get("assigned_to"):
        await create_notification(
            wo["assigned_to"],
            f"Payment approved for Stage: {stage.get('stage_name')}"
        )
    
    return {"message": "Payment approved"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/reject-payment")
async def reject_stage_payment(work_order_id: str, stage_id: str, reason: str, user: User = Depends(get_current_user)):
    """Planning rejects stage payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Planning can reject payments")
    
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "completed",  # Back to completed
                "stages.$.payment_requested_at": None,
                "stages.$.payment_requested_by": None,
                "stages.$.remarks": f"Rejected: {reason}",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Notify Site Engineer
    if wo.get("assigned_to"):
        await create_notification(
            wo["assigned_to"],
            f"Payment rejected for {wo.get('work_order_number')} - Reason: {reason}"
        )
    
    return {"message": "Payment rejected"}


@router.patch("/work-orders/{work_order_id}/stages/{stage_id}/process-payment")
async def process_stage_payment(work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Accountant processes approved payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can process payments")
    
    wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    stage = next((s for s in wo.get("stages", []) if s.get("stage_id") == stage_id), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    if stage.get("status") != "payment_approved":
        raise HTTPException(status_code=400, detail="Payment must be approved first")
    
    now = datetime.now(timezone.utc).isoformat()
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "paid",
                "stages.$.paid_at": now,
                "updated_at": now
            }
        }
    )
    
    # Record expense in cashbook
    category = "labour" if wo.get("order_type") == "labour" else "material"
    expense_doc = {
        "expense_id": f"exp_{secrets.token_hex(6)}",
        "project_id": wo.get("project_id"),
        "project_name": wo.get("project_name", ""),
        "category": category,
        "description": f"{wo.get('work_order_number','')} - {stage.get('stage_name','')} ({wo.get('material_name') or wo.get('work_type','')})",
        "amount": stage.get("amount", 0),
        "payment_method": "bank_transfer",
        "vendor_name": wo.get("vendor_name", ""),
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "source": "approval",
        "work_order_id": work_order_id,
        "stage_id": stage_id,
        "created_at": now,
    }
    await db.recorded_expenses.insert_one(expense_doc)
    
    # Check if all stages are paid
    updated_wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    all_paid = all(s.get("status") == "paid" for s in updated_wo.get("stages", []))
    
    if all_paid and updated_wo.get("stages"):
        await db.work_orders.update_one(
            {"work_order_id": work_order_id},
            {"$set": {"status": "completed"}}
        )
    
    return {"message": "Payment processed"}


@router.get("/site-engineer/work-orders")
async def get_site_engineer_work_orders(user: User = Depends(get_current_user)):
    """Get work orders for site engineer - from project_work_orders collection"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can access this")
    
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        # Get projects assigned to this SE from site_engineer_assignments collection
        assignments = await db.site_engineer_assignments.find({
            "user_id": user.user_id,
            "is_active": True
        }, {"_id": 0, "project_id": 1}).to_list(100)
        project_ids = [a["project_id"] for a in assignments]
        
        # Get work orders from project_work_orders collection for these projects
        work_orders = await db.project_work_orders.find(
            {"project_id": {"$in": project_ids}, "is_active": {"$ne": False}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    else:
        # Super admin sees all
        work_orders = await db.project_work_orders.find(
            {"is_active": {"$ne": False}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(500)
    
    # Add order_type field for frontend filtering (labour work orders)
    for wo in work_orders:
        if not wo.get("order_type"):
            wo["order_type"] = "labour"  # Default to labour for contractor work orders
        if not wo.get("work_order_number"):
            wo["work_order_number"] = wo.get("work_order_id", "")
        if not wo.get("total_amount"):
            wo["total_amount"] = wo.get("total_value", 0)
    
    return work_orders


# ==================== COMPREHENSIVE ACCOUNTANT BOARD ENDPOINTS ====================


@router.get("/accountant/comprehensive-dashboard")
async def get_accountant_comprehensive_dashboard(user: User = Depends(get_current_user)):
    """Get comprehensive accountant dashboard with income, expense, profit by project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can access this")
    
    # Parallel bulk fetch
    (projects, income_entries, transactions, material_expenses, labour_expenses,
     vendor_expenses, staff_count, pending_payroll, pending_cheques, bounced_cheques,
     recent_transactions, pending_payments) = await asyncio.gather(
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1, "project_code": 1, "client_name": 1, "total_value": 1}).to_list(1000),
        db.income_entries.find({}, {"_id": 0, "project_id": 1, "amount": 1, "payment_mode": 1}).to_list(5000),
        db.transactions.find({}, {"_id": 0}).to_list(5000),
        db.material_expenses.find({"status": "completed"}, {"_id": 0, "project_id": 1, "final_amount": 1}).to_list(1000),
        db.labour_expenses.find({"status": "completed"}, {"_id": 0, "project_id": 1, "total_amount": 1}).to_list(1000),
        db.vendor_service_expenses.find({"status": "completed"}, {"_id": 0, "project_id": 1, "amount": 1}).to_list(1000),
        db.staff.count_documents({}),
        db.payroll.count_documents({"status": {"$in": ["draft", "pending_approval"]}}),
        db.cheques.count_documents({"status": {"$in": ["issued", "deposited", "post_dated"]}}),
        db.cheques.count_documents({"status": "bounced"}),
        db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(10),
        db.payment_verifications.count_documents({"status": {"$in": ["pending", "otp_sent"]}}),
    )
    
    # Index expenses by project_id
    from collections import defaultdict
    inc_by_proj = defaultdict(float)
    for inc in income_entries:
        inc_by_proj[inc.get("project_id")] += inc.get("amount", 0)
    mat_by_proj = defaultdict(float)
    for e in material_expenses:
        mat_by_proj[e.get("project_id")] += e.get("final_amount", 0)
    lab_by_proj = defaultdict(float)
    for e in labour_expenses:
        lab_by_proj[e.get("project_id")] += e.get("total_amount", 0)
    vend_by_proj = defaultdict(float)
    for e in vendor_expenses:
        vend_by_proj[e.get("project_id")] += e.get("amount", 0)
    
    income_by_method = {"cash": 0, "cheque": 0, "bank_transfer": 0, "escrow": 0, "credit_card": 0}
    for inc in income_entries:
        method = inc.get("payment_mode", "cash")
        income_by_method[method] = income_by_method.get(method, 0) + inc.get("amount", 0)
    
    total_income = sum(inc.get("amount", 0) for inc in income_entries)
    total_expense = 0
    project_financials = []
    
    for p in projects:
        pid = p.get("project_id")
        proj_income = inc_by_proj.get(pid, 0)
        proj_expense = mat_by_proj.get(pid, 0) + lab_by_proj.get(pid, 0) + vend_by_proj.get(pid, 0)
        total_expense += proj_expense
        project_financials.append({
            "project_id": pid, "project_name": p.get("name"), "project_code": p.get("project_code"),
            "client_name": p.get("client_name"), "total_value": p.get("total_value", 0),
            "income": proj_income, "expense": proj_expense,
            "profit": proj_income - proj_expense,
            "profit_margin": round((proj_income - proj_expense) / proj_income * 100, 2) if proj_income > 0 else 0
        })
    
    project_financials.sort(key=lambda x: x["profit"], reverse=True)
    
    return {
        "summary": {
            "total_income": total_income, "total_expense": total_expense,
            "total_profit": total_income - total_expense,
            "profit_margin": round((total_income - total_expense) / total_income * 100, 2) if total_income > 0 else 0
        },
        "income_by_method": income_by_method,
        "project_financials": project_financials,
        "recent_transactions": recent_transactions,
        "hr_summary": {"total_staff": staff_count, "pending_payroll": pending_payroll},
        "cheque_summary": {"pending_cheques": pending_cheques, "bounced_cheques": bounced_cheques},
        "pending_payment_requests": pending_payments
    }


@router.get("/accountant/project-financials/{project_id}")
async def get_project_financials(project_id: str, user: User = Depends(get_current_user)):
    """Get detailed financial view for a specific project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Income
    income_entries = await db.income_entries.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    total_income = sum(e.get("amount", 0) for e in income_entries)
    
    # Expenses
    material_expenses = await db.material_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    labour_expenses = await db.labour_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    vendor_expenses = await db.vendor_service_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    
    mat_total = sum(e.get("final_amount", 0) for e in material_expenses)
    lab_total = sum(e.get("total_amount", 0) for e in labour_expenses)
    vend_total = sum(e.get("amount", 0) for e in vendor_expenses)
    
    # Transactions for this project
    transactions = await db.transactions.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return {
        "project": project,
        "income": {
            "total": total_income,
            "entries": income_entries
        },
        "expenses": {
            "material": {"total": mat_total, "entries": material_expenses},
            "labour": {"total": lab_total, "entries": labour_expenses},
            "vendor": {"total": vend_total, "entries": vendor_expenses},
            "grand_total": mat_total + lab_total + vend_total
        },
        "profit": total_income - (mat_total + lab_total + vend_total),
        "transactions": transactions
    }


# ==================== TRANSACTION ENDPOINTS ====================

@router.get("/accountant/transactions")
async def get_transactions(
    project_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    payment_method: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all transactions with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if project_id:
        query["project_id"] = project_id
    if transaction_type:
        query["transaction_type"] = transaction_type
    if payment_method:
        query["payment_method"] = payment_method
    if from_date:
        query["payment_date"] = {"$gte": from_date}
    if to_date:
        query["payment_date"] = {**query.get("payment_date", {}), "$lte": to_date}
    
    transactions = await db.transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return transactions


class TransactionCreate(BaseModel):
    transaction_type: TransactionType
    project_id: Optional[str] = None
    amount: float
    payment_method: PaymentMethodType
    payment_date: datetime
    reference_number: Optional[str] = None
    party_name: Optional[str] = None
    party_type: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


@router.post("/accountant/transactions")
async def create_transaction(txn: TransactionCreate, user: User = Depends(get_current_user)):
    """Create a new transaction"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get project name if project_id provided
    project_name = None
    if txn.project_id:
        project = await db.projects.find_one({"project_id": txn.project_id}, {"_id": 0, "name": 1})
        if project:
            project_name = project.get("name")
    
    transaction = Transaction(
        transaction_type=txn.transaction_type,
        project_id=txn.project_id,
        project_name=project_name,
        amount=txn.amount,
        payment_method=txn.payment_method,
        payment_date=txn.payment_date,
        reference_number=txn.reference_number,
        party_name=txn.party_name,
        party_type=txn.party_type,
        description=txn.description,
        category=txn.category,
        recorded_by=user.user_id,
        recorded_by_name=user.name
    )
    
    txn_dict = transaction.model_dump()
    txn_dict["payment_date"] = txn_dict["payment_date"].isoformat()
    txn_dict["created_at"] = txn_dict["created_at"].isoformat()
    txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
    
    await db.transactions.insert_one(txn_dict)
    return transaction


@router.delete("/accountant/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, user: User = Depends(get_current_user)):
    """Delete a transaction"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.transactions.delete_one({"transaction_id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return {"message": "Transaction deleted"}


# ==================== CHEQUE MANAGEMENT ENDPOINTS ====================

@router.get("/accountant/cheques")
async def get_cheques(
    status: Optional[str] = None,
    cheque_type: Optional[str] = None,
    is_post_dated: Optional[bool] = None,
    user: User = Depends(get_current_user)
):
    """Get all cheques with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    if cheque_type:
        query["cheque_type"] = cheque_type
    if is_post_dated is not None:
        query["is_post_dated"] = is_post_dated
    
    cheques = await db.cheques.find(query, {"_id": 0}).sort("cheque_date", -1).to_list(500)
    return cheques


class ChequeCreate(BaseModel):
    cheque_number: str
    bank_name: str
    branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    amount: float
    cheque_date: datetime
    cheque_type: str = "incoming"
    party_name: str
    party_type: str
    project_id: Optional[str] = None
    income_id: Optional[str] = None
    is_post_dated: bool = False
    reminder_date: Optional[datetime] = None
    remarks: Optional[str] = None


@router.post("/accountant/cheques")
async def create_cheque(cheque: ChequeCreate, user: User = Depends(get_current_user)):
    """Create a new cheque record"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get project name if provided
    project_name = None
    if cheque.project_id:
        project = await db.projects.find_one({"project_id": cheque.project_id}, {"_id": 0, "name": 1})
        if project:
            project_name = project.get("name")
    
    cheque_record = ChequeRecord(
        cheque_number=cheque.cheque_number,
        bank_name=cheque.bank_name,
        branch_name=cheque.branch_name,
        account_number=cheque.account_number,
        ifsc_code=cheque.ifsc_code,
        amount=cheque.amount,
        cheque_date=cheque.cheque_date,
        cheque_type=cheque.cheque_type,
        party_name=cheque.party_name,
        party_type=cheque.party_type,
        project_id=cheque.project_id,
        project_name=project_name,
        is_post_dated=cheque.is_post_dated,
        reminder_date=cheque.reminder_date,
        remarks=cheque.remarks,
        status=ChequeStatus.POST_DATED if cheque.is_post_dated else ChequeStatus.ISSUED,
        recorded_by=user.user_id,
        recorded_by_name=user.name
    )
    
    cheque_dict = cheque_record.model_dump()
    cheque_dict["cheque_date"] = cheque_dict["cheque_date"].isoformat()
    if cheque_dict.get("reminder_date"):
        cheque_dict["reminder_date"] = cheque_dict["reminder_date"].isoformat()
    cheque_dict["created_at"] = cheque_dict["created_at"].isoformat()
    cheque_dict["updated_at"] = cheque_dict["updated_at"].isoformat()
    # Link to income if provided so the approval dialog can pull it back
    if cheque.income_id:
        cheque_dict["income_id"] = cheque.income_id

    await db.cheques.insert_one(cheque_dict)
    return cheque_record


class ChequeStatusUpdate(BaseModel):
    status: ChequeStatus
    deposit_date: Optional[datetime] = None
    clearance_date: Optional[datetime] = None
    bounce_reason: Optional[str] = None
    bounce_charges: float = 0
    remarks: Optional[str] = None


@router.patch("/accountant/cheques/{cheque_id}/status")
async def update_cheque_status(cheque_id: str, update: ChequeStatusUpdate, user: User = Depends(get_current_user)):
    """Update cheque status"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Lock: incoming cheques must be opened by CRE before Accountant can deposit/clear them
    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("cheque_type") == "incoming" and not cheque.get("is_opened"):
        if update.status in (ChequeStatus.DEPOSITED, ChequeStatus.CLEARED, ChequeStatus.BOUNCED):
            raise HTTPException(
                status_code=400,
                detail="This cheque is awaiting CRE release. Ask CRE to open the cheque before depositing/clearing."
            )

    update_dict = {"status": update.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if update.deposit_date:
        update_dict["deposit_date"] = update.deposit_date.isoformat()
    if update.clearance_date:
        update_dict["clearance_date"] = update.clearance_date.isoformat()
    if update.bounce_reason:
        update_dict["bounce_reason"] = update.bounce_reason
    if update.bounce_charges:
        update_dict["bounce_charges"] = update.bounce_charges
    if update.remarks:
        update_dict["remarks"] = update.remarks
    
    result = await db.cheques.update_one({"cheque_id": cheque_id}, {"$set": update_dict})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Cheque not found")
    
    return {"message": "Cheque status updated"}


# ==================== CRE Cheque Workflow ====================

class ChequeOpenRequest(BaseModel):
    remarks: Optional[str] = None


@router.get("/cre/cheques")
async def get_cre_cheques(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """List incoming cheques for CRE — collected by Sales (advance) + Planning stage payments."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    query = {"cheque_type": "incoming"}
    if project_id:
        query["project_id"] = project_id

    cheques = await db.cheques.find(query, {"_id": 0}).sort("cheque_date", -1).to_list(2000)
    return cheques


@router.get("/projects/{project_id}/cheques")
async def get_project_cheques(project_id: str, user: User = Depends(get_current_user)):
    """List ALL cheques (incoming + outgoing) tied to a project — for the Project Detail Cheques tab."""
    cheques = await db.cheques.find({"project_id": project_id}, {"_id": 0}).sort("cheque_date", -1).to_list(2000)
    return cheques


@router.patch("/cre/cheques/{cheque_id}/open")
async def cre_open_cheque(cheque_id: str, payload: ChequeOpenRequest, user: User = Depends(get_current_user)):
    """CRE opens (releases) a cheque so the Accountant can proceed to deposit/clear."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Only CRE can open cheques")

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("is_opened"):
        return {"message": "Cheque already opened", "cheque_id": cheque_id}

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "is_opened": True,
        "opened_by": user.user_id,
        "opened_by_name": user.name,
        "opened_at": now,
        "opened_remarks": payload.remarks,
        # Clear any pending request once CRE opens it
        "open_requested": False,
        "updated_at": now,
    }
    await db.cheques.update_one({"cheque_id": cheque_id}, {"$set": update})
    return {"message": "Cheque opened. Accountant can now deposit/clear it.", "cheque_id": cheque_id}


@router.patch("/accountant/cheques/{cheque_id}/request-open")
async def accountant_request_open_cheque(cheque_id: str, payload: ChequeOpenRequest, user: User = Depends(get_current_user)):
    """Accountant raises a request asking CRE to open this cheque (so it can be deposited/cleared)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can request cheque open")

    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    if cheque.get("is_opened"):
        raise HTTPException(status_code=400, detail="Cheque is already opened")
    if cheque.get("cheque_type") != "incoming":
        raise HTTPException(status_code=400, detail="Only incoming cheques require CRE release")

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "open_requested": True,
        "open_requested_by": user.user_id,
        "open_requested_by_name": user.name,
        "open_requested_at": now,
        "open_requested_remarks": payload.remarks,
        "updated_at": now,
    }
    await db.cheques.update_one({"cheque_id": cheque_id}, {"$set": update})

    # Notify CRE department
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_cre",
        "title": "Cheque open requested",
        "message": f"{user.name} requested CRE to open cheque {cheque.get('cheque_number')} ({cheque.get('party_name')}).",
        "type": "cheque_open_request",
        "reference_id": cheque_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc),
    })

    return {"message": "Open request sent to CRE", "cheque_id": cheque_id}


@router.get("/accountant/cheques/reminders")
async def get_cheque_reminders(user: User = Depends(get_current_user)):
    """Get post-dated cheques that need attention"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    today = datetime.now(timezone.utc).date().isoformat()
    next_week = (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat()
    
    # Find post-dated cheques due within a week
    cheques = await db.cheques.find({
        "is_post_dated": True,
        "status": "post_dated",
        "cheque_date": {"$lte": next_week}
    }, {"_id": 0}).to_list(100)
    
    return cheques


# ==================== HR / STAFF ENDPOINTS ====================

@router.get("/hr/staff")
async def get_staff_list(
    department: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all staff members"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if department:
        query["department"] = department
    if status:
        query["status"] = status
    
    staff = await db.staff.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return staff


class StaffCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    date_of_joining: Optional[datetime] = None
    date_of_birth: Optional[datetime] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    basic_salary: float = 0
    hra: float = 0
    da: float = 0
    ta: float = 0
    other_allowances: float = 0
    pf: float = 0
    esi: float = 0
    professional_tax: float = 0
    tds: float = 0
    other_deductions: float = 0
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    payment_method: PaymentMethodType = PaymentMethodType.BANK_TRANSFER


@router.post("/hr/staff")
async def create_staff(staff_data: StaffCreate, user: User = Depends(get_current_user)):
    """Create a new staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate employee code
    count = await db.staff.count_documents({})
    employee_code = f"EMP{str(count + 1).zfill(4)}"
    
    # Calculate gross and net salary
    gross = staff_data.basic_salary + staff_data.hra + staff_data.da + staff_data.ta + staff_data.other_allowances
    deductions = staff_data.pf + staff_data.esi + staff_data.professional_tax + staff_data.tds + staff_data.other_deductions
    net = gross - deductions
    
    staff = Staff(
        employee_code=employee_code,
        name=staff_data.name,
        email=staff_data.email,
        phone=staff_data.phone,
        department=staff_data.department,
        designation=staff_data.designation,
        date_of_joining=staff_data.date_of_joining,
        date_of_birth=staff_data.date_of_birth,
        address=staff_data.address,
        emergency_contact=staff_data.emergency_contact,
        basic_salary=staff_data.basic_salary,
        hra=staff_data.hra,
        da=staff_data.da,
        ta=staff_data.ta,
        other_allowances=staff_data.other_allowances,
        gross_salary=gross,
        pf=staff_data.pf,
        esi=staff_data.esi,
        professional_tax=staff_data.professional_tax,
        tds=staff_data.tds,
        other_deductions=staff_data.other_deductions,
        total_deductions=deductions,
        net_salary=net,
        bank_name=staff_data.bank_name,
        account_number=staff_data.account_number,
        ifsc_code=staff_data.ifsc_code,
        payment_method=staff_data.payment_method,
        created_by=user.user_id
    )
    
    staff_dict = staff.model_dump()
    if staff_dict.get("date_of_joining"):
        staff_dict["date_of_joining"] = staff_dict["date_of_joining"].isoformat()
    if staff_dict.get("date_of_birth"):
        staff_dict["date_of_birth"] = staff_dict["date_of_birth"].isoformat()
    staff_dict["created_at"] = staff_dict["created_at"].isoformat()
    staff_dict["updated_at"] = staff_dict["updated_at"].isoformat()
    
    await db.staff.insert_one(staff_dict)
    return staff



@router.post("/hr/staff/bulk-import")
async def bulk_import_staff(request: Request, user: User = Depends(get_current_user)):
    """Bulk import staff from CSV/JSON data.

    Numeric salary fields are tolerant of non-numeric values: bad values get
    coerced to 0 and surface as a per-field warning so the row still imports.
    Saves the user from having to re-upload the whole sheet over a typo.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    data = await request.json()
    employees = data.get("employees", [])
    
    if not employees:
        raise HTTPException(status_code=400, detail="No employee data provided")
    
    imported = 0
    updated = 0
    skipped_duplicates = 0
    skipped_invalid = 0
    errors = []
    warnings = []       # numeric / validation soft warnings
    info = []           # INSERT/UPDATE notices (never mixed with warnings toast)

    import re as _re
    PAN_RE = _re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
    AADHAR_RE = _re.compile(r"^\d{12}$")
    DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%m/%d/%Y")

    def _safe_float(value, row_no, row_name, field, warn_list):
        """Tolerant float(): returns 0.0 + appends a warning on bad values."""
        if value in (None, "", "-"):
            return 0.0
        try:
            return float(str(value).replace(",", "").strip())
        except (ValueError, TypeError):
            warn_list.append(
                f"Row {row_no} ({row_name}): '{field}' value '{value}' is not numeric — defaulted to 0"
            )
            return 0.0

    def _normalise_date(value):
        """Accept DD-MM-YYYY / DD/MM/YYYY / ISO etc, return ISO YYYY-MM-DD string.

        Returns empty string if value is blank or unparseable — callers treat that
        as 'no date supplied' rather than poisoning the record with a bad string."""
        if value in (None, "", "-"):
            return ""
        s = str(value).strip()
        # Already ISO?
        if _re.match(r"^\d{4}-\d{2}-\d{2}", s):
            return s[:10]
        for fmt in DATE_FORMATS:
            try:
                return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                continue
        return ""

    def _normalise_long_number(value):
        """Excel often exports 12+ digit numbers (Aadhar, Account No) as scientific
        notation (e.g. 6.06602E+11). Convert back to a plain digit string."""
        if value in (None, "", "-"):
            return ""
        s = str(value).strip()
        if "e" in s.lower() or "E" in s:
            try:
                f = float(s)
                if f.is_integer():
                    return str(int(f))
            except (ValueError, TypeError):
                pass
        return s

    def _validate_row(emp, row_no, row_name):
        """Returns list of column-misalignment issues. Empty list = row is OK to import.

        Catches CSV-parsing breakage where unquoted commas in an address field shift
        every subsequent column. We flag a row as misaligned if a canonical numeric/format
        field clearly contains free text (e.g., aadhar='Sarvana Nagar', basic_salary='Mason',
        IFSC has digits-only, etc.).
        """
        issues = []
        # Aadhar: must be 12 digits (or empty)
        a = (emp.get("aadhar_number") or "").strip().replace(" ", "").replace("-", "")
        if a and not (AADHAR_RE.match(a) or AADHAR_RE.match(a.replace(".0", ""))):
            # Allow scientific notation common from Excel export, e.g., 6.06602E+11
            try:
                f = float(a)
                if not (1e11 <= f < 1e12):
                    issues.append(f"aadhar='{a[:30]}'")
            except (ValueError, TypeError):
                issues.append(f"aadhar='{a[:30]}'")
        # PAN: must match standard format (or empty)
        p = (emp.get("pan_number") or "").strip().upper()
        if p and not PAN_RE.match(p):
            issues.append(f"pan='{p[:30]}'")
        # All salary fields must be numeric or empty (string text = misaligned column)
        for fld in ("basic_salary", "hra", "da", "ta", "other_allowances",
                    "pf", "esi", "professional_tax", "tds", "other_deductions"):
            v = emp.get(fld)
            if v in (None, "", "-"):
                continue
            try:
                float(str(v).replace(",", "").strip())
            except (ValueError, TypeError):
                issues.append(f"{fld}='{str(v)[:30]}'")
        # Sanity check: salary > 1 crore is almost certainly a mis-aligned Aadhar/account
        try:
            bs = float(str(emp.get("basic_salary") or 0).replace(",", "").strip())
            if bs > 10_000_000:  # > 1 crore base salary is almost always bad
                issues.append(f"basic_salary={int(bs):,} (unrealistic — likely shifted column)")
        except (ValueError, TypeError):
            pass
        return issues

    for idx, emp in enumerate(employees):
        try:
            if not emp.get("name"):
                errors.append(f"Row {idx+1}: Name is required")
                continue

            row_no = idx + 1
            row_name = emp.get("name", "").strip()
            email_norm = (emp.get("email") or "").strip().lower()
            phone_norm = (emp.get("phone") or "").strip()

            # ---- Strict validation: reject mangled rows ----
            issues = _validate_row(emp, row_no, row_name)
            if issues:
                skipped_invalid += 1
                errors.append(
                    f"Row {row_no} ({row_name}): SKIPPED — column misalignment detected → " + "; ".join(issues[:3])
                )
                continue

            # ---- Duplicate detection ----
            # Match by email (if non-empty) OR by phone (if non-empty).
            # On match → UPDATE existing record with non-empty fields from this row
            # (user-requested: "duplicate details availible skip the balance need to update").
            dup_query_or = []
            if email_norm:
                dup_query_or.append({"email": {"$regex": f"^{_re.escape(email_norm)}$", "$options": "i"}})
            if phone_norm:
                dup_query_or.append({"phone": phone_norm})
            existing = None
            if dup_query_or:
                existing = await db.staff.find_one({"$or": dup_query_or}, {"_id": 0})

            # Normalise dates + long numerics once; reused in both insert/update paths
            doj = _normalise_date(emp.get("date_of_joining"))
            dob = _normalise_date(emp.get("date_of_birth"))
            aadhar_clean = _normalise_long_number(emp.get("aadhar_number"))
            account_clean = _normalise_long_number(emp.get("account_number"))

            # If EVERY salary field is blank the user clearly isn't providing
            # salary for this row — don't flood the toast with "defaulted to 0"
            # warnings.  Use a temporary bucket that only makes it into the
            # real warnings list if the row actually supplied some values.
            _salary_fields = ("basic_salary", "hra", "da", "ta", "other_allowances",
                              "pf", "esi", "professional_tax", "tds", "other_deductions",
                              "gross_salary", "experience_years")
            _row_all_empty = all(emp.get(f) in (None, "", "-") for f in _salary_fields)
            sal_warn_bucket = [] if _row_all_empty else warnings

            # Parse salary fields tolerantly — never blow up the row over
            # a bad numeric value; collect a warning instead.
            basic = _safe_float(emp.get("basic_salary"), row_no, row_name, "basic_salary", sal_warn_bucket)
            hra = _safe_float(emp.get("hra"), row_no, row_name, "hra", sal_warn_bucket)
            da = _safe_float(emp.get("da"), row_no, row_name, "da", sal_warn_bucket)
            ta = _safe_float(emp.get("ta"), row_no, row_name, "ta", sal_warn_bucket)
            other_allow = _safe_float(emp.get("other_allowances"), row_no, row_name, "other_allowances", sal_warn_bucket)
            pf = _safe_float(emp.get("pf"), row_no, row_name, "pf", sal_warn_bucket)
            esi = _safe_float(emp.get("esi"), row_no, row_name, "esi", sal_warn_bucket)
            pt = _safe_float(emp.get("professional_tax"), row_no, row_name, "professional_tax", sal_warn_bucket)
            tds = _safe_float(emp.get("tds"), row_no, row_name, "tds", sal_warn_bucket)
            other_ded = _safe_float(emp.get("other_deductions"), row_no, row_name, "other_deductions", sal_warn_bucket)
            exp_years = _safe_float(emp.get("experience_years"), row_no, row_name, "experience_years", sal_warn_bucket)

            # If user passed `gross_salary` directly (some Excel templates put a single
            # "Gross" column instead of basic/hra/da breakdown), honour it when the
            # per-component fields are all empty.
            gross_explicit = _safe_float(emp.get("gross_salary"), row_no, row_name, "gross_salary", sal_warn_bucket)
            gross = basic + hra + da + ta + other_allow
            if gross == 0 and gross_explicit > 0:
                gross = gross_explicit
                basic = gross_explicit  # treat as basic-only so breakdown stays self-consistent
            deductions = pf + esi + pt + tds + other_ded
            net = gross - deductions

            if existing:
                # ---- UPDATE existing record (only overwrite with non-empty values) ----
                update_doc = {"updated_at": datetime.now(timezone.utc).isoformat()}
                def _set_if(key, val):
                    if val not in (None, "", 0) or key in ("basic_salary", "hra", "da", "ta",
                        "other_allowances", "gross_salary", "pf", "esi", "professional_tax",
                        "tds", "other_deductions", "total_deductions", "net_salary"):
                        update_doc[key] = val
                # Text fields: only overwrite when CSV supplied something
                for k, v in (
                    ("name", row_name),
                    ("email", email_norm or existing.get("email", "")),
                    ("phone", phone_norm or existing.get("phone", "")),
                    ("department", (emp.get("department") or "").strip()),
                    ("designation", (emp.get("designation") or "").strip()),
                    ("date_of_joining", doj),
                    ("date_of_birth", dob),
                    ("gender", (emp.get("gender") or "").strip()),
                    ("marital_status", (emp.get("marital_status") or "").strip()),
                    ("blood_group", (emp.get("blood_group") or "").strip()),
                    ("father_name", (emp.get("father_name") or "").strip()),
                    ("mother_name", (emp.get("mother_name") or "").strip()),
                    ("address", (emp.get("address") or "").strip()),
                    ("current_address", (emp.get("current_address") or "").strip()),
                    ("permanent_address", (emp.get("permanent_address") or "").strip()),
                    ("aadhar_number", aadhar_clean),
                    ("pan_number", (emp.get("pan_number") or "").strip().upper()),
                    ("bank_name", (emp.get("bank_name") or "").strip()),
                    ("account_number", account_clean),
                    ("ifsc_code", (emp.get("ifsc_code") or "").strip().upper()),
                    ("payment_method", (emp.get("payment_method") or "").strip()),
                    ("notes", (emp.get("notes") or "").strip()),
                ):
                    if v:
                        update_doc[k] = v
                # Salary always updated (0 is a valid salary value) — keeps the
                # "balance" in sync as requested.
                update_doc.update({
                    "basic_salary": basic, "hra": hra, "da": da, "ta": ta,
                    "other_allowances": other_allow, "gross_salary": gross,
                    "pf": pf, "esi": esi, "professional_tax": pt, "tds": tds,
                    "other_deductions": other_ded, "total_deductions": deductions,
                    "net_salary": net,
                })
                await db.staff.update_one(
                    {"staff_id": existing["staff_id"]},
                    {"$set": update_doc}
                )
                updated += 1
                info.append(
                    f"Row {row_no} ({row_name}): UPDATED existing {existing.get('employee_code')}"
                )
                continue

            # Generate employee code
            count = await db.staff.count_documents({})
            employee_code = f"EMP{str(count + 1).zfill(4)}"
            
            staff_dict = {
                "staff_id": f"staff_{uuid.uuid4().hex[:12]}",
                "employee_code": employee_code,
                "name": emp.get("name", "").strip(),
                "email": emp.get("email", "").strip(),
                "phone": emp.get("phone", "").strip(),
                "department": emp.get("department", "").strip(),
                "designation": emp.get("designation", "").strip(),
                "date_of_joining": doj,
                "date_of_birth": dob,
                "gender": emp.get("gender", ""),
                "marital_status": emp.get("marital_status", ""),
                "blood_group": emp.get("blood_group", ""),
                "father_name": emp.get("father_name", ""),
                "mother_name": emp.get("mother_name", ""),
                "address": emp.get("address", ""),
                "permanent_address": emp.get("permanent_address", ""),
                "current_address": emp.get("current_address", ""),
                "aadhar_number": aadhar_clean,
                "pan_number": (emp.get("pan_number") or "").strip().upper(),
                "uan_number": emp.get("uan_number", ""),
                "esi_number": emp.get("esi_number", ""),
                "emergency_contact": emp.get("emergency_contact", ""),
                "emergency_contact_name": emp.get("emergency_contact_name", ""),
                "emergency_contact_relation": emp.get("emergency_contact_relation", ""),
                "emergency_contact_phone": emp.get("emergency_contact_phone", ""),
                "qualification": emp.get("qualification", ""),
                "experience_years": exp_years,
                "previous_employer": emp.get("previous_employer", ""),
                "basic_salary": basic, "hra": hra, "da": da, "ta": ta,
                "other_allowances": other_allow, "gross_salary": gross,
                "pf": pf, "esi": esi, "professional_tax": pt, "tds": tds,
                "other_deductions": other_ded, "total_deductions": deductions,
                "net_salary": net,
                "bank_name": emp.get("bank_name", ""),
                "account_number": account_clean,
                "ifsc_code": (emp.get("ifsc_code") or "").strip().upper(),
                "payment_method": emp.get("payment_method", "bank_transfer"),
                "notes": emp.get("notes", ""),
                "status": "active",
                "created_by": user.user_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.staff.insert_one(staff_dict)
            imported += 1
        except Exception as e:
            errors.append(f"Row {idx+1} ({emp.get('name','')}): {str(e)}")
    
    return {"imported": imported, "updated": updated, "skipped_duplicates": skipped_duplicates, "skipped_invalid": skipped_invalid, "errors": errors, "warnings": warnings, "info": info, "total": len(employees)}



@router.get("/hr/staff/{staff_id}")
async def get_staff(staff_id: str, user: User = Depends(get_current_user)):
    """Get a specific staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    return staff


@router.patch("/hr/staff/{staff_id}")
async def update_staff(staff_id: str, updates: dict, user: User = Depends(get_current_user)):
    """Update a staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Recalculate gross and net if salary fields updated
    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    # Merge updates
    for k, v in updates.items():
        staff[k] = v
    
    # Recalculate
    gross = staff.get("basic_salary", 0) + staff.get("hra", 0) + staff.get("da", 0) + staff.get("ta", 0) + staff.get("other_allowances", 0)
    deductions = staff.get("pf", 0) + staff.get("esi", 0) + staff.get("professional_tax", 0) + staff.get("tds", 0) + staff.get("other_deductions", 0)
    
    updates["gross_salary"] = gross
    updates["total_deductions"] = deductions
    updates["net_salary"] = gross - deductions
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.staff.update_one({"staff_id": staff_id}, {"$set": updates})

    # Auto-sync email and name to linked user account (Roles & Credentials)
    new_email = updates.get("email")
    new_name = updates.get("name")
    linked_user_id = staff.get("linked_user_id")
    if linked_user_id and (new_email or new_name):
        user_updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if new_email:
            new_email = new_email.lower().strip()
            existing = await db.users.find_one({"email": new_email, "user_id": {"$ne": linked_user_id}}, {"_id": 0, "user_id": 1})
            if not existing:
                user_updates["email"] = new_email
        if new_name:
            user_updates["name"] = new_name
        if len(user_updates) > 1:
            await db.users.update_one(
                {"user_id": linked_user_id},
                {"$set": user_updates}
            )

    return {"message": "Staff updated"}


@router.delete("/hr/staff/{staff_id}")
async def delete_staff(
    staff_id: str,
    exit_reason: Optional[str] = None,
    rehire_eligibility: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """Terminate a staff member (soft delete) - HR and Super Admin.

    Optional query/body params:
      - exit_reason: free-text reason captured by HR in the termination dialog
      - rehire_eligibility: "eligible" | "not_eligible"
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin or HR can terminate staff")

    set_doc = {
        "status": "terminated",
        "terminated_by": user.user_id,
        "terminated_by_name": user.name,
        "terminated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if exit_reason:
        set_doc["exit_reason"] = exit_reason
    if rehire_eligibility:
        rg = rehire_eligibility.lower().replace(" ", "_").replace("-", "_")
        if rg not in ("eligible", "not_eligible"):
            raise HTTPException(status_code=400, detail="rehire_eligibility must be 'eligible' or 'not_eligible'")
        set_doc["rehire_eligibility"] = rg

    result = await db.staff.update_one({"staff_id": staff_id}, {"$set": set_doc})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Deactivate the linked user account so they can no longer log in
    staff_doc = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0, "linked_user_id": 1, "email": 1, "name": 1})
    linked_user_id = (staff_doc or {}).get("linked_user_id")
    if linked_user_id:
        await db.users.update_one({"user_id": linked_user_id}, {"$set": {"is_active": False}})

    return {"message": "Staff terminated"}


@router.delete("/hr/staff/{staff_id}/permanent")
async def permanently_delete_staff(staff_id: str, user: User = Depends(get_current_user)):
    """Permanently delete a terminated staff member and all related records"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin or HR can permanently delete staff")
    
    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0, "status": 1, "linked_user_id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    if staff.get("status") != "terminated":
        raise HTTPException(status_code=400, detail="Only terminated employees can be permanently deleted")
    
    await db.staff.delete_one({"staff_id": staff_id})
    await db.attendance.delete_many({"staff_id": staff_id})
    await db.leave_requests.delete_many({"staff_id": staff_id})
    
    return {"message": "Staff permanently deleted"}



# ==================== HR EMPLOYEE PROFILE ENDPOINTS ====================

@router.patch("/hr/staff/{staff_id}/profile")
async def update_staff_profile(staff_id: str, updates: dict, user: User = Depends(get_current_user)):
    """Update extended profile fields for a staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin and HR can edit profiles")
    
    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    # Allowed extended profile fields
    allowed_fields = [
        "father_name", "mother_name", "blood_group", "gender", "marital_status",
        "aadhar_number", "pan_number", "uan_number", "esi_number",
        "permanent_address", "current_address",
        "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone",
        "profile_photo_id", "resume_file_id", "aadhar_doc_id", "pan_doc_id",
        "qualification", "experience_years", "previous_employer",
        "linked_user_id", "notes"
    ]
    
    filtered = {k: v for k, v in updates.items() if k in allowed_fields}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    filtered["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.staff.update_one({"staff_id": staff_id}, {"$set": filtered})
    return {"message": "Profile updated"}


@router.post("/hr/staff/{staff_id}/upload-document")
async def upload_staff_document(
    staff_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form("resume"),
    user: User = Depends(get_current_user)
):
    """Upload document (resume, photo, aadhar, pan) for staff"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin and HR can upload documents")
    
    from core.storage import put_object, APP_NAME, MIME_TYPES
    
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 10MB")
    
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/hr/{staff_id}/{doc_type}/{file_id}.{ext}"
    
    try:
        result = put_object(storage_path, data, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
    file_record = {
        "file_id": file_id,
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "doc_type": doc_type,
        "staff_id": staff_id,
        "uploaded_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.hr_documents.insert_one(file_record)
    
    # Update staff record with file reference
    field_map = {
        "resume": "resume_file_id",
        "photo": "profile_photo_id",
        "aadhar": "aadhar_doc_id",
        "pan": "pan_doc_id"
    }
    if doc_type in field_map:
        await db.staff.update_one(
            {"staff_id": staff_id},
            {"$set": {field_map[doc_type]: file_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"file_id": file_id, "storage_path": storage_path, "message": f"{doc_type} uploaded"}


@router.get("/hr/staff/{staff_id}/documents")
async def get_staff_documents(staff_id: str, user: User = Depends(get_current_user)):
    """Get all documents for a staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    docs = await db.hr_documents.find({"staff_id": staff_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return docs


# ==================== HR ROLES & CREDENTIALS ENDPOINTS ====================

@router.get("/hr/users")
async def get_all_users_for_hr(role: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all users with their roles and credentials info.

    Planning Head can also list Planning Persons (read-only) via `?role=planning_person`
    so the Assign Planning Person dropdown can show the team list.
    """
    is_planning_head = user.role == UserRole.PLANNING
    is_hr_or_admin = user.role in [UserRole.SUPER_ADMIN, UserRole.HR]
    if not is_hr_or_admin:
        # Planning Head — restricted to listing planning_person only
        if not (is_planning_head and role == "planning_person"):
            raise HTTPException(status_code=403, detail="Only Super Admin and HR can view user credentials")

    query: Dict[str, Any] = {}
    if role:
        query["role"] = role
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    
    # Batch fetch all staff records with linked_user_id in one query
    all_staff = await db.staff.find(
        {"linked_user_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "staff_id": 1, "employee_code": 1, "designation": 1, "department": 1, "linked_user_id": 1}
    ).to_list(500)
    staff_map = {s["linked_user_id"]: s for s in all_staff}
    
    for u in users:
        link = staff_map.get(u.get("user_id"))
        if link:
            u["staff_link"] = {k: v for k, v in link.items() if k != "linked_user_id"}
        else:
            u["staff_link"] = None
    
    return users


@router.patch("/hr/users/{user_id}/update-role")
async def update_user_role(user_id: str, updates: dict, user: User = Depends(get_current_user)):
    """Update a user's role, active status, name, phone, or email.

    HR can edit users EXCEPT super_admin / general_manager roles (cannot
    promote anyone to / demote anyone from those privileged roles).
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin or HR can edit users")

    # Look up target user once for HR guard rails
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "role": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    protected_roles = {UserRole.SUPER_ADMIN.value, UserRole.GENERAL_MANAGER.value}
    if user.role == UserRole.HR:
        if target.get("role") in protected_roles:
            raise HTTPException(status_code=403, detail="HR cannot edit Super Admin / General Manager users")
        if "role" in updates and updates["role"] in protected_roles:
            raise HTTPException(status_code=403, detail="HR cannot assign Super Admin / General Manager roles")

    allowed = {}
    if "role" in updates:
        allowed["role"] = updates["role"]
    if "is_active" in updates:
        allowed["is_active"] = updates["is_active"]
    if "name" in updates:
        allowed["name"] = updates["name"]
    if "phone" in updates:
        allowed["phone"] = updates["phone"]
    if "email" in updates and updates["email"]:
        new_email = updates["email"].lower().strip()
        existing = await db.users.find_one({"email": new_email, "user_id": {"$ne": user_id}}, {"_id": 0, "user_id": 1})
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        allowed["email"] = new_email
    
    if not allowed:
        raise HTTPException(status_code=400, detail="No valid fields")
    
    allowed["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.users.update_one({"user_id": user_id}, {"$set": allowed})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Auto-sync email and name to linked staff record (Employee Profiles)
    sync_fields = {}
    if "email" in allowed:
        sync_fields["email"] = allowed["email"]
    if "name" in allowed:
        sync_fields["name"] = allowed["name"]
    if "phone" in allowed:
        sync_fields["phone"] = allowed["phone"]
    if sync_fields:
        sync_fields["updated_at"] = allowed["updated_at"]
        await db.staff.update_one({"linked_user_id": user_id}, {"$set": sync_fields})
    
    return {"message": "User updated"}


@router.post("/hr/users/{user_id}/reset-password")
async def hr_reset_password(user_id: str, body: dict, user: User = Depends(get_current_user)):
    """HR/Admin resets a user's password"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin or HR can reset passwords")
    
    new_password = body.get("new_password")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    import bcrypt
    hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hashed, "password_set": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Password reset successful"}


@router.post("/hr/users/{user_id}/link-staff")
async def link_user_to_staff(user_id: str, body: dict, user: User = Depends(get_current_user)):
    """Link a user account to a staff employee record"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    staff_id = body.get("staff_id")
    if not staff_id:
        raise HTTPException(status_code=400, detail="staff_id required")
    
    # Update staff record
    await db.staff.update_one(
        {"staff_id": staff_id},
        {"$set": {"linked_user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "User linked to staff record"}


@router.post("/hr/users/create")
async def create_user_account(body: dict, user: User = Depends(get_current_user)):
    """Create a new user account with email/password/role - by Super Admin or HR"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Only Super Admin and HR can create users")

    # HR cannot create super_admin or hr roles
    if user.role == UserRole.HR and body.get("role") in ["super_admin", "hr"]:
        raise HTTPException(status_code=403, detail="HR cannot create Super Admin or HR roles")

    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    confirm_password = body.get("confirm_password", "")
    role = body.get("role", "")
    staff_id = body.get("staff_id")  # optional - link to employee
    name = body.get("name", "")

    if not email or not password or not role:
        raise HTTPException(status_code=400, detail="Email, password and role are required")
    if password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check if email already exists
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    import bcrypt
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    # If staff_id provided, get name from employee record
    if staff_id:
        staff_doc = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0, "name": 1})
        if staff_doc:
            name = name or staff_doc.get("name", "")

    new_user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "password_hash": hashed,
        "password_set": True,
        "name": name or email.split("@")[0],
        "role": role,
        "is_active": True,
        "phone": body.get("phone", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.users.insert_one(new_user)
    new_user.pop("_id", None)
    new_user.pop("password_hash", None)

    # Link to staff record if provided
    if staff_id:
        await db.staff.update_one(
            {"staff_id": staff_id},
            {"$set": {"linked_user_id": new_user["user_id"], "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    return new_user


@router.delete("/hr/users/{user_id}")
async def hr_delete_user(user_id: str, user: User = Depends(get_current_user)):
    """Delete a user account - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    if user.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})

    # Unlink from any staff record
    await db.staff.update_many(
        {"linked_user_id": user_id},
        {"$unset": {"linked_user_id": ""}}
    )

    return {"message": "User deleted"}


# ==================== ATTENDANCE ENDPOINTS ====================

@router.get("/hr/attendance")
async def get_attendance(
    staff_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: User = Depends(get_current_user)
):
    """Get attendance records"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if staff_id:
        query["staff_id"] = staff_id
    
    # Filter by month/year if provided
    if month and year:
        start_date = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
        end_month = month + 1 if month < 12 else 1
        end_year = year if month < 12 else year + 1
        end_date = datetime(end_year, end_month, 1, tzinfo=timezone.utc).isoformat()
        query["date"] = {"$gte": start_date, "$lt": end_date}
    
    attendance = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return attendance


class AttendanceCreate(BaseModel):
    staff_id: str
    date: datetime
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str = "present"
    leave_type: Optional[str] = None
    overtime_hours: float = 0
    remarks: Optional[str] = None


@router.post("/hr/attendance")
async def create_attendance(att: AttendanceCreate, user: User = Depends(get_current_user)):
    """Record attendance"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get staff name
    staff = await db.staff.find_one({"staff_id": att.staff_id}, {"_id": 0, "name": 1})
    staff_name = staff.get("name") if staff else None
    
    # Calculate work hours if check in/out provided
    work_hours = 0
    if att.check_in and att.check_out:
        delta = att.check_out - att.check_in
        work_hours = round(delta.total_seconds() / 3600, 2)
    
    attendance = Attendance(
        staff_id=att.staff_id,
        staff_name=staff_name,
        date=att.date,
        check_in=att.check_in,
        check_out=att.check_out,
        status=att.status,
        leave_type=att.leave_type,
        work_hours=work_hours,
        overtime_hours=att.overtime_hours,
        remarks=att.remarks,
        recorded_by=user.user_id
    )
    
    att_dict = attendance.model_dump()
    att_dict["date"] = att_dict["date"].isoformat()
    if att_dict.get("check_in"):
        att_dict["check_in"] = att_dict["check_in"].isoformat()
    if att_dict.get("check_out"):
        att_dict["check_out"] = att_dict["check_out"].isoformat()
    att_dict["created_at"] = att_dict["created_at"].isoformat()
    
    await db.attendance.insert_one(att_dict)
    return attendance


@router.post("/hr/attendance/bulk")
async def create_bulk_attendance(records: List[AttendanceCreate], user: User = Depends(get_current_user)):
    """Record attendance for multiple staff at once"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get all staff names in one query
    staff_ids = list(set(r.staff_id for r in records))
    staff_list = await db.staff.find({"staff_id": {"$in": staff_ids}}, {"_id": 0, "staff_id": 1, "name": 1}).to_list(500)
    staff_map = {s["staff_id"]: s["name"] for s in staff_list}
    
    attendance_docs = []
    for att in records:
        work_hours = 0
        if att.check_in and att.check_out:
            delta = att.check_out - att.check_in
            work_hours = round(delta.total_seconds() / 3600, 2)
        
        attendance = Attendance(
            staff_id=att.staff_id,
            staff_name=staff_map.get(att.staff_id),
            date=att.date,
            check_in=att.check_in,
            check_out=att.check_out,
            status=att.status,
            leave_type=att.leave_type,
            work_hours=work_hours,
            overtime_hours=att.overtime_hours,
            remarks=att.remarks,
            recorded_by=user.user_id
        )
        
        att_dict = attendance.model_dump()
        att_dict["date"] = att_dict["date"].isoformat()
        if att_dict.get("check_in"):
            att_dict["check_in"] = att_dict["check_in"].isoformat()
        if att_dict.get("check_out"):
            att_dict["check_out"] = att_dict["check_out"].isoformat()
        att_dict["created_at"] = att_dict["created_at"].isoformat()
        
        attendance_docs.append(att_dict)
    
    if attendance_docs:
        await db.attendance.insert_many(attendance_docs)
    
    return {"message": f"Created {len(attendance_docs)} attendance records"}


# ==================== PAYROLL ENDPOINTS ====================

@router.get("/hr/payroll")
async def get_payroll_list(
    month: Optional[int] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get payroll records"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if month:
        query["month"] = month
    if year:
        query["year"] = year
    if status:
        query["status"] = status
    
    payroll = await db.payroll.find(query, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(500)
    return payroll


class PayrollGenerate(BaseModel):
    month: int
    year: int


@router.post("/hr/payroll/generate")
async def generate_payroll(data: PayrollGenerate, user: User = Depends(get_current_user)):
    """Generate payroll for all active staff for a month"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check if payroll already exists for this month
    existing = await db.payroll.count_documents({"month": data.month, "year": data.year})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Payroll already generated for this month")
    
    # Get all active staff
    staff_list = await db.staff.find({"status": "active"}, {"_id": 0}).to_list(500)
    
    # Get attendance for this month
    start_date = datetime(data.year, data.month, 1, tzinfo=timezone.utc).isoformat()
    end_month = data.month + 1 if data.month < 12 else 1
    end_year = data.year if data.month < 12 else data.year + 1
    end_date = datetime(end_year, end_month, 1, tzinfo=timezone.utc).isoformat()
    
    attendance = await db.attendance.find({
        "date": {"$gte": start_date, "$lt": end_date}
    }, {"_id": 0}).to_list(5000)
    
    # Group attendance by staff
    attendance_by_staff = {}
    for att in attendance:
        sid = att["staff_id"]
        if sid not in attendance_by_staff:
            attendance_by_staff[sid] = {"present": 0, "absent": 0, "leave": 0, "half_day": 0, "overtime": 0}
        status = att.get("status", "present")
        if status == "present":
            attendance_by_staff[sid]["present"] += 1
        elif status == "absent":
            attendance_by_staff[sid]["absent"] += 1
        elif status == "leave":
            attendance_by_staff[sid]["leave"] += 1
        elif status == "half_day":
            attendance_by_staff[sid]["present"] += 0.5
        attendance_by_staff[sid]["overtime"] += att.get("overtime_hours", 0)
    
    # Generate payroll for each staff
    payroll_docs = []
    for s in staff_list:
        att_summary = attendance_by_staff.get(s["staff_id"], {"present": 0, "absent": 0, "leave": 0, "overtime": 0})
        
        # Calculate working days (assuming 26 working days)
        working_days = 26
        days_present = att_summary["present"]
        days_absent = att_summary["absent"]
        leaves_taken = att_summary["leave"]
        overtime_hours = att_summary["overtime"]
        
        # Calculate pay
        basic = s.get("basic_salary", 0)
        hra = s.get("hra", 0)
        da = s.get("da", 0)
        ta = s.get("ta", 0)
        other_allow = s.get("other_allowances", 0)
        
        # Pro-rata calculation based on attendance
        attendance_factor = days_present / working_days if working_days > 0 else 1
        
        gross = (basic + hra + da + ta + other_allow) * attendance_factor
        overtime_pay = overtime_hours * (basic / (working_days * 8)) * 1.5  # 1.5x overtime rate
        
        pf = s.get("pf", 0) * attendance_factor
        esi = s.get("esi", 0) * attendance_factor
        pt = s.get("professional_tax", 0)
        tds = s.get("tds", 0) * attendance_factor
        other_ded = s.get("other_deductions", 0)
        
        total_ded = pf + esi + pt + tds + other_ded
        net_pay = gross + overtime_pay - total_ded
        
        payroll = Payroll(
            staff_id=s["staff_id"],
            staff_name=s["name"],
            employee_code=s.get("employee_code"),
            department=s.get("department"),
            designation=s.get("designation"),
            month=data.month,
            year=data.year,
            working_days=working_days,
            days_present=int(days_present),
            days_absent=days_absent,
            leaves_taken=leaves_taken,
            overtime_hours=overtime_hours,
            basic_salary=round(basic * attendance_factor, 2),
            hra=round(hra * attendance_factor, 2),
            da=round(da * attendance_factor, 2),
            ta=round(ta * attendance_factor, 2),
            other_allowances=round(other_allow * attendance_factor, 2),
            overtime_pay=round(overtime_pay, 2),
            gross_earnings=round(gross + overtime_pay, 2),
            pf=round(pf, 2),
            esi=round(esi, 2),
            professional_tax=pt,
            tds=round(tds, 2),
            other_deductions=other_ded,
            total_deductions=round(total_ded, 2),
            net_pay=round(net_pay, 2),
            payment_method=s.get("payment_method", PaymentMethodType.BANK_TRANSFER),
            bank_name=s.get("bank_name"),
            account_number=s.get("account_number"),
            status=PayrollStatus.DRAFT,
            created_by=user.user_id
        )
        
        pay_dict = payroll.model_dump()
        pay_dict["created_at"] = pay_dict["created_at"].isoformat()
        pay_dict["updated_at"] = pay_dict["updated_at"].isoformat()
        payroll_docs.append(pay_dict)
    
    if payroll_docs:
        await db.payroll.insert_many(payroll_docs)
    
    return {"message": f"Generated payroll for {len(payroll_docs)} staff members"}


@router.patch("/hr/payroll/{payroll_id}/approve")
async def approve_payroll(payroll_id: str, user: User = Depends(get_current_user)):
    """Approve payroll"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.payroll.update_one(
        {"payroll_id": payroll_id, "status": {"$in": ["draft", "pending_approval"]}},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Payroll not found or already processed")
    
    return {"message": "Payroll approved"}


class PayrollPayment(BaseModel):
    transaction_id: str
    payment_method: PaymentMethodType
    remarks: Optional[str] = None


@router.patch("/hr/payroll/{payroll_id}/pay")
async def process_payroll_payment(payroll_id: str, payment: PayrollPayment, user: User = Depends(get_current_user)):
    """Mark payroll as paid with OTP verification"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    payroll = await db.payroll.find_one({"payroll_id": payroll_id}, {"_id": 0})
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")
    
    if payroll.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Payroll must be approved first")
    
    result = await db.payroll.update_one(
        {"payroll_id": payroll_id},
        {"$set": {
            "status": "paid",
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "transaction_id": payment.transaction_id,
            "payment_method": payment.payment_method,
            "remarks": payment.remarks,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transaction record
    transaction = Transaction(
        transaction_type=TransactionType.SALARY,
        amount=payroll.get("net_pay", 0),
        payment_method=payment.payment_method,
        payment_date=datetime.now(timezone.utc),
        reference_number=payment.transaction_id,
        party_name=payroll.get("staff_name"),
        party_type="staff",
        description=f"Salary for {payroll.get('month')}/{payroll.get('year')}",
        category="salary",
        recorded_by=user.user_id,
        recorded_by_name=user.name
    )
    
    txn_dict = transaction.model_dump()
    txn_dict["payment_date"] = txn_dict["payment_date"].isoformat()
    txn_dict["created_at"] = txn_dict["created_at"].isoformat()
    txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
    await db.transactions.insert_one(txn_dict)
    
    return {"message": "Payroll paid"}


@router.post("/hr/payroll/bulk-pay")
async def bulk_pay_payroll(month: int, year: int, payment: PayrollPayment, user: User = Depends(get_current_user)):
    """Pay all approved payrolls for a month"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get all approved payrolls for this month
    payrolls = await db.payroll.find({
        "month": month, "year": year, "status": "approved"
    }, {"_id": 0}).to_list(500)
    
    if not payrolls:
        raise HTTPException(status_code=400, detail="No approved payrolls found")
    
    # Update all to paid
    await db.payroll.update_many(
        {"month": month, "year": year, "status": "approved"},
        {"$set": {
            "status": "paid",
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "transaction_id": payment.transaction_id,
            "payment_method": payment.payment_method,
            "remarks": payment.remarks,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transactions for each
    transactions = []
    for p in payrolls:
        txn = Transaction(
            transaction_type=TransactionType.SALARY,
            amount=p.get("net_pay", 0),
            payment_method=payment.payment_method,
            payment_date=datetime.now(timezone.utc),
            reference_number=payment.transaction_id,
            party_name=p.get("staff_name"),
            party_type="staff",
            description=f"Salary for {month}/{year}",
            category="salary",
            recorded_by=user.user_id,
            recorded_by_name=user.name
        )
        txn_dict = txn.model_dump()
        txn_dict["payment_date"] = txn_dict["payment_date"].isoformat()
        txn_dict["created_at"] = txn_dict["created_at"].isoformat()
        txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
        transactions.append(txn_dict)
    
    if transactions:
        await db.transactions.insert_many(transactions)
    
    return {"message": f"Paid {len(payrolls)} payrolls", "total_amount": sum(p.get("net_pay", 0) for p in payrolls)}


# ==================== PAYMENT VERIFICATION (OTP) ENDPOINTS ====================

@router.post("/accountant/payment-request/initiate")
async def initiate_payment_request(
    request_type: str,
    request_id: str,
    amount: float,
    party_name: str,
    party_email: Optional[str] = None,
    party_phone: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Initiate a payment request with OTP verification"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Generate OTP
    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    verification = PaymentVerification(
        request_type=request_type,
        request_id=request_id,
        amount=amount,
        party_name=party_name,
        party_email=party_email,
        party_phone=party_phone,
        otp_code=otp,
        otp_sent_at=datetime.now(timezone.utc),
        otp_expires_at=expires_at,
        status=PaymentRequestStatus.OTP_SENT,
        requested_by=user.user_id,
        requested_by_name=user.name
    )
    
    ver_dict = verification.model_dump()
    ver_dict["otp_sent_at"] = ver_dict["otp_sent_at"].isoformat()
    ver_dict["otp_expires_at"] = ver_dict["otp_expires_at"].isoformat()
    ver_dict["created_at"] = ver_dict["created_at"].isoformat()
    ver_dict["updated_at"] = ver_dict["updated_at"].isoformat()
    
    await db.payment_verifications.insert_one(ver_dict)
    
    # Try to send OTP via email if configured
    email_sent = False
    if party_email and resend.api_key:
        try:
            await send_notification_email(
                party_email,
                "Payment Verification OTP",
                f"""
                <h2>Payment Verification OTP</h2>
                <p>Your OTP for payment verification is:</p>
                <h1 style="font-size: 32px; letter-spacing: 4px; color: #2563eb;">{otp}</h1>
                <p>Amount: ₹{amount:,.2f}</p>
                <p>This OTP expires in 10 minutes.</p>
                """
            )
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to send OTP email: {e}")
    
    return {
        "verification_id": verification.verification_id,
        "message": "OTP sent successfully" if email_sent else "OTP generated (email not configured)",
        "otp_for_testing": otp if not email_sent else None,  # Show OTP if email not sent (MOCK mode)
        "expires_in_minutes": 10
    }


class OTPVerify(BaseModel):
    verification_id: str
    otp: str


@router.post("/accountant/payment-request/verify-otp")
async def verify_payment_otp(data: OTPVerify, user: User = Depends(get_current_user)):
    """Verify OTP for payment request"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    verification = await db.payment_verifications.find_one(
        {"verification_id": data.verification_id},
        {"_id": 0}
    )
    
    if not verification:
        raise HTTPException(status_code=404, detail="Verification request not found")
    
    if verification.get("status") == "otp_verified":
        raise HTTPException(status_code=400, detail="OTP already verified")
    
    if verification.get("otp_attempts", 0) >= verification.get("max_attempts", 3):
        raise HTTPException(status_code=400, detail="Maximum OTP attempts exceeded")
    
    # Check expiry
    expires_at = verification.get("otp_expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP has expired")
    
    # Verify OTP
    if verification.get("otp_code") != data.otp:
        await db.payment_verifications.update_one(
            {"verification_id": data.verification_id},
            {"$inc": {"otp_attempts": 1}}
        )
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # OTP verified
    await db.payment_verifications.update_one(
        {"verification_id": data.verification_id},
        {"$set": {
            "otp_verified": True,
            "otp_verified_at": datetime.now(timezone.utc).isoformat(),
            "status": "otp_verified",
            "verified_by": user.user_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "OTP verified successfully", "verification_id": data.verification_id}


class CompletePayment(BaseModel):
    verification_id: str
    transaction_id: str
    payment_method: PaymentMethodType
    remarks: Optional[str] = None


@router.post("/accountant/payment-request/complete")
async def complete_payment(data: CompletePayment, user: User = Depends(get_current_user)):
    """Complete a payment after OTP verification"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    verification = await db.payment_verifications.find_one(
        {"verification_id": data.verification_id},
        {"_id": 0}
    )
    
    if not verification:
        raise HTTPException(status_code=404, detail="Verification request not found")
    
    if verification.get("status") != "otp_verified":
        raise HTTPException(status_code=400, detail="OTP not verified")
    
    # Update verification as completed
    await db.payment_verifications.update_one(
        {"verification_id": data.verification_id},
        {"$set": {
            "status": "completed",
            "transaction_id": data.transaction_id,
            "payment_method": data.payment_method,
            "remarks": data.remarks,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create transaction record
    transaction = Transaction(
        transaction_type=TransactionType.VENDOR_PAYMENT,
        amount=verification.get("amount", 0),
        payment_method=data.payment_method,
        payment_date=datetime.now(timezone.utc),
        reference_number=data.transaction_id,
        party_name=verification.get("party_name"),
        party_type="vendor",
        description=f"Payment for {verification.get('request_type')} - {verification.get('request_id')}",
        category=verification.get("request_type"),
        recorded_by=user.user_id,
        recorded_by_name=user.name
    )
    
    txn_dict = transaction.model_dump()
    txn_dict["payment_date"] = txn_dict["payment_date"].isoformat()
    txn_dict["created_at"] = txn_dict["created_at"].isoformat()
    txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
    await db.transactions.insert_one(txn_dict)
    
    return {"message": "Payment completed", "transaction_id": transaction.transaction_id}


@router.get("/accountant/payment-requests")
async def get_payment_requests(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all payment verification requests"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.payment_verifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return requests


# ==================== END COMPREHENSIVE ACCOUNTANT BOARD ENDPOINTS ====================


# ==================== FINANCIAL CONTROL ENDPOINTS ====================

async def create_financial_audit_log(
    entity_type: str,
    entity_id: str,
    action: FinancialAuditAction,
    description: str,
    user: User,
    amount: Optional[float] = None,
    project_id: Optional[str] = None,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None
):
    """Create an immutable financial audit log entry"""
    audit = FinancialAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        description=description,
        performed_by=user.user_id,
        performed_by_name=user.name,
        amount=amount,
        project_id=project_id,
        old_value=old_value,
        new_value=new_value
    )
    audit_dict = audit.model_dump()
    audit_dict["performed_at"] = audit_dict["performed_at"].isoformat()
    await db.financial_audit_logs.insert_one(audit_dict)
    return audit


# ==================== INDIRECT COST ENDPOINTS ====================

INDIRECT_COST_CATEGORIES = [
    {"value": "marketing", "label": "Marketing & Advertising"},
    {"value": "office_rent", "label": "Office Rent"},
    {"value": "staff_salary", "label": "Staff Salary"},
    {"value": "utilities", "label": "Utilities (Electricity, Water, etc.)"},
    {"value": "insurance", "label": "Insurance"},
    {"value": "maintenance", "label": "Maintenance"},
    {"value": "travel", "label": "Travel & Conveyance"},
    {"value": "communication", "label": "Communication (Phone, Internet)"},
    {"value": "legal_professional", "label": "Legal & Professional Fees"},
    {"value": "bank_charges", "label": "Bank Charges"},
    {"value": "depreciation", "label": "Depreciation"},
    {"value": "other", "label": "Other"}
]


@router.get("/financial/indirect-cost-categories")
async def get_indirect_cost_categories(user: User = Depends(get_current_user)):
    """Get list of indirect cost categories"""
    return INDIRECT_COST_CATEGORIES


@router.get("/financial/indirect-costs")
async def get_indirect_costs(
    status: Optional[str] = None,
    category: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get indirect costs (Accountant, Super Admin, GM only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    
    costs = await db.indirect_costs.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return costs


class IndirectCostCreate(BaseModel):
    category: IndirectCostCategory
    description: str
    amount: float
    payment_method: PaymentMethodType
    reference_number: Optional[str] = None
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    remarks: Optional[str] = None


@router.post("/financial/indirect-costs")
async def create_indirect_cost(data: IndirectCostCreate, user: User = Depends(get_current_user)):
    """Create indirect cost entry (Accountant or Super Admin) - Requires approval"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant or Super Admin can create indirect cost entries")
    
    cost = IndirectCost(
        category=data.category,
        description=data.description,
        amount=data.amount,
        payment_method=data.payment_method,
        reference_number=data.reference_number,
        vendor_name=data.vendor_name,
        invoice_number=data.invoice_number,
        invoice_date=data.invoice_date,
        remarks=data.remarks,
        status=IndirectCostStatus.PENDING,
        created_by=user.user_id,
        created_by_name=user.name
    )
    
    cost_dict = cost.model_dump()
    if cost_dict.get("invoice_date"):
        cost_dict["invoice_date"] = cost_dict["invoice_date"].isoformat()
    cost_dict["created_at"] = cost_dict["created_at"].isoformat()
    cost_dict["updated_at"] = cost_dict["updated_at"].isoformat()
    
    await db.indirect_costs.insert_one(cost_dict)
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="indirect_cost",
        entity_id=cost.indirect_cost_id,
        action=FinancialAuditAction.CREATED,
        description=f"Indirect cost created: {data.category} - {data.description}",
        user=user,
        amount=data.amount
    )
    
    return {"message": "Indirect cost created. Pending approval from Super Admin or GM.", "indirect_cost_id": cost.indirect_cost_id}


class IndirectCostApproval(BaseModel):
    approved: bool
    rejection_reason: Optional[str] = None


@router.patch("/financial/indirect-costs/{cost_id}/approve")
async def approve_indirect_cost(cost_id: str, data: IndirectCostApproval, user: User = Depends(get_current_user)):
    """Approve or reject indirect cost (Super Admin or GM only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Super Admin or GM can approve indirect costs")
    
    cost = await db.indirect_costs.find_one({"indirect_cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Indirect cost not found")
    
    if cost.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only approve/reject pending entries")
    
    if data.approved:
        update = {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        action = FinancialAuditAction.APPROVED
        message = "Indirect cost approved"
    else:
        update = {
            "status": "rejected",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": data.rejection_reason,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        action = FinancialAuditAction.REJECTED
        message = "Indirect cost rejected"
    
    await db.indirect_costs.update_one({"indirect_cost_id": cost_id}, {"$set": update})
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="indirect_cost",
        entity_id=cost_id,
        action=action,
        description=f"{message}: {cost.get('description')}",
        user=user,
        amount=cost.get("amount")
    )
    
    return {"message": message}


class IndirectCostConfirm(BaseModel):
    payment_date: datetime
    reference_number: str
    remarks: Optional[str] = None


@router.patch("/financial/indirect-costs/{cost_id}/confirm")
async def confirm_indirect_cost(cost_id: str, data: IndirectCostConfirm, user: User = Depends(get_current_user)):
    """Confirm payment of approved indirect cost (Accountant or Super Admin)"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant or Super Admin can confirm payment")
    
    cost = await db.indirect_costs.find_one({"indirect_cost_id": cost_id}, {"_id": 0})
    if not cost:
        raise HTTPException(status_code=404, detail="Indirect cost not found")
    
    if cost.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Can only confirm approved entries")
    
    update = {
        "status": "confirmed",
        "payment_date": data.payment_date.isoformat(),
        "reference_number": data.reference_number,
        "remarks": data.remarks or cost.get("remarks"),
        "confirmed_by": user.user_id,
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
        "is_locked": True,  # Lock after confirmation
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.indirect_costs.update_one({"indirect_cost_id": cost_id}, {"$set": update})
    
    # ===== AUTO-DISTRIBUTE ACROSS ACTIVE PROJECTS =====
    cost_amount = cost.get("amount", 0)
    projects = await db.projects.find(
        {"status": {"$nin": ["cancelled", "completed"]}},
        {"_id": 0, "project_id": 1, "name": 1, "total_value": 1}
    ).to_list(100)
    
    if projects:
        portfolio_total = sum(p.get("total_value", 0) for p in projects)
        indirect_pct = await get_indirect_cost_pct()
        
        # Get current allocations
        existing_allocs = await db.indirect_cost_allocations.find({}, {"_id": 0, "project_id": 1, "amount": 1}).to_list(5000)
        alloc_by_project = {}
        for a in existing_allocs:
            pid = a.get("project_id")
            alloc_by_project[pid] = alloc_by_project.get(pid, 0) + a.get("amount", 0)
        
        # Distribute proportionally with budget cap
        overflow = 0
        alloc_records = []
        available_projects = []
        
        for p in sorted(projects, key=lambda x: x.get("total_value", 0), reverse=True):
            value = p.get("total_value", 0)
            share_pct = (value / portfolio_total) if portfolio_total > 0 else 0
            share_amount = round(cost_amount * share_pct, 2)
            indirect_budget = value * indirect_pct
            already_spent = alloc_by_project.get(p["project_id"], 0)
            remaining = indirect_budget - already_spent
            
            if remaining <= 0:
                overflow += share_amount
            elif share_amount > remaining:
                overflow += (share_amount - remaining)
                alloc_records.append({"project": p, "amount": round(remaining, 2), "share_pct": share_pct})
            else:
                alloc_records.append({"project": p, "amount": share_amount, "share_pct": share_pct})
                available_projects.append({"project": p, "remaining": remaining - share_amount, "share_pct": share_pct})
        
        # Redistribute overflow
        if overflow > 0 and available_projects:
            avail_total = sum(a["remaining"] for a in available_projects)
            for ap in available_projects:
                extra = round(overflow * (ap["remaining"] / avail_total), 2) if avail_total > 0 else 0
                for ar in alloc_records:
                    if ar["project"]["project_id"] == ap["project"]["project_id"]:
                        ar["amount"] = round(ar["amount"] + min(extra, ap["remaining"]), 2)
                        break
        
        # Save allocation records
        now_str = datetime.now(timezone.utc).isoformat()
        for ar in alloc_records:
            if ar["amount"] > 0:
                await db.indirect_cost_allocations.insert_one({
                    "allocation_id": f"ica_{secrets.token_hex(6)}",
                    "indirect_cost_id": cost_id,
                    "project_id": ar["project"]["project_id"],
                    "project_name": ar["project"]["name"],
                    "amount": ar["amount"],
                    "share_pct": round(ar["share_pct"] * 100, 2),
                    "category": cost.get("category"),
                    "description": cost.get("description"),
                    "created_at": now_str
                })
    
    # Create transaction record
    txn = Transaction(
        transaction_type=TransactionType.EXPENSE,
        amount=cost.get("amount", 0),
        payment_method=cost.get("payment_method", PaymentMethodType.BANK_TRANSFER),
        payment_date=data.payment_date,
        reference_number=data.reference_number,
        party_name=cost.get("vendor_name"),
        party_type="vendor",
        description=f"Indirect Cost: {cost.get('category')} - {cost.get('description')}",
        category="indirect_cost",
        recorded_by=user.user_id,
        recorded_by_name=user.name
    )
    txn_dict = txn.model_dump()
    txn_dict["payment_date"] = txn_dict["payment_date"].isoformat()
    txn_dict["created_at"] = txn_dict["created_at"].isoformat()
    txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
    await db.transactions.insert_one(txn_dict)
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="indirect_cost",
        entity_id=cost_id,
        action=FinancialAuditAction.CONFIRMED,
        description=f"Payment confirmed: {cost.get('description')}",
        user=user,
        amount=cost.get("amount")
    )
    
    return {"message": "Payment confirmed and locked"}



# ==================== INDIRECT COST AUTO-DISTRIBUTION ====================

async def get_indirect_cost_pct():
    """Get the configured indirect cost percentage from company settings."""
    settings = await db.company_settings.find_one({}, {"_id": 0, "indirect_cost_percent": 1})
    pct = (settings or {}).get("indirect_cost_percent", 20.0)
    return pct / 100.0  # Return as decimal (e.g. 0.20)

@router.get("/financial/project-budget-overview")
async def get_project_budget_overview(user: User = Depends(get_current_user)):
    """Get all active projects with their budget split and indirect allocation status"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    indirect_pct = await get_indirect_cost_pct()
    direct_pct = 1.0 - indirect_pct
    
    projects = await db.projects.find(
        {"status": {"$nin": ["cancelled", "completed"]}},
        {"_id": 0, "project_id": 1, "name": 1, "total_value": 1, "status": 1}
    ).to_list(100)
    
    if not projects:
        return {"projects": [], "portfolio_total": 0, "total_indirect_budget": 0, "total_indirect_spent": 0}
    
    portfolio_total = sum(p.get("total_value", 0) for p in projects)
    
    # Get all confirmed indirect cost allocations grouped by project
    allocations = await db.indirect_cost_allocations.find({}, {"_id": 0}).to_list(5000)
    alloc_by_project = {}
    for a in allocations:
        pid = a.get("project_id")
        alloc_by_project[pid] = alloc_by_project.get(pid, 0) + a.get("amount", 0)
    
    result = []
    for p in projects:
        value = p.get("total_value", 0)
        share_pct = (value / portfolio_total * 100) if portfolio_total > 0 else 0
        indirect_budget = value * indirect_pct
        indirect_spent = alloc_by_project.get(p["project_id"], 0)
        remaining = indirect_budget - indirect_spent
        
        result.append({
            "project_id": p["project_id"],
            "name": p["name"],
            "total_value": value,
            "status": p["status"],
            "share_pct": round(share_pct, 2),
            "direct_budget": value * direct_pct,
            "indirect_budget": indirect_budget,
            "indirect_spent": indirect_spent,
            "indirect_remaining": max(0, remaining),
            "profit_estimate": max(0, remaining),
            "is_exhausted": remaining <= 0
        })
    
    return {
        "projects": sorted(result, key=lambda x: x["total_value"], reverse=True),
        "portfolio_total": portfolio_total,
        "total_indirect_budget": portfolio_total * indirect_pct,
        "total_indirect_spent": sum(alloc_by_project.values()),
        "total_indirect_remaining": portfolio_total * indirect_pct - sum(alloc_by_project.values()),
        "indirect_cost_percent": round(indirect_pct * 100),
        "direct_cost_percent": round(direct_pct * 100)
    }


@router.get("/financial/indirect-cost-distribution-preview")
async def preview_distribution(amount: float, user: User = Depends(get_current_user)):
    """Preview how an indirect cost will be distributed across active projects"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    indirect_pct = await get_indirect_cost_pct()
    
    projects = await db.projects.find(
        {"status": {"$nin": ["cancelled", "completed"]}},
        {"_id": 0, "project_id": 1, "name": 1, "total_value": 1}
    ).to_list(100)
    
    if not projects:
        return {"distributions": [], "warnings": ["No active projects found"]}
    
    portfolio_total = sum(p.get("total_value", 0) for p in projects)
    
    # Get current allocations
    allocations = await db.indirect_cost_allocations.find({}, {"_id": 0}).to_list(5000)
    alloc_by_project = {}
    for a in allocations:
        pid = a.get("project_id")
        alloc_by_project[pid] = alloc_by_project.get(pid, 0) + a.get("amount", 0)
    
    # First pass: calculate proportional split
    distributions = []
    overflow = 0
    overflow_projects = []
    warnings = []
    
    for p in sorted(projects, key=lambda x: x.get("total_value", 0), reverse=True):
        value = p.get("total_value", 0)
        share_pct = (value / portfolio_total) if portfolio_total > 0 else 0
        share_amount = round(amount * share_pct, 2)
        indirect_budget = value * indirect_pct
        already_spent = alloc_by_project.get(p["project_id"], 0)
        remaining = indirect_budget - already_spent
        
        if share_amount > remaining and remaining > 0:
            overflow += (share_amount - remaining)
            warnings.append(f"{p['name']}: Budget nearly exhausted. Only ₹{remaining:,.0f} of ₹{share_amount:,.0f} allocated.")
            distributions.append({
                "project_id": p["project_id"],
                "name": p["name"],
                "share_pct": round(share_pct * 100, 2),
                "amount": round(remaining, 2),
                "indirect_budget": indirect_budget,
                "already_spent": already_spent,
                "remaining_after": 0,
                "is_capped": True
            })
        elif remaining <= 0:
            overflow += share_amount
            warnings.append(f"{p['name']}: Indirect budget exhausted (₹{already_spent:,.0f} / ₹{indirect_budget:,.0f}). Share moved to other projects.")
            overflow_projects.append(p["project_id"])
            distributions.append({
                "project_id": p["project_id"],
                "name": p["name"],
                "share_pct": round(share_pct * 100, 2),
                "amount": 0,
                "indirect_budget": indirect_budget,
                "already_spent": already_spent,
                "remaining_after": 0,
                "is_capped": True
            })
        else:
            distributions.append({
                "project_id": p["project_id"],
                "name": p["name"],
                "share_pct": round(share_pct * 100, 2),
                "amount": round(share_amount, 2),
                "indirect_budget": indirect_budget,
                "already_spent": already_spent,
                "remaining_after": round(remaining - share_amount, 2),
                "is_capped": False
            })
    
    # Second pass: redistribute overflow to projects with remaining budget
    if overflow > 0:
        available = [d for d in distributions if not d["is_capped"] and d["remaining_after"] > 0]
        if available:
            avail_total = sum(d["remaining_after"] + d["amount"] for d in available)
            for d in available:
                extra_share = ((d["remaining_after"] + d["amount"]) / avail_total) if avail_total > 0 else 0
                extra = round(overflow * extra_share, 2)
                if d["remaining_after"] >= extra:
                    d["amount"] = round(d["amount"] + extra, 2)
                    d["remaining_after"] = round(d["remaining_after"] - extra, 2)
                else:
                    d["amount"] = round(d["amount"] + d["remaining_after"], 2)
                    d["remaining_after"] = 0
    
    return {
        "amount": amount,
        "distributions": distributions,
        "warnings": warnings,
        "total_allocated": round(sum(d["amount"] for d in distributions), 2)
    }


@router.get("/financial/indirect-cost-allocations")
async def get_indirect_cost_allocations(
    project_id: Optional[str] = None,
    indirect_cost_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get indirect cost allocations per project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if project_id:
        query["project_id"] = project_id
    if indirect_cost_id:
        query["indirect_cost_id"] = indirect_cost_id
    
    allocs = await db.indirect_cost_allocations.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return allocs



# ==================== SUSPENSE ACCOUNT ENDPOINTS ====================

@router.get("/financial/suspense")
async def get_suspense_entries(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get suspense entries (Accountant, Super Admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    entries = await db.suspense_entries.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return entries


class SuspenseEntryCreate(BaseModel):
    amount: float
    transaction_type: str  # income or expense
    description: str
    source: Optional[str] = None
    reference_number: Optional[str] = None
    payment_method: Optional[PaymentMethodType] = None
    remarks: Optional[str] = None


@router.post("/financial/suspense")
async def create_suspense_entry(data: SuspenseEntryCreate, user: User = Depends(get_current_user)):
    """Create suspense entry for unclear transactions (Accountant only)"""
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can create suspense entries")
    
    entry = SuspenseEntry(
        amount=data.amount,
        transaction_type=data.transaction_type,
        description=data.description,
        source=data.source,
        reference_number=data.reference_number,
        payment_method=data.payment_method,
        remarks=data.remarks,
        status=SuspenseEntryStatus.PENDING,
        created_by=user.user_id,
        created_by_name=user.name
    )
    
    entry_dict = entry.model_dump()
    entry_dict["created_at"] = entry_dict["created_at"].isoformat()
    entry_dict["updated_at"] = entry_dict["updated_at"].isoformat()
    
    await db.suspense_entries.insert_one(entry_dict)
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="suspense",
        entity_id=entry.suspense_id,
        action=FinancialAuditAction.CREATED,
        description=f"Suspense entry created: {data.description}",
        user=user,
        amount=data.amount
    )
    
    return {"message": "Suspense entry created. Requires Super Admin approval for allocation.", "suspense_id": entry.suspense_id}


class SuspenseAllocation(BaseModel):
    approved: bool
    allocated_to: Optional[str] = None  # project_id or 'indirect_cost'
    allocation_category: Optional[str] = None
    allocation_reason: Optional[str] = None
    rejection_reason: Optional[str] = None


@router.patch("/financial/suspense/{suspense_id}/allocate")
async def allocate_suspense_entry(suspense_id: str, data: SuspenseAllocation, user: User = Depends(get_current_user)):
    """Approve and allocate suspense entry (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can allocate suspense entries")
    
    entry = await db.suspense_entries.find_one({"suspense_id": suspense_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Suspense entry not found")
    
    if entry.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only allocate pending entries")
    
    if data.approved:
        if not data.allocated_to:
            raise HTTPException(status_code=400, detail="Allocation target required for approval")
        
        update = {
            "status": "allocated",
            "allocated_to": data.allocated_to,
            "allocation_category": data.allocation_category,
            "allocation_reason": data.allocation_reason,
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "is_locked": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        action = FinancialAuditAction.APPROVED
        message = "Suspense entry allocated"
    else:
        update = {
            "status": "rejected",
            "approved_by": user.user_id,
            "approved_by_name": user.name,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": data.rejection_reason,
            "is_locked": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        action = FinancialAuditAction.REJECTED
        message = "Suspense entry rejected"
    
    await db.suspense_entries.update_one({"suspense_id": suspense_id}, {"$set": update})
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="suspense",
        entity_id=suspense_id,
        action=action,
        description=f"{message}: {entry.get('description')}",
        user=user,
        amount=entry.get("amount")
    )
    
    return {"message": message}


# ==================== CHEQUE RETURN HANDLING ====================

@router.patch("/financial/cheques/{cheque_id}/return")
async def process_cheque_return(cheque_id: str, user: User = Depends(get_current_user)):
    """Process cheque return - Auto-reduce income and create penalty entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    cheque = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")
    
    if cheque.get("status") not in ["issued", "deposited", "cleared"]:
        raise HTTPException(status_code=400, detail="Cheque cannot be marked as returned")
    
    project_id = cheque.get("project_id")
    amount = cheque.get("amount", 0)
    
    # Update cheque status
    await db.cheques.update_one(
        {"cheque_id": cheque_id},
        {"$set": {
            "status": "bounced",
            "bounce_reason": "Returned by bank",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If this was an income cheque for a project, reduce project income
    if project_id and cheque.get("cheque_type") == "incoming":
        # Find and update related income entry
        income_entry = await db.income_entries.find_one({
            "project_id": project_id,
            "payment_mode": "cheque",
            "amount": amount
        }, {"_id": 0})
        
        if income_entry:
            # Mark income entry as reversed
            await db.income_entries.update_one(
                {"entry_id": income_entry.get("entry_id")},
                {"$set": {
                    "status": "reversed",
                    "reversal_reason": f"Cheque returned: {cheque.get('cheque_number')}",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        # Create cheque return penalty expense
        penalty_amount = cheque.get("bounce_charges", 500)  # Default penalty
        penalty = IndirectCost(
            category=IndirectCostCategory.BANK_CHARGES,
            description=f"Cheque Return Penalty - {cheque.get('cheque_number')} from {cheque.get('party_name')}",
            amount=penalty_amount,
            payment_method=PaymentMethodType.BANK_TRANSFER,
            vendor_name="Bank Charges",
            remarks=f"Auto-created for bounced cheque {cheque.get('cheque_number')}",
            status=IndirectCostStatus.PENDING,  # Still needs approval
            created_by=user.user_id,
            created_by_name=user.name
        )
        
        penalty_dict = penalty.model_dump()
        penalty_dict["created_at"] = penalty_dict["created_at"].isoformat()
        penalty_dict["updated_at"] = penalty_dict["updated_at"].isoformat()
        await db.indirect_costs.insert_one(penalty_dict)
        
        # Create notification for Planning department
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "type": "cheque_returned",
            "title": "Cheque Returned",
            "message": f"Cheque {cheque.get('cheque_number')} from {cheque.get('party_name')} for ₹{amount:,.2f} has been returned.",
            "target_roles": ["planning", "super_admin"],
            "project_id": project_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="cheque",
        entity_id=cheque_id,
        action=FinancialAuditAction.CHEQUE_RETURNED,
        description=f"Cheque returned: {cheque.get('cheque_number')} - {cheque.get('party_name')}",
        user=user,
        amount=amount,
        project_id=project_id
    )
    
    return {
        "message": "Cheque marked as returned. Income reversed and penalty entry created.",
        "penalty_created": True,
        "notification_sent": True
    }


# ==================== INCOME VERIFICATION (Accountant can only verify, not create) ====================

@router.get("/financial/pending-income-verification")
async def get_pending_income_verification(user: User = Depends(get_current_user)):
    """Get income entries pending verification (from Planning stage payments)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.HR]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Get income entries that are pending verification
    entries = await db.income_entries.find({
        "status": {"$in": ["pending_verification", "pending"]}
    }, {"_id": 0}).sort("created_at", -1).to_list(200)
    
    return entries


class IncomeVerification(BaseModel):
    verified: bool
    reference_number: Optional[str] = None
    payment_method_confirmed: Optional[PaymentMethodType] = None
    remarks: Optional[str] = None
    rejection_reason: Optional[str] = None


@router.patch("/financial/income/{entry_id}/verify")
async def verify_income_entry(entry_id: str, data: IncomeVerification, user: User = Depends(get_current_user)):
    """Verify income entry (Accountant only - cannot modify amount)"""
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can verify income")
    
    entry = await db.income_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Income entry not found")
    
    if entry.get("status") not in ["pending", "pending_verification"]:
        raise HTTPException(status_code=400, detail="Entry is not pending verification")
    
    if data.verified:
        update = {
            "status": "verified",
            "verified_by": user.user_id,
            "verified_by_name": user.name,
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "reference_number": data.reference_number or entry.get("reference_number"),
            "remarks": data.remarks,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if data.payment_method_confirmed:
            update["payment_mode"] = data.payment_method_confirmed
        
        action = FinancialAuditAction.VERIFIED
        message = "Income verified"
    else:
        update = {
            "status": "rejected",
            "verified_by": user.user_id,
            "verified_by_name": user.name,
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "rejection_reason": data.rejection_reason,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        action = FinancialAuditAction.REJECTED
        message = "Income rejected"
    
    await db.income_entries.update_one({"entry_id": entry_id}, {"$set": update})
    
    # Create audit log
    await create_financial_audit_log(
        entity_type="income",
        entity_id=entry_id,
        action=action,
        description=f"{message}: {entry.get('description', 'Stage payment')}",
        user=user,
        amount=entry.get("amount"),
        project_id=entry.get("project_id")
    )
    
    return {"message": message}


# ==================== FINANCIAL AUDIT LOG ENDPOINTS ====================

@router.get("/financial/audit-logs")
async def get_financial_audit_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user)
):
    """Get financial audit logs (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can view audit logs")
    
    query = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    if project_id:
        query["project_id"] = project_id
    
    logs = await db.financial_audit_logs.find(query, {"_id": 0}).sort("performed_at", -1).to_list(limit)
    return logs


# ==================== FINANCIAL DASHBOARD SUMMARY ====================

@router.get("/financial/control-dashboard")
async def get_financial_control_dashboard(user: User = Depends(get_current_user)):
    """Get financial control dashboard summary"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Pending verifications
    pending_income = await db.income_entries.count_documents({"status": {"$in": ["pending", "pending_verification"]}})
    
    # Pending indirect cost approvals
    pending_indirect = await db.indirect_costs.count_documents({"status": "pending"})
    approved_indirect = await db.indirect_costs.count_documents({"status": "approved"})
    
    # Suspense entries
    pending_suspense = await db.suspense_entries.count_documents({"status": "pending"})
    
    # Cheque status
    pending_cheques = await db.cheques.count_documents({"status": {"$in": ["issued", "deposited", "post_dated"]}})
    bounced_cheques = await db.cheques.count_documents({"status": "bounced"})
    
    # Calculate totals
    indirect_costs_total = await db.indirect_costs.aggregate([
        {"$match": {"status": "confirmed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    suspense_total = await db.suspense_entries.aggregate([
        {"$match": {"status": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    return {
        "pending_income_verification": pending_income,
        "pending_indirect_cost_approvals": pending_indirect,
        "approved_indirect_costs_pending_payment": approved_indirect,
        "pending_suspense_allocation": pending_suspense,
        "pending_cheques": pending_cheques,
        "bounced_cheques": bounced_cheques,
        "indirect_costs_total": indirect_costs_total[0]["total"] if indirect_costs_total else 0,
        "suspense_total": suspense_total[0]["total"] if suspense_total else 0
    }


# ==================== END FINANCIAL CONTROL ENDPOINTS ====================


# ==================== ADMIN: QUICK CREATE PROJECT (Pre-Sales + Sales + Project in one) ====================

class QuickCreateProjectInput(BaseModel):
    # Pre-Sales
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    alternative_phone: Optional[str] = None
    source: Optional[str] = "walk_in"
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    custom_fields: Optional[Dict[str, Any]] = None  # budget, sqft, requirements, etc.

    # Sales
    project_name: str
    location: Optional[str] = None
    sqft: Optional[float] = 0
    building_type: Optional[str] = "residential"
    total_value: float = 0
    expected_handover_months: Optional[int] = 12

    # Advance / booking
    advance_amount: float = 0
    advance_payment_mode: Optional[str] = "cash"
    advance_payment_reference: Optional[str] = None

    # Stages template
    stage_template_name: Optional[str] = None  # If provided, auto-seed stages from this template


@router.post("/admin/quick-create-project")
async def admin_quick_create_project(data: QuickCreateProjectInput, user: User = Depends(get_current_user)):
    """SUPER ADMIN / PLANNING / SALES: Create a full project end-to-end —
    Lead (Pre-Sales) → marks as booked/converted → Project → seeds Stages from template.
    Useful for backfilling legacy projects or fast-tracking VIP deals.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SALES]:
        raise HTTPException(status_code=403, detail="Only Super Admin, Planning or Sales can use this")

    if not data.name.strip() or not data.project_name.strip():
        raise HTTPException(status_code=400, detail="Lead name and Project name are required")

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # ---------- 1) Create the Lead (Pre-Sales) ----------
    lead_id = f"lead_{secrets.token_hex(6)}"
    lead_doc = {
        "lead_id": lead_id,
        "name": data.name.strip(),
        "email": (data.email or "").strip() or None,
        "phone": (data.phone or "").strip() or None,
        "alternative_phone": (data.alternative_phone or "").strip() or None,
        "source": data.source or "walk_in",
        "city": data.city or "",
        "state": data.state or "",
        "pincode": data.pincode or "",
        "address": data.address or "",
        "notes": data.notes or "",
        "custom_fields": data.custom_fields or {},
        "stage_type": "pre_sales",
        "current_stage_id": "stg_booked",
        "stage_history": [
            {"stage_id": "stg_new_lead", "moved_at": now_iso, "moved_by": user.user_id, "action": "admin_quick_create"},
            {"stage_id": "stg_booked", "moved_at": now_iso, "moved_by": user.user_id, "action": "admin_quick_create"},
        ],
        "assigned_to": user.user_id,
        "assigned_to_name": user.name,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": now,
        "updated_at": now,
        "project_created": False,
    }
    await db.leads.insert_one(lead_doc)

    # ---------- 2) Create the Project ----------
    project_id = f"proj_{secrets.token_hex(6)}"
    project_code = await generate_project_code()
    expected_completion = now + timedelta(days=(data.expected_handover_months or 12) * 30)

    project_doc = {
        "project_id": project_id,
        "project_code": project_code,
        "name": data.project_name.strip(),
        "client_name": data.name.strip(),
        "client_email": data.email,
        "client_phone": data.phone,
        "location": data.location or "",
        "sqft": data.sqft or 0,
        "building_type": data.building_type or "residential",
        "total_value": data.total_value or 0,
        "advance_amount": data.advance_amount or 0,
        "advance_payment_mode": data.advance_payment_mode or "cash",
        "advance_payment_reference": data.advance_payment_reference,
        "advance_received_at": now if data.advance_amount else None,
        "advance_collected_by": user.user_id,
        "additional_cost": 0,
        "income_project": data.advance_amount or 0,
        "income_additional": 0,
        "total_expense": 0,
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        "start_date": now,
        "expected_completion": expected_completion,
        "status": "active",
        "accountant_verified": True,
        "planning_status": "in_planning",
        "lead_id": lead_id,
        "created_by": user.user_id,
        "created_at": now,
        "converted_by_cre": user.user_id,
        "converted_at": now,
        "source": "admin_quick_create",
    }
    await db.projects.insert_one(project_doc)

    # Mark the lead as converted now that the project exists
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"project_created": True, "project_id": project_id, "converted_at": now}},
    )

    # ---------- 3) Record Advance Income (if any) ----------
    if (data.advance_amount or 0) > 0:
        income_record = {
            "income_id": f"inc_{secrets.token_hex(6)}",
            "project_id": project_id,
            "project_name": data.project_name.strip(),
            "category": "advance_payment",
            "sub_category": f"Advance - {(data.advance_payment_mode or 'cash').replace('_', ' ').title()}",
            "amount": float(data.advance_amount),
            "payment_mode": data.advance_payment_mode or "cash",
            "payment_reference": data.advance_payment_reference or "",
            "payment_date": now_iso,
            "stage": "Advance Payment",
            "description": f"Advance payment via admin quick-create — {data.name}",
            "remarks": f"Project created via Admin Quick-Create by {user.name}",
            "collected_by": user.user_id,
            "collected_by_name": user.name,
            "status": "approved",
            "source": "admin_quick_create",
            "created_at": now_iso,
        }
        await db.income.insert_one(income_record)

    # ---------- 4) Seed Project Stages from template (if requested) ----------
    stages_created = 0
    if data.stage_template_name:
        template = await db.stage_templates.find_one({"template_name": data.stage_template_name}, {"_id": 0})
        if template and template.get("stages"):
            stage_docs = []
            for i, s in enumerate(template["stages"]):
                stage_docs.append({
                    "stage_id": f"pstg_{uuid.uuid4().hex[:12]}",
                    "project_id": project_id,
                    "stage_name": s.get("stage_name", f"Stage {i+1}"),
                    "sl_no": s.get("sl_no", ""),
                    "section_title": s.get("section_title", ""),
                    "is_section_header": bool(s.get("is_section_header", False)),
                    "start_date": s.get("start_date"),
                    "target_date": s.get("target_date"),
                    "duration_days": s.get("duration_days"),
                    "status": s.get("status", "yet_to_start"),
                    "remarks": s.get("remarks", ""),
                    "progress": 0,
                    "order": i,
                    "created_at": now_iso,
                    "created_by": user.user_id,
                })
            if stage_docs:
                await db.project_stages.insert_many(stage_docs)
                stages_created = len(stage_docs)

    return {
        "success": True,
        "project_id": project_id,
        "project_code": project_code,
        "lead_id": lead_id,
        "stages_created": stages_created,
        "message": f"Project '{data.project_name}' created with Lead + Stages",
    }


# ==================== END ADMIN QUICK CREATE ====================

