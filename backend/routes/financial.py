"""
Financial Routes - Income, Enhanced Project View, Expenses (Material, Labour, Vendor), Payment Recording, Summary, Settings, Materials, Vendor Master, Users
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
import logging
from bson import ObjectId

from core.database import db, fs
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import *
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== INCOME MODULE ENDPOINTS ====================

class IncomeCreate(BaseModel):
    project_id: str
    amount: float
    payment_mode: str  # cash, cheque, bank_transfer, upi, petty_cash
    payment_date: str  # ISO date string
    cheque_number: Optional[str] = None
    bank_name: Optional[str] = None
    reference_number: Optional[str] = None
    remarks: Optional[str] = None


class IncomeUpdate(BaseModel):
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_date: Optional[str] = None
    cheque_number: Optional[str] = None
    bank_name: Optional[str] = None
    reference_number: Optional[str] = None
    remarks: Optional[str] = None


@router.get("/income")
async def get_all_income(
    project_id: Optional[str] = None,
    payment_mode: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all income entries with optional filters"""
    # IDOR Fix: Only financial/management roles can access income data
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if payment_mode:
        query["payment_mode"] = payment_mode
    
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            query["payment_date"] = date_query
    
    income_entries = await db.income.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    
    # Get project names for display
    project_ids = list(set(e.get("project_id") for e in income_entries if e.get("project_id")))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for entry in income_entries:
        entry["project_name"] = project_map.get(entry.get("project_id"), "Unknown")
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])
    
    return income_entries


@router.get("/income/summary")
async def get_income_summary(user: User = Depends(get_current_user)):
    """Get income summary with totals by payment mode"""
    # IDOR Fix: Only financial/management roles can access income summary
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    income_entries = await db.income.find({}, {"_id": 0}).to_list(10000)
    
    summary = {
        "total_income": 0,
        "cash": 0,
        "cheque": 0,
        "bank_transfer": 0,
        "upi": 0,
        "petty_cash": 0,
        "entry_count": len(income_entries)
    }
    
    for entry in income_entries:
        amount = entry.get("amount", 0)
        mode = entry.get("payment_mode", "cash")
        summary["total_income"] += amount
        if mode in summary:
            summary[mode] += amount
    
    return summary


@router.get("/projects/{project_id}/income")
async def get_project_income(project_id: str, user: User = Depends(get_current_user)):
    """Get all income entries for a specific project"""
    # IDOR Fix: Only financial/management roles can access project income
    income_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT,
        UserRole.PROJECT_MANAGER, UserRole.CRE
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    income_entries = await db.income.find({"project_id": project_id}, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    
    for entry in income_entries:
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])
    
    # Calculate project income summary
    summary = {
        "total_income": sum(e.get("amount", 0) for e in income_entries),
        "cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cash"),
        "cheque": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cheque"),
        "bank_transfer": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "bank_transfer"),
        "upi": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "upi"),
        "petty_cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "petty_cash"),
    }
    
    return {
        "entries": income_entries,
        "summary": summary
    }


