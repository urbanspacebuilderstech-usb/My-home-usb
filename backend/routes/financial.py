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
import asyncio
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



# ==================== ACCOUNTANT DASHBOARD OVERVIEW ====================

@router.get("/accountant/overview")
async def get_accountant_overview(user: User = Depends(get_current_user)):
    """Comprehensive accountant overview: income/expense by payment mode, project-wise"""
    allowed = [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Income query: same status filter as cashbook — only count approved entries
    # (or legacy entries with no status field). Pending/rejected belong on the
    # Approvals page, not the cashbook overview cards.
    income_status_filter = {"$or": [
        {"status": "approved"},
        {"status": {"$exists": False}},
        {"status": None},
    ]}

    # Expense status filter — exclude rejected / under-correction rows. Once
    # the accountant pulls back an Approved expense for correction the ledger
    # entry is reversed AND the recorded_expenses row's status flips to
    # `under_correction`, so it should disappear from every cashbook total
    # until re-approved.
    EXCLUDED_EXPENSE_STATUSES = ["under_correction", "rejected", "accountant_rejected", "accounts_rejected"]

    (incomes, recorded_exps, labour_exps, material_reqs, petty_cash_list, projects_list, suspense_txns, petty_requests, suspense_entries, vendor_credits_v2, credit_ledger_v1, labour_open_exps) = await asyncio.gather(
        db.income.find(income_status_filter, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.recorded_expenses.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.labour_expenses.find({"status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.material_requests.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.petty_cash.find({"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}, {"_id": 0}).sort("created_at", -1).to_list(5000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1, "status": 1}).to_list(1000),
        db.suspense_transactions.find({}, {"_id": 0}).to_list(5000),
        db.petty_cash_requests.find({}, {"_id": 0}).to_list(2000),
        db.suspense_entries.find({}, {"_id": 0}).to_list(5000),
        db.vendor_credit_ledger.find({"status": {"$in": ["pending", "active", "overdue", "partially_paid"]}}, {"_id": 0}).to_list(2000),
        db.credit_ledger.find({"status": {"$in": ["pending", "active", "overdue", "partially_paid"]}}, {"_id": 0}).to_list(2000),
        db.labour_expenses.find({"status": {"$in": ["pm_approved", "accounts_pending"]}}, {"_id": 0}).to_list(2000),
    )
    
    project_map = {p["project_id"]: p["name"] for p in projects_list}
    
    # Payment mode categories
    mode_keys = ["cash", "current_account", "savings_account", "cheque", "petty_cash", "miscellaneous", "direct_transfer", "suspense_account"]
    
    def classify_mode(mode):
        if not mode:
            return "cash"
        mode = mode.lower().replace(" ", "_")
        mapping = {
            "cash": "cash", "bank_transfer": "current_account", "neft": "current_account",
            "rtgs": "current_account", "imps": "current_account", "escrow": "current_account",
            "cheque": "cheque", "petty_cash": "petty_cash", "savings": "savings_account",
            "savings_account": "savings_account", "current_account": "current_account",
            "miscellaneous": "miscellaneous", "direct_transfer": "direct_transfer",
            "dt": "direct_transfer", "suspense": "suspense_account", "suspense_account": "suspense_account"
        }
        return mapping.get(mode, "miscellaneous")
    
    # Income by mode
    income_by_mode = {k: 0 for k in mode_keys}
    income_by_mode["total"] = 0
    for i in incomes:
        amt = i.get("amount", 0)
        mode = classify_mode(i.get("payment_mode"))
        income_by_mode[mode] = income_by_mode.get(mode, 0) + amt
        income_by_mode["total"] += amt
    
    # Expense by mode
    expense_by_mode = {k: 0 for k in mode_keys}
    expense_by_mode["total"] = 0
    all_expenses = []
    
    for e in recorded_exps:
        amt = e.get("amount", 0)
        mode = classify_mode(e.get("payment_method") or e.get("payment_mode"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**e, "expense_type": e.get("category", "other"), "project_name": project_map.get(e.get("project_id"), "")})
    
    for l in labour_exps:
        amt = l.get("total_amount", 0)
        mode = classify_mode(l.get("payment_method"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**l, "expense_type": "labour", "amount": amt, "project_name": project_map.get(l.get("project_id"), "")})
    
    for m in material_reqs:
        amt = m.get("estimated_price", 0) or m.get("final_price", 0)
        mode = classify_mode(m.get("payment_method"))
        expense_by_mode[mode] = expense_by_mode.get(mode, 0) + amt
        expense_by_mode["total"] += amt
        all_expenses.append({**m, "expense_type": "material", "amount": amt, "project_name": project_map.get(m.get("project_id"), "")})
    
    # Petty cash totals
    petty_total_issued = sum(pc.get("amount_issued", 0) for pc in petty_cash_list)
    petty_total_spent = sum(pc.get("amount_spent", 0) for pc in petty_cash_list)
    
    # Suspense balance = Petty Cash (issued − spent) + Material Suspense + Labour Suspense
    # Compute from the same data sources used by /suspense/overview so the
    # Accountant Dashboard tile matches the Suspense A/c page exactly.
    legacy_suspense_total = sum(t.get("amount", 0) for t in suspense_txns if t.get("type") == "credit") - sum(t.get("amount", 0) for t in suspense_txns if t.get("type") == "debit")

    # Petty Cash suspense — active petty cash (from db.petty_cash collection)
    PETTY_ACTIVE_STATUSES = ("payment_done", "acknowledged", "partially_spent", "issued")
    petty_active_v2 = [p for p in petty_cash_list if p.get("status") in PETTY_ACTIVE_STATUSES]
    petty_cash_suspense = sum(p.get("amount_issued", 0) or 0 for p in petty_active_v2) - sum(p.get("amount_spent", 0) or 0 for p in petty_active_v2)

    # Material suspense — outstanding vendor credit (both v1 + v2 collections)
    material_suspense_total = 0.0
    for entry in (vendor_credits_v2 + credit_ledger_v1):
        outstanding = entry.get("balance")
        if outstanding is None or outstanding == 0:
            outstanding = entry.get("amount", 0) or 0
        if outstanding > 0:
            material_suspense_total += outstanding

    # Labour suspense — open labour expenses awaiting accountant payout
    labour_suspense_total = 0.0
    for exp in labour_open_exps:
        outstanding = (exp.get("total_amount", 0) or 0) - (exp.get("paid_amount", 0) or 0)
        if outstanding > 0:
            labour_suspense_total += outstanding

    # Legacy collection (kept for back-compat; usually 0)
    for entry in suspense_entries:
        amt = entry.get("amount", 0) or 0
        etype = (entry.get("type") or "").lower()
        if etype == "material":
            material_suspense_total += amt
        elif etype == "labour":
            labour_suspense_total += amt

    suspense_total = petty_cash_suspense + material_suspense_total + labour_suspense_total + legacy_suspense_total
    
    # Project-wise breakdown
    project_wise = {}
    for i in incomes:
        pid = i.get("project_id")
        if pid not in project_wise:
            project_wise[pid] = {"project_id": pid, "project_name": project_map.get(pid, "Unknown"), "income": 0, "expense": 0}
        project_wise[pid]["income"] += i.get("amount", 0)
    
    for e in all_expenses:
        pid = e.get("project_id")
        if pid and pid not in project_wise:
            project_wise[pid] = {"project_id": pid, "project_name": project_map.get(pid, "Unknown"), "income": 0, "expense": 0}
        if pid:
            project_wise[pid]["expense"] += e.get("amount", 0)
    
    # Sort and add P&L
    for pw in project_wise.values():
        pw["balance"] = pw["income"] - pw["expense"]
    
    project_list_sorted = sorted(project_wise.values(), key=lambda x: x["income"], reverse=True)
    
    return {
        "income_by_mode": income_by_mode,
        "expense_by_mode": expense_by_mode,
        "income_entries": incomes[:200],
        "expense_entries": sorted(all_expenses, key=lambda x: x.get("created_at", ""), reverse=True)[:200],
        "petty_cash": {"issued": petty_total_issued, "spent": petty_total_spent, "balance": petty_total_issued - petty_total_spent},
        "suspense_balance": suspense_total,
        "suspense_breakdown": {
            "petty_cash": petty_cash_suspense,
            "material": material_suspense_total,
            "labour": labour_suspense_total,
            "legacy": legacy_suspense_total,
            "total": suspense_total,
        },
        "project_wise": project_list_sorted,
        "totals": {
            "total_income": income_by_mode["total"],
            "total_expense": expense_by_mode["total"],
            "net_balance": income_by_mode["total"] - expense_by_mode["total"]
        }
    }


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
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING
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
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING
    ]
    if user.role not in income_access_roles:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    income_entries = await db.income.find({}, {"_id": 0}).to_list(10000)
    
    summary = {
        "total_income": 0,
        "cash": 0,
        "cheque": 0,
        "bank_transfer": 0,
        "escrow": 0,
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
        UserRole.PROJECT_MANAGER, UserRole.CRE, UserRole.PLANNING
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
        "escrow": sum(e.get("amount", 0) for e in income_entries if e.get("payment_mode") == "escrow"),
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
    income_dict["source"] = "manual"
    
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
    
    # Send email notification (non-blocking)
    try:
        from core.notifications import notify_income_recorded
        asyncio.ensure_future(notify_income_recorded(
            project.get("name", "Unknown"), income_input.amount, income_input.payment_mode, user.name
        ))
    except Exception:
        pass
    
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
    """Delete an income entry and roll back all linked project finance state.

    Side-effects (so the Project Payment Summary, Cashflow Engine, and
    Cashbook totals stay consistent the moment the row is deleted):
      1. Reverse the cashflow_ledger split entry tied to this income_id
         (removes Direct + Indirect allocations).
      2. Roll back any payment_stages.amount_received that was credited
         from this income (matched by amount + project + stage hint).
      3. Roll back project.advance_amount if this income was tagged as
         category='advance' / stage='advance_payment'.
      4. Keep the legacy project.income_project counter in sync.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    existing = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Income entry not found")

    amount = float(existing.get("amount", 0) or 0)
    project_id = existing.get("project_id")

    # 1. Reverse cashflow_ledger split entry
    try:
        from routes.cashflow import reverse_allocation
        await reverse_allocation(income_id, kind="income")
    except Exception as e:
        import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

    # 2-4. Roll back project + payment_stage state
    if project_id:
        project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
        if project:
            update_ops: Dict[str, Any] = {}

            # 2. Payment stage rollback. If this income credits a specific
            # payment_stage (linked via payment_stage_id or matching amount),
            # decrement its amount_received and flip status back to 'pending'.
            stage_id = existing.get("payment_stage_id")
            if stage_id:
                stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "amount_received": 1, "amount": 1})
                if stage:
                    new_received = max(0, float(stage.get("amount_received", 0) or 0) - amount)
                    new_status = "paid" if new_received >= float(stage.get("amount", 0) or 0) and new_received > 0 else ("partial" if new_received > 0 else "pending")
                    await db.payment_stages.update_one(
                        {"stage_id": stage_id},
                        {"$set": {"amount_received": new_received, "status": new_status}}
                    )

            # 3. Advance-amount rollback (for income rows that recorded the
            # lead's onboarding advance).
            category = (existing.get("category") or "").lower()
            stage_label = (existing.get("stage") or "").lower()
            if category in ("advance", "advance_payment") or "advance" in stage_label:
                cur_advance = float(project.get("advance_amount", 0) or 0)
                update_ops["advance_amount"] = max(0, cur_advance - amount)

            # 4. Legacy income_project counter
            cur_income_project = float(project.get("income_project", 0) or 0)
            update_ops["income_project"] = max(0, cur_income_project - amount)
            update_ops["updated_at"] = datetime.now(timezone.utc).isoformat()

            if update_ops:
                await db.projects.update_one({"project_id": project_id}, {"$set": update_ops})

    await db.income.delete_one({"income_id": income_id})
    await create_audit_log(user.user_id, "delete", "income", income_id, {"amount": amount, "rollback": True})

    return {"message": "Income entry deleted and project totals rolled back"}


@router.delete("/cashbook/expense/{expense_type}/{record_id}")
async def delete_cashbook_expense(expense_type: str, record_id: str, user: User = Depends(get_current_user)):
    """Delete an expense from the cashbook view.
    The cashbook surfaces three different collections — recorded_expenses,
    labour_expenses, material_requests. We probe all three (by both
    expense_id and request_id) since a row's `expense_type` alone
    doesn't uniquely identify the source collection (e.g. a 'material'
    row may live in recorded_expenses if it was a manual entry, or in
    material_requests if it came from an approval workflow).
    Only Accountant / Super Admin can delete.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can delete expenses")

    # Probe order: most specific collections first. Each collection has its
    # own primary id field — we try every candidate so the unified frontend
    # `expense_id` always resolves regardless of source.
    candidates = [
        (db.material_requests, "request_id"),
        (db.material_requests, "expense_id"),
        (db.labour_expenses, "labour_expense_id"),
        (db.labour_expenses, "expense_id"),
        (db.recorded_expenses, "expense_id"),
    ]
    for coll, id_field in candidates:
        existing = await coll.find_one({id_field: record_id}, {"_id": 0})
        if existing:
            await coll.delete_one({id_field: record_id})
            await create_audit_log(
                user.user_id, "delete", f"expense_{expense_type}", record_id,
                {"amount": existing.get("amount") or existing.get("total_amount") or existing.get("estimated_price", 0),
                 "collection": coll.name}
            )
            return {"message": "Expense deleted", "type": expense_type, "from": coll.name}

    raise HTTPException(status_code=404, detail="Expense record not found in any cashbook collection")



