from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import resend
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from enum import Enum
import uuid
from datetime import datetime, timezone, timedelta
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# GridFS for file storage (using motor's GridFS)
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
fs = AsyncIOMotorGridFSBucket(db)

resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ACCOUNTANT = "accountant"
    PROJECT_MANAGER = "project_manager"
    PLANNING = "planning"
    PROCUREMENT = "procurement"
    SITE_ENGINEER = "site_engineer"
    VENDOR = "vendor"
    CLIENT = "client"


class ProjectStatus(str, Enum):
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"


class WorkOrderStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    REPROPOSAL = "reproposal"
    CLOSED = "closed"


class BOQCategory(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"


class User(BaseModel):
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    role: UserRole
    phone: Optional[str] = None
    created_at: datetime


class UserSession(BaseModel):
    session_id: str = Field(default_factory=lambda: f"session_{uuid.uuid4().hex}")
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime


class Project(BaseModel):
    project_id: str = Field(default_factory=lambda: f"proj_{uuid.uuid4().hex[:12]}")
    name: str
    client_name: str
    client_user_id: Optional[str] = None
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_value: float
    start_date: datetime
    expected_completion: datetime
    status: ProjectStatus = ProjectStatus.PLANNING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BOQItem(BaseModel):
    boq_id: str = Field(default_factory=lambda: f"boq_{uuid.uuid4().hex[:12]}")
    project_id: str
    item_name: str
    category: BOQCategory
    unit: str
    quantity: float
    unit_rate: float
    total_cost: float
    locked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrder(BaseModel):
    work_order_id: str = Field(default_factory=lambda: f"wo_{uuid.uuid4().hex[:12]}")
    project_id: str
    boq_id: str
    created_by_user_id: str
    requested_quantity: float
    estimated_cost: float
    purpose: str
    status: WorkOrderStatus = WorkOrderStatus.DRAFT
    rejection_reason: Optional[str] = None
    approved_by_user_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Vendor(BaseModel):
    vendor_id: str = Field(default_factory=lambda: f"vendor_{uuid.uuid4().hex[:12]}")
    name: str
    contact_person: str
    phone: str
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    user_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PurchaseOrder(BaseModel):
    po_id: str = Field(default_factory=lambda: f"po_{uuid.uuid4().hex[:12]}")
    work_order_id: str
    vendor_id: str
    item_name: str
    quantity: float
    expected_delivery: datetime
    vehicle_number: Optional[str] = None
    dispatch_date: Optional[datetime] = None
    status: str = "pending"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SiteReceipt(BaseModel):
    receipt_id: str = Field(default_factory=lambda: f"receipt_{uuid.uuid4().hex[:12]}")
    work_order_id: str
    po_id: str
    site_engineer_user_id: str
    quantity_received: float
    latitude: float
    longitude: float
    captured_at: datetime
    lorry_image_id: Optional[str] = None
    material_image_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Expense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"exp_{uuid.uuid4().hex[:12]}")
    project_id: str
    category: str
    amount: float
    description: str
    work_order_id: Optional[str] = None
    vendor_id: Optional[str] = None
    created_by_user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Payment(BaseModel):
    payment_id: str = Field(default_factory=lambda: f"pay_{uuid.uuid4().hex[:12]}")
    project_id: str
    amount: float
    payment_date: datetime
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SiteStage(BaseModel):
    stage_id: str = Field(default_factory=lambda: f"stage_{uuid.uuid4().hex[:12]}")
    project_id: str
    name: str
    status: str = "pending"
    start_date: Optional[datetime] = None
    completion_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Notification(BaseModel):
    notification_id: str = Field(default_factory=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: str
    title: str
    message: str
    link: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(BaseModel):
    log_id: str = Field(default_factory=lambda: f"log_{uuid.uuid4().hex[:12]}")
    user_id: str
    action: str
    entity_type: str
    entity_id: str
    changes: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def get_current_user(request: Request) -> User:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return User(**user_doc)


async def send_notification_email(to_email: str, subject: str, html_content: str):
    if not resend.api_key:
        logger.warning("Resend API key not configured, skipping email")
        return
    
    params = {
        "from": SENDER_EMAIL,
        "to": [to_email],
        "subject": subject,
        "html": html_content
    }
    
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")


@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session ID")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch session data: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid session")
    
    email = data["email"]
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user_doc:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = User(
            user_id=user_id,
            email=email,
            name=data.get("name", ""),
            picture=data.get("picture"),
            role=UserRole.CLIENT,
            created_at=datetime.now(timezone.utc)
        )
        user_dict = new_user.model_dump()
        user_dict["created_at"] = user_dict["created_at"].isoformat()
        await db.users.insert_one(user_dict)
        user_doc = user_dict
    else:
        if isinstance(user_doc.get("created_at"), str):
            user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session = UserSession(
        user_id=user_doc["user_id"],
        session_token=session_token,
        expires_at=expires_at,
        created_at=datetime.now(timezone.utc)
    )
    
    session_dict = session.model_dump()
    session_dict["expires_at"] = session_dict["expires_at"].isoformat()
    session_dict["created_at"] = session_dict["created_at"].isoformat()
    await db.user_sessions.insert_one(session_dict)
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )
    
    return User(**user_doc)