@router.post("/income")
async def create_income_entry(income_input: IncomeCreate, user: User = Depends(get_current_user)):
    """Create a new income entry and update project payment received"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Validate project exists
    project = await db.projects.find_one({"project_id": income_input.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    income = IncomeEntry(
        project_id=income_input.project_id,
        amount=income_input.amount,
        payment_mode=PaymentMode(income_input.payment_mode),
        payment_date=datetime.fromisoformat(income_input.payment_date),
        cheque_number=income_input.cheque_number,
        bank_name=income_input.bank_name,
        reference_number=income_input.reference_number,
        remarks=income_input.remarks,
        recorded_by=user.user_id
    )
    
    income_dict = income.model_dump()
    income_dict["payment_mode"] = income_dict["payment_mode"].value
    income_dict["payment_date"] = income_dict["payment_date"].isoformat()
    income_dict["created_at"] = income_dict["created_at"].isoformat()
    
    await db.income.insert_one(income_dict)
    
    # Update project's income_project field (payment received)
    current_income = project.get("income_project", 0)
    await db.projects.update_one(
        {"project_id": income_input.project_id},
        {"$set": {"income_project": current_income + income_input.amount}}
    )
    
    await create_audit_log(user.user_id, "create", "income", income.income_id, {
        "project_id": income_input.project_id,
        "amount": income_input.amount,
        "payment_mode": income_input.payment_mode
    })
    
    return income


@router.patch("/income/{income_id}")
async def update_income_entry(income_id: str, update_data: IncomeUpdate, user: User = Depends(get_current_user)):
    """Update an income entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Income entry not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # If amount changed, update project income
    if "amount" in update_dict:
        old_amount = existing.get("amount", 0)
        new_amount = update_dict["amount"]
        difference = new_amount - old_amount
        
        project = await db.projects.find_one({"project_id": existing["project_id"]}, {"_id": 0})
        if project:
            current_income = project.get("income_project", 0)
            await db.projects.update_one(
                {"project_id": existing["project_id"]},
                {"$set": {"income_project": current_income + difference}}
            )
    
    await db.income.update_one({"income_id": income_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "income", income_id, update_dict)
    
    return {"message": "Income entry updated"}


@router.delete("/income/{income_id}")
async def delete_income_entry(income_id: str, user: User = Depends(get_current_user)):
    """Delete an income entry and update project payment received"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    existing = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Income entry not found")
    
    # Update project's income_project field
    project = await db.projects.find_one({"project_id": existing["project_id"]}, {"_id": 0})
    if project:
        current_income = project.get("income_project", 0)
        await db.projects.update_one(
            {"project_id": existing["project_id"]},
            {"$set": {"income_project": max(0, current_income - existing.get("amount", 0))}}
        )
    
    await db.income.delete_one({"income_id": income_id})
    await create_audit_log(user.user_id, "delete", "income", income_id, {"amount": existing.get("amount", 0)})
    
    return {"message": "Income entry deleted"}


# ==================== ENHANCED PROJECT VIEW ENDPOINT ====================

@router.get("/projects/{project_id}/full-details")
async def get_project_full_details(project_id: str, user: User = Depends(get_current_user)):
    """Get complete project details with scope, payments, additions, and deductions"""
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get scope items
    scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for item in scope_items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    
    # Get payment stages
    payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for stage in payment_stages:
        if isinstance(stage.get("due_date"), str):
            stage["due_date"] = datetime.fromisoformat(stage["due_date"])
        if isinstance(stage.get("completed_date"), str):
            stage["completed_date"] = datetime.fromisoformat(stage["completed_date"])
        if isinstance(stage.get("created_at"), str):
            stage["created_at"] = datetime.fromisoformat(stage["created_at"])
    
    # Get additional costs
    additional_costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for cost in additional_costs:
        if isinstance(cost.get("created_at"), str):
            cost["created_at"] = datetime.fromisoformat(cost["created_at"])
    
    # Get deductions
    deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for d in deductions:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    
    # Calculate totals
    scope_total = sum(item.get("total_amount", 0) for item in scope_items)
    additions_total = sum(cost.get("estimated_amount", 0) for cost in additional_costs)
    additions_received = sum(cost.get("income_received", 0) for cost in additional_costs)
    deductions_total = sum(d.get("amount", 0) for d in deductions)
    
    # Get income entries for this project (actual received payments)
    income_entries = await db.income.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for entry in income_entries:
        if isinstance(entry.get("payment_date"), str):
            entry["payment_date"] = datetime.fromisoformat(entry["payment_date"])
        if isinstance(entry.get("created_at"), str):
            entry["created_at"] = datetime.fromisoformat(entry["created_at"])
    
    # Income summary by payment mode
    income_total = sum(e.get("amount", 0) for e in income_entries)
    income_by_mode = {
        "cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cash"),
        "cheque": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "cheque"),
        "bank_transfer": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "bank_transfer"),
        "upi": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "upi"),
        "petty_cash": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "petty_cash"),
    }
    
    # Payment schedule totals (requested payments - milestones)
    payment_total = sum(stage.get("amount", 0) for stage in payment_stages)
    
    # Project value = Scope total (or original project value if no scope items)
    project_value = scope_total if scope_items else project.get("total_value", 0)
    
    # Total value = Project Value + Additions
    total_value = project_value + additions_total
    
    # Balance = Total Value - Income Received - Deductions
    balance = total_value - income_total - additions_received - deductions_total
    
    return {
        "project": project,
        "scope_items": scope_items,
        "payment_stages": payment_stages,
        "additional_costs": additional_costs,
        "deductions": deductions,
        "income_entries": income_entries,
        "summary": {
            "scope_total": scope_total,
            "project_value": project_value,
            "additions_total": additions_total,
            "additions_received": additions_received,
            "total_value": total_value,
            "payment_schedule_total": payment_total,
            "income_total": income_total,
            "income_by_mode": income_by_mode,
            "deductions_total": deductions_total,
            "balance": balance
        }
    }


# ==================== EXPENSE MODULE ENDPOINTS ====================

# Pydantic models for request/response
class MaterialExpenseCreate(BaseModel):
    project_id: str
    material_name: str
    material_type: Optional[str] = None
    quantity: float
    unit: str = "units"
    required_date: str
    remarks: Optional[str] = None


class LabourExpenseCreate(BaseModel):
    project_id: str
    labour_type: str
    num_workers: int
    days_worked: float
    rate_per_day: float
    work_date: str
    remarks: Optional[str] = None


class VendorServiceExpenseCreate(BaseModel):
    project_id: str
    vendor_name: str
    vendor_id: Optional[str] = None
    service_type: str
    amount: float
    invoice_number: Optional[str] = None
    remarks: Optional[str] = None


class VendorQuoteInput(BaseModel):
    vendor_id: str
    vendor_name: str
    unit_price: float
    quantity: float


class ApprovalAction(BaseModel):
    action: str  # approved, rejected
    comments: Optional[str] = None


class PaymentInput(BaseModel):
    payment_type: str  # credit, advance, full
    amount: float = 0
    payment_mode: Optional[str] = None
    reference: Optional[str] = None


# Helper function to get expense from any collection
async def get_expense_by_id(expense_id: str):
    """Get expense from any collection based on prefix"""
    if expense_id.startswith("mexp_"):
        return await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "material_expenses"
    elif expense_id.startswith("lexp_"):
        return await db.labour_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "labour_expenses"
    elif expense_id.startswith("vexp_"):
        return await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0}), "vendor_service_expenses"
    return None, None


# ==================== MATERIAL EXPENSE ENDPOINTS ====================

@router.get("/expenses/material")
async def get_material_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material expenses - filtered by role"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    # Role-based filtering
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    elif user.role == UserRole.PLANNING:
        query["status"] = {"$in": ["requested", "planning_approved", "planning_rejected"]}
    elif user.role == UserRole.PROCUREMENT:
        query["status"] = {"$in": ["planning_approved", "procurement_priced"]}
    elif user.role == UserRole.ACCOUNTANT:
        query["status"] = {"$in": ["procurement_priced", "accounts_approved", "accounts_rejected"]}
    
    expenses = await db.material_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get project names
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/material")
async def create_material_expense(expense_input: MaterialExpenseCreate, user: User = Depends(get_current_user)):
    """Create material expense request - Site Engineer only"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create material requests")
    
    expense = MaterialExpense(
        project_id=expense_input.project_id,
        material_name=expense_input.material_name,
        material_type=expense_input.material_type,
        quantity=expense_input.quantity,
        unit=expense_input.unit,
        required_date=datetime.fromisoformat(expense_input.required_date),
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name
    )
    
    expense_dict = expense.model_dump()
    expense_dict["required_date"] = expense_dict["required_date"].isoformat()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.material_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "material_expense", expense.expense_id, {
        "material_name": expense.material_name,
        "quantity": expense.quantity
    })
    
    # Create notification for Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New material request: {expense.material_name} for review")
    
    return expense