# ==================== UNIFIED APPROVALS ENDPOINT ====================

@router.get("/approvals/unified")
async def get_unified_approvals(
    status_filter: str = "pending",
    user: User = Depends(get_current_user)
):
    """Approvals queue. Supports status_filter to show approved / rejected /
    under_correction rows alongside pending ones so the Accountant can audit
    and pull back already-approved entries.

    status_filter values:
      - 'pending'   (default)  → only items awaiting approval
      - 'approved'             → approved-and-not-yet-corrected rows
      - 'rejected'             → rejected rows (CRE/Sales must re-collect)
      - 'under_correction'     → was approved, now pulled back for correction
      - 'all'                  → everything
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")

    sf = (status_filter or "pending").lower()

    # Status sets per filter — incomes and expenses use slightly different
    # vocabularies, so we keep two maps.
    if sf == "pending":
        income_statuses = ["pending_approval"]
        material_statuses = ["requested", "planning_approved", "procurement_priced", "pending_accounts_approval"]
        labour_statuses = ["requested", "planning_approved", "pending_accounts_approval"]
        vendor_statuses = ["requested", "planning_approved", "pending_accounts_approval"]
    elif sf == "approved":
        income_statuses = ["approved", "verified", "accountant_verified"]
        material_statuses = ["accounts_approved", "issued", "settled", "completed"]
        labour_statuses = ["accounts_approved", "settled", "completed"]
        vendor_statuses = ["accounts_approved", "settled", "completed"]
    elif sf == "rejected":
        income_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        material_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        labour_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
        vendor_statuses = ["rejected", "accountant_rejected", "accounts_rejected"]
    elif sf == "under_correction":
        income_statuses = ["under_correction"]
        material_statuses = ["under_correction"]
        labour_statuses = ["under_correction"]
        vendor_statuses = ["under_correction"]
    else:  # 'all'
        income_statuses = None  # None = no status filter
        material_statuses = None
        labour_statuses = None
        vendor_statuses = None

    def _q(statuses):
        return {} if statuses is None else {"status": {"$in": statuses}}

    # Parallel fetch
    (incomes, materials, labour, vendor, projects_list) = await asyncio.gather(
        db.income.find(_q(income_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.material_expenses.find(_q(material_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.labour_expenses.find(_q(labour_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.vendor_service_expenses.find(_q(vendor_statuses), {"_id": 0}).sort("created_at", -1).limit(1000).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )

    project_map = {p["project_id"]: p["name"] for p in projects_list}
    for item in incomes:
        item["project_name"] = project_map.get(item.get("project_id"), "Unknown")
    for item in materials + labour + vendor:
        item["project_name"] = project_map.get(item.get("project_id"), "Unknown")

    return {
        "status_filter": sf,
        "income": incomes,
        "materials": materials,
        "labour": labour,
        "vendor": vendor,
        "summary": {
            "income_count": len(incomes),
            "income_total": sum(i.get("amount", 0) for i in incomes),
            "material_count": len(materials),
            "material_total": sum(m.get("estimated_cost", 0) or m.get("final_amount", 0) for m in materials),
            "labour_count": len(labour),
            "labour_total": sum(l.get("total_amount", 0) for l in labour),
            "vendor_count": len(vendor),
            "vendor_total": sum(v.get("amount", 0) for v in vendor),
        }
    }


@router.post("/approvals/income/{income_id}/approve")
async def approve_income(income_id: str, user: User = Depends(get_current_user)):
    """Approve an income entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can approve income")
    
    result = await db.income.find_one_and_update(
        {"income_id": income_id, "status": "pending_approval"},
        {"$set": {"status": "approved", "approved_by": user.user_id, "approved_at": datetime.now(timezone.utc).isoformat()}},
        return_document=False
    )
    if not result:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")
    
    # If this is an advance payment, update project status to payment_verified + move lead to Project Onboarded
    if result.get("category") == "advance_payment" and result.get("project_id"):
        project_upd = await db.projects.find_one_and_update(
            {"project_id": result["project_id"]},
            {"$set": {
                "status": "payment_verified",
                "accountant_verified": True,
                "accountant_verified_by": user.user_id,
                "accountant_verified_at": datetime.now(timezone.utc).isoformat()
            }},
            return_document=False
        )

        # Find the lead linked to this project/income and auto-move to Project Onboarded stage
        lead_id_to_move = result.get("lead_id") or (project_upd or {}).get("lead_id")
        if lead_id_to_move:
            lead_doc = await db.leads.find_one({"lead_id": lead_id_to_move}, {"_id": 0})
            if lead_doc and lead_doc.get("current_stage_id") != "stg_project_onboarded":
                user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
                user_name = (user_doc or {}).get("name", "Accountant")
                stage_history = lead_doc.get("stage_history", [])
                stage_history.append({
                    "stage_id": "stg_project_onboarded",
                    "from_stage_id": lead_doc.get("current_stage_id"),
                    "moved_at": datetime.now(timezone.utc).isoformat(),
                    "moved_by": user.user_id,
                    "moved_by_name": user_name,
                    "action": "accountant_verified_advance",
                    "remark": "Advance payment verified by Accountant"
                })
                await db.leads.update_one(
                    {"lead_id": lead_id_to_move},
                    {"$set": {
                        "current_stage_id": "stg_project_onboarded",
                        "stage_history": stage_history,
                        "onboarding_status": "project_onboarded",
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
    
    await create_audit_log(user.user_id, "approve", "income", income_id, {"action": "approved"})

    # Cashflow Engine: split this income into Direct/Indirect pools per project/global config
    try:
        from routes.cashflow import allocate_income as _cf_allocate_income
        inc_doc = await db.income.find_one({"income_id": income_id}, {"_id": 0, "amount": 1, "project_id": 1, "project_name": 1})
        if inc_doc and float(inc_doc.get("amount") or 0) > 0:
            await _cf_allocate_income(
                income_id=income_id,
                project_id=inc_doc.get("project_id"),
                amount=float(inc_doc.get("amount") or 0),
                project_name=inc_doc.get("project_name", ""),
                source="income_approved",
            )
    except Exception as e:
        # Never fail the approval if cashflow side-effect errors
        import logging; logging.getLogger(__name__).warning(f"Cashflow allocation skipped: {e}")

    return {"message": "Income approved successfully"}


@router.post("/approvals/income/{income_id}/send-for-correction")
async def send_income_for_correction(income_id: str, payload: Dict[str, Any] = None, reason: str = "", user: User = Depends(get_current_user)):
    """Accountant pulls back an Approved income for correction.

    Status flips to `under_correction`. Cashflow ledger is reversed and the
    project's payment_stage / advance_amount counters are rolled back so the
    amount disappears from Cashbook + Cashflow Engine + Project header
    immediately. The original collector (CRE/Sales) gets notified to edit and
    resubmit.

    Body: { "reason": "..." }  OR  ?reason=... (query param for back-compat)
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can send for correction")

    body_reason = (payload or {}).get("reason") if isinstance(payload, dict) else None
    final_reason = (body_reason or reason or "").strip()
    if not final_reason:
        raise HTTPException(status_code=400, detail="Correction reason is required")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    prev = (inc.get("status") or "").lower()
    if prev not in ("approved", "verified", "accountant_verified"):
        raise HTTPException(status_code=400, detail=f"Can only send approved income for correction (current: '{prev}')")

    now = datetime.now(timezone.utc).isoformat()
    history = inc.get("correction_history", [])
    history.append({
        "action": "sent_for_correction",
        "by": user.user_id,
        "by_name": user.name,
        "at": now,
        "reason": final_reason,
        "extra": {"prev_status": prev},
    })

    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "status": "under_correction",
            "prev_approved_status": prev,
            "correction_requested_by": user.user_id,
            "correction_requested_by_name": user.name,
            "correction_requested_at": now,
            "correction_reason": final_reason,
            "correction_history": history,
            "updated_at": now,
        }}
    )

    # Reverse cashflow ledger split
    try:
        from routes.cashflow import reverse_allocation
        await reverse_allocation(income_id, kind="income")
    except Exception as e:
        import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

    # Roll back payment_stage / advance counters
    amount = float(inc.get("amount", 0) or 0)
    project_id = inc.get("project_id")
    if project_id:
        stage_id = inc.get("payment_stage_id")
        if stage_id:
            stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "amount_received": 1, "amount": 1})
            if stage:
                new_received = max(0, float(stage.get("amount_received", 0) or 0) - amount)
                new_status = "partial" if new_received > 0 else "pending"
                await db.payment_stages.update_one(
                    {"stage_id": stage_id},
                    {"$set": {"amount_received": new_received, "status": new_status}}
                )
        category = (inc.get("category") or "").lower()
        stage_label = (inc.get("stage") or "").lower()
        if category in ("advance", "advance_payment") or "advance" in stage_label:
            project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "advance_amount": 1, "income_project": 1})
            if project:
                cur_adv = float(project.get("advance_amount", 0) or 0)
                cur_ip = float(project.get("income_project", 0) or 0)
                await db.projects.update_one(
                    {"project_id": project_id},
                    {"$set": {"advance_amount": max(0, cur_adv - amount), "income_project": max(0, cur_ip - amount)}}
                )

    # Notify the original collector
    if inc.get("collected_by") or inc.get("created_by"):
        try:
            await create_notification(
                inc.get("collected_by") or inc.get("created_by"),
                f"Approved income ₹{amount:,.0f} for {inc.get('project_name', 'project')} was sent back for correction. Reason: {final_reason}. The amount has been removed from Cashbook until you correct & resubmit."
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "send_for_correction", "income", income_id, {"reason": final_reason, "prev_status": prev, "amount": amount})
    return {"message": "Approved income sent back for correction. Cashbook & cashflow rolled back.", "status": "under_correction"}


@router.post("/approvals/income/{income_id}/resubmit")
async def resubmit_income(income_id: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    """Original collector (CRE/Sales) edits and resubmits a rejected or
    under_correction income. Whitelisted editable fields:
      amount, payment_mode, payment_reference, payment_date, remarks,
      description, transaction_id, cheque_details, stage, category.
    Status flips back to `pending_approval` so it lands in the queue again.
    """
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    cur = (inc.get("status") or "").lower()
    if cur not in ("rejected", "accountant_rejected", "accounts_rejected", "under_correction"):
        raise HTTPException(status_code=400, detail=f"Cannot resubmit from status '{cur}'")

    if user.role not in [UserRole.SUPER_ADMIN]:
        owner = inc.get("collected_by") or inc.get("created_by")
        if owner and owner != user.user_id:
            raise HTTPException(status_code=403, detail="Only the original collector can resubmit this income")

    EDITABLE = {"amount", "payment_mode", "payment_reference", "payment_date",
                "remarks", "description", "transaction_id", "cheque_details",
                "stage", "category", "sub_category"}
    edits = {k: v for k, v in (payload or {}).items() if k in EDITABLE and v is not None}
    if not edits:
        raise HTTPException(status_code=400, detail="At least one editable field must be provided")

    now = datetime.now(timezone.utc).isoformat()
    history = inc.get("correction_history", [])
    history.append({
        "action": "resubmitted",
        "by": user.user_id,
        "by_name": user.name,
        "at": now,
        "extra": {"edited_fields": list(edits.keys())},
    })

    await db.income.update_one(
        {"income_id": income_id},
        {
            "$set": {
                **edits,
                "status": "pending_approval",
                "resubmitted_by": user.user_id,
                "resubmitted_by_name": user.name,
                "resubmitted_at": now,
                "correction_history": history,
                "updated_at": now,
            },
            "$unset": {
                "rejection_reason": "",
                "rejected_by": "",
                "rejected_by_name": "",
                "rejected_at": "",
                "correction_reason": "",
            }
        }
    )

    # Notify all accountants
    accountants = await db.users.find({"role": UserRole.ACCOUNTANT, "is_active": True}, {"_id": 0, "user_id": 1}).to_list(20)
    for a in accountants:
        try:
            await create_notification(a["user_id"], f"Income ₹{(edits.get('amount') or inc.get('amount', 0)):,.0f} for {inc.get('project_name', 'project')} was edited and resubmitted by {user.name}.")
        except Exception:
            pass

    await create_audit_log(user.user_id, "resubmit", "income", income_id, {"edited_fields": list(edits.keys())})
    return {"message": "Income resubmitted for accountant approval", "status": "pending_approval"}


@router.post("/approvals/income/{income_id}/reject")
async def reject_income(income_id: str, reason: str = "", user: User = Depends(get_current_user)):
    """Reject an income entry — sets status='rejected' so it returns to CRE for re-submission.

    Accepts BOTH pre-approval rows (status='pending_approval') and
    already-approved rows (status='approved'/'verified'). For approved rows we
    additionally REVERSE the cashflow_ledger split + payment_stage rollback so
    the amount disappears from Cashbook, Cashflow Engine, project Total Income,
    and Receivable balance the moment the Accountant rejects it.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can reject income")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")
    prev_status = (inc.get("status") or "pending_approval")
    if prev_status in ("rejected", "under_correction"):
        raise HTTPException(status_code=400, detail=f"Income already in {prev_status} state")

    was_approved = prev_status in ("approved", "verified", "accountant_verified")

    update_set = {
        "status": "rejected",
        "prev_approved_status": prev_status if was_approved else None,
        "rejected_by": user.user_id,
        "rejected_by_name": user.name,
        "rejected_at": datetime.now(timezone.utc).isoformat(),
        "rejection_reason": reason or "Rejected without remarks",
    }
    result = await db.income.find_one_and_update(
        {"income_id": income_id},
        {"$set": update_set},
        return_document=False,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")

    # Post-approval reversal: cashflow ledger + payment_stage rollback so the
    # amount stops counting everywhere (Cashbook totals, Cashflow Engine
    # Direct/Indirect pools, Project header Total Income, Receivable).
    if was_approved:
        amount = float(inc.get("amount", 0) or 0)
        project_id = inc.get("project_id")
        try:
            from routes.cashflow import reverse_allocation
            await reverse_allocation(income_id, kind="income")
        except Exception as e:
            import logging; logging.getLogger(__name__).warning(f"cashflow reverse_allocation failed for income {income_id}: {e}")

        if project_id:
            # Roll back payment_stage credit if this income was linked to one.
            stage_id = inc.get("payment_stage_id")
            if stage_id:
                stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0, "amount_received": 1, "amount": 1})
                if stage:
                    new_received = max(0, float(stage.get("amount_received", 0) or 0) - amount)
                    new_status = "partial" if new_received > 0 else "pending"
                    await db.payment_stages.update_one(
                        {"stage_id": stage_id},
                        {"$set": {"amount_received": new_received, "status": new_status}}
                    )
            # Advance amount rollback if applicable.
            category = (inc.get("category") or "").lower()
            stage_label = (inc.get("stage") or "").lower()
            if category in ("advance", "advance_payment") or "advance" in stage_label:
                project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "advance_amount": 1})
                if project:
                    cur = float(project.get("advance_amount", 0) or 0)
                    await db.projects.update_one({"project_id": project_id}, {"$set": {"advance_amount": max(0, cur - amount)}})

    # Notify the originator (CRE/Sales who collected it) so they can fix and resubmit.
    if inc.get("created_by"):
        try:
            await create_notification(
                inc["created_by"],
                f"Income ₹{inc.get('amount', 0):,.0f} for {inc.get('project_name', 'project')} was rejected by Accounts. Reason: {reason or 'No remarks'}"
            )
        except Exception:
            pass

    await create_audit_log(user.user_id, "reject", "income", income_id, {"reason": reason, "was_approved": was_approved})
    return {
        "message": "Income rejected. Cashbook & cashflow rolled back." if was_approved else "Income rejected and returned for correction",
        "was_approved_before_reject": was_approved,
    }


