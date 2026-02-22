"""Enums and constants used across the application"""
from enum import Enum


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    GENERAL_MANAGER = "general_manager"
    CRE = "cre"
    ACCOUNTANT = "accountant"
    PROJECT_MANAGER = "project_manager"
    PLANNING = "planning"
    PROCUREMENT = "procurement"
    SITE_ENGINEER = "site_engineer"
    PRE_SALES = "pre_sales"
    SALES = "sales"
    VENDOR = "vendor"
    CLIENT = "client"


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    PENDING_PAYMENT = "pending_payment"
    PAYMENT_RECEIVED = "payment_received"
    IN_PLANNING = "in_planning"
    PLANNING_REVIEW = "planning_review"
    AWAITING_APPROVAL = "awaiting_approval"
    GM_APPROVED = "gm_approved"
    PLANNING_APPROVED = "planning_approved"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkOrderStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class BOQCategory(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"
    EQUIPMENT = "equipment"
    OVERHEAD = "overhead"


class ExpenseType(str, Enum):
    MATERIAL = "material"
    LABOUR = "labour"
    EQUIPMENT = "equipment"
    TRANSPORT = "transport"
    OTHER = "other"


class ExpenseStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"


class PaymentType(str, Enum):
    ADVANCE = "advance"
    PROGRESS = "progress"
    FINAL = "final"
    RETENTION = "retention"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    RECEIVED = "received"
    OVERDUE = "overdue"


class ProjectStage(str, Enum):
    YET_TO_START = "yet_to_start"
    DRAWING = "drawing"
    FOUNDATION = "foundation"
    BASEMENT = "basement"
    SS_BRICK_WORK = "ss_brick_work"
    SS_PLASTERING = "ss_plastering"
    FINISHING = "finishing"
    HANDOVER = "handover"


class PaymentMode(str, Enum):
    CASH = "cash"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"
    CARD = "card"


class LeadSource(str, Enum):
    WEBSITE = "website"
    REFERRAL = "referral"
    WALK_IN = "walk_in"
    SOCIAL_MEDIA = "social_media"
    GOOGLE_ADS = "google_ads"
    SEO = "seo"
    CSV_IMPORT = "csv_import"
    GOOGLE_SHEETS = "google_sheets"
    OTHER = "other"


class StageType(str, Enum):
    PRE_SALES = "pre_sales"
    SALES = "sales"


# Project stage list for UI
PROJECT_STAGES = [
    "drawing", "yet_to_start", "foundation", "basement",
    "ss_brick_work", "ss_plastering", "finishing", "handover"
]