@router.patch("/expenses/material/{expense_id}/planning-approval")
async def planning_approve_material(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning department approval for material expense"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning department can approve")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "requested":
        raise HTTPException(status_code=400, detail="Expense is not in requested status")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    # Notify relevant parties
    if action.action == "approved":
        procurement_users = await db.users.find({"role": "procurement"}, {"_id": 0, "user_id": 1}).to_list(100)
        for pu in procurement_users:
            await create_notification(pu["user_id"], f"Material request approved for pricing: {expense['material_name']}")
    else:
        await create_notification(expense["requested_by"], f"Material request rejected: {expense['material_name']}")
    
    await create_audit_log(user.user_id, "approve", "material_expense", expense_id, {"action": action.action})
    
    return {"message": f"Material expense {action.action}"}


@router.patch("/expenses/material/{expense_id}/procurement-pricing")
async def procurement_price_material(expense_id: str, quotes: List[VendorQuoteInput], selected_vendor_id: str, user: User = Depends(get_current_user)):
    """Procurement adds vendor pricing"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can add pricing")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "planning_approved":
        raise HTTPException(status_code=400, detail="Expense must be planning approved first")
    
    vendor_quotes = []
    final_amount = 0
    
    for q in quotes:
        total_price = q.unit_price * q.quantity
        vendor_quotes.append({
            "vendor_id": q.vendor_id,
            "vendor_name": q.vendor_name,
            "unit_price": q.unit_price,
            "quantity": q.quantity,
            "total_price": total_price,
            "is_selected": q.vendor_id == selected_vendor_id
        })
        if q.vendor_id == selected_vendor_id:
            final_amount = total_price
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "procurement",
        "action": "priced",
        "comments": f"Selected vendor: {selected_vendor_id}, Amount: {final_amount}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {
                "status": "procurement_priced",
                "vendor_quotes": vendor_quotes,
                "selected_vendor_id": selected_vendor_id,
                "final_amount": final_amount,
                "balance": final_amount,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {"approvals": approval}
        }
    )
    
    # Notify Accounts
    accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
    for au in accounts_users:
        await create_notification(au["user_id"], f"Material expense ready for approval: {expense['material_name']} - ₹{final_amount}")
    
    await create_audit_log(user.user_id, "price", "material_expense", expense_id, {"final_amount": final_amount})
    
    return {"message": "Pricing added", "final_amount": final_amount}


@router.patch("/expenses/material/{expense_id}/accounts-approval")
async def accounts_approve_material(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts department final approval"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can give final approval")
    
    expense = await db.material_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") != "procurement_priced":
        raise HTTPException(status_code=400, detail="Expense must have procurement pricing first")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.material_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    # Notify
    if action.action == "approved":
        await create_notification(expense["requested_by"], f"Material expense approved for payment: {expense['material_name']}")
    else:
        await create_notification(expense["requested_by"], f"Material expense rejected by accounts: {expense['material_name']}")
    
    await create_audit_log(user.user_id, "accounts_approve", "material_expense", expense_id, {"action": action.action})
    
    return {"message": f"Material expense {action.action}"}


# ==================== LABOUR EXPENSE ENDPOINTS ====================

@router.get("/expenses/labour")
async def get_labour_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get labour expenses"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    # Role-based filtering
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    elif user.role == UserRole.PLANNING:
        query["status"] = {"$in": ["requested", "planning_approved", "planning_rejected"]}
    elif user.role == UserRole.ACCOUNTANT:
        query["status"] = {"$in": ["planning_approved", "accounts_approved", "accounts_rejected"]}
    
    expenses = await db.labour_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get project names
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/labour")
async def create_labour_expense(expense_input: LabourExpenseCreate, user: User = Depends(get_current_user)):
    """Create labour expense - Site Engineer"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create labour expenses")
    
    total_amount = expense_input.num_workers * expense_input.days_worked * expense_input.rate_per_day
    
    expense = LabourExpense(
        project_id=expense_input.project_id,
        labour_type=expense_input.labour_type,
        num_workers=expense_input.num_workers,
        days_worked=expense_input.days_worked,
        rate_per_day=expense_input.rate_per_day,
        total_amount=total_amount,
        work_date=datetime.fromisoformat(expense_input.work_date),
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name,
        balance=total_amount
    )
    
    expense_dict = expense.model_dump()
    expense_dict["work_date"] = expense_dict["work_date"].isoformat()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.labour_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "labour_expense", expense.expense_id, {
        "labour_type": expense.labour_type,
        "total_amount": total_amount
    })
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New labour expense: {expense.labour_type} - ₹{total_amount}")
    
    return expense