class IncomeResubmitRequest(BaseModel):
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    stage: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/income/{income_id}/resubmit")
async def resubmit_rejected_income(income_id: str, data: IncomeResubmitRequest, user: User = Depends(get_current_user)):
    """Originator (CRE/Sales/Admin) fixes a rejected income entry and resubmits for approval.

    The full record stays in db.income (so audit history is preserved). Status flips
    from 'rejected' back to 'pending_approval' and the rejection metadata is cleared,
    but we keep `last_rejection_reason` + `last_rejected_at` for traceability.
    """
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income entry not found")
    if inc.get("status") != "rejected":
        raise HTTPException(status_code=400, detail=f"Only rejected entries can be resubmitted (current status={inc.get('status')})")
    # Allow originator OR admin/CRE/Sales roles to resubmit
    allowed = (inc.get("created_by") == user.user_id) or (user.role in [UserRole.SUPER_ADMIN, UserRole.CRE, UserRole.SALES, UserRole.ACCOUNTANT])
    if not allowed:
        raise HTTPException(status_code=403, detail="Only the originator (or Admin/CRE/Sales) can resubmit this entry")

    update: Dict[str, Any] = {
        "status": "pending_approval",
        "last_rejection_reason": inc.get("rejection_reason"),
        "last_rejected_by_name": inc.get("rejected_by_name"),
        "last_rejected_at": inc.get("rejected_at"),
        "resubmitted_by": user.user_id,
        "resubmitted_by_name": user.name,
        "resubmitted_at": datetime.now(timezone.utc).isoformat(),
    }
    # Clear current rejection so the row shows up cleanly in the approval queue
    unset = {"rejection_reason": "", "rejected_by": "", "rejected_by_name": "", "rejected_at": ""}

    payload = data.model_dump(exclude_none=True) if hasattr(data, "model_dump") else data.dict(exclude_none=True)
    for k, v in payload.items():
        update[k] = v

    await db.income.update_one({"income_id": income_id}, {"$set": update, "$unset": unset})
    await create_audit_log(user.user_id, "resubmit", "income", income_id, {"fields_changed": list(payload.keys())})

    # Notify the accountant who rejected (if any), or all accountants
    try:
        rejector_id = inc.get("rejected_by")
        if rejector_id:
            await create_notification(rejector_id, f"Income ₹{inc.get('amount', 0):,.0f} resubmitted by {user.name} — please review.")
    except Exception:
        pass

    return {"message": "Income resubmitted for approval"}


class ExpenseRejectRequest(BaseModel):
    reason: str


@router.post("/expenses/{expense_id}/reject")
async def reject_expense(expense_id: str, data: ExpenseRejectRequest, user: User = Depends(get_current_user)):
    """Accountant rejects a recorded expense; sends it back to the originator."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can reject expenses")
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.get("status") == "rejected":
        raise HTTPException(status_code=400, detail="Already rejected")
    now = datetime.now(timezone.utc).isoformat()
    await db.recorded_expenses.update_one(
        {"expense_id": expense_id},
        {"$set": {
            "status": "rejected",
            "rejected_by": user.user_id,
            "rejected_by_name": user.name,
            "rejected_at": now,
            "rejection_reason": data.reason or "Rejected without remarks",
        }}
    )
    if exp.get("created_by"):
        try:
            await create_notification(
                exp["created_by"],
                f"Expense ₹{exp.get('amount', 0):,.0f} for {exp.get('project_name', 'project')} was rejected. Reason: {data.reason or 'No remarks'}"
            )
        except Exception:
            pass
    await create_audit_log(user.user_id, "reject", "expense", expense_id, {"reason": data.reason})
    return {"message": "Expense rejected and returned to originator"}


class ExpenseResubmitRequest(BaseModel):
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    category: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None
    remarks: Optional[str] = None


@router.post("/expenses/{expense_id}/resubmit")
async def resubmit_rejected_expense(expense_id: str, data: ExpenseResubmitRequest, user: User = Depends(get_current_user)):
    """Originator fixes a rejected expense and resubmits for approval (status -> pending_approval)."""
    exp = await db.recorded_expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp.get("status") != "rejected":
        raise HTTPException(status_code=400, detail=f"Only rejected entries can be resubmitted (current status={exp.get('status')})")
    allowed = (exp.get("created_by") == user.user_id) or (user.role in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT])
    if not allowed:
        raise HTTPException(status_code=403, detail="Only the originator (or Admin/Accountant) can resubmit this expense")

    update: Dict[str, Any] = {
        "status": "pending_approval",
        "last_rejection_reason": exp.get("rejection_reason"),
        "last_rejected_by_name": exp.get("rejected_by_name"),
        "last_rejected_at": exp.get("rejected_at"),
        "resubmitted_by": user.user_id,
        "resubmitted_by_name": user.name,
        "resubmitted_at": datetime.now(timezone.utc).isoformat(),
    }
    unset = {"rejection_reason": "", "rejected_by": "", "rejected_by_name": "", "rejected_at": ""}
    payload = data.model_dump(exclude_none=True) if hasattr(data, "model_dump") else data.dict(exclude_none=True)
    for k, v in payload.items():
        update[k] = v
    await db.recorded_expenses.update_one({"expense_id": expense_id}, {"$set": update, "$unset": unset})
    await create_audit_log(user.user_id, "resubmit", "expense", expense_id, {"fields_changed": list(payload.keys())})
    return {"message": "Expense resubmitted for approval"}


@router.get("/income/rejected/mine")
async def get_my_rejected_income(user: User = Depends(get_current_user)):
    """Income entries the current user originated that the Accountant rejected."""
    q = {"status": "rejected"}
    # Show all rejected for admin/accountant; others see only their own
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        q["created_by"] = user.user_id
    rows = await db.income.find(q, {"_id": 0}).sort("rejected_at", -1).to_list(200)
    return rows


@router.get("/expenses/rejected/mine")
async def get_my_rejected_expenses(user: User = Depends(get_current_user)):
    """Recorded expenses the current user originated that the Accountant rejected."""
    q = {"status": "rejected"}
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        q["created_by"] = user.user_id
    rows = await db.recorded_expenses.find(q, {"_id": 0}).sort("rejected_at", -1).to_list(200)
    return rows


class IncomeReviewRequest(BaseModel):
    verification_mode: str  # cash, cheque, bank, dt
    denomination: Optional[Dict[str, int]] = None  # for cash: {"2000": 1, "500": 4, ...}
    cheque_number: Optional[str] = None  # for single cheque
    cheque_verifications: Optional[List[Dict[str, Any]]] = None  # for multiple cheques: [{"cheque_id": "...", "entered_number": "...", "amount": ...}]
    transaction_id: Optional[str] = None  # for bank
    dt_id: Optional[str] = None  # for dt
    notes: Optional[str] = None


@router.get("/approvals/income/{income_id}/cheques")
async def get_income_cheques(income_id: str, user: User = Depends(get_current_user)):
    """Get all cheques linked to this income entry"""
    income = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not income:
        raise HTTPException(status_code=404, detail="Income not found")
    
    # First try to find cheques linked directly to the income
    cheques = await db.cheques.find(
        {"income_id": income_id, "cheque_type": "incoming"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # If no direct link, get all incoming cheques for the project
    if not cheques:
        project_id = income.get("project_id")
        if project_id:
            cheques = await db.cheques.find(
                {"project_id": project_id, "cheque_type": "incoming"},
                {"_id": 0}
            ).sort("created_at", -1).to_list(50)
    
    return {"cheques": cheques}


@router.post("/approvals/income/{income_id}/review")
async def review_income(income_id: str, data: IncomeReviewRequest, user: User = Depends(get_current_user)):
    """Accountant reviews and verifies an income entry with payment verification details"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can review income")

    income = await db.income.find_one({"income_id": income_id, "status": "pending_approval"})
    if not income:
        raise HTTPException(status_code=404, detail="Income entry not found or already processed")

    # Build verification record
    verification = {
        "verification_mode": data.verification_mode,
        "verified_by": user.user_id,
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.denomination:
        verification["denomination"] = data.denomination
        denomination_total = sum(int(k) * v for k, v in data.denomination.items())
        verification["denomination_total"] = denomination_total
    if data.cheque_number:
        verification["cheque_number"] = data.cheque_number
    if data.cheque_verifications:
        verification["cheque_verifications"] = data.cheque_verifications
    if data.transaction_id:
        verification["transaction_id"] = data.transaction_id
    if data.dt_id:
        verification["dt_id"] = data.dt_id
    if data.notes:
        verification["notes"] = data.notes

    # Approve the income with verification data
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "status": "approved",
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "verification": verification,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    # Update payment stage collected amount if linked to a stage
    project_id = income.get("project_id")
    stage_id = income.get("stage_id")
    amount = income.get("amount", 0)

    if project_id and stage_id:
        stage = await db.payment_stages.find_one({"stage_id": stage_id, "project_id": project_id})
        if stage:
            current_collected = stage.get("collected", 0)
            new_collected = current_collected + amount
            stage_amount = stage.get("amount", 0)
            update_fields = {
                "collected": new_collected,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if new_collected >= stage_amount:
                update_fields["status"] = "paid"
                update_fields["completed_date"] = datetime.now(timezone.utc).isoformat()
            await db.payment_stages.update_one(
                {"stage_id": stage_id, "project_id": project_id},
                {"$set": update_fields}
            )

    await create_audit_log(user.user_id, "review_approve", "income", income_id, {"verification": verification})
    
    # If this is an advance payment, update project status + move lead to Project Onboarded
    if income.get("category") == "advance_payment" and project_id:
        await db.projects.update_one(
            {"project_id": project_id, "status": "pending_payment"},
            {"$set": {
                "status": "payment_verified",
                "accountant_verified": True,
                "accountant_verified_by": user.user_id,
                "accountant_verified_at": datetime.now(timezone.utc).isoformat()
            }}
        )

        # Auto-move the linked lead to "Project Onboarded" so Sales doesn't have
        # to manually move the stage after approving the advance.
        lead_id_to_move = income.get("lead_id")
        if not lead_id_to_move:
            proj_doc = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "lead_id": 1})
            lead_id_to_move = (proj_doc or {}).get("lead_id")
        if not lead_id_to_move:
            ld = await db.leads.find_one({"project_id": project_id}, {"_id": 0, "lead_id": 1})
            lead_id_to_move = (ld or {}).get("lead_id")
        if lead_id_to_move:
            lead_doc = await db.leads.find_one({"lead_id": lead_id_to_move}, {"_id": 0})
            if lead_doc and lead_doc.get("current_stage_id") != "stg_project_onboarded":
                user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
                user_name = (user_doc or {}).get("name", "Accountant")
                now_iso = datetime.now(timezone.utc).isoformat()
                await db.leads.update_one(
                    {"lead_id": lead_id_to_move},
                    {"$set": {
                        "current_stage_id": "stg_project_onboarded",
                        "onboarding_status": "project_onboarded",
                        "advance_payment.verified_by": user.user_id,
                        "advance_payment.verified_by_name": user_name,
                        "advance_payment.verified_at": now_iso,
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$push": {"stage_history": {
                        "stage_id": "stg_project_onboarded",
                        "from_stage_id": lead_doc.get("current_stage_id"),
                        "moved_at": now_iso,
                        "moved_by": user.user_id,
                        "moved_by_name": user_name,
                        "action": "auto_after_accountant_review",
                        "remark": "Advance payment reviewed & approved by Accountant",
                    }}}
                )

    return {"message": "Income reviewed and approved", "verification": verification}


# ==================== CASHBOOK ENDPOINTS ====================

