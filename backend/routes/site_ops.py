"""
Site Operations Routes - Site Engineer Module, Petty Cash, Accountant Module, PM Module
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

try:
    import resend
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
except ImportError:
    resend = None

SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "noreply@myhomeusb.com")

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from core.counters import next_seq
from security import InputValidator
from routes.correction_engine import apply_rejection, apply_resubmit, apply_send_for_correction

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== VENDOR AUTO-MATCH HELPERS ====================

async def find_assigned_vendor_for_material(project_id: str, material_name: str):
    """Match a material name to a vendor category and return the assigned vendor if any.
    Uses case-insensitive substring matching: e.g. 'Cement OPC 53 Grade' matches category 'Cement'.
    """
    if not material_name or not project_id:
        return None
    # Get all vendor assignments for this project
    assignments = await db.project_vendor_assignments.find(
        {"project_id": project_id}, {"_id": 0}
    ).to_list(100)
    if not assignments:
        return None
    mat_lower = material_name.lower()
    # Try exact prefix match first, then substring
    for a in assignments:
        cat = a.get("category", "")
        if mat_lower.startswith(cat.lower()):
            return a
    for a in assignments:
        cat = a.get("category", "")
        if cat.lower() in mat_lower:
            return a
    return None


async def auto_create_purchase_order(request_doc: dict, vendor_assignment: dict, approved_by: str):
    """Auto-generate a Purchase Order from an approved material request + assigned vendor."""
    now = datetime.now(timezone.utc).isoformat()
    po = {
        "po_id": f"po_{uuid.uuid4().hex[:8]}",
        "project_id": request_doc.get("project_id"),
        "project_name": request_doc.get("project_name", ""),
        "vendor_id": vendor_assignment.get("vendor_id"),
        "vendor_name": vendor_assignment.get("vendor_name", ""),
        "material_request_id": request_doc.get("request_id"),
        "items": [{
            "material_name": request_doc.get("material_name"),
            "quantity": request_doc.get("quantity"),
            "unit": request_doc.get("unit", ""),
            "category": vendor_assignment.get("category", ""),
        }],
        "total_amount": request_doc.get("estimated_price") or request_doc.get("total_amount") or 0,
        "paid_amount": 0,
        "status": "pending",
        "payment_status": "unpaid",
        "auto_generated": True,
        "notes": f"Auto-generated from material request {request_doc.get('request_id')}",
        "created_by": approved_by,
        "created_at": now,
        "updated_at": now
    }
    await db.purchase_orders.insert_one(po)
    po.pop("_id", None)
    return po


# ==================== SITE ENGINEER MODULE ====================

class MaterialRequestStatus(str, Enum):
    REQUESTED = "requested"  # Site Engineer created request
    PM_APPROVED = "pm_approved"  # Project Manager approved
    PLANNING_APPROVED = "planning_approved"  # Planning approved
    PROCUREMENT_APPROVED = "procurement_approved"  # Procurement approved (ready for vendor selection)
    PENDING_ACCOUNTS_APPROVAL = "pending_accounts_approval"  # Waiting for Accountant
    PROCUREMENT_ASSIGNED = "procurement_assigned"  # Procurement assigned vendor
    VENDOR_SELECTED = "vendor_selected"  # Procurement selected vendor & pricing
    WAITING_PAYMENT = "waiting_payment"  # Waiting for accounts approval
    PAYMENT_APPROVED = "payment_approved"  # Accounts approved payment
    PO_GENERATED = "po_generated"  # Purchase order generated
    ORDER_PLACED = "order_placed"  # Order placed with vendor
    IN_TRANSIT = "in_transit"  # Material dispatched
    PROCUREMENT_VERIFYING = "procurement_verifying"  # NEW: SE received → Procurement verifies qty + invoice
    PROCUREMENT_REJECTED_TO_SE = "procurement_rejected_to_se"  # NEW: Procurement bounced back to SE (re-collect)
    PROCUREMENT_REJECTED_TO_VENDOR = "procurement_rejected_to_vendor"  # NEW: Procurement raises dispute with vendor
    RECEIVED_PARTIAL = "received_partial"
    RECEIVED_COMPLETED = "received_completed"
    REJECTED = "rejected"
    CLOSED = "closed"


class VendorPaymentType(str, Enum):
    ADVANCE = "advance"  # Full payment upfront before delivery
    FULL_PAYMENT = "full_payment"  # Full payment on delivery
    CREDIT = "credit"  # Payment after delivery (credit period)


class PaymentType(str, Enum):
    ADVANCE = "advance"  # Full payment upfront
    PARTIAL = "partial"  # Partial payment, balance later
    CREDIT = "credit"  # No payment now, add to ledger


class LabourRequestStatus(str, Enum):
    REQUESTED = "requested"
    PLANNING_APPROVED = "planning_approved"
    PENDING_ACCOUNTS_APPROVAL = "pending_accounts_approval"
    ACCOUNTANT_APPROVED = "accountant_approved"
    APPROVED = "approved"
    REJECTED = "rejected"


class VendorCategory(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"


class LabourCategory(str, Enum):
    CIVIL = "civil"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    WELDER = "welder"
    CARPENTER = "carpenter"
    TILES_GRANITE = "tiles_granite"
    PAINTING = "painting"
    NMR = "nmr"  # Non-Measurement Rate


class SiteEngineerAssignment(BaseModel):
    assignment_id: str = Field(default_factory=lambda: f"sea_{uuid.uuid4().hex[:12]}")
    user_id: str  # Site Engineer user ID
    project_id: str
    assigned_by: str  # Super Admin or Project Manager
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaterialRequest(BaseModel):
    request_id: str = Field(default_factory=lambda: f"mreq_{uuid.uuid4().hex[:12]}")
    order_id: str = Field(default_factory=lambda: f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}")
    project_id: str
    project_name: Optional[str] = None
    site_engineer_id: str
    material_id: str
    material_name: str
    quantity: float
    unit: str
    stage: Optional[str] = None  # Construction stage
    remarks: Optional[str] = None
    status: MaterialRequestStatus = MaterialRequestStatus.REQUESTED
    # Planning approval
    planning_approved_by: Optional[str] = None
    planning_approved_at: Optional[datetime] = None
    # Vendor selection & pricing
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    unit_rate: Optional[float] = None
    transport_cost: Optional[float] = 0
    discount: Optional[float] = 0
    total_amount: Optional[float] = None
    # Payment details
    payment_type: Optional[str] = None  # advance, partial, credit
    advance_amount: Optional[float] = None
    balance_amount: Optional[float] = None
    # Accounts approval
    accountant_approved_by: Optional[str] = None
    accountant_approved_at: Optional[datetime] = None
    payment_reference: Optional[str] = None
    # PO details
    po_id: Optional[str] = None
    po_generated_at: Optional[datetime] = None
    expected_delivery: Optional[datetime] = None
    # Transit
    dispatched_at: Optional[datetime] = None
    vehicle_number: Optional[str] = None
    driver_phone: Optional[str] = None
    # Receipt
    received_qty: Optional[float] = None
    received_at: Optional[datetime] = None
    receipt_photo_id: Optional[str] = None
    receipt_gps_lat: Optional[float] = None
    receipt_gps_lng: Optional[float] = None
    receipt_otp: Optional[str] = None
    receipt_otp_verified: bool = False
    # Rejection
    rejection_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    # Legacy fields for compatibility
    procurement_approved_by: Optional[str] = None
    procurement_approved_at: Optional[datetime] = None
    procurement_pricing: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LabourRequest(BaseModel):
    labour_expense_id: str = Field(default_factory=lambda: f"lreq_{uuid.uuid4().hex[:12]}")
    order_id: str = Field(default_factory=lambda: f"LAB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}")
    project_id: str
    site_engineer_id: str
    labour_type: str  # Mason, Helper, Carpenter, Electrician, Plumber, etc.
    num_workers: int
    num_days: int
    rate_per_day: float
    total_amount: float  # num_workers * num_days * rate_per_day
    description: Optional[str] = None
    remarks: Optional[str] = None
    status: LabourRequestStatus = LabourRequestStatus.REQUESTED
    planning_approved_by: Optional[str] = None
    planning_approved_at: Optional[datetime] = None
    accountant_approved_by: Optional[str] = None
    accountant_approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaterialReceipt(BaseModel):
    receipt_id: str = Field(default_factory=lambda: f"rcpt_{uuid.uuid4().hex[:12]}")
    request_id: str  # Links to MaterialRequest
    project_id: str
    site_engineer_id: str
    requested_qty: float
    received_qty: float
    gps_latitude: float
    gps_longitude: float
    photo_url: Optional[str] = None
    remarks: Optional[str] = None
    otp_verified: bool = False
    otp_code: Optional[str] = None
    otp_expires_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Enhanced Vendor Master Model
class VendorMaster(BaseModel):
    vendor_id: str = Field(default_factory=lambda: f"vm_{uuid.uuid4().hex[:12]}")
    name: str
    category: str = "material"  # material or labour
    contact_person: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    # Bank Details
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    payment_method: str = "bank"  # bank, upi, cash
    upi_id: Optional[str] = None
    # Tax & Compliance
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    # For Labour Vendors
    labour_category: Optional[str] = None  # civil, electrical, plumbing, etc.
    aadhar_file_id: Optional[str] = None  # Uploaded Aadhar PDF
    location_coverage: Optional[str] = None
    rate_type: Optional[str] = None  # per_day, per_sqft, contract
    # Materials supplied (for material vendors)
    materials_supplied: List[str] = []
    # Tags & Status
    tags: List[str] = []  # premium, local, bulk_supplier
    is_active: bool = True
    payment_terms: str = "full"  # full, partial, credit
    credit_limit: Optional[float] = None
    # Metadata
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


# Credit Ledger Entry
class CreditLedgerEntry(BaseModel):
    entry_id: str = Field(default_factory=lambda: f"cle_{uuid.uuid4().hex[:12]}")
    vendor_id: str
    vendor_name: str
    project_id: str
    project_name: Optional[str] = None
    request_id: str  # Links to MaterialRequest
    po_id: Optional[str] = None
    credit_amount: float
    paid_amount: float = 0
    balance_amount: float
    due_date: Optional[datetime] = None
    status: str = "outstanding"  # outstanding, partially_paid, paid, overdue
    payment_history: List[dict] = []  # [{date, amount, reference, paid_by}]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


# Purchase Order (Enhanced)
class PurchaseOrderV2(BaseModel):
    po_id: str = Field(default_factory=lambda: f"PO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}")
    po_number: str = Field(default_factory=lambda: f"PO-{datetime.now().strftime('%Y%m%d%H%M%S')}")
    request_id: str
    project_id: str
    project_name: Optional[str] = None
    # Vendor Details
    vendor_id: str
    vendor_name: str
    vendor_phone: Optional[str] = None
    vendor_address: Optional[str] = None
    # Material Details
    material_name: str
    quantity: float
    unit: str
    unit_rate: float
    transport_cost: float = 0
    discount: float = 0
    total_amount: float
    # Payment Details
    payment_type: str  # advance, partial, credit
    payment_terms: Optional[str] = None
    advance_paid: float = 0
    balance_due: float = 0
    # Delivery Details
    delivery_address: str
    expected_delivery: datetime
    actual_delivery: Optional[datetime] = None
    # Status
    status: str = "generated"  # generated, dispatched, in_transit, delivered, closed
    dispatched_at: Optional[datetime] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    # Receipt
    received_qty: Optional[float] = None
    receipt_verified: bool = False
    # Metadata
    generated_by: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Transit Tracking
class TransitTracking(BaseModel):
    tracking_id: str = Field(default_factory=lambda: f"trk_{uuid.uuid4().hex[:12]}")
    po_id: str
    request_id: str
    project_id: str
    status: str  # dispatched, in_transit, reached, unloading, delivered
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    current_location: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    estimated_arrival: Optional[datetime] = None
    updates: List[dict] = []  # [{timestamp, status, location, remarks}]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Site Engineer Assignment Endpoints
class AssignmentCreate(BaseModel):
    user_id: str
    project_id: str


@router.post("/site-engineer/assignments")
async def create_site_engineer_assignment(
    data: AssignmentCreate,
    user: User = Depends(get_current_user)
):
    """Assign a Site Engineer to a project (Super Admin or Project Manager only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check if user is a site engineer
    target_user = await db.users.find_one({"user_id": data.user_id}, {"_id": 0})
    if not target_user or target_user.get("role") != "site_engineer":
        raise HTTPException(status_code=400, detail="Target user must be a Site Engineer")
    
    # Check if already assigned
    existing = await db.site_engineer_assignments.find_one({
        "user_id": data.user_id,
        "project_id": data.project_id,
        "is_active": True
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Site Engineer already assigned to this project")
    
    # Check max 3 active projects
    active_count = await db.site_engineer_assignments.count_documents({
        "user_id": data.user_id,
        "is_active": True
    })
    if active_count >= 3:
        raise HTTPException(status_code=400, detail="Site Engineer can only have up to 3 active projects")
    
    assignment = SiteEngineerAssignment(
        user_id=data.user_id,
        project_id=data.project_id,
        assigned_by=user.user_id
    )
    
    assign_dict = assignment.model_dump()
    assign_dict["created_at"] = assign_dict["created_at"].isoformat()
    await db.site_engineer_assignments.insert_one(assign_dict)
    assign_dict.pop("_id", None)
    
    await create_notification(data.user_id, f"You have been assigned to a new project")
    await create_audit_log(user.user_id, "assign", "site_engineer", data.user_id, {"project_id": data.project_id})
    
    return assign_dict


@router.get("/site-engineer/assignments")
async def get_site_engineer_assignments(
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get site engineer assignments"""
    query = {"is_active": True}
    
    if user.role == UserRole.SITE_ENGINEER:
        query["user_id"] = user.user_id
    elif project_id:
        query["project_id"] = project_id
    elif user_id:
        query["user_id"] = user_id
    
    assignments = await db.site_engineer_assignments.find(query, {"_id": 0}).to_list(100)
    
    # Enrich with project and user details
    for a in assignments:
        project = await db.projects.find_one({"project_id": a["project_id"]}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "location": 1, "status": 1})
        a["project"] = project
        eng = await db.users.find_one({"user_id": a["user_id"]}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})
        a["engineer"] = eng
    
    return assignments


@router.delete("/site-engineer/assignments/{assignment_id}")
async def remove_site_engineer_assignment(
    assignment_id: str,
    user: User = Depends(get_current_user)
):
    """Remove a site engineer from a project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.site_engineer_assignments.update_one(
        {"assignment_id": assignment_id},
        {"$set": {"is_active": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"message": "Assignment removed"}


# Site Engineer Dashboard
@router.get("/site-engineer/my-projects")
async def get_site_engineer_projects(user: User = Depends(get_current_user)):
    """Get projects assigned to the current site engineer, associate PM, or Sr. site engineer"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers, Sr. Site Engineers, or Associate PMs can access this")
    
    assignments = await db.site_engineer_assignments.find({
        "user_id": user.user_id,
        "is_active": True
    }, {"_id": 0}).to_list(10)
    
    projects = []
    for a in assignments:
        project = await db.projects.find_one({"project_id": a["project_id"]}, {"_id": 0})
        if project:
            # Mar 04 2026 — Skip soft-deleted projects. They were already
            # removed from Planning / All Projects but were still leaking into
            # the SE "My Projects" list because this endpoint never checked
            # the `is_deleted` flag on the project doc.
            if project.get("is_deleted") is True:
                continue
            # IMPORTANT: Remove financial details - Site Engineers cannot see client payments
            project.pop("total_value", None)
            project.pop("advance_amount", None)
            project.pop("income_project", None)
            project.pop("income_additional", None)
            project.pop("agreement_value", None)
            project.pop("received_amount", None)
            project.pop("total_received", None)
            
            # Get active orders count
            material_orders = await db.material_requests.count_documents({
                "project_id": a["project_id"],
                "site_engineer_id": user.user_id,
                "status": {"$nin": ["received_completed", "rejected"]}
            })
            labour_orders = await db.labour_expenses.count_documents({
                "project_id": a["project_id"],
                "site_engineer_id": user.user_id,
                "status": {"$nin": ["approved", "rejected", "accounts_approved"]}
            })
            
            # Get pending petty cash
            petty_cash = await db.petty_cash.count_documents({
                "project_id": a["project_id"],
                "requested_by": user.user_id,
                "status": {"$in": ["requested", "issued", "partially_spent"]}
            })
            
            project["active_orders"] = material_orders + labour_orders
            project["active_petty_cash"] = petty_cash
            project["assignment_id"] = a["assignment_id"]
            projects.append(project)

    return projects


@router.get("/site-engineer/dlr-dpr-summary")
async def get_site_engineer_dlr_dpr_summary(
    date: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """Single-line-per-project DLR & DPR rollup across every project this
    SE/Sr-SE/Associate PM is assigned to, for one day (defaults to today).
    Lets a Sr SE managing several projects see today's works count / amount /
    active stage per project without opening each one separately."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers, Sr. Site Engineers, or Associate PMs can access this")

    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    assignments = await db.site_engineer_assignments.find({
        "user_id": user.user_id,
        "is_active": True,
    }, {"_id": 0}).to_list(50)

    rows = []
    for a in assignments:
        project = await db.projects.find_one(
            {"project_id": a["project_id"], "is_deleted": {"$ne": True}}, {"_id": 0, "name": 1, "project_id": 1}
        )
        if not project:
            continue
        entries = await db.daily_labour_reports.find(
            {"project_id": a["project_id"], "date": target_date}, {"_id": 0}
        ).to_list(200)
        works_count = sum(e.get("total_workers", 0) for e in entries)
        amount = sum(e.get("total_cost", 0) for e in entries)
        stage_names = sorted({e.get("stage_name") for e in entries if e.get("stage_name")})
        rows.append({
            "project_id": project["project_id"],
            "project_name": project.get("name", ""),
            "entries_count": len(entries),
            "works_count": works_count,
            "amount": round(amount, 2),
            "stage_names": stage_names,
        })

    rows.sort(key=lambda r: r["project_name"].lower())
    return {"date": target_date, "projects": rows}


@router.get("/site-engineer/project/{project_id}")
async def get_site_engineer_project_detail(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get project detail for a site engineer - LIMITED VIEW (no financial info).
    Also accessible to Project Managers and Super Admins so they can use the
    SE board UI from their own dashboard without juggling routes."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="You don't have access to this view")

    # PM and Super Admin see every project; SE roles must be assigned to the project.
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        assignment = await db.site_engineer_assignments.find_one({
            "user_id": user.user_id,
            "project_id": project_id,
            "is_active": True
        }, {"_id": 0})
        if not assignment:
            raise HTTPException(status_code=403, detail="You are not assigned to this project")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # IMPORTANT: Remove ALL financial details - Site Engineers cannot see client payments/project value
    financial_fields = [
        "total_value", "advance_amount", "income_project", "income_additional",
        "agreement_value", "received_amount", "total_received", "spent_amount",
        "total_expense", "additional_cost", "scope_total"
    ]
    for field in financial_fields:
        project.pop(field, None)
    
    # Material/labour/receipt data is project-wide: every SE/SR-SE assigned to a
    # project must see the same requests regardless of which of them created it.
    se_filter = {}
    petty_filter = (
        {"requested_by": user.user_id}
        if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]
        else {}
    )

    # Get material requests
    material_requests = await db.material_requests.find({
        "project_id": project_id,
        **se_filter,
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Get labour requests
    labour_requests = await db.labour_expenses.find({
        "project_id": project_id,
        **se_filter,
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Get material receipts
    material_receipts = await db.material_receipts.find({
        "project_id": project_id,
        **se_filter,
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Get petty cash
    petty_cash = await db.petty_cash.find({
        "project_id": project_id,
        **petty_filter,
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return {
        "project": project,
        "material_requests": material_requests,
        "labour_requests": labour_requests,
        "material_receipts": material_receipts,
        "petty_cash": petty_cash
    }


# ==================== APPROVED MATERIALS ENDPOINT ====================

@router.get("/projects/{project_id}/approved-materials")
async def get_project_approved_materials(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get materials available for a Site Engineer to request.

    Sources (deduped by name+brand, project-specific items first):
      1. db.project_materials (legacy approved materials with brand)
      2. project.package_materials (RE/Quotation package materials with brand)
      3. db.materials master catalog (industry-standard fallback)
    """
    allowed_roles = [
        UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM,
        UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT, UserRole.SUPER_ADMIN,
        UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT
    ]
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    # For Site Engineers, verify assignment
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        assignment = await db.site_engineer_assignments.find_one({
            "user_id": user.user_id,
            "project_id": project_id,
            "is_active": True
        }, {"_id": 0})
        if not assignment:
            raise HTTPException(status_code=403, detail="You are not assigned to this project")

    out = []
    seen = set()  # (name_lower, brand_lower)

    def _add(item, source):
        name = (item.get("name") or item.get("material_name") or "").strip()
        if not name:
            return
        brand = (item.get("brand") or "").strip()
        key = (name.lower(), brand.lower())
        if key in seen:
            return
        seen.add(key)
        # Planning Department locks unit + estimated_rate on package materials.
        # Surface them to the Site Engineer so the request screen can show
        # the price chip and disable unit edits when the row originated from
        # an applied package.
        is_pkg_locked = bool(item.get("is_locked_from_package"))
        locked_rate = item.get("locked_estimated_rate") if item.get("locked_estimated_rate") is not None else item.get("estimated_rate")
        out.append({
            "material_id": item.get("material_id") or f"src_{source}_{len(out)}",
            "name": name,
            "brand": brand,
            "unit": item.get("unit") or "kg",
            "category": item.get("category") or "",
            "specification": item.get("specification") or item.get("specs") or "",
            "standard_rate": item.get("standard_rate"),
            "estimated_rate": item.get("estimated_rate") or 0,
            "locked_estimated_rate": locked_rate if is_pkg_locked else None,
            "locked_unit": item.get("locked_unit") if is_pkg_locked else None,
            "is_locked_from_package": is_pkg_locked,
            "source": source,  # "project" | "package" | "master"
            "project_approved": source in ("project", "package"),
        })

    # 1) project_materials collection
    pm_rows = await db.project_materials.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    for r in pm_rows:
        _add(r, "project")

    # 2) project doc -> package_materials
    proj = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "package_materials": 1})
    for r in (proj or {}).get("package_materials") or []:
        _add(r, "package")

    # 3) Industry-wide master catalog
    master_rows = await db.materials.find({}, {"_id": 0}).to_list(2000)
    if not master_rows:
        # Master catalog is empty — seed a comprehensive default list once so SEs always
        # have construction materials to pick from. Idempotent: skipped on subsequent calls.
        try:
            await _seed_default_materials_catalog()
            master_rows = await db.materials.find({}, {"_id": 0}).to_list(2000)
        except Exception:
            master_rows = []
    for r in master_rows:
        _add(r, "master")

    return out


async def _seed_default_materials_catalog():
    """Seed db.materials with a baseline construction industry materials catalog.
    Idempotent — only inserts if collection is empty.
    """
    if await db.materials.count_documents({}) > 0:
        return
    catalog = [
        # Cement & Binders
        ("OPC 53 Grade Cement", "cement", "bags", "53 grade Ordinary Portland Cement, 50kg bag"),
        ("OPC 43 Grade Cement", "cement", "bags", "43 grade Ordinary Portland Cement, 50kg bag"),
        ("PPC Cement", "cement", "bags", "Portland Pozzolana Cement, 50kg bag"),
        ("PSC Cement", "cement", "bags", "Portland Slag Cement, 50kg bag"),
        ("White Cement", "cement", "bags", "20kg / 50kg bag"),
        ("Cement Plaster (Wall Care Putty)", "cement", "bags", "20kg / 40kg bag"),
        # Sand & Aggregate
        ("M-Sand", "sand", "tonnes", "Manufactured sand for concrete & plastering"),
        ("River Sand", "sand", "tonnes", "Natural river sand for plastering"),
        ("P-Sand", "sand", "tonnes", "Plastering sand"),
        ("20mm Aggregate", "aggregate", "tonnes", "Coarse aggregate, 20mm jelly"),
        ("12mm Aggregate", "aggregate", "tonnes", "Coarse aggregate, 12mm jelly"),
        ("40mm Aggregate", "aggregate", "tonnes", "Coarse aggregate, 40mm jelly"),
        ("GSB Aggregate", "aggregate", "tonnes", "Granular Sub Base"),
        ("Stone Dust", "aggregate", "tonnes", "Quarry stone dust"),
        # Steel & Reinforcement
        ("TMT Bar Fe500 8mm", "steel", "kg", "Thermo-mechanically treated bar, 8mm dia"),
        ("TMT Bar Fe500 10mm", "steel", "kg", "TMT bar, 10mm dia"),
        ("TMT Bar Fe500 12mm", "steel", "kg", "TMT bar, 12mm dia"),
        ("TMT Bar Fe500 16mm", "steel", "kg", "TMT bar, 16mm dia"),
        ("TMT Bar Fe500 20mm", "steel", "kg", "TMT bar, 20mm dia"),
        ("TMT Bar Fe500 25mm", "steel", "kg", "TMT bar, 25mm dia"),
        ("Binding Wire", "steel", "kg", "Annealed binding wire 18 SWG"),
        ("MS Angle", "steel", "kg", "Mild Steel angle"),
        ("MS Channel", "steel", "kg", "Mild Steel channel"),
        ("MS Flat", "steel", "kg", "Mild Steel flat"),
        ("MS Square Pipe", "steel", "kg", "MS square hollow section"),
        ("GI Pipe", "steel", "metres", "Galvanised iron pipe"),
        # Bricks & Blocks
        ("Red Brick", "bricks", "nos", "Standard red clay brick"),
        ("Fly Ash Brick", "bricks", "nos", "Eco-friendly fly ash brick"),
        ("Concrete Solid Block 4inch", "bricks", "nos", "100mm solid block"),
        ("Concrete Solid Block 6inch", "bricks", "nos", "150mm solid block"),
        ("AAC Block", "bricks", "cubic metres", "Autoclaved Aerated Concrete block"),
        ("Hollow Block 6inch", "bricks", "nos", "Hollow concrete block 150mm"),
        # Tiles & Stones
        ("Vitrified Floor Tile 600x600", "tiles", "sqft", "Glossy vitrified, 2x2 ft"),
        ("Vitrified Floor Tile 800x800", "tiles", "sqft", "Glossy vitrified"),
        ("Ceramic Wall Tile", "tiles", "sqft", "Bathroom / Kitchen wall"),
        ("Granite Tile", "tiles", "sqft", "Polished granite"),
        ("Marble Tile", "tiles", "sqft", "Polished marble"),
        ("Anti-skid Tile", "tiles", "sqft", "Bathroom / outdoor anti-skid"),
        ("Tile Adhesive", "tiles", "bags", "20kg bag"),
        ("Grout", "tiles", "kg", "Tile gap filler"),
        # Plumbing
        ("CPVC Pipe 1/2 inch", "plumbing", "metres", "Hot/cold water pipe"),
        ("CPVC Pipe 3/4 inch", "plumbing", "metres", "Hot/cold water pipe"),
        ("CPVC Pipe 1 inch", "plumbing", "metres", "Hot/cold water pipe"),
        ("PVC Pipe 4 inch", "plumbing", "metres", "Drain pipe"),
        ("PVC Pipe 6 inch", "plumbing", "metres", "Drain pipe"),
        ("UPVC Pipe", "plumbing", "metres", "Cold water pipe"),
        ("Bathroom Fittings Set", "plumbing", "set", "Tap/shower/health faucet bundle"),
        ("Wash Basin", "plumbing", "nos", "Ceramic wash basin"),
        ("EWC (Toilet)", "plumbing", "nos", "European water closet"),
        ("Kitchen Sink", "plumbing", "nos", "Stainless steel kitchen sink"),
        ("Water Tank 1000L", "plumbing", "nos", "Overhead 1000 litre tank"),
        ("Solenoid / Ball Valve", "plumbing", "nos", "Brass valve"),
        # Electrical
        ("Conduit Pipe 20mm", "electrical", "metres", "PVC conduit"),
        ("Conduit Pipe 25mm", "electrical", "metres", "PVC conduit"),
        ("Wire 1.5 sqmm", "electrical", "metres", "Single core copper wire"),
        ("Wire 2.5 sqmm", "electrical", "metres", "Single core copper wire"),
        ("Wire 4 sqmm", "electrical", "metres", "Single core copper wire"),
        ("Wire 6 sqmm", "electrical", "metres", "Single core copper wire"),
        ("MCB Switch", "electrical", "nos", "Miniature circuit breaker"),
        ("RCCB", "electrical", "nos", "Residual current circuit breaker"),
        ("Distribution Box", "electrical", "nos", "Modular DB"),
        ("Modular Switch", "electrical", "nos", "Wall switch"),
        ("Modular Socket", "electrical", "nos", "Wall socket"),
        ("LED Bulb", "electrical", "nos", "9W / 12W LED"),
        ("Fan", "electrical", "nos", "Ceiling fan"),
        # Paint & Finishes
        ("Primer", "paint", "litres", "Wall primer"),
        ("Wall Putty", "paint", "kg", "Acrylic wall putty"),
        ("Emulsion Paint - Interior", "paint", "litres", "Premium interior emulsion"),
        ("Emulsion Paint - Exterior", "paint", "litres", "Weatherproof exterior emulsion"),
        ("Distemper Paint", "paint", "kg", "Acrylic distemper"),
        ("Enamel Paint", "paint", "litres", "Synthetic enamel for metal/wood"),
        ("Wood Polish", "paint", "litres", "Melamine / lacquer"),
        # Wood & Doors
        ("Plywood 19mm", "wood", "sqft", "BWP grade plywood"),
        ("Plywood 12mm", "wood", "sqft", "BWP grade plywood"),
        ("Veneer Sheet", "wood", "sqft", "Decorative veneer"),
        ("Door Frame", "wood", "nos", "Hardwood door frame"),
        ("Wooden Door Shutter", "wood", "nos", "Solid panel door"),
        ("Aluminium Window", "wood", "sqft", "Sliding aluminium window"),
        ("UPVC Window", "wood", "sqft", "UPVC sliding window"),
        # Hardware
        ("Door Hinge", "hardware", "nos", "Stainless steel hinge"),
        ("Door Lock", "hardware", "nos", "Mortise lock"),
        ("Cabinet Handle", "hardware", "nos", "SS / brass handle"),
        ("Screws", "hardware", "kg", "Drywall / wood screws"),
        ("Nails", "hardware", "kg", "Common nails"),
        # Waterproofing
        ("Waterproofing Compound", "waterproofing", "kg", "Cement-based waterproofing"),
        ("Bitumen", "waterproofing", "litres", "Roof waterproofing"),
        ("PU Sealant", "waterproofing", "tubes", "Polyurethane sealant"),
        # Misc
        ("Curing Compound", "misc", "litres", "Concrete curing"),
        ("Form Oil / Shuttering Oil", "misc", "litres", "Mould release"),
        ("Plaster of Paris", "misc", "kg", "POP for ceiling"),
        ("Gypsum Board", "misc", "sqft", "False ceiling sheet"),
        ("Mortar Mix", "misc", "kg", "Ready-mix mortar"),
    ]
    docs = []
    for name, category, unit, spec in catalog:
        docs.append({
            "material_id": f"mat_{uuid.uuid4().hex[:10]}",
            "name": name,
            "category": category,
            "unit": unit,
            "specification": spec,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "seed",
        })
    if docs:
        await db.materials.insert_many(docs)


# Material Request Endpoints
class MaterialRequestCreate(BaseModel):
    project_id: str
    material_id: Optional[str] = None
    material_name: Optional[str] = None
    brand: Optional[str] = None
    is_approved_material: bool = False
    quantity: float
    unit: Optional[str] = None
    required_date: Optional[str] = None
    remarks: Optional[str] = None
    # Phase-1: SE delivery expectation. Procurement compares against this and
    # must explain late deliveries; SE must justify <48h emergency requests.
    se_delivery_choice: Optional[str] = "48h"  # "24h" | "48h" | "custom"
    se_requested_hours: Optional[int] = 48
    se_expected_delivery: Optional[str] = None  # ISO datetime
    se_emergency_reason: Optional[str] = None
    # Steel-specific metadata captured by the SE dialog when category=steel.
    # `quantity` is the auto-calculated weight in kg; this block preserves
    # the raw selection (diameter, rod count, length) so Procurement can
    # see exactly what was ordered downstream.
    steel_specs: Optional[Dict[str, Any]] = None


@router.post("/site-engineer/material-requests")
async def create_material_request(
    data: MaterialRequestCreate,
    user: User = Depends(get_current_user)
):
    """Create a new material request"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create material requests")
    
    # Verify assignment
    assignment = await db.site_engineer_assignments.find_one({
        "user_id": user.user_id,
        "project_id": data.project_id,
        "is_active": True
    }, {"_id": 0})
    
    if not assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    
    # Get material details
    mat_name = data.material_name or "Unknown Material"
    mat_unit = data.unit or "unit"
    mat_brand = data.brand or None

    # If using approved material from project_materials
    if data.is_approved_material and data.material_id:
        pm = await db.project_materials.find_one(
            {"material_id": data.material_id, "project_id": data.project_id}, {"_id": 0}
        )
        if pm:
            mat_name = pm.get("name", mat_name)
            mat_unit = pm.get("unit", mat_unit)
            mat_brand = pm.get("brand") or mat_brand
    elif data.material_id:
        material = await db.materials.find_one({"material_id": data.material_id}, {"_id": 0})
        if material:
            mat_name = material.get("name", mat_name)
            mat_unit = material.get("unit", mat_unit)
    
    # Get project name
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    
    request = MaterialRequest(
        project_id=data.project_id,
        site_engineer_id=user.user_id,
        material_id=data.material_id or f"mat_custom_{uuid.uuid4().hex[:8]}",
        material_name=mat_name,
        quantity=data.quantity,
        unit=mat_unit,
        remarks=data.remarks
    )
    
    req_dict = request.model_dump()
    req_dict["request_number"] = await next_seq("material_request_global")
    req_dict["status"] = req_dict["status"].value
    # NEW FLOW: SE → Planning Person (initial approval) → Procurement → Planning (price approval) → Accountant → ...
    # Override the default `requested` so it routes to Planning first instead of Procurement.
    req_dict["status"] = "planning_initial_pending"
    req_dict["created_at"] = req_dict["created_at"].isoformat()
    req_dict["project_name"] = project["name"] if project else "Unknown"
    req_dict["site_engineer_name"] = user.name
    req_dict["required_date"] = data.required_date
    req_dict["brand"] = mat_brand
    req_dict["is_approved_material"] = data.is_approved_material
    # Persist SE delivery expectation
    req_dict["se_delivery_choice"] = data.se_delivery_choice or "48h"
    req_dict["se_requested_hours"] = data.se_requested_hours or 48
    req_dict["se_expected_delivery"] = data.se_expected_delivery
    req_dict["se_emergency_reason"] = data.se_emergency_reason or ""
    if (data.se_requested_hours or 48) < 48 and not (data.se_emergency_reason or "").strip():
        raise HTTPException(status_code=400, detail="Emergency reason is required for delivery under 48 hours")

    # Steel metadata — preserves the raw SE inputs (diameter mm, rod count,
    # rod length) so Procurement / Inventory can see exactly what was
    # ordered downstream. `quantity` itself is the auto-calc weight in kg.
    if data.steel_specs:
        req_dict["steel_specs"] = data.steel_specs
        req_dict["category"] = "steel"

    # Auto-lookup assigned vendor for this material category
    vendor_match = await find_assigned_vendor_for_material(data.project_id, mat_name)
    if vendor_match:
        req_dict["assigned_vendor_id"] = vendor_match.get("vendor_id")
        req_dict["assigned_vendor_name"] = vendor_match.get("vendor_name")
        req_dict["assigned_vendor_category"] = vendor_match.get("category")

    await db.material_requests.insert_one(req_dict)
    req_dict.pop("_id", None)
    
    # Notify Planning first (new flow), plus PM/Procurement for awareness.
    pm_users = await db.users.find({"role": {"$in": ["planning", "planning_person", "project_manager", "procurement"]}}, {"_id": 0}).to_list(100)
    for p in pm_users:
        await create_notification(p["user_id"], f"New material request awaiting Planning approval: {mat_name} x {data.quantity}")
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_material_request_created
        asyncio.ensure_future(notify_material_request_created(req_dict, user.name))
    except Exception:
        pass
    
    await create_audit_log(user.user_id, "create", "material_request", request.request_id, {"material": mat_name, "qty": data.quantity})
    
    return req_dict


@router.patch("/site-engineer/material-requests/{request_id}")
async def update_material_request(
    request_id: str,
    updates: dict,
    user: User = Depends(get_current_user)
):
    """Update a material request - only editable fields, only by the SE who created it, and only before procurement picks it up."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can edit material requests")

    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if request.get("site_engineer_id") != user.user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own requests")

    # Fields that can never be edited
    protected_fields = {
        "request_id", "order_id", "project_id", "project_name", "site_engineer_id",
        "site_engineer_name", "status", "created_at", "planning_approved_by",
        "planning_approved_at", "procurement_approved_by", "procurement_approved_at",
        "accountant_approved_by", "accountant_approved_at", "po_id", "po_generated_at",
        "dispatched_at", "received_at", "rejected_by", "rejection_reason",
        "receipt_otp", "receipt_otp_verified", "vendor_id", "vendor_name",
        "assigned_vendor_id", "assigned_vendor_name", "total_amount",
        "payment_type", "advance_amount", "balance_amount", "unit_rate",
        "transport_cost", "discount", "credit_period_days", "payment_reference",
    }

    allowed_updates = {}
    for key, value in updates.items():
        if key not in protected_fields:
            allowed_updates[key] = value

    if not allowed_updates:
        raise HTTPException(status_code=400, detail="No editable fields provided")

    allowed_updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    # If the request was rejected by Planning's initial review, editing auto-resubmits it.
    if request.get("status") == "planning_initial_rejected":
        allowed_updates["status"] = "planning_initial_pending"
        allowed_updates["planning_initial_resubmitted_at"] = allowed_updates["updated_at"]

    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": allowed_updates}
    )

    # If this is a resubmit after planning-initial rejection, ping Planning again.
    if allowed_updates.get("status") == "planning_initial_pending" and request.get("status") == "planning_initial_rejected":
        try:
            planning_users = await db.users.find(
                {"role": {"$in": ["planning", "planning_person", "super_admin"]}, "is_active": {"$ne": False}},
                {"_id": 0, "user_id": 1},
            ).to_list(50)
            for p in planning_users:
                await create_notification(p["user_id"], f"Material request resubmitted by SE: {request.get('material_name')}")
        except Exception:
            pass

    updated = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    await create_audit_log(user.user_id, "update", "material_request", request_id, allowed_updates)
    return updated


@router.delete("/site-engineer/material-requests/{request_id}")
async def delete_material_request(
    request_id: str,
    user: User = Depends(get_current_user),
):
    """SE / Sr.SE can delete their OWN material request only while it is
    still at the initial pending state (Planning hasn't approved yet).
    Once any approval flag is set (planning_initial / PM / procurement /
    accounts / final), the delete endpoint refuses to preserve audit chain.
    Super Admin bypasses both checks.
    """
    if user.role not in (UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Permission denied")

    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Material request not found")

    # Status guard — only delete while Planning hasn't acted on the request.
    # Super Admin bypasses this guard (Feb 2026) so they can delete delivered
    # / paid / rejected material requests from the Planning Requests view —
    # useful for cleaning up test data and removing obsolete deliveries that
    # never produced a usable income trail.
    locking_statuses = {
        "planning_initial_approved", "pm_approved", "planning_approved",
        "pending_procurement", "pending_accounts_approval", "pending_planning_final",
        "approved_for_po", "po_issued", "in_transit", "received", "paid",
        "delivered", "planning_initial_rejected", "rejected_by_planning", "rejected",
    }
    if user.role != UserRole.SUPER_ADMIN and (req.get("status") or "").lower() in locking_statuses:
        raise HTTPException(status_code=400, detail="Cannot delete — request already moved past initial review")

    # Ownership guard (skipped for Super Admin)
    if user.role != UserRole.SUPER_ADMIN:
        owner_id = req.get("requested_by") or req.get("created_by")
        if owner_id and owner_id != user.user_id:
            raise HTTPException(status_code=403, detail="You can only delete your own requests")

    await db.material_requests.delete_one({"request_id": request_id})
    await create_audit_log(user.user_id, "delete", "material_request", request_id, {"reason": "SE deleted before planning approval"})
    return {"message": "Material request deleted", "request_id": request_id}




@router.get("/site-engineer/material-requests")
async def get_material_requests(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material requests"""
    # Role gate: only roles that legitimately interact with material requests can list them.
    # Vendor / Sales / HR / Pre-Sales / Architect / Marketing / Client must NOT see internal
    # material requests across projects (competitive / privacy concern).
    allowed_roles = {
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER,
        UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM,
        UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT,
        UserRole.ACCOUNTANT, UserRole.CRE,
    }
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    query = {}

    if user.role == UserRole.SITE_ENGINEER:
        query["site_engineer_id"] = user.user_id

    if project_id:
        query["project_id"] = project_id

    if status:
        query["status"] = status

    requests = await db.material_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Enrich with project name
    for r in requests:
        project = await db.projects.find_one({"project_id": r["project_id"]}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"

    return requests


@router.get("/projects/{project_id}/vendor-suggestion")
async def get_vendor_suggestion_for_material(
    project_id: str,
    material_name: str,
    user: User = Depends(get_current_user)
):
    """Get the assigned vendor for a material category in a project (for auto-suggestion)."""
    match = await find_assigned_vendor_for_material(project_id, material_name)
    if match:
        return {
            "found": True,
            "vendor_id": match.get("vendor_id"),
            "vendor_name": match.get("vendor_name"),
            "category": match.get("category"),
            "brand": match.get("brand", "")
        }
    return {"found": False}


@router.patch("/site-engineer/material-requests/{request_id}/approve")
async def approve_material_request(
    request_id: str,
    action: str,  # pm_approve, planning_approve, procurement_assign, accountant_approve, reject
    rejection_reason: Optional[str] = None,
    pricing: Optional[float] = None,
    vendor_id: Optional[str] = None,
    vendor_payment_type: Optional[str] = None,  # advance, full_payment, credit
    user: User = Depends(get_current_user)
):
    """Approve or reject a material request at various stages"""
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    update_data = {}
    
    # Step 1: Project Manager approves (first approval)
    if action == "pm_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
            raise HTTPException(status_code=403, detail="Only Project Manager can approve this")
        if request["status"] != "requested":
            raise HTTPException(status_code=400, detail="Invalid status for PM approval")
        update_data = {
            "status": MaterialRequestStatus.PM_APPROVED.value,
            "pm_approved_by": user.user_id,
            "pm_approved_at": datetime.now(timezone.utc).isoformat()
        }
        # Notify planning
        planning_users = await db.users.find({"role": "planning"}, {"_id": 0}).to_list(100)
        for p in planning_users:
            await create_notification(p["user_id"], f"Material request needs planning approval: {request['material_name']}")
    
    # Step 2: Planning approves
    elif action == "planning_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
            raise HTTPException(status_code=403, detail="Only Planning can approve this")
        if request["status"] not in ["requested", "pm_approved"]:
            raise HTTPException(status_code=400, detail="Invalid status for planning approval")
        now_iso = datetime.now(timezone.utc).isoformat()
        update_data = {
            "status": MaterialRequestStatus.PLANNING_APPROVED.value,
            "planning_approved_by": user.user_id,
            "planning_approved_at": now_iso
        }

        # Auto-lookup assigned vendor for this material category
        vendor_match = request.get("assigned_vendor_id") and {
            "vendor_id": request.get("assigned_vendor_id"),
            "vendor_name": request.get("assigned_vendor_name"),
            "category": request.get("assigned_vendor_category"),
        }
        if not vendor_match:
            vendor_match = await find_assigned_vendor_for_material(
                request["project_id"], request["material_name"]
            )
        if vendor_match:
            update_data["assigned_vendor_id"] = vendor_match.get("vendor_id")
            update_data["assigned_vendor_name"] = vendor_match.get("vendor_name")
            update_data["assigned_vendor_category"] = vendor_match.get("category")
            update_data["vendor_id"] = vendor_match.get("vendor_id")
            update_data["vendor_name"] = vendor_match.get("vendor_name")

            # Auto-create Purchase Order
            merged_req = {**request, **update_data}
            po = await auto_create_purchase_order(merged_req, vendor_match, user.user_id)
            if po:
                update_data["po_id"] = po["po_id"]
                update_data["po_generated_at"] = now_iso
                update_data["auto_po_generated"] = True
                # Move to accountant for payment approval
                update_data["status"] = MaterialRequestStatus.PENDING_ACCOUNTS_APPROVAL.value

            # Notify accountant about pending payment
            acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
            for a in acc_users:
                await create_notification(
                    a["user_id"],
                    f"Material payment pending approval: {request['material_name']} → Vendor: {vendor_match.get('vendor_name')}. PO auto-generated."
                )
            # Also notify procurement
            proc_users = await db.users.find({"role": "procurement"}, {"_id": 0}).to_list(100)
            for p in proc_users:
                await create_notification(
                    p["user_id"],
                    f"Auto PO generated for {request['material_name']} → Vendor: {vendor_match.get('vendor_name')}. Review PO."
                )
        else:
            # No vendor assigned — notify procurement to manually assign
            proc_users = await db.users.find({"role": "procurement"}, {"_id": 0}).to_list(100)
            for p in proc_users:
                await create_notification(p["user_id"], f"Material request ready for vendor assignment: {request['material_name']}")
    
    # Step 3: Procurement assigns vendor
    elif action == "procurement_assign":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
            raise HTTPException(status_code=403, detail="Only Procurement can assign vendor")
        if request["status"] != "planning_approved":
            raise HTTPException(status_code=400, detail="Invalid status for procurement assignment")
        if not vendor_id:
            raise HTTPException(status_code=400, detail="Vendor ID is required")
        
        # Get vendor details
        vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        
        update_data = {
            "status": MaterialRequestStatus.PROCUREMENT_ASSIGNED.value,
            "vendor_id": vendor_id,
            "vendor_name": vendor.get("name", "Unknown"),
            "vendor_payment_type": vendor_payment_type or "full_payment",
            "procurement_pricing": pricing,
            "procurement_assigned_by": user.user_id,
            "procurement_assigned_at": datetime.now(timezone.utc).isoformat()
        }
        
        # If advance payment type, notify accountant
        if vendor_payment_type == "advance":
            acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
            for a in acc_users:
                await create_notification(a["user_id"], f"Advance payment required for: {request['material_name']} - ₹{pricing or 0}")
            update_data["status"] = MaterialRequestStatus.WAITING_PAYMENT.value
        else:
            # For full_payment and credit, order can be placed directly
            update_data["status"] = MaterialRequestStatus.ORDER_PLACED.value
            await create_notification(request["site_engineer_id"], f"Order placed: {request['material_name']}")
    
    # Step 4: Accountant approves payment (for advance payment)
    elif action == "accountant_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
            raise HTTPException(status_code=403, detail="Only Accountant can approve payment")
        if request["status"] != "waiting_payment":
            raise HTTPException(status_code=400, detail="Invalid status for payment approval")
        update_data = {
            "status": MaterialRequestStatus.ORDER_PLACED.value,
            "payment_approved_by": user.user_id,
            "payment_approved_at": datetime.now(timezone.utc).isoformat()
        }
        # Notify procurement and site engineer
        await create_notification(request.get("procurement_assigned_by", ""), f"Payment approved, order can be placed: {request['material_name']}")
        await create_notification(request["site_engineer_id"], f"Order placed: {request['material_name']}")
    
    # Mark as in transit
    elif action == "mark_in_transit":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
            raise HTTPException(status_code=403, detail="Only Procurement can mark as in transit")
        if request["status"] != "order_placed":
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data = {
            "status": MaterialRequestStatus.IN_TRANSIT.value,
            "dispatched_at": datetime.now(timezone.utc).isoformat()
        }
        await create_notification(request["site_engineer_id"], f"Material dispatched: {request['material_name']}")
    
    elif action == "reject":
        update_data = {
            "status": MaterialRequestStatus.REJECTED.value,
            "rejected_by": user.user_id,
            "rejection_reason": rejection_reason,
            "rejected_at": datetime.now(timezone.utc).isoformat()
        }
        await create_notification(request["site_engineer_id"], f"Material request rejected: {request['material_name']} - {rejection_reason or 'No reason'}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    await db.material_requests.update_one({"request_id": request_id}, {"$set": update_data})
    await create_audit_log(user.user_id, action, "material_request", request_id, update_data)
    
    return await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})


# Labour Request Endpoints
class LabourRequestCreate(BaseModel):
    project_id: str
    labour_type: str
    num_workers: int
    num_days: int
    rate_per_day: float
    remarks: Optional[str] = None


@router.post("/site-engineer/labour-requests")
async def create_labour_request(
    data: LabourRequestCreate,
    user: User = Depends(get_current_user)
):
    """Create a new labour request"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create labour requests")
    
    # Verify assignment
    assignment = await db.site_engineer_assignments.find_one({
        "user_id": user.user_id,
        "project_id": data.project_id,
        "is_active": True
    }, {"_id": 0})
    
    if not assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    
    # Get project name
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    
    total_amount = data.num_workers * data.num_days * data.rate_per_day
    
    request = LabourRequest(
        project_id=data.project_id,
        site_engineer_id=user.user_id,
        labour_type=data.labour_type,
        num_workers=data.num_workers,
        num_days=data.num_days,
        rate_per_day=data.rate_per_day,
        total_amount=total_amount,
        description=f"{data.labour_type} - {data.num_workers} workers x {data.num_days} days",
        remarks=data.remarks
    )
    
    req_dict = request.model_dump()
    req_dict["status"] = req_dict["status"].value
    req_dict["created_at"] = req_dict["created_at"].isoformat()
    req_dict["project_name"] = project["name"] if project else "Unknown"
    req_dict["site_engineer_name"] = user.name
    req_dict["amount"] = total_amount  # Alias for compatibility
    await db.labour_expenses.insert_one(req_dict)
    req_dict.pop("_id", None)
    
    # Notify PM
    pm_users = await db.users.find({"role": "project_manager"}, {"_id": 0}).to_list(100)
    for p in pm_users:
        await create_notification(p["user_id"], f"New labour request: {data.labour_type} x {data.num_workers} workers")
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_labour_request_created
        asyncio.ensure_future(notify_labour_request_created(req_dict, user.name))
    except Exception:
        pass
    
    await create_audit_log(user.user_id, "create", "labour_request", request.labour_expense_id, {"type": data.labour_type, "workers": data.num_workers})
    
    return req_dict


@router.get("/site-engineer/labour-requests")
async def get_labour_requests(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get labour requests"""
    query = {}
    
    if user.role == UserRole.SITE_ENGINEER:
        query["site_engineer_id"] = user.user_id
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    requests = await db.labour_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with project name
    for r in requests:
        if "project_name" not in r:
            project = await db.projects.find_one({"project_id": r["project_id"]}, {"_id": 0, "name": 1})
            r["project_name"] = project["name"] if project else "Unknown"
    
    return requests


@router.patch("/site-engineer/labour-requests/{request_id}/approve")
async def approve_labour_request(
    request_id: str,
    action: str,  # planning_approve, accountant_approve, reject
    rejection_reason: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Approve or reject a labour request"""
    # Try both id fields for backwards compatibility
    request = await db.labour_expenses.find_one(
        {"$or": [{"labour_expense_id": request_id}, {"request_id": request_id}]}, {"_id": 0}
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    id_field = "labour_expense_id" if "labour_expense_id" in request else "request_id"
    update_data = {}
    
    if action == "planning_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "requested":
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data = {
            "status": LabourRequestStatus.PLANNING_APPROVED.value,
            "planning_approved_by": user.user_id,
            "planning_approved_at": datetime.now(timezone.utc).isoformat()
        }
        # Notify accountant
        acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
        for a in acc_users:
            await create_notification(a["user_id"], f"Labour request ready for approval: {request.get('labour_type', request.get('description', 'Labour'))}")
    
    elif action == "accountant_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] not in ["planning_approved", "pending_accounts_approval", "pm_verified"]:
            raise HTTPException(status_code=400, detail=f"Invalid status: {request['status']}. Expected planning_approved or pending_accounts_approval")
        update_data = {
            "status": "accounts_approved",
            "accountant_approved_by": user.user_id,
            "accountant_approved_at": datetime.now(timezone.utc).isoformat()
        }
        se_id = request.get("site_engineer_id", "")
        await create_notification(se_id, f"Labour request approved by accounts: {request.get('labour_type', request.get('description', 'Labour'))}")
    
    elif action == "reject":
        update_data = {
            "status": LabourRequestStatus.REJECTED.value,
            "rejection_reason": rejection_reason
        }
        se_id = request.get("site_engineer_id", "")
        await create_notification(se_id, f"Labour request rejected: {request.get('labour_type', request.get('description', 'Labour'))}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    await db.labour_expenses.update_one({id_field: request_id}, {"$set": update_data})
    await create_audit_log(user.user_id, action, "labour_request", request_id, update_data)
    
    return await db.labour_expenses.find_one({id_field: request_id}, {"_id": 0})


# ==================== PLANNING BOARD ENDPOINTS ====================
# These endpoints are used by the Planning Board to view and approve/reject requests

@router.get("/material-requests")
async def get_material_requests_for_planning(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material requests - accessible to Planning, Procurement, PM, Accountant, GM, Super Admin"""
    allowed = [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROCUREMENT, UserRole.SUPER_ADMIN,
               UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.SR_SITE_ENGINEER,
               UserRole.GENERAL_MANAGER]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.material_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with project name
    project_cache = {}
    for r in requests:
        pid = r.get("project_id")
        if pid not in project_cache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            project_cache[pid] = p["name"] if p else "Unknown"
        r["project_name"] = project_cache[pid]
    
    return requests


@router.patch("/material-requests/{request_id}/planning-action")
async def planning_action_material_request(
    request_id: str,
    action: str,
    reason: Optional[str] = None,
    approved_qty: Optional[float] = None,
    user: User = Depends(get_current_user)
):
    """Planning team approves or rejects a material request"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can perform this action")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if action == "approve":
        if request["status"] not in ["requested", "pm_approved"]:
            raise HTTPException(status_code=400, detail=f"Cannot approve request in status: {request['status']}")
        now_iso = datetime.now(timezone.utc).isoformat()
        update_data = {
            "status": MaterialRequestStatus.PLANNING_APPROVED.value,
            "planning_approved_by": user.user_id,
            "planning_approved_at": now_iso
        }
        if approved_qty is not None:
            update_data["approved_quantity"] = approved_qty

        # Auto-lookup assigned vendor for this material category
        vendor_match = request.get("assigned_vendor_id") and {
            "vendor_id": request.get("assigned_vendor_id"),
            "vendor_name": request.get("assigned_vendor_name"),
            "category": request.get("assigned_vendor_category"),
        }
        if not vendor_match:
            vendor_match = await find_assigned_vendor_for_material(
                request["project_id"], request["material_name"]
            )
        if vendor_match:
            update_data["assigned_vendor_id"] = vendor_match.get("vendor_id")
            update_data["assigned_vendor_name"] = vendor_match.get("vendor_name")
            update_data["assigned_vendor_category"] = vendor_match.get("category")
            update_data["vendor_id"] = vendor_match.get("vendor_id")
            update_data["vendor_name"] = vendor_match.get("vendor_name")
            # Auto-create Purchase Order
            merged_req = {**request, **update_data}
            po = await auto_create_purchase_order(merged_req, vendor_match, user.user_id)
            if po:
                update_data["po_id"] = po["po_id"]
                update_data["po_generated_at"] = now_iso
                update_data["auto_po_generated"] = True
                # Move to accountant for payment approval
                update_data["status"] = MaterialRequestStatus.PENDING_ACCOUNTS_APPROVAL.value

        await db.material_requests.update_one({"request_id": request_id}, {"$set": update_data})
        
        # Notify accountant if auto-PO, otherwise notify procurement
        if vendor_match:
            acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
            for a in acc_users:
                await create_notification(a["user_id"], f"Material payment pending approval: {request['material_name']} → Vendor: {vendor_match.get('vendor_name')}. PO auto-generated.")
        proc_users = await db.users.find({"role": "procurement"}, {"_id": 0}).to_list(100)
        for p in proc_users:
            msg = f"Auto PO generated for {request['material_name']} → Vendor: {vendor_match.get('vendor_name')}. Review PO." if vendor_match else f"Material request approved by Planning: {request['material_name']} x {request['quantity']}"
            await create_notification(p["user_id"], msg)
        
        await create_audit_log(user.user_id, "planning_approve", "material_request", request_id, update_data)
        return {"message": "Approved", "status": update_data.get("status", "planning_approved"), "auto_po": bool(vendor_match)}
    
    elif action == "reject":
        update_data = {
            "status": MaterialRequestStatus.REJECTED.value,
            "rejection_reason": reason or "Rejected by Planning",
            "rejected_by": user.user_id,
            "rejected_at": datetime.now(timezone.utc).isoformat()
        }
        await db.material_requests.update_one({"request_id": request_id}, {"$set": update_data})
        await create_notification(request["site_engineer_id"], f"Material request rejected: {request['material_name']}")
        await create_audit_log(user.user_id, "reject", "material_request", request_id, update_data)
        return {"message": "Rejected", "status": "rejected"}
    
    raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'")


@router.get("/labour-expenses")
async def get_labour_expenses_for_planning(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get labour expenses - accessible to Planning, Accountant, PM, Super Admin"""
    allowed = [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT,
               UserRole.PROJECT_MANAGER, UserRole.SR_SITE_ENGINEER]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.labour_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with project name
    project_cache = {}
    for r in requests:
        pid = r.get("project_id")
        if pid and pid not in project_cache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            project_cache[pid] = p["name"] if p else "Unknown"
        r["project_name"] = project_cache.get(pid, "Unknown")
    
    return requests


@router.patch("/labour-expenses/{expense_id}/planning-action")
async def planning_action_labour_expense(
    expense_id: str,
    action: str,
    reason: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Planning team approves or rejects a labour expense"""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can perform this action")
    
    request = await db.labour_expenses.find_one(
        {"$or": [{"labour_expense_id": expense_id}, {"request_id": expense_id}]}, {"_id": 0}
    )
    if not request:
        raise HTTPException(status_code=404, detail="Labour request not found")
    
    id_field = "labour_expense_id" if "labour_expense_id" in request else "request_id"
    
    if action == "approve":
        if request["status"] != "requested":
            raise HTTPException(status_code=400, detail=f"Cannot approve in status: {request['status']}")
        update_data = {
            "status": LabourRequestStatus.PENDING_ACCOUNTS_APPROVAL.value,
            "planning_approved_by": user.user_id,
            "planning_approved_at": datetime.now(timezone.utc).isoformat()
        }
        await db.labour_expenses.update_one({id_field: expense_id}, {"$set": update_data})
        
        # Notify accountant
        acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
        for a in acc_users:
            await create_notification(a["user_id"], f"Labour payment pending approval: {request.get('labour_type', request.get('description', 'Labour'))}")
        
        await create_audit_log(user.user_id, "planning_approve", "labour_expense", expense_id, update_data)
        return {"message": "Approved", "status": "pending_accounts_approval"}
    
    elif action == "reject":
        update_data = {
            "status": LabourRequestStatus.REJECTED.value,
            "rejection_reason": reason or "Rejected by Planning",
            "rejected_by": user.user_id,
            "rejected_at": datetime.now(timezone.utc).isoformat()
        }
        await db.labour_expenses.update_one({id_field: expense_id}, {"$set": update_data})
        se_id = request.get("site_engineer_id", "")
        await create_notification(se_id, f"Labour request rejected: {request.get('labour_type', request.get('description', 'Labour'))}")
        await create_audit_log(user.user_id, "reject", "labour_expense", expense_id, update_data)
        return {"message": "Rejected", "status": "rejected"}
    
    raise HTTPException(status_code=400, detail="Invalid action. Use 'approve' or 'reject'")


# Material Receipt with OTP
class MaterialReceiptCreate(BaseModel):
    request_id: str
    received_qty: float
    gps_latitude: float
    gps_longitude: float
    receive_date: Optional[str] = None
    receive_time: Optional[str] = None
    lorry_image_id: Optional[str] = None
    material_image_id: Optional[str] = None
    photo_url: Optional[str] = None
    remarks: Optional[str] = None
    # Feb 12 2026 — per-diameter received qty for steel orders. Each entry:
    #   { diameter_mm, rod_count, requested_weight_kg, received_weight_kg, diff_kg }
    steel_received: Optional[List[Dict[str, Any]]] = None
    # Reason captured when received qty ≠ requested (sum or per-row)
    qty_mismatch_reason: Optional[str] = None


import random
import string

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))


@router.post("/site-engineer/material-requests/{request_id}/mark-collected")
async def mark_material_collected(request_id: str, user: User = Depends(get_current_user)):
    """Site Engineer confirms physical pickup of an in-transit material —
    a lightweight checkpoint BEFORE the full receipt (qty/photos/GPS) is
    logged. Splits the old single-step 'receive' flow into two real stages:
      in_transit -> [SE marks collected] -> collected (Collect Material tab)
      collected  -> [SE logs full receipt] -> procurement_verifying (Purchase Verification tab, unchanged)
    """
    if user.role not in (UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER):
        raise HTTPException(status_code=403, detail="Only Site Engineers can mark materials collected")

    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Material request not found")

    if user.role == UserRole.SITE_ENGINEER:
        if request["site_engineer_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="You can only collect materials for your own requests")
    else:  # SR_SITE_ENGINEER
        if request["site_engineer_id"] != user.user_id:
            proj = await db.projects.find_one(
                {"project_id": request.get("project_id")},
                {"_id": 0, "team": 1},
            )
            team = (proj or {}).get("team") or {}
            if team.get("sr_site_engineer") != user.user_id:
                raise HTTPException(status_code=403, detail="You can only collect materials for projects you supervise")

    if request.get("status") not in ["in_transit", "ready_for_delivery"]:
        raise HTTPException(status_code=400, detail=f"Cannot mark collected in status: {request.get('status')}")

    now = datetime.now(timezone.utc).isoformat()
    await db.material_requests.update_one({"request_id": request_id}, {"$set": {
        "status": "collected",
        "collected_at": now,
        "collected_by": user.user_id,
        "collected_by_name": user.name,
    }})
    await create_audit_log(user.user_id, "mark_collected", "material_request", request_id, {"status": "collected"})
    return {"message": "Marked as collected — log the full receipt next", "status": "collected"}


@router.post("/site-engineer/material-receipts/initiate")
async def initiate_material_receipt(
    data: MaterialReceiptCreate,
    user: User = Depends(get_current_user)
):
    """Receive material — OTP step removed, receipt is auto-verified.
    Captures GPS, lorry/material images, qty, remarks, then advances the
    underlying material_request through the same payment-mode-aware logic
    that previously lived in /verify-otp."""
    if user.role not in (UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER):
        raise HTTPException(status_code=403, detail="Only Site Engineers can receive materials")

    request = await db.material_requests.find_one({"request_id": data.request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Material request not found")

    # Ownership check:
    #  • SITE_ENGINEER can only receive their own requests.
    #  • SR_SITE_ENGINEER can receive for any request under a project where they are
    #    listed as the sr_site_engineer (or the requesting SE).
    if user.role == UserRole.SITE_ENGINEER:
        if request["site_engineer_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="You can only receive materials for your own requests")
    else:  # SR_SITE_ENGINEER
        if request["site_engineer_id"] != user.user_id:
            proj = await db.projects.find_one(
                {"project_id": request.get("project_id")},
                {"_id": 0, "team": 1},
            )
            team = (proj or {}).get("team") or {}
            if team.get("sr_site_engineer") != user.user_id:
                raise HTTPException(status_code=403, detail="You can only receive materials for projects you supervise")

    # `in_transit` is deliberately excluded — the modern flow requires SE to
    # mark-collected first (see /mark-collected above), which flips status to
    # `collected`. Legacy statuses below bypass that checkpoint unchanged.
    if request["status"] not in ["accountant_approved", "ready_for_delivery", "received_partial", "order_placed", "collected"]:
        raise HTTPException(status_code=400, detail="Material is not ready for receiving")

    now_iso = datetime.now(timezone.utc).isoformat()

    # Build receipt record (auto-verified — no OTP)
    receipt = MaterialReceipt(
        request_id=data.request_id,
        project_id=request["project_id"],
        site_engineer_id=user.user_id,
        requested_qty=request["quantity"],
        received_qty=data.received_qty,
        gps_latitude=data.gps_latitude,
        gps_longitude=data.gps_longitude,
        photo_url=data.photo_url,
        remarks=data.remarks,
        otp_code="",
        otp_expires_at=datetime.now(timezone.utc),
    )
    rcpt_dict = receipt.model_dump()
    rcpt_dict["created_at"] = rcpt_dict["created_at"].isoformat()
    rcpt_dict["otp_expires_at"] = now_iso
    rcpt_dict["otp_verified"] = True
    rcpt_dict["verified_at"] = now_iso
    rcpt_dict["receive_date"] = data.receive_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rcpt_dict["receive_time"] = data.receive_time or datetime.now(timezone.utc).strftime("%H:%M")
    rcpt_dict["lorry_image_id"] = data.lorry_image_id
    rcpt_dict["material_image_id"] = data.material_image_id
    rcpt_dict["material_name"] = request.get("material_name", "")
    rcpt_dict["unit"] = request.get("unit", "")
    rcpt_dict["brand"] = request.get("brand", "")
    if data.steel_received:
        # Per-diameter received qty (Feb 2026) — kept on the receipt for audit.
        rcpt_dict["steel_received"] = [dict(x) for x in data.steel_received]
    if (data.qty_mismatch_reason or "").strip():
        rcpt_dict["qty_mismatch_reason"] = data.qty_mismatch_reason.strip()
    rcpt_dict.pop("otp_code", None)  # never persist empty OTP
    await db.material_receipts.insert_one(rcpt_dict)
    rcpt_dict.pop("_id", None)

    # === Advance the parent material_request (same logic as old verify-otp) ===
    total_received = data.received_qty
    other_receipts = await db.material_receipts.find({
        "request_id": data.request_id,
        "otp_verified": True,
        "receipt_id": {"$ne": rcpt_dict["receipt_id"]},
    }, {"_id": 0}).to_list(100)
    for r in other_receipts:
        total_received += r.get("received_qty", 0)

    payment_mode = (request.get("payment_mode") or "").lower()
    is_new_flow = payment_mode in ("pre_paid", "advance", "credit", "post_delivery")

    if is_new_flow:
        update = {
            "received_at": now_iso,
            "received_by": user.user_id,
            "received_by_name": user.name,
            "received_quantity": total_received,
            "lorry_image_id": data.lorry_image_id,
            "material_image_id": data.material_image_id,
        }
        # NEW: every payment mode now flows through Procurement verification
        # before reaching its final next-state. We compute the "post-verify"
        # destination here, stash it on `pending_next_status`, and set
        # `status = procurement_verifying`. The procurement /verify endpoint
        # advances status to whatever we stashed.
        post_verify_status = None
        post_verify_extra = {}
        if payment_mode == "advance":
            post_verify_status = "pending_balance_payment"
            post_verify_extra["next_payment_phase"] = "balance"
        elif payment_mode == "post_delivery":
            post_verify_status = "pending_accounts_approval"
            post_verify_extra["next_payment_phase"] = "full"
        elif payment_mode == "credit":
            post_verify_status = "delivered"
            post_verify_extra["delivered_at"] = now_iso
            try:
                credit_days = int(request.get("credit_days") or 30)
            except (TypeError, ValueError):
                credit_days = 30
            due_date = (datetime.now(timezone.utc) + timedelta(days=credit_days)).isoformat()
            ledger_id = f"vc_{uuid.uuid4().hex[:10]}"
            await db.vendor_credit_ledger.insert_one({
                "ledger_id": ledger_id,
                "request_id": request["request_id"],
                "vendor_id": request.get("vendor_id"),
                "vendor_name": request.get("vendor_name"),
                "project_id": request.get("project_id"),
                "material_name": request.get("material_name"),
                "amount": float(request.get("total_amount") or 0),
                "credit_days": credit_days,
                "delivered_at": now_iso,
                "due_date": due_date,
                "status": "pending",
                "created_at": now_iso,
            })
            post_verify_extra["credit_ledger_id"] = ledger_id
            post_verify_extra["credit_due_date"] = due_date
        else:  # pre_paid — in the new flow Accountant didn't pre-pay, so route to them for full payment after verify.
            post_verify_status = "pending_accounts_approval"
            post_verify_extra["next_payment_phase"] = "full"

        update["status"] = "procurement_verifying"
        update["pending_next_status"] = post_verify_status
        update["pending_next_extra"] = post_verify_extra
        update["procurement_verification_pending_since"] = now_iso
        await db.material_requests.update_one({"request_id": data.request_id}, {"$set": update})

        # Notify Procurement — a delivery is awaiting their verification (qty/invoice/price)
        try:
            procs = await db.users.find(
                {"role": {"$in": ["procurement", "super_admin"]}, "is_active": {"$ne": False}},
                {"_id": 0, "user_id": 1},
            ).to_list(50)
            for p in procs:
                await create_notification(
                    p["user_id"],
                    f"Verify delivery: {request.get('material_name')} from {request.get('vendor_name') or '—'} — qty/invoice/price check pending",
                )
        except Exception:
            pass
    else:
        # Legacy flow
        if total_received >= request["quantity"]:
            new_status = MaterialRequestStatus.RECEIVED_COMPLETED.value
        else:
            new_status = MaterialRequestStatus.RECEIVED_PARTIAL.value
        await db.material_requests.update_one(
            {"request_id": data.request_id},
            {"$set": {
                "status": new_status,
                "lorry_image_id": data.lorry_image_id,
                "material_image_id": data.material_image_id,
                "received_at": now_iso,
            }},
        )

    await create_audit_log(user.user_id, "receive_material", "material_receipt", rcpt_dict["receipt_id"], {
        "received_qty": data.received_qty,
        "gps": f"{data.gps_latitude}, {data.gps_longitude}",
    })

    # === Auto-create / update Daily Inventory entry for today ===
    # Carry-forward the previous closing as opening, add the received qty.
    # Idempotent for the same (project, material, day): merges with existing same-day entry.
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        material_name = request.get("material_name", "")
        unit = request.get("unit", "")
        # Find prior latest entry to carry-forward
        prior = await db.material_inventory.find_one(
            {"project_id": request["project_id"], "material_name": material_name, "date": {"$lt": today}},
            sort=[("date", -1), ("created_at", -1)],
            projection={"_id": 0, "closing_stock": 1},
        )
        opening = float((prior or {}).get("closing_stock") or 0)
        existing_today = await db.material_inventory.find_one(
            {"project_id": request["project_id"], "material_name": material_name, "date": today},
            projection={"_id": 0},
        )
        if existing_today:
            new_received = float(existing_today.get("received") or 0) + float(data.received_qty)
            new_used = float(existing_today.get("used") or 0)
            new_opening = float(existing_today.get("opening_stock") or opening)
            new_closing = new_opening + new_received - new_used
            await db.material_inventory.update_one(
                {"inventory_id": existing_today["inventory_id"]},
                {"$set": {
                    "received": new_received,
                    "closing_stock": new_closing,
                    "last_in_at": now_iso,
                    "updated_at": now_iso,
                }},
            )
        else:
            inv_doc = {
                "inventory_id": f"inv_{uuid.uuid4().hex[:8]}",
                "project_id": request["project_id"],
                "material_request_id": data.request_id,
                "material_name": material_name,
                "unit": unit,
                "date": today,
                "opening_stock": opening,
                "received": float(data.received_qty),
                "used": 0.0,
                "closing_stock": opening + float(data.received_qty),
                "last_in_at": now_iso,
                "source": "auto_receipt",
                "created_by": user.user_id,
                "created_at": now_iso,
            }
            await db.material_inventory.insert_one(inv_doc)
    except Exception as e:
        logger.warning(f"Inventory auto-update failed for receipt {rcpt_dict['receipt_id']}: {e}")

    return {"message": "Material receipt recorded", "status": "verified", **rcpt_dict}


class OTPVerifyRequest(BaseModel):
    receipt_id: str
    otp_code: str


@router.post("/site-engineer/material-receipts/verify-otp")
async def verify_material_receipt_otp(
    data: OTPVerifyRequest,
    user: User = Depends(get_current_user)
):
    """Verify OTP and complete material receipt"""
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineers can verify receipts")
    
    receipt = await db.material_receipts.find_one({"receipt_id": data.receipt_id}, {"_id": 0})
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    if receipt["site_engineer_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="You can only verify your own receipts")
    
    if receipt["otp_verified"]:
        raise HTTPException(status_code=400, detail="Receipt already verified")
    
    # Check OTP expiry
    otp_expires = datetime.fromisoformat(receipt["otp_expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > otp_expires:
        raise HTTPException(status_code=400, detail="OTP has expired. Please initiate receipt again.")
    
    # Verify OTP
    if receipt["otp_code"] != data.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Update receipt
    await db.material_receipts.update_one(
        {"receipt_id": data.receipt_id},
        {"$set": {
            "otp_verified": True,
            "verified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update material request status
    request = await db.material_requests.find_one({"request_id": receipt["request_id"]}, {"_id": 0})
    if request:
        total_received = receipt["received_qty"]
        # Check if there are other receipts for this request
        other_receipts = await db.material_receipts.find({
            "request_id": receipt["request_id"],
            "otp_verified": True,
            "receipt_id": {"$ne": data.receipt_id}
        }, {"_id": 0}).to_list(100)
        
        for r in other_receipts:
            total_received += r["received_qty"]

        # NEW PROCUREMENT FLOW: requests with `payment_mode` came from
        # SE → Procurement → Planning → Accountant pipeline. Receipt routing
        # depends on payment_mode rather than just qty completion.
        payment_mode = (request.get("payment_mode") or "").lower()
        is_new_flow = payment_mode in ("pre_paid", "advance", "credit", "post_delivery")
        now_iso = datetime.now(timezone.utc).isoformat()

        if is_new_flow:
            update = {
                "received_at": now_iso,
                "received_by": user.user_id,
                "received_by_name": user.name,
                "received_quantity": total_received,
            }
            if payment_mode == "advance":
                update["status"] = "pending_balance_payment"
                update["next_payment_phase"] = "balance"
            elif payment_mode == "post_delivery":
                update["status"] = "pending_accounts_approval"
                update["next_payment_phase"] = "full"
            elif payment_mode == "credit":
                update["status"] = "delivered"
                update["delivered_at"] = now_iso
                # Create vendor credit ledger entry due in `credit_days`
                try:
                    credit_days = int(request.get("credit_days") or 30)
                except (TypeError, ValueError):
                    credit_days = 30
                due_date = (datetime.now(timezone.utc) + timedelta(days=credit_days)).isoformat()
                ledger_id = f"vc_{uuid.uuid4().hex[:10]}"
                await db.vendor_credit_ledger.insert_one({
                    "ledger_id": ledger_id,
                    "request_id": request["request_id"],
                    "vendor_id": request.get("vendor_id"),
                    "vendor_name": request.get("vendor_name"),
                    "project_id": request.get("project_id"),
                    "material_name": request.get("material_name"),
                    "amount": float(request.get("total_amount") or 0),
                    "credit_days": credit_days,
                    "delivered_at": now_iso,
                    "due_date": due_date,
                    "status": "pending",
                    "created_at": now_iso,
                })
                update["credit_ledger_id"] = ledger_id
                update["credit_due_date"] = due_date
            else:  # pre_paid
                update["status"] = "delivered"
                update["delivered_at"] = now_iso
            await db.material_requests.update_one(
                {"request_id": receipt["request_id"]}, {"$set": update}
            )
        else:
            # Legacy flow: keep existing partial / completed semantics
            if total_received >= request["quantity"]:
                new_status = MaterialRequestStatus.RECEIVED_COMPLETED.value
            else:
                new_status = MaterialRequestStatus.RECEIVED_PARTIAL.value
            await db.material_requests.update_one(
                {"request_id": receipt["request_id"]},
                {"$set": {"status": new_status}}
            )
    
    await create_audit_log(user.user_id, "verify_receipt", "material_receipt", data.receipt_id, {
        "received_qty": receipt["received_qty"],
        "gps": f"{receipt['gps_latitude']}, {receipt['gps_longitude']}"
    })
    
    return {"message": "Material receipt verified successfully", "status": "verified"}


@router.get("/site-engineer/material-receipts")
async def get_material_receipts(
    request_id: Optional[str] = None,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material receipts"""
    query = {}
    
    if user.role == UserRole.SITE_ENGINEER:
        query["site_engineer_id"] = user.user_id
    
    if request_id:
        query["request_id"] = request_id
    
    if project_id:
        query["project_id"] = project_id
    
    receipts = await db.material_receipts.find(query, {"_id": 0, "otp_code": 0}).sort("created_at", -1).to_list(1000)
    return receipts


@router.get("/projects/{project_id}/received-stock")
async def get_received_stock(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get aggregated received materials for stock management view"""
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        assignment = await db.site_engineer_assignments.find_one({
            "user_id": user.user_id, "project_id": project_id, "is_active": True
        }, {"_id": 0})
        if not assignment:
            raise HTTPException(status_code=403, detail="Not assigned to this project")

    stock_map = {}

    # Source 1: Material requests with received_completed status
    received_requests = await db.material_requests.find(
        {"project_id": project_id, "status": {"$in": ["received_completed", "received_partial"]}},
        {"_id": 0}
    ).to_list(500)

    for r in received_requests:
        mat_name = r.get("material_name") or "Unknown"
        key = mat_name
        if key not in stock_map:
            stock_map[key] = {
                "material_name": mat_name,
                "unit": r.get("unit", ""),
                "brand": r.get("brand", ""),
                "total_received": 0,
                "receipts": []
            }
        qty = r.get("received_qty") or r.get("quantity", 0)
        stock_map[key]["total_received"] += qty
        stock_map[key]["receipts"].append({
            "receipt_id": r.get("request_id"),
            "received_qty": qty,
            "receive_date": r.get("delivery_date") or r.get("created_at", "")[:10] if r.get("created_at") else "",
            "receive_time": "",
            "source": "order"
        })

    # Source 2: Verified material receipts (OTP flow)
    receipts = await db.material_receipts.find(
        {"project_id": project_id, "otp_verified": True},
        {"_id": 0, "otp_code": 0}
    ).sort("created_at", -1).to_list(500)

    for r in receipts:
        mat_name = r.get("material_name") or "Unknown"
        key = mat_name
        if key not in stock_map:
            stock_map[key] = {
                "material_name": mat_name,
                "unit": r.get("unit", ""),
                "brand": r.get("brand", ""),
                "total_received": 0,
                "receipts": []
            }
        stock_map[key]["total_received"] += r.get("received_qty", 0)
        stock_map[key]["receipts"].append({
            "receipt_id": r.get("receipt_id"),
            "received_qty": r.get("received_qty"),
            "receive_date": r.get("receive_date"),
            "receive_time": r.get("receive_time"),
            "gps_latitude": r.get("gps_latitude"),
            "gps_longitude": r.get("gps_longitude"),
            "lorry_image_id": r.get("lorry_image_id"),
            "material_image_id": r.get("material_image_id"),
            "created_at": r.get("created_at"),
            "source": "receipt"
        })

    return list(stock_map.values())


# ==================== DAILY PROGRESS REPORTS ====================

class DailyProgressCreate(BaseModel):
    summary: str
    current_stage: Optional[str] = None


@router.post("/projects/{project_id}/daily-progress")
async def create_daily_progress(
    project_id: str,
    data: DailyProgressCreate,
    user: User = Depends(get_current_user)
):
    """Site Engineer logs daily progress for a project"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can log progress")

    assignment = await db.site_engineer_assignments.find_one({
        "user_id": user.user_id, "project_id": project_id, "is_active": True
    }, {"_id": 0})
    if not assignment:
        raise HTTPException(status_code=403, detail="Not assigned to this project")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    day_name = now.strftime("%A")

    entry = {
        "progress_id": f"dp_{uuid.uuid4().hex[:12]}",
        "project_id": project_id,
        "project_name": project["name"] if project else "Unknown",
        "site_engineer_id": user.user_id,
        "site_engineer_name": user.name,
        "date": today,
        "day": day_name,
        "summary": data.summary,
        "current_stage": data.current_stage,
        "created_at": now.isoformat(),
    }

    await db.daily_progress.insert_one(entry)
    entry.pop("_id", None)

    # Update project stage if provided
    if data.current_stage:
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"current_stage": data.current_stage}}
        )

    # Notify PM
    pm_users = await db.users.find({"role": {"$in": ["project_manager", "general_manager"]}}, {"_id": 0}).to_list(20)
    for p in pm_users:
        await create_notification(p["user_id"], f"Daily progress: {project['name'] if project else project_id} - {today}")

    return entry


@router.get("/projects/{project_id}/daily-progress")
async def get_daily_progress(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get daily progress entries for a project"""
    entries = await db.daily_progress.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("date", -1).to_list(100)
    return entries


# Labour types list
@router.get("/site-engineer/labour-types")
async def get_labour_types(user: User = Depends(get_current_user)):
    """Get available labour types"""
    return [
        {"value": "mason", "label": "Mason"},
        {"value": "helper", "label": "Helper"},
        {"value": "carpenter", "label": "Carpenter"},
        {"value": "electrician", "label": "Electrician"},
        {"value": "plumber", "label": "Plumber"},
        {"value": "painter", "label": "Painter"},
        {"value": "welder", "label": "Welder"},
        {"value": "tile_fitter", "label": "Tile Fitter"},
        {"value": "supervisor", "label": "Supervisor"},
        {"value": "other", "label": "Other"}
    ]


# ==================== PETTY CASH MODULE ====================

class PettyCashRequestCreate(BaseModel):
    project_id: Optional[str] = None
    amount: float
    purpose: str
    remarks: Optional[str] = None

class PettyCashExpenseCreate(BaseModel):
    petty_cash_id: str
    amount: float
    expense_type: str  # transport, food, misc, tools, etc
    description: str
    date: str  # YYYY-MM-DD

@router.post("/site-engineer/petty-cash/request")
async def request_petty_cash(data: PettyCashRequestCreate, user: User = Depends(get_current_user)):
    """Site Engineer requests petty cash - global (no project required)"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can request petty cash")
    
    project_name = "General"
    if data.project_id:
        project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
        project_name = project["name"] if project else "Unknown"
    
    petty_cash = {
        "petty_cash_id": f"pc_{secrets.token_hex(6)}",
        "project_id": data.project_id or "",
        "project_name": project_name,
        "requested_by": user.user_id,
        "requested_by_name": user.name,
        "amount_requested": data.amount,
        "amount_issued": 0,
        "amount_spent": 0,
        "amount_returned": 0,
        "purpose": data.purpose,
        "remarks": data.remarks,
        "status": "requested",
        "expenses": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.petty_cash.insert_one(petty_cash)
    petty_cash.pop("_id", None)
    
    # Notify all PMs
    pms = await db.users.find({"role": {"$in": ["project_manager", "associate_pm"]}, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
    for pm in pms:
        await create_notification(pm["user_id"], f"Petty cash request: ₹{data.amount:,.0f} by {user.name}")
    
    return petty_cash


@router.get("/site-engineer/petty-cash")
async def get_my_petty_cash(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get petty cash requests for Site Engineer"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    if user.role in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        query["requested_by"] = user.user_id
    if project_id:
        query["project_id"] = project_id
    
    petty_cash_list = await db.petty_cash.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

    # Enrich each row with `exp_waiting_amount` — the total of SE-recorded
    # expenses currently sitting at PM-approved status (Accountant hasn't
    # finalised) that were funded from this bucket. This lets the Record
    # Expense picker show the *true* remaining balance = issued − spent −
    # exp_waiting, so the SE can't over-allocate a bucket that already has
    # pending expenses queued at the Accountant desk.
    if petty_cash_list:
        pc_ids = [pc["petty_cash_id"] for pc in petty_cash_list]
        agg = await db.recorded_expenses.aggregate([
            {"$match": {"linked_petty_cash_id": {"$in": pc_ids}, "status": "pm_approved"}},
            {"$group": {"_id": "$linked_petty_cash_id", "total": {"$sum": "$amount"}}},
        ]).to_list(2000)
        by_pc = {row["_id"]: float(row["total"] or 0) for row in agg}
        for pc in petty_cash_list:
            pc["exp_waiting_amount"] = by_pc.get(pc["petty_cash_id"], 0.0)
    return petty_cash_list


# Feb 28 2026 — SE can delete their OWN petty cash request when it's
# still pending or PM-rejected. Once accountant has issued the cash the
# entry is locked.
@router.delete("/site-engineer/petty-cash/{petty_cash_id}")
async def delete_my_petty_cash(petty_cash_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")

    if user.role not in [UserRole.SUPER_ADMIN] and pc.get("requested_by") != user.user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own requests")

    locked = ["issued", "partially_spent", "settled", "payment_done", "acknowledged", "accountant_processing"]
    if (pc.get("status") or "").lower() in locked:
        raise HTTPException(status_code=400, detail="This request has already been processed by Accountant and cannot be deleted.")

    await db.petty_cash.delete_one({"petty_cash_id": petty_cash_id})
    return {"message": "Petty cash request deleted"}


# Feb 28 2026 — SE can edit a PM-rejected petty cash request and resubmit.
# Resets status to `requested` and clears the PM-rejection metadata so the
# request re-surfaces in the PM approval queue.
@router.patch("/site-engineer/petty-cash/{petty_cash_id}/resubmit")
async def resubmit_my_petty_cash(petty_cash_id: str, data: dict, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")

    if user.role not in [UserRole.SUPER_ADMIN] and pc.get("requested_by") != user.user_id:
        raise HTTPException(status_code=403, detail="You can only edit your own requests")

    if (pc.get("status") or "").lower() not in ("pm_rejected", "rejected"):
        raise HTTPException(status_code=400, detail="Only PM-rejected requests can be edited & resubmitted")

    set_fields = {
        "amount_requested": float(data.get("amount") or pc.get("amount_requested") or 0),
        "purpose": (data.get("purpose") or pc.get("purpose") or "").strip(),
        "remarks": data.get("remarks") or pc.get("remarks") or "",
        "status": "requested",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "resubmitted_at": datetime.now(timezone.utc).isoformat(),
    }
    unset_fields = {
        "pm_rejected_reason": "", "pm_rejected_by": "", "pm_rejected_at": "",
        "rejection_reason": "", "rejected_by": "", "rejected_at": "",
    }
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": set_fields, "$unset": unset_fields}
    )
    return {"message": "Petty cash request resubmitted for PM approval"}


@router.post("/site-engineer/petty-cash/{petty_cash_id}/expense")
async def add_petty_cash_expense(petty_cash_id: str, data: PettyCashExpenseCreate, user: User = Depends(get_current_user)):
    """Site Engineer records petty cash expense"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can record petty cash expenses")
    
    petty_cash = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not petty_cash:
        raise HTTPException(status_code=404, detail="Petty cash request not found")
    
    if petty_cash["requested_by"] != user.user_id:
        raise HTTPException(status_code=403, detail="You can only add expenses to your own petty cash")
    
    if petty_cash["status"] not in ["issued", "partially_spent"]:
        raise HTTPException(status_code=400, detail="Petty cash must be issued before recording expenses")
    
    expense = {
        "expense_id": f"pce_{secrets.token_hex(6)}",
        "amount": data.amount,
        "expense_type": data.expense_type,
        "description": data.description,
        "date": data.date,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "recorded_by": user.user_id
    }
    
    new_spent = petty_cash["amount_spent"] + data.amount
    new_status = "partially_spent" if new_spent < petty_cash["amount_issued"] else "partially_spent"
    
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {
            "$push": {"expenses": expense},
            "$set": {"amount_spent": new_spent, "status": new_status}
        }
    )
    
    return {"message": "Expense recorded", "expense_id": expense["expense_id"], "total_spent": new_spent}


@router.post("/site-engineer/petty-cash/{petty_cash_id}/submit")
async def submit_petty_cash_for_settlement(petty_cash_id: str, user: User = Depends(get_current_user)):
    """Site Engineer submits petty cash for accountant settlement"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can submit petty cash")
    
    petty_cash = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not petty_cash:
        raise HTTPException(status_code=404, detail="Petty cash not found")
    
    if petty_cash["requested_by"] != user.user_id:
        raise HTTPException(status_code=403, detail="You can only submit your own petty cash")
    
    amount_returned = petty_cash["amount_issued"] - petty_cash["amount_spent"]
    
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "pending_settlement",
            "amount_returned": amount_returned,
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify accountant
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(acc["user_id"], f"Petty cash settlement: {petty_cash['project_name']} - ₹{petty_cash['amount_spent']} spent")
    
    return {"message": "Petty cash submitted for settlement", "amount_spent": petty_cash["amount_spent"], "amount_to_return": amount_returned}


@router.get("/accountant/petty-cash")
async def get_petty_cash_for_accountant(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Accountant gets petty cash requests (only PM-approved and beyond)"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can access this")
    
    query = {}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": ["pm_approved", "awaiting_accountant", "accountant_processing", "payment_done", "acknowledged", "issued", "partially_spent", "pending_settlement", "settled", "requested"]}
    
    petty_cash_list = await db.petty_cash.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return petty_cash_list


class PettyCashIssueInput(BaseModel):
    amount: float
    remarks: Optional[str] = None
    payment_mode: Optional[str] = "cash"          # cash | hdfc_current | hdfc_savings | cheque | direct_transfer | suspense
    reference_number: Optional[str] = None         # txn / UTR / cheque#
    bank_name: Optional[str] = None                # for cheque or transfer
    cheque_date: Optional[str] = None              # ISO date
    payment_date: Optional[str] = None             # ISO date (defaults to now if absent)



@router.patch("/accountant/petty-cash/{petty_cash_id}/issue")
async def issue_petty_cash(petty_cash_id: str, data: PettyCashIssueInput, user: User = Depends(get_current_user)):
    """Accountant issues/releases petty cash to site engineer"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can issue petty cash")

    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")

    now = datetime.now(timezone.utc).isoformat()
    payment_mode = (data.payment_mode or "cash").lower()
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "amount_issued": data.amount,
            "status": "issued",
            "issued_by": user.user_id,
            "issued_by_name": user.name,
            "issued_at": now,
            "issue_remarks": data.remarks,
            "payment_mode": payment_mode,
            "reference_number": data.reference_number,
            "bank_name": data.bank_name,
            "cheque_date": data.cheque_date,
            "payment_date": data.payment_date or now,
        }}
    )

    # Record as expense in recorded_expenses for the accountant's cashbook
    await db.recorded_expenses.insert_one({
        "expense_id": f"exp_{secrets.token_hex(6)}",
        "project_id": pc.get("project_id"),
        "project_name": pc.get("project_name", ""),
        "category": "petty_cash",
        "description": f"Petty cash issued to {pc.get('requested_by_name')} - {pc.get('purpose', '')}",
        "amount": data.amount,
        "payment_method": payment_mode,
        "payment_mode": payment_mode,
        "reference_number": data.reference_number,
        "bank_name": data.bank_name,
        "vendor_name": pc.get("requested_by_name"),
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "source": "approval",
        "petty_cash_id": petty_cash_id,
        "created_at": now,
    })

    # Cashflow Engine allocation — petty cash drains the direct pool. Keyed on
    # petty_cash_id so the correction-engine reverse_allocation() can roll it
    # back cleanly if the accountant later sends this row for correction.
    try:
        from routes.cashflow import allocate_expense
        await allocate_expense(
            expense_id=petty_cash_id,
            project_id=pc.get("project_id"),
            amount=float(data.amount),
            category="petty_cash",
            project_name=pc.get("project_name", ""),
            source="petty_cash",
        )
    except Exception as e:
        logger.warning(f"cashflow allocate_expense failed for petty_cash {petty_cash_id}: {e}")

    # Notify site engineer
    await create_notification(pc["requested_by"], f"Petty cash issued: ₹{data.amount:,.0f}")

    return {
        "message": f"₹{data.amount:,.0f} issued to {pc.get('requested_by_name')}",
        "petty_cash_id": petty_cash_id,
        "amount_issued": data.amount,
    }


@router.patch("/accountant/petty-cash/{petty_cash_id}/settle")
async def settle_petty_cash(petty_cash_id: str, user: User = Depends(get_current_user)):
    """Accountant settles petty cash and moves to master expense"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can settle petty cash")
    
    petty_cash = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not petty_cash:
        raise HTTPException(status_code=404, detail="Petty cash not found")
    
    if petty_cash["status"] != "pending_settlement":
        raise HTTPException(status_code=400, detail="Petty cash is not pending settlement")
    
    now = datetime.now(timezone.utc)
    
    # Create master expense entries for each petty cash expense
    for expense in petty_cash.get("expenses", []):
        master_expense = {
            "expense_id": f"exp_{secrets.token_hex(6)}",
            "project_id": petty_cash["project_id"],
            "expense_type": "petty_cash",
            "sub_type": expense["expense_type"],
            "description": expense["description"],
            "amount": expense["amount"],
            "expense_date": expense["date"],
            "source_type": "petty_cash",
            "source_id": petty_cash_id,
            "recorded_by": petty_cash["requested_by"],
            "verified_by": user.user_id,
            "status": "approved",
            "created_at": now.isoformat()
        }
        await db.expenses.insert_one(master_expense)
    
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "settled",
            "settled_by": user.user_id,
            "settled_at": now.isoformat()
        }}
    )
    
    # Notify site engineer
    await create_notification(petty_cash["requested_by"], f"Petty cash settled: {petty_cash['project_name']}")
    
    return {"message": "Petty cash settled and added to master expenses", "expenses_count": len(petty_cash.get("expenses", []))}


@router.patch("/accountant/petty-cash/{petty_cash_id}/reject")
async def reject_petty_cash(petty_cash_id: str, payload: Dict[str, Any] = None, reason: str = "", user: User = Depends(get_current_user)):
    """Accountant rejects petty cash request.

    Routes through the shared correction engine so the row gets a uniform
    `accountant_rejected` status, structured `correction_history`, and a
    notification to the original requester. The legacy `?reason=` query param
    is preserved for back-compat with older callers; the new flow prefers a
    JSON body {"reason": "..."}.
    """
    body_reason = (payload or {}).get("reason") if isinstance(payload, dict) else None
    final_reason = body_reason or reason or ""
    return await apply_rejection("petty_cash", petty_cash_id, final_reason, user)


class PettyCashResubmitInput(BaseModel):
    amount_requested: Optional[float] = None
    purpose: Optional[str] = None
    remarks: Optional[str] = None
    project_id: Optional[str] = None


@router.post("/petty-cash/{petty_cash_id}/resubmit")
async def resubmit_petty_cash(petty_cash_id: str, data: PettyCashResubmitInput, user: User = Depends(get_current_user)):
    """Original requester (SE / PM / Asst PM / Super Admin) edits and resubmits
    a rejected or under-correction petty cash request. Status flips back to
    `awaiting_accountant` and the accountant gets notified.
    """
    return await apply_resubmit(
        "petty_cash",
        petty_cash_id,
        data.dict(exclude_unset=True, exclude_none=True),
        user,
    )


class PettyCashCorrectionInput(BaseModel):
    reason: str


@router.post("/accountant/petty-cash/{petty_cash_id}/send-for-correction")
async def send_petty_cash_for_correction(petty_cash_id: str, data: PettyCashCorrectionInput, user: User = Depends(get_current_user)):
    """Accountant pulls back an Approved/Issued petty cash row for correction.

    Reverses any cashflow_ledger entries tied to this petty_cash_id so the
    amount disappears from Cashbook / Cashflow Engine totals immediately,
    then notifies the original requester to edit + resubmit.
    """
    result = await apply_send_for_correction("petty_cash", petty_cash_id, data.reason, user)
    # Also hide the linked recorded_expenses row from the cashbook by flipping
    # its status to `under_correction`. Keyed on petty_cash_id (set when the
    # expense was inserted during /issue).
    await db.recorded_expenses.update_many(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "under_correction",
            "correction_reason": data.reason,
            "correction_requested_by_name": user.name,
            "correction_requested_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return result



# ============ PETTY CASH - PM APPROVAL ============

@router.get("/pm/petty-cash-requests")
async def get_petty_cash_for_pm(user: User = Depends(get_current_user)):
    """PM gets pending petty cash requests for approval.

    Routing — team-based. A PM sees a petty-cash request if it satisfies ANY of:
      • It has a `project_id` belonging to one of their assigned projects, OR
      • Its `requested_by` user is on the SE roster of one of their assigned
        projects (catches "General" / unscoped requests raised by their SE), OR
      • The PM has no team mapping yet (fallback: see everything so new PMs
        aren't stuck looking at an empty queue).
    Super Admins always see everything.
    """
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can access this")
    query: Dict[str, Any] = {"status": {"$in": ["requested", "pm_approved", "accountant_processing", "payment_done", "acknowledged"]}}
    if user.role in (UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM):
        team_projects = await db.projects.find(
            {"$or": [
                {"team.project_manager": user.user_id},
                {"team.associate_pm": user.user_id},
                {"assigned_pm": user.user_id},
            ]},
            {"_id": 0, "project_id": 1, "team": 1}
        ).to_list(None)
        project_ids = [p["project_id"] for p in team_projects if p.get("project_id")]
        team_se_ids = set()
        for p in team_projects:
            t = p.get("team") or {}
            for k in ("site_engineer", "sr_site_engineer", "associate_pm"):
                v = t.get(k)
                if v:
                    team_se_ids.add(v)
        if project_ids or team_se_ids:
            or_clause: List[Dict[str, Any]] = []
            if project_ids:
                or_clause.append({"project_id": {"$in": project_ids}})
            if team_se_ids:
                or_clause.append({"requested_by": {"$in": list(team_se_ids)}})
            query["$or"] = or_clause
        # else: no team mapping → leave query unrestricted (fallback)
    requests = await db.petty_cash.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return requests


@router.patch("/pm/petty-cash/{petty_cash_id}/approve")
async def pm_approve_petty_cash(petty_cash_id: str, request: Request, user: User = Depends(get_current_user)):
    """PM approves petty cash - moves to accountant"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can approve")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    if pc["status"] != "requested":
        raise HTTPException(status_code=400, detail=f"Cannot approve - current status is {pc['status']}")
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass
    now = datetime.now(timezone.utc).isoformat()
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "pm_approved",
            "pm_approved_by": user.user_id,
            "pm_approved_by_name": user.name,
            "pm_approved_at": now,
            "pm_remarks": data.get("remarks", ""),
        }}
    )
    # Notify accountants
    accountants = await db.users.find({"role": "accountant", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(acc["user_id"], f"Petty cash approved by PM: ₹{pc['amount_requested']:,.0f} for {pc.get('project_name', '')}")
    await create_notification(pc["requested_by"], f"Petty cash approved by PM {user.name}")
    return {"message": "Approved", "status": "pm_approved"}


@router.patch("/pm/petty-cash/{petty_cash_id}/reject")
async def pm_reject_petty_cash(petty_cash_id: str, request: Request, user: User = Depends(get_current_user)):
    """PM rejects petty cash request"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can reject")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {"status": "pm_rejected", "pm_rejected_by": user.user_id, "pm_rejected_reason": data.get("reason", ""), "pm_rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_notification(pc["requested_by"], f"Petty cash rejected by PM: {data.get('reason', 'No reason')}")
    return {"message": "Rejected"}


# ============ PETTY CASH - PLANNING APPROVAL (mirror of PM) ============

@router.get("/planning/petty-cash-requests")
async def get_petty_cash_for_planning(user: User = Depends(get_current_user)):
    """Planning gets pending petty cash requests for approval (parallel to PM flow)."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    requests = await db.petty_cash.find(
        {"status": {"$in": ["requested", "planning_approved", "pm_approved", "accountant_processing", "payment_done", "acknowledged"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    # Enrich with project name
    project_cache = {}
    for r in requests:
        pid = r.get("project_id")
        if pid and pid not in project_cache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            project_cache[pid] = p["name"] if p else "Unknown"
        r["project_name"] = project_cache.get(pid, r.get("project_name") or "Unknown")
    return requests


@router.patch("/planning/petty-cash/{petty_cash_id}/approve")
async def planning_approve_petty_cash(petty_cash_id: str, request: Request, user: User = Depends(get_current_user)):
    """Planning approves petty cash - moves to accountant for processing."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can approve")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    if pc.get("status") not in ("requested", "pm_approved"):
        raise HTTPException(status_code=400, detail=f"Cannot approve - current status is {pc.get('status')}")
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass
    now = datetime.now(timezone.utc).isoformat()
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "planning_approved",
            "planning_approved_by": user.user_id,
            "planning_approved_by_name": user.name,
            "planning_approved_at": now,
            "planning_remarks": data.get("remarks", ""),
        }}
    )
    accountants = await db.users.find({"role": "accountant", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(acc["user_id"], f"Petty cash approved by Planning: ₹{pc.get('amount_requested', 0):,.0f} for {pc.get('project_name', '')}")
    await create_notification(pc["requested_by"], f"Petty cash approved by Planning ({user.name})")
    return {"message": "Approved", "status": "planning_approved"}


@router.patch("/planning/petty-cash/{petty_cash_id}/reject")
async def planning_reject_petty_cash(petty_cash_id: str, request: Request, user: User = Depends(get_current_user)):
    """Planning rejects petty cash request with remarks."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can reject")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass
    reason = data.get("reason") or data.get("remarks") or "Rejected by Planning"
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "planning_rejected",
            "planning_rejected_by": user.user_id,
            "planning_rejected_by_name": user.name,
            "planning_rejected_reason": reason,
            "planning_rejected_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    await create_notification(pc["requested_by"], f"Petty cash rejected by Planning: {reason}")
    return {"message": "Rejected"}




# ============ PETTY CASH - ACCOUNTANT PAYMENT PROCESSING ============

@router.patch("/accountant/petty-cash/{petty_cash_id}/process-payment")
async def accountant_process_payment(petty_cash_id: str, request: Request, user: User = Depends(get_current_user)):
    """Accountant processes payment with full details"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can process payment")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    if pc["status"] != "pm_approved":
        raise HTTPException(status_code=400, detail=f"Cannot process - current status is {pc['status']}")
    data = await request.json()
    now = datetime.now(timezone.utc).isoformat()
    payment_details = {
        "payment_mode": data.get("payment_mode", "cash"),
        "bank_name": data.get("bank_name", ""),
        "cheque_number": data.get("cheque_number", ""),
        "reference_number": data.get("reference_number", ""),
        "payment_date": data.get("payment_date", now[:10]),
        "amount_paid": data.get("amount_paid", pc["amount_requested"]),
        "remarks": data.get("remarks", ""),
    }
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {
            "status": "payment_done",
            "amount_issued": payment_details["amount_paid"],
            "payment_details": payment_details,
            "payment_processed_by": user.user_id,
            "payment_processed_by_name": user.name,
            "payment_processed_at": now,
        }}
    )
    
    # Record as an expense in recorded_expenses so it shows up in the
    # Accountant Cashbook (Direct Expense list + Expense Breakdown - Petty Cash tile).
    # Idempotent: skip if we already inserted one for this petty_cash_id.
    existing_exp = await db.recorded_expenses.find_one({"petty_cash_id": petty_cash_id, "category": "petty_cash"}, {"_id": 0, "expense_id": 1})
    if not existing_exp:
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{secrets.token_hex(6)}",
            "project_id": pc.get("project_id") or "",
            "project_name": pc.get("project_name", ""),
            "category": "petty_cash",
            "description": f"Petty cash issued to {pc.get('requested_by_name')} - {pc.get('purpose', '')}",
            "amount": payment_details["amount_paid"],
            "payment_method": payment_details.get("payment_mode", "cash"),
            "payment_mode": payment_details.get("payment_mode", "cash"),
            "bank_name": payment_details.get("bank_name", ""),
            "cheque_number": payment_details.get("cheque_number", ""),
            "reference_number": payment_details.get("reference_number", ""),
            "vendor_name": pc.get("requested_by_name"),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "source": "approval",
            "petty_cash_id": petty_cash_id,
            "created_at": now,
        })
    
    await create_notification(pc["requested_by"], f"Petty cash payment processed: ₹{payment_details['amount_paid']:,.0f} via {payment_details['payment_mode']}")
    return {"message": "Payment processed", "status": "payment_done", "payment_details": payment_details}


# ============ PETTY CASH - SE ACKNOWLEDGE ============

@router.patch("/site-engineer/petty-cash/{petty_cash_id}/acknowledge")
async def se_acknowledge_petty_cash(petty_cash_id: str, user: User = Depends(get_current_user)):
    """SE acknowledges receipt of petty cash"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only SE can acknowledge")
    pc = await db.petty_cash.find_one({"petty_cash_id": petty_cash_id})
    if not pc:
        raise HTTPException(status_code=404, detail="Not found")
    if pc["status"] != "payment_done":
        raise HTTPException(status_code=400, detail=f"Cannot acknowledge - status is {pc['status']}")
    now = datetime.now(timezone.utc).isoformat()
    await db.petty_cash.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {"status": "acknowledged", "acknowledged_at": now, "acknowledged_by": user.user_id}}
    )
    return {"message": "Acknowledged", "status": "acknowledged"}


# ============ PETTY CASH - SUMMARY & HISTORY ============

@router.get("/site-engineer/petty-cash/summary")
async def get_petty_cash_summary(user: User = Depends(get_current_user)):
    """Get petty cash summary for SE dashboard"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {"requested_by": user.user_id} if user.role not in [UserRole.SUPER_ADMIN] else {}
    all_pc = await db.petty_cash.find(query, {"_id": 0}).to_list(500)
    direct_expenses = await db.direct_expenses.find({"recorded_by": user.user_id} if user.role not in [UserRole.SUPER_ADMIN] else {}, {"_id": 0}).to_list(500)

    # Feb 28 2026 — Cash in Hand = total ever issued across active buckets
    # (not net of spent). The frontend computes BALANCE = Cash in Hand -
    # Expenses, so subtracting spent here caused Balance to always end up
    # near 0 (double-subtraction). Expenses is the source-of-truth spent
    # figure derived from petty_cash.amount_spent, which mirrors every
    # bucketed direct_expense the SE has submitted.
    active_pc = [pc for pc in all_pc if pc.get("status") in ["acknowledged", "issued", "partially_spent", "settled", "payment_done"]]
    total_cash_in_hand = sum(pc.get("amount_issued", 0) or 0 for pc in active_pc)
    total_expenses = sum(pc.get("amount_spent", 0) or 0 for pc in active_pc)
    pending_requests = len([pc for pc in all_pc if pc.get("status") in ["requested"]])
    waiting_approval = len([pc for pc in all_pc if pc.get("status") in ["pm_approved", "accountant_processing"]])

    # Mar 04 2026 — Count + sum of recorded expenses (SE's individual expense
    # entries) currently sitting with the Accountant. `pm_approved` = SE
    # submitted + PM approved, Accountant hasn't finalised. Drives the new
    # "Exp Waiting A/C" tile on the SE dashboard.
    exp_query = {"status": "pm_approved"}
    if user.role not in [UserRole.SUPER_ADMIN]:
        exp_query["recorded_by"] = user.user_id
    exp_agg = await db.recorded_expenses.aggregate([
        {"$match": exp_query},
        {"$group": {"_id": None, "count": {"$sum": 1}, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    expense_waiting_accountant = exp_agg[0]["count"] if exp_agg else 0
    expense_waiting_accountant_amount = float(exp_agg[0]["total"]) if exp_agg else 0.0

    # Jul 08 2026 — Also count expenses stuck at "Awaiting PM" (status='recorded'
    # or empty). These roll into the Pending Req tile so it reflects both
    # streams (petty-cash + recorded expenses) awaiting PM approval.
    exp_pm_query = {"status": {"$in": ["recorded", ""]}}
    if user.role not in [UserRole.SUPER_ADMIN]:
        exp_pm_query["recorded_by"] = user.user_id
    exp_pm_agg = await db.recorded_expenses.aggregate([
        {"$match": exp_pm_query},
        {"$group": {"_id": None, "count": {"$sum": 1}}},
    ]).to_list(1)
    expense_waiting_pm = exp_pm_agg[0]["count"] if exp_pm_agg else 0

    return {
        "total_cash_in_hand": total_cash_in_hand,
        "total_expenses": total_expenses,
        "pending_requests": pending_requests,
        "waiting_approval": waiting_approval,
        "expense_waiting_pm": expense_waiting_pm,
        "expense_waiting_accountant": expense_waiting_accountant,
        "expense_waiting_accountant_amount": expense_waiting_accountant_amount,
    }


# ============ EXPENSE CATEGORIES ============

DEFAULT_EXPENSE_CATEGORIES = ["Electrical", "Plumbing", "Painting", "Civil", "Wooden", "Miscellaneous"]

@router.get("/expense-categories")
async def get_expense_categories(user: User = Depends(get_current_user)):
    """Get all expense categories (defaults + custom)"""
    custom = await db.expense_categories.find({"is_active": True}, {"_id": 0}).to_list(100)
    custom_names = [c["name"] for c in custom]
    all_cats = DEFAULT_EXPENSE_CATEGORIES + [n for n in custom_names if n not in DEFAULT_EXPENSE_CATEGORIES]
    return all_cats


@router.post("/expense-categories")
async def create_expense_category(request: Request, user: User = Depends(get_current_user)):
    """Create a custom expense category"""
    data = await request.json()
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    existing = await db.expense_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {"category_id": f"cat_{secrets.token_hex(4)}", "name": name, "is_active": True, "created_by": user.user_id, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.expense_categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


# ============ DIRECT EXPENSE RECORDING (NO APPROVAL) ============

@router.post("/site-engineer/direct-expense")
async def record_direct_expense(request: Request, user: User = Depends(get_current_user)):
    """Record a direct expense with multiple line items - no approval needed"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    data = await request.json()
    project_id = data.get("project_id")
    items = data.get("items", [])
    # Feb 28 2026 — Splits: SE can charge the expense across multiple
    # already-issued petty cash buckets. Each split has {petty_cash_id, amount}.
    splits_in = data.get("linked_petty_cash_splits") or []
    # Backwards-compat: accept the older single-id form.
    if not splits_in and data.get("linked_petty_cash_id"):
        splits_in = [{"petty_cash_id": data.get("linked_petty_cash_id"), "amount": None}]
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    if not items:
        raise HTTPException(status_code=400, detail="At least one expense item is required")

    total = sum(float(item.get("amount", 0)) for item in items)

    # Resolve & validate splits against the SE's petty_cash entries.
    resolved_splits = []
    if splits_in:
        for s in splits_in:
            pc_id = (s.get("petty_cash_id") or "").strip()
            if not pc_id:
                continue
            pc = await db.petty_cash.find_one({"petty_cash_id": pc_id}, {"_id": 0})
            if not pc:
                raise HTTPException(status_code=404, detail=f"Petty cash {pc_id} not found")
            if (pc.get("requested_by") != user.user_id) and user.role != UserRole.SUPER_ADMIN:
                raise HTTPException(status_code=403, detail="You can only spend from petty cash issued to you")
            # Mar 04 2026 — Since `amount_spent` is now only incremented at
            # Accountant-approval time, we must ALSO deduct pending mirrors
            # (status ∈ recorded / pm_approved) to compute the true remaining
            # bucket balance. Without this the SE could record ₹5,000 twice
            # against a ₹5,000 bucket because both mirrors sit at "recorded"
            # and neither has bumped `amount_spent` yet.
            pending_cursor = db.recorded_expenses.aggregate([
                {"$match": {"linked_petty_cash_id": pc_id, "status": {"$in": ["recorded", "pm_approved"]}}},
                {"$group": {"_id": None, "t": {"$sum": "$amount"}}},
            ])
            pending_docs = await pending_cursor.to_list(1)
            pending_total = float(pending_docs[0]["t"]) if pending_docs else 0.0
            balance = (pc.get("amount_issued") or 0) - (pc.get("amount_spent") or 0) - pending_total
            amt = float(s.get("amount") or 0) if s.get("amount") is not None else total
            if amt <= 0:
                raise HTTPException(status_code=400, detail=f"Split amount for {pc.get('purpose') or 'petty cash'} must be > 0")
            if amt > balance + 0.5:
                raise HTTPException(status_code=400, detail=f"'{pc.get('purpose') or 'Petty cash'}' has only ₹{balance:,.0f} available (₹{pending_total:,.0f} already awaiting Accountant approval)")
            resolved_splits.append({
                "petty_cash_id": pc_id,
                "amount": amt,
                "mode": pc.get("payment_mode") or pc.get("mode") or "cash",
                "purpose": pc.get("purpose") or "Petty Cash",
            })
        split_sum = sum(s["amount"] for s in resolved_splits)
        if abs(split_sum - total) > 0.5:
            raise HTTPException(status_code=400, detail=f"Split total ₹{split_sum:,.0f} ≠ expense total ₹{total:,.0f}")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
    now = datetime.now(timezone.utc).isoformat()
    expense_id = f"dexp_{secrets.token_hex(6)}"

    record = {
        "expense_id": expense_id,
        "project_id": project_id,
        "project_name": project.get("name", "") if project else "",
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "linked_petty_cash_splits": [{"petty_cash_id": s["petty_cash_id"], "amount": s["amount"], "mode": s["mode"]} for s in resolved_splits],
        "items": [{
            "item_id": f"di_{secrets.token_hex(4)}",
            "category": item.get("category", "Miscellaneous"),
            "expense_name": item.get("expense_name", ""),
            "amount": float(item.get("amount", 0)),
            "bill_file_id": item.get("bill_file_id"),
            "bill_filename": item.get("bill_filename"),
        } for item in items],
        "total_amount": total,
        "created_at": now,
    }
    await db.direct_expenses.insert_one(record)
    record.pop("_id", None)

    # Mirror to recorded_expenses. When the expense is split across
    # multiple petty_cash buckets we create one mirror per bucket so the
    # Cashbook → Expense → Petty Cash list shows each leg with its own
    # payment_mode (HDFC SAVINGS, HDFC CURRENT, …).
    #
    # Per-item bills uploaded by the SE are collected into `item_bills[]` on
    # every mirror row so the PM / Accountant views can render one View-Bill
    # link per uploaded document.
    item_bills = [
        {
            "label": (i.get("expense_name") or i.get("category") or "Bill"),
            "bill_file_id": i.get("bill_file_id"),
            "bill_filename": i.get("bill_filename"),
        }
        for i in record["items"]
        if i.get("bill_file_id")
    ]
    first_bill_file_id = item_bills[0]["bill_file_id"] if item_bills else None
    first_bill_filename = item_bills[0]["bill_filename"] if item_bills else None
    if resolved_splits:
        for s in resolved_splits:
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{secrets.token_hex(6)}",
                "project_id": project_id,
                "project_name": record["project_name"],
                "category": "petty_cash",
                "description": f"{', '.join([i.get('expense_name') or i.get('category', 'Direct') for i in record['items']])} — from {s['purpose']}",
                "amount": s["amount"],
                "payment_method": s["mode"],
                "payment_mode": s["mode"],
                "linked_petty_cash_id": s["petty_cash_id"],
                "vendor_name": (record["items"][0] or {}).get("category", ""),
                "recorded_by": user.user_id,
                "recorded_by_name": user.name,
                "status": "recorded",
                "source": "site_engineer_direct",
                "direct_expense_id": expense_id,
                "bill_file_id": first_bill_file_id,
                "bill_filename": first_bill_filename,
                "item_bills": item_bills,
                "created_at": now,
            })
            # Jul 03 2026 — amount_spent is NO LONGER incremented here. It now
            # moves only when the Accountant approves each recorded_expense
            # mirror (see `accountant_approve_recorded_expense`). Before A/C
            # approval the SE-recorded expense sits in a "reserved" state — the
            # bucket balance stays untouched so PM/A/C decisions can reject
            # without any rollback logic. `updated_at` still bumps for sorting.
            await db.petty_cash.update_one(
                {"petty_cash_id": s["petty_cash_id"]},
                {"$set": {"updated_at": now}}
            )
    else:
        # Legacy fallback — no PC link (shouldn't happen with mandatory pick).
        for raw_item in record["items"]:
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{secrets.token_hex(6)}",
                "project_id": project_id,
                "project_name": record["project_name"],
                "category": "petty_cash",
                "description": raw_item.get("expense_name") or raw_item.get("category", "Direct Expense"),
                "amount": raw_item["amount"],
                "payment_method": "cash",
                "payment_mode": "cash",
                "bill_file_id": raw_item.get("bill_file_id"),
                "bill_filename": raw_item.get("bill_filename"),
                "vendor_name": raw_item.get("category", ""),
                "recorded_by": user.user_id,
                "recorded_by_name": user.name,
                "status": "recorded",
                "source": "site_engineer_direct",
                "direct_expense_id": expense_id,
                "direct_expense_item_id": raw_item["item_id"],
                "created_at": now,
            })
    
    # Jul 03 2026 — amount_spent is no longer bumped at SE-submission time.
    # The Accountant approve endpoint owns that increment (per-mirror). We
    # still touch `updated_at` on affected buckets for sorting; status stays
    # unchanged until real spend flows in via A/C approval.
    if not resolved_splits:
        open_pc = await db.petty_cash.find_one(
            {"requested_by": user.user_id, "status": {"$in": ["payment_done", "acknowledged", "issued", "partially_spent"]}},
            sort=[("created_at", -1)],
            projection={"_id": 0, "petty_cash_id": 1},
        )
        if open_pc:
            await db.petty_cash.update_one(
                {"petty_cash_id": open_pc["petty_cash_id"]},
                {"$set": {"updated_at": now}},
            )
    return record


# Feb 28 2026 — SE can delete their OWN direct-expense records when they
# are still pending or have been rejected by PM/Accountant. Approved or
# already-recorded entries are read-only (the ledger has consumed them).
@router.delete("/site-engineer/direct-expense/{expense_id}")
async def delete_direct_expense(expense_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Feb 28 2026 — Expense cards in SE Dashboard pass either the
    # `direct_expenses.expense_id` (dexp_…) OR a mirror's
    # `recorded_expenses.expense_id` (exp_…). Probe both so delete works
    # from any surface.
    de = await db.direct_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    rec = None
    if not de:
        rec = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
        if rec and rec.get("direct_expense_id"):
            de = await db.direct_expenses.find_one({"expense_id": rec["direct_expense_id"]}, {"_id": 0})
    if not de and not rec:
        raise HTTPException(status_code=404, detail="Expense record not found")

    owner_id = (de or rec or {}).get("recorded_by")
    if user.role not in [UserRole.SUPER_ADMIN] and owner_id and owner_id != user.user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own expense records")

    locked = ["approved", "verified", "recorded_into_cashbook", "accountant_approved"]
    status_to_check = (rec.get("status") if rec else "") or ""
    if status_to_check.lower() in locked:
        raise HTTPException(status_code=400, detail="Approved expenses cannot be deleted. Contact your accountant to reverse the entry.")

    # Mar 04 2026 — Refund `amount_spent` per-split ONLY when that specific
    # mirror was already accountant-approved (spent counter had been bumped
    # at approval time). For `recorded` / `pm_approved` mirrors the bucket
    # balance was never touched, so we must NOT decrement — doing so pushes
    # `amount_spent` negative and inflates the visible balance (Feb 2026 bug).
    if de:
        # If ANY mirror for this direct expense is in a locked (approved) state,
        # block the delete outright. The ledger has consumed it.
        approved_mirror = await db.recorded_expenses.find_one(
            {"direct_expense_id": de["expense_id"], "status": {"$in": locked}},
            {"_id": 0, "expense_id": 1}
        )
        if approved_mirror:
            raise HTTPException(status_code=400, detail="One or more splits of this expense are already approved by the Accountant. Ask them to reverse the entry first.")

        # No mirror is approved → bucket `amount_spent` was never incremented,
        # so we simply wipe mirrors and the direct expense with no refund.
        await db.recorded_expenses.delete_many({"direct_expense_id": de["expense_id"]})
        await db.direct_expenses.delete_one({"expense_id": de["expense_id"]})
    elif rec:
        # Single-mirror delete path (status already validated above as unlocked).
        await db.recorded_expenses.delete_one({"expense_id": rec["expense_id"]})

    return {"message": "Expense record deleted"}


@router.get("/site-engineer/direct-expenses")
async def get_direct_expenses(project_id: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get direct expense history for SE"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {"recorded_by": user.user_id} if user.role not in [UserRole.SUPER_ADMIN] else {}
    if project_id and project_id != "all":
        query["project_id"] = project_id
    if date_from:
        query["created_at"] = {"$gte": date_from}
    if date_to:
        query.setdefault("created_at", {})
        if isinstance(query["created_at"], dict):
            query["created_at"]["$lte"] = date_to + "T23:59:59"
        else:
            query["created_at"] = {"$gte": query["created_at"], "$lte": date_to + "T23:59:59"}
    records = await db.direct_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    # Enrich with approval status from the linked `recorded_expenses` rows.
    # Each `direct_expense` mirrors one row per item; we attach the per-item
    # status and a single "stage" badge per card (derived from the worst
    # status across items).
    if records:
        dexp_ids = [r["expense_id"] for r in records if r.get("expense_id")]
        rec_rows = await db.recorded_expenses.find(
            {"direct_expense_id": {"$in": dexp_ids}, "source": {"$in": ["site_engineer_direct", "site_engineer", "se_direct"]}},
            {"_id": 0, "expense_id": 1, "direct_expense_id": 1, "direct_expense_item_id": 1, "status": 1, "rejection_reason": 1, "pm_approved_by_name": 1, "accountant_approved_by_name": 1}
        ).to_list(2000)
        # Index per (direct_expense_id -> [recorded_expense rows])
        by_parent: Dict[str, List[Dict[str, Any]]] = {}
        for rr in rec_rows:
            by_parent.setdefault(rr["direct_expense_id"], []).append(rr)

        # Stage priority — lowest = most-needs-attention bubbles up to the card label
        STAGE_PRIORITY = {
            "accountant_rejected": 0,
            "pm_rejected": 1,
            "rejected": 1,
            "recorded": 2,
            "": 2,
            "pm_approved": 3,
            "approved": 4,
            "verified": 4,
            "recorded_into_cashbook": 4,
        }
        STAGE_LABEL = {
            "recorded": "Awaiting PM",
            "": "Awaiting PM",
            "pm_approved": "Awaiting Accountant",
            "approved": "Approved",
            "verified": "Approved",
            "recorded_into_cashbook": "Approved",
            "pm_rejected": "Rejected by PM",
            "rejected": "Rejected",
            "accountant_rejected": "Rejected by Accountant",
        }
        for r in records:
            kids = by_parent.get(r["expense_id"], [])
            # Attach per-item status by matching item_id (zip by index as fallback)
            item_status_by_id: Dict[str, Dict[str, Any]] = {}
            for k in kids:
                key = k.get("direct_expense_item_id")
                if key:
                    item_status_by_id[key] = k
            items = r.get("items") or []
            statuses: List[str] = []
            for idx, it in enumerate(items):
                k = item_status_by_id.get(it.get("item_id")) or (kids[idx] if idx < len(kids) else None)
                s = ((k or {}).get("status") or "").lower()
                it["status"] = s
                it["stage_label"] = STAGE_LABEL.get(s, "Awaiting PM")
                it["rejection_reason"] = (k or {}).get("rejection_reason")
                statuses.append(s)
            # Worst (lowest priority) status drives the card-level stage
            worst = min(statuses, key=lambda x: STAGE_PRIORITY.get(x, 99)) if statuses else ""
            r["overall_status"] = worst
            r["stage_label"] = STAGE_LABEL.get(worst, "Awaiting PM")

    return records


@router.get("/site-engineer/petty-cash/income-history")
async def get_income_history(user: User = Depends(get_current_user)):
    """Get petty cash income history (acknowledged/issued amounts) enriched
    with the pending "Exp Waiting A/C" total per bucket — i.e. sum of every
    `recorded_expenses` row still at status `pm_approved` (Accountant hasn't
    finalised) that was funded from this petty cash bucket. This drives the
    new "Exp Waiting" column in the SE Income History table.
    """
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {"requested_by": user.user_id, "status": {"$in": ["payment_done", "acknowledged", "issued", "partially_spent", "settled"]}}
    records = await db.petty_cash.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    if records:
        pc_ids = [r["petty_cash_id"] for r in records]
        agg = await db.recorded_expenses.aggregate([
            {"$match": {"linked_petty_cash_id": {"$in": pc_ids}, "status": "pm_approved"}},
            {"$group": {"_id": "$linked_petty_cash_id", "total": {"$sum": "$amount"}}},
        ]).to_list(2000)
        by_pc = {row["_id"]: float(row["total"] or 0) for row in agg}
        for r in records:
            r["exp_waiting_amount"] = by_pc.get(r["petty_cash_id"], 0.0)
    return records



# ==================== ACCOUNTANT MODULE - COMPREHENSIVE ====================

EXPENSE_CATEGORIES = [
    "salary", "material", "labour", "transport", "utility", "utilities",
    "rent", "marketing", "office", "maintenance", "other",
    "petty_cash", "indirect"
]

class RecordedExpenseCreate(BaseModel):
    project_id: Optional[str] = None
    category: str
    description: str
    amount: float
    payment_method: str = "bank_transfer"
    reference: Optional[str] = None
    vendor_name: Optional[str] = None
    remarks: Optional[str] = None

@router.get("/accountant/material-requests")
async def get_accountant_material_requests(user: User = Depends(get_current_user)):
    """Get material requests for accountant verification"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can access this")
    
    # Get requests pending accounts approval or all recent ones
    requests = await db.material_requests.find(
        {"status": {"$in": ["pending_accounts_approval", "procurement_approved", "accounts_approved", "order_placed", "payment_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with project and material names
    for r in requests:
        project = await db.projects.find_one({"project_id": r.get("project_id")}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"
        material = await db.materials.find_one({"material_id": r.get("material_id")}, {"_id": 0, "name": 1})
        r["material_name"] = material["name"] if material else r.get("material_name", "Unknown")
        
        # Get vendor info if assigned
        if r.get("vendor_id"):
            vendor = await db.vendor_master.find_one({"vendor_id": r["vendor_id"]}, {"_id": 0, "name": 1})
            r["vendor_name"] = vendor["name"] if vendor else "Unknown"
    
    return requests

@router.patch("/accountant/material-requests/{request_id}/approve")
async def accountant_approve_material_request(request_id: str, action: str = "approve", user: User = Depends(get_current_user)):
    """Accountant approves material request for payment"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")
    
    request = await db.material_requests.find_one({"request_id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if action == "approve":
        await db.material_requests.update_one(
            {"request_id": request_id},
            {"$set": {
                "status": "accounts_approved",
                "accounts_approved_by": user.user_id,
                "accounts_approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        # Notify procurement
        proc_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(10)
        for p in proc_users:
            await create_notification(p["user_id"], f"Material request approved by accounts: {request.get('material_name', 'Unknown')}")
        return {"message": "Approved by accounts"}
    else:
        return {"message": "No action taken"}

@router.patch("/accountant/material-requests/{request_id}/reject")
async def accountant_reject_material_request(request_id: str, reason: str = "", user: User = Depends(get_current_user)):
    """Accountant rejects material request"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "accounts_rejected",
            "accounts_rejected_by": user.user_id,
            "accounts_rejected_reason": reason,
            "accounts_rejected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Rejected by accounts"}

@router.get("/accountant/labour-requests")
async def get_accountant_labour_requests(user: User = Depends(get_current_user)):
    """Get labour requests for accountant verification"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can access this")
    
    requests = await db.labour_expenses.find(
        {"status": {"$in": ["pending_accounts_approval", "planning_approved", "accountant_approved", "accounts_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with project name
    for r in requests:
        project = await db.projects.find_one({"project_id": r.get("project_id")}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"
    
    return requests

@router.patch("/accountant/labour-requests/{labour_expense_id}/approve")
async def accountant_approve_labour(labour_expense_id: str, user: User = Depends(get_current_user)):
    """Accountant approves labour payment"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")
    
    await db.labour_expenses.update_one(
        {"labour_expense_id": labour_expense_id},
        {"$set": {
            "status": "accounts_approved",
            "accounts_approved_by": user.user_id,
            "accounts_approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Labour payment approved"}

@router.patch("/accountant/labour-requests/{labour_expense_id}/reject")
async def accountant_reject_labour(labour_expense_id: str, reason: str = "", user: User = Depends(get_current_user)):
    """Accountant rejects labour payment"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    
    await db.labour_expenses.update_one(
        {"labour_expense_id": labour_expense_id},
        {"$set": {
            "status": "accounts_rejected",
            "accounts_rejected_by": user.user_id,
            "accounts_rejected_reason": reason,
            "accounts_rejected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Labour payment rejected"}

@router.post("/accountant/record-expense")
async def record_expense(data: RecordedExpenseCreate, user: User = Depends(get_current_user)):
    """Accountant records an expense after verification"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can record expenses")
    
    if data.category not in EXPENSE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {EXPENSE_CATEGORIES}")
    
    expense = {
        "expense_id": f"exp_{secrets.token_hex(8)}",
        "project_id": data.project_id,
        "category": data.category,
        "description": data.description,
        "amount": data.amount,
        "payment_method": data.payment_method,
        "reference": data.reference,
        "vendor_name": data.vendor_name,
        "remarks": data.remarks,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "recorded",
        "source": "manual"
    }
    
    # Get project name if provided
    if data.project_id:
        project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
        expense["project_name"] = project["name"] if project else "Unknown"
    
    await db.recorded_expenses.insert_one(expense)
    expense.pop("_id", None)
    
    await create_audit_log(user.user_id, "create", "recorded_expense", expense["expense_id"], {"amount": data.amount, "category": data.category})
    
    return expense

@router.get("/accountant/recorded-expenses")
async def get_recorded_expenses(
    project_id: Optional[str] = None,
    category: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all recorded expenses"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can access this")
    
    query = {}
    if project_id:
        query["project_id"] = project_id
    if category:
        query["category"] = category
    
    expenses = await db.recorded_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    await _backfill_item_bills(expenses)
    return expenses


async def _backfill_item_bills(rows):
    """Legacy `recorded_expenses` rows created before the multi-bill patch
    don't carry `item_bills` or `bill_file_id`. Enrich them on read by
    looking up the parent `direct_expenses` document (via `direct_expense_id`)
    and pulling any per-item bill file references. Runs once per read call —
    fast enough for the 500-row cap on both endpoints.
    """
    to_lookup = [r["direct_expense_id"] for r in rows
                 if r.get("direct_expense_id")
                 and not (r.get("item_bills") or r.get("bill_file_id"))]
    if not to_lookup:
        return
    parents = await db.direct_expenses.find(
        {"expense_id": {"$in": list(set(to_lookup))}},
        {"_id": 0, "expense_id": 1, "items": 1},
    ).to_list(1000)
    by_id = {p["expense_id"]: p for p in parents}
    for r in rows:
        if r.get("item_bills") or r.get("bill_file_id"):
            continue
        parent = by_id.get(r.get("direct_expense_id"))
        if not parent:
            continue
        item_bills = []
        for it in (parent.get("items") or []):
            if it.get("bill_file_id"):
                item_bills.append({
                    "label": it.get("expense_name") or it.get("category") or "Bill",
                    "bill_file_id": it["bill_file_id"],
                    "bill_filename": it.get("bill_filename"),
                })
        if item_bills:
            r["item_bills"] = item_bills
            r["bill_file_id"] = item_bills[0]["bill_file_id"]
            r["bill_filename"] = item_bills[0].get("bill_filename")


@router.get("/pm/recorded-expenses")
async def get_pm_recorded_expenses(user: User = Depends(get_current_user)):
    """Project Manager view of SE-recorded petty-cash expenses.

    Routing logic — "team-based":
      • For a PM, gather every project where they are listed as PM (project_manager
        / associate_pm / assigned_pm).
      • Collect the SE user_ids from those projects' team (site_engineer,
        sr_site_engineer, associate_pm, project_manager themselves).
      • Show expenses whose `recorded_by` matches any of those team SEs.
      • Super Admin → everything.
      • Falls back to "everything" if PM has no team mapping yet (so newly
        created PMs aren't stuck with an empty queue).

    Source filter retained: ONLY rows the Site Engineer raised. Accountant
    cash issuances / WO stage releases / manual cashbook entries stay out.
    """
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can access this")

    se_sources = ["site_engineer_direct", "site_engineer", "se_direct"]
    query: Dict[str, Any] = {"source": {"$in": se_sources}}

    if user.role in (UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM):
        team_projects = await db.projects.find(
            {"$or": [
                {"team.project_manager": user.user_id},
                {"team.associate_pm": user.user_id},
                {"assigned_pm": user.user_id},
            ]},
            {"_id": 0, "team": 1}
        ).to_list(None)
        # Collect SE user_ids from those teams
        team_se_ids = set()
        for p in team_projects:
            t = p.get("team") or {}
            for k in ("site_engineer", "sr_site_engineer", "associate_pm"):
                v = t.get(k)
                if v:
                    team_se_ids.add(v)
        if team_se_ids:
            query["recorded_by"] = {"$in": list(team_se_ids)}
        # else: no team mapping yet — show everything so the PM can still work

    rows = await db.recorded_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    await _backfill_item_bills(rows)
    return rows


# ---------- Record Expense: PM → Accountant approval ladder ----------
# Status lifecycle (recorded_expenses.status):
#   "recorded"      → SE just submitted (PM bucket: New Expense)
#   "pm_approved"   → PM cleared it     (PM bucket: Awaiting Accountant)
#   "approved"      → Accountant cleared (PM bucket: Expense Recorded)
#   "pm_rejected"   → PM bounced (shows in New Expense with banner)
class RecordedExpenseReviewPayload(BaseModel):
    remarks: Optional[str] = None
    reason: Optional[str] = None
    # Mode-of-payment fields surface on the Accountant approve dialog so the
    # cashbook bucket can be tagged correctly when the expense lands.
    payment_mode: Optional[str] = None             # cash | hdfc_current | hdfc_savings | cheque | direct_transfer | suspense
    reference_number: Optional[str] = None
    bank_name: Optional[str] = None
    cheque_date: Optional[str] = None
    payment_date: Optional[str] = None


@router.patch("/pm/recorded-expenses/{expense_id}/approve")
async def pm_approve_recorded_expense(expense_id: str, payload: RecordedExpenseReviewPayload = None, user: User = Depends(get_current_user)):
    """PM signs off on an SE-recorded petty-cash expense. Status: recorded → pm_approved."""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can approve")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Recorded expense not found")
    if (exp.get("status") or "").lower() not in ("recorded", "pm_rejected"):
        raise HTTPException(status_code=400, detail=f"Cannot approve from status '{exp.get('status')}'")

    # Mar 04 2026 — PM must not approve if the cumulative pm_approved amount
    # for this petty_cash bucket would exceed the bucket balance. Prevents
    # scenarios like the "Site expense the week" bug where 2 × ₹5,000
    # expenses were approved against a single ₹5,000 bucket.
    pc_id = exp.get("linked_petty_cash_id")
    if pc_id:
        pc = await db.petty_cash.find_one({"petty_cash_id": pc_id}, {"_id": 0, "amount_issued": 1, "amount_spent": 1, "purpose": 1})
        if pc:
            cursor = db.recorded_expenses.aggregate([
                {"$match": {"linked_petty_cash_id": pc_id, "status": "pm_approved", "expense_id": {"$ne": expense_id}}},
                {"$group": {"_id": None, "t": {"$sum": "$amount"}}},
            ])
            docs = await cursor.to_list(1)
            already_pm_approved = float(docs[0]["t"]) if docs else 0.0
            issued = float(pc.get("amount_issued") or 0)
            spent = float(pc.get("amount_spent") or 0)
            remaining = issued - spent - already_pm_approved
            this_amt = float(exp.get("amount") or 0)
            if this_amt > remaining + 0.5:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{pc.get('purpose') or 'Petty cash'}' has only ₹{remaining:,.0f} available. "
                           f"Bucket: ₹{issued:,.0f} issued, ₹{spent:,.0f} spent, ₹{already_pm_approved:,.0f} already PM-approved. "
                           f"Ask the Accountant to reduce the pending queue first or increase the petty cash issuance."
                )
    now = datetime.now(timezone.utc).isoformat()
    remarks = (payload.remarks if payload else None)
    await db.recorded_expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {
            "status": "pm_approved",
            "pm_approved_by": user.user_id,
            "pm_approved_by_name": user.name,
            "pm_approved_at": now,
            "pm_remarks": remarks,
            "updated_at": now,
        }}
    )
    return {"message": "Approved and sent to Accountant", "expense_id": expense_id}


@router.patch("/pm/recorded-expenses/{expense_id}/reject")
async def pm_reject_recorded_expense(expense_id: str, payload: RecordedExpenseReviewPayload = None, user: User = Depends(get_current_user)):
    """PM rejects an SE-recorded expense — bounces back to SE for correction.
    Status: recorded → pm_rejected."""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only PM can reject")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Recorded expense not found")
    reason = (payload.reason if payload else None) or "Rejected by PM"
    now = datetime.now(timezone.utc).isoformat()
    await db.recorded_expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {
            "status": "pm_rejected",
            "pm_rejected_by": user.user_id,
            "pm_rejected_by_name": user.name,
            "pm_rejected_at": now,
            "rejection_reason": reason,
            "updated_at": now,
        }}
    )
    return {"message": "Rejected and returned to Site Engineer", "expense_id": expense_id}


@router.patch("/accountant/recorded-expenses/{expense_id}/approve")
async def accountant_approve_recorded_expense(expense_id: str, payload: RecordedExpenseReviewPayload = None, user: User = Depends(get_current_user)):
    """Accountant final approval. Status: pm_approved → approved."""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Recorded expense not found")
    if (exp.get("status") or "").lower() not in ("pm_approved", "recorded"):
        raise HTTPException(status_code=400, detail=f"Cannot approve from status '{exp.get('status')}'")
    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {
        "status": "approved",
        "accountant_approved_by": user.user_id,
        "accountant_approved_by_name": user.name,
        "accountant_approved_at": now,
        "accountant_remarks": (payload.remarks if payload else None),
        "updated_at": now,
    }
    if payload and payload.payment_mode:
        pm_mode = payload.payment_mode.lower()
        updates["payment_mode"] = pm_mode
        updates["payment_method"] = pm_mode
        if payload.reference_number:
            updates["reference_number"] = payload.reference_number
        if payload.bank_name:
            updates["bank_name"] = payload.bank_name
        if payload.cheque_date:
            updates["cheque_date"] = payload.cheque_date
        if payload.payment_date:
            updates["payment_date"] = payload.payment_date
    await db.recorded_expenses.update_one({"expense_id": expense_id}, {"$set": updates})
    # Jul 03 2026 — Increment `amount_spent` on the linked petty_cash bucket
    # ONLY at Accountant approval time. Before this moment the SE-recorded
    # expense sat in a "reserved" state and did not consume bucket balance;
    # now that it's officially into the Cashbook, it counts.
    pc_id = exp.get("linked_petty_cash_id")
    if pc_id:
        amt = float(exp.get("amount") or 0)
        await db.petty_cash.update_one(
            {"petty_cash_id": pc_id},
            {"$inc": {"amount_spent": amt}, "$set": {"updated_at": now}},
        )
        pc_after = await db.petty_cash.find_one(
            {"petty_cash_id": pc_id},
            {"_id": 0, "amount_issued": 1, "amount_spent": 1},
        )
        if pc_after:
            spent = pc_after.get("amount_spent") or 0
            issued = pc_after.get("amount_issued") or 0
            if spent >= issued > 0:
                await db.petty_cash.update_one(
                    {"petty_cash_id": pc_id},
                    {"$set": {"status": "settled"}},
                )
            elif spent > 0:
                await db.petty_cash.update_one(
                    {"petty_cash_id": pc_id, "status": {"$in": ["payment_done", "acknowledged", "issued"]}},
                    {"$set": {"status": "partially_spent"}},
                )
    return {"message": "Recorded into cashbook", "expense_id": expense_id}


@router.patch("/accountant/recorded-expenses/{expense_id}/reject")
async def accountant_reject_recorded_expense(expense_id: str, payload: RecordedExpenseReviewPayload = None, user: User = Depends(get_current_user)):
    """Accountant rejects a PM-approved recorded expense — bounces all the way
    back to the SE. Status: pm_approved → accountant_rejected."""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Recorded expense not found")
    reason = (payload.reason if payload else None) or "Rejected by Accountant"
    now = datetime.now(timezone.utc).isoformat()
    await db.recorded_expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {
            "status": "accountant_rejected",
            "accountant_rejected_by": user.user_id,
            "accountant_rejected_by_name": user.name,
            "accountant_rejected_at": now,
            "rejection_reason": reason,
            "updated_at": now,
        }}
    )
    return {"message": "Rejected and bounced back", "expense_id": expense_id}




# ==================== PROJECT MANAGER MODULE ====================

class TeamAssignmentCreate(BaseModel):
    project_id: str
    user_id: str
    role: Optional[str] = None  # Optional: associate_pm, sr_site_engineer, site_engineer (fetched from user if not provided)

@router.get("/pm/dashboard")
async def get_pm_dashboard(user: User = Depends(get_current_user)):
    """Project Manager dashboard"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can access this")
    
    # Get all projects (PM sees all projects)
    total_projects = await db.projects.count_documents({})
    active_projects = await db.projects.count_documents({"status": {"$in": ["in_planning", "planning_approved", "active"]}})
    
    # Pending material requests (need PM approval)
    pending_material = await db.material_requests.count_documents({"status": "requested"})
    
    # Pending labour requests (need PM approval)
    pending_labour = await db.labour_expenses.count_documents({"status": "requested"})
    
    # Team members count
    team_members = await db.users.count_documents({
        "role": {"$in": ["associate_pm", "sr_site_engineer", "site_engineer"]}
    })
    
    return {
        "total_projects": total_projects,
        "active_projects": active_projects,
        "pending_material_requests": pending_material,
        "pending_labour_requests": pending_labour,
        "team_members": team_members
    }


@router.get("/pm/projects")
async def get_pm_projects(user: User = Depends(get_current_user)):
    """Projects visible on the PM dashboard.

    Feb 19 2026 — Restricted to projects where this PM is the assigned
    `team.project_manager` (Planning's Team Assign feature). Super Admins
    still see everything.
    """
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can access this")

    query: Dict[str, Any] = {}
    if user.role == UserRole.PROJECT_MANAGER:
        # Match either the new `team.project_manager` slot (PATCH /projects/{id}/team)
        # or the legacy `assigned_pm` field (seed data) for backward compat.
        query = {"$or": [
            {"team.project_manager": user.user_id},
            {"assigned_pm": user.user_id},
        ]}

    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Enrich with team assignments
    for proj in projects:
        assignments = await db.site_engineer_assignments.find({
            "project_id": proj["project_id"],
            "is_active": True
        }, {"_id": 0}).to_list(10)
        proj["team_assignments"] = assignments
        
        # Get team member details
        team = []
        for a in assignments:
            u = await db.users.find_one({"user_id": a["user_id"]}, {"_id": 0, "user_id": 1, "name": 1, "role": 1})
            if u:
                team.append(u)
        proj["team"] = team
    
    return projects


@router.get("/pm/material-requests")
async def get_pm_material_requests(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Material requests visible to the PM dashboard.

    The PM Requests tab buckets cover the full lifecycle (New Request,
    Planning Awaiting, Revision, Awaiting Accountant, Transit, Delivered),
    so by default we return ALL statuses — not just `requested` — and let
    the frontend bucketise. An explicit `status` query param still scopes
    the result for callers that want a narrow slice (e.g. notifications).

    Feb 19 2026 — Scoped to projects where this PM is assigned
    (`team.project_manager` slot or legacy `assigned_pm`). Super Admins
    still see everything.
    """
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can access this")

    query: Dict[str, Any] = {}
    if status and status != "all":
        query["status"] = status

    if user.role == UserRole.PROJECT_MANAGER:
        assigned_projects = await db.projects.find(
            {"$or": [
                {"team.project_manager": user.user_id},
                {"team.associate_pm": user.user_id},
                {"assigned_pm": user.user_id},
            ]},
            {"_id": 0, "project_id": 1}
        ).to_list(None)
        project_ids = [p["project_id"] for p in assigned_projects if p.get("project_id")]
        if not project_ids:
            return []
        query["project_id"] = {"$in": project_ids}

    requests = await db.material_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Enrich with project name and requester name
    for r in requests:
        project = await db.projects.find_one({"project_id": r["project_id"]}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"

        requester = await db.users.find_one({"user_id": r["site_engineer_id"]}, {"_id": 0, "name": 1})
        r["requester_name"] = requester["name"] if requester else "Unknown"

    return requests


@router.get("/pm/labour-requests")
async def get_pm_labour_requests(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Labour requests visible to the PM dashboard. Returns full lifecycle
    by default so the bucket strip ("New Request", "Awaiting Accountant",
    "Released" etc.) can populate; pass `?status=requested` to scope.

    Feb 19 2026 — Scoped to projects where this PM is assigned
    (`team.project_manager` slot or legacy `assigned_pm`). Super Admins
    still see everything.
    """
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can access this")

    query: Dict[str, Any] = {}
    if status and status != "all":
        query["status"] = status

    if user.role == UserRole.PROJECT_MANAGER:
        assigned_projects = await db.projects.find(
            {"$or": [
                {"team.project_manager": user.user_id},
                {"team.associate_pm": user.user_id},
                {"assigned_pm": user.user_id},
            ]},
            {"_id": 0, "project_id": 1}
        ).to_list(None)
        project_ids = [p["project_id"] for p in assigned_projects if p.get("project_id")]
        if not project_ids:
            return []
        query["project_id"] = {"$in": project_ids}

    requests = await db.labour_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    for r in requests:
        project = await db.projects.find_one({"project_id": r["project_id"]}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"

    return requests


@router.patch("/pm/labour-requests/{request_id}/verify")
async def pm_verify_labour_request(
    request_id: str,
    action: str,  # approve, reject
    rejection_reason: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """PM verifies labour request, then it goes to Accountant for payment approval"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can verify")
    
    request = await db.labour_expenses.find_one({"labour_expense_id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Labour request not found")
    
    if action == "approve":
        await db.labour_expenses.update_one(
            {"labour_expense_id": request_id},
            {"$set": {
                "status": "pending_accounts_approval",
                "pm_verified_by": user.user_id,
                "pm_verified_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        # Notify Accountant
        acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(10)
        for a in acc_users:
            await create_notification(a["user_id"], f"Labour request needs payment approval: {request.get('description', request.get('labour_type', 'Labour payment'))}")
        return {"message": "Labour request verified by PM, sent to Accountant for approval"}
    
    elif action == "reject":
        await db.labour_expenses.update_one(
            {"labour_expense_id": request_id},
            {"$set": {
                "status": "rejected",
                "pm_rejected_by": user.user_id,
                "pm_rejection_reason": rejection_reason,
                "pm_rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        se_id = request.get("site_engineer_id", "")
        if se_id:
            await create_notification(se_id, f"Labour request rejected by PM: {rejection_reason or 'No reason'}")
        return {"message": "Labour request rejected by PM"}
    
    raise HTTPException(status_code=400, detail="Invalid action")


@router.post("/pm/assign-team")
async def assign_team_to_project(data: TeamAssignmentCreate, user: User = Depends(get_current_user)):
    """Project Manager assigns team members to project"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Project Manager, Super Admin, or Planning can assign team")
    project = await db.projects.find_one({"project_id": data.project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate user exists and has correct role
    team_member = await db.users.find_one({"user_id": data.user_id})
    if not team_member:
        raise HTTPException(status_code=404, detail="User not found")
    
    if team_member["role"] not in ["associate_pm", "sr_site_engineer", "site_engineer"]:
        raise HTTPException(status_code=400, detail="User must be Associate PM, Sr. Site Engineer, or Site Engineer")
    
    # Check if already assigned
    existing = await db.site_engineer_assignments.find_one({
        "user_id": data.user_id,
        "project_id": data.project_id,
        "is_active": True
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this project")
    
    assignment = {
        "assignment_id": f"sea_{secrets.token_hex(6)}",
        "user_id": data.user_id,
        "user_name": team_member["name"],
        "user_role": team_member["role"],
        "project_id": data.project_id,
        "project_name": project["name"],
        "assigned_by": user.user_id,
        "assigned_by_name": user.name,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.site_engineer_assignments.insert_one(assignment)
    assignment.pop("_id", None)
    
    # Update project with assigned engineer
    update_fields = {}
    if team_member["role"] == "site_engineer":
        update_fields["assigned_se"] = data.user_id
        update_fields["assigned_se_name"] = team_member["name"]
    
    if update_fields:
        await db.projects.update_one(
            {"project_id": data.project_id},
            {"$set": update_fields}
        )
    
    # Notify team member
    await create_notification(data.user_id, f"You have been assigned to project: {project['name']}")
    
    return {"message": f"Assigned {team_member['name']} to {project['name']}", "assignment": assignment}


@router.delete("/pm/projects/{project_id}/team/{user_id}")
async def remove_team_from_project(project_id: str, user_id: str, user: User = Depends(get_current_user)):
    """Remove a specific team member from a specific project"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.site_engineer_assignments.update_one(
        {"project_id": project_id, "user_id": user_id, "is_active": True},
        {"$set": {"is_active": False, "removed_by": user.user_id, "removed_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Clear project shortcut fields if applicable
    project = await db.projects.find_one({"project_id": project_id})
    if project and project.get("assigned_se") == user_id:
        await db.projects.update_one({"project_id": project_id}, {"$unset": {"assigned_se": "", "assigned_se_name": ""}})
    
    await create_notification(user_id, f"You have been removed from project: {project.get('name', project_id) if project else project_id}")
    return {"message": "Team member removed from project"}

@router.get("/pm/team-members")
async def get_team_members(user: User = Depends(get_current_user)):
    """Get all team members (Associate PM, Sr. Site Engineer, Site Engineer)"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    team = await db.users.find({
        "role": {"$in": ["associate_pm", "sr_site_engineer", "site_engineer"]}
    }, {"_id": 0, "password": 0, "password_hash": 0}).to_list(100)
    
    # Add current project assignments
    for member in team:
        assignments = await db.site_engineer_assignments.find({
            "user_id": member["user_id"],
            "is_active": True
        }, {"_id": 0}).to_list(10)
        member["active_projects"] = len(assignments)
        member["assignments"] = assignments
    
    return team


@router.post("/pm/create-site-engineer")
async def pm_create_site_engineer(data: dict, user: User = Depends(get_current_user)):
    """PM creates a site engineer or sr. site engineer user"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can create site engineers")
    
    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip().lower()
    role = data.get("role", "site_engineer")
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if role not in ["site_engineer", "sr_site_engineer"]:
        raise HTTPException(status_code=400, detail="Role must be site_engineer or sr_site_engineer")
    
    # Check if email already exists (if provided)
    if email:
        existing = await db.users.find_one({"email": email})
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    new_user = {
        "user_id": user_id,
        "name": name,
        "email": email or f"{user_id}@constructionos.local",
        "phone": phone,
        "role": role,
        "is_active": True,
        "status": "active",
        "password_hash": "",
        "created_by": user.user_id,
        "created_at": now
    }
    
    await db.users.insert_one(new_user)
    new_user.pop("_id", None)
    new_user.pop("password_hash", None)
    
    return {"message": f"{role.replace('_', ' ').title()} '{name}' created successfully", "user": new_user}


@router.delete("/pm/team-members/{user_id}")
async def pm_remove_team_member(user_id: str, user: User = Depends(get_current_user)):
    """PM deactivates a team member"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Project Manager can manage team")
    
    member = await db.users.find_one({"user_id": user_id})
    if not member:
        raise HTTPException(status_code=404, detail="User not found")
    if member["role"] not in ["site_engineer", "sr_site_engineer"]:
        raise HTTPException(status_code=400, detail="Can only manage site engineers")
    
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_active": False}})
    await db.site_engineer_assignments.update_many({"user_id": user_id, "is_active": True}, {"$set": {"is_active": False}})
    
    return {"message": f"Team member deactivated"}


@router.get("/pm/project-stages")
async def get_project_stages_list(user: User = Depends(get_current_user)):
    """Get available construction stages"""
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from .operations import PROJECT_STAGES
    return PROJECT_STAGES


# ==================== SITE ENGINEER MINI CASHBOOK ====================

@router.get("/site-engineer/mini-cashbook")
async def get_mini_cashbook(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get mini cashbook for site engineer - per project income/expense tracking"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get assignments
    se_user_id = user.user_id
    if user.role in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        se_user_id = None  # Can view all

    # Get assigned projects
    assign_query = {"is_active": True}
    if se_user_id:
        assign_query["user_id"] = se_user_id
    if project_id:
        assign_query["project_id"] = project_id

    assignments = await db.site_engineer_assignments.find(assign_query, {"_id": 0}).to_list(50)
    project_ids = [a["project_id"] for a in assignments]

    if not project_ids and project_id:
        project_ids = [project_id]

    # Get petty cash data for these projects
    pc_query = {}
    if se_user_id:
        pc_query["requested_by"] = se_user_id
    if project_ids:
        pc_query["project_id"] = {"$in": project_ids}

    petty_cash_list = await db.petty_cash.find(pc_query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Get recorded expenses by this SE
    exp_query = {}
    if se_user_id:
        exp_query["recorded_by"] = se_user_id
    if project_ids:
        exp_query["project_id"] = {"$in": project_ids}

    recorded_expenses = await db.recorded_expenses.find(exp_query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Get projects info
    projects = await db.projects.find(
        {"project_id": {"$in": project_ids}} if project_ids else {},
        {"_id": 0, "project_id": 1, "name": 1}
    ).to_list(100)
    project_map = {p["project_id"]: p["name"] for p in projects}

    # Build mini cashbook per project
    cashbooks = {}
    for pid in project_ids:
        pc_for_project = [pc for pc in petty_cash_list if pc.get("project_id") == pid]
        exp_for_project = [e for e in recorded_expenses if e.get("project_id") == pid]

        total_issued = sum(pc.get("amount_issued", 0) for pc in pc_for_project)
        total_spent = sum(pc.get("amount_spent", 0) for pc in pc_for_project)
        total_expense_recorded = sum(e.get("amount", 0) for e in exp_for_project)
        balance = total_issued - total_spent

        cashbooks[pid] = {
            "project_id": pid,
            "project_name": project_map.get(pid, "Unknown"),
            "total_issued": total_issued,
            "total_spent": total_spent,
            "total_expense_recorded": total_expense_recorded,
            "balance": balance,
            "petty_cash_entries": pc_for_project,
            "expense_entries": exp_for_project,
        }

    return {
        "cashbooks": list(cashbooks.values()),
        "summary": {
            "total_issued": sum(c["total_issued"] for c in cashbooks.values()),
            "total_spent": sum(c["total_spent"] for c in cashbooks.values()),
            "total_balance": sum(c["balance"] for c in cashbooks.values()),
            "project_count": len(cashbooks),
        }
    }


@router.post("/site-engineer/mini-cashbook/record-expense")
async def se_record_expense(user: User = Depends(get_current_user)):
    """Site engineer records an expense in their mini cashbook"""
    # This uses the existing record-expense but is here for reference
    pass


# ==================== ACCOUNTANT PETTY CASH MANAGEMENT ====================

@router.get("/accountant/petty-cash-management")
async def get_petty_cash_management(user: User = Depends(get_current_user)):
    """Accountant: View all site engineer petty cash with balances"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get all petty cash requests
    all_pc = await db.petty_cash.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Group by site engineer
    se_data = {}
    for pc in all_pc:
        se_id = pc.get("requested_by", "unknown")
        se_name = pc.get("requested_by_name", "Unknown")
        if se_id not in se_data:
            se_data[se_id] = {
                "user_id": se_id,
                "name": se_name,
                "total_issued": 0,
                "total_spent": 0,
                "total_requested": 0,
                "balance": 0,
                "pending_requests": 0,
                "projects": {},
                "requests": [],
            }
        se_data[se_id]["total_issued"] += pc.get("amount_issued", 0)
        se_data[se_id]["total_spent"] += pc.get("amount_spent", 0)
        se_data[se_id]["total_requested"] += pc.get("amount_requested", 0)
        if pc.get("status") == "requested":
            se_data[se_id]["pending_requests"] += 1

        pid = pc.get("project_id")
        if pid and pid not in se_data[se_id]["projects"]:
            se_data[se_id]["projects"][pid] = pc.get("project_name", "Unknown")

        se_data[se_id]["requests"].append(pc)

    for se in se_data.values():
        se["balance"] = se["total_issued"] - se["total_spent"]
        se["projects"] = [{"project_id": k, "project_name": v} for k, v in se["projects"].items()]

    return {
        "site_engineers": list(se_data.values()),
        "summary": {
            "total_issued": sum(s["total_issued"] for s in se_data.values()),
            "total_spent": sum(s["total_spent"] for s in se_data.values()),
            "total_balance": sum(s["balance"] for s in se_data.values()),
            "pending_requests": sum(s["pending_requests"] for s in se_data.values()),
        }
    }


@router.get("/accountant/petty-cash/{user_id}/mini-cashbook")
async def get_se_mini_cashbook_for_accountant(user_id: str, user: User = Depends(get_current_user)):
    """Accountant views a specific site engineer's mini cashbook"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get all petty cash for this SE
    pc_list = await db.petty_cash.find({"requested_by": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Get SE info
    se_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1, "email": 1, "role": 1})

    total_issued = sum(pc.get("amount_issued", 0) for pc in pc_list)
    total_spent = sum(pc.get("amount_spent", 0) for pc in pc_list)

    return {
        "user": se_user,
        "petty_cash": pc_list,
        "summary": {
            "total_issued": total_issued,
            "total_spent": total_spent,
            "balance": total_issued - total_spent,
            "request_count": len(pc_list),
        }
    }



# ==================== SITE ENGINEER ATTENDANCE ====================

import math

def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS points in km"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


class AttendanceLogin(BaseModel):
    project_id: str
    latitude: float
    longitude: float


class AttendanceLogout(BaseModel):
    project_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/attendance/login")
async def attendance_login(data: AttendanceLogin, user: User = Depends(get_current_user)):
    """Site Engineer logs in to a project site - GPS verified"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only site engineers can log attendance")

    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # GPS is mandatory - verify coordinates are valid
    if data.latitude == 0 and data.longitude == 0:
        raise HTTPException(status_code=400, detail="Valid GPS location is required. Please enable GPS/Location services and try again.")

    # GPS verification if project has coordinates
    proj_lat = project.get("latitude")
    proj_lng = project.get("longitude")
    if proj_lat and proj_lng:
        dist = haversine_km(data.latitude, data.longitude, float(proj_lat), float(proj_lng))
        if dist > 5:
            raise HTTPException(status_code=400, detail=f"You are {dist:.1f}km away from the project site. Must be within 5km to log in.")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Check if already logged in to this project today without logout
    existing = await db.se_attendance.find_one({
        "user_id": user.user_id, "date": today
    })

    if existing:
        # Check if already logged in to this project without logout
        for entry in existing.get("entries", []):
            if entry["project_id"] == data.project_id and not entry.get("logout_time"):
                raise HTTPException(status_code=400, detail=f"Already logged in to {project.get('name', 'this project')}. Please logout first.")
        # Also check if logged into any other project without logout
        for entry in existing.get("entries", []):
            if not entry.get("logout_time"):
                raise HTTPException(status_code=400, detail=f"Please logout from {entry.get('project_name', 'current site')} first.")

        # Add new entry
        new_entry = {
            "project_id": data.project_id,
            "project_name": project.get("name", ""),
            "login_time": now_time,
            "logout_time": None,
            "login_lat": data.latitude,
            "login_lng": data.longitude,
            "logout_lat": None,
            "logout_lng": None,
        }
        await db.se_attendance.update_one(
            {"_id": existing["_id"]},
            {"$push": {"entries": new_entry}, "$set": {"updated_at": now_iso}}
        )
    else:
        # Create new attendance record for today
        doc = {
            "attendance_id": f"att_{uuid.uuid4().hex[:8]}",
            "user_id": user.user_id,
            "user_name": user.name,
            "date": today,
            "entries": [{
                "project_id": data.project_id,
                "project_name": project.get("name", ""),
                "login_time": now_time,
                "logout_time": None,
                "login_lat": data.latitude,
                "login_lng": data.longitude,
                "logout_lat": None,
                "logout_lng": None,
            }],
            "total_hours": 0,
            "status": "present",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.se_attendance.insert_one(doc)

    return {"message": f"Logged in to {project.get('name', '')} at {now_time}", "login_time": now_time}


@router.post("/attendance/logout")
async def attendance_logout(data: AttendanceLogout, user: User = Depends(get_current_user)):
    """Site Engineer logs out from a project site"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only site engineers can log attendance")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    now_iso = datetime.now(timezone.utc).isoformat()

    record = await db.se_attendance.find_one({"user_id": user.user_id, "date": today})
    if not record:
        raise HTTPException(status_code=400, detail="No attendance record for today")

    # Enforce: SE must record at least one DLR (with stage + work summary i.e. DPR) for this project today before logout
    dlr_today = await db.daily_labour_reports.find_one({
        "project_id": data.project_id,
        "date": today,
        "created_by": user.user_id,
    }, {"_id": 0, "dlr_id": 1, "stage_id": 1, "work_summary": 1})
    if not dlr_today:
        raise HTTPException(
            status_code=400,
            detail="DLR & DPR entry is mandatory before logout. Please record Daily Labour Report (with Stage & Work Summary) for this project first."
        )
    if not (dlr_today.get("stage_id") and (dlr_today.get("work_summary") or "").strip()):
        raise HTTPException(
            status_code=400,
            detail="DPR fields missing in today's DLR. Please update DLR with Current Project Stage & Work Summary before logout."
        )

    entries = record.get("entries", [])
    updated = False
    for i, entry in enumerate(entries):
        if entry["project_id"] == data.project_id and not entry.get("logout_time"):
            entries[i]["logout_time"] = now_time
            entries[i]["logout_lat"] = data.latitude
            entries[i]["logout_lng"] = data.longitude
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=400, detail="Not currently logged in to this project")

    # Calculate total hours
    total_minutes = 0
    for entry in entries:
        if entry.get("login_time") and entry.get("logout_time"):
            try:
                login_parts = entry["login_time"].split(":")
                logout_parts = entry["logout_time"].split(":")
                login_min = int(login_parts[0]) * 60 + int(login_parts[1])
                logout_min = int(logout_parts[0]) * 60 + int(logout_parts[1])
                total_minutes += max(0, logout_min - login_min)
            except (ValueError, IndexError):
                pass

    total_hours = round(total_minutes / 60, 2)
    if total_hours >= 8:
        status = "full_day"
    elif total_hours >= 4:
        status = "half_day"
    else:
        status = "short_day"

    await db.se_attendance.update_one(
        {"_id": record["_id"]},
        {"$set": {"entries": entries, "total_hours": total_hours, "status": status, "updated_at": now_iso}}
    )

    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    return {"message": f"Logged out from {project.get('name', '')} at {now_time}", "logout_time": now_time, "total_hours": total_hours, "status": status}


@router.get("/attendance/my-today")
async def get_my_today_attendance(user: User = Depends(get_current_user)):
    """Get current day's attendance for the logged-in SE"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    record = await db.se_attendance.find_one({"user_id": user.user_id, "date": today}, {"_id": 0})
    if not record:
        return {"date": today, "entries": [], "total_hours": 0, "status": "absent"}
    return record


@router.get("/attendance/my-history")
async def get_my_attendance_history(
    days: int = 30,
    user: User = Depends(get_current_user)
):
    """Get attendance history for the logged-in SE"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    records = await db.se_attendance.find(
        {"user_id": user.user_id, "date": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("date", -1).to_list(100)
    return records


@router.get("/attendance/all")
async def get_all_attendance(
    date: Optional[str] = None,
    user_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """PM/Planning view all SE attendance"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    query = {}
    if date:
        query["date"] = date
    if user_id:
        query["user_id"] = user_id
    records = await db.se_attendance.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return records


@router.patch("/projects/{project_id}/set-location")
async def set_project_location(project_id: str, request: Request, user: User = Depends(get_current_user)):
    """Set GPS coordinates for a project - supports direct lat/lng or Google Maps URL"""
    import re as _re
    body = await request.json()
    lat = body.get("latitude")
    lng = body.get("longitude")
    maps_url = body.get("google_maps_url", "")

    # Parse Google Maps URL if provided
    if maps_url and (lat is None or lng is None):
        coords = None
        # Pattern 1: @lat,lng or ?q=lat,lng
        m = _re.search(r'@(-?\d+\.?\d*),(-?\d+\.?\d*)', maps_url)
        if m:
            coords = (float(m.group(1)), float(m.group(2)))
        if not coords:
            m = _re.search(r'[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)', maps_url)
            if m:
                coords = (float(m.group(1)), float(m.group(2)))
        # Pattern 2: /place/.../@lat,lng
        if not coords:
            m = _re.search(r'place/[^/]*/@(-?\d+\.?\d*),(-?\d+\.?\d*)', maps_url)
            if m:
                coords = (float(m.group(1)), float(m.group(2)))
        # Pattern 3: ll=lat,lng
        if not coords:
            m = _re.search(r'll=(-?\d+\.?\d*),(-?\d+\.?\d*)', maps_url)
            if m:
                coords = (float(m.group(1)), float(m.group(2)))
        if coords:
            lat, lng = coords
        else:
            raise HTTPException(status_code=400, detail="Could not extract coordinates from the Google Maps URL. Try pasting a URL with @lat,lng in it.")

    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Provide latitude/longitude or a Google Maps URL")

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"latitude": float(lat), "longitude": float(lng), "google_maps_url": maps_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Project location updated", "latitude": float(lat), "longitude": float(lng)}


# ==================== SE LIVE LOCATION TRACKING ====================

@router.post("/attendance/track-location")
async def track_se_location(request: Request, user: User = Depends(get_current_user)):
    """SE sends GPS every 5 minutes while logged in. Checks geo-fence and auto-logouts if >5km."""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only site engineers can track location")

    body = await request.json()
    lat = body.get("latitude")
    lng = body.get("longitude")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="GPS coordinates required")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()
    now_time = datetime.now(timezone.utc).strftime("%H:%M")

    record = await db.se_attendance.find_one({"user_id": user.user_id, "date": today})
    if not record:
        return {"status": "no_attendance", "message": "Not logged in today"}

    # Find active entry (logged in but not out)
    entries = record.get("entries", [])
    active_entry = None
    active_idx = None
    for i, entry in enumerate(entries):
        if not entry.get("logout_time"):
            active_entry = entry
            active_idx = i
            break

    if not active_entry:
        return {"status": "not_active", "message": "No active login session"}

    # Store location ping
    ping = {
        "latitude": float(lat),
        "longitude": float(lng),
        "timestamp": now_iso
    }
    await db.se_location_pings.insert_one({
        "user_id": user.user_id,
        "user_name": user.name,
        "project_id": active_entry["project_id"],
        "project_name": active_entry.get("project_name", ""),
        "date": today,
        "latitude": float(lat),
        "longitude": float(lng),
        "timestamp": now_iso
    })

    # Check geo-fence: is SE still within 5km of project?
    project = await db.projects.find_one({"project_id": active_entry["project_id"]}, {"_id": 0})
    proj_lat = project.get("latitude") if project else None
    proj_lng = project.get("longitude") if project else None

    if proj_lat and proj_lng:
        dist = haversine_km(float(lat), float(lng), float(proj_lat), float(proj_lng))
        if dist > 5:
            # AUTO-LOGOUT: SE left the geo-fence
            entries[active_idx]["logout_time"] = now_time
            entries[active_idx]["logout_lat"] = float(lat)
            entries[active_idx]["logout_lng"] = float(lng)
            entries[active_idx]["auto_logout"] = True
            entries[active_idx]["auto_logout_reason"] = f"Left geo-fence ({dist:.1f}km away)"

            # Recalculate total hours
            total_minutes = 0
            for entry in entries:
                if entry.get("login_time") and entry.get("logout_time"):
                    try:
                        lp = entry["login_time"].split(":")
                        op = entry["logout_time"].split(":")
                        total_minutes += max(0, (int(op[0])*60+int(op[1])) - (int(lp[0])*60+int(lp[1])))
                    except (ValueError, IndexError):
                        pass
            total_hours = round(total_minutes / 60, 2)
            status = "full_day" if total_hours >= 8 else "half_day" if total_hours >= 4 else "short_day"

            await db.se_attendance.update_one(
                {"_id": record["_id"]},
                {"$set": {"entries": entries, "total_hours": total_hours, "status": status, "updated_at": now_iso}}
            )
            return {
                "status": "auto_logout",
                "message": f"Auto-logged out! You are {dist:.1f}km away from {active_entry.get('project_name', 'site')}. Must be within 5km.",
                "distance_km": round(dist, 1)
            }
        else:
            return {"status": "ok", "message": "Location tracked", "distance_km": round(dist, 1)}
    else:
        return {"status": "ok", "message": "Location tracked (project has no GPS set)"}


@router.post("/attendance/gps-lost-logout")
async def gps_lost_auto_logout(user: User = Depends(get_current_user)):
    """Auto-logout SE when GPS becomes unavailable"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only site engineers")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    now_iso = datetime.now(timezone.utc).isoformat()

    record = await db.se_attendance.find_one({"user_id": user.user_id, "date": today})
    if not record:
        return {"status": "no_record"}

    entries = record.get("entries", [])
    updated = False
    for i, entry in enumerate(entries):
        if not entry.get("logout_time"):
            entries[i]["logout_time"] = now_time
            entries[i]["auto_logout"] = True
            entries[i]["auto_logout_reason"] = "GPS/Location turned off"
            updated = True
            break

    if not updated:
        return {"status": "not_active"}

    total_minutes = 0
    for entry in entries:
        if entry.get("login_time") and entry.get("logout_time"):
            try:
                lp = entry["login_time"].split(":")
                op = entry["logout_time"].split(":")
                total_minutes += max(0, (int(op[0])*60+int(op[1])) - (int(lp[0])*60+int(lp[1])))
            except (ValueError, IndexError):
                pass
    total_hours = round(total_minutes / 60, 2)
    status = "full_day" if total_hours >= 8 else "half_day" if total_hours >= 4 else "short_day"

    await db.se_attendance.update_one(
        {"_id": record["_id"]},
        {"$set": {"entries": entries, "total_hours": total_hours, "status": status, "updated_at": now_iso}}
    )
    return {"status": "auto_logout", "message": "Auto-logged out due to GPS being turned off"}


@router.get("/attendance/live-locations")
async def get_live_se_locations(user: User = Depends(get_current_user)):
    """PM/Planning: Get latest location of all currently active SEs"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Get all attendance records with active sessions
    active_records = await db.se_attendance.find({"date": today}, {"_id": 0}).to_list(200)

    live_ses = []
    for rec in active_records:
        for entry in rec.get("entries", []):
            if not entry.get("logout_time"):
                # This SE is currently active - get latest ping
                latest_ping = await db.se_location_pings.find_one(
                    {"user_id": rec["user_id"], "date": today},
                    {"_id": 0},
                    sort=[("timestamp", -1)]
                )
                se_lat = latest_ping.get("latitude") if latest_ping else entry.get("login_lat")
                se_lng = latest_ping.get("longitude") if latest_ping else entry.get("login_lng")

                # Check distance from project
                dist_km = None
                is_out_of_range = False
                project = await db.projects.find_one({"project_id": entry["project_id"]}, {"_id": 0, "latitude": 1, "longitude": 1})
                if project and project.get("latitude") and project.get("longitude") and se_lat and se_lng:
                    dist_km = round(haversine_km(se_lat, se_lng, float(project["latitude"]), float(project["longitude"])), 1)
                    is_out_of_range = dist_km > 5

                live_ses.append({
                    "user_id": rec["user_id"],
                    "user_name": rec.get("user_name", ""),
                    "project_id": entry["project_id"],
                    "project_name": entry.get("project_name", ""),
                    "login_time": entry["login_time"],
                    "latitude": se_lat,
                    "longitude": se_lng,
                    "last_ping": latest_ping.get("timestamp") if latest_ping else None,
                    "distance_km": dist_km,
                    "is_out_of_range": is_out_of_range,
                })
                break  # Only one active session per SE

    # Get all projects with GPS for map context
    projects = await db.projects.find(
        {"latitude": {"$exists": True, "$ne": None}},
        {"_id": 0, "project_id": 1, "name": 1, "location": 1, "latitude": 1, "longitude": 1}
    ).to_list(100)

    return {
        "active_engineers": live_ses,
        "projects": projects,
        "total_active": len(live_ses),
    }



# ============ CURING VIDEO MANAGEMENT ============

@router.post("/site-engineer/curing-video")
async def create_curing_video_record(request: Request, user: User = Depends(get_current_user)):
    """Create a curing video record for a project"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can record curing videos")

    data = await request.json()
    project_id = data.get("project_id")
    curing_done = data.get("curing_done", False)

    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1, "client_name": 1, "client_phone": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from datetime import datetime, timezone
    record_id = f"cur_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    record = {
        "record_id": record_id,
        "project_id": project_id,
        "project_name": project.get("name", ""),
        "client_name": project.get("client_name", ""),
        "client_phone": project.get("client_phone", ""),
        "engineer_id": user.user_id,
        "engineer_name": user.name,
        "curing_done": curing_done,
        "whatsapp_sent": False,
        "date_time": now.isoformat(),
        "created_at": now.isoformat(),
    }

    await db.curing_video_records.insert_one(record)
    record.pop("_id", None)
    return record


@router.patch("/site-engineer/curing-video/{record_id}/whatsapp-sent")
async def mark_whatsapp_sent(record_id: str, user: User = Depends(get_current_user)):
    """Mark a curing video record's WhatsApp status as sent"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can update curing video records")

    result = await db.curing_video_records.update_one(
        {"record_id": record_id, "engineer_id": user.user_id},
        {"$set": {"whatsapp_sent": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "ok", "record_id": record_id, "whatsapp_sent": True}


@router.get("/site-engineer/curing-video/history")
async def get_curing_video_history(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get curing video history for the logged-in SE"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can view curing video history")

    query = {"engineer_id": user.user_id}
    if project_id:
        query["project_id"] = project_id

    records = await db.curing_video_records.find(query, {"_id": 0}).sort("date_time", -1).to_list(200)
    return records


# ============ PETROL ALLOWANCE ============

@router.post("/site-engineer/petrol-allowance")
async def request_petrol_allowance(request: Request, user: User = Depends(get_current_user)):
    """SE requests petrol allowance - goes directly to Accountant"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can request petrol allowance")
    data = await request.json()
    amount = data.get("amount")
    km = data.get("km")
    if not amount or float(amount) <= 0:
        raise HTTPException(status_code=400, detail="Amount is required")
    if not km or float(km) <= 0:
        raise HTTPException(status_code=400, detail="KM is required")

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "allowance_id": f"pa_{uuid.uuid4().hex[:8]}",
        "requested_by": user.user_id,
        "requested_by_name": user.name,
        "amount": float(amount),
        "km": float(km),
        "date": now[:10],
        "status": "requested",  # requested → approved / rejected
        "created_at": now,
    }
    await db.petrol_allowance.insert_one(record)
    record.pop("_id", None)

    # Notify accountants
    accountants = await db.users.find({"role": "accountant", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
    for acc in accountants:
        await create_notification(acc["user_id"], f"Petrol allowance request: ₹{float(amount):,.0f} ({float(km)} km) by {user.name}")

    return record


@router.get("/site-engineer/petrol-allowance/history")
async def get_petrol_allowance_history(user: User = Depends(get_current_user)):
    """Get petrol allowance history for SE"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {"requested_by": user.user_id} if user.role != UserRole.SUPER_ADMIN else {}
    records = await db.petrol_allowance.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return records


@router.get("/accountant/petrol-allowance")
async def get_petrol_allowance_for_accountant(user: User = Depends(get_current_user)):
    """Accountant gets all petrol allowance requests"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can access")
    records = await db.petrol_allowance.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return records


@router.patch("/accountant/petrol-allowance/{allowance_id}/approve")
async def approve_petrol_allowance(allowance_id: str, user: User = Depends(get_current_user)):
    """Accountant approves petrol allowance"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")
    rec = await db.petrol_allowance.find_one({"allowance_id": allowance_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    if rec["status"] != "requested":
        raise HTTPException(status_code=400, detail=f"Cannot approve - status is {rec['status']}")
    now = datetime.now(timezone.utc).isoformat()
    await db.petrol_allowance.update_one(
        {"allowance_id": allowance_id},
        {"$set": {"status": "approved", "approved_by": user.user_id, "approved_by_name": user.name, "approved_at": now}}
    )
    await create_notification(rec["requested_by"], f"Petrol allowance ₹{rec['amount']:,.0f} approved by {user.name}")
    return {"message": "Approved", "status": "approved"}


@router.patch("/accountant/petrol-allowance/{allowance_id}/reject")
async def reject_petrol_allowance(allowance_id: str, request: Request, user: User = Depends(get_current_user)):
    """Accountant rejects petrol allowance"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")
    rec = await db.petrol_allowance.find_one({"allowance_id": allowance_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass
    await db.petrol_allowance.update_one(
        {"allowance_id": allowance_id},
        {"$set": {"status": "rejected", "rejected_by": user.user_id, "rejection_reason": data.get("reason", ""), "rejected_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_notification(rec["requested_by"], f"Petrol allowance ₹{rec['amount']:,.0f} rejected: {data.get('reason', 'No reason')}")
    return {"message": "Rejected"}


# ==================== LABOUR ADVANCE REQUESTS (Planning → PM → GM → Accountant) ====================

class LabourAdvanceCreate(BaseModel):
    project_id: str
    work_order_id: str
    stage_id: str
    stage_name: str
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    amount: float
    request_date: Optional[str] = None  # YYYY-MM-DD
    reason: str


class LabourAdvanceApprovalBody(BaseModel):
    remarks: Optional[str] = ""


@router.post("/labour-advance-requests")
async def create_labour_advance(data: LabourAdvanceCreate, user: User = Depends(get_current_user)):
    """PLANNING raises a labour advance request for a Work Order stage.
    Flow: pending_pm -> pending_gm -> pending_accountant -> approved.
    """
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can raise labour advance requests")
    if not data.amount or data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if not (data.reason or "").strip():
        raise HTTPException(status_code=400, detail="Reason is required")
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    now = datetime.now(timezone.utc).isoformat()
    req = {
        "request_id": f"lar_{uuid.uuid4().hex[:10]}",
        "project_id": data.project_id,
        "project_name": project.get("name", ""),
        "work_order_id": data.work_order_id,
        "stage_id": data.stage_id,
        "stage_name": data.stage_name,
        "contractor_id": data.contractor_id,
        "contractor_name": data.contractor_name or "",
        "amount": float(data.amount),
        "request_date": data.request_date or now[:10],
        "reason": data.reason.strip(),
        "status": "pending_pm",
        "requested_by": user.user_id,
        "requested_by_name": user.name,
        "created_at": now,
        "pm_approved_by": None, "pm_approved_at": None, "pm_remarks": "",
        "gm_approved_by": None, "gm_approved_at": None, "gm_remarks": "",
        "accountant_approved_by": None, "accountant_approved_at": None, "accountant_remarks": "",
    }
    await db.labour_advance_requests.insert_one(req)
    # Notify PMs
    pms = await db.users.find({"role": {"$in": ["project_manager", "associate_pm"]}, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    for pm in pms:
        await create_notification(pm["user_id"], f"New labour advance ₹{req['amount']:,.0f} pending your approval — {req['project_name']}")
    req.pop("_id", None)
    return req


@router.get("/labour-advance-requests")
async def list_labour_advance_requests(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Role-aware list:
    - PLANNING / SUPER_ADMIN: sees everything (own raised + all stages)
    - PM: sees status=pending_pm + their own approved
    - GM: sees status=pending_gm
    - ACCOUNTANT: sees status=pending_accountant
    """
    role = user.role
    if status:
        q = {"status": status}
    elif role in (UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM):
        q = {"status": {"$in": ["pending_pm", "pending_gm", "pending_accountant", "approved", "rejected"]}}
    elif role == UserRole.GENERAL_MANAGER:
        q = {"status": {"$in": ["pending_gm", "pending_accountant", "approved", "rejected"]}}
    elif role == UserRole.ACCOUNTANT:
        q = {"status": {"$in": ["pending_accountant", "approved", "rejected"]}}
    else:
        q = {}
    docs = await db.labour_advance_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


async def _advance_to_next_status(request_id: str, current_status: str, next_status: str, user: User, remarks: str, role_field_prefix: str):
    now = datetime.now(timezone.utc).isoformat()
    upd = {
        "status": next_status,
        f"{role_field_prefix}_approved_by": user.user_id,
        f"{role_field_prefix}_approved_by_name": user.name,
        f"{role_field_prefix}_approved_at": now,
        f"{role_field_prefix}_remarks": remarks,
    }
    await db.labour_advance_requests.update_one({"request_id": request_id}, {"$set": upd})


@router.patch("/labour-advance-requests/{request_id}/approve")
async def approve_labour_advance(request_id: str, data: LabourAdvanceApprovalBody, user: User = Depends(get_current_user)):
    req = await db.labour_advance_requests.find_one({"request_id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    role = user.role
    status = req["status"]
    if status == "pending_pm" and role in (UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN):
        await _advance_to_next_status(request_id, status, "pending_gm", user, data.remarks, "pm")
        gms = await db.users.find({"role": "general_manager", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
        for gm in gms:
            await create_notification(gm["user_id"], f"Labour advance ₹{req['amount']:,.0f} awaiting your approval — {req['project_name']}")
        return {"message": "Approved by PM, awaiting GM", "status": "pending_gm"}
    if status == "pending_gm" and role in (UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN):
        await _advance_to_next_status(request_id, status, "pending_accountant", user, data.remarks, "gm")
        accs = await db.users.find({"role": "accountant", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(10)
        for acc in accs:
            await create_notification(acc["user_id"], f"Labour advance ₹{req['amount']:,.0f} awaiting accountant approval — {req['project_name']}")
        return {"message": "Approved by GM, awaiting Accountant", "status": "pending_accountant"}
    if status == "pending_accountant" and role in (UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN):
        await _advance_to_next_status(request_id, status, "approved", user, data.remarks, "accountant")
        # On final approval: create a payment-schedule entry visible under the project
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.payment_stages.insert_one({
            "stage_id": f"ps_{uuid.uuid4().hex[:10]}",
            "project_id": req["project_id"],
            "stage_name": f"Labour Advance — {req['stage_name']} ({req.get('contractor_name') or 'Labour'})",
            "percentage": 0,
            "amount": float(req["amount"]),
            "amount_received": 0,
            "status": "approved",
            "workflow_status": "approved",
            "notes": f"Labour advance — {req.get('reason','')}",
            "linked_labour_advance_id": request_id,
            "linked_work_order_id": req["work_order_id"],
            "linked_wo_stage_id": req["stage_id"],
            "created_by": user.user_id,
            "created_at": now_iso,
        })
        # Recorded expense for accountant visibility
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{uuid.uuid4().hex[:10]}",
            "project_id": req["project_id"],
            "project_name": req["project_name"],
            "category": "labour_advance",
            "vendor_name": req.get("contractor_name") or "Labour",
            "amount": float(req["amount"]),
            "date": req.get("request_date") or now_iso[:10],
            "description": f"Labour advance — {req['stage_name']}",
            "remarks": req.get("reason", ""),
            "payment_mode": "pending",
            "status": "approved",
            "source": "labour_advance",
            "linked_labour_advance_id": request_id,
            "created_by": user.user_id,
            "created_at": now_iso,
        })
        # Cashflow Engine: drain Direct pool for this labour advance
        try:
            from routes.cashflow import allocate_expense as _cf_allocate_expense
            await _cf_allocate_expense(
                expense_id=request_id,
                project_id=req.get("project_id"),
                amount=float(req["amount"]),
                category="labour_advance",
                project_name=req.get("project_name", ""),
                source="labour_advance_approved",
            )
        except Exception as e:
            import logging; logging.getLogger(__name__).warning(f"Cashflow expense alloc skipped: {e}")
        # Auto-close the WO stage if cumulative approved advances >= stage amount
        await _maybe_auto_close_wo_stage(req["project_id"], req["work_order_id"], req["stage_id"], user)
        await create_notification(req["requested_by"], f"Labour advance ₹{req['amount']:,.0f} for {req['stage_name']} has been fully approved")
        return {"message": "Fully approved", "status": "approved"}
    raise HTTPException(status_code=403, detail=f"Cannot approve in current status '{status}' with role '{role}'")


@router.patch("/labour-advance-requests/{request_id}/reject")
async def reject_labour_advance(request_id: str, data: LabourAdvanceApprovalBody, user: User = Depends(get_current_user)):
    req = await db.labour_advance_requests.find_one({"request_id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    role = user.role
    status = req["status"]
    allowed = (
        (status == "pending_pm" and role in (UserRole.PROJECT_MANAGER, UserRole.ASSOCIATE_PM, UserRole.SUPER_ADMIN))
        or (status == "pending_gm" and role in (UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN))
        or (status == "pending_accountant" and role in (UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN))
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed at this stage")
    now = datetime.now(timezone.utc).isoformat()
    await db.labour_advance_requests.update_one({"request_id": request_id}, {"$set": {
        "status": "rejected",
        "rejected_by": user.user_id,
        "rejected_by_name": user.name,
        "rejected_at": now,
        "rejection_reason": data.remarks or "Rejected without remarks",
    }})
    await create_notification(req["requested_by"], f"Labour advance ₹{req['amount']:,.0f} was rejected by {user.name}")
    return {"message": "Rejected", "status": "rejected"}

# ==================== END LABOUR ADVANCE REQUESTS ====================


async def _sum_approved_advances_for_stage(project_id: str, work_order_id: str, stage_id: str) -> float:
    """Sum of fully-approved labour advance amounts for a given WO stage."""
    cursor = db.labour_advance_requests.find(
        {
            "project_id": project_id,
            "work_order_id": work_order_id,
            "stage_id": stage_id,
            "status": "approved",
        },
        {"_id": 0, "amount": 1},
    )
    total = 0.0
    async for d in cursor:
        try:
            total += float(d.get("amount") or 0)
        except (TypeError, ValueError):
            continue
    return total


async def _maybe_auto_close_wo_stage(project_id: str, work_order_id: str, stage_id: str, user: User) -> None:
    """If cumulative approved advances >= stage amount, mark the WO stage as approved (closed).

    Tries both `project_work_orders` and `labour_work_orders` (legacy / dual storage)."""
    approved_sum = await _sum_approved_advances_for_stage(project_id, work_order_id, stage_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    for coll_name in ("project_work_orders", "labour_work_orders"):
        coll = db[coll_name]
        wo = await coll.find_one({"work_order_id": work_order_id, "project_id": project_id}, {"_id": 0})
        if not wo:
            continue
        stages = wo.get("stages") or []
        changed = False
        for st in stages:
            if st.get("stage_id") != stage_id:
                continue
            stage_amount = float(st.get("amount") or 0)
            if stage_amount > 0 and approved_sum + 0.5 >= stage_amount and st.get("status") != "approved":
                st["status"] = "approved"
                st["auto_closed_by_advance"] = True
                st["auto_closed_at"] = now_iso
                st["approved_amount"] = max(float(st.get("approved_amount") or 0), approved_sum)
                changed = True
        if changed:
            await coll.update_one(
                {"work_order_id": work_order_id, "project_id": project_id},
                {"$set": {"stages": stages}},
            )


async def attach_advance_summary_to_work_orders(project_id: str, work_orders: list) -> list:
    """Mutates and returns `work_orders` with `advance_approved_total`, `advance_pending_total`,
    `advance_balance` on each `stages[].`."""
    if not work_orders:
        return work_orders
    stage_ids = []
    for wo in work_orders:
        for st in (wo.get("stages") or []):
            sid = st.get("stage_id")
            if sid:
                stage_ids.append(sid)
    if not stage_ids:
        return work_orders
    cursor = db.labour_advance_requests.find(
        {"project_id": project_id, "stage_id": {"$in": stage_ids}},
        {"_id": 0, "stage_id": 1, "amount": 1, "status": 1},
    )
    approved_map: Dict[str, float] = {}
    pending_map: Dict[str, float] = {}
    async for d in cursor:
        sid = d.get("stage_id")
        amt = float(d.get("amount") or 0)
        if d.get("status") == "approved":
            approved_map[sid] = approved_map.get(sid, 0.0) + amt
        elif d.get("status") in ("pending_pm", "pending_gm", "pending_accountant"):
            pending_map[sid] = pending_map.get(sid, 0.0) + amt
    for wo in work_orders:
        for st in (wo.get("stages") or []):
            sid = st.get("stage_id")
            approved = round(approved_map.get(sid, 0.0), 2)
            pending = round(pending_map.get(sid, 0.0), 2)
            amount = float(st.get("amount") or 0)
            st["advance_approved_total"] = approved
            st["advance_pending_total"] = pending
            st["advance_balance"] = max(0.0, round(amount - approved, 2))
    return work_orders

