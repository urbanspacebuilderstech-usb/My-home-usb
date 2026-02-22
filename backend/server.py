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
    GENERAL_MANAGER = "general_manager"
    CRE = "cre"  # Client Relationship Officer
    ACCOUNTANT = "accountant"
    PROJECT_MANAGER = "project_manager"
    PLANNING = "planning"
    PROCUREMENT = "procurement"
    SITE_ENGINEER = "site_engineer"
    VENDOR = "vendor"
    CLIENT = "client"
    PRE_SALES = "pre_sales"  # CRM Pre-Sales
    SALES = "sales"  # CRM Sales


class ProjectStatus(str, Enum):
    DRAFT = "draft"  # CRE created, not yet submitted
    PENDING_PAYMENT = "pending_payment"  # CRE submitted, waiting Accountant verification
    PAYMENT_VERIFIED = "payment_verified"  # Accountant verified payment, CRE can submit to Planning
    PLANNING_REVIEW = "planning_review"  # Submitted to Planning
    AWAITING_APPROVAL = "awaiting_approval"  # Planning submitted for GM/Admin approval
    GM_APPROVED = "gm_approved"  # GM approved, waiting Super Admin
    PLANNING_APPROVED = "planning_approved"  # Fully approved, ready for execution
    ACTIVE = "active"  # In execution
    COMPLETED = "completed"
    DOCUMENTATION = "documentation"
    SUB_STRUCTURE = "sub_structure"
    SUPER_STRUCTURE = "super_structure"
    FINISHING = "finishing"
    HANDOVER = "handover"


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


# ==================== EXPENSE MODULE ENUMS ====================

class ExpenseType(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"
    VENDOR_SERVICE = "vendor_service"


class ExpenseStatus(str, Enum):
    REQUESTED = "requested"  # Site Engineer created
    PLANNING_APPROVED = "planning_approved"  # Planning approved
    PLANNING_REJECTED = "planning_rejected"  # Planning rejected
    PROCUREMENT_PRICED = "procurement_priced"  # Procurement added pricing
    ACCOUNTS_APPROVED = "accounts_approved"  # Accounts approved
    ACCOUNTS_REJECTED = "accounts_rejected"  # Accounts rejected
    SUPER_ADMIN_APPROVED = "super_admin_approved"  # Final approval
    COMPLETED = "completed"  # Payment done
    CANCELLED = "cancelled"


class PaymentType(str, Enum):
    CREDIT = "credit"  # No payment now, mark as payable
    ADVANCE = "advance"  # Partial payment
    FULL = "full"  # Full settlement


class PaymentStatus(str, Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    CREDIT = "credit"


# ==================== COMPANY & PROFILE MODELS ====================

class CompanySettings(BaseModel):
    settings_id: str = Field(default_factory=lambda: f"company_{uuid.uuid4().hex[:12]}")
    company_name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    default_currency: str = "INR"
    financial_year_start: str = "April"  # Month name
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserProfile(BaseModel):
    user_id: str
    department: Optional[str] = None
    profile_photo_url: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    date_of_joining: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== PERMISSION MODELS ====================

class Permission(BaseModel):
    permission_id: str
    name: str
    description: str
    module: str  # expense, material, user, project, etc.


class RolePermission(BaseModel):
    role: UserRole
    permissions: List[str]  # List of permission_ids


# ==================== PACKAGE SYSTEM MODELS ====================

class PackageScopeItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"psi_{uuid.uuid4().hex[:8]}")
    name: str
    description: Optional[str] = None
    quantity: float = 1
    unit: str = "nos"
    unit_rate: float = 0
    total: float = 0  # quantity * unit_rate


class PackageMaterialItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"pmi_{uuid.uuid4().hex[:8]}")
    material_id: Optional[str] = None  # Link to material master
    name: str
    brand: Optional[str] = None  # Brand name for this package tier
    specification: Optional[str] = None  # e.g., "Grade 43", "ISI Certified"
    quantity: float = 1
    unit: str = "nos"
    estimated_rate: float = 0


class PackageLabourItem(BaseModel):
    item_id: str = Field(default_factory=lambda: f"pli_{uuid.uuid4().hex[:8]}")
    work_type: str  # masonry, plumbing, electrical, etc.
    description: Optional[str] = None
    estimated_days: float = 0
    daily_rate: float = 0
    workers_count: int = 1


class Package(BaseModel):
    package_id: str = Field(default_factory=lambda: f"pkg_{uuid.uuid4().hex[:8]}")
    name: str  # Package A, Package B, Package C
    code: str  # A, B, C
    description: Optional[str] = None
    building_types: List[str] = []  # residential, commercial, villa, apartment
    base_rate_per_sqft: float = 0  # Base rate for calculation
    scope_items: List[PackageScopeItem] = []
    material_items: List[PackageMaterialItem] = []
    labour_items: List[PackageLabourItem] = []
    is_active: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LabourContractor(BaseModel):
    contractor_id: str = Field(default_factory=lambda: f"lc_{uuid.uuid4().hex[:8]}")
    name: str
    work_types: List[str] = []  # masonry, plumbing, electrical, etc.
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    rate_structure: Dict = {}  # {work_type: daily_rate}
    is_active: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== WORK ORDER MODELS ====================

class WorkOrderType(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"


class WorkOrderStageStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PAYMENT_REQUESTED = "payment_requested"
    PAYMENT_APPROVED = "payment_approved"
    PAID = "paid"


class WorkOrderStage(BaseModel):
    stage_id: str = Field(default_factory=lambda: f"wos_{uuid.uuid4().hex[:8]}")
    stage_number: int
    stage_name: str
    description: Optional[str] = None
    amount: float = 0
    status: WorkOrderStageStatus = WorkOrderStageStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    payment_requested_at: Optional[datetime] = None
    payment_requested_by: Optional[str] = None
    payment_approved_at: Optional[datetime] = None
    payment_approved_by: Optional[str] = None
    paid_at: Optional[datetime] = None
    remarks: Optional[str] = None


class WorkOrderStatus(str, Enum):
    DRAFT = "draft"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrder(BaseModel):
    work_order_id: str = Field(default_factory=lambda: f"wo_{uuid.uuid4().hex[:12]}")
    work_order_number: str  # WO-001, WO-002
    project_id: str
    project_name: Optional[str] = None
    order_type: WorkOrderType
    
    # For Labour Work Orders
    work_type: Optional[str] = None  # plumbing, masonry, electrical
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    number_of_days: float = 0
    number_of_workers: int = 0
    daily_rate: float = 0
    total_amount: float = 0
    stages: List[WorkOrderStage] = []
    
    # For Material Work Orders
    material_id: Optional[str] = None
    material_name: Optional[str] = None
    brand: Optional[str] = None
    specification: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    quantity: float = 0
    unit: Optional[str] = None
    unit_price: float = 0
    
    # Assignment
    assigned_to: Optional[str] = None  # Site Engineer user_id
    assigned_to_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    
    # Status tracking
    status: WorkOrderStatus = WorkOrderStatus.DRAFT
    created_by: str
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    remarks: Optional[str] = None


# ==================== MATERIAL & VENDOR MODELS ====================

class MaterialCategory(str, Enum):
    CEMENT = "cement"
    SAND = "sand"
    STEEL = "steel"
    BRICKS = "bricks"
    AGGREGATE = "aggregate"
    TILES = "tiles"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    PAINT = "paint"
    WOOD = "wood"
    HARDWARE = "hardware"
    OTHER = "other"


class Material(BaseModel):
    material_id: str = Field(default_factory=lambda: f"mat_{uuid.uuid4().hex[:12]}")
    name: str
    category: MaterialCategory
    unit: str  # bag, ton, load, kg, nos, sqft, etc.
    description: Optional[str] = None
    hsn_code: Optional[str] = None  # For GST
    is_active: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorMaster(BaseModel):
    vendor_id: str = Field(default_factory=lambda: f"vend_{uuid.uuid4().hex[:12]}")
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    materials_supplied: List[str] = []  # List of material_ids
    payment_terms: str = "full"  # credit, advance, full
    credit_limit: float = 0
    credit_days: int = 0
    is_active: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorPrice(BaseModel):
    price_id: str = Field(default_factory=lambda: f"vp_{uuid.uuid4().hex[:12]}")
    vendor_id: str
    material_id: str
    unit_price: float
    min_quantity: float = 1
    effective_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    effective_to: Optional[datetime] = None
    is_current: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PriceHistory(BaseModel):
    history_id: str = Field(default_factory=lambda: f"ph_{uuid.uuid4().hex[:12]}")
    vendor_id: str
    material_id: str
    old_price: float
    new_price: float
    changed_by: str
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reason: Optional[str] = None


# ==================== ENHANCED USER MODEL ====================

class EnhancedUser(BaseModel):
    user_id: str = Field(default_factory=lambda: f"user_{uuid.uuid4().hex[:12]}")
    email: EmailStr
    name: str
    phone: Optional[str] = None
    role: UserRole
    department: Optional[str] = None
    password_hash: str
    profile_photo_url: Optional[str] = None
    is_active: bool = True
    permissions: List[str] = []  # Custom permissions beyond role defaults
    last_login: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


# Project Stages Enum
class ProjectStage(str, Enum):
    DRAWING = "drawing"
    YET_TO_START = "yet_to_start"
    FOUNDATION = "foundation"
    BASEMENT = "basement"
    BRICK_WORK = "brick_work"
    PLASTERING = "plastering"
    FINISHING = "finishing"
    HANDOVER = "handover"


# Payment Mode Enum
class PaymentMode(str, Enum):
    CASH = "cash"
    CHEQUE = "cheque"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CREDIT_CARD = "credit_card"


class Project(BaseModel):
    project_id: str = Field(default_factory=lambda: f"proj_{uuid.uuid4().hex[:12]}")
    project_code: Optional[str] = None  # Auto-generated: USB010226 format
    name: str
    client_name: str
    client_phone: Optional[str] = None
    client_email: Optional[str] = None
    client_user_id: Optional[str] = None
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # New CRE fields
    sqft: float = 0  # Square footage
    building_type: str = "residential"  # residential, commercial, villa, apartment
    package_id: Optional[str] = None  # Selected package
    package_name: Optional[str] = None  # Package name for display
    materials_locked: bool = False  # Once approved, material brands cannot be changed
    # Project Stage Tracking
    current_stage: str = "yet_to_start"  # Current project stage
    stage_history: List[dict] = []  # Track stage changes with dates
    # Advance Payment fields
    advance_date: Optional[str] = None  # Date advance was received
    advance_amount: float = 0  # Advance amount received
    advance_payment_mode: Optional[str] = None  # Payment mode for advance
    rough_estimate_url: Optional[str] = None  # PDF upload URL
    # Financial fields
    total_value: float = 0  # Project Total Value (calculated from package/scope)
    additional_cost: float = 0  # Additional Cost (INPUT)
    income_project: float = 0  # Income from Project (INPUT)
    income_additional: float = 0  # Additional Income (INPUT)
    total_expense: float = 0  # Total Expense (INPUT)
    # Payment Collection
    payments_to_collect: List[dict] = []  # List of pending payment collections
    start_date: datetime
    expected_completion: datetime
    status: ProjectStatus = ProjectStatus.DRAFT
    # Workflow tracking
    created_by: Optional[str] = None  # CRE user_id
    planning_modified_by: Optional[str] = None
    planning_submitted_at: Optional[datetime] = None
    gm_approved_by: Optional[str] = None
    gm_approved_at: Optional[datetime] = None
    admin_approved_by: Optional[str] = None
    admin_approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectMaterial(BaseModel):
    """Material specification for a project (copied from package, can be edited until locked)"""
    material_id: str = Field(default_factory=lambda: f"pm_{uuid.uuid4().hex[:12]}")
    project_id: str
    name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    quantity: float = 1
    unit: str = "nos"
    estimated_rate: float = 0
    from_package: bool = True  # Whether this came from the original package
    modified_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


class WorkOrderCreate(BaseModel):
    project_id: str
    boq_id: str
    requested_quantity: float
    purpose: str


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


class SitePhoto(BaseModel):
    photo_id: str = Field(default_factory=lambda: f"photo_{uuid.uuid4().hex[:12]}")
    project_id: str
    file_id: str
    caption: Optional[str] = None
    category: str = "progress"
    uploaded_by_user_id: str
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectDocument(BaseModel):
    document_id: str = Field(default_factory=lambda: f"doc_{uuid.uuid4().hex[:12]}")
    project_id: str
    file_id: str
    title: str
    category: str
    uploaded_by_user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkOrderAssignment(BaseModel):
    assignment_id: str = Field(default_factory=lambda: f"assign_{uuid.uuid4().hex[:12]}")
    work_order_id: str
    project_id: str
    assigned_to_user_id: str
    assigned_by_user_id: str
    assignment_date: datetime
    due_date: datetime
    priority: str = "medium"
    status: str = "assigned"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectCommitment(BaseModel):
    commitment_id: str = Field(default_factory=lambda: f"commit_{uuid.uuid4().hex[:12]}")
    project_id: str
    item_name: str
    quantity: float
    units: str
    unit_rate: float
    total_cost: float
    category: str
    committed_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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


# ==================== PAYMENT SCHEDULE MODELS ====================

class PaymentStage(BaseModel):
    stage_id: str = Field(default_factory=lambda: f"ps_{uuid.uuid4().hex[:12]}")
    project_id: str
    stage_number: int = 1  # 1, 2, 2a, 2b, 2c, 3, 4, etc. (stored as order)
    stage_label: str = "1"  # Display label like "1", "2a", "2b"
    stage_name: str  # e.g., "Advance payment for project confirmation"
    percentage: float  # Percentage of project value
    amount: float  # Calculated or manual amount
    amount_received: float = 0  # Amount received for this stage
    status: str = "pending"  # pending, partial, paid
    workflow_status: str = "draft"  # draft, pending_collection, collected, verified, approved
    due_date: Optional[datetime] = None
    # Payment Collection Details
    payment_mode: Optional[str] = None  # cash, cheque, bank_transfer, upi
    payment_reference: Optional[str] = None  # Transaction ID / Cheque No
    payment_date: Optional[datetime] = None  # When payment was collected
    collected_by: Optional[str] = None  # CRE who collected
    collected_by_name: Optional[str] = None
    # Approval tracking
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Default Payment Schedule Template (based on user's image)
DEFAULT_PAYMENT_SCHEDULE = [
    {"stage_label": "1", "stage_name": "Advance payment for project confirmation", "percentage": 2, "remarks": "1st shot payment"},
    {"stage_label": "2", "stage_name": "Advance payment for Foundation, Plinth Beam and upto Basement", "percentage": 20, "remarks": ""},
    {"stage_label": "2a", "stage_name": "Advance payment for Underground water storage sump", "percentage": 0, "remarks": "2nd shot payment"},
    {"stage_label": "2b", "stage_name": "Advance payment for Underground Septic tank", "percentage": 0, "remarks": ""},
    {"stage_label": "2c", "stage_name": "Additional cost for car parking basement", "percentage": 0, "remarks": ""},
    {"stage_label": "3", "stage_name": "Advance payment for Super Structure - Ground Floor- Brick work and Slab casting", "percentage": 18, "remarks": "3rd shot payment"},
    {"stage_label": "4", "stage_name": "Advance payment for Super Structure - First Floor- Brick work and Slab casting", "percentage": 18, "remarks": "4th shot payment"},
    {"stage_label": "5", "stage_name": "Advance payment for Super Structure - Second Floor- Brick work and Slab casting", "percentage": 12, "remarks": "5th shot payment"},
    {"stage_label": "6", "stage_name": "Advance Payment for Plastering", "percentage": 9, "remarks": "6th shot payment"},
    {"stage_label": "7", "stage_name": "Advance Payment for Flooring Work", "percentage": 8, "remarks": "7th shot payment"},
    {"stage_label": "8", "stage_name": "Advance payment for Electrical, Plumbing, Doors, windows", "percentage": 7, "remarks": "8th shot payment"},
    {"stage_label": "9", "stage_name": "Advance payment for Painting, electrical commissioning", "percentage": 5, "remarks": "9th shot payment"},
    {"stage_label": "10", "stage_name": "Advance payment for Handover (75% Prehanding over and 25% Posthanding over)", "percentage": 1, "remarks": "10th shot payment"}
]


class AdditionalCostItem(BaseModel):
    cost_id: str = Field(default_factory=lambda: f"ac_{uuid.uuid4().hex[:12]}")
    project_id: str
    description: str  # e.g., "Extra flooring", "Additional electrical"
    estimated_amount: float
    actual_amount: float = 0
    income_received: float = 0
    status: str = "pending"  # pending, in_progress, completed
    workflow_status: str = "draft"  # draft, pending_verification, pending_approval, approved, rejected
    created_by: Optional[str] = None
    verified_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScopeItem(BaseModel):
    scope_id: str = Field(default_factory=lambda: f"scope_{uuid.uuid4().hex[:12]}")
    project_id: str
    item_name: str  # e.g., "Foundation Work", "Electrical", "Plumbing"
    quantity: float = 1
    unit: str = "Nos"
    unit_rate: float
    total_amount: float  # quantity * unit_rate
    remarks: Optional[str] = None
    workflow_status: str = "draft"  # draft, pending_verification, pending_approval, approved, rejected
    created_by: Optional[str] = None
    verified_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DeductionItem(BaseModel):
    deduction_id: str = Field(default_factory=lambda: f"ded_{uuid.uuid4().hex[:12]}")
    project_id: str
    description: str  # e.g., "Penalty", "Discount", "Adjustment"
    amount: float
    status: str = "pending"  # pending, approved, rejected
    workflow_status: str = "draft"  # draft, pending_verification, pending_approval, approved, rejected
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    verified_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaymentMode(str, Enum):
    CASH = "cash"
    CHEQUE = "cheque"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    PETTY_CASH = "petty_cash"


class IncomeEntry(BaseModel):
    income_id: str = Field(default_factory=lambda: f"inc_{uuid.uuid4().hex[:12]}")
    project_id: str
    amount: float
    payment_mode: PaymentMode
    payment_date: datetime
    cheque_number: Optional[str] = None  # For cheque payments
    bank_name: Optional[str] = None  # For cheque/bank transfer
    reference_number: Optional[str] = None  # Transaction reference
    remarks: Optional[str] = None
    recorded_by: str  # User who recorded
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== EXPENSE MODULE MODELS ====================

class VendorQuote(BaseModel):
    vendor_id: str
    vendor_name: str
    unit_price: float
    quantity: float
    total_price: float
    is_selected: bool = False


class ExpenseApproval(BaseModel):
    approved_by: str
    approved_by_name: str
    role: str
    action: str  # approved, rejected
    comments: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpensePayment(BaseModel):
    payment_id: str = Field(default_factory=lambda: f"epay_{uuid.uuid4().hex[:12]}")
    payment_type: PaymentType
    amount: float
    payment_date: datetime
    payment_mode: Optional[str] = None  # cash, cheque, bank_transfer, upi
    reference: Optional[str] = None
    recorded_by: str


class MaterialExpense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"mexp_{uuid.uuid4().hex[:12]}")
    expense_type: str = "material"
    project_id: str
    material_name: str
    material_type: Optional[str] = None
    quantity: float
    unit: str = "units"
    required_date: datetime
    remarks: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.REQUESTED
    requested_by: str  # Site Engineer user_id
    requested_by_name: str
    
    # Procurement pricing
    vendor_quotes: List[VendorQuote] = []
    selected_vendor_id: Optional[str] = None
    final_amount: float = 0
    
    # Payment tracking
    payment_type: Optional[PaymentType] = None
    payment_status: PaymentStatus = PaymentStatus.PENDING
    total_paid: float = 0
    balance: float = 0
    payments: List[ExpensePayment] = []
    
    # Approval history
    approvals: List[ExpenseApproval] = []
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LabourExpense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"lexp_{uuid.uuid4().hex[:12]}")
    expense_type: str = "labour"
    project_id: str
    labour_type: str  # e.g., Mason, Helper, Carpenter
    num_workers: int
    days_worked: float
    rate_per_day: float
    total_amount: float  # num_workers * days_worked * rate_per_day
    work_date: datetime
    remarks: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.REQUESTED
    requested_by: str
    requested_by_name: str
    
    # Payment tracking
    payment_type: Optional[PaymentType] = None
    payment_status: PaymentStatus = PaymentStatus.PENDING
    total_paid: float = 0
    balance: float = 0
    payments: List[ExpensePayment] = []
    
    # Approval history
    approvals: List[ExpenseApproval] = []
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorServiceExpense(BaseModel):
    expense_id: str = Field(default_factory=lambda: f"vexp_{uuid.uuid4().hex[:12]}")
    expense_type: str = "vendor_service"
    project_id: str
    vendor_name: str
    vendor_id: Optional[str] = None
    service_type: str
    amount: float
    invoice_number: Optional[str] = None
    invoice_url: Optional[str] = None
    remarks: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.REQUESTED
    requested_by: str
    requested_by_name: str
    
    # Payment tracking
    payment_type: Optional[PaymentType] = None
    payment_status: PaymentStatus = PaymentStatus.PENDING
    total_paid: float = 0
    balance: float = 0
    payments: List[ExpensePayment] = []
    
    # Approval history
    approvals: List[ExpenseApproval] = []
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== COMPREHENSIVE ACCOUNTANT BOARD MODELS ====================

