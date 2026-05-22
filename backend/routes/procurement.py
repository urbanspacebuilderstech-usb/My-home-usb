"""
Procurement Routes - Procurement Board, Enhanced Flow, Credit Ledger, Vendor Enhanced, Transit, Reports, Packages, Labour Contractors
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
import random
import logging
from bson import ObjectId

import resend

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()

SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')
resend.api_key = os.environ.get('RESEND_API_KEY', '')

# ==================== PROCUREMENT BOARD MODULE ====================

class ProcurementOrderStatus(str, Enum):
    PENDING = "pending"  # Planning approved, waiting for procurement pricing
    PRICING_IN_PROGRESS = "pricing_in_progress"  # Procurement adding quotes
    WAITING_ACCOUNTS = "waiting_accounts"  # Submitted for Accounts approval
    ACCOUNTS_APPROVED = "accounts_approved"  # Ready for payment/delivery
    ACCOUNTS_REJECTED = "accounts_rejected"  # Rejected by Accounts
    PAID = "paid"  # Payment completed
    CREDIT = "credit"  # Credit term
    DELIVERED_PARTIAL = "delivered_partial"
    DELIVERED_COMPLETED = "delivered_completed"


class VendorQuote(BaseModel):
    quote_id: str = Field(default_factory=lambda: f"quote_{uuid.uuid4().hex[:12]}")
    vendor_id: str
    vendor_name: str
    unit_price: float
    quantity: float
    transport_cost: float = 0
    discount: float = 0
    total: float = 0  # (unit_price * quantity) + transport_cost - discount
    is_selected: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProcurementPricing(BaseModel):
    pricing_id: str = Field(default_factory=lambda: f"prc_{uuid.uuid4().hex[:12]}")
    request_id: str  # Links to MaterialRequest
    request_type: str = "material_request"  # or "material_expense"
    project_id: str
    project_name: str
    material_id: str
    material_name: str
    requested_qty: float
    unit: str
    site_engineer_id: str
    site_engineer_name: str
    vendor_quotes: List[Dict] = []  # List of VendorQuote objects
    selected_vendor_id: Optional[str] = None
    selected_vendor_name: Optional[str] = None
    final_amount: float = 0
    status: str = "pending"
    submitted_by: Optional[str] = None
    submitted_at: Optional[datetime] = None
    accounts_action: Optional[str] = None  # approved/rejected
    accounts_by: Optional[str] = None
    accounts_at: Optional[datetime] = None
    accounts_comment: Optional[str] = None
    payment_status: str = "pending"  # pending, paid, credit, partial
    paid_amount: float = 0
    delivery_status: str = "pending"  # pending, partial, completed
    delivered_qty: float = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorPriceHistory(BaseModel):
    history_id: str = Field(default_factory=lambda: f"vph_{uuid.uuid4().hex[:12]}")
    vendor_id: str
    vendor_name: str
    material_id: str
    material_name: str
    unit_price: float
    quantity: float
    transport_cost: float = 0
    discount: float = 0
    total: float = 0
    project_id: str
    project_name: str
    pricing_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProcurementLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"plog_{uuid.uuid4().hex[:12]}")
    pricing_id: str
    action: str  # add_quote, update_quote, select_vendor, submit, approve, reject, etc.
    user_id: str
    user_name: str
    details: Dict = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AddVendorQuoteInput(BaseModel):
    vendor_id: str
    vendor_name: str
    unit_price: float
    quantity: float
    transport_cost: float = 0
    discount: float = 0


class NewVendorInput(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    payment_terms: str = "full"  # full, advance, credit


@router.get("/procurement/dashboard")
async def get_procurement_dashboard(user: User = Depends(get_current_user)):
    """Get procurement dashboard metrics"""
    allowed = [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Count pending approval (planning approved material requests waiting for procurement approval)
    pending_approval = await db.material_requests.count_documents({
        "status": "planning_approved"
    })

    # Count approved by procurement, ready for vendor selection
    pending_requests = await db.material_requests.count_documents({
        "status": {"$in": ["procurement_approved", "accounts_rejected"]}
    })
    
    # Count pricing in progress
    pricing_in_progress = await db.procurement_pricing.count_documents({
        "status": "pricing_in_progress"
    })
    
    # Count waiting for accounts
    waiting_accounts = await db.procurement_pricing.count_documents({
        "status": "waiting_accounts"
    })
    
    # Count approved orders
    approved_orders = await db.procurement_pricing.count_documents({
        "status": {"$in": ["accounts_approved", "paid", "credit"]}
    })
    
    # Count delivered
    delivered_orders = await db.procurement_pricing.count_documents({
        "delivery_status": {"$in": ["partial", "completed"]}
    })
    
    # Total value in pricing
    pricing_docs = await db.procurement_pricing.find(
        {"status": {"$in": ["pricing_in_progress", "waiting_accounts"]}},
        {"final_amount": 1, "_id": 0}
    ).to_list(1000)
    total_in_pricing = sum(p.get("final_amount", 0) for p in pricing_docs)
    
    # Credit outstanding
    credit_docs = await db.procurement_pricing.find(
        {"payment_status": "credit"},
        {"final_amount": 1, "paid_amount": 1, "_id": 0}
    ).to_list(1000)
    credit_outstanding = sum(p.get("final_amount", 0) - p.get("paid_amount", 0) for p in credit_docs)
    
    # Vendor-wise spend (top 5)
    pipeline = [
        {"$match": {"status": {"$in": ["accounts_approved", "paid", "credit"]}}},
        {"$group": {"_id": "$selected_vendor_name", "total_spend": {"$sum": "$final_amount"}}},
        {"$sort": {"total_spend": -1}},
        {"$limit": 5}
    ]
    vendor_spend = await db.procurement_pricing.aggregate(pipeline).to_list(5)
    
    return {
        "pending_approval": pending_approval,
        "pending_requests": pending_requests,
        "pricing_in_progress": pricing_in_progress,
        "waiting_accounts": waiting_accounts,
        "approved_orders": approved_orders,
        "delivered_orders": delivered_orders,
        "total_in_pricing": total_in_pricing,
        "credit_outstanding": credit_outstanding,
        "vendor_spend": [{"vendor": v["_id"] or "Unknown", "amount": v["total_spend"]} for v in vendor_spend]
    }


@router.get("/procurement/requests")
async def get_procurement_requests(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material requests by status for procurement board"""
    view_roles = [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.SR_SITE_ENGINEER, UserRole.SITE_ENGINEER]
    if user.role not in view_roles:
        raise HTTPException(status_code=403, detail="Access denied")
    
    results = []
    
    if status == "pending_approval" or status is None:
        # Planning-approved requests waiting for Procurement approval
        pending_approval = await db.material_requests.find({
            "status": "planning_approved"
        }, {"_id": 0}).sort("created_at", -1).to_list(1000)
        for req in pending_approval:
            project = await db.projects.find_one({"project_id": req.get("project_id")}, {"_id": 0, "name": 1})
            engineer = await db.users.find_one({"user_id": req.get("site_engineer_id")}, {"_id": 0, "name": 1})
            req["project_name"] = project.get("name") if project else "Unknown"
            req["site_engineer_name"] = engineer.get("name") if engineer else "Unknown"
            req["procurement_status"] = "pending_approval"
        if status == "pending_approval":
            return pending_approval
        results.extend(pending_approval)

    if status == "pending" or status is None:
        # Procurement-approved requests ready for vendor selection
        existing_pricing_ids = await db.procurement_pricing.distinct("request_id")
        pending_requests = await db.material_requests.find({
            "status": {"$in": ["procurement_approved", "accounts_rejected"]},
            "request_id": {"$nin": existing_pricing_ids}
        }, {"_id": 0}).sort("created_at", -1).to_list(1000)
        
        for req in pending_requests:
            project = await db.projects.find_one({"project_id": req.get("project_id")}, {"_id": 0, "name": 1})
            engineer = await db.users.find_one({"user_id": req.get("site_engineer_id")}, {"_id": 0, "name": 1})
            req["project_name"] = project.get("name") if project else "Unknown"
            req["site_engineer_name"] = engineer.get("name") if engineer else "Unknown"
            req["procurement_status"] = "pending"
        
        if status == "pending":
            return pending_requests
        results.extend(pending_requests)
    
    # Get from procurement_pricing collection for other statuses
    query = {}
    if status == "pricing_in_progress":
        query["status"] = "pricing_in_progress"
    elif status == "waiting_accounts":
        query["status"] = "waiting_accounts"
    elif status == "approved":
        query["status"] = {"$in": ["accounts_approved", "paid", "credit"]}
    elif status == "delivered":
        query["delivery_status"] = {"$in": ["partial", "completed"]}
    
    if query:
        pricing_docs = await db.procurement_pricing.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        results.extend(pricing_docs)
    elif status is None:
        # Get all
        all_pricing = await db.procurement_pricing.find({}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        results.extend(all_pricing)
    
    return results


@router.post("/procurement/start-pricing/{request_id}")
async def start_pricing(request_id: str, user: User = Depends(get_current_user)):
    """Start pricing process for a material request"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can start pricing")
    
    # Check if already in pricing
    existing = await db.procurement_pricing.find_one({"request_id": request_id})
    if existing:
        raise HTTPException(status_code=400, detail="Pricing already started for this request")
    
    # Get the material request
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "planning_approved":
        raise HTTPException(status_code=400, detail="Request must be planning approved")
    
    # Get project and engineer info
    project = await db.projects.find_one({"project_id": request.get("project_id")}, {"_id": 0, "name": 1})
    engineer = await db.users.find_one({"user_id": request.get("site_engineer_id")}, {"_id": 0, "name": 1})
    
    # Create procurement pricing record
    pricing = ProcurementPricing(
        request_id=request_id,
        project_id=request.get("project_id"),
        project_name=project.get("name") if project else "Unknown",
        material_id=request.get("material_id"),
        material_name=request.get("material_name"),
        requested_qty=request.get("quantity"),
        unit=request.get("unit"),
        site_engineer_id=request.get("site_engineer_id"),
        site_engineer_name=engineer.get("name") if engineer else "Unknown",
        status="pricing_in_progress"
    )
    
    pricing_dict = pricing.model_dump()
    pricing_dict["created_at"] = pricing_dict["created_at"].isoformat()
    pricing_dict["updated_at"] = pricing_dict["updated_at"].isoformat()
    
    await db.procurement_pricing.insert_one(pricing_dict)
    
    # Create log
    log = ProcurementLog(
        pricing_id=pricing.pricing_id,
        action="start_pricing",
        user_id=user.user_id,
        user_name=user.name,
        details={"request_id": request_id, "material": request.get("material_name")}
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    await db.procurement_logs.insert_one(log_dict)
    
    return {"pricing_id": pricing.pricing_id, "message": "Pricing started"}


@router.get("/procurement/pricing/{pricing_id}")
async def get_pricing_details(pricing_id: str, user: User = Depends(get_current_user)):
    """Get detailed pricing information"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    # Get original request details
    request = await db.material_requests.find_one({"request_id": pricing.get("request_id")}, {"_id": 0})
    
    # Get vendor list for dropdown
    vendors = await db.vendor_master.find({"is_active": True}, {"_id": 0}).to_list(1000)
    
    # Get price history for this material
    price_history = await db.vendor_price_history.find(
        {"material_id": pricing.get("material_id")},
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    return {
        "pricing": pricing,
        "original_request": request,
        "vendors": vendors,
        "price_history": price_history
    }


@router.post("/procurement/pricing/{pricing_id}/add-quote")
async def add_vendor_quote(pricing_id: str, quote_input: AddVendorQuoteInput, user: User = Depends(get_current_user)):
    """Add a vendor quote for comparison"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can add quotes")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    if pricing.get("status") not in ["pricing_in_progress", "pending"]:
        raise HTTPException(status_code=400, detail="Cannot add quotes - pricing not in progress")
    
    # Calculate total
    total = (quote_input.unit_price * quote_input.quantity) + quote_input.transport_cost - quote_input.discount
    
    quote = {
        "quote_id": f"quote_{uuid.uuid4().hex[:12]}",
        "vendor_id": quote_input.vendor_id,
        "vendor_name": quote_input.vendor_name,
        "unit_price": quote_input.unit_price,
        "quantity": quote_input.quantity,
        "transport_cost": quote_input.transport_cost,
        "discount": quote_input.discount,
        "total": total,
        "is_selected": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {
            "$push": {"vendor_quotes": quote},
            "$set": {
                "status": "pricing_in_progress",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create log
    log = ProcurementLog(
        pricing_id=pricing_id,
        action="add_quote",
        user_id=user.user_id,
        user_name=user.name,
        details={"vendor": quote_input.vendor_name, "total": total}
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    await db.procurement_logs.insert_one(log_dict)
    
    return {"message": "Quote added", "quote": quote}


@router.delete("/procurement/pricing/{pricing_id}/quote/{quote_id}")
async def remove_vendor_quote(pricing_id: str, quote_id: str, user: User = Depends(get_current_user)):
    """Remove a vendor quote"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can remove quotes")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    if pricing.get("status") not in ["pricing_in_progress", "pending"]:
        raise HTTPException(status_code=400, detail="Cannot remove quotes - pricing locked")
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {
            "$pull": {"vendor_quotes": {"quote_id": quote_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {"message": "Quote removed"}


@router.patch("/procurement/pricing/{pricing_id}/select-vendor")
async def select_vendor(pricing_id: str, vendor_id: str, user: User = Depends(get_current_user)):
    """Select a vendor as the final choice"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can select vendor")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    if pricing.get("status") not in ["pricing_in_progress", "pending"]:
        raise HTTPException(status_code=400, detail="Cannot select vendor - pricing locked")
    
    # Find the selected quote
    selected_quote = None
    updated_quotes = []
    for quote in pricing.get("vendor_quotes", []):
        quote["is_selected"] = quote["vendor_id"] == vendor_id
        if quote["is_selected"]:
            selected_quote = quote
        updated_quotes.append(quote)
    
    if not selected_quote:
        raise HTTPException(status_code=400, detail="Vendor quote not found")
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {
            "$set": {
                "vendor_quotes": updated_quotes,
                "selected_vendor_id": vendor_id,
                "selected_vendor_name": selected_quote.get("vendor_name"),
                "final_amount": selected_quote.get("total"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Create log
    log = ProcurementLog(
        pricing_id=pricing_id,
        action="select_vendor",
        user_id=user.user_id,
        user_name=user.name,
        details={"vendor": selected_quote.get("vendor_name"), "amount": selected_quote.get("total")}
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    await db.procurement_logs.insert_one(log_dict)
    
    return {"message": "Vendor selected", "final_amount": selected_quote.get("total")}


@router.post("/procurement/pricing/{pricing_id}/submit")
async def submit_for_accounts(pricing_id: str, user: User = Depends(get_current_user)):
    """Submit pricing for accounts approval"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can submit")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    if not pricing.get("selected_vendor_id"):
        raise HTTPException(status_code=400, detail="Must select a vendor before submitting")
    
    if not pricing.get("vendor_quotes"):
        raise HTTPException(status_code=400, detail="Must add at least one quote before submitting")
    
    # Update status
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {
            "$set": {
                "status": "waiting_accounts",
                "submitted_by": user.user_id,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Update original material request status
    await db.material_requests.update_one(
        {"request_id": pricing.get("request_id")},
        {
            "$set": {
                "status": "pending_accounts_approval",
                "procurement_approved_by": user.user_id,
                "procurement_approved_at": datetime.now(timezone.utc).isoformat(),
                "procurement_pricing": pricing.get("final_amount"),
                "vendor_id": pricing.get("selected_vendor_id")
            }
        }
    )
    
    # Save vendor price history
    selected_quote = None
    for q in pricing.get("vendor_quotes", []):
        if q.get("is_selected"):
            selected_quote = q
            break
    
    if selected_quote:
        history = VendorPriceHistory(
            vendor_id=selected_quote.get("vendor_id"),
            vendor_name=selected_quote.get("vendor_name"),
            material_id=pricing.get("material_id"),
            material_name=pricing.get("material_name"),
            unit_price=selected_quote.get("unit_price"),
            quantity=selected_quote.get("quantity"),
            transport_cost=selected_quote.get("transport_cost", 0),
            discount=selected_quote.get("discount", 0),
            total=selected_quote.get("total"),
            project_id=pricing.get("project_id"),
            project_name=pricing.get("project_name"),
            pricing_id=pricing_id
        )
        history_dict = history.model_dump()
        history_dict["created_at"] = history_dict["created_at"].isoformat()
        await db.vendor_price_history.insert_one(history_dict)
    
    # Notify accounts
    accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
    for au in accounts_users:
        await create_notification(
            au["user_id"],
            f"Material order ready for approval: {pricing.get('material_name')} - ₹{pricing.get('final_amount')}"
        )
    
    # Create log
    log = ProcurementLog(
        pricing_id=pricing_id,
        action="submit_for_accounts",
        user_id=user.user_id,
        user_name=user.name,
        details={"amount": pricing.get("final_amount"), "vendor": pricing.get("selected_vendor_name")}
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    await db.procurement_logs.insert_one(log_dict)
    
    return {"message": "Submitted for accounts approval"}


@router.patch("/procurement/pricing/{pricing_id}/accounts-action")
async def accounts_action_on_procurement(
    pricing_id: str,
    action: str,  # approve or reject
    comment: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Accounts approval/rejection"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve/reject")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    if pricing.get("status") != "waiting_accounts":
        raise HTTPException(status_code=400, detail="Invalid status for accounts action")
    
    new_status = "accounts_approved" if action == "approve" else "accounts_rejected"
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {
            "$set": {
                "status": new_status,
                "accounts_action": action,
                "accounts_by": user.user_id,
                "accounts_at": datetime.now(timezone.utc).isoformat(),
                "accounts_comment": comment,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Update original material request
    request_status = "accountant_approved" if action == "approve" else "rejected"
    update_data = {
        "status": request_status,
        "accountant_approved_by": user.user_id if action == "approve" else None,
        "accountant_approved_at": datetime.now(timezone.utc).isoformat() if action == "approve" else None
    }
    if action == "reject":
        update_data["rejection_reason"] = comment
    
    await db.material_requests.update_one(
        {"request_id": pricing.get("request_id")},
        {"$set": update_data}
    )
    
    # Notify procurement
    proc_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in proc_users:
        status_text = "approved" if action == "approve" else f"rejected: {comment}"
        await create_notification(
            pu["user_id"],
            f"Material order {status_text}: {pricing.get('material_name')}"
        )
    
    # Create log
    log = ProcurementLog(
        pricing_id=pricing_id,
        action=f"accounts_{action}",
        user_id=user.user_id,
        user_name=user.name,
        details={"comment": comment}
    )
    log_dict = log.model_dump()
    log_dict["created_at"] = log_dict["created_at"].isoformat()
    await db.procurement_logs.insert_one(log_dict)
    
    return {"message": f"Order {action}d"}


@router.patch("/procurement/pricing/{pricing_id}/payment-status")
async def update_payment_status(
    pricing_id: str,
    payment_status: str,  # paid, credit, partial
    paid_amount: Optional[float] = None,
    user: User = Depends(get_current_user)
):
    """Update payment status"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can update payment status")
    
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    update_data = {
        "payment_status": payment_status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if payment_status == "paid":
        update_data["paid_amount"] = pricing.get("final_amount")
        update_data["status"] = "paid"
    elif payment_status == "credit":
        update_data["status"] = "credit"
    elif payment_status == "partial" and paid_amount:
        update_data["paid_amount"] = paid_amount
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {"$set": update_data}
    )
    
    return {"message": "Payment status updated"}


@router.patch("/procurement/pricing/{pricing_id}/delivery-status")
async def update_delivery_status(
    pricing_id: str,
    delivery_status: str,  # partial, completed
    delivered_qty: Optional[float] = None,
    user: User = Depends(get_current_user)
):
    """Update delivery status (called when Site Engineer confirms receipt)"""
    pricing = await db.procurement_pricing.find_one({"pricing_id": pricing_id}, {"_id": 0})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    update_data = {
        "delivery_status": delivery_status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if delivered_qty:
        update_data["delivered_qty"] = delivered_qty
    elif delivery_status == "completed":
        update_data["delivered_qty"] = pricing.get("requested_qty")
    
    await db.procurement_pricing.update_one(
        {"pricing_id": pricing_id},
        {"$set": update_data}
    )
    
    return {"message": "Delivery status updated"}


@router.get("/procurement/logs/{pricing_id}")
async def get_procurement_logs(pricing_id: str, user: User = Depends(get_current_user)):
    """Get audit logs for a pricing record"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    logs = await db.procurement_logs.find(
        {"pricing_id": pricing_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return logs


@router.get("/procurement/price-history")
async def get_price_history(
    material_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get vendor price history"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    query = {}
    if material_id:
        query["material_id"] = material_id
    if vendor_id:
        query["vendor_id"] = vendor_id
    
    history = await db.vendor_price_history.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return history


@router.post("/procurement/add-vendor")
async def quick_add_vendor(vendor_input: NewVendorInput, user: User = Depends(get_current_user)):
    """Quick add vendor from pricing screen"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can add vendors")
    
    # Check for duplicate name
    existing = await db.vendor_master.find_one({"name": vendor_input.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Vendor with this name already exists")
    
    vendor_id = f"vnd_{uuid.uuid4().hex[:12]}"
    vendor_doc = {
        "vendor_id": vendor_id,
        "name": vendor_input.name,
        "contact_person": vendor_input.contact_person,
        "phone": vendor_input.phone,
        "email": vendor_input.email,
        "address": vendor_input.address,
        "gst_number": vendor_input.gst_number,
        "payment_terms": vendor_input.payment_terms,
        "credit_limit": 0,
        "credit_days": 0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.vendor_master.insert_one(vendor_doc)
    
    return {"vendor_id": vendor_id, "name": vendor_input.name, "message": "Vendor added"}


# ==================== ENHANCED PROCUREMENT FLOW ====================

class VendorSelectionInput(BaseModel):
    vendor_id: str
    vendor_name: str
    unit_rate: float
    transport_cost: float = 0
    discount: float = 0
    payment_type: str  # advance, full, credit, post_delivery
    advance_mode: str = "percentage"  # percentage or amount
    advance_amount: Optional[float] = None  # For advance with fixed amount
    advance_percent: Optional[float] = None  # For advance with percentage
    credit_period_days: int = 30  # Credit period in days
    expected_delivery: Optional[str] = None


class PaymentApprovalInput(BaseModel):
    action: str  # approve, reject
    payment_reference: Optional[str] = None
    remarks: Optional[str] = None


class DispatchInput(BaseModel):
    vehicle_number: str
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    estimated_arrival: Optional[str] = None


class ReceiptInput(BaseModel):
    received_qty: float
    gps_lat: float
    gps_lng: float
    photo_id: Optional[str] = None
    otp: str
    remarks: Optional[str] = None


@router.patch("/procurement/v2/approve/{request_id}")
async def procurement_approve_request(request_id: str, request: Request, user: User = Depends(get_current_user)):
    """Procurement approves a planning-approved material request"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can approve requests")

    req_doc = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req_doc:
        raise HTTPException(status_code=404, detail="Request not found")

    if req_doc.get("status") != "planning_approved":
        raise HTTPException(status_code=400, detail="Request must be planning-approved first")

    body = await request.json()
    action = body.get("action", "approve")

    if action == "reject":
        reason = body.get("reason", "")
        await db.material_requests.update_one(
            {"request_id": request_id},
            {"$set": {
                "status": "rejected",
                "rejection_reason": reason,
                "rejected_by": user.user_id,
                "procurement_rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        se_id = req_doc.get("site_engineer_id")
        if se_id:
            await create_notification(se_id, f"Material request rejected by Procurement: {req_doc.get('material_name')}")
        return {"message": "Request rejected by Procurement"}

    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "procurement_approved",
            "procurement_approved_by": user.user_id,
            "procurement_approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await create_notification(
        user.user_id,
        f"Material request approved: {req_doc.get('material_name')} x {req_doc.get('quantity')} — Ready for vendor selection"
    )

    return {"message": "Request approved by Procurement", "status": "procurement_approved"}


@router.post("/procurement/v2/select-vendor/{request_id}")
async def select_vendor_v2(request_id: str, data: VendorSelectionInput, user: User = Depends(get_current_user)):
    """Procurement selects vendor and pricing for material request"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can select vendors")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") not in ["procurement_approved", "accounts_rejected"]:
        raise HTTPException(status_code=400, detail="Request must be procurement-approved or rejected by accounts")
    
    # Get vendor details
    vendor = await db.vendor_master.find_one({"vendor_id": data.vendor_id}, {"_id": 0})
    
    # Calculate total
    quantity = request.get("quantity", 0)
    total_amount = (data.unit_rate * quantity) + data.transport_cost - data.discount
    
    # Determine status based on payment type
    if data.payment_type == "credit":
        new_status = "vendor_selected"  # Can generate PO directly for credit
    elif data.payment_type == "post_delivery":
        new_status = "vendor_selected"  # No upfront payment needed
    else:
        new_status = "waiting_payment"  # Needs accounts approval
    
    # Calculate advance/balance
    if data.payment_type == "advance":
        if data.advance_mode == "amount" and data.advance_amount:
            advance = data.advance_amount
        elif data.advance_percent:
            advance = round(total_amount * data.advance_percent / 100)
        else:
            advance = total_amount  # default: full advance
        balance = total_amount - advance
    elif data.payment_type == "full":
        advance = total_amount
        balance = 0
    elif data.payment_type == "post_delivery":
        advance = 0
        balance = total_amount
    else:  # credit
        advance = 0
        balance = total_amount

    update_data = {
        "vendor_id": data.vendor_id,
        "vendor_name": data.vendor_name,
        "unit_rate": data.unit_rate,
        "transport_cost": data.transport_cost,
        "discount": data.discount,
        "total_amount": total_amount,
        "payment_type": data.payment_type,
        "advance_mode": data.advance_mode,
        "advance_amount": advance,
        "advance_percent": data.advance_percent,
        "balance_amount": balance,
        "credit_period_days": data.credit_period_days if data.payment_type == "credit" else 0,
        "expected_delivery": data.expected_delivery,
        "status": new_status,
        "procurement_approved_by": user.user_id,
        "procurement_approved_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": update_data}
    )
    
    # Notify accounts if payment required
    if data.payment_type in ["advance", "full"]:
        accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(50)
        for acc in accountants:
            await create_notification(
                acc["user_id"],
                f"Payment approval needed: {request.get('material_name')} - ₹{total_amount:,.0f} ({data.payment_type})"
            )
    
    return {"message": "Vendor selected", "status": new_status, "total_amount": total_amount}


@router.patch("/procurement/v2/accounts-approval/{request_id}")
async def accounts_approval_v2(request_id: str, data: PaymentApprovalInput, user: User = Depends(get_current_user)):
    """Accounts approves or rejects payment for material request"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve payments")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "waiting_payment":
        raise HTTPException(status_code=400, detail="Request is not waiting for payment approval")
    
    if data.action == "approve":
        await db.material_requests.update_one(
            {"request_id": request_id},
            {"$set": {
                "status": "payment_approved",
                "accountant_approved_by": user.user_id,
                "accountant_approved_at": datetime.now(timezone.utc).isoformat(),
                "payment_reference": data.payment_reference
            }}
        )
        
        # Notify procurement
        proc_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(50)
        for pu in proc_users:
            await create_notification(pu["user_id"], f"Payment approved for {request.get('material_name')}. Ready for PO generation.")
        
        return {"message": "Payment approved", "status": "payment_approved"}
    else:
        await db.material_requests.update_one(
            {"request_id": request_id},
            {"$set": {
                "status": "accounts_rejected",
                "rejection_reason": data.remarks,
                "rejected_by": user.user_id,
                "rejected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        # Notify procurement to review
        proc_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(50)
        for pu in proc_users:
            await create_notification(pu["user_id"], f"Payment rejected for {request.get('material_name')}: {data.remarks or 'No reason given'}. Please review and resubmit.")
        return {"message": "Payment rejected", "status": "accounts_rejected"}


@router.post("/procurement/v2/generate-po/{request_id}")
async def generate_purchase_order_v2(request_id: str, user: User = Depends(get_current_user)):
    """Generate Purchase Order after payment approval (or directly for credit)"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can generate PO")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Allow PO generation for payment_approved or vendor_selected (credit)
    if request.get("status") not in ["payment_approved", "vendor_selected"]:
        raise HTTPException(status_code=400, detail="Payment must be approved first (or credit selected)")
    
    if request.get("payment_type") not in ["credit"] and request.get("status") != "payment_approved":
        raise HTTPException(status_code=400, detail="Payment must be approved for advance/partial payments")
    
    # Get project and vendor details
    project = await db.projects.find_one({"project_id": request.get("project_id")}, {"_id": 0, "name": 1, "location": 1})
    vendor = await db.vendor_master.find_one({"vendor_id": request.get("vendor_id")}, {"_id": 0})
    
    # Generate PO
    po_id = f"PO-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    po_number = f"PO-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    po_doc = {
        "po_id": po_id,
        "po_number": po_number,
        "request_id": request_id,
        "order_id": request.get("order_id"),
        "project_id": request.get("project_id"),
        "project_name": project.get("name") if project else "",
        "vendor_id": request.get("vendor_id"),
        "vendor_name": request.get("vendor_name"),
        "vendor_phone": vendor.get("phone") if vendor else "",
        "vendor_address": vendor.get("address") if vendor else "",
        "material_name": request.get("material_name"),
        "quantity": request.get("quantity"),
        "unit": request.get("unit"),
        "unit_rate": request.get("unit_rate"),
        "transport_cost": request.get("transport_cost", 0),
        "discount": request.get("discount", 0),
        "total_amount": request.get("total_amount"),
        "payment_type": request.get("payment_type"),
        "advance_paid": request.get("advance_amount", 0),
        "balance_due": request.get("balance_amount", 0),
        "delivery_address": project.get("location") if project else "",
        "expected_delivery": request.get("expected_delivery"),
        "status": "generated",
        "generated_by": user.user_id,
        "generated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.purchase_orders_v2.insert_one(po_doc)
    
    # Update material request
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "po_generated",
            "po_id": po_id,
            "po_generated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If credit, add to credit ledger with comprehensive tracking
    if request.get("payment_type") == "credit":
        credit_period = request.get("credit_period_days", 30)
        delivery_date = request.get("expected_delivery") or datetime.now(timezone.utc).isoformat()
        # Calculate payment due date from delivery date
        try:
            delivery_dt = datetime.fromisoformat(delivery_date.replace("Z", "+00:00"))
        except Exception:
            delivery_dt = datetime.now(timezone.utc)
        payment_due_dt = delivery_dt + timedelta(days=credit_period)
        
        credit_entry = {
            "entry_id": f"cle_{uuid.uuid4().hex[:12]}",
            "vendor_id": request.get("vendor_id"),
            "vendor_name": request.get("vendor_name"),
            "project_id": request.get("project_id"),
            "project_name": project.get("name") if project else "",
            "request_id": request_id,
            "po_id": po_id,
            "material_name": request.get("material_name"),
            "quantity": request.get("quantity"),
            "unit": request.get("unit"),
            "credit_amount": request.get("total_amount"),
            "paid_amount": 0,
            "balance_amount": request.get("total_amount"),
            "credit_period_days": credit_period,
            "delivery_date": delivery_date,
            "payment_due_date": payment_due_dt.isoformat(),
            "status": "outstanding",
            "payment_requested": False,
            "payment_history": [],
            "created_by": user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.credit_ledger.insert_one(credit_entry)
        
        # Notify accountant about upcoming credit payment
        accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(50)
        for acc in accountants:
            await create_notification(
                acc["user_id"],
                f"Credit purchase: {request.get('material_name')} from {request.get('vendor_name')} - ₹{request.get('total_amount'):,.0f} due in {credit_period} days"
            )
    
    return {"message": "Purchase Order generated", "po_id": po_id, "po_number": po_number}


@router.patch("/procurement/v2/dispatch/{request_id}")
async def mark_dispatched(request_id: str, data: DispatchInput, user: User = Depends(get_current_user)):
    """Mark material as dispatched / in transit"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can update dispatch")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "po_generated":
        raise HTTPException(status_code=400, detail="PO must be generated first")
    
    # Generate OTP for site engineer receipt verification
    otp = str(random.randint(100000, 999999))
    
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "in_transit",
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
            "vehicle_number": data.vehicle_number,
            "driver_phone": data.driver_phone,
            "receipt_otp": otp
        }}
    )
    
    # Update PO status
    if request.get("po_id"):
        await db.purchase_orders_v2.update_one(
            {"po_id": request.get("po_id")},
            {"$set": {
                "status": "in_transit",
                "dispatched_at": datetime.now(timezone.utc).isoformat(),
                "vehicle_number": data.vehicle_number,
                "driver_name": data.driver_name,
                "driver_phone": data.driver_phone
            }}
        )
    
    # Create transit tracking entry
    tracking_doc = {
        "tracking_id": f"trk_{uuid.uuid4().hex[:12]}",
        "po_id": request.get("po_id"),
        "request_id": request_id,
        "project_id": request.get("project_id"),
        "status": "dispatched",
        "vehicle_number": data.vehicle_number,
        "driver_name": data.driver_name,
        "driver_phone": data.driver_phone,
        "estimated_arrival": data.estimated_arrival,
        "updates": [{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "dispatched",
            "remarks": "Material dispatched from vendor"
        }],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.transit_tracking.insert_one(tracking_doc)
    
    # Notify site engineer (in-app)
    await create_notification(
        request.get("site_engineer_id"),
        f"Material {request.get('material_name')} dispatched. Vehicle: {data.vehicle_number}. OTP for receipt: {otp}"
    )
    
    # Send OTP via email to site engineer (non-blocking)
    try:
        se_user = await db.users.find_one({"user_id": request.get("site_engineer_id")}, {"_id": 0})
        if se_user and se_user.get("email") and resend.api_key:
            asyncio.ensure_future(_send_otp_email(
                se_user["email"], otp,
                request.get("material_name", "Material"),
                request.get("quantity", 0), request.get("unit", ""),
                data.vehicle_number, se_user.get("name", "Engineer")
            ))
    except Exception as e:
        logger.error(f"Failed to queue OTP email: {e}")
    
    return {"message": "Marked as dispatched", "otp": otp, "status": "in_transit"}


async def _send_otp_email(email, otp, material_name, qty, unit, vehicle, engineer_name):
    """Send OTP email to site engineer for material receipt verification"""
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [email],
            "subject": f"Material Receipt OTP: {otp}",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <div style="background: #F97316; color: white; padding: 16px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="margin: 0;">Material Receipt Verification</h2>
                </div>
                <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
                    <p>Hi <strong>{engineer_name}</strong>,</p>
                    <p>A material has been dispatched to your site. Use this OTP to verify receipt:</p>
                    <div style="background: #EFF6FF; border: 2px solid #2563EB; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                        <p style="color: #2563EB; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0;">{otp}</p>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                        <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Material</strong></td>
                            <td style="padding: 8px; border: 1px solid #E5E7EB;">{material_name}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Quantity</strong></td>
                            <td style="padding: 8px; border: 1px solid #E5E7EB;">{qty} {unit}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Vehicle</strong></td>
                            <td style="padding: 8px; border: 1px solid #E5E7EB;">{vehicle}</td></tr>
                    </table>
                    <p style="color: #666; font-size: 12px;">This OTP is valid until material is received. Do not share it with anyone.</p>
                </div>
            </div>
            """
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"OTP email sent to {email}")
    except Exception as e:
        logger.error(f"OTP email failed: {e}")


@router.post("/procurement/v2/resend-otp/{request_id}")
async def resend_receipt_otp(request_id: str, user: User = Depends(get_current_user)):
    """Resend OTP via email for material receipt verification"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineer can request OTP resend")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "in_transit":
        raise HTTPException(status_code=400, detail="Material must be in transit")
    
    otp = request.get("receipt_otp")
    if not otp:
        raise HTTPException(status_code=400, detail="No OTP found for this order")
    
    # Get site engineer email
    se_user = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not se_user or not se_user.get("email"):
        raise HTTPException(status_code=400, detail="Email not found")
    
    otp_sent = False
    if resend.api_key:
        try:
            await _send_otp_email(
                se_user["email"], otp,
                request.get("material_name", "Material"),
                request.get("quantity", 0), request.get("unit", ""),
                request.get("vehicle_number", "-"),
                se_user.get("name", "Engineer")
            )
            otp_sent = True
        except Exception as e:
            logger.error(f"Resend OTP email failed: {e}")
    
    result = {"message": "OTP sent to your email" if otp_sent else "Email delivery failed", "otp_sent": otp_sent}
    
    # Fallback: show OTP if email couldn't be sent
    if not otp_sent:
        result["test_otp"] = otp
    
    return result


@router.post("/procurement/v2/receive/{request_id}")
async def receive_material(request_id: str, data: ReceiptInput, user: User = Depends(get_current_user)):
    """Site Engineer receives material with OTP verification"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Site Engineer can receive materials")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "in_transit":
        raise HTTPException(status_code=400, detail="Material must be in transit")
    
    # Verify OTP
    if request.get("receipt_otp") != data.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Determine if partial or complete
    requested_qty = request.get("quantity", 0)
    is_partial = data.received_qty < requested_qty
    new_status = "received_partial" if is_partial else "received_completed"
    
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": new_status,
            "received_qty": data.received_qty,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "receipt_photo_id": data.photo_id,
            "receipt_gps_lat": data.gps_lat,
            "receipt_gps_lng": data.gps_lng,
            "receipt_otp_verified": True
        }}
    )
    
    # Update PO
    if request.get("po_id"):
        await db.purchase_orders_v2.update_one(
            {"po_id": request.get("po_id")},
            {"$set": {
                "status": "delivered" if not is_partial else "partial_delivery",
                "received_qty": data.received_qty,
                "actual_delivery": datetime.now(timezone.utc).isoformat(),
                "receipt_verified": True
            }}
        )
    
    # Update transit tracking
    await db.transit_tracking.update_one(
        {"request_id": request_id},
        {"$set": {"status": "delivered"},
         "$push": {"updates": {
             "timestamp": datetime.now(timezone.utc).isoformat(),
             "status": "delivered",
             "remarks": f"Received {data.received_qty} {request.get('unit')} at site"
         }}}
    )
    
    # Notify procurement
    proc_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(50)
    for pu in proc_users:
        status_msg = f"{'Partial' if is_partial else 'Full'} receipt: {request.get('material_name')} - {data.received_qty}/{requested_qty}"
        await create_notification(pu["user_id"], status_msg)
    
    return {
        "message": "Material received",
        "status": new_status,
        "received_qty": data.received_qty,
        "requested_qty": requested_qty,
        "is_partial": is_partial
    }


# ==================== CREDIT LEDGER ENDPOINTS ====================

@router.get("/procurement/credit-ledger")
async def get_credit_ledger(
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get credit ledger entries with overdue tracking"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    
    entries = await db.credit_ledger.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    now = datetime.now(timezone.utc)
    total_outstanding = 0
    overdue_count = 0
    overdue_amount = 0
    
    for e in entries:
        if e.get("status") != "paid":
            balance = e.get("balance_amount", 0)
            total_outstanding += balance
            
            # Check if overdue
            due_date_str = e.get("payment_due_date")
            if due_date_str:
                try:
                    due_date = datetime.fromisoformat(due_date_str.replace("Z", "+00:00"))
                    if now > due_date:
                        e["is_overdue"] = True
                        e["days_overdue"] = (now - due_date).days
                        overdue_count += 1
                        overdue_amount += balance
                    else:
                        e["is_overdue"] = False
                        e["days_until_due"] = (due_date - now).days
                except Exception:
                    e["is_overdue"] = False
            else:
                e["is_overdue"] = False
    
    return {
        "entries": entries,
        "total_outstanding": total_outstanding,
        "overdue_count": overdue_count,
        "overdue_amount": overdue_amount,
        "count": len(entries)
    }


class CreditPaymentInput(BaseModel):
    amount: float
    payment_reference: str
    remarks: Optional[str] = None


@router.post("/procurement/credit-ledger/{entry_id}/pay")
async def pay_credit(entry_id: str, data: CreditPaymentInput, user: User = Depends(get_current_user)):
    """Record payment against credit ledger entry"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can record payments")
    
    entry = await db.credit_ledger.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    
    new_paid = entry.get("paid_amount", 0) + data.amount
    new_balance = entry.get("credit_amount", 0) - new_paid
    new_status = "paid" if new_balance <= 0 else "partially_paid"
    
    payment_record = {
        "date": datetime.now(timezone.utc).isoformat(),
        "amount": data.amount,
        "reference": data.payment_reference,
        "paid_by": user.user_id,
        "remarks": data.remarks
    }
    
    await db.credit_ledger.update_one(
        {"entry_id": entry_id},
        {
            "$set": {
                "paid_amount": new_paid,
                "balance_amount": max(0, new_balance),
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"payment_history": payment_record}
        }
    )
    
    return {
        "message": "Payment recorded",
        "paid_amount": new_paid,
        "balance_amount": max(0, new_balance),
        "status": new_status
    }



@router.post("/procurement/credit-ledger/{entry_id}/request-payment")
async def request_credit_payment(entry_id: str, user: User = Depends(get_current_user)):
    """Procurement requests payment from accountant for a credit entry that is due"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can request payment")
    
    entry = await db.credit_ledger.find_one({"entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    
    if entry.get("status") == "paid":
        raise HTTPException(status_code=400, detail="This credit is already fully paid")
    
    await db.credit_ledger.update_one(
        {"entry_id": entry_id},
        {"$set": {
            "payment_requested": True,
            "payment_requested_by": user.user_id,
            "payment_requested_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify accountant
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(50)
    for acc in accountants:
        await create_notification(
            acc["user_id"],
            f"Payment requested for credit: {entry.get('vendor_name')} - {entry.get('material_name', 'Material')} - ₹{entry.get('balance_amount', 0):,.0f}"
        )
    
    return {"message": "Payment request sent to accountant"}



# ==================== VENDOR MASTER ENHANCED ENDPOINTS ====================

class VendorMasterInput(BaseModel):
    name: str
    category: str = "material"  # material or labour
    contact_person: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    payment_method: str = "bank"
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    labour_category: Optional[str] = None
    location_coverage: Optional[str] = None
    rate_type: Optional[str] = None
    materials_supplied: List[str] = []
    tags: List[str] = []
    payment_terms: str = "full"
    credit_limit: Optional[float] = None


@router.post("/vendor-master/v2/create")
async def create_vendor_master_v2(data: VendorMasterInput, user: User = Depends(get_current_user)):
    """Create new vendor in vendor master"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can create vendors")
    
    # Check duplicate
    existing = await db.vendor_master.find_one({"name": data.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Vendor with this name already exists")
    
    vendor_id = f"vm_{uuid.uuid4().hex[:12]}"
    vendor_doc = {
        "vendor_id": vendor_id,
        **data.model_dump(),
        "is_active": True,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.vendor_master.insert_one(vendor_doc)
    
    return {"message": "Vendor created", "vendor_id": vendor_id}


@router.get("/vendor-master")
async def get_vendors_master(
    category: Optional[str] = None,
    labour_category: Optional[str] = None,
    is_active: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all vendors from vendor master"""
    # RBAC: Restrict to procurement/management roles
    vendor_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
                    UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]
    if user.role not in vendor_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    query = {"is_active": is_active}
    if category:
        query["category"] = category
    if labour_category:
        query["labour_category"] = labour_category
    
    vendors = await db.vendor_master.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return vendors


@router.get("/vendor-master/{vendor_id}")
async def get_vendor_detail(vendor_id: str, user: User = Depends(get_current_user)):
    """Get single vendor details"""
    vendor_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
                    UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]
    if user.role not in vendor_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # Get spending history
    spending = await db.purchase_orders_v2.aggregate([
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    
    # Get credit status
    credit = await db.credit_ledger.aggregate([
        {"$match": {"vendor_id": vendor_id, "status": {"$ne": "paid"}}},
        {"$group": {"_id": None, "total_credit": {"$sum": "$balance_amount"}}}
    ]).to_list(1)
    
    vendor["total_spend"] = spending[0]["total"] if spending else 0
    vendor["order_count"] = spending[0]["count"] if spending else 0
    vendor["outstanding_credit"] = credit[0]["total_credit"] if credit else 0
    
    return vendor


@router.patch("/vendor-master/v2/{vendor_id}")
async def update_vendor_master_v2(vendor_id: str, data: VendorMasterInput, user: User = Depends(get_current_user)):
    """Update vendor in vendor master"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can update vendors")
    
    update_dict = data.model_dump()
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.vendor_master.update_one(
        {"vendor_id": vendor_id},
        {"$set": update_dict}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    return {"message": "Vendor updated"}


@router.post("/vendor-master/{vendor_id}/upload-aadhar")
async def upload_vendor_aadhar(
    vendor_id: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    """Upload Aadhar document for labour vendor"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can upload documents")
    
    contents = await file.read()
    file_id = await fs.upload_from_stream(
        f"aadhar_{vendor_id}_{file.filename}",
        contents,
        metadata={"contentType": file.content_type, "vendor_id": vendor_id, "type": "aadhar"}
    )
    
    await db.vendor_master.update_one(
        {"vendor_id": vendor_id},
        {"$set": {"aadhar_file_id": str(file_id), "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Aadhar uploaded", "file_id": str(file_id)}


# ==================== TRANSIT TRACKING ENDPOINTS ====================

@router.get("/procurement/transit")
async def get_transit_orders(user: User = Depends(get_current_user)):
    """Get all in-transit orders"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SITE_ENGINEER, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"status": "in_transit"}
    if user.role == UserRole.SITE_ENGINEER:
        # Site engineers see only their project's transit orders
        assignments = await db.site_engineer_assignments.find(
            {"user_id": user.user_id, "is_active": True}, {"project_id": 1}
        ).to_list(100)
        project_ids = [a["project_id"] for a in assignments]
        query["project_id"] = {"$in": project_ids}
    
    requests = await db.material_requests.find(query, {"_id": 0}).sort("dispatched_at", -1).to_list(100)
    
    # Enrich with project names
    for req in requests:
        project = await db.projects.find_one({"project_id": req.get("project_id")}, {"_id": 0, "name": 1})
        req["project_name"] = project.get("name") if project else ""
    
    return requests


@router.get("/procurement/transit/{request_id}/tracking")
async def get_transit_tracking(request_id: str, user: User = Depends(get_current_user)):
    """Get tracking details for a transit order"""
    tracking = await db.transit_tracking.find_one({"request_id": request_id}, {"_id": 0})
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking not found")
    return tracking


@router.patch("/procurement/transit/{request_id}/update")
async def update_transit_status(
    request_id: str,
    status: str,
    location: Optional[str] = None,
    remarks: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Update transit tracking status"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can update tracking")
    
    update = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "location": location,
        "remarks": remarks
    }
    
    await db.transit_tracking.update_one(
        {"request_id": request_id},
        {"$set": {"status": status, "current_location": location}, "$push": {"updates": update}}
    )
    
    return {"message": "Tracking updated"}


# ==================== PROCUREMENT REPORTS ====================

@router.get("/procurement/reports/vendor-spend")
async def vendor_spend_report(user: User = Depends(get_current_user)):
    """Get vendor-wise spending report"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    pipeline = [
        {"$match": {"status": {"$in": ["po_generated", "in_transit", "received_partial", "received_completed", "closed"]}}},
        {"$group": {
            "_id": "$vendor_id",
            "vendor_name": {"$first": "$vendor_name"},
            "total_amount": {"$sum": "$total_amount"},
            "order_count": {"$sum": 1}
        }},
        {"$sort": {"total_amount": -1}}
    ]
    
    result = await db.material_requests.aggregate(pipeline).to_list(100)
    return result


@router.get("/procurement/reports/material-spend")
async def material_spend_report(user: User = Depends(get_current_user)):
    """Get material-wise spending report"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    pipeline = [
        {"$match": {"status": {"$in": ["po_generated", "in_transit", "received_partial", "received_completed", "closed"]}}},
        {"$group": {
            "_id": "$material_name",
            "total_amount": {"$sum": "$total_amount"},
            "total_quantity": {"$sum": "$quantity"},
            "order_count": {"$sum": 1}
        }},
        {"$sort": {"total_amount": -1}}
    ]
    
    result = await db.material_requests.aggregate(pipeline).to_list(100)
    return result


@router.get("/procurement/reports/monthly")
async def monthly_procurement_report(year: int = None, user: User = Depends(get_current_user)):
    """Get monthly procurement value report"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not year:
        year = datetime.now().year
    
    # This is a simplified version - in production you'd parse dates properly
    requests = await db.material_requests.find(
        {"status": {"$in": ["po_generated", "in_transit", "received_partial", "received_completed", "closed"]}},
        {"_id": 0, "total_amount": 1, "created_at": 1}
    ).to_list(1000)
    
    monthly_totals = {}
    for req in requests:
        created = req.get("created_at")
        if isinstance(created, str):
            try:
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                if dt.year == year:
                    month = dt.month
                    monthly_totals[month] = monthly_totals.get(month, 0) + req.get("total_amount", 0)
            except:
                pass
    
    return {"year": year, "monthly": monthly_totals}


# ==================== PACKAGE SYSTEM ENDPOINTS ====================

class PackageScopeItemInput(BaseModel):
    name: str
    description: Optional[str] = None
    quantity: float = 1
    unit: str = "nos"
    unit_rate: float = 0


class PackageMaterialItemInput(BaseModel):
    material_id: Optional[str] = None
    name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    quantity: float = 1
    unit: str = "nos"
    estimated_rate: float = 0


class PackageLabourItemInput(BaseModel):
    work_type: str
    description: Optional[str] = None
    estimated_days: float = 0
    daily_rate: float = 0
    workers_count: int = 1


class PackageCreateInput(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    building_types: List[str] = []
    base_rate_per_sqft: float = 0
    scope_items: List[PackageScopeItemInput] = []
    material_items: List[PackageMaterialItemInput] = []
    labour_items: List[PackageLabourItemInput] = []


@router.get("/packages")
async def get_packages(user: User = Depends(get_current_user)):
    """Get all active packages"""
    packages = await db.packages.find({"is_active": True}, {"_id": 0}).to_list(100)
    return packages


@router.get("/packages/{package_id}")
async def get_package(package_id: str, user: User = Depends(get_current_user)):
    """Get package details"""
    package = await db.packages.find_one({"package_id": package_id}, {"_id": 0})
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@router.post("/packages")
async def create_package(package_input: PackageCreateInput, user: User = Depends(get_current_user)):
    """Create a new package"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Auto-generate code if not provided
    pkg_code = package_input.code or f"PKG-{uuid.uuid4().hex[:6].upper()}"
    
    # Check for duplicate code
    existing = await db.packages.find_one({"code": pkg_code, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail=f"Package with code '{pkg_code}' already exists")
    
    # Process scope items with calculated totals
    scope_items = []
    total_scope_value = 0
    for item in package_input.scope_items:
        scope_item = {
            "item_id": f"psi_{uuid.uuid4().hex[:8]}",
            "name": item.name,
            "description": item.description,
            "quantity": item.quantity,
            "unit": item.unit,
            "unit_rate": item.unit_rate,
            "total": item.quantity * item.unit_rate
        }
        total_scope_value += scope_item["total"]
        scope_items.append(scope_item)
    
    # Process material items
    material_items = []
    for item in package_input.material_items:
        material_items.append({
            "item_id": f"pmi_{uuid.uuid4().hex[:8]}",
            "material_id": item.material_id,
            "name": item.name,
            "brand": item.brand,
            "specification": item.specification,
            "quantity": item.quantity,
            "unit": item.unit,
            "estimated_rate": item.estimated_rate
        })
    
    # Process labour items
    labour_items = []
    for item in package_input.labour_items:
        labour_items.append({
            "item_id": f"pli_{uuid.uuid4().hex[:8]}",
            "work_type": item.work_type,
            "description": item.description,
            "estimated_days": item.estimated_days,
            "daily_rate": item.daily_rate,
            "workers_count": item.workers_count
        })
    
    package = Package(
        name=package_input.name,
        code=pkg_code,
        description=package_input.description,
        building_types=package_input.building_types,
        base_rate_per_sqft=package_input.base_rate_per_sqft,
        scope_items=scope_items,
        material_items=material_items,
        labour_items=labour_items,
        created_by=user.user_id
    )
    
    package_dict = package.model_dump()
    package_dict["created_at"] = package_dict["created_at"].isoformat()
    package_dict["updated_at"] = package_dict["updated_at"].isoformat()
    
    await db.packages.insert_one(package_dict)
    
    return {"package_id": package.package_id, "message": "Package created", "total_scope_value": total_scope_value}


@router.patch("/packages/{package_id}")
async def update_package(package_id: str, package_input: PackageCreateInput, user: User = Depends(get_current_user)):
    """Update a package"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.packages.find_one({"package_id": package_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Package not found")
    
    # Process scope items
    scope_items = []
    for item in package_input.scope_items:
        scope_items.append({
            "item_id": f"psi_{uuid.uuid4().hex[:8]}",
            "name": item.name,
            "description": item.description,
            "quantity": item.quantity,
            "unit": item.unit,
            "unit_rate": item.unit_rate,
            "total": item.quantity * item.unit_rate
        })
    
    # Process material items
    material_items = []
    for item in package_input.material_items:
        material_items.append({
            "item_id": f"pmi_{uuid.uuid4().hex[:8]}",
            "material_id": item.material_id,
            "name": item.name,
            "brand": item.brand,
            "specification": item.specification,
            "quantity": item.quantity,
            "unit": item.unit,
            "estimated_rate": item.estimated_rate
        })
    
    # Process labour items
    labour_items = []
    for item in package_input.labour_items:
        labour_items.append({
            "item_id": f"pli_{uuid.uuid4().hex[:8]}",
            "work_type": item.work_type,
            "description": item.description,
            "estimated_days": item.estimated_days,
            "daily_rate": item.daily_rate,
            "workers_count": item.workers_count
        })
    
    update_data = {
        "name": package_input.name,
        "code": package_input.code,
        "description": package_input.description,
        "building_types": package_input.building_types,
        "base_rate_per_sqft": package_input.base_rate_per_sqft,
        "scope_items": scope_items,
        "material_items": material_items,
        "labour_items": labour_items,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.packages.update_one({"package_id": package_id}, {"$set": update_data})
    
    return {"message": "Package updated"}


@router.delete("/packages/{package_id}")
async def delete_package(package_id: str, user: User = Depends(get_current_user)):
    """Soft delete a package"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.packages.update_one(
        {"package_id": package_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Package not found")
    
    return {"message": "Package deleted"}


# ==================== LABOUR CONTRACTOR ENDPOINTS ====================

class LabourContractorInput(BaseModel):
    name: Optional[str] = None
    work_types: Optional[List[str]] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    rate_structure: Optional[Dict] = None
    daily_rate_skilled: Optional[float] = None
    daily_rate_semi_skilled: Optional[float] = None
    daily_rate_unskilled: Optional[float] = None
    is_locked: Optional[bool] = None


@router.get("/labour-contractors")
async def get_labour_contractors(user: User = Depends(get_current_user)):
    """Get all active labour contractors"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    contractors = await db.labour_contractors.find({"is_active": True}, {"_id": 0}).to_list(100)
    return contractors


@router.post("/labour-contractors")
async def create_labour_contractor(contractor_input: LabourContractorInput, user: User = Depends(get_current_user)):
    """Create a new labour contractor (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can create labour contractors")
    
    if not (contractor_input.name or "").strip():
        raise HTTPException(status_code=400, detail="Name is required")

    contractor = LabourContractor(
        name=contractor_input.name.strip(),
        work_types=contractor_input.work_types or [],
        phone=contractor_input.phone,
        email=contractor_input.email,
        address=contractor_input.address,
        bank_name=contractor_input.bank_name,
        account_number=contractor_input.account_number,
        ifsc_code=contractor_input.ifsc_code,
        rate_structure=contractor_input.rate_structure or {},
        daily_rate_skilled=contractor_input.daily_rate_skilled,
        daily_rate_semi_skilled=contractor_input.daily_rate_semi_skilled,
        daily_rate_unskilled=contractor_input.daily_rate_unskilled,
        is_locked=bool(contractor_input.is_locked) if contractor_input.is_locked is not None else False,
        created_by=user.user_id
    )
    
    contractor_dict = contractor.model_dump()
    contractor_dict["created_at"] = contractor_dict["created_at"].isoformat()
    contractor_dict["updated_at"] = contractor_dict["updated_at"].isoformat()
    
    await db.labour_contractors.insert_one(contractor_dict)
    contractor_dict.pop("_id", None)
    
    return {"contractor_id": contractor.contractor_id, "message": "Labour contractor created"}


@router.patch("/labour-contractors/{contractor_id}")
async def update_labour_contractor(contractor_id: str, contractor_input: LabourContractorInput, user: User = Depends(get_current_user)):
    """Update a labour contractor (partial update — only fields supplied are touched)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can update labour contractors")

    update_data = contractor_input.model_dump(exclude_unset=True)
    if "name" in update_data:
        update_data["name"] = (update_data["name"] or "").strip()
        if not update_data["name"]:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.labour_contractors.update_one(
        {"contractor_id": contractor_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Labour contractor not found")
    
    return {"message": "Labour contractor updated"}


@router.get("/labour-contractors/{contractor_id}/payment-summary")
async def get_contractor_payment_summary(contractor_id: str, user: User = Depends(get_current_user)):
    """
    Aggregated finance view for a single labour contractor.
    Returns:
      • work_orders: { count, total_amount, paid_amount, pending_amount }
      • payment_requests: { raised_count, raised_amount, collected_count, collected_amount, pending_count, pending_amount }
      • projects: list of {project_id, project_name, wo_count, total_amount, paid_amount, pending_amount}
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    contractor = await db.labour_contractors.find_one({"contractor_id": contractor_id}, {"_id": 0})
    if not contractor:
        raise HTTPException(status_code=404, detail="Labour contractor not found")

    work_orders = await db.work_orders.find(
        {"contractor_id": contractor_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    wo_total = 0.0
    paid_amount = 0.0
    raised_count = 0
    raised_amount = 0.0
    collected_count = 0
    collected_amount = 0.0
    pending_req_count = 0
    pending_req_amount = 0.0
    project_buckets: Dict[str, Dict] = {}

    PAID_STATUSES = {"paid"}
    RAISED_STATUSES = {"payment_requested", "payment_approved", "paid"}
    PENDING_REQ_STATUSES = {"payment_requested", "payment_approved"}

    for wo in work_orders:
        amt = float(wo.get("total_amount") or 0)
        wo_total += amt
        pid = wo.get("project_id") or ""
        bucket = project_buckets.setdefault(pid, {
            "project_id": pid,
            "project_name": wo.get("project_name") or "",
            "wo_count": 0,
            "total_amount": 0.0,
            "paid_amount": 0.0,
            "pending_amount": 0.0,
        })
        bucket["wo_count"] += 1
        bucket["total_amount"] += amt

        for stage in (wo.get("stages") or []):
            sa = float(stage.get("amount") or 0)
            status = stage.get("status") or "pending"
            if status in PAID_STATUSES:
                paid_amount += sa
                bucket["paid_amount"] += sa
                collected_count += 1
                collected_amount += sa
            if status in RAISED_STATUSES:
                raised_count += 1
                raised_amount += sa
            if status in PENDING_REQ_STATUSES:
                pending_req_count += 1
                pending_req_amount += sa

    for b in project_buckets.values():
        b["pending_amount"] = round(b["total_amount"] - b["paid_amount"], 2)
        b["total_amount"] = round(b["total_amount"], 2)
        b["paid_amount"] = round(b["paid_amount"], 2)

    return {
        "contractor_id": contractor_id,
        "contractor_name": contractor.get("name"),
        "work_orders": {
            "count": len(work_orders),
            "total_amount": round(wo_total, 2),
            "paid_amount": round(paid_amount, 2),
            "pending_amount": round(wo_total - paid_amount, 2),
        },
        "payment_requests": {
            "raised_count": raised_count,
            "raised_amount": round(raised_amount, 2),
            "collected_count": collected_count,
            "collected_amount": round(collected_amount, 2),
            "pending_count": pending_req_count,
            "pending_amount": round(pending_req_amount, 2),
        },
        "projects": sorted(project_buckets.values(), key=lambda b: b["pending_amount"], reverse=True),
    }


@router.delete("/labour-contractors/{contractor_id}")
async def delete_labour_contractor(contractor_id: str, user: User = Depends(get_current_user)):
    """Soft delete a labour contractor"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can delete labour contractors")
    
    result = await db.labour_contractors.update_one(
        {"contractor_id": contractor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Labour contractor not found")
    
    return {"message": "Labour contractor deleted"}


# ──────────────────────────────────────────────────────────────────────────────
# Contractor Types — manage custom labour contractor categories
# Stored in collection `contractor_types` with shape:
#   { type_id, name, description, created_by, created_at, is_active }
# ──────────────────────────────────────────────────────────────────────────────
class ContractorTypeInput(BaseModel):
    name: str
    description: Optional[str] = ""


@router.get("/contractor-types")
async def list_contractor_types(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    types = await db.contractor_types.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(500)

    # Attach live count of contractors per type (matches against work_types)
    contractors = await db.labour_contractors.find({"is_active": True}, {"_id": 0, "work_types": 1}).to_list(2000)
    counts = {}
    for c in contractors:
        for w in (c.get("work_types") or []):
            counts[w] = counts.get(w, 0) + 1
    for t in types:
        t["contractor_count"] = counts.get(t["name"], 0)
    return types


@router.post("/contractor-types")
async def create_contractor_type(body: ContractorTypeInput, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can create contractor types")

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    existing = await db.contractor_types.find_one({"name": name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Contractor type already exists")

    doc = {
        "type_id": f"ctype_{uuid.uuid4().hex[:12]}",
        "name": name,
        "description": (body.description or "").strip(),
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True,
    }
    await db.contractor_types.insert_one(doc)
    return {"type_id": doc["type_id"], "message": "Contractor type created"}


@router.patch("/contractor-types/{type_id}")
async def update_contractor_type(type_id: str, body: ContractorTypeInput, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can update contractor types")

    existing = await db.contractor_types.find_one({"type_id": type_id, "is_active": True}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contractor type not found")

    new_name = (body.name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")

    # If renamed, propagate to all contractors using this type
    if new_name != existing["name"]:
        await db.labour_contractors.update_many(
            {"work_types": existing["name"]},
            {"$set": {"work_types.$[el]": new_name}},
            array_filters=[{"el": existing["name"]}],
        )

    await db.contractor_types.update_one(
        {"type_id": type_id},
        {"$set": {
            "name": new_name,
            "description": (body.description or "").strip(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"message": "Contractor type updated"}


@router.delete("/contractor-types/{type_id}")
async def delete_contractor_type(type_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Only Planning can delete contractor types")

    existing = await db.contractor_types.find_one({"type_id": type_id, "is_active": True}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contractor type not found")

    # Don't hard-delete; soft delete and remove from contractors' work_types
    await db.labour_contractors.update_many(
        {"work_types": existing["name"]},
        {"$pull": {"work_types": existing["name"]}},
    )
    await db.contractor_types.update_one(
        {"type_id": type_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"message": "Contractor type deleted"}


@router.get("/contractor-types/{type_id}/contractors")
async def list_contractors_by_type(type_id: str, user: User = Depends(get_current_user)):
    """List all active labour contractors that include this type in their work_types."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER, UserRole.SITE_ENGINEER, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    ctype = await db.contractor_types.find_one({"type_id": type_id, "is_active": True}, {"_id": 0})
    if not ctype:
        raise HTTPException(status_code=404, detail="Contractor type not found")

    contractors = await db.labour_contractors.find(
        {"is_active": True, "work_types": ctype["name"]},
        {"_id": 0}
    ).sort("name", 1).to_list(500)

    return {"type": ctype, "contractors": contractors}





# =====================================================================
# Simplified Procurement Flow (NEW): SE -> Procurement -> Planning -> Accountant
# Endpoint set used by the new ProcurementBoardSimple page (4-tab layout).
# Existing ProcurementBoardV2 endpoints above are untouched for back-compat.
# =====================================================================
@router.get("/procurement-simple/queue")
async def procurement_simple_queue(
    queue: str = "pending",  # pending | forwarded | rejected | all
    user: User = Depends(get_current_user),
):
    """Procurement's simplified queue.
    - pending   → SE-raised material requests awaiting Procurement assignment
                  (statuses: requested, pm_approved)
    - forwarded → already forwarded to Planning (procurement_priced)
    - rejected  → procurement-rejected requests
    - all       → everything except finalised (accounts_approved/completed/closed)
    """
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")

    status_map = {
        "pending": ["requested", "pm_approved", "procurement_revision"],
        "forwarded": ["procurement_priced"],
        "rejected": ["procurement_rejected"],
        "revision": ["procurement_revision"],
        "all": ["requested", "pm_approved", "procurement_priced", "procurement_rejected", "procurement_revision"],
    }
    target = status_map.get(queue, status_map["pending"])

    rows = await db.material_requests.find(
        {"status": {"$in": target}}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Enrich project + SE names
    project_ids = list({r.get("project_id") for r in rows if r.get("project_id")})
    projects = {p["project_id"]: p for p in await db.projects.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}
    ).to_list(500)} if project_ids else {}
    se_ids = list({r.get("site_engineer_id") for r in rows if r.get("site_engineer_id")})
    users_lookup = {u["user_id"]: u for u in await db.users.find(
        {"user_id": {"$in": se_ids}}, {"_id": 0, "user_id": 1, "name": 1}
    ).to_list(500)} if se_ids else {}

    for r in rows:
        r["project_name"] = (projects.get(r.get("project_id")) or {}).get("name", r.get("project_name") or "Unknown")
        r["site_engineer_name"] = (users_lookup.get(r.get("site_engineer_id")) or {}).get("name", r.get("site_engineer_name") or "Unknown")

    return {"count": len(rows), "requests": rows}


@router.patch("/procurement-simple/material-requests/{request_id}/assign-vendor")
async def procurement_simple_assign_vendor(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Procurement assigns Vendor + Unit Price + Remarks to a SE material request,
    then forwards it to Planning for final approval (status -> procurement_priced).

    Body:
      - vendor_id: str (required)
      - vendor_name: str (required)
      - unit_price: float (required, > 0)
      - approved_quantity: float (optional; defaults to requested quantity)
      - remarks: str (optional)
      - transport_cost: float (optional, default 0)
      - discount: float (optional, default 0)
    """
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement / Super Admin can assign vendors")

    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") not in ["requested", "pm_approved", "procurement_revision"]:
        raise HTTPException(status_code=400, detail=f"Cannot assign vendor — current status: {req.get('status')}")

    vendor_id = data.get("vendor_id")
    vendor_name = data.get("vendor_name")
    if not (vendor_id and vendor_name):
        raise HTTPException(status_code=400, detail="vendor_id and vendor_name are required")
    try:
        unit_price = float(data.get("unit_price") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="unit_price must be a number")
    if unit_price <= 0:
        raise HTTPException(status_code=400, detail="unit_price must be positive")

    qty = float(data.get("approved_quantity") or req.get("quantity") or 0)
    transport = float(data.get("transport_cost") or 0)
    discount = float(data.get("discount") or 0)
    estimated_price = max(0.0, unit_price * qty + transport - discount)
    remarks = (data.get("remarks") or "").strip()
    now = datetime.now(timezone.utc).isoformat()

    # ---- Timeline (date OR days) ----
    timeline_type = (data.get("timeline_type") or "date").lower()
    if timeline_type not in ("date", "days"):
        raise HTTPException(status_code=400, detail="timeline_type must be 'date' or 'days'")
    timeline_value = data.get("timeline_value") or ""
    expected_delivery_iso = ""
    if timeline_type == "date" and timeline_value:
        # Accept YYYY-MM-DD
        try:
            d = datetime.strptime(str(timeline_value)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            expected_delivery_iso = d.isoformat()
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="timeline_value must be a valid date (YYYY-MM-DD)")
    elif timeline_type == "days" and timeline_value not in ("", None):
        try:
            days = int(timeline_value)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="timeline_value must be a positive integer (days)")
        if days <= 0:
            raise HTTPException(status_code=400, detail="timeline days must be positive")
        expected_delivery_iso = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()

    # ---- Payment mode ----
    payment_mode = (data.get("payment_mode") or "pre_paid").lower()
    if payment_mode not in ("pre_paid", "credit", "advance", "post_delivery"):
        raise HTTPException(status_code=400, detail="payment_mode must be pre_paid|credit|advance|post_delivery")
    credit_days = 0
    advance_pct = None
    advance_amount = 0.0
    if payment_mode == "credit":
        try:
            credit_days = int(data.get("credit_days") or 0)
        except (ValueError, TypeError):
            credit_days = 0
        if credit_days <= 0:
            raise HTTPException(status_code=400, detail="credit_days must be positive for credit mode")
    if payment_mode == "advance":
        adv_mode = (data.get("advance_input_mode") or "amount").lower()
        if adv_mode == "percent":
            try:
                advance_pct = float(data.get("advance_percent") or 0)
            except (ValueError, TypeError):
                advance_pct = 0
            if advance_pct <= 0 or advance_pct > 100:
                raise HTTPException(status_code=400, detail="advance_percent must be between 0 and 100")
            advance_amount = round(estimated_price * advance_pct / 100, 2)
        else:
            try:
                advance_amount = float(data.get("advance_amount") or 0)
            except (ValueError, TypeError):
                advance_amount = 0
            if advance_amount <= 0 or advance_amount > estimated_price + 0.01:
                raise HTTPException(status_code=400, detail="advance_amount must be > 0 and ≤ total")

    update = {
        "status": "procurement_priced",
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "unit_rate": unit_price,
        "unit_price": unit_price,
        "approved_quantity": qty,
        "transport_cost": transport,
        "discount": discount,
        "total_amount": estimated_price,
        "estimated_price": estimated_price,
        "estimated_cost": estimated_price,
        "procurement_remarks": remarks,
        "procurement_priced_by": user.user_id,
        "procurement_priced_by_name": user.name,
        "procurement_priced_at": now,
        # New phase-1 fields:
        "timeline_type": timeline_type,
        "timeline_value": timeline_value,
        "expected_delivery": expected_delivery_iso,
        "payment_mode": payment_mode,
        "credit_days": credit_days,
        "advance_percent": advance_pct,
        "advance_amount": advance_amount,
        "balance_amount": max(0.0, estimated_price - advance_amount) if payment_mode == "advance" else 0.0,
        # SE delivery comparison
        "procurement_hours": data.get("procurement_hours"),
        "delivery_delta_hours": data.get("delivery_delta_hours"),
        "late_delivery_reason": (data.get("late_delivery_reason") or "").strip(),
    }
    # Validate: if procurement quote is later than SE asked, late_delivery_reason is mandatory.
    try:
        delta = int(update.get("delivery_delta_hours") or 0)
    except (TypeError, ValueError):
        delta = 0
    if delta > 0 and not update.get("late_delivery_reason"):
        raise HTTPException(status_code=400, detail="Late delivery reason is required when delivery exceeds SE's expected timeline")
    await db.material_requests.update_one({"request_id": request_id}, {"$set": update})

    # Notify Planning so it appears in their Materials Approval queue
    planning = await db.users.find(
        {"role": {"$in": ["planning", "super_admin"]}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1},
    ).to_list(50)
    for p in planning:
        try:
            await create_notification(
                p["user_id"],
                f"Material priced & forwarded: {req.get('material_name')} → {vendor_name} (₹{estimated_price:,.0f})",
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "assign_vendor", "material_request", request_id, update)
    return {"message": "Vendor assigned & forwarded to Planning", "status": "procurement_priced", "estimated_price": estimated_price}


@router.patch("/procurement-simple/material-requests/{request_id}/reject")
async def procurement_simple_reject(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Procurement rejects a SE material request with a reason (does NOT forward to Planning)."""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement / Super Admin can reject")

    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") not in ["requested", "pm_approved"]:
        raise HTTPException(status_code=400, detail=f"Cannot reject — current status: {req.get('status')}")
    reason = (data.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    now = datetime.now(timezone.utc).isoformat()
    await db.material_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "procurement_rejected",
            "procurement_rejection_reason": reason,
            "procurement_rejected_by": user.user_id,
            "procurement_rejected_by_name": user.name,
            "procurement_rejected_at": now,
        }},
    )
    if req.get("site_engineer_id"):
        try:
            await create_notification(req["site_engineer_id"], f"Material request rejected by Procurement: {req.get('material_name')}")
        except Exception:
            pass
    return {"message": "Request rejected"}


@router.get("/procurement-simple/dashboard")
async def procurement_simple_dashboard(user: User = Depends(get_current_user)):
    """Counts for the Procurement dashboard tiles."""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")

    pending = await db.material_requests.count_documents({"status": {"$in": ["requested", "pm_approved"]}})
    forwarded = await db.material_requests.count_documents({"status": "procurement_priced"})
    planning_approved = await db.material_requests.count_documents({"status": "planning_approved"})
    accounts_approved = await db.material_requests.count_documents({"status": {"$in": ["accounts_approved", "payment_approved", "pending_accounts_approval"]}})
    rejected = await db.material_requests.count_documents({"status": {"$in": ["procurement_rejected", "rejected"]}})

    # Total spend on accounts-approved this month
    from datetime import datetime as _dt, timezone as _tz
    now_dt = _dt.now(_tz.utc)
    month_start_iso = now_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    monthly_rows = await db.material_requests.find(
        {"status": {"$in": ["accounts_approved", "payment_approved", "completed"]},
         "created_at": {"$gte": month_start_iso}},
        {"_id": 0, "total_amount": 1, "estimated_price": 1},
    ).to_list(2000)
    monthly_spend = sum(float(r.get("total_amount") or r.get("estimated_price") or 0) for r in monthly_rows)

    return {
        "pending_assignment": pending,
        "forwarded_to_planning": forwarded,
        "planning_approved": planning_approved,
        "accounts_approved": accounts_approved,
        "rejected": rejected,
        "monthly_spend": monthly_spend,
    }


# =====================================================================
# PHASE 2 — Planning approval (payment-mode-aware routing)
# =====================================================================
@router.patch("/procurement-simple/material-requests/{request_id}/planning-approve")
async def procurement_simple_planning_approve(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Planning approves a Procurement-priced material request and routes it
    based on the payment_mode set by Procurement:

      pre_paid       → pending_accounts_approval (Accountant pays full → in_transit → delivered)
      credit         → in_transit directly (Credit ledger entry; pay after credit_days)
      advance        → pending_accounts_approval (advance leg) → in_transit
                       → SE marks delivered → balance leg → delivered
      post_delivery  → in_transit (no upfront)
                       → SE marks delivered → pending_accounts_approval (full)
    """
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning / Super Admin can approve")

    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "procurement_priced":
        raise HTTPException(status_code=400, detail=f"Cannot planning-approve in status: {req.get('status')}")

    payment_mode = (req.get("payment_mode") or "pre_paid").lower()
    now = datetime.now(timezone.utc).isoformat()
    notes = (data.get("notes") or "").strip()

    # Default → Accountant queue (pre_paid + advance)
    new_status = "pending_accounts_approval"
    next_payment_phase = "full"
    if payment_mode == "advance":
        next_payment_phase = "advance"
    elif payment_mode in ("credit", "post_delivery"):
        new_status = "in_transit"  # No upfront payment — go straight to transit
        next_payment_phase = "post" if payment_mode == "post_delivery" else "credit"

    update = {
        "status": new_status,
        "planning_approved_by": user.user_id,
        "planning_approved_by_name": user.name,
        "planning_approved_at": now,
        "planning_notes": notes,
        "next_payment_phase": next_payment_phase,
    }
    if new_status == "in_transit":
        update["transit_started_at"] = now
        update["transit_started_by"] = user.user_id
    await db.material_requests.update_one({"request_id": request_id}, {"$set": update})

    # Notify next handler
    if new_status == "pending_accounts_approval":
        accs = await db.users.find({"role": {"$in": ["accountant", "super_admin"]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(50)
        for a in accs:
            try:
                amt_label = "advance" if next_payment_phase == "advance" else "full"
                await create_notification(
                    a["user_id"],
                    f"Material payment ({amt_label}) ready: {req.get('material_name')} → {req.get('vendor_name')} ({fmt_money(req.get('total_amount') or 0)})",
                )
            except Exception:
                pass
    elif new_status == "in_transit" and req.get("site_engineer_id"):
        try:
            await create_notification(
                req["site_engineer_id"],
                f"Material in transit: {req.get('material_name')} from {req.get('vendor_name')} (mark received on delivery)",
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "planning_approve", "material_request", request_id, update)
    return {"message": "Planning approved", "status": new_status, "payment_mode": payment_mode, "next_payment_phase": next_payment_phase}


@router.patch("/procurement-simple/material-requests/{request_id}/planning-reject")
async def procurement_simple_planning_reject(request_id: str, data: dict, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can reject")
    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "procurement_priced":
        raise HTTPException(status_code=400, detail=f"Cannot reject in status: {req.get('status')}")
    reason = (data.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")
    now = datetime.now(timezone.utc).isoformat()
    await db.material_requests.update_one({"request_id": request_id}, {"$set": {
        "status": "rejected",
        "planning_rejection_reason": reason,
        "planning_rejected_by": user.user_id,
        "planning_rejected_by_name": user.name,
        "planning_rejected_at": now,
    }})
    return {"message": "Rejected by Planning"}


@router.patch("/procurement-simple/material-requests/{request_id}/planning-revision")
async def procurement_simple_planning_revision(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Planning sends a Procurement-priced request back to Procurement for revision
    (e.g. wrong vendor, price mismatch, timeline concern). Status becomes
    `procurement_revision` so Procurement can see + edit + resend without
    creating a brand-new request.
    """
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can request revision")
    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "procurement_priced":
        raise HTTPException(status_code=400, detail=f"Cannot request revision in status: {req.get('status')}")
    remarks = (data.get("revision_remarks") or data.get("remarks") or "").strip()
    if not remarks:
        raise HTTPException(status_code=400, detail="Revision remarks are required")
    now = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "at": now,
        "by": user.user_id,
        "by_name": user.name,
        "remarks": remarks,
    }
    await db.material_requests.update_one({"request_id": request_id}, {
        "$set": {
            "status": "procurement_revision",
            "revision_remarks": remarks,
            "revision_requested_by": user.user_id,
            "revision_requested_by_name": user.name,
            "revision_requested_at": now,
        },
        "$push": {"revision_history": history_entry},
    })

    # Notify Procurement
    procurement_users = await db.users.find(
        {"role": {"$in": ["procurement", "super_admin"]}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1},
    ).to_list(50)
    for p in procurement_users:
        try:
            await create_notification(
                p["user_id"],
                f"Revision requested for {req.get('material_name')} → {req.get('vendor_name')}: {remarks}",
            )
        except Exception:
            pass
    await create_audit_log(user.user_id, "request_revision", "material_request", request_id, {"remarks": remarks})
    return {"message": "Sent back to Procurement for revision", "status": "procurement_revision"}



def fmt_money(n):
    try:
        return f"₹{float(n):,.0f}"
    except Exception:
        return "₹0"


# =====================================================================
# PHASE 3 — Accountant release (full / advance / balance) + Transit + Delivery
# =====================================================================
@router.get("/procurement-simple/accountant/queue")
async def procurement_simple_accountant_queue(user: User = Depends(get_current_user)):
    """Accountant's material payment queue.
    Returns requests that are awaiting any kind of payment release (full/advance/balance).
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    rows = await db.material_requests.find(
        {"status": {"$in": ["pending_accounts_approval", "pending_balance_payment"]}}, {"_id": 0}
    ).sort("planning_approved_at", -1).to_list(500)
    # Enrich
    project_ids = list({r.get("project_id") for r in rows if r.get("project_id")})
    projects = {p["project_id"]: p for p in await db.projects.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}
    ).to_list(500)} if project_ids else {}
    for r in rows:
        r["project_name"] = (projects.get(r.get("project_id")) or {}).get("name", r.get("project_name") or "Unknown")
    return {"count": len(rows), "requests": rows}


@router.post("/procurement-simple/material-requests/{request_id}/release-payment")
async def procurement_simple_release_payment(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Accountant releases a payment for a material request.

    Body:
      - payment_phase: "full" | "advance" | "balance"
      - payment_method: "cash" | "bank" | "cheque"
      - bank_ref: optional
      - cheque_no, cheque_amount: optional
      - amount: amount to release (ignored for "full"/"advance" — auto-derived)
      - notes: optional
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant / Super Admin")

    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    phase = (data.get("payment_phase") or req.get("next_payment_phase") or "full").lower()
    if phase not in ("full", "advance", "balance"):
        raise HTTPException(status_code=400, detail="payment_phase must be full|advance|balance")
    method = (data.get("payment_method") or "bank").lower()
    if method not in ("cash", "bank", "cheque"):
        raise HTTPException(status_code=400, detail="payment_method must be cash|bank|cheque")

    total = float(req.get("total_amount") or 0)
    advance_amt = float(req.get("advance_amount") or 0)
    if phase == "full":
        if req.get("status") != "pending_accounts_approval":
            raise HTTPException(status_code=400, detail=f"Cannot release full payment in status: {req.get('status')}")
        amount = total
        new_status = "in_transit"
    elif phase == "advance":
        if req.get("status") != "pending_accounts_approval":
            raise HTTPException(status_code=400, detail=f"Cannot release advance in status: {req.get('status')}")
        amount = advance_amt
        if amount <= 0:
            raise HTTPException(status_code=400, detail="No advance amount configured")
        new_status = "in_transit"
    else:  # balance
        if req.get("status") != "pending_balance_payment":
            raise HTTPException(status_code=400, detail=f"Cannot release balance in status: {req.get('status')}")
        amount = max(0.0, total - float(req.get("paid_amount") or 0))
        new_status = "delivered"

    # Method-specific extras
    bank_ref = (data.get("bank_ref") or "").strip()
    cheque_no = (data.get("cheque_no") or "").strip()
    cheque_amount = float(data.get("cheque_amount") or 0)
    notes = (data.get("notes") or "").strip()
    now = datetime.now(timezone.utc).isoformat()

    # Cashbook expense entry
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    proj = await db.projects.find_one({"project_id": req.get("project_id")}, {"_id": 0, "name": 1})
    cashbook_entry = {
        "expense_id": expense_id,
        "project_id": req.get("project_id"),
        "project_name": (proj or {}).get("name", req.get("project_name", "")),
        "category": "material",
        "expense_type": "material",
        "description": f"{req.get('material_name')} ({phase} payment) — {req.get('vendor_name')}",
        "amount": amount,
        "approved_amount": amount,
        "payment_method": {"bank": "bank_transfer", "cash": "cash", "cheque": "cheque"}.get(method, method),
        "transaction_id": bank_ref or cheque_no or "",
        "cheque_no": cheque_no if method == "cheque" else None,
        "cheque_amount": cheque_amount if method == "cheque" else None,
        "bank_ref": bank_ref if method == "bank" else None,
        "vendor_name": req.get("vendor_name"),
        "vendor_id": req.get("vendor_id"),
        "material_request_id": request_id,
        "request_id": request_id,
        "request_type": "material",
        "payment_phase": phase,
        "remarks": notes,
        "status": "approved",
        "source": "material_release",
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "created_at": now,
        "approved_at": now,
        "approved_by": user.user_id,
        "payment_date": data.get("payment_date") or now,
    }
    await db.recorded_expenses.insert_one(cashbook_entry)

    # Update material_request
    paid_total = float(req.get("paid_amount") or 0) + amount
    update = {
        "status": new_status,
        "paid_amount": paid_total,
        "balance_amount": max(0.0, total - paid_total),
        "last_payment_phase": phase,
        "last_payment_at": now,
        "last_payment_by": user.user_id,
        "last_payment_method": method,
        "last_expense_id": expense_id,
    }
    if phase in ("full", "advance"):
        update["transit_started_at"] = now
        update["transit_started_by"] = user.user_id
    if phase == "balance":
        update["delivered_at"] = req.get("delivered_at") or now
        update["next_payment_phase"] = None
    await db.material_requests.update_one({"request_id": request_id}, {"$set": update})

    # Notify next handler
    if new_status == "in_transit" and req.get("site_engineer_id"):
        try:
            await create_notification(req["site_engineer_id"], f"Payment released — {req.get('material_name')} now in transit. Mark received on delivery.")
        except Exception:
            pass
    if new_status == "delivered":
        try:
            for uid in {req.get("site_engineer_id"), req.get("created_by")} - {None}:
                await create_notification(uid, f"Material delivered & balance paid: {req.get('material_name')}")
        except Exception:
            pass

    await create_audit_log(user.user_id, f"release_{phase}", "material_request", request_id, update)
    return {"message": "Payment released", "expense_id": expense_id, "amount": amount, "status": new_status}


@router.post("/procurement-simple/material-requests/{request_id}/mark-received")
async def procurement_simple_mark_received(request_id: str, data: dict, user: User = Depends(get_current_user)):
    """Site Engineer marks an in-transit material as received.
    Routing depends on payment_mode:
      pre_paid     → delivered (no further payment)
      advance      → pending_balance_payment (Planning → Accountant for balance)
      credit       → delivered + create credit ledger due in `credit_days`
      post_delivery → pending_accounts_approval (Accountant pays full)
    """
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Site Engineer / PM can mark received")
    req = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") != "in_transit":
        raise HTTPException(status_code=400, detail=f"Cannot mark received in status: {req.get('status')}")

    payment_mode = (req.get("payment_mode") or "pre_paid").lower()
    now = datetime.now(timezone.utc).isoformat()
    received_qty = float(data.get("received_quantity") or req.get("approved_quantity") or req.get("quantity") or 0)
    notes = (data.get("notes") or "").strip()

    update = {
        "received_at": now,
        "received_by": user.user_id,
        "received_by_name": user.name,
        "received_quantity": received_qty,
        "delivery_notes": notes,
    }

    if payment_mode == "advance":
        update["status"] = "pending_balance_payment"
        update["next_payment_phase"] = "balance"
        accs = await db.users.find({"role": {"$in": ["accountant", "super_admin"]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(50)
        balance = max(0.0, float(req.get("total_amount") or 0) - float(req.get("paid_amount") or 0))
        for a in accs:
            try: await create_notification(a["user_id"], f"Balance payment due: {req.get('material_name')} ({fmt_money(balance)})")
            except Exception: pass
    elif payment_mode == "post_delivery":
        update["status"] = "pending_accounts_approval"
        update["next_payment_phase"] = "full"
        accs = await db.users.find({"role": {"$in": ["accountant", "super_admin"]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(50)
        for a in accs:
            try: await create_notification(a["user_id"], f"Post-delivery payment due: {req.get('material_name')} ({fmt_money(req.get('total_amount') or 0)})")
            except Exception: pass
    elif payment_mode == "credit":
        update["status"] = "delivered"
        update["delivered_at"] = now
        # Create credit ledger entry
        credit_days = int(req.get("credit_days") or 30)
        due_date = (datetime.now(timezone.utc) + timedelta(days=credit_days)).isoformat()
        ledger_id = f"vc_{uuid.uuid4().hex[:10]}"
        await db.vendor_credit_ledger.insert_one({
            "ledger_id": ledger_id,
            "request_id": request_id,
            "vendor_id": req.get("vendor_id"),
            "vendor_name": req.get("vendor_name"),
            "project_id": req.get("project_id"),
            "material_name": req.get("material_name"),
            "amount": float(req.get("total_amount") or 0),
            "credit_days": credit_days,
            "delivered_at": now,
            "due_date": due_date,
            "status": "pending",
            "created_at": now,
        })
        update["credit_ledger_id"] = ledger_id
        update["credit_due_date"] = due_date
    else:  # pre_paid
        update["status"] = "delivered"
        update["delivered_at"] = now

    await db.material_requests.update_one({"request_id": request_id}, {"$set": update})
    await create_audit_log(user.user_id, "mark_received", "material_request", request_id, update)
    return {"message": "Marked received", "status": update["status"], "payment_mode": payment_mode}


@router.get("/procurement-simple/credit-ledger")
async def procurement_simple_credit_ledger(
    status: str = "pending",  # pending | pending_planning_approval | pending_accountant_approval | paid | overdue | all
    from_date: Optional[str] = None,  # ISO date — filter on delivered_at >=
    to_date: Optional[str] = None,    # ISO date — filter on delivered_at <=
    user: User = Depends(get_current_user),
):
    """Vendor credit ledger — post-paid materials due in N days.
    Statuses follow the 3-step settlement chain:
    pending → pending_planning_approval → pending_accountant_approval → paid
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.PLANNING_PERSON]:
        raise HTTPException(status_code=403, detail="Permission denied")
    q = {}
    if status == "overdue":
        q = {"status": "pending", "due_date": {"$lt": datetime.now(timezone.utc).isoformat()}}
    elif status != "all":
        q = {"status": status}
    if from_date or to_date:
        delivered_q = {}
        if from_date:
            delivered_q["$gte"] = from_date
        if to_date:
            delivered_q["$lte"] = to_date
        q["delivered_at"] = delivered_q
    rows = await db.vendor_credit_ledger.find(q, {"_id": 0}).sort("due_date", 1).to_list(500)
    return {"count": len(rows), "entries": rows}


@router.post("/procurement-simple/credit-ledger/{ledger_id}/request-settlement")
async def procurement_simple_credit_request_settlement(
    ledger_id: str,
    data: dict = None,
    user: User = Depends(get_current_user),
):
    """Step 1 — Procurement clicks 'Collect Payment' on a credit ledger entry.
    Moves it to Planning's queue for approval before Accountant releases the cash.
    """
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement or Super Admin")
    entry = await db.vendor_credit_ledger.find_one({"ledger_id": ledger_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if entry.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot request settlement — current status: {entry.get('status')}")
    now = datetime.now(timezone.utc).isoformat()
    remarks = ((data or {}).get("remarks") or "").strip()
    await db.vendor_credit_ledger.update_one(
        {"ledger_id": ledger_id},
        {"$set": {
            "status": "pending_planning_approval",
            "settlement_requested_at": now,
            "settlement_requested_by": user.user_id,
            "settlement_requested_by_name": user.name,
            "settlement_remarks": remarks,
        }},
    )
    # Notify Planning users
    planners = await db.users.find({"role": {"$in": ["planning", "super_admin"]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        try: await create_notification(p["user_id"], f"Credit settlement awaiting approval: {entry.get('material_name')} — {entry.get('vendor_name')}")
        except Exception: pass
    await create_audit_log(user.user_id, "request_credit_settlement", "vendor_credit_ledger", ledger_id, {"vendor": entry.get("vendor_name")})
    return {"message": "Settlement requested — pending Planning approval", "status": "pending_planning_approval"}


@router.post("/planning/credit-ledger/{ledger_id}/approve")
async def planning_credit_approve(
    ledger_id: str,
    data: dict = None,
    user: User = Depends(get_current_user),
):
    """Step 2 — Planning approves the settlement request, forwarding it to Accountant."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning or Super Admin")
    entry = await db.vendor_credit_ledger.find_one({"ledger_id": ledger_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if entry.get("status") != "pending_planning_approval":
        raise HTTPException(status_code=400, detail=f"Cannot approve — current status: {entry.get('status')}")
    now = datetime.now(timezone.utc).isoformat()
    notes = ((data or {}).get("notes") or "").strip()
    await db.vendor_credit_ledger.update_one(
        {"ledger_id": ledger_id},
        {"$set": {
            "status": "pending_accountant_approval",
            "planning_approved_at": now,
            "planning_approved_by": user.user_id,
            "planning_approved_by_name": user.name,
            "planning_notes": notes,
        }},
    )
    accs = await db.users.find({"role": {"$in": ["accountant", "super_admin"]}, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(50)
    for a in accs:
        try: await create_notification(a["user_id"], f"Credit settlement ready for payment: {entry.get('material_name')} ({entry.get('amount')})")
        except Exception: pass
    await create_audit_log(user.user_id, "approve_credit_settlement", "vendor_credit_ledger", ledger_id, {})
    return {"message": "Approved — pending Accountant payment", "status": "pending_accountant_approval"}


@router.post("/planning/credit-ledger/{ledger_id}/reject")
async def planning_credit_reject(
    ledger_id: str,
    data: dict,
    user: User = Depends(get_current_user),
):
    """Planning rejects the settlement request, returning it to pending."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning or Super Admin")
    reason = (data.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    entry = await db.vendor_credit_ledger.find_one({"ledger_id": ledger_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    if entry.get("status") != "pending_planning_approval":
        raise HTTPException(status_code=400, detail=f"Cannot reject — current status: {entry.get('status')}")
    now = datetime.now(timezone.utc).isoformat()
    await db.vendor_credit_ledger.update_one(
        {"ledger_id": ledger_id},
        {"$set": {
            "status": "pending",
            "planning_rejected_at": now,
            "planning_rejection_reason": reason,
            "planning_rejected_by": user.user_id,
        }},
    )
    return {"message": "Rejected — returned to Procurement", "status": "pending"}


@router.post("/procurement-simple/credit-ledger/{ledger_id}/settle")
async def procurement_simple_credit_settle(ledger_id: str, data: dict, user: User = Depends(get_current_user)):
    """Step 3 — Accountant settles a vendor credit ledger entry (records expense).
    Requires status `pending_accountant_approval` (i.e. Planning has already approved).
    Super Admin may settle from any active state for emergency overrides.
    """
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accountant")
    entry = await db.vendor_credit_ledger.find_one({"ledger_id": ledger_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Credit entry not found")
    valid_states = ["pending_accountant_approval"] if user.role == UserRole.ACCOUNTANT else ["pending", "pending_planning_approval", "pending_accountant_approval"]
    if entry.get("status") not in valid_states:
        raise HTTPException(status_code=400, detail=f"Cannot settle — current status: {entry.get('status')}. Must be 'pending_accountant_approval'.")
    method = (data.get("payment_method") or "bank").lower()
    if method not in ("cash", "bank", "cheque"):
        raise HTTPException(status_code=400, detail="Invalid method")
    bank_ref = (data.get("bank_ref") or "").strip()
    cheque_no = (data.get("cheque_no") or "").strip()
    notes = (data.get("notes") or "").strip()
    now = datetime.now(timezone.utc).isoformat()

    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    proj = await db.projects.find_one({"project_id": entry.get("project_id")}, {"_id": 0, "name": 1})
    await db.recorded_expenses.insert_one({
        "expense_id": expense_id,
        "project_id": entry.get("project_id"),
        "project_name": (proj or {}).get("name", ""),
        "category": "material",
        "expense_type": "material",
        "description": f"{entry.get('material_name')} (credit settlement) — {entry.get('vendor_name')}",
        "amount": entry.get("amount", 0),
        "approved_amount": entry.get("amount", 0),
        "payment_method": {"bank": "bank_transfer", "cash": "cash", "cheque": "cheque"}.get(method, method),
        "transaction_id": bank_ref or cheque_no or "",
        "vendor_name": entry.get("vendor_name"),
        "vendor_id": entry.get("vendor_id"),
        "material_request_id": entry.get("request_id"),
        "request_type": "material_credit_settlement",
        "remarks": notes,
        "status": "approved",
        "source": "credit_settlement",
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "created_at": now,
        "approved_at": now,
        "approved_by": user.user_id,
        "payment_date": data.get("payment_date") or now,
    })
    await db.vendor_credit_ledger.update_one({"ledger_id": ledger_id}, {"$set": {
        "status": "paid",
        "paid_at": now,
        "paid_by": user.user_id,
        "expense_id": expense_id,
    }})
    # Mark the parent material request fully paid
    if entry.get("request_id"):
        await db.material_requests.update_one(
            {"request_id": entry["request_id"]},
            {"$set": {"paid_amount": entry.get("amount", 0), "balance_amount": 0, "credit_settled_at": now}},
        )
    return {"message": "Credit settled", "expense_id": expense_id}

