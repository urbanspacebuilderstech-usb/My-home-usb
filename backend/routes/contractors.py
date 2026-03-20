"""
Contractor Management Routes
- Contractor CRUD with categories and labour types
- Work Orders with payment stages
- Labour Attendance (daily entry by site engineers)
- Material Inventory (opening/closing stock)
- Stage payment request flow
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query

from core.database import db
from core.deps import get_current_user, create_notification
from core.models import UserRole, User

router = APIRouter()


# ==================== MODELS ====================

class ContractorCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    contractor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
    payment_cycle: Optional[str] = None
    labour_types: List[dict] = []
    labour_rates: List[dict] = []
    categories: List[str] = []


class ContractorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    contractor_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None
    payment_cycle: Optional[str] = None
    labour_types: Optional[List[dict]] = None
    labour_rates: Optional[List[dict]] = None
    categories: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ==================== CONTRACTOR CATEGORIES ====================

@router.get("/contractor-categories")
async def get_contractor_categories(user: User = Depends(get_current_user)):
    cats = await db.contractor_categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return cats


@router.post("/contractor-categories")
async def create_contractor_category(data: dict, user: User = Depends(get_current_user)):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name required")
    existing = await db.contractor_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = {
        "category_id": f"ccat_{uuid.uuid4().hex[:8]}",
        "name": name,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.contractor_categories.insert_one(cat)
    cat.pop("_id", None)
    return cat


# ==================== CONTRACTOR CRUD ====================

@router.get("/contractors")
async def get_contractors(
    category: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = {}
    if category:
        query["contractor_type"] = category
    contractors = await db.contractors.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return contractors


@router.post("/contractors")
async def create_contractor(data: ContractorCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    contractor = {
        "contractor_id": f"cont_{uuid.uuid4().hex[:8]}",
        **data.model_dump(),
        "is_active": True,
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.contractors.insert_one(contractor)
    contractor.pop("_id", None)
    return contractor


@router.get("/contractors/{contractor_id}")
async def get_contractor(contractor_id: str, user: User = Depends(get_current_user)):
    contractor = await db.contractors.find_one({"contractor_id": contractor_id}, {"_id": 0})
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return contractor


@router.patch("/contractors/{contractor_id}")
async def update_contractor(contractor_id: str, data: ContractorUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.contractors.update_one({"contractor_id": contractor_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return await db.contractors.find_one({"contractor_id": contractor_id}, {"_id": 0})


@router.delete("/contractors/{contractor_id}")
async def delete_contractor(contractor_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    await db.contractors.update_one(
        {"contractor_id": contractor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Contractor deactivated"}


# ==================== CONTRACTOR SUMMARY ====================

@router.get("/contractors/{contractor_id}/summary")
async def get_contractor_summary(contractor_id: str, user: User = Depends(get_current_user)):
    contractor = await db.contractors.find_one({"contractor_id": contractor_id}, {"_id": 0})
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    work_orders = await db.labour_work_orders.find(
        {"contractor_id": contractor_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    attendance = await db.labour_attendance.find(
        {"contractor_id": contractor_id}, {"_id": 0}
    ).sort("date", -1).to_list(100)

    total_work_value = sum(wo.get("total_amount", 0) for wo in work_orders)
    total_paid = sum(wo.get("paid_amount", 0) for wo in work_orders)
    total_attendance_cost = sum(a.get("total_cost", 0) for a in attendance)
    project_ids = list(set(wo.get("project_id") for wo in work_orders if wo.get("project_id")))

    return {
        "contractor": contractor,
        "work_orders": work_orders,
        "recent_attendance": attendance[:20],
        "stats": {
            "total_work_orders": len(work_orders),
            "total_work_value": total_work_value,
            "total_paid": total_paid,
            "pending_payment": total_work_value - total_paid,
            "total_attendance_cost": total_attendance_cost,
            "project_count": len(project_ids)
        }
    }


# ==================== WORK ORDERS ====================

@router.get("/labour-work-orders")
async def get_labour_work_orders(
    project_id: Optional[str] = None,
    contractor_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = {}
    if project_id:
        query["project_id"] = project_id
    if contractor_id:
        query["contractor_id"] = contractor_id
    orders = await db.labour_work_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Site engineer sees all stages (greyed out if completed/approved)
    return orders


@router.post("/labour-work-orders")
async def create_labour_work_order(data: dict, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")

    now = datetime.now(timezone.utc).isoformat()
    stages = []
    for i, s in enumerate(data.get("payment_stages", [])):
        stages.append({
            "stage_id": f"wos_{uuid.uuid4().hex[:6]}",
            "stage_name": s.get("stage_name", f"Stage {i+1}"),
            "amount": s.get("amount", 0),
            "percentage": s.get("percentage", 0),
            "daily_rate": s.get("daily_rate", 0),
            "start_date": s.get("start_date", ""),
            "end_date": s.get("end_date", ""),
            "status": "pending",
            "total_spend": 0,
            "total_attendance_days": 0,
            "requested_at": None,
            "approved_at": None,
            "notes": ""
        })

    wo = {
        "work_order_id": f"wo_{uuid.uuid4().hex[:8]}",
        "project_id": data.get("project_id"),
        "project_name": data.get("project_name", ""),
        "contractor_id": data.get("contractor_id"),
        "contractor_name": data.get("contractor_name", ""),
        "contractor_type": data.get("contractor_type", ""),
        "description": data.get("description", ""),
        "total_amount": data.get("total_amount", 0),
        "paid_amount": 0,
        "status": "active",
        "payment_stages": stages,
        "created_by": user.user_id,
        "created_at": now,
        "updated_at": now
    }
    await db.labour_work_orders.insert_one(wo)
    wo.pop("_id", None)
    return wo


@router.patch("/labour-work-orders/{wo_id}")
async def update_labour_work_order(wo_id: str, data: dict, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ["description", "total_amount", "status", "payment_stages"]:
        if field in data:
            update[field] = data[field]
    await db.labour_work_orders.update_one({"work_order_id": wo_id}, {"$set": update})
    return await db.labour_work_orders.find_one({"work_order_id": wo_id}, {"_id": 0})


# ==================== STAGE PAYMENT REQUESTS ====================

@router.patch("/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment")
async def request_stage_payment(wo_id: str, stage_id: str, data: dict, user: User = Depends(get_current_user)):
    """Site Engineer requests payment for a completed stage"""
    wo = await db.labour_work_orders.find_one({"work_order_id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    now = datetime.now(timezone.utc).isoformat()
    updated = False
    for stage in wo.get("payment_stages", []):
        if stage["stage_id"] == stage_id:
            if stage["status"] != "pending":
                raise HTTPException(status_code=400, detail="Stage already requested or processed")
            stage["status"] = "requested"
            stage["requested_at"] = now
            stage["requested_amount"] = data.get("requested_amount", stage["amount"])
            stage["requested_by"] = user.user_id
            stage["notes"] = data.get("notes", "")
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Stage not found")

    await db.labour_work_orders.update_one(
        {"work_order_id": wo_id},
        {"$set": {"payment_stages": wo["payment_stages"], "updated_at": now}}
    )
    return {"message": "Payment requested"}


@router.patch("/labour-work-orders/{wo_id}/stages/{stage_id}/review")
async def review_stage_payment(wo_id: str, stage_id: str, data: dict, user: User = Depends(get_current_user)):
    """Multi-step approval: Procurement approves → Planning approves → Accountant releases payment"""
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROCUREMENT, UserRole.ACCOUNTANT]
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Permission denied")

    wo = await db.labour_work_orders.find_one({"work_order_id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    now = datetime.now(timezone.utc).isoformat()
    action = data.get("action")  # approve, reject
    for stage in wo.get("payment_stages", []):
        if stage["stage_id"] == stage_id:
            current_status = stage["status"]

            if action == "reject":
                stage["status"] = "pending"
                stage["requested_at"] = None
                stage["procurement_approved_at"] = None
                stage["planning_approved_at"] = None
                stage["review_notes"] = data.get("notes", f"Rejected by {user.role}")
                stage["rejected_by"] = user.user_id
                stage["rejected_at"] = now
                break

            if action == "approve":
                if user.role == UserRole.PROCUREMENT and current_status == "requested":
                    stage["status"] = "procurement_approved"
                    stage["procurement_approved_by"] = user.user_id
                    stage["procurement_approved_at"] = now
                    stage["review_notes"] = data.get("notes", "")
                elif user.role == UserRole.PLANNING and current_status in ["requested", "procurement_approved"]:
                    stage["status"] = "planning_approved"
                    stage["planning_approved_by"] = user.user_id
                    stage["planning_approved_at"] = now
                    stage["review_notes"] = data.get("notes", "")
                elif user.role == UserRole.ACCOUNTANT and current_status == "planning_approved":
                    approved_amount = data.get("approved_amount", stage.get("requested_amount", stage["amount"]))
                    stage["status"] = "approved"
                    stage["approved_amount"] = approved_amount
                    stage["approved_by"] = user.user_id
                    stage["approved_at"] = now
                    stage["review_notes"] = data.get("notes", "")
                    wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                elif user.role == UserRole.SUPER_ADMIN:
                    # Super admin can approve at any step
                    approved_amount = data.get("approved_amount", stage.get("requested_amount", stage["amount"]))
                    stage["status"] = "approved"
                    stage["approved_amount"] = approved_amount
                    stage["approved_by"] = user.user_id
                    stage["approved_at"] = now
                    wo["paid_amount"] = wo.get("paid_amount", 0) + approved_amount
                else:
                    raise HTTPException(status_code=400, detail=f"Cannot approve stage in '{current_status}' status with role '{user.role}'")
            break

    await db.labour_work_orders.update_one(
        {"work_order_id": wo_id},
        {"$set": {
            "payment_stages": wo["payment_stages"],
            "paid_amount": wo.get("paid_amount", 0),
            "updated_at": now
        }}
    )
    return {"message": f"Stage {action}d successfully"}


# ==================== LABOUR ATTENDANCE ====================

@router.get("/labour-attendance")
async def get_labour_attendance(
    project_id: Optional[str] = None,
    contractor_id: Optional[str] = None,
    work_order_id: Optional[str] = None,
    stage_id: Optional[str] = None,
    date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = {}
    if project_id:
        query["project_id"] = project_id
    if contractor_id:
        query["contractor_id"] = contractor_id
    if work_order_id:
        query["work_order_id"] = work_order_id
    if stage_id:
        query["stage_id"] = stage_id
    if date:
        query["date"] = date
    entries = await db.labour_attendance.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return entries


@router.post("/labour-attendance")
async def create_labour_attendance(data: dict, user: User = Depends(get_current_user)):
    """Site Engineer creates daily labour attendance entry for a specific stage"""
    now = datetime.now(timezone.utc).isoformat()
    entries = data.get("entries", [])
    total_workers = sum(e.get("count", 0) for e in entries)
    total_cost = sum(e.get("count", 0) * e.get("per_day_cost", 0) for e in entries)

    # Enrich entries with total
    for e in entries:
        e["total"] = e.get("count", 0) * e.get("per_day_cost", 0)

    work_order_id = data.get("work_order_id", "")
    stage_id = data.get("stage_id", "")

    # Check for duplicate attendance on same date for same stage
    if work_order_id and stage_id and data.get("date"):
        existing = await db.labour_attendance.find_one({
            "work_order_id": work_order_id,
            "stage_id": stage_id,
            "date": data["date"]
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Attendance already recorded for {data['date']} on this stage")

    attendance = {
        "attendance_id": f"att_{uuid.uuid4().hex[:8]}",
        "project_id": data.get("project_id"),
        "contractor_id": data.get("contractor_id", ""),
        "contractor_name": data.get("contractor_name", ""),
        "work_order_id": work_order_id,
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "stage_id": stage_id,
        "entries": entries,
        "total_workers": total_workers,
        "total_cost": total_cost,
        "notes": data.get("notes", ""),
        "created_by": user.user_id,
        "created_at": now
    }
    await db.labour_attendance.insert_one(attendance)
    attendance.pop("_id", None)

    # Update stage total_spend and total_attendance_days on the work order
    if work_order_id and stage_id:
        wo = await db.labour_work_orders.find_one({"work_order_id": work_order_id})
        if wo:
            for stage in wo.get("payment_stages", []):
                if stage["stage_id"] == stage_id:
                    stage["total_spend"] = stage.get("total_spend", 0) + total_cost
                    stage["total_attendance_days"] = stage.get("total_attendance_days", 0) + 1
                    break
            await db.labour_work_orders.update_one(
                {"work_order_id": work_order_id},
                {"$set": {"payment_stages": wo["payment_stages"], "updated_at": now}}
            )

    return attendance


@router.get("/labour-attendance/daily-summary")
async def get_daily_summary(
    project_id: str,
    date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get total labour count per project for a given day"""
    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entries = await db.labour_attendance.find(
        {"project_id": project_id, "date": target_date}, {"_id": 0}
    ).to_list(500)

    total_workers = sum(e.get("total_workers", 0) for e in entries)
    total_cost = sum(e.get("total_cost", 0) for e in entries)
    by_contractor = {}
    for e in entries:
        cname = e.get("contractor_name", "Unknown")
        if cname not in by_contractor:
            by_contractor[cname] = {"workers": 0, "cost": 0}
        by_contractor[cname]["workers"] += e.get("total_workers", 0)
        by_contractor[cname]["cost"] += e.get("total_cost", 0)

    return {
        "date": target_date,
        "total_workers": total_workers,
        "total_cost": total_cost,
        "by_contractor": by_contractor,
        "entries": entries
    }


