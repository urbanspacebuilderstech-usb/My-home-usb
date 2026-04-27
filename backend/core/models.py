"""
All Pydantic models and enums for ConstructionOS
Extracted from server.py monolith for modular architecture
"""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime, timezone
import uuid

class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    GENERAL_MANAGER = "general_manager"
    CRE = "cre"  # Client Relationship Officer
    ACCOUNTANT = "accountant"
    PROJECT_MANAGER = "project_manager"
    ASSOCIATE_PM = "associate_pm"  # Associate Project Manager
    SR_SITE_ENGINEER = "sr_site_engineer"  # Senior Site Engineer
    PLANNING = "planning"
    PROCUREMENT = "procurement"
    SITE_ENGINEER = "site_engineer"
    VENDOR = "vendor"
    CLIENT = "client"
    PRE_SALES = "pre_sales"  # CRM Pre-Sales
    SALES = "sales"  # CRM Sales
    MARKETING_HEAD = "marketing_head"  # Marketing Head
    ARCHITECT = "architect"  # Architect / Design Team
    HR = "hr"  # Human Resources


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
    indirect_cost_percent: float = 20.0  # Configurable indirect cost % (default 20%)
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
    # Vendor type / category
    vendor_type: Optional[str] = None
    # Bank / Account details
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    # Brands per material category
    brands: List[Dict[str, Any]] = []  # [{category: str, brand_names: [str]}]
    # Payment
    payment_cycle: Optional[str] = None  # immediate, 15_days, 30_days, 45_days, 60_days, 90_days
    # GST
    gst_number: Optional[str] = None
    gst_type: Optional[str] = None  # regular, composition, unregistered
    # Existing fields
    materials_supplied: List[str] = []
    payment_terms: str = "full"
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


class BOQWorkOrder(BaseModel):
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


class BOQWorkOrderCreate(BaseModel):
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
    workflow_status: str = "approved"  # No approval needed - directly approved
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
    workflow_status: str = "approved"  # No approval needed - directly approved
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
    workflow_status: str = "approved"  # No approval needed - directly approved
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
    workflow_status: str = "approved"  # No approval needed - directly approved
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
    MARKETING = "marketing"
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
    # CRE workflow — cheque must be "opened" by CRE before Accountant can deposit/clear
    is_opened: bool = False
    opened_by: Optional[str] = None
    opened_by_name: Optional[str] = None
    opened_at: Optional[datetime] = None
    opened_remarks: Optional[str] = None
    # Accountant → CRE "request to open" workflow
    open_requested: bool = False
    open_requested_by: Optional[str] = None
    open_requested_by_name: Optional[str] = None
    open_requested_at: Optional[datetime] = None
    open_requested_remarks: Optional[str] = None
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