class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    SALARY = "salary"
    VENDOR_PAYMENT = "vendor_payment"
    REFUND = "refund"
    TRANSFER = "transfer"


class PaymentMethodType(str, Enum):
    CASH = "cash"
    CHEQUE = "cheque"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CREDIT_CARD = "credit_card"


class ChequeStatus(str, Enum):
    ISSUED = "issued"
    DEPOSITED = "deposited"
    CLEARED = "cleared"
    BOUNCED = "bounced"
    CANCELLED = "cancelled"
    POST_DATED = "post_dated"


class PaymentRequestStatus(str, Enum):
    PENDING = "pending"
    OTP_SENT = "otp_sent"
    OTP_VERIFIED = "otp_verified"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class StaffStatus(str, Enum):
    ACTIVE = "active"
    ON_LEAVE = "on_leave"
    TERMINATED = "terminated"
    RESIGNED = "resigned"


class PayrollStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PAID = "paid"
    CANCELLED = "cancelled"


# ==================== FINANCIAL CONTROL MODELS ====================

class IndirectCostCategory(str, Enum):
    OFFICE_RENT = "office_rent"
    STAFF_SALARY = "staff_salary"
    UTILITIES = "utilities"
    INSURANCE = "insurance"
    MAINTENANCE = "maintenance"
    TRAVEL = "travel"
    COMMUNICATION = "communication"
    LEGAL_PROFESSIONAL = "legal_professional"
    BANK_CHARGES = "bank_charges"
    DEPRECIATION = "depreciation"
    OTHER = "other"


class IndirectCostStatus(str, Enum):
    PENDING = "pending"  # Created by Accountant, awaiting approval
    APPROVED = "approved"  # Approved by Super Admin/GM
    REJECTED = "rejected"  # Rejected by approver
    CONFIRMED = "confirmed"  # Payment confirmed/processed
    CANCELLED = "cancelled"  # Cancelled


class SuspenseEntryStatus(str, Enum):
    PENDING = "pending"  # Awaiting allocation
    ALLOCATED = "allocated"  # Allocated to proper account
    REJECTED = "rejected"  # Rejected/invalid


class FinancialAuditAction(str, Enum):
    CREATED = "created"
    VERIFIED = "verified"
    APPROVED = "approved"
    REJECTED = "rejected"
    CONFIRMED = "confirmed"
    MODIFIED = "modified"
    CANCELLED = "cancelled"
    CHEQUE_CLEARED = "cheque_cleared"
    CHEQUE_RETURNED = "cheque_returned"


# Indirect Cost (Overheads) - Accountant can create, requires approval
class IndirectCost(BaseModel):
    indirect_cost_id: str = Field(default_factory=lambda: f"ic_{uuid.uuid4().hex[:12]}")
    category: IndirectCostCategory
    description: str
    amount: float
    payment_method: PaymentMethodType
    reference_number: Optional[str] = None
    vendor_name: Optional[str] = None  # Payee name
    invoice_number: Optional[str] = None
    invoice_date: Optional[datetime] = None
    payment_date: Optional[datetime] = None
    supporting_document: Optional[str] = None  # File URL
    remarks: Optional[str] = None
    # Workflow
    status: IndirectCostStatus = IndirectCostStatus.PENDING
    created_by: str
    created_by_name: Optional[str] = None
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    # Audit
    is_locked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Suspense Account Entry - For unclear transactions
class SuspenseEntry(BaseModel):
    suspense_id: str = Field(default_factory=lambda: f"sus_{uuid.uuid4().hex[:12]}")
    amount: float
    transaction_type: str  # income or expense
    description: str
    source: Optional[str] = None  # Where did this come from
    reference_number: Optional[str] = None
    payment_method: Optional[PaymentMethodType] = None
    remarks: Optional[str] = None
    # Allocation
    status: SuspenseEntryStatus = SuspenseEntryStatus.PENDING
    allocated_to: Optional[str] = None  # project_id or 'indirect_cost'
    allocation_category: Optional[str] = None
    allocation_reason: Optional[str] = None
    # Workflow
    created_by: str
    created_by_name: Optional[str] = None
    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    # Audit
    is_locked: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Financial Audit Log - Immutable record of all financial actions
class FinancialAuditLog(BaseModel):
    audit_id: str = Field(default_factory=lambda: f"fal_{uuid.uuid4().hex[:12]}")
    entity_type: str  # income, expense, indirect_cost, cheque, suspense
    entity_id: str  # ID of the affected record
    action: FinancialAuditAction
    old_value: Optional[dict] = None  # Previous state
    new_value: Optional[dict] = None  # New state
    amount: Optional[float] = None
    project_id: Optional[str] = None
    description: str
    performed_by: str
    performed_by_name: Optional[str] = None
    performed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None


# ==================== END FINANCIAL CONTROL MODELS ====================


# Unified Transaction Model
class Transaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: f"txn_{uuid.uuid4().hex[:12]}")
    transaction_type: TransactionType
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    amount: float
    payment_method: PaymentMethodType
    payment_date: datetime
    reference_number: Optional[str] = None  # Transaction ID / Cheque No / UPI Ref
    cheque_id: Optional[str] = None  # Link to cheque record if cheque payment
    party_name: Optional[str] = None  # Client/Vendor/Staff name
    party_type: Optional[str] = None  # client, vendor, staff, contractor
    description: Optional[str] = None
    category: Optional[str] = None  # material, labour, salary, advance, etc.
    recorded_by: str
    recorded_by_name: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    status: str = "completed"  # pending, completed, cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Cheque Management Model
class ChequeRecord(BaseModel):
    cheque_id: str = Field(default_factory=lambda: f"chq_{uuid.uuid4().hex[:12]}")
    cheque_number: str
    bank_name: str
    branch_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    amount: float
    cheque_date: datetime  # Date on cheque
    deposit_date: Optional[datetime] = None  # When deposited
    clearance_date: Optional[datetime] = None  # When cleared
    issue_date: Optional[datetime] = None  # When issued (for outgoing)
    cheque_type: str = "incoming"  # incoming (received), outgoing (issued)
    party_name: str  # Client/Vendor name
    party_type: str  # client, vendor
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    status: ChequeStatus = ChequeStatus.ISSUED
    bounce_reason: Optional[str] = None
    bounce_charges: float = 0
    remarks: Optional[str] = None
    is_post_dated: bool = False
    reminder_date: Optional[datetime] = None  # For post-dated cheques
    recorded_by: str
    recorded_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# HR Staff/Employee Model
class Staff(BaseModel):
    staff_id: str = Field(default_factory=lambda: f"staff_{uuid.uuid4().hex[:12]}")
    employee_code: Optional[str] = None  # Company employee code
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None  # accounts, engineering, hr, admin, etc.
    designation: Optional[str] = None  # Manager, Engineer, Accountant, etc.
    date_of_joining: Optional[datetime] = None
    date_of_birth: Optional[datetime] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    # Salary Details
    basic_salary: float = 0
    hra: float = 0  # House Rent Allowance
    da: float = 0  # Dearness Allowance
    ta: float = 0  # Travel Allowance
    other_allowances: float = 0
    gross_salary: float = 0  # Calculated: basic + all allowances
    # Deductions
    pf: float = 0  # Provident Fund
    esi: float = 0  # Employee State Insurance
    professional_tax: float = 0
    tds: float = 0  # Tax Deducted at Source
    other_deductions: float = 0
    total_deductions: float = 0
    net_salary: float = 0  # gross - deductions
    # Bank Details for Salary
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    payment_method: PaymentMethodType = PaymentMethodType.BANK_TRANSFER
    # Status
    status: StaffStatus = StaffStatus.ACTIVE
    linked_user_id: Optional[str] = None  # Link to app user if applicable
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Attendance Model
class Attendance(BaseModel):
    attendance_id: str = Field(default_factory=lambda: f"att_{uuid.uuid4().hex[:12]}")
    staff_id: str
    staff_name: Optional[str] = None
    date: datetime
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str = "present"  # present, absent, half_day, leave, holiday
    leave_type: Optional[str] = None  # sick, casual, earned, etc.
    work_hours: float = 0
    overtime_hours: float = 0
    remarks: Optional[str] = None
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Payroll Model
class Payroll(BaseModel):
    payroll_id: str = Field(default_factory=lambda: f"pay_{uuid.uuid4().hex[:12]}")
    staff_id: str
    staff_name: str
    employee_code: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    # Period
    month: int  # 1-12
    year: int  # 2024, 2025, etc.
    # Attendance Summary
    working_days: int = 0
    days_present: int = 0
    days_absent: int = 0
    leaves_taken: int = 0
    overtime_hours: float = 0
    # Earnings
    basic_salary: float = 0
    hra: float = 0
    da: float = 0
    ta: float = 0
    other_allowances: float = 0
    bonus: float = 0
    overtime_pay: float = 0
    gross_earnings: float = 0
    # Deductions
    pf: float = 0
    esi: float = 0
    professional_tax: float = 0
    tds: float = 0
    loan_deduction: float = 0
    advance_deduction: float = 0
    other_deductions: float = 0
    total_deductions: float = 0
    # Net Pay
    net_pay: float = 0
    # Payment Details
    payment_method: PaymentMethodType = PaymentMethodType.BANK_TRANSFER
    payment_date: Optional[datetime] = None
    transaction_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    # Status
    status: PayrollStatus = PayrollStatus.DRAFT
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Payment Verification with OTP
class PaymentVerification(BaseModel):
    verification_id: str = Field(default_factory=lambda: f"pv_{uuid.uuid4().hex[:12]}")
    request_type: str  # procurement, payroll, vendor_payment, etc.
    request_id: str  # ID of the original request
    amount: float
    party_name: str
    party_email: Optional[str] = None
    party_phone: Optional[str] = None
    otp_code: str  # 6-digit OTP
    otp_sent_at: Optional[datetime] = None
    otp_expires_at: Optional[datetime] = None
    otp_verified: bool = False
    otp_verified_at: Optional[datetime] = None
    otp_attempts: int = 0
    max_attempts: int = 3
    status: PaymentRequestStatus = PaymentRequestStatus.PENDING
    requested_by: str
    requested_by_name: Optional[str] = None
    verified_by: Optional[str] = None
    transaction_id: Optional[str] = None  # Added after payment
    payment_method: Optional[PaymentMethodType] = None
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== END ACCOUNTANT BOARD MODELS ====================


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


async def create_notification(user_id: str, message: str):
    """Create a notification for a user"""
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "message": message,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification


class DemoLoginRequest(BaseModel):
    email: str


@api_router.post("/auth/demo-login")
async def demo_login(login_request: DemoLoginRequest, response: Response):
    """Demo login - bypasses Google OAuth for easy testing"""
    email = login_request.email.lower()
    
    # Find user by email
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found. Available demo users: admin@constructionos.com, accountant@constructionos.com, pm@constructionos.com, etc.")
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    # Create session token
    session_token = f"demo_{uuid.uuid4().hex}"
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