@router.patch("/expenses/labour/{expense_id}/planning-approval")
async def planning_approve_labour(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning approval for labour expense"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can approve")
    
    expense = await db.labour_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.labour_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    if action.action == "approved":
        accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
        for au in accounts_users:
            await create_notification(au["user_id"], f"Labour expense for approval: {expense['labour_type']}")
    
    return {"message": f"Labour expense {action.action}"}


@router.patch("/expenses/labour/{expense_id}/accounts-approval")
async def accounts_approve_labour(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts approval for labour expense"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve")
    
    expense = await db.labour_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.labour_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    await create_notification(expense["requested_by"], f"Labour expense {action.action}: {expense['labour_type']}")
    
    return {"message": f"Labour expense {action.action}"}


# ==================== VENDOR SERVICE EXPENSE ENDPOINTS ====================

@router.get("/expenses/vendor-service")
async def get_vendor_service_expenses(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get vendor/service expenses"""
    query = {}
    
    if project_id:
        query["project_id"] = project_id
    
    if status:
        query["status"] = status
    
    if user.role == UserRole.SITE_ENGINEER:
        query["requested_by"] = user.user_id
    
    expenses = await db.vendor_service_expenses.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    project_ids = list(set(e.get("project_id") for e in expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp in expenses:
        exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return expenses


@router.post("/expenses/vendor-service")
async def create_vendor_service_expense(expense_input: VendorServiceExpenseCreate, user: User = Depends(get_current_user)):
    """Create vendor/service expense"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    expense = VendorServiceExpense(
        project_id=expense_input.project_id,
        vendor_name=expense_input.vendor_name,
        vendor_id=expense_input.vendor_id,
        service_type=expense_input.service_type,
        amount=expense_input.amount,
        invoice_number=expense_input.invoice_number,
        remarks=expense_input.remarks,
        requested_by=user.user_id,
        requested_by_name=user.name,
        balance=expense_input.amount
    )
    
    expense_dict = expense.model_dump()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    expense_dict["updated_at"] = expense_dict["updated_at"].isoformat()
    
    await db.vendor_service_expenses.insert_one(expense_dict)
    await create_audit_log(user.user_id, "create", "vendor_service_expense", expense.expense_id, {
        "vendor_name": expense.vendor_name,
        "amount": expense.amount
    })
    
    # Notify Planning
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(100)
    for pu in planning_users:
        await create_notification(pu["user_id"], f"New vendor expense: {expense.vendor_name} - ₹{expense.amount}")
    
    return expense


@router.patch("/expenses/vendor-service/{expense_id}/planning-approval")
async def planning_approve_vendor_service(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Planning approval for vendor/service expense"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can approve")
    
    expense = await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "planning",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "planning_approved" if action.action == "approved" else "planning_rejected"
    
    await db.vendor_service_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    if action.action == "approved":
        accounts_users = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
        for au in accounts_users:
            await create_notification(au["user_id"], f"Vendor expense for approval: {expense['vendor_name']}")
    
    return {"message": f"Vendor expense {action.action}"}