@router.get("/cashbook")
async def get_cashbook(
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get cashbook - all income and expense records"""
    allowed = [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    income_q = {"status": {"$in": ["approved", "verified"]}} if not project_id else {"status": {"$in": ["approved", "verified"]}, "project_id": project_id}
    # Exclude rejected / under-correction expense rows from cashbook + totals.
    # The correction engine flips these statuses when an approved row is
    # pulled back; the row should vanish from cashbook until re-approved.
    EXCLUDED_EXPENSE_STATUSES = ["under_correction", "rejected", "accountant_rejected", "accounts_rejected"]
    expense_q = {"status": {"$nin": EXCLUDED_EXPENSE_STATUSES}}
    if project_id:
        expense_q["project_id"] = project_id
    
    (incomes, recorded_exps, labour_exps, material_reqs, projects_list) = await asyncio.gather(
        db.income.find(income_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.recorded_expenses.find(expense_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.labour_expenses.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.material_requests.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )
    
    total_income = sum(i.get("amount", 0) for i in incomes)
    total_expense = sum(e.get("amount", 0) for e in recorded_exps) + sum(l.get("total_amount", 0) for l in labour_exps) + sum(m.get("estimated_price", 0) for m in material_reqs)
    
    # Income by payment mode
    mode_totals = {"cash": 0, "cheque": 0, "bank_transfer": 0, "escrow": 0}
    for i in incomes:
        mode = i.get("payment_mode", "cash")
        mode_totals[mode] = mode_totals.get(mode, 0) + i.get("amount", 0)
    
    return {
        "income": incomes,
        "expenses": recorded_exps,
        "labour_expenses": labour_exps,
        "material_expenses": material_reqs,
        "projects": projects_list,
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": total_income - total_expense,
            "income_by_mode": mode_totals,
        }
    }


class ManualExpenseCreate(BaseModel):
    project_id: str
    category: str  # material, labour, vendor, petty_cash, other
    description: str
    amount: float
    payment_method: str = "cash"  # cash, cheque, bank_transfer, upi
    vendor_name: Optional[str] = None
    remarks: Optional[str] = None
    site_allocation: Optional[List[Dict[str, Any]]] = None  # [{project_id, amount}]


@router.post("/cashbook/manual-expense")
async def create_manual_expense(data: ManualExpenseCreate, user: User = Depends(get_current_user)):
    """Record a manual expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can record expenses")
    
    project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "name": 1})
    
    expense = {
        "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
        "project_id": data.project_id,
        "project_name": project.get("name") if project else "Unknown",
        "category": data.category,
        "description": data.description,
        "amount": data.amount,
        "payment_method": data.payment_method,
        "vendor_name": data.vendor_name,
        "remarks": data.remarks,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "source": "manual",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.recorded_expenses.insert_one(expense)
    del expense["_id"]
    
    await create_audit_log(user.user_id, "create", "expense", expense["expense_id"], {"amount": data.amount, "category": data.category})
    return expense


# ==================== SUSPENSE ACCOUNT ENDPOINTS ====================

@router.get("/suspense/overview")
async def get_suspense_overview(user: User = Depends(get_current_user)):
    """Get suspense account overview - petty cash, materials (vendor credit), labour balances.
    
    Pulls from the ACTUAL data sources used by the app:
      - Petty Cash: db.petty_cash (status payment_done/acknowledged/partially_spent/issued)
      - Material Suspense: db.vendor_credit_ledger + db.credit_ledger (pending credit purchases)
      - Labour Suspense: db.labour_expenses (status pm_approved — approved but awaiting accountant payout)
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    PETTY_ACTIVE_STATUSES = ["payment_done", "acknowledged", "partially_spent", "issued"]
    VENDOR_OPEN_STATUSES = ["pending", "active", "overdue", "partially_paid"]
    LABOUR_OPEN_STATUSES = ["pm_approved", "accounts_pending"]
    
    (petty_cash, vendor_credits_v2, credit_ledger_v1, labour_expenses, projects_list) = await asyncio.gather(
        db.petty_cash.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.vendor_credit_ledger.find({"status": {"$in": VENDOR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.credit_ledger.find({"status": {"$in": VENDOR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.labour_expenses.find({"status": {"$in": LABOUR_OPEN_STATUSES}}, {"_id": 0}).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )
    
    # ---- Petty Cash ----
    petty_active = [p for p in petty_cash if p.get("status") in PETTY_ACTIVE_STATUSES]
    petty_total_issued = sum(p.get("amount_issued", 0) or 0 for p in petty_active)
    petty_total_spent = sum(p.get("amount_spent", 0) or 0 for p in petty_active)
    petty_balance = petty_total_issued - petty_total_spent
    
    # ---- Material Suspense (vendor credit) ----
    material_suspense = {}  # vendor_name -> { balance, entries:[] }
    for entry in vendor_credits_v2 + credit_ledger_v1:
        vendor = entry.get("vendor_name") or "Unknown Vendor"
        outstanding = entry.get("balance")
        if outstanding is None or outstanding == 0:
            outstanding = entry.get("amount", 0) or 0
        if outstanding <= 0:
            continue
        bucket = material_suspense.setdefault(vendor, {"name": vendor, "balance": 0, "entries": []})
        bucket["balance"] += outstanding
        bucket["entries"].append({
            "ledger_id": entry.get("ledger_id"),
            "material": entry.get("material") or entry.get("material_name", ""),
            "project_id": entry.get("project_id"),
            "amount": entry.get("amount", 0),
            "balance": outstanding,
            "due_date": entry.get("due_date"),
            "status": entry.get("status"),
        })
    
    # ---- Labour Suspense ----
    labour_suspense = {}
    for exp in labour_expenses:
        contractor = exp.get("contractor_name") or "Unknown Contractor"
        outstanding = (exp.get("total_amount", 0) or 0) - (exp.get("paid_amount", 0) or 0)
        if outstanding <= 0:
            continue
        bucket = labour_suspense.setdefault(contractor, {"name": contractor, "balance": 0, "entries": []})
        bucket["balance"] += outstanding
        bucket["entries"].append({
            "labour_expense_id": exp.get("labour_expense_id"),
            "description": exp.get("description"),
            "project_id": exp.get("project_id"),
            "amount": exp.get("total_amount", 0),
            "balance": outstanding,
            "status": exp.get("status"),
        })
    
    return {
        "petty_cash": {
            "active_requests": petty_active,
            "total_issued": petty_total_issued,
            "total_spent": petty_total_spent,
            "balance": petty_balance,
            "all_requests": petty_cash,
        },
        "material_suspense": {
            "balances": list(material_suspense.values()),
            "total": sum(b["balance"] for b in material_suspense.values()),
        },
        "labour_suspense": {
            "balances": list(labour_suspense.values()),
            "total": sum(b["balance"] for b in labour_suspense.values()),
        },
        "total_suspense_balance": (
            petty_balance
            + sum(b["balance"] for b in material_suspense.values())
            + sum(b["balance"] for b in labour_suspense.values())
        ),
        "projects": projects_list,
    }


class PaymentWithSuspense(BaseModel):
    payment_type: str  # material, labour
    vendor_or_contractor: str
    requested_amount: float
    cheque_amount: float
    payment_method: str = "cheque"
    site_allocations: List[Dict[str, Any]]  # [{project_id, project_name, amount}]
    remarks: Optional[str] = None


@router.post("/suspense/payment")
async def process_payment_with_suspense(data: PaymentWithSuspense, user: User = Depends(get_current_user)):
    """Process payment with smart suspense balance deduction.
    
    Example: Labour asks 80K, Finance pays 1L cheque.
    80K goes to labour expense, 20K goes to suspense.
    Next time same labour asks 60K, only 40K needs to be sent (20K deducted from suspense).
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can process payments")
    
    now = datetime.now(timezone.utc).isoformat()
    payment_id = f"pay_{uuid.uuid4().hex[:12]}"
    
    # Check existing suspense balance for this vendor/contractor
    existing_suspense = await db.suspense_entries.aggregate([
        {"$match": {"type": data.payment_type, "$or": [
            {"vendor_name": data.vendor_or_contractor},
            {"contractor_name": data.vendor_or_contractor}
        ]}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    current_balance = existing_suspense[0]["total"] if existing_suspense else 0
    
    # Calculate actual payment needed
    actual_needed = max(0, data.requested_amount - current_balance)
    suspense_used = min(current_balance, data.requested_amount)
    excess = data.cheque_amount - data.requested_amount  # Excess goes to suspense
    
    # Record the payment
    payment_record = {
        "payment_id": payment_id,
        "payment_type": data.payment_type,
        "vendor_or_contractor": data.vendor_or_contractor,
        "requested_amount": data.requested_amount,
        "cheque_amount": data.cheque_amount,
        "suspense_used": suspense_used,
        "actual_paid": actual_needed,
        "excess_to_suspense": excess if excess > 0 else 0,
        "payment_method": data.payment_method,
        "site_allocations": data.site_allocations,
        "remarks": data.remarks,
        "processed_by": user.user_id,
        "processed_by_name": user.name,
        "created_at": now,
    }
    await db.payment_records.insert_one({**payment_record})
    
    # If suspense was used, record a deduction entry
    if suspense_used > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"sus_{uuid.uuid4().hex[:12]}",
            "type": data.payment_type,
            "vendor_name": data.vendor_or_contractor if data.payment_type == "material" else None,
            "contractor_name": data.vendor_or_contractor if data.payment_type == "labour" else None,
            "amount": -suspense_used,
            "description": f"Deducted from suspense for payment {payment_id}",
            "payment_id": payment_id,
            "created_at": now,
        })
    
    # If excess, add to suspense
    if excess > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"sus_{uuid.uuid4().hex[:12]}",
            "type": data.payment_type,
            "vendor_name": data.vendor_or_contractor if data.payment_type == "material" else None,
            "contractor_name": data.vendor_or_contractor if data.payment_type == "labour" else None,
            "amount": excess,
            "description": f"Excess from cheque payment {payment_id} (Cheque: {data.cheque_amount}, Requested: {data.requested_amount})",
            "payment_id": payment_id,
            "created_at": now,
        })
    
    # Record expenses per site allocation
    for alloc in data.site_allocations:
        project = await db.projects.find_one({"project_id": alloc["project_id"]}, {"_id": 0, "name": 1})
        expense_entry = {
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": alloc["project_id"],
            "project_name": project.get("name") if project else alloc.get("project_name", "Unknown"),
            "category": data.payment_type,
            "description": f"Payment to {data.vendor_or_contractor}",
            "amount": alloc["amount"],
            "payment_method": data.payment_method,
            "vendor_name": data.vendor_or_contractor,
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "payment_id": payment_id,
            "created_at": now,
        }
        await db.recorded_expenses.insert_one(expense_entry)
    
    # Notify site managers for each site
    for alloc in data.site_allocations:
        await create_notification(
            None,
            f"Payment of ₹{alloc['amount']:,.0f} recorded for {data.vendor_or_contractor} on site {alloc.get('project_name', '')}"
        )
    
    new_balance = current_balance - suspense_used + (excess if excess > 0 else 0)
    
    await create_audit_log(user.user_id, "payment", "suspense", payment_id, {
        "type": data.payment_type, "vendor": data.vendor_or_contractor,
        "requested": data.requested_amount, "cheque": data.cheque_amount,
        "suspense_used": suspense_used, "new_balance": new_balance
    })
    
    return {
        "payment_id": payment_id,
        "requested_amount": data.requested_amount,
        "cheque_amount": data.cheque_amount,
        "suspense_used": suspense_used,
        "actual_paid": actual_needed,
        "excess_to_suspense": excess if excess > 0 else 0,
        "new_suspense_balance": new_balance,
        "message": f"Payment processed. Suspense balance for {data.vendor_or_contractor}: ₹{new_balance:,.0f}"
    }