# ==================== MATERIAL INVENTORY ====================

@router.get("/material-inventory")
async def get_material_inventory(
    project_id: str,
    material_name: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    query = {"project_id": project_id}
    if material_name:
        query["material_name"] = material_name
    entries = await db.material_inventory.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return entries


@router.post("/material-inventory")
async def create_inventory_entry(data: dict, user: User = Depends(get_current_user)):
    """Site Engineer enters daily opening/closing stock"""
    now = datetime.now(timezone.utc).isoformat()
    opening = data.get("opening_stock", 0)
    received = data.get("received", 0)
    used = data.get("used", 0)
    closing = opening + received - used

    entry = {
        "inventory_id": f"inv_{uuid.uuid4().hex[:8]}",
        "project_id": data.get("project_id"),
        "material_request_id": data.get("material_request_id"),
        "material_name": data.get("material_name"),
        "unit": data.get("unit", ""),
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "opening_stock": opening,
        "received": received,
        "used": used,
        "closing_stock": closing,
        "notes": data.get("notes", ""),
        "created_by": user.user_id,
        "created_at": now
    }
    await db.material_inventory.insert_one(entry)
    entry.pop("_id", None)
    return entry


@router.get("/material-inventory/latest")
async def get_latest_inventory(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get latest stock for each material in a project"""
    pipeline = [
        {"$match": {"project_id": project_id}},
        {"$sort": {"date": -1, "created_at": -1}},
        {"$group": {
            "_id": "$material_name",
            "latest": {"$first": "$$ROOT"}
        }},
        {"$replaceRoot": {"newRoot": "$latest"}},
        {"$project": {"_id": 0}}
    ]
    results = await db.material_inventory.aggregate(pipeline).to_list(500)
    return results


# ==================== PROJECT CONTRACTOR ASSIGNMENTS ====================

@router.get("/projects/{project_id}/contractor-assignments")
async def get_project_contractors(project_id: str, user: User = Depends(get_current_user)):
    """Get all contractors assigned to a project via work orders"""
    work_orders = await db.labour_work_orders.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Return all stages - frontend handles active/completed display
    return work_orders


@router.get("/projects/{project_id}/assigned-contractors")
async def get_assigned_contractors_for_project(project_id: str, user: User = Depends(get_current_user)):
    """Get contractors assigned to a project with their details, labour rates, and work orders."""
    work_orders = await db.labour_work_orders.find(
        {"project_id": project_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Group by contractor
    contractor_map = {}
    for wo in work_orders:
        cid = wo.get("contractor_id", "")
        if cid not in contractor_map:
            contractor_map[cid] = {
                "contractor_id": cid,
                "contractor_name": wo.get("contractor_name", ""),
                "contractor_type": wo.get("contractor_type", ""),
                "labour_rates": [],
                "work_orders": []
            }
        contractor_map[cid]["work_orders"].append(wo)

    # Enrich with contractor details (labour_rates)
    for cid, data in contractor_map.items():
        contractor = await db.contractors.find_one({"contractor_id": cid}, {"_id": 0})
        if contractor:
            data["labour_rates"] = contractor.get("labour_rates", []) or contractor.get("labour_types", [])
            data["contractor_name"] = contractor.get("name", data["contractor_name"])
            data["contractor_type"] = contractor.get("contractor_type", data["contractor_type"])
            data["phone"] = contractor.get("phone", "")

    return list(contractor_map.values())