@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/projects")
async def get_projects(user: User = Depends(get_current_user)):
    if user.role == UserRole.CLIENT:
        projects = await db.projects.find({"client_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    else:
        projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
    for proj in projects:
        if isinstance(proj.get("start_date"), str):
            proj["start_date"] = datetime.fromisoformat(proj["start_date"])
        if isinstance(proj.get("expected_completion"), str):
            proj["expected_completion"] = datetime.fromisoformat(proj["expected_completion"])
        if isinstance(proj.get("created_at"), str):
            proj["created_at"] = datetime.fromisoformat(proj["created_at"])
    
    return projects


@api_router.post("/projects")
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


@api_router.get("/projects/{project_id}")
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


@api_router.get("/boq/{project_id}")
async def get_boq(project_id: str, user: User = Depends(get_current_user)):
    boq_items = await db.boq_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for item in boq_items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    return boq_items


@api_router.post("/boq")
async def create_boq_item(boq_item: BOQItem, user: User = Depends(get_current_user)):
    if user.role != UserRole.PLANNING:
        raise HTTPException(status_code=403, detail="Only Planning Department can create BOQ")
    
    boq_dict = boq_item.model_dump()
    boq_dict["created_at"] = boq_dict["created_at"].isoformat()
    await db.boq_items.insert_one(boq_dict)
    
    await create_audit_log(user.user_id, "create", "boq", boq_item.boq_id, {"item_name": boq_item.item_name})
    return boq_item


@api_router.get("/work-orders")
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


@api_router.post("/work-orders")
async def create_work_order(work_order: WorkOrder, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.PROJECT_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    boq_item = await db.boq_items.find_one({"boq_id": work_order.boq_id}, {"_id": 0})
    if not boq_item:
        raise HTTPException(status_code=404, detail="BOQ item not found")
    
    work_order.created_by_user_id = user.user_id
    wo_dict = work_order.model_dump()
    wo_dict["created_at"] = wo_dict["created_at"].isoformat()
    
    await db.work_orders.insert_one(wo_dict)
    await create_audit_log(user.user_id, "create", "work_order", work_order.work_order_id, {"status": work_order.status})
    
    return work_order


@api_router.patch("/work-orders/{work_order_id}/submit")
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


@api_router.patch("/work-orders/{work_order_id}/approve")
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


@api_router.patch("/work-orders/{work_order_id}/reject")
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


@api_router.get("/vendors")
async def get_vendors(user: User = Depends(get_current_user)):
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(1000)
    for v in vendors:
        if isinstance(v.get("created_at"), str):
            v["created_at"] = datetime.fromisoformat(v["created_at"])
    return vendors


@api_router.post("/vendors")
async def create_vendor(vendor: Vendor, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    vendor_dict = vendor.model_dump()
    vendor_dict["created_at"] = vendor_dict["created_at"].isoformat()
    await db.vendors.insert_one(vendor_dict)
    
    await create_audit_log(user.user_id, "create", "vendor", vendor.vendor_id, {"name": vendor.name})
    return vendor


@api_router.get("/purchase-orders")
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


@api_router.post("/purchase-orders")
async def create_purchase_order(po: PurchaseOrder, user: User = Depends(get_current_user)):
    if user.role != UserRole.PROCUREMENT:
        raise HTTPException(status_code=403, detail="Only Procurement can create PO")
    
    po_dict = po.model_dump()
    po_dict["expected_delivery"] = po_dict["expected_delivery"].isoformat()
    po_dict["created_at"] = po_dict["created_at"].isoformat()
    
    await db.purchase_orders.insert_one(po_dict)
    await create_audit_log(user.user_id, "create", "purchase_order", po.po_id, {"vendor_id": po.vendor_id})
    
    return po


@api_router.post("/site-receipts/upload-image")
async def upload_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineer can upload")
    
    contents = await file.read()
    file_id = fs.upload_from_stream(
        file.filename,
        io.BytesIO(contents),
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    return {"file_id": str(file_id)}


@api_router.get("/site-receipts/image/{file_id}")
async def get_image(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = fs.open_download_stream(ObjectId(file_id))
        return StreamingResponse(grid_out, media_type=grid_out.metadata.get("contentType", "image/jpeg"))
    except Exception as e:
        raise HTTPException(status_code=404, detail="Image not found")


@api_router.post("/site-receipts")
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


@api_router.get("/expenses")
async def get_expenses(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
    query = {}
    if project_id:
        query["project_id"] = project_id
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    for exp in expenses:
        if isinstance(exp.get("created_at"), str):
            exp["created_at"] = datetime.fromisoformat(exp["created_at"])
    return expenses


@api_router.post("/expenses")
async def create_expense(expense: Expense, user: User = Depends(get_current_user)):
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can create manual expense")
    
    expense.created_by_user_id = user.user_id
    expense_dict = expense.model_dump()
    expense_dict["created_at"] = expense_dict["created_at"].isoformat()
    await db.expenses.insert_one(expense_dict)
    
    await create_audit_log(user.user_id, "create", "expense", expense.expense_id, {"amount": expense.amount})
    return expense


@api_router.get("/dashboards/super-admin")
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


@api_router.get("/dashboards/project/{project_id}")
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


@api_router.get("/client-portal/project/{project_id}")
async def get_client_portal_data(project_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.CLIENT:
        raise HTTPException(status_code=403, detail="Client access only")
    
    project = await db.projects.find_one({"project_id": project_id, "client_user_id": user.user_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    payments = await db.payments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    stages = await db.site_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    
    return {
        "project": project,
        "total_paid": total_paid,
        "balance": project.get("total_value", 0) - total_paid,
        "stages": stages,
        "photos": photos
    }


@api_router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for n in notifs:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"])
    return notifs


@api_router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Notification marked as read"}


@api_router.post("/users")
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


@api_router.get("/users")
async def get_users(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for u in users:
        if isinstance(u.get("created_at"), str):
            u["created_at"] = datetime.fromisoformat(u["created_at"])
    return users


@api_router.patch("/users/{user_id}/role")
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
    await db.audit_logs.insert_one(log_dict)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