@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Google OAuth session - ONLY for invited users"""
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
    
    email = data["email"].lower()
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    # ONLY invited users can login via Google
    if not user_doc:
        raise HTTPException(
            status_code=403, 
            detail="Access denied. You must be invited by an administrator to access this system. Please contact your Super Admin."
        )
    
    # Update user profile picture and name from Google if available
    update_fields = {}
    if data.get("picture") and not user_doc.get("picture"):
        update_fields["picture"] = data["picture"]
    if data.get("name") and not user_doc.get("name"):
        update_fields["name"] = data["name"]
    
    if update_fields:
        await db.users.update_one({"email": email}, {"$set": update_fields})
        user_doc.update(update_fields)
    
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


# ==================== USER INVITATION SYSTEM ====================

class UserInvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class UserInvitation(BaseModel):
    invitation_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    email: str
    role: UserRole
    invited_by: str
    invited_by_name: Optional[str] = None
    status: UserInvitationStatus = UserInvitationStatus.PENDING
    invitation_token: str = Field(default_factory=lambda: uuid.uuid4().hex)
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InviteUserRequest(BaseModel):
    email: str
    role: UserRole
    name: Optional[str] = None


@api_router.post("/auth/invite-user")
async def invite_user(invite: InviteUserRequest, user: User = Depends(get_current_user)):
    """Super Admin invites a new user by email"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can invite users")
    
    email = invite.email.lower()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Check for existing pending invitation
    existing_invite = await db.user_invitations.find_one({
        "email": email, 
        "status": "pending"
    }, {"_id": 0})
    
    if existing_invite:
        # Update existing invitation
        await db.user_invitations.update_one(
            {"invitation_id": existing_invite["invitation_id"]},
            {"$set": {
                "role": invite.role,
                "invitation_token": uuid.uuid4().hex,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "invited_by": user.user_id,
                "invited_by_name": user.name
            }}
        )
        invitation_token = existing_invite["invitation_token"]
    else:
        # Create new invitation
        invitation = UserInvitation(
            email=email,
            role=invite.role,
            invited_by=user.user_id,
            invited_by_name=user.name
        )
        
        inv_dict = invitation.model_dump()
        inv_dict["expires_at"] = inv_dict["expires_at"].isoformat()
        inv_dict["created_at"] = inv_dict["created_at"].isoformat()
        await db.user_invitations.insert_one(inv_dict)
        invitation_token = invitation.invitation_token
    
    # Create the user in database (status: invited, pending activation)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": invite.name or "",
        "role": invite.role,
        "status": "invited",  # User is invited but hasn't logged in yet
        "invited_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)
    
    # Send invitation email (or mock it)
    frontend_url = os.environ.get("FRONTEND_URL", "https://cre-board.preview.emergentagent.com")
    
    if resend.api_key:
        try:
            await send_notification_email(
                email,
                "You've been invited to ConstructionOS",
                f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #FBBF24; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; color: #1F2937;">ConstructionOS</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <h2 style="color: #1F2937;">You've been invited!</h2>
                        <p style="color: #4B5563;">
                            <strong>{user.name}</strong> has invited you to join ConstructionOS as a <strong>{invite.role.replace('_', ' ').title()}</strong>.
                        </p>
                        <p style="color: #4B5563;">
                            Click the button below to login with your Google account:
                        </p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{frontend_url}/login" 
                               style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Login with Google
                            </a>
                        </div>
                        <p style="color: #6B7280; font-size: 14px;">
                            Note: You must login using this email address ({email}) to access the system.
                        </p>
                    </div>
                    <div style="background: #F3F4F6; padding: 15px; text-align: center; color: #6B7280; font-size: 12px;">
                        This invitation expires in 7 days.
                    </div>
                </div>
                """
            )
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to send invitation email: {e}")
            email_sent = False
    else:
        email_sent = False
    
    return {
        "message": f"User invited successfully",
        "email": email,
        "role": invite.role,
        "email_sent": email_sent,
        "note": "User can now login with Google using this email" if email_sent else "Email not sent (Resend API key not configured). User can login with Google using this email."
    }


@api_router.get("/auth/invitations")
async def get_invitations(user: User = Depends(get_current_user)):
    """Get all user invitations (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can view invitations")
    
    invitations = await db.user_invitations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return invitations


@api_router.delete("/auth/invitations/{invitation_id}")
async def cancel_invitation(invitation_id: str, user: User = Depends(get_current_user)):
    """Cancel a pending invitation (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can cancel invitations")
    
    invitation = await db.user_invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Delete the invitation
    await db.user_invitations.delete_one({"invitation_id": invitation_id})
    
    # Also delete the user if they haven't logged in yet
    await db.users.delete_one({"email": invitation["email"], "status": "invited"})
    
    return {"message": "Invitation cancelled"}


@api_router.post("/auth/resend-invitation/{email}")
async def resend_invitation(email: str, user: User = Depends(get_current_user)):
    """Resend invitation email (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can resend invitations")
    
    email = email.lower()
    user_doc = await db.users.find_one({"email": email, "status": "invited"}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Pending invitation not found for this email")
    
    frontend_url = os.environ.get("FRONTEND_URL", "https://cre-board.preview.emergentagent.com")
    
    if not resend.api_key:
        return {
            "message": "Email not sent (Resend API key not configured)",
            "email_sent": False,
            "note": f"User can login at {frontend_url}/login with Google using {email}"
        }
    
    try:
        await send_notification_email(
            email,
            "Reminder: You've been invited to ConstructionOS",
            f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #FBBF24; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; color: #1F2937;">ConstructionOS</h1>
                </div>
                <div style="padding: 30px; background: #ffffff;">
                    <h2 style="color: #1F2937;">Reminder: You're invited!</h2>
                    <p style="color: #4B5563;">
                        You were invited to join ConstructionOS as a <strong>{user_doc.get('role', 'user').replace('_', ' ').title()}</strong>.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{frontend_url}/login" 
                           style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Login with Google
                        </a>
                    </div>
                    <p style="color: #6B7280; font-size: 14px;">
                        Login using: {email}
                    </p>
                </div>
            </div>
            """
        )
        return {"message": "Invitation email resent", "email_sent": True}
    except Exception as e:
        logger.error(f"Failed to resend invitation: {e}")
        return {"message": "Failed to send email", "email_sent": False, "error": str(e)}


# ==================== END USER INVITATION SYSTEM ====================


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


class WorkOrderCreate(BaseModel):
    project_id: str
    boq_id: str
    requested_quantity: float
    purpose: str


@api_router.post("/work-orders")
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
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={"contentType": file.content_type, "uploaded_by": user.user_id}
    )
    
    return {"file_id": str(file_id)}


@api_router.get("/site-receipts/image/{file_id}")
async def get_image(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "image/jpeg") if grid_out.metadata else "image/jpeg"
        return Response(content=contents, media_type=content_type)
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


@api_router.get("/payments")
async def get_payments(project_id: Optional[str] = None, user: User = Depends(get_current_user)):
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


@api_router.post("/payments")
async def create_payment(payment: Payment, user: User = Depends(get_current_user)):
    payment_dict = payment.model_dump()
    payment_dict["payment_date"] = payment_dict["payment_date"].isoformat()
    payment_dict["created_at"] = payment_dict["created_at"].isoformat()
    await db.payments.insert_one(payment_dict)
    
    await create_audit_log(user.user_id, "create", "payment", payment.payment_id, {"amount": payment.amount})
    return payment


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
    
    # Get payment stages (schedule) - exclude internal notes
    payment_stages = await db.payment_stages.find(
        {"project_id": project_id}, 
        {"_id": 0, "internal_notes": 0}
    ).to_list(100)
    
    # Get scope items for client view
    scope_items = await db.scope_items.find(
        {"project_id": project_id, "workflow_status": {"$in": ["verified", "approved"]}}, 
        {"_id": 0, "internal_notes": 0}
    ).to_list(500)
    
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


@api_router.get("/client-portal/my-projects")
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


@api_router.post("/site-photos/upload")
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


@api_router.get("/site-photos/{project_id}")
async def get_site_photos(project_id: str, user: User = Depends(get_current_user)):
    photos = await db.site_photos.find({"project_id": project_id}, {"_id": 0}).sort("captured_at", -1).to_list(1000)
    for photo in photos:
        if isinstance(photo.get("captured_at"), str):
            photo["captured_at"] = datetime.fromisoformat(photo["captured_at"])
        if isinstance(photo.get("created_at"), str):
            photo["created_at"] = datetime.fromisoformat(photo["created_at"])
    return photos


@api_router.post("/documents/upload")
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


@api_router.get("/documents/{project_id}")
async def get_documents(project_id: str, user: User = Depends(get_current_user)):
    documents = await db.documents.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for doc in documents:
        if isinstance(doc.get("created_at"), str):
            doc["created_at"] = datetime.fromisoformat(doc["created_at"])
    return documents


@api_router.get("/files/{file_id}")
async def get_file(file_id: str):
    from bson.objectid import ObjectId
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        content_type = grid_out.metadata.get("contentType", "application/octet-stream") if grid_out.metadata else "application/octet-stream"
        return Response(content=contents, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail="File not found")


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


# ==================== WORK ORDER ASSIGNMENT ENDPOINTS ====================

class WorkOrderAssignmentCreate(BaseModel):
    work_order_id: str
    project_id: str
    assigned_to_user_id: str
    due_date: str
    priority: str = "medium"
    notes: Optional[str] = None


@api_router.get("/work-order-assignments/{project_id}")
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


@api_router.get("/work-order-assignments")
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


@api_router.post("/work-order-assignments")
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


@api_router.patch("/work-order-assignments/{assignment_id}/status")
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


@api_router.get("/project-commitments/{project_id}")
async def get_project_commitments(project_id: str, user: User = Depends(get_current_user)):
    commitments = await db.project_commitments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for commitment in commitments:
        if isinstance(commitment.get("committed_date"), str):
            commitment["committed_date"] = datetime.fromisoformat(commitment["committed_date"])
        if isinstance(commitment.get("created_at"), str):
            commitment["created_at"] = datetime.fromisoformat(commitment["created_at"])
    return commitments


@api_router.post("/project-commitments")
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


@api_router.delete("/project-commitments/{commitment_id}")
async def delete_project_commitment(commitment_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.project_commitments.delete_one({"commitment_id": commitment_id})
    await create_audit_log(user.user_id, "delete", "project_commitment", commitment_id, {})
    return {"message": "Commitment deleted"}


# ==================== SUPER ADMIN NOTIFICATION ENDPOINTS ====================

@api_router.get("/admin/notifications")
async def get_admin_notifications(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    # Get all notifications across all users
    notifs = await db.notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for n in notifs:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"])
    return notifs


@api_router.get("/admin/pending-approvals")
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


@api_router.get("/admin/dashboard-summary")
async def get_admin_dashboard_summary(user: User = Depends(get_current_user)):
    """Get comprehensive Super Admin dashboard data matching user's sketch"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    
    # Get all projects
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
    # Initialize totals
    totals = {
        # Project Value Section
        "project_total_value": 0,
        "project_addition_cost": 0,
        "project_value_total": 0,
        
        # Income Section
        "income_project": 0,
        "income_additional": 0,
        "income_total": 0,
        
        # Balance Section
        "balance_project": 0,
        "balance_additional": 0,
        "balance_grand_total": 0,
        
        # Expense Section
        "total_expense": 0,
        "cash_in_book": 0,
        
        # Count
        "total_projects": len(projects)
    }
    
    project_summaries = []
    
    for p in projects:
        project_id = p.get("project_id")
        
        # Get scope items for this project
        scope_items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
        scope_total = sum(item.get("total_amount", 0) for item in scope_items)
        
        # Use scope total if available, otherwise use project's total_value
        project_value = scope_total if scope_items else p.get("total_value", 0)
        
        # Get additional costs
        additional_costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
        additions_total = sum(c.get("estimated_amount", 0) for c in additional_costs)
        additions_income = sum(c.get("income_received", 0) for c in additional_costs)
        
        # Get payment stages for income
        payment_stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
        payment_received = sum(s.get("amount_received", 0) for s in payment_stages)
        
        # Get deductions
        deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
        deductions_total = sum(d.get("amount", 0) for d in deductions)
        
        # Get expenses
        expenses = await db.expenses.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
        expenses_total = sum(e.get("amount", 0) for e in expenses)
        
        # Calculate project-level values
        value_total = project_value + additions_total
        income_total = payment_received + additions_income
        balance_project = project_value - payment_received
        balance_additional = additions_total - additions_income
        balance_total = balance_project + balance_additional - deductions_total
        cash_in_book = income_total - expenses_total
        
        # Add to totals
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
            "project_id": project_id,
            "name": p.get("name"),
            "client_name": p.get("client_name"),
            "location": p.get("location"),
            "status": p.get("status"),
            "project_value": project_value,
            "additions": additions_total,
            "total_value": value_total,
            "income_received": income_total,
            "deductions": deductions_total,
            "balance": balance_total,
            "expenses": expenses_total,
            "cash_in_book": cash_in_book
        })
    
    return {
        "totals": totals,
        "projects": project_summaries
    }


@api_router.get("/admin/financial-overview")
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

@api_router.get("/projects/search")
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


@api_router.get("/projects/list-for-filter")
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


@api_router.post("/projects/{project_id}/link-client")
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
    location: Optional[str] = None
    total_value: Optional[float] = None
    additional_cost: Optional[float] = None
    income_project: Optional[float] = None
    income_additional: Optional[float] = None
    total_expense: Optional[float] = None
    status: Optional[str] = None


@api_router.patch("/projects/{project_id}")
async def update_project(project_id: str, update_data: ProjectUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.projects.update_one({"project_id": project_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "project", project_id, update_dict)
    return {"message": "Project updated"}


@api_router.delete("/projects/{project_id}")
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


# BOQ Update/Delete
class BOQUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[float] = None
    unit_rate: Optional[float] = None
    locked: Optional[bool] = None


@api_router.patch("/boq/{boq_id}")
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


@api_router.delete("/boq/{boq_id}")
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


@api_router.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, update_data: VendorUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.vendors.update_one({"vendor_id": vendor_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "vendor", vendor_id, update_dict)
    return {"message": "Vendor updated"}


@api_router.delete("/vendors/{vendor_id}")
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


@api_router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, update_data: ExpenseUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update expenses")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.expenses.update_one({"expense_id": expense_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "expense", expense_id, update_dict)
    return {"message": "Expense updated"}


@api_router.delete("/expenses/{expense_id}")
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


@api_router.patch("/payments/{payment_id}")
async def update_payment(payment_id: str, update_data: PaymentUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant can update payments")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    await db.payments.update_one({"payment_id": payment_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "payment", payment_id, update_dict)
    return {"message": "Payment updated"}


@api_router.delete("/payments/{payment_id}")
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


@api_router.patch("/purchase-orders/{po_id}")
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
@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    await db.users.delete_one({"user_id": user_id})
    await create_audit_log(current_user.user_id, "delete", "user", user_id, {})
    return {"message": "User deleted"}


# ==================== VENDOR PORTAL ENDPOINTS ====================

@api_router.get("/vendor-portal/dashboard")
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


@api_router.patch("/vendor-portal/purchase-orders/{po_id}/dispatch")
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
@api_router.patch("/vendors/{vendor_id}/link-user")
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
    payment_mode: str  # cash, cheque, bank_transfer, upi
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None
    remarks: Optional[str] = None


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


@api_router.get("/projects/{project_id}/comprehensive")
async def get_comprehensive_project_view(project_id: str, user: User = Depends(get_current_user)):
    """Get comprehensive project data including BOQ, payment schedule, and additional costs"""
    
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
@api_router.get("/projects/{project_id}/payment-stages")
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


@api_router.post("/payment-stages")
async def create_payment_stage(stage_input: PaymentStageCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    stage = PaymentStage(
        project_id=stage_input.project_id,
        stage_name=stage_input.stage_name,
        percentage=stage_input.percentage,
        amount=stage_input.amount,
        due_date=datetime.fromisoformat(stage_input.due_date) if stage_input.due_date else None
    )
    
    stage_dict = stage.model_dump()
    if stage_dict.get("due_date"):
        stage_dict["due_date"] = stage_dict["due_date"].isoformat()
    stage_dict["created_at"] = stage_dict["created_at"].isoformat()
    
    await db.payment_stages.insert_one(stage_dict)
    await create_audit_log(user.user_id, "create", "payment_stage", stage.stage_id, {"stage_name": stage.stage_name})
    return stage


@api_router.patch("/payment-stages/{stage_id}")
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


@api_router.delete("/payment-stages/{stage_id}")
async def delete_payment_stage(stage_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.payment_stages.delete_one({"stage_id": stage_id})
    await create_audit_log(user.user_id, "delete", "payment_stage", stage_id, {})
    return {"message": "Payment stage deleted"}


@api_router.patch("/payment-stages/{stage_id}/request")
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

@api_router.post("/projects/{project_id}/payment-schedule/generate")
async def generate_payment_schedule(project_id: str, user: User = Depends(get_current_user)):
    """Planning team generates payment schedule from template based on project value"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can create payment schedule")
    
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if schedule already exists
    existing = await db.payment_stages.count_documents({"project_id": project_id})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Payment schedule already exists. Delete existing stages first.")
    
    project_value = project.get("total_value", 0)
    stages_created = []
    
    for idx, template in enumerate(DEFAULT_PAYMENT_SCHEDULE):
        amount = (project_value * template["percentage"]) / 100 if template["percentage"] > 0 else 0
        
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
    
    await create_audit_log(user.user_id, "generate_schedule", "payment_schedule", project_id, {"stages": len(stages_created)})
    
    # Notify CRE about new payment schedule
    if project.get("created_by"):
        await create_notification(project["created_by"], f"Payment schedule created for {project.get('name')}. Start collecting payments.")
    
    return {"message": f"Payment schedule generated with {len(stages_created)} stages", "stages": stages_created}


@api_router.post("/projects/{project_id}/payment-schedule/submit")
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


@api_router.post("/payment-stages/{stage_id}/collect")
async def collect_stage_payment(stage_id: str, collection: PaymentCollectionInput, user: User = Depends(get_current_user)):
    """CRE collects payment for a stage"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can collect payments")
    
    stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Payment stage not found")
    
    project = await db.projects.find_one({"project_id": stage["project_id"]}, {"_id": 0})
    
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
        "payment_mode": collection.payment_mode,
        "payment_reference": collection.payment_reference,
        "payment_date": payment_date,
        "collected_by": user.user_id,
        "collected_by_name": user.name,
        "remarks": collection.remarks or stage.get("remarks")
    }
    
    await db.payment_stages.update_one({"stage_id": stage_id}, {"$set": update_data})
    
    # Create income record for this payment
    income_record = {
        "income_id": f"inc_{uuid.uuid4().hex[:12]}",
        "project_id": stage["project_id"],
        "project_name": project.get("name") if project else "",
        "category": "payment_collection",
        "sub_category": stage.get("stage_name", "Payment Stage"),
        "amount": collection.amount_received,
        "payment_mode": collection.payment_mode,
        "payment_reference": collection.payment_reference,
        "payment_date": payment_date,
        "description": f"Payment collection: {stage.get('stage_label', '')} - {stage.get('stage_name', '')}",
        "collected_by": user.user_id,
        "collected_by_name": user.name,
        "status": "received",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.income.insert_one(income_record)
    
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


@api_router.get("/projects/{project_id}/payment-summary")
async def get_payment_summary(project_id: str, user: User = Depends(get_current_user)):
    """Get complete payment summary for a project - all payments from advance to final"""
    
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
    
    # Calculate totals
    total_scheduled = sum(s.get("amount", 0) for s in payment_stages)
    total_received = sum(s.get("amount_received", 0) for s in payment_stages)
    total_balance = total_scheduled - total_received
    
    # Advance payment details (from project)
    advance_payment = {
        "amount": project.get("advance_amount", 0),
        "date": project.get("advance_date"),
        "mode": project.get("advance_payment_mode"),
        "status": "received" if project.get("advance_amount", 0) > 0 else "pending"
    }
    
    # Count stages by status
    stages_paid = len([s for s in payment_stages if s.get("status") == "paid"])
    stages_partial = len([s for s in payment_stages if s.get("status") == "partial"])
    stages_pending = len([s for s in payment_stages if s.get("status") == "pending"])
    
    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "project_value": project.get("total_value", 0),
        "advance_payment": advance_payment,
        "payment_stages": payment_stages,
        "income_records": income_records,
        "summary": {
            "total_scheduled": total_scheduled,
            "total_received": total_received,
            "total_balance": total_balance,
            "collection_percentage": (total_received / total_scheduled * 100) if total_scheduled > 0 else 0,
            "stages_total": len(payment_stages),
            "stages_paid": stages_paid,
            "stages_partial": stages_partial,
            "stages_pending": stages_pending
        }
    }


@api_router.get("/payment-schedule/due-payments")
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
@api_router.get("/projects/{project_id}/additional-costs")
async def get_additional_costs(project_id: str, user: User = Depends(get_current_user)):
    costs = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for cost in costs:
        if isinstance(cost.get("created_at"), str):
            cost["created_at"] = datetime.fromisoformat(cost["created_at"])
    return costs


@api_router.post("/additional-costs")
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


@api_router.patch("/additional-costs/{cost_id}")
async def update_additional_cost(cost_id: str, update_data: AdditionalCostUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.additional_costs.update_one({"cost_id": cost_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "additional_cost", cost_id, update_dict)
    return {"message": "Additional cost updated"}


@api_router.delete("/additional-costs/{cost_id}")
async def delete_additional_cost(cost_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.additional_costs.delete_one({"cost_id": cost_id})
    await create_audit_log(user.user_id, "delete", "additional_cost", cost_id, {})
    return {"message": "Additional cost deleted"}


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


@api_router.get("/projects/{project_id}/scope-items")
async def get_scope_items(project_id: str, user: User = Depends(get_current_user)):
    items = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for item in items:
        if isinstance(item.get("created_at"), str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
    return items


@api_router.post("/scope-items")
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


@api_router.patch("/scope-items/{scope_id}")
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


@api_router.delete("/scope-items/{scope_id}")
async def delete_scope_item(scope_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    await db.scope_items.delete_one({"scope_id": scope_id})
    await create_audit_log(user.user_id, "delete", "scope_item", scope_id, {})
    return {"message": "Scope item deleted"}


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


@api_router.get("/projects/{project_id}/deductions")
async def get_deductions(project_id: str, user: User = Depends(get_current_user)):
    deductions = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for d in deductions:
        if isinstance(d.get("created_at"), str):
            d["created_at"] = datetime.fromisoformat(d["created_at"])
    return deductions


@api_router.post("/deductions")
async def create_deduction(deduction_input: DeductionCreate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
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


@api_router.patch("/deductions/{deduction_id}")
async def update_deduction(deduction_id: str, update_data: DeductionUpdate, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    await db.deductions.update_one({"deduction_id": deduction_id}, {"$set": update_dict})
    await create_audit_log(user.user_id, "update", "deduction", deduction_id, update_dict)
    return {"message": "Deduction updated"}


@api_router.delete("/deductions/{deduction_id}")
async def delete_deduction(deduction_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
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
@api_router.post("/scope-items/bulk")
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
            workflow_status="draft",
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
@api_router.post("/payment-stages/bulk")
async def create_bulk_payment_stages(
    data: BulkPaymentCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple payment stages at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    created_items = []
    for item in data.items:
        if not item.stage_name or not item.amount:
            continue  # Skip empty rows
        
        stage = PaymentStage(
            project_id=data.project_id,
            stage_name=item.stage_name,
            percentage=item.percentage,
            amount=item.amount,
            due_date=datetime.fromisoformat(item.due_date) if item.due_date else None,
            workflow_status="draft",
            created_by=user.user_id
        )
        stage_dict = stage.model_dump()
        stage_dict["created_at"] = stage_dict["created_at"].isoformat()
        if stage_dict.get("due_date"):
            stage_dict["due_date"] = stage_dict["due_date"].isoformat()
        await db.payment_stages.insert_one(stage_dict)
        stage_dict.pop("_id", None)
        created_items.append(stage_dict)
    
    await create_audit_log(user.user_id, "bulk_create", "payment_stages", data.project_id, {"count": len(created_items)})
    return {"message": f"Created {len(created_items)} payment stages", "items": created_items}


# Bulk create additions
@api_router.post("/additional-costs/bulk")
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
            workflow_status="draft",
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
@api_router.post("/deductions/bulk")
async def create_bulk_deductions(
    data: BulkDeductionCreate,
    user: User = Depends(get_current_user)
):
    """Create multiple deductions at once (pending verification)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.ACCOUNTANT]:
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
            workflow_status="draft",
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


@api_router.post("/scope-items/verify")
async def verify_scope_items(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify scope items - requires typing VERIFY"""
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


@api_router.post("/payment-stages/verify")
async def verify_payment_stages(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify payment stages - requires typing VERIFY"""
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


@api_router.post("/additional-costs/verify")
async def verify_additions(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify additions - requires typing VERIFY"""
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


@api_router.post("/deductions/verify")
async def verify_deductions(data: VerifyRequest, user: User = Depends(get_current_user)):
    """Verify deductions - requires typing VERIFY"""
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


@api_router.post("/scope-items/approve")
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


@api_router.post("/payment-stages/approve")
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


@api_router.post("/additional-costs/approve")
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


@api_router.post("/deductions/approve")
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
@api_router.get("/approvals/pending")
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


# ==================== SITE ENGINEER MODULE ====================

class MaterialRequestStatus(str, Enum):
    REQUESTED = "requested"
    PLANNING_APPROVED = "planning_approved"
    VENDOR_SELECTED = "vendor_selected"  # Procurement selected vendor & pricing
    WAITING_PAYMENT = "waiting_payment"  # Waiting for accounts approval
    PAYMENT_APPROVED = "payment_approved"  # Accounts approved payment
    PO_GENERATED = "po_generated"  # Purchase order generated
    IN_TRANSIT = "in_transit"  # Material dispatched
    RECEIVED_PARTIAL = "received_partial"
    RECEIVED_COMPLETED = "received_completed"
    REJECTED = "rejected"
    CLOSED = "closed"


class PaymentType(str, Enum):
    ADVANCE = "advance"  # Full payment upfront
    PARTIAL = "partial"  # Partial payment, balance later
    CREDIT = "credit"  # No payment now, add to ledger


class LabourRequestStatus(str, Enum):
    REQUESTED = "requested"
    PLANNING_APPROVED = "planning_approved"
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
    request_id: str = Field(default_factory=lambda: f"lreq_{uuid.uuid4().hex[:12]}")
    order_id: str = Field(default_factory=lambda: f"LAB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}")
    project_id: str
    site_engineer_id: str
    labour_type: str  # Mason, Helper, Carpenter, Electrician, Plumber, etc.
    num_workers: int
    num_days: int
    rate_per_day: float
    total_amount: float  # num_workers * num_days * rate_per_day
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


@api_router.post("/site-engineer/assignments")
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


@api_router.get("/site-engineer/assignments")
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


@api_router.delete("/site-engineer/assignments/{assignment_id}")
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
@api_router.get("/site-engineer/my-projects")
async def get_site_engineer_projects(user: User = Depends(get_current_user)):
    """Get projects assigned to the current site engineer"""
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineers can access this")
    
    assignments = await db.site_engineer_assignments.find({
        "user_id": user.user_id,
        "is_active": True
    }, {"_id": 0}).to_list(10)
    
    projects = []
    for a in assignments:
        project = await db.projects.find_one({"project_id": a["project_id"]}, {"_id": 0})
        if project:
            # Get active orders count
            material_orders = await db.material_requests.count_documents({
                "project_id": a["project_id"],
                "site_engineer_id": user.user_id,
                "status": {"$nin": ["received_completed", "rejected"]}
            })
            labour_orders = await db.labour_requests.count_documents({
                "project_id": a["project_id"],
                "site_engineer_id": user.user_id,
                "status": {"$nin": ["approved", "rejected"]}
            })
            project["active_orders"] = material_orders + labour_orders
            project["assignment_id"] = a["assignment_id"]
            projects.append(project)
    
    return projects


@api_router.get("/site-engineer/project/{project_id}")
async def get_site_engineer_project_detail(
    project_id: str,
    user: User = Depends(get_current_user)
):
    """Get project detail for a site engineer"""
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineers can access this")
    
    # Verify assignment
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
    
    # Remove financial details for site engineer
    project.pop("agreement_value", None)
    project.pop("received_amount", None)
    project.pop("spent_amount", None)
    
    # Get material requests
    material_requests = await db.material_requests.find({
        "project_id": project_id,
        "site_engineer_id": user.user_id
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get labour requests
    labour_requests = await db.labour_requests.find({
        "project_id": project_id,
        "site_engineer_id": user.user_id
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get material receipts
    material_receipts = await db.material_receipts.find({
        "project_id": project_id,
        "site_engineer_id": user.user_id
    }, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    return {
        "project": project,
        "material_requests": material_requests,
        "labour_requests": labour_requests,
        "material_receipts": material_receipts
    }


# Material Request Endpoints
class MaterialRequestCreate(BaseModel):
    project_id: str
    material_id: str
    quantity: float
    remarks: Optional[str] = None


@api_router.post("/site-engineer/material-requests")
async def create_material_request(
    data: MaterialRequestCreate,
    user: User = Depends(get_current_user)
):
    """Create a new material request"""
    if user.role != UserRole.SITE_ENGINEER:
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
    material = await db.materials.find_one({"material_id": data.material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    request = MaterialRequest(
        project_id=data.project_id,
        site_engineer_id=user.user_id,
        material_id=data.material_id,
        material_name=material["name"],
        quantity=data.quantity,
        unit=material["unit"],
        remarks=data.remarks
    )
    
    req_dict = request.model_dump()
    req_dict["status"] = req_dict["status"].value
    req_dict["created_at"] = req_dict["created_at"].isoformat()
    await db.material_requests.insert_one(req_dict)
    req_dict.pop("_id", None)
    
    # Notify Planning department
    planners = await db.users.find({"role": "planning"}, {"_id": 0}).to_list(100)
    for p in planners:
        await create_notification(p["user_id"], f"New material request: {material['name']} x {data.quantity}")
    
    await create_audit_log(user.user_id, "create", "material_request", request.request_id, {"material": material["name"], "qty": data.quantity})
    
    return req_dict


@api_router.get("/site-engineer/material-requests")
async def get_material_requests(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material requests"""
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


@api_router.patch("/site-engineer/material-requests/{request_id}/approve")
async def approve_material_request(
    request_id: str,
    action: str,  # planning_approve, procurement_approve, accountant_approve, reject
    rejection_reason: Optional[str] = None,
    pricing: Optional[float] = None,
    vendor_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Approve or reject a material request at various stages"""
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    update_data = {}
    
    if action == "planning_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "requested":
            raise HTTPException(status_code=400, detail="Invalid status for planning approval")
        update_data = {
            "status": MaterialRequestStatus.PLANNING_APPROVED.value,
            "planning_approved_by": user.user_id,
            "planning_approved_at": datetime.now(timezone.utc).isoformat()
        }
        # Notify procurement
        proc_users = await db.users.find({"role": "procurement"}, {"_id": 0}).to_list(100)
        for p in proc_users:
            await create_notification(p["user_id"], f"Material request approved for procurement: {request['material_name']}")
    
    elif action == "procurement_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "planning_approved":
            raise HTTPException(status_code=400, detail="Invalid status for procurement approval")
        update_data = {
            "status": MaterialRequestStatus.PROCUREMENT_APPROVED.value,
            "procurement_approved_by": user.user_id,
            "procurement_approved_at": datetime.now(timezone.utc).isoformat(),
            "procurement_pricing": pricing,
            "vendor_id": vendor_id
        }
        # Notify accountant
        acc_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(100)
        for a in acc_users:
            await create_notification(a["user_id"], f"Material request ready for accountant approval: {request['material_name']}")
    
    elif action == "accountant_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "procurement_approved":
            raise HTTPException(status_code=400, detail="Invalid status for accountant approval")
        update_data = {
            "status": MaterialRequestStatus.ACCOUNTANT_APPROVED.value,
            "accountant_approved_by": user.user_id,
            "accountant_approved_at": datetime.now(timezone.utc).isoformat()
        }
        # Notify site engineer
        await create_notification(request["site_engineer_id"], f"Material request approved: {request['material_name']} - Ready for delivery")
    
    elif action == "mark_delivered":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROCUREMENT]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "accountant_approved":
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data = {"status": MaterialRequestStatus.READY_FOR_DELIVERY.value}
        await create_notification(request["site_engineer_id"], f"Material dispatched: {request['material_name']}")
    
    elif action == "reject":
        update_data = {
            "status": MaterialRequestStatus.REJECTED.value,
            "rejection_reason": rejection_reason
        }
        await create_notification(request["site_engineer_id"], f"Material request rejected: {request['material_name']}")
    
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


@api_router.post("/site-engineer/labour-requests")
async def create_labour_request(
    data: LabourRequestCreate,
    user: User = Depends(get_current_user)
):
    """Create a new labour request"""
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineers can create labour requests")
    
    # Verify assignment
    assignment = await db.site_engineer_assignments.find_one({
        "user_id": user.user_id,
        "project_id": data.project_id,
        "is_active": True
    }, {"_id": 0})
    
    if not assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this project")
    
    total_amount = data.num_workers * data.num_days * data.rate_per_day
    
    request = LabourRequest(
        project_id=data.project_id,
        site_engineer_id=user.user_id,
        labour_type=data.labour_type,
        num_workers=data.num_workers,
        num_days=data.num_days,
        rate_per_day=data.rate_per_day,
        total_amount=total_amount,
        remarks=data.remarks
    )
    
    req_dict = request.model_dump()
    req_dict["status"] = req_dict["status"].value
    req_dict["created_at"] = req_dict["created_at"].isoformat()
    await db.labour_requests.insert_one(req_dict)
    req_dict.pop("_id", None)
    
    # Notify Planning department
    planners = await db.users.find({"role": "planning"}, {"_id": 0}).to_list(100)
    for p in planners:
        await create_notification(p["user_id"], f"New labour request: {data.labour_type} x {data.num_workers} workers")
    
    await create_audit_log(user.user_id, "create", "labour_request", request.request_id, {"type": data.labour_type, "workers": data.num_workers})
    
    return req_dict


@api_router.get("/site-engineer/labour-requests")
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
    
    requests = await db.labour_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Enrich with project name
    for r in requests:
        project = await db.projects.find_one({"project_id": r["project_id"]}, {"_id": 0, "name": 1})
        r["project_name"] = project["name"] if project else "Unknown"
    
    return requests


@api_router.patch("/site-engineer/labour-requests/{request_id}/approve")
async def approve_labour_request(
    request_id: str,
    action: str,  # planning_approve, accountant_approve, reject
    rejection_reason: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Approve or reject a labour request"""
    request = await db.labour_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    update_data = {}
    
    if action == "planning_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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
            await create_notification(a["user_id"], f"Labour request ready for approval: {request['labour_type']}")
    
    elif action == "accountant_approve":
        if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
            raise HTTPException(status_code=403, detail="Permission denied")
        if request["status"] != "planning_approved":
            raise HTTPException(status_code=400, detail="Invalid status")
        update_data = {
            "status": LabourRequestStatus.APPROVED.value,
            "accountant_approved_by": user.user_id,
            "accountant_approved_at": datetime.now(timezone.utc).isoformat()
        }
        await create_notification(request["site_engineer_id"], f"Labour request approved: {request['labour_type']}")
    
    elif action == "reject":
        update_data = {
            "status": LabourRequestStatus.REJECTED.value,
            "rejection_reason": rejection_reason
        }
        await create_notification(request["site_engineer_id"], f"Labour request rejected: {request['labour_type']}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    await db.labour_requests.update_one({"request_id": request_id}, {"$set": update_data})
    await create_audit_log(user.user_id, action, "labour_request", request_id, update_data)
    
    return await db.labour_requests.find_one({"request_id": request_id}, {"_id": 0})


# Material Receipt with OTP
class MaterialReceiptCreate(BaseModel):
    request_id: str
    received_qty: float
    gps_latitude: float
    gps_longitude: float
    photo_url: Optional[str] = None
    remarks: Optional[str] = None


import random
import string

def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))


@api_router.post("/site-engineer/material-receipts/initiate")
async def initiate_material_receipt(
    data: MaterialReceiptCreate,
    user: User = Depends(get_current_user)
):
    """Initiate material receipt - sends OTP to site engineer email"""
    if user.role != UserRole.SITE_ENGINEER:
        raise HTTPException(status_code=403, detail="Only Site Engineers can receive materials")
    
    # Get the material request
    request = await db.material_requests.find_one({"request_id": data.request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Material request not found")
    
    if request["site_engineer_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="You can only receive materials for your own requests")
    
    if request["status"] not in ["accountant_approved", "ready_for_delivery", "received_partial"]:
        raise HTTPException(status_code=400, detail="Material is not ready for receiving")
    
    # Generate OTP
    otp_code = generate_otp()
    otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Create receipt record
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
        otp_code=otp_code,
        otp_expires_at=otp_expires_at
    )
    
    rcpt_dict = receipt.model_dump()
    rcpt_dict["created_at"] = rcpt_dict["created_at"].isoformat()
    rcpt_dict["otp_expires_at"] = rcpt_dict["otp_expires_at"].isoformat()
    await db.material_receipts.insert_one(rcpt_dict)
    rcpt_dict.pop("_id", None)
    
    # Get user email
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    user_email = user_doc.get("email") if user_doc else None
    
    # Send OTP via Resend
    otp_sent = False
    if resend.api_key and user_email:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [user_email],
                "subject": f"ConstructionOS - Material Receipt OTP: {otp_code}",
                "html": f"""
                <h2>Material Receipt Verification</h2>
                <p>Your OTP for material receipt verification is:</p>
                <h1 style="color: #2563eb; font-size: 32px; letter-spacing: 4px;">{otp_code}</h1>
                <p><strong>Material:</strong> {request['material_name']}</p>
                <p><strong>Quantity:</strong> {data.received_qty} / {request['quantity']} {request['unit']}</p>
                <p>This OTP expires in 10 minutes.</p>
                <p style="color: #666;">If you did not request this, please ignore this email.</p>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            otp_sent = True
            logger.info(f"OTP sent to {user_email}")
        except Exception as e:
            logger.error(f"Failed to send OTP email: {str(e)}")
    
    # Remove OTP from response (security)
    rcpt_dict.pop("otp_code", None)
    rcpt_dict["otp_sent"] = otp_sent
    rcpt_dict["otp_email"] = user_email if otp_sent else None
    
    # For testing: if OTP not sent, log it
    if not otp_sent:
        logger.warning(f"OTP not sent via email. OTP for testing: {otp_code}")
        rcpt_dict["test_otp"] = otp_code  # Only for demo/testing
    
    return rcpt_dict


class OTPVerifyRequest(BaseModel):
    receipt_id: str
    otp_code: str


@api_router.post("/site-engineer/material-receipts/verify-otp")
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


@api_router.get("/site-engineer/material-receipts")
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


# Labour types list
@api_router.get("/site-engineer/labour-types")
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


@api_router.get("/income")
async def get_all_income(
    project_id: Optional[str] = None,
    payment_mode: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all income entries with optional filters"""
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


@api_router.get("/income/summary")
async def get_income_summary(user: User = Depends(get_current_user)):
    """Get income summary with totals by payment mode"""
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


@api_router.get("/projects/{project_id}/income")
async def get_project_income(project_id: str, user: User = Depends(get_current_user)):
    """Get all income entries for a specific project"""
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


@api_router.post("/income")
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


@api_router.patch("/income/{income_id}")
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


@api_router.delete("/income/{income_id}")
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

@api_router.get("/projects/{project_id}/full-details")
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

@api_router.get("/expenses/material")
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


@api_router.post("/expenses/material")
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


@api_router.patch("/expenses/material/{expense_id}/planning-approval")
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


@api_router.patch("/expenses/material/{expense_id}/procurement-pricing")
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


@api_router.patch("/expenses/material/{expense_id}/accounts-approval")
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

@api_router.get("/expenses/labour")
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


@api_router.post("/expenses/labour")
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


@api_router.patch("/expenses/labour/{expense_id}/planning-approval")
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


@api_router.patch("/expenses/labour/{expense_id}/accounts-approval")
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

@api_router.get("/expenses/vendor-service")
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


@api_router.post("/expenses/vendor-service")
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


@api_router.patch("/expenses/vendor-service/{expense_id}/planning-approval")
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


@api_router.patch("/expenses/vendor-service/{expense_id}/accounts-approval")
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

@api_router.patch("/expenses/{expense_id}/payment")
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

@api_router.get("/expenses/summary")
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


@api_router.get("/expenses/pending-approvals")
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


@api_router.get("/projects/{project_id}/expenses")
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


@api_router.get("/settings/company")
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


@api_router.post("/settings/company")
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


@api_router.patch("/settings/company")
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


@api_router.get("/materials")
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


@api_router.get("/materials/categories")
async def get_material_categories(user: User = Depends(get_current_user)):
    """Get all material categories"""
    return [{"value": cat.value, "label": cat.value.replace("_", " ").title()} for cat in MaterialCategory]


@api_router.get("/materials/{material_id}")
async def get_material(material_id: str, user: User = Depends(get_current_user)):
    """Get a specific material"""
    material = await db.materials.find_one({"material_id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


@api_router.post("/materials")
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


@api_router.patch("/materials/{material_id}")
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


@api_router.delete("/materials/{material_id}")
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


@api_router.get("/vendor-master")
async def get_vendor_master_list(
    active_only: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all vendors from master list"""
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


@api_router.get("/vendor-master/{vendor_id}")
async def get_vendor_master(vendor_id: str, user: User = Depends(get_current_user)):
    """Get a specific vendor from master"""
    vendor = await db.vendor_master.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@api_router.post("/vendor-master")
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


@api_router.patch("/vendor-master/{vendor_id}")
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


@api_router.delete("/vendor-master/{vendor_id}")
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


@api_router.get("/users/{user_id}")
async def get_user_by_id(user_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific user"""
    if current_user.role != UserRole.SUPER_ADMIN and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return user_doc


@api_router.patch("/users/{user_id}")
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


@api_router.delete("/users/{user_id}")
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


@api_router.get("/users/by-role/{role}")
async def get_users_by_role(role: str, current_user: User = Depends(get_current_user)):
    """Get users by role (Super Admin only)"""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    users = await db.users.find({"role": role}, {"_id": 0}).to_list(1000)
    return users


@api_router.get("/roles")
async def get_all_roles(user: User = Depends(get_current_user)):
    """Get all available roles"""
    return [
        {"value": role.value, "label": role.value.replace("_", " ").title()}
        for role in UserRole
    ]


# ==================== SYSTEM SETTINGS PAGE DATA ====================

@api_router.get("/settings/summary")
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


@api_router.get("/procurement/dashboard")
async def get_procurement_dashboard(user: User = Depends(get_current_user)):
    """Get procurement dashboard metrics"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can access this")
    
    # Count pending (planning approved material requests waiting for procurement)
    pending_requests = await db.material_requests.count_documents({
        "status": "planning_approved"
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
        "pending_requests": pending_requests,
        "pricing_in_progress": pricing_in_progress,
        "waiting_accounts": waiting_accounts,
        "approved_orders": approved_orders,
        "delivered_orders": delivered_orders,
        "total_in_pricing": total_in_pricing,
        "credit_outstanding": credit_outstanding,
        "vendor_spend": [{"vendor": v["_id"] or "Unknown", "amount": v["total_spend"]} for v in vendor_spend]
    }


@api_router.get("/procurement/requests")
async def get_procurement_requests(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get material requests by status for procurement board"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can access this")
    
    results = []
    
    if status == "pending" or status is None:
        # Get planning-approved material requests not yet in procurement_pricing
        existing_pricing_ids = await db.procurement_pricing.distinct("request_id")
        pending_requests = await db.material_requests.find({
            "status": "planning_approved",
            "request_id": {"$nin": existing_pricing_ids}
        }, {"_id": 0}).sort("created_at", -1).to_list(1000)
        
        # Enrich with project and engineer names
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


@api_router.post("/procurement/start-pricing/{request_id}")
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


@api_router.get("/procurement/pricing/{pricing_id}")
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


@api_router.post("/procurement/pricing/{pricing_id}/add-quote")
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


@api_router.delete("/procurement/pricing/{pricing_id}/quote/{quote_id}")
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


@api_router.patch("/procurement/pricing/{pricing_id}/select-vendor")
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


@api_router.post("/procurement/pricing/{pricing_id}/submit")
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
                "status": "procurement_approved",
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


@api_router.patch("/procurement/pricing/{pricing_id}/accounts-action")
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


@api_router.patch("/procurement/pricing/{pricing_id}/payment-status")
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


@api_router.patch("/procurement/pricing/{pricing_id}/delivery-status")
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


@api_router.get("/procurement/logs/{pricing_id}")
async def get_procurement_logs(pricing_id: str, user: User = Depends(get_current_user)):
    """Get audit logs for a pricing record"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    logs = await db.procurement_logs.find(
        {"pricing_id": pricing_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return logs


@api_router.get("/procurement/price-history")
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


@api_router.post("/procurement/add-vendor")
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
    payment_type: str  # advance, partial, credit
    advance_amount: Optional[float] = None  # For partial payment
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


@api_router.post("/procurement/v2/select-vendor/{request_id}")
async def select_vendor_v2(request_id: str, data: VendorSelectionInput, user: User = Depends(get_current_user)):
    """Procurement selects vendor and pricing for material request"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Procurement can select vendors")
    
    request = await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    if request.get("status") != "planning_approved":
        raise HTTPException(status_code=400, detail="Request must be planning approved first")
    
    # Get vendor details
    vendor = await db.vendor_master.find_one({"vendor_id": data.vendor_id}, {"_id": 0})
    
    # Calculate total
    quantity = request.get("quantity", 0)
    total_amount = (data.unit_rate * quantity) + data.transport_cost - data.discount
    
    # Determine status based on payment type
    if data.payment_type == "credit":
        new_status = "vendor_selected"  # Can generate PO directly for credit
    else:
        new_status = "waiting_payment"  # Needs accounts approval
    
    update_data = {
        "vendor_id": data.vendor_id,
        "vendor_name": data.vendor_name,
        "unit_rate": data.unit_rate,
        "transport_cost": data.transport_cost,
        "discount": data.discount,
        "total_amount": total_amount,
        "payment_type": data.payment_type,
        "advance_amount": data.advance_amount if data.payment_type == "partial" else (total_amount if data.payment_type == "advance" else 0),
        "balance_amount": total_amount - (data.advance_amount or 0) if data.payment_type == "partial" else (0 if data.payment_type == "advance" else total_amount),
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
    if data.payment_type in ["advance", "partial"]:
        accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(50)
        for acc in accountants:
            await create_notification(
                acc["user_id"],
                f"Payment approval needed: {request.get('material_name')} - ₹{total_amount:,.0f} ({data.payment_type})"
            )
    
    return {"message": "Vendor selected", "status": new_status, "total_amount": total_amount}


@api_router.patch("/procurement/v2/accounts-approval/{request_id}")
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
                "status": "rejected",
                "rejection_reason": data.remarks,
                "rejected_by": user.user_id
            }}
        )
        return {"message": "Payment rejected", "status": "rejected"}


@api_router.post("/procurement/v2/generate-po/{request_id}")
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
    
    # If credit, add to credit ledger
    if request.get("payment_type") == "credit":
        credit_entry = {
            "entry_id": f"cle_{uuid.uuid4().hex[:12]}",
            "vendor_id": request.get("vendor_id"),
            "vendor_name": request.get("vendor_name"),
            "project_id": request.get("project_id"),
            "project_name": project.get("name") if project else "",
            "request_id": request_id,
            "po_id": po_id,
            "credit_amount": request.get("total_amount"),
            "paid_amount": 0,
            "balance_amount": request.get("total_amount"),
            "status": "outstanding",
            "payment_history": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.credit_ledger.insert_one(credit_entry)
    
    return {"message": "Purchase Order generated", "po_id": po_id, "po_number": po_number}


@api_router.patch("/procurement/v2/dispatch/{request_id}")
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
    
    # Notify site engineer
    await create_notification(
        request.get("site_engineer_id"),
        f"Material {request.get('material_name')} dispatched. Vehicle: {data.vehicle_number}. OTP for receipt: {otp}"
    )
    
    return {"message": "Marked as dispatched", "otp": otp, "status": "in_transit"}


@api_router.post("/procurement/v2/receive/{request_id}")
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

@api_router.get("/procurement/credit-ledger")
async def get_credit_ledger(
    vendor_id: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get credit ledger entries"""
    if user.role not in [UserRole.PROCUREMENT, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    if vendor_id:
        query["vendor_id"] = vendor_id
    if status:
        query["status"] = status
    
    entries = await db.credit_ledger.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Calculate totals
    total_outstanding = sum(e.get("balance_amount", 0) for e in entries if e.get("status") != "paid")
    
    return {
        "entries": entries,
        "total_outstanding": total_outstanding,
        "count": len(entries)
    }


class CreditPaymentInput(BaseModel):
    amount: float
    payment_reference: str
    remarks: Optional[str] = None


@api_router.post("/procurement/credit-ledger/{entry_id}/pay")
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


@api_router.post("/vendor-master/v2/create")
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


@api_router.get("/vendor-master")
async def get_vendors_master(
    category: Optional[str] = None,
    labour_category: Optional[str] = None,
    is_active: bool = True,
    user: User = Depends(get_current_user)
):
    """Get all vendors from vendor master"""
    query = {"is_active": is_active}
    if category:
        query["category"] = category
    if labour_category:
        query["labour_category"] = labour_category
    
    vendors = await db.vendor_master.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return vendors


@api_router.get("/vendor-master/{vendor_id}")
async def get_vendor_detail(vendor_id: str, user: User = Depends(get_current_user)):
    """Get single vendor details"""
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


@api_router.patch("/vendor-master/v2/{vendor_id}")
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


@api_router.post("/vendor-master/{vendor_id}/upload-aadhar")
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

@api_router.get("/procurement/transit")
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


@api_router.get("/procurement/transit/{request_id}/tracking")
async def get_transit_tracking(request_id: str, user: User = Depends(get_current_user)):
    """Get tracking details for a transit order"""
    tracking = await db.transit_tracking.find_one({"request_id": request_id}, {"_id": 0})
    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking not found")
    return tracking


@api_router.patch("/procurement/transit/{request_id}/update")
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

@api_router.get("/procurement/reports/vendor-spend")
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


@api_router.get("/procurement/reports/material-spend")
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


@api_router.get("/procurement/reports/monthly")
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
    code: str
    description: Optional[str] = None
    building_types: List[str] = []
    base_rate_per_sqft: float = 0
    scope_items: List[PackageScopeItemInput] = []
    material_items: List[PackageMaterialItemInput] = []
    labour_items: List[PackageLabourItemInput] = []


@api_router.get("/packages")
async def get_packages(user: User = Depends(get_current_user)):
    """Get all active packages"""
    packages = await db.packages.find({"is_active": True}, {"_id": 0}).to_list(100)
    return packages


@api_router.get("/packages/{package_id}")
async def get_package(package_id: str, user: User = Depends(get_current_user)):
    """Get package details"""
    package = await db.packages.find_one({"package_id": package_id}, {"_id": 0})
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return package


@api_router.post("/packages")
async def create_package(package_input: PackageCreateInput, user: User = Depends(get_current_user)):
    """Create a new package (Super Admin and GM only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Super Admin and GM can create packages")
    
    # Check for duplicate code
    existing = await db.packages.find_one({"code": package_input.code, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail=f"Package with code '{package_input.code}' already exists")
    
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
        code=package_input.code,
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


@api_router.patch("/packages/{package_id}")
async def update_package(package_id: str, package_input: PackageCreateInput, user: User = Depends(get_current_user)):
    """Update a package (Super Admin and GM only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Super Admin and GM can update packages")
    
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


@api_router.delete("/packages/{package_id}")
async def delete_package(package_id: str, user: User = Depends(get_current_user)):
    """Soft delete a package (Super Admin and GM only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Only Super Admin and GM can delete packages")
    
    result = await db.packages.update_one(
        {"package_id": package_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Package not found")
    
    return {"message": "Package deleted"}


# ==================== LABOUR CONTRACTOR ENDPOINTS ====================

class LabourContractorInput(BaseModel):
    name: str
    work_types: List[str] = []
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    rate_structure: Dict = {}


@api_router.get("/labour-contractors")
async def get_labour_contractors(user: User = Depends(get_current_user)):
    """Get all active labour contractors"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    contractors = await db.labour_contractors.find({"is_active": True}, {"_id": 0}).to_list(100)
    return contractors


@api_router.post("/labour-contractors")
async def create_labour_contractor(contractor_input: LabourContractorInput, user: User = Depends(get_current_user)):
    """Create a new labour contractor (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Planning can create labour contractors")
    
    contractor = LabourContractor(
        name=contractor_input.name,
        work_types=contractor_input.work_types,
        phone=contractor_input.phone,
        email=contractor_input.email,
        address=contractor_input.address,
        bank_name=contractor_input.bank_name,
        account_number=contractor_input.account_number,
        ifsc_code=contractor_input.ifsc_code,
        rate_structure=contractor_input.rate_structure,
        created_by=user.user_id
    )
    
    contractor_dict = contractor.model_dump()
    contractor_dict["created_at"] = contractor_dict["created_at"].isoformat()
    contractor_dict["updated_at"] = contractor_dict["updated_at"].isoformat()
    
    await db.labour_contractors.insert_one(contractor_dict)
    
    return {"contractor_id": contractor.contractor_id, "message": "Labour contractor created"}


@api_router.patch("/labour-contractors/{contractor_id}")
async def update_labour_contractor(contractor_id: str, contractor_input: LabourContractorInput, user: User = Depends(get_current_user)):
    """Update a labour contractor"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Planning can update labour contractors")
    
    update_data = {
        "name": contractor_input.name,
        "work_types": contractor_input.work_types,
        "phone": contractor_input.phone,
        "email": contractor_input.email,
        "address": contractor_input.address,
        "bank_name": contractor_input.bank_name,
        "account_number": contractor_input.account_number,
        "ifsc_code": contractor_input.ifsc_code,
        "rate_structure": contractor_input.rate_structure,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.labour_contractors.update_one(
        {"contractor_id": contractor_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Labour contractor not found")
    
    return {"message": "Labour contractor updated"}


@api_router.delete("/labour-contractors/{contractor_id}")
async def delete_labour_contractor(contractor_id: str, user: User = Depends(get_current_user)):
    """Soft delete a labour contractor"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Planning can delete labour contractors")
    
    result = await db.labour_contractors.update_one(
        {"contractor_id": contractor_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Labour contractor not found")
    
    return {"message": "Labour contractor deleted"}


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
    """Generate project code in format USB010226 (USB + serial + month + year)"""
    now = datetime.now(timezone.utc)
    month = now.strftime("%m")
    year = now.strftime("%y")
    
    # Count projects this month to generate serial
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count = await db.projects.count_documents({
        "created_at": {"$gte": start_of_month.isoformat()}
    })
    serial = str(count + 1).zfill(2)
    
    return f"USB{serial}{month}{year}"


@api_router.get("/cre/dashboard")
async def get_cro_dashboard(user: User = Depends(get_current_user)):
    """Get CRE dashboard data"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    # CRE can see all projects (not filtered by created_by)
    # This allows them to manage projects created from CRM RE conversion
    base_query = {}
    draft_count = await db.projects.count_documents({**base_query, "status": "draft"})
    pending_payment_count = await db.projects.count_documents({**base_query, "status": "pending_payment"})
    payment_verified_count = await db.projects.count_documents({**base_query, "status": "payment_verified"})
    planning_review_count = await db.projects.count_documents({**base_query, "status": {"$in": ["planning_review", "planning"]}})
    awaiting_approval_count = await db.projects.count_documents({**base_query, "status": "awaiting_approval"})
    approved_count = await db.projects.count_documents({**base_query, "status": {"$in": ["planning_approved", "active"]}})
    
    # Total ongoing projects
    total_ongoing = await db.projects.count_documents({
        **base_query,
        "status": {"$nin": ["draft", "pending_payment", "completed", "cancelled"]}
    })
    
    # Total project value
    total_value_agg = await db.projects.aggregate([
        {"$match": base_query},
        {"$group": {"_id": None, "total": {"$sum": "$total_value"}}}
    ]).to_list(1)
    total_project_value = total_value_agg[0]["total"] if total_value_agg else 0
    
    # Get recent projects created by CRO
    recent_projects = await db.projects.find(
        base_query,
        {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Count projects by stage
    stage_counts = {}
    for stage in PROJECT_STAGES:
        count = await db.projects.count_documents({
            **base_query,
            "current_stage": stage["id"],
            "status": {"$nin": ["draft", "pending_payment", "completed", "cancelled"]}
        })
        stage_counts[stage["id"]] = count
    
    # Get active packages with base_rate_per_sqft
    packages = await db.packages.find(
        {"is_active": True}, 
        {"_id": 0, "package_id": 1, "name": 1, "code": 1, "base_rate_per_sqft": 1, "description": 1}
    ).to_list(10)
    
    # Payments to collect (projects with pending payment milestones)
    payments_to_collect = await db.projects.find(
        {**base_query, "payments_to_collect": {"$exists": True, "$ne": []}},
        {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "payments_to_collect": 1}
    ).to_list(50)
    
    return {
        "draft_count": draft_count,
        "pending_payment_count": pending_payment_count,
        "payment_verified_count": payment_verified_count,
        "planning_review_count": planning_review_count,
        "awaiting_approval_count": awaiting_approval_count,
        "approved_count": approved_count,
        "total_ongoing": total_ongoing,
        "total_project_value": total_project_value,
        "recent_projects": recent_projects,
        "packages": packages,
        "project_stages": PROJECT_STAGES,
        "stage_counts": stage_counts,
        "payments_to_collect": payments_to_collect
    }


@api_router.get("/cre/new-deals")
async def get_cre_new_deals(user: User = Depends(get_current_user)):
    """Get closed deals from Sales that need to be converted to projects"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")
    
    # Find leads with stage "Deal Closed" that haven't been converted to projects yet
    # Try lead_stages first (new collection), then fall back to crm_stages
    deal_closed_stage = await db.lead_stages.find_one({"name": "Deal Closed", "stage_type": "sales"})
    if not deal_closed_stage:
        deal_closed_stage = await db.crm_stages.find_one({"name": "Deal Closed", "stage_type": "sales"})
    if not deal_closed_stage:
        # Return empty if no Deal Closed stage exists
        return []
    
    # Get leads in deal_closed stage that don't have a project yet
    # Use 'leads' collection (not 'crm_leads')
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
        lead["_id"] = str(lead["_id"]) if "_id" in lead else None
        
        # Get RE project details if available
        if lead.get("re_project_id"):
            re_project = await db.re_projects.find_one(
                {"re_project_id": lead["re_project_id"]},
                {"_id": 0}
            )
            lead["re_project"] = re_project
        
        deals.append(lead)
    
    return deals


class ConvertDealInput(BaseModel):
    advance_amount: float
    payment_mode: str
    payment_reference: Optional[str] = ""
    accountant_confirmed: bool = False


@api_router.post("/cre/convert-deal/{lead_id}")
async def convert_deal_to_project(
    lead_id: str,
    data: ConvertDealInput,
    user: User = Depends(get_current_user)
):
    """Convert a closed deal to a project with advance collection"""
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can convert deals")
    
    if not data.accountant_confirmed:
        raise HTTPException(status_code=400, detail="Accountant confirmation required")
    
    # Get the lead - use 'leads' collection
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check if already converted
    if lead.get("project_created"):
        raise HTTPException(status_code=400, detail="Deal already converted to project")
    
    now = datetime.now(timezone.utc)
    
    # Get RE project details if available
    re_project = None
    if lead.get("re_project_id"):
        re_project = await db.re_projects.find_one({"re_project_id": lead["re_project_id"]})
    
    # Calculate expected completion (default 12 months)
    handover_months = re_project.get("handover_months", 12) if re_project else 12
    expected_completion = now + timedelta(days=handover_months * 30)
    
    # Generate project ID
    project_count = await db.projects.count_documents({})
    project_id = f"proj_{secrets.token_hex(6)}"
    
    # Create the main project
    main_project = {
        "project_id": project_id,
        "name": re_project.get("project_name", lead.get("name", "New Project")) if re_project else lead.get("name", "New Project"),
        # Client details
        "client_name": lead.get("name"),
        "client_email": lead.get("email"),
        "client_phone": lead.get("phone"),
        "location": re_project.get("location", "") if re_project else lead.get("city", ""),
        "sqft": re_project.get("sqft", 0) if re_project else 0,
        "building_type": re_project.get("building_type", "residential") if re_project else "residential",
        # Financial
        "total_value": re_project.get("estimated_total", 0) if re_project else 0,
        "advance_amount": data.advance_amount,
        "advance_payment_mode": data.payment_mode,
        "advance_payment_reference": data.payment_reference,
        "advance_received_at": now,
        "advance_verified_by": user.user_id,
        "additional_cost": 0,
        "income_project": data.advance_amount,
        "income_additional": 0,
        "total_expense": 0,
        # Stage
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        # Dates
        "start_date": now,
        "expected_completion": expected_completion,
        # Status - Set to 'planning' so Planning can add BOQ
        "status": "planning",
        # Links
        "re_project_id": lead.get("re_project_id"),
        "lead_id": lead_id,
        # Workflow
        "created_by": user.user_id,
        "created_at": now,
        "converted_by_cre": user.user_id,
        "converted_at": now
    }
    
    await db.projects.insert_one(main_project)
    
    # Update lead
    await db.crm_leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "project_created": True,
            "project_id": project_id,
            "converted_at": now,
            "converted_by": user.user_id
        }}
    )
    
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
        "advance_collected": data.advance_amount
    }


@api_router.get("/cre/payment-requests")
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


@api_router.post("/cre/projects")
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


@api_router.patch("/cre/projects/{project_id}/submit")
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
            "submitted_for_payment_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Notify accountants
    accountants = await db.users.find({"role": "accountant"}, {"_id": 0, "user_id": 1}).to_list(100)
    for acc in accountants:
        await create_notification(acc["user_id"], f"New payment to verify: {project.get('name')} - ₹{project.get('advance_amount', 0):,.0f}")
    
    return {"message": "Project submitted for payment verification"}


@api_router.patch("/cre/projects/{project_id}/submit-to-planning")
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


@api_router.post("/cre/projects/{project_id}/add-payment-milestone")
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


@api_router.patch("/cre/projects/{project_id}/notify-client/{milestone_id}")
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


@api_router.patch("/cre/projects/{project_id}/collect-payment/{milestone_id}")
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


@api_router.get("/cre/projects/all")
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
    if user.role == UserRole.CRE:
        query["created_by"] = user.user_id
    
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


# ==================== PLANNING BOARD ENDPOINTS ====================

@api_router.get("/planning/dashboard")
async def get_planning_dashboard(user: User = Depends(get_current_user)):
    """Get planning department dashboard"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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


@api_router.get("/planning/projects")
async def get_planning_projects(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get projects for planning board"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    
    query = {}
    if status == "new":
        # Include both planning_review and planning (from CRM RE conversion)
        query["status"] = {"$in": ["planning_review", "planning"]}
    elif status == "awaiting":
        query["status"] = "awaiting_approval"
    elif status == "working":
        query["status"] = {"$in": ["planning_approved", "active"]}
    elif status == "completed":
        query["status"] = "completed"
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects


@api_router.patch("/planning/projects/{project_id}/submit-for-approval")
async def planning_submit_for_approval(project_id: str, user: User = Depends(get_current_user)):
    """Planning submits project for GM/Admin approval"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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
    
    # Notify GM and Super Admin
    gm_users = await db.users.find({"role": "general_manager"}, {"_id": 0, "user_id": 1}).to_list(10)
    admin_users = await db.users.find({"role": "super_admin"}, {"_id": 0, "user_id": 1}).to_list(10)
    
    for u in gm_users + admin_users:
        await create_notification(u["user_id"], f"Project awaiting approval: {project.get('name')}")
    
    return {"message": "Project submitted for approval"}


# ==================== PROJECT CONSTRUCTION STAGES ENDPOINTS ====================

@api_router.get("/planning/stage-dashboard")
async def get_planning_stage_dashboard(user: User = Depends(get_current_user)):
    """Get planning dashboard with project stages - Tab view like CRE Board"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    
    # Count projects by construction stage (only working/active projects)
    stage_counts = {}
    for stage in PROJECT_STAGES:
        count = await db.projects.count_documents({
            "current_stage": stage["id"],
            "status": {"$in": ["planning_review", "planning_approved", "active", "gm_approved"]}
        })
        stage_counts[stage["id"]] = count
    
    # Count by workflow status
    new_projects = await db.projects.count_documents({"status": "planning_review"})
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


@api_router.get("/planning/projects-by-stage")
async def get_projects_by_stage(stage: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get projects filtered by construction stage"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can access this")
    
    query = {"status": {"$in": ["planning_review", "planning_approved", "active", "gm_approved"]}}
    
    if stage and stage != "all":
        query["current_stage"] = stage
    
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return projects


@api_router.patch("/planning/projects/{project_id}/update-stage")
async def update_project_stage(project_id: str, stage: str, user: User = Depends(get_current_user)):
    """Update project construction stage - Planning can move projects through stages"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can update project stage")
    
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


@api_router.get("/planning/projects/{project_id}/stage-history")
async def get_project_stage_history(project_id: str, user: User = Depends(get_current_user)):
    """Get project stage change history"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
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


# ==================== GM / SUPER ADMIN APPROVAL ENDPOINTS ====================

@api_router.get("/approvals/projects")
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


@api_router.patch("/approvals/projects/{project_id}/gm-approve")
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
    
    # Notify Super Admin
    admin_users = await db.users.find({"role": "super_admin"}, {"_id": 0, "user_id": 1}).to_list(10)
    for u in admin_users:
        await create_notification(u["user_id"], f"Project GM approved, awaiting final approval: {project.get('name')}")
    
    return {"message": "Project approved by GM"}


@api_router.patch("/approvals/projects/{project_id}/final-approve")
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
    
    # Notify Planning and CRO
    planning_users = await db.users.find({"role": "planning"}, {"_id": 0, "user_id": 1}).to_list(10)
    for u in planning_users:
        await create_notification(u["user_id"], f"Project approved for execution: {project.get('name')}")
    
    if project.get("created_by"):
        await create_notification(project["created_by"], f"Your project has been approved: {project.get('name')}")
    
    return {"message": "Project approved - Ready for execution. Material brands are now locked."}


@api_router.patch("/approvals/projects/{project_id}/reject")
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


@api_router.get("/projects/{project_id}/materials")
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


@api_router.post("/projects/{project_id}/materials")
async def add_project_material(project_id: str, material_input: ProjectMaterialInput, user: User = Depends(get_current_user)):
    """Add a new material specification to project (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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


@api_router.patch("/projects/{project_id}/materials/{material_id}")
async def update_project_material(project_id: str, material_id: str, material_input: ProjectMaterialInput, user: User = Depends(get_current_user)):
    """Update material specification (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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


@api_router.delete("/projects/{project_id}/materials/{material_id}")
async def delete_project_material(project_id: str, material_id: str, user: User = Depends(get_current_user)):
    """Delete material specification (Planning only, before approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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


@api_router.post("/projects/{project_id}/request-material-unlock")
async def request_material_unlock(project_id: str, reason: str, user: User = Depends(get_current_user)):
    """Request to unlock material brands (requires re-approval)"""
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
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

@api_router.get("/accounts/dashboard")
async def get_accounts_dashboard(user: User = Depends(get_current_user)):
    """Get accounts dashboard"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can access this")
    
    # New project advance payments pending verification
    pending_advance_payments = await db.projects.count_documents({"status": "pending_payment"})
    advance_payments_total = await db.projects.aggregate([
        {"$match": {"status": "pending_payment"}},
        {"$group": {"_id": None, "total": {"$sum": "$advance_amount"}}}
    ]).to_list(1)
    
    # Pending payments (approved by planning)
    pending_material = await db.material_expenses.count_documents({"status": "planning_approved"})
    pending_labour = await db.labour_expenses.count_documents({"status": "planning_approved"})
    pending_procurement = await db.procurement_pricing.count_documents({"status": "waiting_accounts"})
    
    # Count work order stage payments (approved by Planning, waiting for Accounts)
    work_orders = await db.work_orders.find(
        {"stages.status": "payment_approved"},
        {"_id": 0, "stages": 1}
    ).to_list(500)
    pending_stage_payments = sum(
        1 for wo in work_orders 
        for stage in wo.get("stages", []) 
        if stage.get("status") == "payment_approved"
    )
    stage_payments_total = sum(
        stage.get("amount", 0) for wo in work_orders 
        for stage in wo.get("stages", []) 
        if stage.get("status") == "payment_approved"
    )
    
    # Get totals
    material_total = await db.material_expenses.aggregate([
        {"$match": {"status": "planning_approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$estimated_cost"}}}
    ]).to_list(1)
    
    labour_total = await db.labour_expenses.aggregate([
        {"$match": {"status": "planning_approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]).to_list(1)
    
    procurement_total = await db.procurement_pricing.aggregate([
        {"$match": {"status": "waiting_accounts"}},
        {"$group": {"_id": None, "total": {"$sum": "$final_amount"}}}
    ]).to_list(1)
    
    return {
        "pending_advance_payments": pending_advance_payments,
        "advance_payments_total": advance_payments_total[0]["total"] if advance_payments_total else 0,
        "pending_material": pending_material,
        "pending_labour": pending_labour,
        "pending_procurement": pending_procurement,
        "pending_stage_payments": pending_stage_payments,
        "material_total": material_total[0]["total"] if material_total else 0,
        "labour_total": labour_total[0]["total"] if labour_total else 0,
        "procurement_total": procurement_total[0]["total"] if procurement_total else 0,
        "stage_payments_total": stage_payments_total,
        "total_pending": (material_total[0]["total"] if material_total else 0) + 
                        (labour_total[0]["total"] if labour_total else 0) +
                        (procurement_total[0]["total"] if procurement_total else 0) +
                        stage_payments_total +
                        (advance_payments_total[0]["total"] if advance_payments_total else 0)
    }


@api_router.get("/accounts/pending-advance-payments")
async def get_pending_advance_payments(user: User = Depends(get_current_user)):
    """Get projects pending advance payment verification"""
    if user.role not in [UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Accounts can access this")
    
    projects = await db.projects.find(
        {"status": "pending_payment"},
        {"_id": 0}
    ).sort("submitted_for_payment_at", -1).to_list(100)
    
    return projects


@api_router.patch("/accounts/verify-advance-payment/{project_id}")
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


@api_router.patch("/accounts/reject-advance-payment/{project_id}")
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


@api_router.get("/accounts/pending-payments")
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


@api_router.patch("/accounts/process-payment/{item_type}/{item_id}")
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


@api_router.get("/work-orders")
async def get_work_orders(
    project_id: Optional[str] = None,
    order_type: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get work orders with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.SITE_ENGINEER, UserRole.GENERAL_MANAGER]:
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


@api_router.get("/work-orders/payment-requests")
async def get_work_order_payment_requests_v2(user: User = Depends(get_current_user)):
    """Get all payment requests for Planning to review - placed before parameterized route"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Planning can view payment requests")
    
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


@api_router.get("/work-orders/{work_order_id}")
async def get_work_order(work_order_id: str, user: User = Depends(get_current_user)):
    """Get single work order details"""
    work_order = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    if not work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return work_order


@api_router.post("/work-orders/labour")
async def create_labour_work_order(wo_input: LabourWorkOrderInput, user: User = Depends(get_current_user)):
    """Create a labour work order (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


@api_router.post("/work-orders/material")
async def create_material_work_order(wo_input: MaterialWorkOrderInput, user: User = Depends(get_current_user)):
    """Create a material work order (Planning only)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


@api_router.patch("/work-orders/{work_order_id}/assign")
async def assign_work_order(work_order_id: str, site_engineer_id: str, user: User = Depends(get_current_user)):
    """Assign work order to site engineer"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/start")
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/complete")
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/request-payment")
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/approve-payment")
async def approve_stage_payment(work_order_id: str, stage_id: str, user: User = Depends(get_current_user)):
    """Planning approves stage payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/reject-payment")
async def reject_stage_payment(work_order_id: str, stage_id: str, reason: str, user: User = Depends(get_current_user)):
    """Planning rejects stage payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
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


@api_router.patch("/work-orders/{work_order_id}/stages/{stage_id}/process-payment")
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
    
    await db.work_orders.update_one(
        {"work_order_id": work_order_id, "stages.stage_id": stage_id},
        {
            "$set": {
                "stages.$.status": "paid",
                "stages.$.paid_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Check if all stages are paid
    updated_wo = await db.work_orders.find_one({"work_order_id": work_order_id}, {"_id": 0})
    all_paid = all(s.get("status") == "paid" for s in updated_wo.get("stages", []))
    
    if all_paid and updated_wo.get("stages"):
        await db.work_orders.update_one(
            {"work_order_id": work_order_id},
            {"$set": {"status": "completed"}}
        )
    
    return {"message": "Payment processed"}


@api_router.get("/site-engineer/work-orders")
async def get_site_engineer_work_orders(user: User = Depends(get_current_user)):
    """Get work orders for site engineer"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SITE_ENGINEER]:
        raise HTTPException(status_code=403, detail="Only Site Engineers can access this")
    
    work_orders = await db.work_orders.find(
        {"assigned_to": user.user_id} if user.role == UserRole.SITE_ENGINEER else {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return work_orders


# ==================== COMPREHENSIVE ACCOUNTANT BOARD ENDPOINTS ====================


@api_router.get("/accountant/comprehensive-dashboard")
async def get_accountant_comprehensive_dashboard(user: User = Depends(get_current_user)):
    """Get comprehensive accountant dashboard with income, expense, profit by project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Only Accountant/Admin can access this")
    
    # Get all projects
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
    # Get all income entries
    income_entries = await db.income_entries.find({}, {"_id": 0}).to_list(5000)
    
    # Get all transactions
    transactions = await db.transactions.find({}, {"_id": 0}).to_list(5000)
    
    # Get all expenses (from multiple collections)
    material_expenses = await db.material_expenses.find({"status": "completed"}, {"_id": 0}).to_list(1000)
    labour_expenses = await db.labour_expenses.find({"status": "completed"}, {"_id": 0}).to_list(1000)
    vendor_expenses = await db.vendor_service_expenses.find({"status": "completed"}, {"_id": 0}).to_list(1000)
    
    # Get staff and payroll data
    staff_count = await db.staff.count_documents({})
    pending_payroll = await db.payroll.count_documents({"status": {"$in": ["draft", "pending_approval"]}})
    
    # Get cheque data
    pending_cheques = await db.cheques.count_documents({"status": {"$in": ["issued", "deposited", "post_dated"]}})
    bounced_cheques = await db.cheques.count_documents({"status": "bounced"})
    
    # Calculate totals by payment method
    income_by_method = {"cash": 0, "cheque": 0, "bank_transfer": 0, "upi": 0, "credit_card": 0}
    for inc in income_entries:
        method = inc.get("payment_mode", "cash")
        income_by_method[method] = income_by_method.get(method, 0) + inc.get("amount", 0)
    
    # Calculate project-wise financials
    project_financials = []
    total_income = sum(inc.get("amount", 0) for inc in income_entries)
    total_expense = 0
    
    for p in projects:
        pid = p.get("project_id")
        
        # Income for this project
        proj_income = sum(inc.get("amount", 0) for inc in income_entries if inc.get("project_id") == pid)
        
        # Expense for this project
        proj_mat_exp = sum(e.get("final_amount", 0) for e in material_expenses if e.get("project_id") == pid)
        proj_lab_exp = sum(e.get("total_amount", 0) for e in labour_expenses if e.get("project_id") == pid)
        proj_vend_exp = sum(e.get("amount", 0) for e in vendor_expenses if e.get("project_id") == pid)
        proj_expense = proj_mat_exp + proj_lab_exp + proj_vend_exp
        
        total_expense += proj_expense
        
        project_financials.append({
            "project_id": pid,
            "project_name": p.get("name"),
            "project_code": p.get("project_code"),
            "client_name": p.get("client_name"),
            "total_value": p.get("total_value", 0),
            "income": proj_income,
            "expense": proj_expense,
            "profit": proj_income - proj_expense,
            "profit_margin": round((proj_income - proj_expense) / proj_income * 100, 2) if proj_income > 0 else 0
        })
    
    # Sort by profit (descending)
    project_financials.sort(key=lambda x: x["profit"], reverse=True)
    
    # Recent transactions
    recent_transactions = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
    
    # Pending payment requests
    pending_payments = await db.payment_verifications.count_documents({"status": {"$in": ["pending", "otp_sent"]}})
    
    return {
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "total_profit": total_income - total_expense,
            "profit_margin": round((total_income - total_expense) / total_income * 100, 2) if total_income > 0 else 0
        },
        "income_by_method": income_by_method,
        "project_financials": project_financials,
        "recent_transactions": recent_transactions,
        "hr_summary": {
            "total_staff": staff_count,
            "pending_payroll": pending_payroll
        },
        "cheque_summary": {
            "pending_cheques": pending_cheques,
            "bounced_cheques": bounced_cheques
        },
        "pending_payment_requests": pending_payments
    }


@api_router.get("/accountant/project-financials/{project_id}")
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

@api_router.get("/accountant/transactions")
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


@api_router.post("/accountant/transactions")
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


@api_router.delete("/accountant/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, user: User = Depends(get_current_user)):
    """Delete a transaction"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    result = await db.transactions.delete_one({"transaction_id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return {"message": "Transaction deleted"}


# ==================== CHEQUE MANAGEMENT ENDPOINTS ====================

@api_router.get("/accountant/cheques")
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
    is_post_dated: bool = False
    reminder_date: Optional[datetime] = None
    remarks: Optional[str] = None


@api_router.post("/accountant/cheques")
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
    
    await db.cheques.insert_one(cheque_dict)
    return cheque_record


class ChequeStatusUpdate(BaseModel):
    status: ChequeStatus
    deposit_date: Optional[datetime] = None
    clearance_date: Optional[datetime] = None
    bounce_reason: Optional[str] = None
    bounce_charges: float = 0
    remarks: Optional[str] = None


@api_router.patch("/accountant/cheques/{cheque_id}/status")
async def update_cheque_status(cheque_id: str, update: ChequeStatusUpdate, user: User = Depends(get_current_user)):
    """Update cheque status"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
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


@api_router.get("/accountant/cheques/reminders")
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

@api_router.get("/hr/staff")
async def get_staff_list(
    department: Optional[str] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all staff members"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/hr/staff")
async def create_staff(staff_data: StaffCreate, user: User = Depends(get_current_user)):
    """Create a new staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.get("/hr/staff/{staff_id}")
async def get_staff(staff_id: str, user: User = Depends(get_current_user)):
    """Get a specific staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    return staff


@api_router.patch("/hr/staff/{staff_id}")
async def update_staff(staff_id: str, updates: dict, user: User = Depends(get_current_user)):
    """Update a staff member"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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
    return {"message": "Staff updated"}


@api_router.delete("/hr/staff/{staff_id}")
async def delete_staff(staff_id: str, user: User = Depends(get_current_user)):
    """Delete a staff member (soft delete)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete staff")
    
    result = await db.staff.update_one(
        {"staff_id": staff_id},
        {"$set": {"status": "terminated", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")
    
    return {"message": "Staff terminated"}


# ==================== ATTENDANCE ENDPOINTS ====================

@api_router.get("/hr/attendance")
async def get_attendance(
    staff_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: User = Depends(get_current_user)
):
    """Get attendance records"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/hr/attendance")
async def create_attendance(att: AttendanceCreate, user: User = Depends(get_current_user)):
    """Record attendance"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/hr/attendance/bulk")
async def create_bulk_attendance(records: List[AttendanceCreate], user: User = Depends(get_current_user)):
    """Record attendance for multiple staff at once"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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

@api_router.get("/hr/payroll")
async def get_payroll_list(
    month: Optional[int] = None,
    year: Optional[int] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get payroll records"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/hr/payroll/generate")
async def generate_payroll(data: PayrollGenerate, user: User = Depends(get_current_user)):
    """Generate payroll for all active staff for a month"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.patch("/hr/payroll/{payroll_id}/approve")
async def approve_payroll(payroll_id: str, user: User = Depends(get_current_user)):
    """Approve payroll"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.patch("/hr/payroll/{payroll_id}/pay")
async def process_payroll_payment(payroll_id: str, payment: PayrollPayment, user: User = Depends(get_current_user)):
    """Mark payroll as paid with OTP verification"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/hr/payroll/bulk-pay")
async def bulk_pay_payroll(month: int, year: int, payment: PayrollPayment, user: User = Depends(get_current_user)):
    """Pay all approved payrolls for a month"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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

@api_router.post("/accountant/payment-request/initiate")
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
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/accountant/payment-request/verify-otp")
async def verify_payment_otp(data: OTPVerify, user: User = Depends(get_current_user)):
    """Verify OTP for payment request"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.post("/accountant/payment-request/complete")
async def complete_payment(data: CompletePayment, user: User = Depends(get_current_user)):
    """Complete a payment after OTP verification"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.get("/accountant/payment-requests")
async def get_payment_requests(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all payment verification requests"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.get("/financial/indirect-cost-categories")
async def get_indirect_cost_categories():
    """Get list of indirect cost categories"""
    return INDIRECT_COST_CATEGORIES


@api_router.get("/financial/indirect-costs")
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


@api_router.post("/financial/indirect-costs")
async def create_indirect_cost(data: IndirectCostCreate, user: User = Depends(get_current_user)):
    """Create indirect cost entry (Accountant only) - Requires approval"""
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can create indirect cost entries")
    
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


@api_router.patch("/financial/indirect-costs/{cost_id}/approve")
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


@api_router.patch("/financial/indirect-costs/{cost_id}/confirm")
async def confirm_indirect_cost(cost_id: str, data: IndirectCostConfirm, user: User = Depends(get_current_user)):
    """Confirm payment of approved indirect cost (Accountant only)"""
    if user.role != UserRole.ACCOUNTANT:
        raise HTTPException(status_code=403, detail="Only Accountant can confirm payment")
    
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


# ==================== SUSPENSE ACCOUNT ENDPOINTS ====================

@api_router.get("/financial/suspense")
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


@api_router.post("/financial/suspense")
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


@api_router.patch("/financial/suspense/{suspense_id}/allocate")
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

@api_router.patch("/financial/cheques/{cheque_id}/return")
async def process_cheque_return(cheque_id: str, user: User = Depends(get_current_user)):
    """Process cheque return - Auto-reduce income and create penalty entry"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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

@api_router.get("/financial/pending-income-verification")
async def get_pending_income_verification(user: User = Depends(get_current_user)):
    """Get income entries pending verification (from Planning stage payments)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
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


@api_router.patch("/financial/income/{entry_id}/verify")
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

@api_router.get("/financial/audit-logs")
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

@api_router.get("/financial/control-dashboard")
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


# ==================== CRM MODULE ENUMS & MODELS ====================

class LeadSource(str, Enum):
    META = "meta"
    SEO = "seo"
    OTHER = "other"
    REFERRAL = "referral"
    WALK_IN = "walk_in"
    WEBSITE = "website"
    CSV_IMPORT = "csv_import"
    GOOGLE_SHEETS = "google_sheets"


class LeadStageType(str, Enum):
    PRE_SALES = "pre_sales"
    SALES = "sales"


class CustomFieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DROPDOWN = "dropdown"
    CHECKBOX = "checkbox"
    MULTI_SELECT = "multi_select"
    ADDRESS = "address"
    LOCATION = "location"
    DATE = "date"
    EMAIL = "email"
    PHONE = "phone"
    TEXTAREA = "textarea"
    URL = "url"


class REProjectStatus(str, Enum):
    RE_REQUESTED = "re_requested"
    RE_IN_PROGRESS = "re_in_progress"
    RE_SUBMITTED = "re_submitted"
    RE_APPROVED = "re_approved"
    RE_REJECTED = "re_rejected"
    DEAL_CLOSED = "deal_closed"
    CONVERTED = "converted"


# Custom Field Definition
class CustomFieldDefinition(BaseModel):
    field_id: str = Field(default_factory=lambda: f"cf_{uuid.uuid4().hex[:8]}")
    name: str
    label: str
    field_type: CustomFieldType
    required: bool = False
    options: List[str] = []  # For dropdown, multi_select
    placeholder: Optional[str] = None
    default_value: Optional[Any] = None
    order: int = 0
    is_conditional: bool = False
    condition_field: Optional[str] = None  # Field ID that controls visibility
    condition_value: Optional[Any] = None  # Value that triggers visibility


# Lead Stage Definition (Customizable)
class LeadStage(BaseModel):
    stage_id: str = Field(default_factory=lambda: f"stg_{uuid.uuid4().hex[:8]}")
    name: str
    stage_type: LeadStageType  # pre_sales or sales
    order: int = 0
    color: str = "#6366f1"  # Default purple
    is_final: bool = False  # True if this is the final stage (triggers transfer)
    is_active: bool = True
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Lead Model for CRM A (Pre-Sales) and CRM B (Sales)
class Lead(BaseModel):
    lead_id: str = Field(default_factory=lambda: f"lead_{uuid.uuid4().hex[:12]}")
    # Basic Fields
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: LeadSource = LeadSource.OTHER
    source_detail: Optional[str] = None  # e.g., Sheet tab name, campaign name
    
    # Stage Info
    current_stage_id: str
    stage_type: LeadStageType = LeadStageType.PRE_SALES
    stage_history: List[Dict[str, Any]] = []  # [{stage_id, moved_at, moved_by}]
    
    # Custom Fields Data
    custom_fields: Dict[str, Any] = {}  # {field_id: value}
    
    # Address & Location
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # Transfer Info
    transferred_from_lead_id: Optional[str] = None  # If transferred from CRM A
    transferred_to_lead_id: Optional[str] = None  # If transferred to CRM B
    transferred_at: Optional[datetime] = None
    
    # RE Project Link (for CRM B)
    re_project_id: Optional[str] = None
    
    # Import Info
    import_batch_id: Optional[str] = None  # For CSV/Sheets import tracking
    google_sheet_row: Optional[int] = None  # Row number in Google Sheet
    
    # Metadata
    assigned_to: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_contacted: Optional[datetime] = None
    notes: Optional[str] = None
    tags: List[str] = []
    
    # Remarks & Follow-ups (for CRM enhancements)
    summary: Optional[str] = None  # Lead summary written by sales/pre-sales
    remarks: List[Dict[str, Any]] = []  # [{text, remark_type, added_by, added_by_name, created_at}]
    follow_ups: List[Dict[str, Any]] = []  # [{scheduled_date, note, completed, completed_at, created_by}]


# Rough Estimate Project Model
class REProject(BaseModel):
    re_project_id: str = Field(default_factory=lambda: f"re_{uuid.uuid4().hex[:12]}")
    lead_id: str  # Link to Sales lead
    
    # Client Info (copied from lead)
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    
    # Project Info
    project_name: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: Optional[str] = None
    handover_months: Optional[int] = None  # Project handover time in months
    
    # Rough Scope
    rough_scope_items: List[Dict[str, Any]] = []  # [{name, quantity, unit, rate, total}]
    
    # Estimated Value (calculated from scope items)
    estimated_total: float = 0
    
    # Status & Workflow
    status: REProjectStatus = REProjectStatus.RE_REQUESTED
    
    # Planning Department
    planning_notes: Optional[str] = None
    prepared_by: Optional[str] = None
    prepared_at: Optional[datetime] = None
    
    # GM Approval
    submitted_for_approval: bool = False
    submitted_at: Optional[datetime] = None
    gm_approved_by: Optional[str] = None
    gm_approved_at: Optional[datetime] = None
    gm_rejection_reason: Optional[str] = None
    
    # Conversion to Main Project
    converted_project_id: Optional[str] = None
    converted_at: Optional[datetime] = None
    converted_by: Optional[str] = None
    
    # Metadata
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Google Sheets Integration Config
class GoogleSheetsConfig(BaseModel):
    config_id: str = Field(default_factory=lambda: f"gsc_{uuid.uuid4().hex[:8]}")
    spreadsheet_id: str
    spreadsheet_name: Optional[str] = None
    tabs: List[Dict[str, Any]] = []  # [{tab_name, source_type, column_mapping}]
    auto_sync: bool = True
    sync_interval_minutes: int = 30
    last_sync_at: Optional[datetime] = None
    column_mapping: Dict[str, str] = {}  # {sheet_column: lead_field}
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Google OAuth Token Storage
class GoogleOAuthToken(BaseModel):
    token_id: str = Field(default_factory=lambda: f"gat_{uuid.uuid4().hex[:8]}")
    user_id: str
    access_token: str
    refresh_token: Optional[str] = None
    token_uri: str = "https://oauth2.googleapis.com/token"
    client_id: str
    client_secret: str
    expires_at: datetime
    scopes: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== CRM HELPER FUNCTIONS ====================

async def get_default_pre_sales_stages():
    """Get or create default Pre-Sales stages"""
    stages = await db.lead_stages.find({"stage_type": "pre_sales"}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Create default stages
        default_stages = [
            {"stage_id": "stg_new_lead", "name": "New Lead", "stage_type": "pre_sales", "order": 1, "color": "#6366f1", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_contacted", "name": "Contacted", "stage_type": "pre_sales", "order": 2, "color": "#3b82f6", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_proposal", "name": "Proposal", "stage_type": "pre_sales", "order": 3, "color": "#10b981", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_follow_up", "name": "Follow-up", "stage_type": "pre_sales", "order": 4, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_appointment", "name": "Appointment Booked", "stage_type": "pre_sales", "order": 5, "color": "#22c55e", "is_final": True, "is_active": True, "created_by": "system"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc)
            await db.lead_stages.insert_one(stage)
        stages = default_stages
    return stages


async def get_default_sales_stages():
    """Get or create default Sales stages"""
    stages = await db.lead_stages.find({"stage_type": "sales"}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Create default stages
        default_stages = [
            {"stage_id": "stg_new_appt", "name": "New Appointment", "stage_type": "sales", "order": 1, "color": "#6366f1", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_discussion", "name": "Discussion", "stage_type": "sales", "order": 2, "color": "#3b82f6", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_site_visit", "name": "Site Visit", "stage_type": "sales", "order": 3, "color": "#8b5cf6", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_re_requested", "name": "Rough Estimate Requested", "stage_type": "sales", "order": 4, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_re_shared", "name": "Rough Estimate Shared", "stage_type": "sales", "order": 5, "color": "#10b981", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_negotiation", "name": "Negotiation", "stage_type": "sales", "order": 6, "color": "#ec4899", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_deal_closed", "name": "Deal Closed", "stage_type": "sales", "order": 7, "color": "#22c55e", "is_final": True, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_lost", "name": "Lost", "stage_type": "sales", "order": 8, "color": "#ef4444", "is_final": True, "is_active": True, "created_by": "system"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc)
            await db.lead_stages.insert_one(stage)
        stages = default_stages
    return stages


async def get_default_custom_fields():
    """Get or create default custom fields for leads"""
    fields = await db.custom_fields.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)
    if not fields:
        # Create default custom fields
        default_fields = [
            {"field_id": "cf_budget", "name": "budget", "label": "Budget Range", "field_type": "dropdown", "required": False, "options": ["Under 50L", "50L - 1Cr", "1Cr - 2Cr", "2Cr - 5Cr", "Above 5Cr"], "order": 1, "is_active": True, "created_by": "system"},
            {"field_id": "cf_project_type", "name": "project_type", "label": "Project Type", "field_type": "dropdown", "required": False, "options": ["Residential", "Commercial", "Villa", "Apartment", "Office", "Industrial"], "order": 2, "is_active": True, "created_by": "system"},
            {"field_id": "cf_sqft", "name": "sqft", "label": "Square Feet", "field_type": "number", "required": False, "order": 3, "is_active": True, "created_by": "system"},
            {"field_id": "cf_timeline", "name": "timeline", "label": "Expected Timeline", "field_type": "dropdown", "required": False, "options": ["Immediate", "1-3 months", "3-6 months", "6-12 months", "1+ year"], "order": 4, "is_active": True, "created_by": "system"},
            {"field_id": "cf_requirement", "name": "requirement", "label": "Requirements", "field_type": "textarea", "required": False, "order": 5, "is_active": True, "created_by": "system"},
        ]
        for field in default_fields:
            field["created_at"] = datetime.now(timezone.utc)
            await db.custom_fields.insert_one(field)
        fields = default_fields
    return fields


# ==================== CRM A (PRE-SALES) ENDPOINTS ====================

@api_router.get("/crm/pre-sales/dashboard")
async def get_pre_sales_dashboard(user: User = Depends(get_current_user)):
    """Get Pre-Sales dashboard with stage counts"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    stages = await get_default_pre_sales_stages()
    
    # Get lead counts per stage
    pipeline = [
        {"$match": {"stage_type": "pre_sales"}},
        {"$group": {"_id": "$current_stage_id", "count": {"$sum": 1}}}
    ]
    stage_counts = await db.leads.aggregate(pipeline).to_list(100)
    count_map = {s["_id"]: s["count"] for s in stage_counts}
    
    # Get recent leads
    recent_leads = await db.leads.find(
        {"stage_type": "pre_sales"}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Get source breakdown
    source_pipeline = [
        {"$match": {"stage_type": "pre_sales"}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]
    source_counts = await db.leads.aggregate(source_pipeline).to_list(20)
    
    total_leads = await db.leads.count_documents({"stage_type": "pre_sales"})
    
    return {
        "stages": [
            {**stage, "lead_count": count_map.get(stage["stage_id"], 0)}
            for stage in stages
        ],
        "total_leads": total_leads,
        "recent_leads": recent_leads,
        "source_breakdown": {s["_id"]: s["count"] for s in source_counts}
    }


@api_router.get("/crm/pre-sales/leads")
async def get_pre_sales_leads(
    stage_id: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Pre-Sales leads with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    query = {"stage_type": "pre_sales"}
    
    if stage_id:
        query["current_stage_id"] = stage_id
    if source:
        query["source"] = source
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    if date_from:
        query["created_at"] = {"$gte": datetime.fromisoformat(date_from.replace('Z', '+00:00'))}
    if date_to:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(date_to.replace('Z', '+00:00'))}
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return leads


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: LeadSource = LeadSource.OTHER
    source_detail: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    custom_fields: Dict[str, Any] = {}
    notes: Optional[str] = None
    tags: List[str] = []


@api_router.post("/crm/pre-sales/leads")
async def create_pre_sales_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new Pre-Sales lead"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    # Get default first stage
    stages = await get_default_pre_sales_stages()
    first_stage = stages[0] if stages else {"stage_id": "stg_new_lead"}
    
    lead = Lead(
        name=data.name,
        email=data.email,
        phone=data.phone,
        source=data.source,
        source_detail=data.source_detail,
        current_stage_id=first_stage["stage_id"],
        stage_type=LeadStageType.PRE_SALES,
        stage_history=[{
            "stage_id": first_stage["stage_id"],
            "moved_at": datetime.now(timezone.utc).isoformat(),
            "moved_by": user.user_id
        }],
        address=data.address,
        city=data.city,
        state=data.state,
        pincode=data.pincode,
        latitude=data.latitude,
        longitude=data.longitude,
        custom_fields=data.custom_fields,
        notes=data.notes,
        tags=data.tags,
        created_by=user.user_id
    )
    
    lead_dict = lead.model_dump()
    await db.leads.insert_one(lead_dict)
    
    return {"message": "Lead created", "lead_id": lead.lead_id}


class LeadStageUpdate(BaseModel):
    stage_id: str
    advance_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None


@api_router.patch("/crm/leads/{lead_id}/stage")
async def update_lead_stage(lead_id: str, data: LeadStageUpdate, user: User = Depends(get_current_user)):
    """Move lead to a new stage (Kanban drag & drop)"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check role based on stage type
    if lead["stage_type"] == "pre_sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    if lead["stage_type"] == "sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    # Get the target stage
    stage = await db.lead_stages.find_one({"stage_id": data.stage_id}, {"_id": 0})
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    old_stage_id = lead["current_stage_id"]
    
    # Update lead
    stage_history = lead.get("stage_history", [])
    stage_history.append({
        "stage_id": data.stage_id,
        "from_stage_id": old_stage_id,
        "moved_at": datetime.now(timezone.utc).isoformat(),
        "moved_by": user.user_id
    })
    
    update = {
        "current_stage_id": data.stage_id,
        "stage_history": stage_history,
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update})
    
    # Check for special stage triggers
    result = {"message": "Lead stage updated", "new_stage": stage["name"]}
    
    # TRIGGER: Pre-Sales "Appointment Booked" -> Transfer to CRM B
    if lead["stage_type"] == "pre_sales" and stage.get("is_final") and stage["name"] == "Appointment Booked":
        # Auto-transfer to Sales
        sales_stages = await get_default_sales_stages()
        first_sales_stage = sales_stages[0] if sales_stages else {"stage_id": "stg_new_appt"}
        
        new_lead = Lead(
            name=lead["name"],
            email=lead.get("email"),
            phone=lead.get("phone"),
            source=lead["source"],
            source_detail=lead.get("source_detail"),
            current_stage_id=first_sales_stage["stage_id"],
            stage_type=LeadStageType.SALES,
            stage_history=[{
                "stage_id": first_sales_stage["stage_id"],
                "moved_at": datetime.now(timezone.utc).isoformat(),
                "moved_by": user.user_id,
                "action": "transferred_from_pre_sales"
            }],
            address=lead.get("address"),
            city=lead.get("city"),
            state=lead.get("state"),
            pincode=lead.get("pincode"),
            latitude=lead.get("latitude"),
            longitude=lead.get("longitude"),
            custom_fields=lead.get("custom_fields", {}),
            transferred_from_lead_id=lead_id,
            transferred_at=datetime.now(timezone.utc),
            notes=lead.get("notes"),
            tags=lead.get("tags", []),
            created_by=user.user_id
        )
        
        new_lead_dict = new_lead.model_dump()
        await db.leads.insert_one(new_lead_dict)
        
        # Update original lead with transfer info
        await db.leads.update_one(
            {"lead_id": lead_id},
            {"$set": {"transferred_to_lead_id": new_lead.lead_id, "transferred_at": datetime.now(timezone.utc)}}
        )
        
        result["transferred_to_sales"] = True
        result["new_lead_id"] = new_lead.lead_id
        
        # Notify Sales team
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": "all_sales",
            "title": "New Sales Lead",
            "message": f"Lead '{lead['name']}' transferred from Pre-Sales (Appointment Booked)",
            "type": "lead_transfer",
            "reference_id": new_lead.lead_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.notifications.insert_one(notification)
    
    # TRIGGER: Sales "Rough Estimate Requested" -> Create RE Project
    if lead["stage_type"] == "sales" and stage["name"] == "Rough Estimate Requested":
        # Create RE Project
        re_project = REProject(
            lead_id=lead_id,
            client_name=lead["name"],
            client_email=lead.get("email"),
            client_phone=lead.get("phone"),
            project_name=f"RE - {lead['name']}",
            location=lead.get("address"),
            sqft=lead.get("custom_fields", {}).get("sqft"),
            building_type=lead.get("custom_fields", {}).get("project_type"),
            status=REProjectStatus.RE_REQUESTED,
            created_by=user.user_id
        )
        
        re_dict = re_project.model_dump()
        await db.re_projects.insert_one(re_dict)
        
        # Link RE project to lead
        await db.leads.update_one({"lead_id": lead_id}, {"$set": {"re_project_id": re_project.re_project_id}})
        
        result["re_project_created"] = True
        result["re_project_id"] = re_project.re_project_id
        
        # Notify Planning Department
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": "all_planning",
            "title": "New Rough Estimate Request",
            "message": f"Rough Estimate requested for lead '{lead['name']}'",
            "type": "re_request",
            "reference_id": re_project.re_project_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.notifications.insert_one(notification)
    
    # TRIGGER: Sales "Deal Closed" -> Convert RE Project to Main Project
    if lead["stage_type"] == "sales" and stage["name"] == "Deal Closed":
        re_project_id = lead.get("re_project_id")
        if re_project_id:
            re_project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
            if re_project and re_project.get("status") == "re_approved":
                # Create main project from RE
                project_count = await db.projects.count_documents({}) + 1
                project_code = f"USB{str(project_count).zfill(2)}{datetime.now().strftime('%m%y')}"
                
                now = datetime.now(timezone.utc)
                expected_completion = now + timedelta(days=365)  # Default 1 year
                
                main_project = {
                    "project_id": f"proj_{uuid.uuid4().hex[:12]}",
                    "project_code": project_code,
                    "name": re_project.get("project_name", f"Project - {lead['name']}"),
                    "client_name": lead["name"],
                    "client_email": lead.get("email"),
                    "client_phone": lead.get("phone"),
                    "location": re_project.get("location") or "",
                    "sqft": re_project.get("sqft") or 0,
                    "building_type": re_project.get("building_type") or "residential",
                    # Financial
                    "total_value": re_project.get("estimated_total", 0),
                    "advance_amount": data.advance_amount or 0,
                    "advance_payment_mode": data.payment_mode,
                    "advance_payment_reference": data.payment_reference,
                    "advance_received_at": now if data.advance_amount else None,
                    "additional_cost": 0,
                    "income_project": data.advance_amount or 0,  # Advance counts as income
                    "income_additional": 0,
                    "total_expense": 0,
                    # Stage
                    "current_stage": "yet_to_start",
                    "stage_history": [],
                    "materials_locked": False,
                    # Dates
                    "start_date": now,
                    "expected_completion": expected_completion,
                    # Status - Set to 'planning' so Planning can add BOQ
                    "status": "planning",
                    # Links
                    "re_project_id": re_project_id,
                    "lead_id": lead_id,
                    # Workflow
                    "created_by": user.user_id,
                    "created_at": now
                }
                
                await db.projects.insert_one(main_project)
                
                # Update RE Project
                await db.re_projects.update_one(
                    {"re_project_id": re_project_id},
                    {"$set": {
                        "status": "converted",
                        "converted_project_id": main_project["project_id"],
                        "converted_at": now,
                        "converted_by": user.user_id,
                        "advance_collected": data.advance_amount or 0
                    }}
                )
                
                result["project_created"] = True
                result["advance_collected"] = data.advance_amount or 0
                result["project_id"] = main_project["project_id"]
                result["project_code"] = project_code
                
                # Notify CRE and Planning
                for target in ["all_cro", "all_planning"]:
                    notification = {
                        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                        "user_id": target,
                        "title": "New Project Created from CRM",
                        "message": f"Deal closed! Project '{main_project['name']}' (₹{re_project.get('estimated_total', 0):,.0f}) ready for setup",
                        "type": "project_created",
                        "reference_id": main_project["project_id"],
                        "is_read": False,
                        "created_at": now
                    }
                    await db.notifications.insert_one(notification)
    
    return result


# ==================== CRM LEAD DETAILS & INTERACTIONS ====================

class LeadRemarkInput(BaseModel):
    remark: str
    remark_type: Optional[str] = "general"


class LeadFollowUpInput(BaseModel):
    scheduled_date: str
    note: Optional[str] = None


class LeadUpdateInput(BaseModel):
    summary: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None


@api_router.get("/crm/leads/{lead_id}")
async def get_lead_detail(lead_id: str, user: User = Depends(get_current_user)):
    """Get detailed lead info including remarks and follow-ups"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Role-based access check
    if lead["stage_type"] == "pre_sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    if lead["stage_type"] == "sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    return lead


@api_router.patch("/crm/leads/{lead_id}")
async def update_lead(lead_id: str, data: LeadUpdateInput, user: User = Depends(get_current_user)):
    """Update lead fields including summary"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Role-based access check
    if lead["stage_type"] == "pre_sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    if lead["stage_type"] == "sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update_data})
    
    return {"message": "Lead updated successfully"}


@api_router.post("/crm/leads/{lead_id}/remarks")
async def add_lead_remark(lead_id: str, data: LeadRemarkInput, user: User = Depends(get_current_user)):
    """Add a remark/note to a lead"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Role-based access check
    if lead["stage_type"] == "pre_sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    if lead["stage_type"] == "sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    # Get user name for display
    user_info = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    user_name = user_info.get("name", "User") if user_info else "User"
    
    remark = {
        "remark_id": f"rem_{uuid.uuid4().hex[:8]}",
        "text": data.remark,
        "remark_type": data.remark_type,
        "added_by": user.user_id,
        "added_by_name": user_name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {
            "$push": {"remarks": remark},
            "$set": {"updated_at": datetime.now(timezone.utc), "last_contacted": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Remark added successfully", "remark": remark}


@api_router.post("/crm/leads/{lead_id}/follow-ups")
async def schedule_follow_up(lead_id: str, data: LeadFollowUpInput, user: User = Depends(get_current_user)):
    """Schedule a follow-up for a lead"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Role-based access check
    if lead["stage_type"] == "pre_sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    if lead["stage_type"] == "sales" and user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    follow_up = {
        "follow_up_id": f"fu_{uuid.uuid4().hex[:8]}",
        "scheduled_date": data.scheduled_date,
        "note": data.note,
        "completed": False,
        "completed_at": None,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {
            "$push": {"follow_ups": follow_up},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Follow-up scheduled", "follow_up": follow_up}


@api_router.patch("/crm/leads/{lead_id}/follow-ups/{follow_up_id}/complete")
async def complete_follow_up(lead_id: str, follow_up_id: str, user: User = Depends(get_current_user)):
    """Mark a follow-up as completed"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Update the specific follow-up
    result = await db.leads.update_one(
        {"lead_id": lead_id, "follow_ups.follow_up_id": follow_up_id},
        {
            "$set": {
                "follow_ups.$.completed": True,
                "follow_ups.$.completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    
    return {"message": "Follow-up marked as completed"}


# ==================== CRM B (SALES) ENDPOINTS ====================

@api_router.get("/crm/sales/dashboard")
async def get_sales_dashboard(user: User = Depends(get_current_user)):
    """Get Sales dashboard with stage counts"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    stages = await get_default_sales_stages()
    
    # Get lead counts per stage
    pipeline = [
        {"$match": {"stage_type": "sales"}},
        {"$group": {"_id": "$current_stage_id", "count": {"$sum": 1}}}
    ]
    stage_counts = await db.leads.aggregate(pipeline).to_list(100)
    count_map = {s["_id"]: s["count"] for s in stage_counts}
    
    # Get recent leads
    recent_leads = await db.leads.find(
        {"stage_type": "sales"}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    total_leads = await db.leads.count_documents({"stage_type": "sales"})
    
    # Get RE project stats
    re_stats = {
        "requested": await db.re_projects.count_documents({"status": "re_requested"}),
        "in_progress": await db.re_projects.count_documents({"status": "re_in_progress"}),
        "approved": await db.re_projects.count_documents({"status": "re_approved"}),
        "converted": await db.re_projects.count_documents({"status": "converted"})
    }
    
    return {
        "stages": [
            {**stage, "lead_count": count_map.get(stage["stage_id"], 0)}
            for stage in stages
        ],
        "total_leads": total_leads,
        "recent_leads": recent_leads,
        "re_stats": re_stats
    }


@api_router.get("/crm/sales/leads")
async def get_sales_leads(
    stage_id: Optional[str] = None,
    search: Optional[str] = None,
    has_re_project: Optional[bool] = None,
    user: User = Depends(get_current_user)
):
    """Get Sales leads with filters"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    query = {"stage_type": "sales"}
    
    if stage_id:
        query["current_stage_id"] = stage_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    if has_re_project is not None:
        if has_re_project:
            query["re_project_id"] = {"$ne": None}
        else:
            query["re_project_id"] = None
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return leads


# ==================== LEAD STAGES MANAGEMENT ====================

@api_router.get("/crm/stages")
async def get_all_stages(stage_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all lead stages"""
    query = {"is_active": True}
    if stage_type:
        query["stage_type"] = stage_type
    
    stages = await db.lead_stages.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    
    # Initialize defaults if empty
    if not stages or len(stages) == 0:
        await get_default_pre_sales_stages()
        await get_default_sales_stages()
        stages = await db.lead_stages.find(query, {"_id": 0}).sort("order", 1).to_list(100)
    
    return stages


class StageCreate(BaseModel):
    name: str
    stage_type: LeadStageType
    color: str = "#6366f1"
    order: Optional[int] = None


@api_router.post("/crm/stages")
async def create_stage(data: StageCreate, user: User = Depends(get_current_user)):
    """Create a new lead stage"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales", "sales"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get max order for this stage type
    max_order_stage = await db.lead_stages.find_one(
        {"stage_type": data.stage_type.value},
        sort=[("order", -1)]
    )
    next_order = (max_order_stage.get("order", 0) + 1) if max_order_stage else 1
    
    stage = LeadStage(
        name=data.name,
        stage_type=data.stage_type,
        color=data.color,
        order=data.order or next_order,
        created_by=user.user_id
    )
    
    stage_dict = stage.model_dump()
    await db.lead_stages.insert_one(stage_dict)
    
    return {"message": "Stage created", "stage_id": stage.stage_id}


class StageUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_final: Optional[bool] = None


@api_router.patch("/crm/stages/{stage_id}")
async def update_stage(stage_id: str, data: StageUpdate, user: User = Depends(get_current_user)):
    """Update a lead stage"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update = {"updated_at": datetime.now(timezone.utc)}
    if data.name is not None:
        update["name"] = data.name
    if data.color is not None:
        update["color"] = data.color
    if data.order is not None:
        update["order"] = data.order
    if data.is_final is not None:
        update["is_final"] = data.is_final
    
    await db.lead_stages.update_one({"stage_id": stage_id}, {"$set": update})
    return {"message": "Stage updated"}


@api_router.delete("/crm/stages/{stage_id}")
async def delete_stage(stage_id: str, user: User = Depends(get_current_user)):
    """Delete a lead stage (soft delete)"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete stages")
    
    # Check if any leads are in this stage
    leads_in_stage = await db.leads.count_documents({"current_stage_id": stage_id})
    if leads_in_stage > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete stage with {leads_in_stage} leads")
    
    await db.lead_stages.update_one({"stage_id": stage_id}, {"$set": {"is_active": False}})
    return {"message": "Stage deleted"}


# ==================== CUSTOM FIELDS MANAGEMENT ====================

@api_router.get("/crm/custom-fields")
async def get_custom_fields(user: User = Depends(get_current_user)):
    """Get all custom fields"""
    fields = await db.custom_fields.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)
    
    if not fields:
        fields = await get_default_custom_fields()
    
    return fields


class CustomFieldCreate(BaseModel):
    name: str
    label: str
    field_type: CustomFieldType
    required: bool = False
    options: List[str] = []
    placeholder: Optional[str] = None
    default_value: Optional[Any] = None
    order: Optional[int] = None
    is_conditional: bool = False
    condition_field: Optional[str] = None
    condition_value: Optional[Any] = None


@api_router.post("/crm/custom-fields")
async def create_custom_field(data: CustomFieldCreate, user: User = Depends(get_current_user)):
    """Create a new custom field"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check for duplicate name
    existing = await db.custom_fields.find_one({"name": data.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Field name already exists")
    
    # Get max order
    max_order_field = await db.custom_fields.find_one(sort=[("order", -1)])
    next_order = (max_order_field.get("order", 0) + 1) if max_order_field else 1
    
    field = CustomFieldDefinition(
        name=data.name,
        label=data.label,
        field_type=data.field_type,
        required=data.required,
        options=data.options,
        placeholder=data.placeholder,
        default_value=data.default_value,
        order=data.order or next_order,
        is_conditional=data.is_conditional,
        condition_field=data.condition_field,
        condition_value=data.condition_value
    )
    
    field_dict = field.model_dump()
    field_dict["is_active"] = True
    field_dict["created_by"] = user.user_id
    field_dict["created_at"] = datetime.now(timezone.utc)
    
    await db.custom_fields.insert_one(field_dict)
    
    return {"message": "Custom field created", "field_id": field.field_id}


@api_router.patch("/crm/custom-fields/{field_id}")
async def update_custom_field(field_id: str, data: CustomFieldCreate, user: User = Depends(get_current_user)):
    """Update a custom field"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update = {
        "label": data.label,
        "field_type": data.field_type.value,
        "required": data.required,
        "options": data.options,
        "placeholder": data.placeholder,
        "default_value": data.default_value,
        "is_conditional": data.is_conditional,
        "condition_field": data.condition_field,
        "condition_value": data.condition_value,
        "updated_at": datetime.now(timezone.utc)
    }
    if data.order is not None:
        update["order"] = data.order
    
    await db.custom_fields.update_one({"field_id": field_id}, {"$set": update})
    return {"message": "Custom field updated"}


@api_router.delete("/crm/custom-fields/{field_id}")
async def delete_custom_field(field_id: str, user: User = Depends(get_current_user)):
    """Delete a custom field (soft delete)"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete fields")
    
    await db.custom_fields.update_one({"field_id": field_id}, {"$set": {"is_active": False}})
    return {"message": "Custom field deleted"}


# ==================== CSV IMPORT ENDPOINTS ====================

@api_router.get("/crm/import/template")
async def get_import_template(user: User = Depends(get_current_user)):
    """Get CSV import template columns"""
    standard_columns = ["name", "email", "phone", "source", "address", "city", "state", "pincode", "notes"]
    custom_fields = await db.custom_fields.find({"is_active": True}, {"_id": 0, "name": 1, "label": 1}).to_list(100)
    
    return {
        "standard_columns": standard_columns,
        "custom_field_columns": [f["name"] for f in custom_fields],
        "source_options": [s.value for s in LeadSource]
    }


class CSVImportData(BaseModel):
    leads: List[Dict[str, Any]]
    column_mapping: Dict[str, str]  # {csv_column: lead_field}
    source: LeadSource = LeadSource.CSV_IMPORT


@api_router.post("/crm/import/csv")
async def import_csv_leads(data: CSVImportData, user: User = Depends(get_current_user)):
    """Import leads from CSV data"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get first stage
    stages = await get_default_pre_sales_stages()
    first_stage = stages[0] if stages else {"stage_id": "stg_new_lead"}
    
    import_batch_id = f"import_{uuid.uuid4().hex[:12]}"
    imported_count = 0
    errors = []
    
    for idx, row in enumerate(data.leads):
        try:
            # Map columns to lead fields
            lead_data = {"custom_fields": {}}
            for csv_col, lead_field in data.column_mapping.items():
                value = row.get(csv_col)
                if value:
                    if lead_field.startswith("cf_") or lead_field in ["budget", "project_type", "sqft", "timeline", "requirement"]:
                        lead_data["custom_fields"][lead_field] = value
                    else:
                        lead_data[lead_field] = value
            
            # Create lead
            lead = Lead(
                name=lead_data.get("name", f"Lead {idx + 1}"),
                email=lead_data.get("email"),
                phone=lead_data.get("phone"),
                source=data.source,
                source_detail="CSV Import",
                current_stage_id=first_stage["stage_id"],
                stage_type=LeadStageType.PRE_SALES,
                stage_history=[{
                    "stage_id": first_stage["stage_id"],
                    "moved_at": datetime.now(timezone.utc).isoformat(),
                    "moved_by": user.user_id,
                    "action": "csv_import"
                }],
                address=lead_data.get("address"),
                city=lead_data.get("city"),
                state=lead_data.get("state"),
                pincode=lead_data.get("pincode"),
                custom_fields=lead_data.get("custom_fields", {}),
                notes=lead_data.get("notes"),
                import_batch_id=import_batch_id,
                created_by=user.user_id
            )
            
            await db.leads.insert_one(lead.model_dump())
            imported_count += 1
            
        except Exception as e:
            errors.append({"row": idx + 1, "error": str(e)})
    
    return {
        "message": f"Imported {imported_count} leads",
        "import_batch_id": import_batch_id,
        "imported_count": imported_count,
        "error_count": len(errors),
        "errors": errors[:10]  # Return first 10 errors
    }


# ==================== RE PROJECT ENDPOINTS ====================

@api_router.get("/crm/re-projects")
async def get_re_projects(
    status: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get all RE projects"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    if status:
        query["status"] = status
    
    projects = await db.re_projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return projects


@api_router.get("/crm/re-projects/{re_project_id}")
async def get_re_project(re_project_id: str, user: User = Depends(get_current_user)):
    """Get RE project details"""
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    # Get linked lead
    lead = await db.leads.find_one({"lead_id": project["lead_id"]}, {"_id": 0})
    
    return {**project, "lead": lead}


class REProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: Optional[str] = None
    rough_scope_items: Optional[List[Dict[str, Any]]] = None
    handover_months: Optional[int] = None
    estimated_total: Optional[float] = None
    planning_notes: Optional[str] = None


@api_router.patch("/crm/re-projects/{re_project_id}")
async def update_re_project(re_project_id: str, data: REProjectUpdate, user: User = Depends(get_current_user)):
    """Update RE project (Planning Department)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Planning access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    update = {"updated_at": datetime.now(timezone.utc)}
    
    if data.project_name is not None:
        update["project_name"] = data.project_name
    if data.location is not None:
        update["location"] = data.location
    if data.sqft is not None:
        update["sqft"] = data.sqft
    if data.building_type is not None:
        update["building_type"] = data.building_type
    if data.rough_scope_items is not None:
        update["rough_scope_items"] = data.rough_scope_items
        # Calculate total from scope items
        scope_total = sum(item.get("total", 0) for item in data.rough_scope_items)
        update["estimated_total"] = scope_total
    if data.handover_months is not None:
        update["handover_months"] = data.handover_months
    if data.estimated_total is not None:
        update["estimated_total"] = data.estimated_total
    if data.planning_notes is not None:
        update["planning_notes"] = data.planning_notes
    
    # Set status to in progress if it was requested
    if project["status"] == "re_requested":
        update["status"] = "re_in_progress"
        update["prepared_by"] = user.user_id
        update["prepared_at"] = datetime.now(timezone.utc)
    
    await db.re_projects.update_one({"re_project_id": re_project_id}, {"$set": update})
    
    return {"message": "RE Project updated"}


@api_router.post("/crm/re-projects/{re_project_id}/submit-for-approval")
async def submit_re_for_approval(re_project_id: str, user: User = Depends(get_current_user)):
    """Submit RE project for GM approval"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Planning access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    if project["status"] not in ["re_requested", "re_in_progress"]:
        raise HTTPException(status_code=400, detail="Project not in valid state for submission")
    
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "status": "re_submitted",
            "submitted_for_approval": True,
            "submitted_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Notify GM
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_gm",
        "title": "RE Approval Required",
        "message": f"Rough Estimate for '{project.get('project_name', project['client_name'])}' needs approval",
        "type": "re_approval",
        "reference_id": re_project_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Submitted for GM approval"}


class REApproval(BaseModel):
    approved: bool
    rejection_reason: Optional[str] = None


@api_router.patch("/crm/re-projects/{re_project_id}/approve")
async def approve_re_project(re_project_id: str, data: REApproval, user: User = Depends(get_current_user)):
    """Approve or reject RE project (GM/Super Admin)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="GM or Super Admin access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    if project["status"] not in ["re_submitted", "re_in_progress", "re_awaiting_approval"]:
        raise HTTPException(status_code=400, detail="Project not in submitted/in-progress state")
    
    if data.approved:
        update = {
            "status": "re_approved",
            "gm_approved_by": user.user_id,
            "gm_approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        # Update linked lead stage to "Rough Estimate Shared"
        if project.get("lead_id"):
            re_shared_stage = await db.lead_stages.find_one({"name": "Rough Estimate Shared", "stage_type": "sales"})
            if re_shared_stage:
                await db.leads.update_one(
                    {"lead_id": project["lead_id"]},
                    {"$set": {"current_stage_id": re_shared_stage["stage_id"], "updated_at": datetime.now(timezone.utc)}}
                )
        
        # Notify Sales
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": "all_sales",
            "title": "RE Approved",
            "message": f"Rough Estimate for '{project.get('project_name', project['client_name'])}' has been approved",
            "type": "re_approved",
            "reference_id": re_project_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.notifications.insert_one(notification)
    else:
        update = {
            "status": "re_rejected",
            "gm_rejection_reason": data.rejection_reason,
            "gm_approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
    
    await db.re_projects.update_one({"re_project_id": re_project_id}, {"$set": update})
    
    return {"message": "RE Project " + ("approved" if data.approved else "rejected")}


# ==================== PLANNING RE DASHBOARD ====================

@api_router.get("/crm/planning/re-dashboard")
async def get_planning_re_dashboard(user: User = Depends(get_current_user)):
    """Get Planning Department RE dashboard"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Planning access required")
    
    # Get RE project counts by status
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = await db.re_projects.aggregate(pipeline).to_list(20)
    
    # Get new RE requests (requested status)
    new_requests = await db.re_projects.find(
        {"status": "re_requested"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    # Get in-progress RE projects
    in_progress = await db.re_projects.find(
        {"status": "re_in_progress"},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    
    return {
        "status_counts": {s["_id"]: s["count"] for s in status_counts},
        "new_requests": new_requests,
        "in_progress": in_progress,
        "total_pending": len(new_requests) + len(in_progress)
    }


# ==================== END CRM MODULE ENDPOINTS ====================


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