@router.post("/suspense/petty-cash/{petty_cash_id}/settle")
async def settle_petty_cash(petty_cash_id: str, user: User = Depends(get_current_user)):
    """Approve petty cash settlement - moves from suspense to real expense"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can settle petty cash")
    
    pc = await db.petty_cash_requests.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})
    if not pc:
        raise HTTPException(status_code=404, detail="Petty cash request not found")
    
    if pc.get("status") not in ["submitted", "partially_settled"]:
        raise HTTPException(status_code=400, detail=f"Cannot settle - current status: {pc.get('status')}")
    
    now = datetime.now(timezone.utc).isoformat()
    amount_spent = pc.get("amount_spent", 0)
    
    # Record each expense line as a real expense
    for exp in pc.get("expenses", []):
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": pc.get("project_id"),
            "project_name": pc.get("project_name"),
            "category": "petty_cash",
            "description": exp.get("description", "Petty cash expense"),
            "amount": exp.get("amount", 0),
            "payment_method": "cash",
            "vendor_name": exp.get("vendor_name", ""),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "petty_cash_id": petty_cash_id,
            "created_at": now,
        })
    
    # Update petty cash status
    refund = pc.get("amount_issued", 0) - amount_spent
    await db.petty_cash_requests.update_one(
        {"petty_cash_id": petty_cash_id},
        {"$set": {"status": "settled", "settled_by": user.user_id, "settled_at": now, "refund_amount": refund}}
    )
    
    await create_audit_log(user.user_id, "settle", "petty_cash", petty_cash_id, {"amount_spent": amount_spent, "refund": refund})
    return {"message": f"Petty cash settled. Amount spent: ₹{amount_spent:,.0f}, Refund: ₹{refund:,.0f}"}


@router.get("/project-finance")
async def get_project_finance_view(user: User = Depends(get_current_user)):
    """Project-wise income and expense breakdown for accountant"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    (projects, incomes, recorded_exps, labour_exps, material_reqs) = await asyncio.gather(
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "total_value": 1, "status": 1}).to_list(1000),
        db.income.find({"status": {"$in": ["approved", "verified"]}}, {"_id": 0, "project_id": 1, "amount": 1, "payment_mode": 1}).to_list(5000),
        db.recorded_expenses.find({}, {"_id": 0, "project_id": 1, "amount": 1, "category": 1}).to_list(5000),
        db.labour_expenses.find({"status": "accounts_approved"}, {"_id": 0, "project_id": 1, "total_amount": 1}).to_list(1000),
        db.material_requests.find({"status": "accounts_approved"}, {"_id": 0, "project_id": 1, "estimated_price": 1}).to_list(1000),
    )
    
    from collections import defaultdict
    inc_by_proj = defaultdict(float)
    for i in incomes:
        inc_by_proj[i.get("project_id")] += i.get("amount", 0)
    
    exp_by_proj = defaultdict(lambda: {"material": 0, "labour": 0, "vendor": 0, "petty_cash": 0, "other": 0, "total": 0})
    for e in recorded_exps:
        pid = e.get("project_id")
        cat = e.get("category", "other")
        amt = e.get("amount", 0)
        if cat in exp_by_proj[pid]:
            exp_by_proj[pid][cat] += amt
        else:
            exp_by_proj[pid]["other"] += amt
        exp_by_proj[pid]["total"] += amt
    for l in labour_exps:
        pid = l.get("project_id")
        exp_by_proj[pid]["labour"] += l.get("total_amount", 0)
        exp_by_proj[pid]["total"] += l.get("total_amount", 0)
    for m in material_reqs:
        pid = m.get("project_id")
        exp_by_proj[pid]["material"] += m.get("estimated_price", 0)
        exp_by_proj[pid]["total"] += m.get("estimated_price", 0)
    
    result = []
    for p in projects:
        pid = p["project_id"]
        income = inc_by_proj.get(pid, 0)
        expenses = dict(exp_by_proj.get(pid, {"material": 0, "labour": 0, "vendor": 0, "petty_cash": 0, "other": 0, "total": 0}))
        result.append({
            "project_id": pid, "name": p["name"], "client_name": p.get("client_name"),
            "total_value": p.get("total_value", 0), "status": p.get("status"),
            "income": income, "expenses": expenses,
            "profit": income - expenses["total"],
        })
    
    result.sort(key=lambda x: x["income"], reverse=True)
    return {"projects": result}


# ==================== ENHANCED PROJECT VIEW ENDPOINT ====================

@router.get("/projects/{project_id}/full-details")
async def get_project_full_details(project_id: str, user: User = Depends(get_current_user)):
    """Get complete project details with scope, payments, additions, and deductions"""
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Hide client contact info for roles other than sales, pre_sales, cre, super_admin
    if user.role not in [UserRole.SALES, UserRole.PRE_SALES, UserRole.CRE, UserRole.SUPER_ADMIN]:
        project.pop("client_phone", None)
        project.pop("client_email", None)
    
    # Get scope items
    scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for item in scope_items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    
    # Get payment stages (honour user's manual reorder via sort_order)
    payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).sort([("sort_order", 1), ("stage_number", 1), ("created_at", 1)]).to_list(1000)
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
    
    # Income summary by payment mode — APPROVED-only across the board so the
    # project header Total Income card stops counting rejected / under_correction
    # / pending entries. Rejected/under_correction rows still appear in
    # income_entries so the UI can render the per-row correction banner.
    EXCLUDED_INCOME_STATUSES = ["rejected", "accountant_rejected", "under_correction", "pending_approval"]
    approved_income_entries = [
        e for e in income_entries
        if (e.get("status") or "approved") not in EXCLUDED_INCOME_STATUSES
    ]
    income_total = sum(e.get("amount", 0) for e in approved_income_entries)
    income_by_mode = {
        "cash": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "cash"),
        "cheque": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "cheque"),
        "bank_transfer": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "bank_transfer"),
        "escrow": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "escrow"),
        "petty_cash": sum(e.get("amount", 0) for e in approved_income_entries if e.get("payment_mode") == "petty_cash"),
    }
    
    # Payment schedule totals (requested payments - milestones)
    payment_total = sum(stage.get("amount", 0) for stage in payment_stages)
    payment_received = sum(stage.get("amount_received", 0) for stage in payment_stages)
    
    # Project value = Scope total (or original project value if no scope items)
    project_value = scope_total if scope_items else project.get("total_value", 0)
    
    # Total value = Project Value + Additions
    total_value = project_value + additions_total
    
    # Balance = Total Value - Income Received - Deductions
    balance = total_value - income_total - additions_received - deductions_total
    
    # Pre-Construction stages captured by CRE — embedded on the project doc
    # under `pre_construction.<stage_key>`. Normalize to the canonical 7 stages so
    # the UI always has a stable shape.
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
            "notes": st.get("notes"),
        })
    
    return {
        "project": project,
        "scope_items": scope_items,
        "payment_stages": payment_stages,
        "additional_costs": additional_costs,
        "deductions": deductions,
        "income_entries": income_entries,
        "pre_construction": pre_construction,
        "summary": {
            "scope_total": scope_total,
            "project_value": project_value,
            "additions_total": additions_total,
            "additions_received": additions_received,
            "total_value": total_value,
            "payment_schedule_total": payment_total,
            "payment_received": payment_received,
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
    
    expense = await db.labour_expenses.find_one(
        {"$or": [{"labour_expense_id": expense_id}, {"expense_id": expense_id}]}, {"_id": 0}
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    id_field = "labour_expense_id" if expense.get("labour_expense_id") else "expense_id"
    
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
        {id_field: expense.get(id_field)},
        {
            "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()},
            "$push": {"approvals": approval}
        }
    )
    
    await create_notification(expense["requested_by"], f"Labour expense {action.action}: {expense.get('labour_type', 'Labour')}")
    
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
    indirect_cost_percent: Optional[float] = 20.0


class CompanySettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: Optional[str] = None
    financial_year_start: Optional[str] = None
    indirect_cost_percent: Optional[float] = None


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
            "financial_year_start": "April",
            "indirect_cost_percent": 20.0
        }
    # Ensure indirect_cost_percent is always present
    if "indirect_cost_percent" not in settings:
        settings["indirect_cost_percent"] = 20.0
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
    vendor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    brands: List[dict] = []
    payment_cycle: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
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
    vendor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    brands: Optional[List[dict]] = None
    payment_cycle: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
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
    """Create a new vendor in master (Procurement, Planning, Super Admin)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor = VendorMaster(
        name=vendor_input.name,
        contact_person=vendor_input.contact_person,
        phone=vendor_input.phone,
        email=vendor_input.email,
        address=vendor_input.address,
        vendor_type=vendor_input.vendor_type,
        bank_name=vendor_input.bank_name,
        account_number=vendor_input.account_number,
        ifsc_code=vendor_input.ifsc_code,
        upi_id=vendor_input.upi_id,
        brands=vendor_input.brands,
        payment_cycle=vendor_input.payment_cycle,
        gst_number=vendor_input.gst_number,
        gst_type=vendor_input.gst_type,
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING]:
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING]:
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



# ==================== VENDOR CATEGORIES ====================

@router.get("/vendor-categories")
async def get_vendor_categories(user: User = Depends(get_current_user)):
    """Get all vendor categories"""
    cats = await db.vendor_categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return cats


@router.post("/vendor-categories")
async def create_vendor_category(data: dict, user: User = Depends(get_current_user)):
    """Create a new vendor category - any authorized user can add"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    existing = await db.vendor_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {
        "category_id": f"vcat_{uuid.uuid4().hex[:8]}",
        "name": name,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vendor_categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


# ==================== VENDOR DETAIL / SUMMARY ====================

@router.get("/vendor-master/{vendor_id}/summary")
async def get_vendor_summary(vendor_id: str, user: User = Depends(get_current_user)):
    """Get vendor summary: orders, payments, projects"""
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Get purchase orders for this vendor
    orders = await db.purchase_orders.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Get project assignments
    assignments = await db.project_vendor_assignments.find(
        {"vendor_id": vendor_id}, {"_id": 0}
    ).to_list(500)

    # Calculate totals
    total_orders = len(orders)
    total_order_value = sum(o.get("total_amount", 0) for o in orders)
    paid_amount = sum(o.get("paid_amount", 0) for o in orders)
    pending_amount = total_order_value - paid_amount

    # Get unique project IDs
    project_ids = list(set(
        [o.get("project_id") for o in orders if o.get("project_id")] +
        [a.get("project_id") for a in assignments if a.get("project_id")]
    ))
    projects = []
    if project_ids:
        projects = await db.projects.find(
            {"project_id": {"$in": project_ids}},
            {"_id": 0, "project_id": 1, "name": 1, "client_name": 1}
        ).to_list(500)

    return {
        "vendor": vendor,
        "orders": orders,
        "assignments": assignments,
        "projects": projects,
        "stats": {
            "total_orders": total_orders,
            "total_order_value": total_order_value,
            "paid_amount": paid_amount,
            "pending_amount": pending_amount,
            "project_count": len(project_ids)
        }
    }


# ==================== PROJECT VENDOR ASSIGNMENTS ====================

@router.get("/projects/{project_id}/vendor-assignments")
async def get_project_vendor_assignments(project_id: str, user: User = Depends(get_current_user)):
    """Get vendor assignments for a project"""
    assignments = await db.project_vendor_assignments.find(
        {"project_id": project_id}, {"_id": 0}
    ).to_list(500)
    return assignments


@router.post("/projects/{project_id}/vendor-assignments")
async def assign_vendor_to_project(project_id: str, data: dict, user: User = Depends(get_current_user)):
    """Assign a vendor to a project for a specific material category"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "project_id": 1, "name": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    vendor_id = data.get("vendor_id")
    category = data.get("category")
    brand = data.get("brand", "")

    if not vendor_id or not category:
        raise HTTPException(status_code=400, detail="vendor_id and category required")

    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0, "vendor_id": 1, "name": 1})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Upsert assignment
    assignment_id = f"pva_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.project_vendor_assignments.find_one({
        "project_id": project_id, "category": category
    })

    if existing:
        await db.project_vendor_assignments.update_one(
            {"project_id": project_id, "category": category},
            {"$set": {
                "vendor_id": vendor_id,
                "vendor_name": vendor["name"],
                "brand": brand,
                "updated_by": user.user_id,
                "updated_at": now
            }}
        )
        return {"message": "Assignment updated"}
    else:
        assignment = {
            "assignment_id": assignment_id,
            "project_id": project_id,
            "project_name": project.get("name", ""),
            "vendor_id": vendor_id,
            "vendor_name": vendor["name"],
            "category": category,
            "brand": brand,
            "created_by": user.user_id,
            "created_at": now,
            "updated_at": now
        }
        await db.project_vendor_assignments.insert_one(assignment)
        assignment.pop("_id", None)
        return assignment


@router.delete("/projects/{project_id}/vendor-assignments/{category}")
async def remove_vendor_assignment(project_id: str, category: str, user: User = Depends(get_current_user)):
    """Remove a vendor assignment from a project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.project_vendor_assignments.delete_one({"project_id": project_id, "category": category})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"message": "Assignment removed"}


# ==================== PURCHASE ORDERS ====================

@router.get("/purchase-orders")
async def get_purchase_orders(
    project_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get purchase orders with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    query = {}
    if project_id:
        query["project_id"] = project_id
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return orders


@router.post("/purchase-orders")
async def create_purchase_order(data: dict, user: User = Depends(get_current_user)):
    """Create a purchase order (usually auto-created from approved material request)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    po = {
        "po_id": f"po_{uuid.uuid4().hex[:8]}",
        "project_id": data.get("project_id"),
        "project_name": data.get("project_name", ""),
        "vendor_id": data.get("vendor_id"),
        "vendor_name": data.get("vendor_name", ""),
        "material_request_id": data.get("material_request_id"),
        "items": data.get("items", []),
        "total_amount": data.get("total_amount", 0),
        "paid_amount": 0,
        "status": "pending",  # pending, approved, dispatched, delivered, cancelled
        "payment_status": "unpaid",  # unpaid, partial, paid
        "notes": data.get("notes", ""),
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.purchase_orders.insert_one(po)
    po.pop("_id", None)
    return po


@router.patch("/purchase-orders/{po_id}/status")
async def update_purchase_order_status(po_id: str, data: dict, user: User = Depends(get_current_user)):
    """Update purchase order status"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    po = await db.purchase_orders.find_one({"po_id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if "status" in data:
        update["status"] = data["status"]
    if "payment_status" in data:
        update["payment_status"] = data["payment_status"]
    if "paid_amount" in data:
        update["paid_amount"] = data["paid_amount"]
    if "notes" in data:
        update["notes"] = data["notes"]
    await db.purchase_orders.update_one({"po_id": po_id}, {"$set": update})
    return await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})


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
    """Get users by role"""
    if current_user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({"role": role, "is_active": {"$ne": False}}, {"_id": 0, "password_hash": 0}).to_list(1000)
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



# ==================== ENHANCED CASHBOOK WITH DATE RANGE ====================