@router.patch("/expenses/vendor-service/{expense_id}/accounts-approval")
async def accounts_approve_vendor_service(expense_id: str, action: ApprovalAction, user: User = Depends(get_current_user)):
    """Accounts approval for vendor/service expense"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can approve")
    
    expense = await db.vendor_service_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    approval = {
        "approved_by": user.user_id,
        "approved_by_name": user.name,
        "role": "accounts",
        "action": action.action,
        "comments": action.comments,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    new_status = "accounts_approved" if action.action == "approved" else "accounts_rejected"
    
    await db.vendor_service_expenses.update_one(
        {"expense_id": expense_id},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    await create_notification(expense["requested_by"], f"Vendor expense {action.action}: {expense['vendor_name']}")
    
    return {"message": f"Vendor expense {action.action}"}


# ==================== PAYMENT RECORDING FOR EXPENSES ====================

@router.patch("/expenses/{expense_id}/payment")
async def record_expense_payment(expense_id: str, payment_input: PaymentInput, user: User = Depends(get_current_user)):
    """Record payment for any expense type"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can record payments")
    
    expense, collection_name = await get_expense_by_id(expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    if expense.get("status") not in ["accounts_approved", "super_admin_approved"]:
        raise HTTPException(status_code=400, detail="Expense must be approved first")
    
    payment = {
        "payment_id": f"epay_{uuid.uuid4().hex[:12]}",
        "payment_type": payment_input.payment_type,
        "amount": payment_input.amount,
        "payment_date": datetime.now(timezone.utc).isoformat(),
        "payment_mode": payment_input.payment_mode,
        "reference": payment_input.reference,
        "recorded_by": user.user_id
    }
    
    # Calculate new totals
    final_amount = expense.get("final_amount") or expense.get("total_amount") or expense.get("amount", 0)
    current_paid = expense.get("total_paid", 0)
    
    if payment_input.payment_type == "credit":
        new_paid = current_paid
        new_balance = final_amount - current_paid
        payment_status = "credit"
    elif payment_input.payment_type == "advance":
        new_paid = current_paid + payment_input.amount
        new_balance = final_amount - new_paid
        payment_status = "partial" if new_balance > 0 else "paid"
    else:  # full
        new_paid = final_amount
        new_balance = 0
        payment_status = "paid"
        payment["amount"] = final_amount - current_paid
    
    update_data = {
        "payment_type": payment_input.payment_type,
        "payment_status": payment_status,
        "total_paid": new_paid,
        "balance": new_balance,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if payment_status == "paid":
        update_data["status"] = "completed"
    
    await db[collection_name].update_one(
        {"expense_id": expense_id},
        {
            "$set": update_data,
            "$push": {"payments": payment}
        }
    )
    
    # Update project expense total
    project_id = expense.get("project_id")
    if project_id and payment_input.amount > 0:
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project:
            current_expense = project.get("total_expense", 0)
            await db.projects.update_one(
                {"project_id": project_id},
                {"$set": {"total_expense": current_expense + payment_input.amount}}
            )
    
    await create_audit_log(user.user_id, "payment", collection_name.replace("_expenses", "_expense"), expense_id, {
        "payment_type": payment_input.payment_type,
        "amount": payment_input.amount
    })
    
    return {"message": "Payment recorded", "payment_status": payment_status, "balance": new_balance}


# ==================== EXPENSE SUMMARY ENDPOINTS ====================

@router.get("/expenses/summary")
async def get_expense_summary(user: User = Depends(get_current_user)):
    """Get overall expense summary"""
    material_expenses = await db.material_expenses.find({}, {"_id": 0}).to_list(10000)
    labour_expenses = await db.labour_expenses.find({}, {"_id": 0}).to_list(10000)
    vendor_expenses = await db.vendor_service_expenses.find({}, {"_id": 0}).to_list(10000)
    
    def sum_expenses(expenses, amount_field):
        return sum(e.get(amount_field, 0) for e in expenses)
    
    def sum_paid(expenses):
        return sum(e.get("total_paid", 0) for e in expenses)
    
    def count_by_status(expenses, status):
        return len([e for e in expenses if e.get("status") == status])
    
    return {
        "material": {
            "count": len(material_expenses),
            "total_amount": sum_expenses(material_expenses, "final_amount"),
            "total_paid": sum_paid(material_expenses),
            "pending_approval": count_by_status(material_expenses, "requested") + count_by_status(material_expenses, "planning_approved") + count_by_status(material_expenses, "procurement_priced"),
            "approved": count_by_status(material_expenses, "accounts_approved"),
            "completed": count_by_status(material_expenses, "completed")
        },
        "labour": {
            "count": len(labour_expenses),
            "total_amount": sum_expenses(labour_expenses, "total_amount"),
            "total_paid": sum_paid(labour_expenses),
            "pending_approval": count_by_status(labour_expenses, "requested") + count_by_status(labour_expenses, "planning_approved"),
            "approved": count_by_status(labour_expenses, "accounts_approved"),
            "completed": count_by_status(labour_expenses, "completed")
        },
        "vendor_service": {
            "count": len(vendor_expenses),
            "total_amount": sum_expenses(vendor_expenses, "amount"),
            "total_paid": sum_paid(vendor_expenses),
            "pending_approval": count_by_status(vendor_expenses, "requested") + count_by_status(vendor_expenses, "planning_approved"),
            "approved": count_by_status(vendor_expenses, "accounts_approved"),
            "completed": count_by_status(vendor_expenses, "completed")
        },
        "totals": {
            "total_expenses": sum_expenses(material_expenses, "final_amount") + sum_expenses(labour_expenses, "total_amount") + sum_expenses(vendor_expenses, "amount"),
            "total_paid": sum_paid(material_expenses) + sum_paid(labour_expenses) + sum_paid(vendor_expenses),
            "total_credit": sum(e.get("balance", 0) for e in material_expenses + labour_expenses + vendor_expenses if e.get("payment_status") == "credit")
        }
    }


@router.get("/expenses/pending-approvals")
async def get_pending_expense_approvals(user: User = Depends(get_current_user)):
    """Get pending expense approvals based on user role"""
    result = {
        "material": [],
        "labour": [],
        "vendor_service": []
    }
    
    if user.role == UserRole.PLANNING or user.role == UserRole.SUPER_ADMIN:
        result["material"] = await db.material_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
        result["labour"] = await db.labour_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
        result["vendor_service"] = await db.vendor_service_expenses.find({"status": "requested"}, {"_id": 0}).to_list(100)
    
    if user.role == UserRole.PROCUREMENT or user.role == UserRole.SUPER_ADMIN:
        result["material"].extend(await db.material_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
    
    if user.role == UserRole.ACCOUNTANT or user.role == UserRole.SUPER_ADMIN:
        result["material"].extend(await db.material_expenses.find({"status": "procurement_priced"}, {"_id": 0}).to_list(100))
        result["labour"].extend(await db.labour_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
        result["vendor_service"].extend(await db.vendor_service_expenses.find({"status": "planning_approved"}, {"_id": 0}).to_list(100))
    
    # Add project names
    all_expenses = result["material"] + result["labour"] + result["vendor_service"]
    project_ids = list(set(e.get("project_id") for e in all_expenses))
    projects = await db.projects.find({"project_id": {"$in": project_ids}}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000)
    project_map = {p["project_id"]: p["name"] for p in projects}
    
    for exp_list in [result["material"], result["labour"], result["vendor_service"]]:
        for exp in exp_list:
            exp["project_name"] = project_map.get(exp.get("project_id"), "Unknown")
    
    return result


@router.get("/projects/{project_id}/expenses")
async def get_project_expenses(project_id: str, user: User = Depends(get_current_user)):
    """Get all expenses for a project"""
    material = await db.material_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    labour = await db.labour_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    vendor = await db.vendor_service_expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    material_total = sum(e.get("final_amount", 0) for e in material)
    labour_total = sum(e.get("total_amount", 0) for e in labour)
    vendor_total = sum(e.get("amount", 0) for e in vendor)
    
    material_paid = sum(e.get("total_paid", 0) for e in material)
    labour_paid = sum(e.get("total_paid", 0) for e in labour)
    vendor_paid = sum(e.get("total_paid", 0) for e in vendor)
    
    return {
        "material": material,
        "labour": labour,
        "vendor_service": vendor,
        "summary": {
            "material_total": material_total,
            "material_paid": material_paid,
            "labour_total": labour_total,
            "labour_paid": labour_paid,
            "vendor_total": vendor_total,
            "vendor_paid": vendor_paid,
            "total_expenses": material_total + labour_total + vendor_total,
            "total_paid": material_paid + labour_paid + vendor_paid,
            "total_balance": (material_total - material_paid) + (labour_total - labour_paid) + (vendor_total - vendor_paid)
        }
    }


# ==================== COMPANY SETTINGS ENDPOINTS ====================

class CompanySettingsCreate(BaseModel):
    company_name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: str = "INR"
    financial_year_start: str = "April"


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: Optional[str] = None
    financial_year_start: Optional[str] = None


@router.get("/settings/company")
async def get_company_settings(user: User = Depends(get_current_user)):
    """Get company settings (creates default if not exists)"""
    settings = await db.company_settings.find_one({}, {"_id": 0})
    if not settings:
        # Return default settings
        return {
            "settings_id": None,
            "company_name": "ConstructionOS",
            "logo_url": None,
            "address": "",
            "contact_number": "",
            "email": "",
            "gst_number": "",
            "default_currency": "INR",
            "financial_year_start": "April"
        }
    return settings


@router.post("/settings/company")
async def create_or_update_company_settings(
    settings_input: CompanySettingsCreate,
    user: User = Depends(get_current_user)
):
    """Create or update company settings (only Super Admin)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update company settings")
    
    existing = await db.company_settings.find_one({}, {"_id": 0})
    
    if existing:
        # Update existing
        update_data = settings_input.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.company_settings.update_one({}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "company_settings", existing.get("settings_id", ""), update_data)
        updated = await db.company_settings.find_one({}, {"_id": 0})
        return updated
    else:
        # Create new
        settings = CompanySettings(**settings_input.model_dump())
        settings_dict = settings.model_dump()
        settings_dict["created_at"] = settings_dict["created_at"].isoformat()
        settings_dict["updated_at"] = settings_dict["updated_at"].isoformat()
        await db.company_settings.insert_one(settings_dict)
        await create_audit_log(user.user_id, "create", "company_settings", settings.settings_id, {"company_name": settings.company_name})
        # Remove _id if MongoDB added it
        settings_dict.pop("_id", None)
        return settings_dict


@router.patch("/settings/company")
async def patch_company_settings(
    settings_input: CompanySettingsUpdate,
    user: User = Depends(get_current_user)
):
    """Partially update company settings"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update company settings")
    
    existing = await db.company_settings.find_one({}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Company settings not found. Create settings first.")
    
    update_data = {k: v for k, v in settings_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.company_settings.update_one({}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "company_settings", existing.get("settings_id", ""), update_data)
    
    return await db.company_settings.find_one({}, {"_id": 0})


# ==================== MATERIAL MANAGEMENT ENDPOINTS ====================

class MaterialCreate(BaseModel):
    name: str
    category: str  # MaterialCategory enum value
    unit: str
    description: Optional[str] = None
    hsn_code: Optional[str] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    hsn_code: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/materials")
async def get_materials(
    category: Optional[str] = None,
    active_only: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all materials with optional filters"""
    query = {}
    if category:
        query["category"] = category
    if active_only:
        query["is_active"] = True
    
    materials = await db.materials.find(query, {"_id": 0}).to_list(10000)
    for mat in materials:
        if isinstance(mat.get("created_at"), str):
            mat["created_at"] = datetime.fromisoformat(mat["created_at"])
        if isinstance(mat.get("updated_at"), str):
            mat["updated_at"] = datetime.fromisoformat(mat["updated_at"])
    return materials


@router.get("/materials/categories")
async def get_material_categories(user: User = Depends(get_current_user)):
    """Get all material categories"""
    return [{"value": cat.value, "label": cat.value.replace("_", " ").title()} for cat in MaterialCategory]


@router.get("/materials/{material_id}")
async def get_material(material_id: str, user: User = Depends(get_current_user)):
    """Get a specific material"""
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@router.post("/materials")
async def create_material(
    material_input: MaterialCreate,
    user: User = Depends(get_current_user)
):
    """Create a new material (Planning, Procurement, Super Admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Check for duplicate name
    existing = await db.materials.find_one({"name": {"$regex": f"^{material_input.name}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Material with this name already exists")
    
    material = Material(
        name=material_input.name,
        category=MaterialCategory(material_input.category),
        unit=material_input.unit,
        description=material_input.description,
        hsn_code=material_input.hsn_code,
        created_by=user.user_id
    )
    
    mat_dict = material.model_dump()
    mat_dict["category"] = mat_dict["category"].value
    mat_dict["created_at"] = mat_dict["created_at"].isoformat()
    mat_dict["updated_at"] = mat_dict["updated_at"].isoformat()
    
    await db.materials.insert_one(mat_dict)
    await create_audit_log(user.user_id, "create", "material", material.material_id, {"name": material.name})
    
    # Remove _id if MongoDB added it
    mat_dict.pop("_id", None)
    return mat_dict


@router.patch("/materials/{material_id}")
async def update_material(
    material_id: str,
    material_input: MaterialUpdate,
    user: User = Depends(get_current_user)
):
    """Update a material"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    update_data = {k: v for k, v in material_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.materials.update_one({"material_id": material_id}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "material", material_id, update_data)
    
    return await db.materials.find_one({"material_id": material_id}, {"_id": 0})


@router.delete("/materials/{material_id}")
async def delete_material(material_id: str, user: User = Depends(get_current_user)):
    """Soft delete a material (set is_active to false)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    await db.materials.update_one(
        {"material_id": material_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_audit_log(user.user_id, "delete", "material", material_id, {})
    
    return {"message": "Material deleted"}


# ==================== VENDOR MASTER ENDPOINTS ====================

class VendorMasterCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    materials_supplied: List[str] = []
    payment_terms: str = "full"
    credit_limit: float = 0
    credit_days: int = 0


class VendorMasterUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    materials_supplied: Optional[List[str]] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/vendor-master")
async def get_vendor_master_list(
    active_only: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all vendors from master list"""
    # IDOR Fix: Only procurement/management roles can access vendor master
    vendor_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
        UserRole.PLANNING, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER
    ]
    if user.role not in vendor_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    query = {}
    if active_only:
        query["is_active"] = True
    
    vendors = await db.vendor_master.find(query, {"_id": 0}).to_list(10000)
    for v in vendors:
        if isinstance(v.get("created_at"), str):
            v["created_at"] = datetime.fromisoformat(v["created_at"])
        if isinstance(v.get("updated_at"), str):
            v["updated_at"] = datetime.fromisoformat(v["updated_at"])
    return vendors


@router.get("/vendor-master/{vendor_id}")
async def get_vendor_master(vendor_id: str, user: User = Depends(get_current_user)):
    """Get a specific vendor from master"""
    # IDOR Fix: Only procurement/management roles can access vendor details
    vendor_access_roles = [
        UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PROCUREMENT,
        UserRole.PLANNING, UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER
    ]
    if user.role not in vendor_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to vendor data")
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@router.post("/vendor-master")
async def create_vendor_master(
    vendor_input: VendorMasterCreate,
    user: User = Depends(get_current_user)
):
    """Create a new vendor in master (Procurement, Super Admin only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = VendorMaster(
        name=vendor_input.name,
        contact_person=vendor_input.contact_person,
        phone=vendor_input.phone,
        email=vendor_input.email,
        address=vendor_input.address,
        gst_number=vendor_input.gst_number,
        materials_supplied=vendor_input.materials_supplied,
        payment_terms=vendor_input.payment_terms,
        credit_limit=vendor_input.credit_limit,
        credit_days=vendor_input.credit_days,
        created_by=user.user_id
    )
    
    vend_dict = vendor.model_dump()
    vend_dict["created_at"] = vend_dict["created_at"].isoformat()
    vend_dict["updated_at"] = vend_dict["updated_at"].isoformat()
    
    await db.vendor_master.insert_one(vend_dict)
    await create_audit_log(user.user_id, "create", "vendor_master", vendor.vendor_id, {"name": vendor.name})
    
    # Remove _id if MongoDB added it
    vend_dict.pop("_id", None)
    return vend_dict


@router.patch("/vendor-master/{vendor_id}")
async def update_vendor_master(
    vendor_id: str,
    vendor_input: VendorMasterUpdate,
    user: User = Depends(get_current_user)
):
    """Update a vendor in master"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    update_data = {k: v for k, v in vendor_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.vendor_master.update_one({"vendor_id": vendor_id}, {"$set": update_data})
        await create_audit_log(user.user_id, "update", "vendor_master", vendor_id, update_data)
    
    return await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})


@router.delete("/vendor-master/{vendor_id}")
async def delete_vendor_master(vendor_id: str, user: User = Depends(get_current_user)):
    """Soft delete a vendor (set is_active to false)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    await db.vendor_master.update_one(
        {"vendor_id": vendor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await create_audit_log(user.user_id, "delete", "vendor_master", vendor_id, {})
    
    return {"message": "Vendor deleted"}


# ==================== ENHANCED USER MANAGEMENT ENDPOINTS ====================

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/users/{user_id}")
async def get_user_by_id(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific user"""
    if current_user.role != UserRole.SUPER_ADMIN and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return user_doc


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    user_input: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a user (Super Admin only, or self for limited fields)"""
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Non-admin can only update their own name and phone
    if current_user.role != UserRole.SUPER_ADMIN:
        if current_user.user_id != user_id:
            raise HTTPException(status_code=403, detail="Permission denied")
        # Only allow name and phone updates for self
        user_input = UserUpdate(name=user_input.name, phone=user_input.phone)
    
    update_data = {k: v for k, v in user_input.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"user_id": user_id}, {"$set": update_data})
        await create_audit_log(current_user.user_id, "update", "user", user_id, update_data)
    
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    """Delete a user (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    
    if current_user.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.delete_one({"user_id": user_id})
    # Also delete their sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    
    await create_audit_log(current_user.user_id, "delete", "user", user_id, {"email": user_doc.get("email")})
    
    return {"message": "User deleted"}


@router.get("/users/by-role/{role}")
async def get_users_by_role(role: str, current_user: User = Depends(get_current_user)):
    """Get users by role (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({"role": role}, {"_id": 0}).to_list(1000)
    return users


@router.get("/roles")
async def get_all_roles(user: User = Depends(get_current_user)):
    """Get all available roles"""
    return [
        {"value": role.value, "label": role.value.replace("_", " ").title()}
        for role in UserRole
    ]


# ==================== SYSTEM SETTINGS PAGE DATA ====================

@router.get("/settings/summary")
async def get_settings_summary(user: User = Depends(get_current_user)):
    """Get summary counts for settings page"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    users_count = await db.users.count_documents({})
    materials_count = await db.materials.count_documents({"is_active": True})
    vendors_count = await db.vendor_master.count_documents({"is_active": True})
    
    company_settings = await db.company_settings.find_one({}, {"_id": 0})
    
    return {
        "users_count": users_count,
        "materials_count": materials_count,
        "vendors_count": vendors_count,
        "company_configured": company_settings is not None,
        "company_name": company_settings.get("company_name") if company_settings else "ConstructionOS"
    }