@router.get("/accountant/cashbook-filtered")
async def get_cashbook_filtered(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get filtered cashbook data with date range support"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    income_q = {}
    expense_q = {}

    # Income tab should only show APPROVED entries (or legacy entries without
    # an explicit status field). Hide pending_approval / rejected so the
    # Cashbook stays a "money in the bank" view.
    income_q["$or"] = [
        {"status": "approved"},
        {"status": {"$exists": False}},
        {"status": None},
    ]

    if project_id:
        income_q["project_id"] = project_id
        expense_q["project_id"] = project_id

    if start_date:
        income_q.setdefault("created_at", {})["$gte"] = start_date
        expense_q.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        income_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
        expense_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"

    (incomes, recorded_exps, labour_exps, material_reqs, projects_list) = await asyncio.gather(
        db.income.find(income_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.recorded_expenses.find(expense_q, {"_id": 0}).sort("created_at", -1).to_list(2000),
        db.labour_expenses.find({**expense_q, "status": "accounts_approved"}, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.material_requests.find(expense_q, {"_id": 0}).sort("created_at", -1).to_list(1000),
        db.projects.find({}, {"_id": 0, "project_id": 1, "name": 1}).to_list(1000),
    )

    project_map = {p["project_id"]: p["name"] for p in projects_list}

    # Enrich income entries
    for i in incomes:
        i["project_name"] = project_map.get(i.get("project_id"), "Unknown")

    # Build all expenses list — every row gets a unified `expense_id` so the
    # frontend has a single field to send back when deleting, regardless of
    # which collection it came from.
    all_expenses = []
    for e in recorded_exps:
        all_expenses.append({
            **e,
            "expense_id": e.get("expense_id") or str(e.get("_id", "")),
            "expense_type": e.get("category", "other"),
            "project_name": project_map.get(e.get("project_id"), ""),
            "source": e.get("source") or ("approval" if e.get("approval_id") or e.get("from_approval") else "manual"),
        })
    for l in labour_exps:
        all_expenses.append({
            **l,
            "expense_id": l.get("labour_expense_id") or l.get("expense_id"),
            "expense_type": "labour",
            "amount": l.get("total_amount", 0),
            "project_name": project_map.get(l.get("project_id"), ""),
            "source": "approval",
        })
    for m in material_reqs:
        amt = m.get("estimated_price", 0) or m.get("final_price", 0)
        all_expenses.append({
            **m,
            "expense_id": m.get("request_id") or m.get("expense_id"),
            "expense_type": "material",
            "amount": amt,
            "project_name": project_map.get(m.get("project_id"), ""),
            "source": "approval",
        })

    all_expenses.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    total_income = sum(i.get("amount", 0) for i in incomes)
    total_expense = sum(e.get("amount", 0) for e in all_expenses)

    # Build income_by_mode and expense_by_mode for the Financial Overview cards,
    # honoring the same date/project filter so cards always match the table below.
    mode_keys = ["cash", "current_account", "savings_account", "cheque", "petty_cash", "miscellaneous", "direct_transfer", "suspense_account"]
    def _classify(mode):
        if not mode:
            return "cash"
        m = str(mode).lower().replace(" ", "_")
        mp = {
            "cash": "cash", "bank_transfer": "current_account", "neft": "current_account",
            "rtgs": "current_account", "imps": "current_account", "escrow": "current_account",
            "cheque": "cheque", "petty_cash": "petty_cash", "savings": "savings_account",
            "savings_account": "savings_account", "current_account": "current_account",
            "miscellaneous": "miscellaneous", "direct_transfer": "direct_transfer",
            "dt": "direct_transfer", "suspense": "suspense_account", "suspense_account": "suspense_account",
        }
        return mp.get(m, "miscellaneous")

    income_by_mode = {k: 0 for k in mode_keys}
    income_by_mode["total"] = total_income
    for i in incomes:
        income_by_mode[_classify(i.get("payment_mode"))] += i.get("amount", 0)

    expense_by_mode = {k: 0 for k in mode_keys}
    expense_by_mode["total"] = total_expense
    for e in all_expenses:
        expense_by_mode[_classify(e.get("payment_method") or e.get("payment_mode"))] += e.get("amount", 0)

    return {
        "income_entries": incomes[:500],
        "expense_entries": all_expenses[:500],
        "projects": projects_list,
        "income_by_mode": income_by_mode,
        "expense_by_mode": expense_by_mode,
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_balance": total_income - total_expense,
            "income_count": len(incomes),
            "expense_count": len(all_expenses),
        }
    }


# ==================== SMART CHEQUE PAYMENT ====================

@router.get("/accountant/vendor-suspense/{vendor_name}")
async def get_vendor_suspense_balance(vendor_name: str, user: User = Depends(get_current_user)):
    """Get suspense balance for a specific vendor"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check cheque-based suspense
    suspense_entries = await db.cheque_suspense.find(
        {"vendor_name": vendor_name},
        {"_id": 0}
    ).to_list(500)

    total_balance = sum(e.get("amount", 0) for e in suspense_entries)

    return {
        "vendor_name": vendor_name,
        "suspense_balance": total_balance,
        "entries": suspense_entries
    }


@router.get("/accountant/all-vendor-suspense")
async def get_all_vendor_suspense(user: User = Depends(get_current_user)):
    """Get suspense balances for all vendors"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    entries = await db.cheque_suspense.find({}, {"_id": 0}).to_list(5000)

    # Group by vendor
    vendor_balances = {}
    for e in entries:
        vn = e.get("vendor_name", "Unknown")
        if vn not in vendor_balances:
            vendor_balances[vn] = {"vendor_name": vn, "balance": 0, "entries": []}
        vendor_balances[vn]["balance"] += e.get("amount", 0)
        vendor_balances[vn]["entries"].append(e)

    # Only return vendors with non-zero balance
    result = [v for v in vendor_balances.values() if v["balance"] != 0]
    result.sort(key=lambda x: x["balance"], reverse=True)

    return result


class ChequePaymentRequest(BaseModel):
    cheque_id: str
    expense_project_id: str
    expense_category: str  # material, labour, vendor, other
    expense_description: str
    expense_amount: float
    vendor_name: str
    use_suspense: bool = False
    suspense_amount_to_use: float = 0
    remarks: Optional[str] = None


@router.post("/accountant/cheque-payment")
async def process_cheque_payment(data: ChequePaymentRequest, user: User = Depends(get_current_user)):
    """Smart cheque payment: pay expense via cheque, handle excess → vendor suspense.
    
    Logic:
    - Fetch cheque details
    - If use_suspense, deduct from vendor's suspense first
    - Record expense
    - If cheque amount > expense amount, excess goes to vendor suspense
    - Update cheque status
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc).isoformat()
    payment_id = f"cpay_{uuid.uuid4().hex[:12]}"

    # Get cheque
    cheque = await db.cheques.find_one({"cheque_id": data.cheque_id}, {"_id": 0})
    if not cheque:
        raise HTTPException(status_code=404, detail="Cheque not found")

    cheque_amount = cheque.get("amount", 0)

    # Get project name
    project = await db.projects.find_one({"project_id": data.expense_project_id}, {"_id": 0, "name": 1})
    project_name = project.get("name") if project else "Unknown"

    # Calculate effective payment
    suspense_used = 0
    if data.use_suspense and data.suspense_amount_to_use > 0:
        # Verify suspense balance
        suspense_entries = await db.cheque_suspense.find(
            {"vendor_name": data.vendor_name}, {"_id": 0}
        ).to_list(500)
        available_suspense = sum(e.get("amount", 0) for e in suspense_entries)

        suspense_used = min(data.suspense_amount_to_use, available_suspense, data.expense_amount)

        if suspense_used > 0:
            # Debit suspense
            await db.cheque_suspense.insert_one({
                "entry_id": f"csus_{uuid.uuid4().hex[:12]}",
                "vendor_name": data.vendor_name,
                "amount": -suspense_used,
                "description": f"Used for expense: {data.expense_description}",
                "payment_id": payment_id,
                "cheque_id": data.cheque_id,
                "project_id": data.expense_project_id,
                "created_at": now,
            })

    amount_from_cheque = data.expense_amount - suspense_used
    excess = cheque_amount - amount_from_cheque

    # If excess, credit to vendor suspense
    if excess > 0:
        await db.cheque_suspense.insert_one({
            "entry_id": f"csus_{uuid.uuid4().hex[:12]}",
            "vendor_name": data.vendor_name,
            "amount": excess,
            "description": f"Excess from cheque {cheque.get('cheque_number')} (Cheque: {cheque_amount}, Used: {amount_from_cheque})",
            "payment_id": payment_id,
            "cheque_id": data.cheque_id,
            "project_id": data.expense_project_id,
            "created_at": now,
        })

    # Record the expense
    expense_record = {
        "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
        "project_id": data.expense_project_id,
        "project_name": project_name,
        "category": data.expense_category,
        "description": data.expense_description,
        "amount": data.expense_amount,
        "payment_method": "cheque",
        "vendor_name": data.vendor_name,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "status": "recorded",
        "payment_id": payment_id,
        "cheque_id": data.cheque_id,
        "cheque_number": cheque.get("cheque_number"),
        "suspense_used": suspense_used,
        "remarks": data.remarks,
        "created_at": now,
    }
    await db.recorded_expenses.insert_one(expense_record)
    del expense_record["_id"]

    # Update cheque status to 'used' or keep as issued
    await db.cheques.update_one(
        {"cheque_id": data.cheque_id},
        {"$set": {
            "status": "deposited",
            "linked_payment_id": payment_id,
            "linked_expense_amount": data.expense_amount,
            "updated_at": now,
        }}
    )

    # Get new suspense balance
    new_suspense_entries = await db.cheque_suspense.find(
        {"vendor_name": data.vendor_name}, {"_id": 0}
    ).to_list(500)
    new_balance = sum(e.get("amount", 0) for e in new_suspense_entries)

    await create_audit_log(user.user_id, "cheque_payment", "expense", payment_id, {
        "cheque_id": data.cheque_id,
        "cheque_amount": cheque_amount,
        "expense_amount": data.expense_amount,
        "suspense_used": suspense_used,
        "excess_to_suspense": excess if excess > 0 else 0,
        "vendor": data.vendor_name,
    })

    return {
        "payment_id": payment_id,
        "cheque_amount": cheque_amount,
        "expense_amount": data.expense_amount,
        "suspense_used": suspense_used,
        "amount_from_cheque": amount_from_cheque,
        "excess_to_suspense": excess if excess > 0 else 0,
        "new_suspense_balance": new_balance,
        "expense": expense_record,
        "message": f"Payment processed via cheque {cheque.get('cheque_number')}. Vendor suspense balance: ₹{new_balance:,.0f}"
    }


@router.get("/accountant/uncleared-cheques")
async def get_uncleared_cheques(user: User = Depends(get_current_user)):
    """Get cheques available for payment (issued/post_dated, not yet cleared/used)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Access denied")

    cheques = await db.cheques.find(
        {"status": {"$in": ["issued", "post_dated"]}, "cheque_type": "outgoing"},
        {"_id": 0}
    ).sort("cheque_date", -1).to_list(200)

    return cheques



# ==================== ACCOUNTANT APPROVAL SYSTEM ====================

class ApprovalAction(BaseModel):
    remarks: Optional[str] = None


@router.get("/accountant/approvals")
async def get_accountant_approvals(user: User = Depends(get_current_user)):
    """Get all pending and recent approval requests for the accountant"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can access approvals")

    pending = await db.approval_requests.find(
        {"status": "pending"}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    recent = await db.approval_requests.find(
        {"status": {"$in": ["approved", "rejected"]}}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)

    summary = {
        "pending_count": len(pending),
        "pending_income": sum(r["amount"] for r in pending if r["entry_type"] == "income"),
        "pending_expense": sum(r["amount"] for r in pending if r["entry_type"] == "expense"),
    }

    return {"pending": pending, "recent": recent, "summary": summary}


@router.patch("/accountant/approvals/{approval_id}/approve")
async def approve_request(approval_id: str, data: ApprovalAction = None, user: User = Depends(get_current_user)):
    """Accountant approves a pending income/expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve")

    req = await db.approval_requests.find_one({"approval_id": approval_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")

    now = datetime.now(timezone.utc).isoformat()
    remarks = (data.remarks if data else None) or ""

    await db.approval_requests.update_one(
        {"approval_id": approval_id},
        {"$set": {"status": "approved", "approved_by": user.user_id, "approved_by_name": user.name, "approved_at": now, "remarks": remarks, "updated_at": now}}
    )

    # Record in the actual cashbook
    if req["entry_type"] == "income":
        income_doc = {
            "income_id": f"inc_{uuid.uuid4().hex[:12]}",
            "project_id": req.get("project_id"),
            "stage": req.get("stage", ""),
            "description": req.get("description", ""),
            "amount": req["amount"],
            "payment_mode": req.get("payment_mode", "cash"),
            "reference_number": req.get("reference", ""),
            "payment_date": req.get("payment_date", now),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "remarks": f"[Approval] {req.get('description','')} - {remarks}",
            "source": "approval",
            "approval_id": approval_id,
            "created_at": now,
        }
        await db.income.insert_one(income_doc)
    else:
        expense_doc = {
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "project_id": req.get("project_id"),
            "project_name": req.get("project_name", ""),
            "category": req.get("category", "other"),
            "description": req.get("description", ""),
            "amount": req["amount"],
            "payment_method": req.get("payment_mode", "cash"),
            "vendor_name": req.get("vendor_name", ""),
            "reference": req.get("reference", ""),
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "recorded",
            "source": "approval",
            "approval_id": approval_id,
            "work_order_id": req.get("work_order_id"),
            "created_at": now,
        }
        await db.recorded_expenses.insert_one(expense_doc)

    # Notify requester
    if req.get("requested_by"):
        await create_notification(req["requested_by"], f"Your {req['entry_type']} request for ₹{req['amount']:,.0f} has been approved")

    return {"message": f"{req['entry_type'].capitalize()} approved and recorded", "approval_id": approval_id}


@router.patch("/accountant/approvals/{approval_id}/reject")
async def reject_request(approval_id: str, data: ApprovalAction = None, user: User = Depends(get_current_user)):
    """Accountant rejects a pending income/expense entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can reject")

    req = await db.approval_requests.find_one({"approval_id": approval_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")

    now = datetime.now(timezone.utc).isoformat()
    remarks = (data.remarks if data else None) or ""

    await db.approval_requests.update_one(
        {"approval_id": approval_id},
        {"$set": {"status": "rejected", "rejected_by": user.user_id, "rejected_by_name": user.name, "rejected_at": now, "remarks": remarks, "updated_at": now}}
    )

    if req.get("requested_by"):
        await create_notification(req["requested_by"], f"Your {req['entry_type']} request for ₹{req['amount']:,.0f} was rejected. Reason: {remarks}")

    return {"message": f"{req['entry_type'].capitalize()} rejected", "approval_id": approval_id}

# ==================== UNIFIED PAY APPROVAL ENDPOINT ====================
# Single endpoint handles payment for material/labour/petty_cash requests.
# Logic:
#   1. Look up the request by type+id, fetch bill_amount + vendor_name + project_id
#   2. Look up existing vendor suspense balance
#   3. Compute payable = max(0, bill_amount - existing_suspense)
#   4. credit_used = min(existing_suspense, bill_amount)  → debits (reduces) old suspense
#   5. If method == cheque: paid = chosen_cheque.amount; new_suspense_credit = paid - payable
#   6. Else: paid = payable; new_suspense_credit = 0
#   7. Insert recorded_expenses entry (cashbook outgoing)
#   8. Insert suspense_entries adjustments (debit + new credit if any)
#   9. Mark cheque used / set request status='paid'

class PaymentDenomination(BaseModel):
    note: int
    count: int

class PayApprovalRequest(BaseModel):
    payment_method: str  # cash / current_account / savings / cheque
    transaction_id: Optional[str] = None
    cheque_id: Optional[str] = None  # legacy single cheque
    cheque_ids: Optional[List[str]] = None  # multi-cheque selection
    denominations: Optional[List[PaymentDenomination]] = None
    remarks: Optional[str] = None


def _request_collection_and_keys(req_type: str):
    """Map request type to collection + ID field + amount field + vendor field + project field"""
    if req_type == "material":
        return ("material_expenses", "expense_id",
                lambda r: r.get("final_amount") or r.get("estimated_cost") or r.get("estimated_price") or r.get("final_price") or 0,
                lambda r: r.get("vendor_name") or r.get("supplier_name") or r.get("material_name") or "Unknown",
                "project_id", "material")
    if req_type == "labour":
        return ("labour_expenses", "labour_expense_id",
                lambda r: r.get("total_amount") or 0,
                lambda r: r.get("contractor_name") or "Unknown Contractor",
                "project_id", "labour")
    if req_type == "petty_cash":
        return ("petty_cash_requests", "petty_cash_id",
                lambda r: r.get("amount_issued") or r.get("amount_spent") or 0,
                lambda r: r.get("site_engineer_name") or r.get("vendor_name") or "Petty Cash",
                "project_id", "petty_cash")
    raise HTTPException(status_code=400, detail=f"Invalid request type: {req_type}")


@router.get("/approvals/{req_type}/{request_id}/pay-context")
async def get_pay_context(req_type: str, request_id: str, user: User = Depends(get_current_user)):
    """Returns request details + current suspense balance + active opened cheques (for the dialog)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    coll, id_field, amount_fn, vendor_fn, _project_field, suspense_type = _request_collection_and_keys(req_type)
    req = await db[coll].find_one({id_field: request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    bill_amount = float(amount_fn(req) or 0)
    vendor_name = vendor_fn(req)
    project_id = req.get("project_id")

    # Project name lookup
    project_name = None
    if project_id:
        p = await db.projects.find_one({"project_id": project_id}, {"_id": 0, "name": 1})
        if p: project_name = p.get("name")

    # Vendor suspense balance — sum existing entries
    suspense_query = {"type": suspense_type}
    if suspense_type == "material":
        suspense_query["vendor_name"] = vendor_name
    elif suspense_type == "labour":
        suspense_query["contractor_name"] = vendor_name
    else:  # petty_cash uses site_engineer_id
        if req.get("site_engineer_id"):
            suspense_query["site_engineer_id"] = req["site_engineer_id"]
        else:
            suspense_query["vendor_name"] = vendor_name
    suspense_entries = await db.suspense_entries.find(suspense_query, {"_id": 0}).to_list(1000)
    existing_suspense = sum(float(e.get("amount", 0) or 0) for e in suspense_entries)

    # Active CRE-opened incoming cheques (not yet used for an expense)
    active_cheques = await db.cheques.find({
        "cheque_type": "incoming",
        "is_opened": True,
        "status": {"$in": ["issued", "post_dated", "deposited"]},
        "$or": [{"used_for_expense_id": {"$exists": False}}, {"used_for_expense_id": None}],
    }, {"_id": 0}).sort("cheque_date", -1).to_list(200)

    # Inactive (locked) incoming cheques — Accountant can "Request Open"
    inactive_cheques = await db.cheques.find({
        "cheque_type": "incoming",
        "is_opened": False,
        "status": {"$in": ["issued", "post_dated", "deposited"]},
        "$or": [{"used_for_expense_id": {"$exists": False}}, {"used_for_expense_id": None}],
    }, {"_id": 0}).sort("cheque_date", -1).to_list(200)

    # Enrich with project name for both lists
    project_cache = {}
    for ch in (active_cheques + inactive_cheques):
        pid = ch.get("project_id")
        if pid and pid not in project_cache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            project_cache[pid] = p["name"] if p else None
        if pid:
            ch["project_name"] = project_cache.get(pid) or ch.get("project_name")

    payable = max(0.0, bill_amount - existing_suspense)
    credit_used = min(existing_suspense, bill_amount)

    return {
        "request": {
            "id": request_id,
            "type": req_type,
            "vendor_name": vendor_name,
            "project_id": project_id,
            "project_name": project_name,
            "bill_amount": bill_amount,
            "description": req.get("material_name") or req.get("labour_type") or req.get("description") or "",
            "current_status": req.get("status"),
        },
        "suspense": {
            "vendor_balance": existing_suspense,
            "credit_to_apply": credit_used,
        },
        "payable_after_suspense": payable,
        "active_cheques": active_cheques,
        "inactive_cheques": inactive_cheques,
    }


@router.post("/approvals/{req_type}/{request_id}/pay")
async def pay_approval(req_type: str, request_id: str, data: PayApprovalRequest, user: User = Depends(get_current_user)):
    """Process payment for an expense approval (material/labour/petty_cash)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")

    coll, id_field, amount_fn, vendor_fn, _proj_field, suspense_type = _request_collection_and_keys(req_type)
    req = await db[coll].find_one({id_field: request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.get("status") in ("paid", "settled", "rejected"):
        raise HTTPException(status_code=400, detail=f"Already processed (status={req.get('status')})")

    bill_amount = float(amount_fn(req) or 0)
    vendor_name = vendor_fn(req)
    project_id = req.get("project_id")

    # 1. Existing suspense balance (auto-apply)
    suspense_query = {"type": suspense_type}
    if suspense_type == "material":
        suspense_query["vendor_name"] = vendor_name
    elif suspense_type == "labour":
        suspense_query["contractor_name"] = vendor_name
    else:
        if req.get("site_engineer_id"):
            suspense_query["site_engineer_id"] = req["site_engineer_id"]
        else:
            suspense_query["vendor_name"] = vendor_name
    sus_entries = await db.suspense_entries.find(suspense_query, {"_id": 0}).to_list(1000)
    existing_suspense = sum(float(e.get("amount", 0) or 0) for e in sus_entries)

    payable = max(0.0, bill_amount - existing_suspense)
    credit_used = min(existing_suspense, bill_amount)

    # 2. Payment-method specific: figure out actual paid amount + create cheque link
    paid_amount = payable
    cheque_docs = []  # list of selected cheque docs (multi-cheque support)
    if data.payment_method == "cheque":
        # Resolve cheque ids (support both single legacy + multi)
        ch_ids = list(data.cheque_ids or [])
        if data.cheque_id and data.cheque_id not in ch_ids:
            ch_ids.append(data.cheque_id)
        if not ch_ids:
            raise HTTPException(status_code=400, detail="At least one cheque must be selected")
        # Validate each cheque
        for cid in ch_ids:
            cd = await db.cheques.find_one({"cheque_id": cid}, {"_id": 0})
            if not cd:
                raise HTTPException(status_code=404, detail=f"Cheque {cid} not found")
            if not cd.get("is_opened"):
                raise HTTPException(status_code=400, detail=f"Cheque {cd.get('cheque_number')} is not opened by CRE yet")
            if cd.get("used_for_expense_id"):
                raise HTTPException(status_code=400, detail=f"Cheque {cd.get('cheque_number')} has already been used")
            cheque_docs.append(cd)
        paid_amount = sum(float(c.get("amount", 0) or 0) for c in cheque_docs)
        if paid_amount < payable:
            raise HTTPException(status_code=400, detail=f"Total cheque amount ₹{paid_amount:,.0f} is less than payable ₹{payable:,.0f}")
    elif data.payment_method in ("current_account", "savings"):
        if not data.transaction_id or not data.transaction_id.strip():
            raise HTTPException(status_code=400, detail="transaction_id required for bank payment")
    elif data.payment_method == "cash":
        if not data.denominations:
            raise HTTPException(status_code=400, detail="denominations required for cash payment")
        denom_total = sum(d.note * d.count for d in data.denominations)
        if abs(denom_total - payable) > 0.5:
            raise HTTPException(status_code=400, detail=f"Denomination total ₹{denom_total:,.0f} ≠ payable ₹{payable:,.0f}")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid payment_method: {data.payment_method}")

    # 3. New suspense from over-payment (cheque only — cash/bank pay exact amount)
    new_suspense_credit = max(0.0, paid_amount - payable) if data.payment_method == "cheque" else 0.0

    now = datetime.now(timezone.utc).isoformat()
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"

    # 4. Insert main expense in cashbook
    cheque_ids_used = [c["cheque_id"] for c in cheque_docs] if cheque_docs else []
    cheque_numbers_used = [c.get("cheque_number") for c in cheque_docs] if cheque_docs else []
    cashbook_entry = {
        "expense_id": expense_id,
        "project_id": project_id,
        "category": suspense_type,
        "expense_type": suspense_type,
        "description": req.get("material_name") or req.get("labour_type") or f"{suspense_type} payment",
        "amount": payable,  # the actual expense booked = payable amount
        "payment_method": data.payment_method,
        "transaction_id": data.transaction_id,
        "cheque_id": cheque_ids_used[0] if cheque_ids_used else None,  # legacy single field
        "cheque_ids": cheque_ids_used,  # full multi-cheque list
        "cheque_numbers": cheque_numbers_used,
        "denominations": [d.model_dump() for d in (data.denominations or [])],
        "vendor_name": vendor_name,
        "request_id": request_id,
        "request_type": req_type,
        "credit_applied": credit_used,
        "cheque_amount_paid": paid_amount if data.payment_method == "cheque" else None,
        "new_suspense_credit": new_suspense_credit,
        "recorded_by": user.user_id,
        "recorded_by_name": user.name,
        "remarks": data.remarks,
        "status": "approved",
        "source": "approval",
        "approval_id": request_id,
        "created_at": now,
        "approved_at": now,
        "approved_by": user.user_id,
    }
    await db.recorded_expenses.insert_one(cashbook_entry)

    # 5. Suspense ledger updates
    if credit_used > 0:
        # Debit (reduce) existing balance — record as negative
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": suspense_type,
            **({"vendor_name": vendor_name} if suspense_type == "material" else
               {"contractor_name": vendor_name} if suspense_type == "labour" else
               ({"site_engineer_id": req.get("site_engineer_id"), "site_engineer_name": vendor_name} if req.get("site_engineer_id") else {"vendor_name": vendor_name})),
            "amount": -credit_used,
            "description": f"Suspense applied to {req_type} bill (request {request_id})",
            "linked_expense_id": expense_id,
            "linked_request_id": request_id,
            "created_at": now,
            "created_by": user.user_id,
        })
    if new_suspense_credit > 0:
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": suspense_type,
            **({"vendor_name": vendor_name} if suspense_type == "material" else
               {"contractor_name": vendor_name} if suspense_type == "labour" else
               ({"site_engineer_id": req.get("site_engineer_id"), "site_engineer_name": vendor_name} if req.get("site_engineer_id") else {"vendor_name": vendor_name})),
            "amount": new_suspense_credit,
            "description": f"Excess from cheque(s) {', '.join(cheque_numbers_used)} on {req_type} bill ({request_id})",
            "linked_expense_id": expense_id,
            "linked_cheque_ids": cheque_ids_used,
            "created_at": now,
            "created_by": user.user_id,
        })

    # 6. Mark all selected cheques used
    for cd in cheque_docs:
        await db.cheques.update_one(
            {"cheque_id": cd["cheque_id"]},
            {"$set": {
                "used_for_expense_id": expense_id,
                "used_at": now,
                "used_by": user.user_id,
                "used_by_name": user.name,
                "status": "deposited" if cd.get("status") == "issued" else cd.get("status"),
                "updated_at": now,
            }}
        )

    # 7. Update request status to "paid"
    await db[coll].update_one(
        {id_field: request_id},
        {"$set": {
            "status": "paid",
            "paid_by": user.user_id,
            "paid_by_name": user.name,
            "paid_at": now,
            "paid_amount": paid_amount,
            "paid_via_expense_id": expense_id,
            "updated_at": now,
        }}
    )

    await create_audit_log(user.user_id, "pay", req_type, request_id, {
        "bill_amount": bill_amount, "credit_used": credit_used, "paid_amount": paid_amount,
        "new_suspense": new_suspense_credit, "payment_method": data.payment_method,
    })

    return {
        "message": "Payment processed",
        "expense_id": expense_id,
        "bill_amount": bill_amount,
        "credit_used": credit_used,
        "payable": payable,
        "paid_amount": paid_amount,
        "new_suspense_credit": new_suspense_credit,
    }


# ==================== OTHER ACCOUNTS (Sub-contractors / Consultants / etc.) ====================

class OtherAccountCreate(BaseModel):
    name: str
    category: str  # free-text; standard set: sub_contractor / consultant / statutory / misc + any custom
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    branch: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None


class OtherAccountUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    branch: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None


@router.get("/other-accounts")
async def list_other_accounts(
    category: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    q: Dict[str, Any] = {}
    if category:
        q["category"] = category
    accounts = await db.other_accounts.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    # Also return distinct categories so the FE can render a "type and add new" combo
    categories = await db.other_accounts.distinct("category")
    default_cats = ["sub_contractor", "consultant", "statutory", "misc"]
    merged = list(dict.fromkeys(default_cats + sorted([c for c in categories if c])))
    return {"accounts": accounts, "categories": merged}


@router.post("/other-accounts")
async def create_other_account(data: OtherAccountCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can create")
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Account name is required")
    cat = (data.category or "misc").strip().lower().replace(" ", "_") or "misc"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "account_id": f"oa_{uuid.uuid4().hex[:12]}",
        **data.model_dump(),
        "category": cat,
        "name": name,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
        "created_by_name": user.name,
    }
    await db.other_accounts.insert_one(doc)
    await create_audit_log(user.user_id, "create", "other_account", doc["account_id"], {"name": name, "category": cat})
    doc.pop("_id", None)
    return doc


@router.get("/other-accounts/{account_id}")
async def get_other_account(account_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.GENERAL_MANAGER, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    acc = await db.other_accounts.find_one({"account_id": account_id}, {"_id": 0})
    if not acc:
        raise HTTPException(status_code=404, detail="Other account not found")
    history = await db.recorded_expenses.find(
        {"other_account_id": account_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"account": acc, "history": history}


@router.patch("/other-accounts/{account_id}")
async def update_other_account(account_id: str, data: OtherAccountUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if "category" in update:
        update["category"] = update["category"].strip().lower().replace(" ", "_") or "misc"
    if not update:
        return {"message": "Nothing to update"}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.other_accounts.update_one({"account_id": account_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Other account not found")
    await create_audit_log(user.user_id, "update", "other_account", account_id, update)
    return {"message": "Updated"}


@router.delete("/other-accounts/{account_id}")
async def deactivate_other_account(account_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can deactivate")
    res = await db.other_accounts.update_one(
        {"account_id": account_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Other account not found")
    return {"message": "Deactivated"}



# ==================== DIRECT TRANSFER (DT) WORKFLOW ====================

class DTSelection(BaseModel):
    kind: str  # material / labour / other_account
    request_id: Optional[str] = None  # for material/labour
    other_account_id: Optional[str] = None  # for other_account
    amount: float


class DTAssign(BaseModel):
    selections: List[DTSelection]


@router.get("/dt/payable-items")
async def list_dt_payable_items(user: User = Depends(get_current_user)):
    """Lists items the Accountant can mark for payment against a DT income.
    Returns: { material_requests, labour_requests, other_accounts }
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Material expenses awaiting payment (planning/procurement/account approved but unpaid)
    material = await db.material_expenses.find(
        {"status": {"$in": ["pending_accounts_approval", "procurement_priced", "planning_approved", "accounts_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Labour
    labour = await db.labour_expenses.find(
        {"status": {"$in": ["pending_accounts_approval", "planning_approved", "accounts_approved"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    # Other accounts (active records with bank details)
    other = await db.other_accounts.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Enrich material/labour with project name
    pcache = {}
    for r in material + labour:
        pid = r.get("project_id")
        if pid and pid not in pcache:
            p = await db.projects.find_one({"project_id": pid}, {"_id": 0, "name": 1})
            pcache[pid] = p["name"] if p else "Unknown"
        if pid:
            r["project_name"] = pcache.get(pid, r.get("project_name") or "Unknown")

    return {
        "material_requests": material,
        "labour_requests": labour,
        "other_accounts": other,
    }


@router.post("/dt/{income_id}/assign")
async def assign_dt(income_id: str, data: DTAssign, user: User = Depends(get_current_user)):
    """Accountant assigns selected payable items to a DT income entry.
    Moves the DT into 'dt_pending_cre_recv' so CRE can mark received amounts.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can assign DT")

    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Income not found")
    if inc.get("payment_mode") != "direct_transfer":
        raise HTTPException(status_code=400, detail="This income is not a Direct Transfer")

    if not data.selections:
        raise HTTPException(status_code=400, detail="Select at least one item")

    # Allow exceeding DT amount per business rule (chunk paid later)
    enriched = []
    for s in data.selections:
        if s.amount <= 0:
            continue
        item = {"kind": s.kind, "amount": float(s.amount), "received_amount": 0.0, "status": "pending"}
        if s.kind == "material":
            mr = await db.material_expenses.find_one({"expense_id": s.request_id}, {"_id": 0}) if s.request_id else None
            if not mr:
                raise HTTPException(status_code=404, detail=f"Material expense {s.request_id} not found")
            item.update({
                "request_id": s.request_id,
                "title": mr.get("material_name") or "Material",
                "vendor_name": mr.get("vendor_name") or mr.get("supplier_name"),
                "vendor_id": mr.get("vendor_id"),
                "project_id": mr.get("project_id"),
            })
        elif s.kind == "labour":
            lr = await db.labour_expenses.find_one(
                {"$or": [{"labour_expense_id": s.request_id}, {"expense_id": s.request_id}]}, {"_id": 0}
            ) if s.request_id else None
            if not lr:
                raise HTTPException(status_code=404, detail=f"Labour expense {s.request_id} not found")
            item.update({
                "request_id": s.request_id,
                "title": lr.get("labour_type") or lr.get("description") or "Labour",
                "contractor_name": lr.get("contractor_name"),
                "contractor_id": lr.get("contractor_id"),
                "project_id": lr.get("project_id"),
            })
        elif s.kind == "other_account":
            oa = await db.other_accounts.find_one({"account_id": s.other_account_id}, {"_id": 0}) if s.other_account_id else None
            if not oa:
                raise HTTPException(status_code=404, detail=f"Other account {s.other_account_id} not found")
            item.update({
                "other_account_id": s.other_account_id,
                "title": oa.get("name"),
                "category": oa.get("category"),
            })
        else:
            raise HTTPException(status_code=400, detail=f"Invalid kind: {s.kind}")
        enriched.append(item)

    now = datetime.now(timezone.utc).isoformat()
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_status": "pending_cre_recv",
            "dt_items": enriched,
            "dt_assigned_at": now,
            "dt_assigned_by": user.user_id,
            "dt_assigned_by_name": user.name,
            "updated_at": now,
        }}
    )
    return {"message": "Assigned", "dt_status": "pending_cre_recv", "items_count": len(enriched)}


@router.get("/dt/{income_id}")
async def get_dt_detail(income_id: str, user: User = Depends(get_current_user)):
    """Get DT income with linked items + bank details (auto-fetched per item)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT, UserRole.CRE, UserRole.SALES]:
        raise HTTPException(status_code=403, detail="Permission denied")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    if inc.get("payment_mode") != "direct_transfer":
        raise HTTPException(status_code=400, detail="Not a DT entry")
    items = inc.get("dt_items", []) or []
    # Enrich each item with bank details
    for it in items:
        if it.get("kind") == "material" and it.get("vendor_id"):
            v = await db.vendor_master.find_one({"vendor_id": it["vendor_id"]}, {"_id": 0})
            if v:
                it["bank"] = {
                    "name": v.get("name"),
                    "bank_name": v.get("bank_name"),
                    "branch": v.get("branch"),
                    "account_number": v.get("account_number"),
                    "ifsc_code": v.get("ifsc_code"),
                    "upi_id": v.get("upi_id"),
                }
        elif it.get("kind") == "labour" and it.get("contractor_id"):
            c = await db.contractors.find_one({"contractor_id": it["contractor_id"]}, {"_id": 0})
            if c:
                it["bank"] = {
                    "name": c.get("name"),
                    "bank_name": c.get("bank_name"),
                    "branch": c.get("branch"),
                    "account_number": c.get("account_number"),
                    "ifsc_code": c.get("ifsc_code"),
                    "upi_id": c.get("upi_id"),
                }
        elif it.get("kind") == "other_account" and it.get("other_account_id"):
            oa = await db.other_accounts.find_one({"account_id": it["other_account_id"]}, {"_id": 0})
            if oa:
                it["bank"] = {
                    "name": oa.get("name"),
                    "bank_name": oa.get("bank_name"),
                    "branch": oa.get("branch"),
                    "account_number": oa.get("account_number"),
                    "ifsc_code": oa.get("ifsc_code"),
                    "upi_id": oa.get("upi_id"),
                }
    return inc


class DTReceipt(BaseModel):
    receipts: List[Dict[str, Any]]  # [{index, received_amount}]


@router.post("/dt/{income_id}/receive")
async def cre_mark_dt_received(income_id: str, data: DTReceipt, user: User = Depends(get_current_user)):
    """CRE updates received amount per item & submits to Accountant for final approval."""
    if user.role not in [UserRole.CRE, UserRole.SALES, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE/Sales can mark received")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    items = inc.get("dt_items", []) or []
    if not items:
        raise HTTPException(status_code=400, detail="No items linked")
    for r in data.receipts:
        idx = int(r.get("index", -1))
        if 0 <= idx < len(items):
            items[idx]["received_amount"] = float(r.get("received_amount", 0) or 0)
            items[idx]["status"] = "received" if items[idx]["received_amount"] > 0 else "pending"
    now = datetime.now(timezone.utc).isoformat()
    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_items": items,
            "dt_status": "pending_accountant_review",
            "dt_received_submitted_at": now,
            "dt_received_submitted_by": user.user_id,
            "dt_received_submitted_by_name": user.name,
            "updated_at": now,
        }}
    )
    return {"message": "Submitted to Accountant for review"}


@router.post("/dt/{income_id}/approve")
async def accountant_approve_dt(income_id: str, user: User = Depends(get_current_user)):
    """Accountant final approval after CRE submits received amounts.
    Books an expense entry per linked item and marks the underlying request as paid.
    """
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can approve DT")
    inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
    if not inc:
        raise HTTPException(status_code=404, detail="Not found")
    if inc.get("dt_status") != "pending_accountant_review":
        raise HTTPException(status_code=400, detail=f"Cannot approve in current state: {inc.get('dt_status')}")

    now = datetime.now(timezone.utc).isoformat()
    items = inc.get("dt_items", []) or []
    expense_ids: List[str] = []

    for it in items:
        recv = float(it.get("received_amount", 0) or 0)
        if recv <= 0:
            continue
        kind = it.get("kind")
        # category mapping for Direct-Expense reporting
        cat = "material" if kind == "material" else "labour" if kind == "labour" else "other"
        expense_id = f"exp_{uuid.uuid4().hex[:12]}"
        cashbook_entry = {
            "expense_id": expense_id,
            "project_id": it.get("project_id") or inc.get("project_id"),
            "category": cat,
            "expense_type": cat,
            "description": it.get("title") or f"{kind} payment via DT",
            "amount": recv,
            "payment_method": "direct_transfer",
            "vendor_name": it.get("vendor_name") or it.get("contractor_name") or it.get("title"),
            "request_id": it.get("request_id"),
            "request_type": kind,
            "other_account_id": it.get("other_account_id"),
            "source": "dt",
            "dt_income_id": income_id,
            "recorded_by": user.user_id,
            "recorded_by_name": user.name,
            "status": "approved",
            "created_at": now,
            "approved_at": now,
            "approved_by": user.user_id,
        }
        await db.recorded_expenses.insert_one(cashbook_entry)
        expense_ids.append(expense_id)

        # Mark underlying material/labour request as paid (so it disappears from approvals)
        if kind == "material" and it.get("request_id"):
            await db.material_expenses.update_one(
                {"expense_id": it["request_id"]},
                {"$set": {
                    "status": "paid",
                    "paid_via": "direct_transfer",
                    "paid_via_dt_id": income_id,
                    "paid_via_expense_id": expense_id,
                    "paid_amount": recv,
                    "paid_by": user.user_id,
                    "paid_by_name": user.name,
                    "paid_at": now,
                    "updated_at": now,
                }}
            )
        elif kind == "labour" and it.get("request_id"):
            await db.labour_expenses.update_one(
                {"$or": [{"labour_expense_id": it["request_id"]}, {"expense_id": it["request_id"]}]},
                {"$set": {
                    "status": "paid",
                    "paid_via": "direct_transfer",
                    "paid_via_dt_id": income_id,
                    "paid_via_expense_id": expense_id,
                    "paid_amount": recv,
                    "paid_by": user.user_id,
                    "paid_by_name": user.name,
                    "paid_at": now,
                    "updated_at": now,
                }}
            )

    await db.income.update_one(
        {"income_id": income_id},
        {"$set": {
            "dt_status": "completed",
            "dt_completed_at": now,
            "dt_completed_by": user.user_id,
            "dt_completed_by_name": user.name,
            "dt_expense_ids": expense_ids,
            "status": "approved",
            "updated_at": now,
        }}
    )
    return {"message": "DT cycle completed", "expense_ids": expense_ids, "expenses_recorded": len(expense_ids)}

