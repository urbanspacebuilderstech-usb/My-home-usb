"""
CRM Routes - Pre-Sales, Sales, Leads, Stages, Custom Fields, RE Projects, Marketing, Google Sheets
Migrated from server.py monolith
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import asyncio
import logging

# Per-user/per-key timestamp cache for throttling expensive once-per-minute jobs
# (e.g. auto-followup scans). In-memory; resets on backend restart.
_DASHBOARD_SCAN_CACHE: Dict[str, float] = {}
import os
import json
import re

from core.database import db, fs
from bson import ObjectId as _ObjectId
from core.deps import get_current_user, create_notification, create_audit_log
from core.models import UserRole, User
from core.contact_visibility import filter_contacts_re_projects, filter_contacts_leads, strip_contact_fields, PRIVILEGED_ROLES
from security import InputValidator

logger = logging.getLogger(__name__)

router = APIRouter()


def mask_phone(phone: str) -> str:
    """Mask phone number: show first 2 and last 2 digits"""
    if not phone or len(phone) < 5:
        return phone or ""
    return phone[:2] + "*" * (len(phone) - 4) + phone[-2:]


def mask_leads_phone(leads: list, user_role: str) -> list:
    """Mask phone numbers for non-sales/pre-sales users"""
    if user_role in [UserRole.SUPER_ADMIN, "sales", "pre_sales", "cre"]:
        return leads
    for lead in leads:
        if lead.get("phone"):
            lead["phone"] = mask_phone(lead["phone"])
    return leads


async def get_next_re_number():
    """Generate next sequential RE number like USB-RE0001"""
    result = await db.counters.find_one_and_update(
        {"_id": "re_number"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = result["seq"]
    return f"USB-RE{seq:04d}"



# ==================== CRM MODULE ENUMS & MODELS ====================

class LeadSource(str, Enum):
    META = "meta"
    SEO = "seo"
    SEM = "sem"
    OTHER = "other"
    REFERRAL = "referral"
    WALK_IN = "walk_in"
    WEBSITE = "website"
    CSV_IMPORT = "csv_import"
    GOOGLE_SHEETS = "google_sheets"
    SOCIAL_MEDIA = "social_media"
    DIRECT = "direct"


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
    SENT_TO_CLIENT = "sent_to_client"
    CLIENT_FEEDBACK = "client_feedback"
    CLIENT_APPROVED = "client_approved"
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
    alternative_phone: Optional[str] = None
    source: str = "other"
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
    
    # RE Number & Revision
    re_number: Optional[str] = None  # USB-RE0001, USB-RE0002, ...
    revision: int = 0  # 0 = original, 1, 2, ... = revisions
    parent_re_number: Optional[str] = None  # Groups all revisions together
    
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
    
    # Client Interaction (Sales)
    sent_to_client_by: Optional[str] = None
    sent_to_client_at: Optional[datetime] = None
    client_feedback_notes: Optional[str] = None
    client_feedback_by: Optional[str] = None
    client_feedback_at: Optional[datetime] = None
    client_approved_by: Optional[str] = None
    client_approved_at: Optional[datetime] = None
    
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
    """Get or create default Pre-Sales stages - also fills missing stages"""
    stages = await db.lead_stages.find({"stage_type": "pre_sales"}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Create all default stages (Portfolio sent removed Apr 2026)
        default_stages = [
            {"stage_id": "stg_new_lead", "name": "New Lead", "stage_type": "pre_sales", "order": 1, "color": "#6366f1", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_rnr", "name": "RNR", "stage_type": "pre_sales", "order": 2, "color": "#ef4444", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_new_rnr", "name": "New RNR Leads", "stage_type": "pre_sales", "order": 3, "color": "#dc2626", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_follow_up", "name": "Follow-up", "stage_type": "pre_sales", "order": 4, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_package_send", "name": "Package Details Send", "stage_type": "pre_sales", "order": 5, "color": "#a855f7", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_appointment", "name": "Appointment Booked", "stage_type": "pre_sales", "order": 6, "color": "#22c55e", "is_final": True, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_office_visit", "name": "Office Visit", "stage_type": "pre_sales", "order": 7, "color": "#0ea5e9", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_pre_lost", "name": "Lost", "stage_type": "pre_sales", "order": 8, "color": "#6b7280", "is_final": False, "is_active": True, "created_by": "system"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc)
            await db.lead_stages.insert_one(stage)
        stages = default_stages
    else:
        # Retire Portfolio-sent stage (Apr 2026) + migrate any live leads to Follow-up.
        await db.lead_stages.update_one(
            {"stage_id": "stg_proposal", "stage_type": "pre_sales"},
            {"$set": {"is_active": False, "order": 99}},
        )
        await db.leads.update_many(
            {"stage_type": "pre_sales", "current_stage_id": "stg_proposal"},
            {"$set": {"current_stage_id": "stg_follow_up", "updated_at": datetime.now(timezone.utc)}},
        )
        # Re-order live stages so Package Details Send sits before Appointment Booked
        reorder = [
            ("stg_new_lead", 1),
            ("stg_rnr", 2),
            ("stg_new_rnr", 3),
            ("stg_follow_up", 4),
            ("stg_package_send", 5),
            ("stg_appointment", 6),
            ("stg_office_visit", 7),
            ("stg_pre_lost", 8),
        ]
        for sid, order in reorder:
            await db.lead_stages.update_one({"stage_id": sid, "stage_type": "pre_sales"}, {"$set": {"order": order, "is_active": True}})
        # Check for missing stages and add them
        existing_ids = {s["stage_id"] for s in stages}
        missing = [
            {"stage_id": "stg_new_rnr", "name": "New RNR Leads", "stage_type": "pre_sales", "order": 3, "color": "#dc2626", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_follow_up", "name": "Follow-up", "stage_type": "pre_sales", "order": 4, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_package_send", "name": "Package Details Send", "stage_type": "pre_sales", "order": 5, "color": "#a855f7", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_office_visit", "name": "Office Visit", "stage_type": "pre_sales", "order": 7, "color": "#0ea5e9", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_pre_lost", "name": "Lost", "stage_type": "pre_sales", "order": 8, "color": "#6b7280", "is_final": False, "is_active": True, "created_by": "system"},
        ]
        for m in missing:
            if m["stage_id"] not in existing_ids:
                m["created_at"] = datetime.now(timezone.utc)
                await db.lead_stages.insert_one(m)
                stages.append(m)
        stages.sort(key=lambda x: x.get("order", 99))
    # Ensure Appointment Booked has is_final=True (critical for Pre-Sales → Sales transfer)
    await db.lead_stages.update_one(
        {"stage_id": "stg_appointment", "stage_type": "pre_sales"},
        {"$set": {"is_final": True}}
    )
    return stages


async def get_default_sales_stages():
    """Get or create default Sales stages"""
    now = datetime.now(timezone.utc)

    # Migrate leads from removed stages to their new target stage
    stage_migrations = {
        "stg_site_visit": "stg_discussion_legacy",  # placeholder — will cascade next
        "stg_discussion": "stg_sales_followup",
        "stg_sv_done": "stg_re_requested",
        "stg_deal_closed": "stg_payment_collect",
    }
    # Fix the placeholder (site_visit should go to followup too now that discussion is removed)
    stage_migrations["stg_site_visit"] = "stg_sales_followup"

    for removed_id, target_id in stage_migrations.items():
        await db.leads.update_many(
            {"current_stage_id": removed_id},
            {"$set": {"current_stage_id": target_id, "updated_at": now}}
        )
        await db.lead_stages.update_one(
            {"stage_id": removed_id, "stage_type": "sales"},
            {"$set": {"is_active": False}}
        )

    # Rename + re-order surviving stages.
    # IMPORTANT: stg_negotiation has been removed from the pipeline (Apr 2026).
    # Land Visit + Project Visit happen AFTER RE has been sent to client.
    stage_updates = [
        ("stg_new_appt",           "New Appointment",    1,  "#6366f1", False),
        ("stg_sales_office_visit", "Office Visit",       2,  "#0ea5e9", False),
        ("stg_sales_followup",     "Followup",           3,  "#f59e0b", False),
        ("stg_re_requested",       "RE - Request",       4,  "#f59e0b", False),
        ("stg_re_from_planning",   "RE - Planning",      5,  "#10b981", False),
        ("stg_re_to_client",       "RE - Client",        6,  "#84cc16", False),
        ("stg_sv_client_land",     "Client Land Visit",  7,  "#a855f7", False),
        ("stg_sv_our_projects",    "Our Projects Visit", 8,  "#7c3aed", False),
        ("stg_payment_collect",    "Deal Close",         9,  "#22c55e", False),
        ("stg_accountant_approval","Accountant Approval",10, "#f97316", False),  # hidden in UI
        ("stg_project_onboarded",  "Project Onboarded",  11, "#059669", True),
        ("stg_lost",               "Lost",               12, "#ef4444", True),
    ]
    for sid, name, order, color, is_final in stage_updates:
        await db.lead_stages.update_one(
            {"stage_id": sid, "stage_type": "sales"},
            {"$set": {"name": name, "order": order, "color": color, "is_final": is_final, "is_active": True}},
            upsert=True,
        )

    # Retire the Negotiation stage (kept as a soft-delete so historical leads still resolve a name)
    await db.lead_stages.update_one(
        {"stage_id": "stg_negotiation", "stage_type": "sales"},
        {"$set": {"is_active": False, "order": 99}},
    )
    # Migrate any live leads still parked on Negotiation → Deal Close
    await db.leads.update_many(
        {"current_stage_id": "stg_negotiation"},
        {"$set": {"current_stage_id": "stg_payment_collect", "updated_at": datetime.now(timezone.utc)}},
    )

    stages = await db.lead_stages.find({"stage_type": "sales", "is_active": {"$ne": False}}, {"_id": 0}).sort("order", 1).to_list(100)
    if not stages:
        # Create default stages
        default_stages = [
            {"stage_id": "stg_new_appt", "name": "New Appointment", "stage_type": "sales", "order": 1, "color": "#6366f1", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_sales_office_visit", "name": "Office Visit", "stage_type": "sales", "order": 2, "color": "#0ea5e9", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_sales_followup", "name": "Followup", "stage_type": "sales", "order": 3, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_re_requested", "name": "RE - Request", "stage_type": "sales", "order": 4, "color": "#f59e0b", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_re_from_planning", "name": "RE - Planning", "stage_type": "sales", "order": 5, "color": "#10b981", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_re_to_client", "name": "RE - Client", "stage_type": "sales", "order": 6, "color": "#84cc16", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_sv_client_land", "name": "Client Land Visit", "stage_type": "sales", "order": 7, "color": "#a855f7", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_sv_our_projects", "name": "Our Projects Visit", "stage_type": "sales", "order": 8, "color": "#7c3aed", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_payment_collect", "name": "Deal Close", "stage_type": "sales", "order": 9, "color": "#22c55e", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_accountant_approval", "name": "Accountant Approval", "stage_type": "sales", "order": 10, "color": "#f97316", "is_final": False, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_project_onboarded", "name": "Project Onboarded", "stage_type": "sales", "order": 11, "color": "#059669", "is_final": True, "is_active": True, "created_by": "system"},
            {"stage_id": "stg_lost", "name": "Lost", "stage_type": "sales", "order": 12, "color": "#ef4444", "is_final": True, "is_active": True, "created_by": "system"},
        ]
        for stage in default_stages:
            stage["created_at"] = datetime.now(timezone.utc)
            await db.lead_stages.insert_one(stage)
        stages = default_stages
    else:
        # Ensure "New Appointment" stage exists for Pre-Sales → Sales transfer
        existing_ids = {s["stage_id"] for s in stages}
        if "stg_new_appt" not in existing_ids:
            new_appt = {"stage_id": "stg_new_appt", "name": "New Appointment", "stage_type": "sales", "order": 1, "color": "#6366f1", "is_final": False, "is_active": True, "created_by": "system", "created_at": datetime.now(timezone.utc)}
            await db.lead_stages.insert_one(new_appt)
            stages.insert(0, new_appt)
        # Ensure "Appointment Booked" in pre_sales has is_final=True
        await db.lead_stages.update_one(
            {"stage_id": "stg_appointment", "stage_type": "pre_sales"},
            {"$set": {"is_final": True}}
        )
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



@router.post("/crm/migrate-stages")
async def migrate_stages(user: User = Depends(get_current_user)):
    """Safely add missing stages to existing databases - idempotent, safe to run multiple times"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    added = []
    fixed = []
    retired = []

    # Retire + migrate legacy stages (Apr 2026: Portfolio sent → replaced by Package Details Send)
    legacy_pre_sales = [
        ("stg_proposal", "stg_follow_up"),  # migrate any stragglers back to Follow-up
    ]
    for old_sid, fallback_sid in legacy_pre_sales:
        existing = await db.lead_stages.find_one({"stage_id": old_sid, "stage_type": "pre_sales"})
        if existing:
            await db.lead_stages.update_one(
                {"stage_id": old_sid, "stage_type": "pre_sales"},
                {"$set": {"is_active": False, "order": 99}},
            )
            mig = await db.leads.update_many(
                {"stage_type": "pre_sales", "current_stage_id": old_sid},
                {"$set": {"current_stage_id": fallback_sid, "updated_at": datetime.now(timezone.utc)}},
            )
            retired.append({"stage_id": old_sid, "migrated_leads": mig.modified_count, "to": fallback_sid})
    
    # Define all expected pre_sales stages (Portfolio sent removed Apr 2026)
    expected_pre_sales = [
        {"stage_id": "stg_new_lead", "name": "New Lead", "order": 1, "color": "#6366f1", "is_final": False},
        {"stage_id": "stg_rnr", "name": "RNR", "order": 2, "color": "#ef4444", "is_final": False},
        {"stage_id": "stg_new_rnr", "name": "New RNR Leads", "order": 3, "color": "#dc2626", "is_final": False},
        {"stage_id": "stg_follow_up", "name": "Follow-up", "order": 4, "color": "#f59e0b", "is_final": False},
        {"stage_id": "stg_package_send", "name": "Package Details Send", "order": 5, "color": "#a855f7", "is_final": False},
        {"stage_id": "stg_appointment", "name": "Appointment Booked", "order": 6, "color": "#22c55e", "is_final": True},
        {"stage_id": "stg_office_visit", "name": "Office Visit", "order": 7, "color": "#0ea5e9", "is_final": False},
        {"stage_id": "stg_pre_lost", "name": "Lost", "order": 8, "color": "#6b7280", "is_final": False},
    ]
    
    # Define all expected sales stages (Negotiation removed Apr 2026)
    expected_sales = [
        {"stage_id": "stg_new_appt", "name": "New Appointment", "order": 1, "color": "#6366f1", "is_final": False},
        {"stage_id": "stg_sales_office_visit", "name": "Office Visit", "order": 2, "color": "#0ea5e9", "is_final": False},
        {"stage_id": "stg_sales_followup", "name": "Followup", "order": 3, "color": "#f59e0b", "is_final": False},
        {"stage_id": "stg_re_requested", "name": "RE - Request", "order": 4, "color": "#f59e0b", "is_final": False},
        {"stage_id": "stg_re_from_planning", "name": "RE - Planning", "order": 5, "color": "#10b981", "is_final": False},
        {"stage_id": "stg_re_to_client", "name": "RE - Client", "order": 6, "color": "#84cc16", "is_final": False},
        {"stage_id": "stg_sv_client_land", "name": "Client Land Visit", "order": 7, "color": "#a855f7", "is_final": False},
        {"stage_id": "stg_sv_our_projects", "name": "Our Projects Visit", "order": 8, "color": "#7c3aed", "is_final": False},
        {"stage_id": "stg_payment_collect", "name": "Deal Close", "order": 9, "color": "#22c55e", "is_final": False},
        {"stage_id": "stg_accountant_approval", "name": "Accountant Approval", "order": 10, "color": "#f97316", "is_final": False},
        {"stage_id": "stg_project_onboarded", "name": "Project Onboarded", "order": 11, "color": "#059669", "is_final": True},
        {"stage_id": "stg_lost", "name": "Lost", "order": 12, "color": "#ef4444", "is_final": True},
    ]
    
    for stage_type, stages_list in [("pre_sales", expected_pre_sales), ("sales", expected_sales)]:
        for stage in stages_list:
            existing = await db.lead_stages.find_one({"stage_id": stage["stage_id"]})
            if not existing:
                stage["stage_type"] = stage_type
                stage["is_active"] = True
                stage["created_by"] = "migration"
                stage["created_at"] = datetime.now(timezone.utc)
                await db.lead_stages.insert_one(stage)
                added.append(f"{stage_type}: {stage['name']}")
            else:
                # Fix is_final and order
                updates = {}
                if existing.get("is_final") != stage["is_final"]:
                    updates["is_final"] = stage["is_final"]
                if existing.get("order") != stage["order"]:
                    updates["order"] = stage["order"]
                if updates:
                    await db.lead_stages.update_one({"stage_id": stage["stage_id"]}, {"$set": updates})
                    fixed.append(f"{stage['name']}: {updates}")
    
    return {"message": "Migration complete", "added": added, "fixed": fixed, "retired": retired}


# ==================== CRM A (PRE-SALES) ENDPOINTS ====================

@router.get("/crm/pre-sales/dashboard")
async def get_pre_sales_dashboard(user: User = Depends(get_current_user)):
    """Get Pre-Sales dashboard with stage counts - filtered by assigned user for non-admins"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    stages = await get_default_pre_sales_stages()
    
    # Build query - filter by assigned_to for Pre-Sales users (not for Super Admin)
    base_query = {"stage_type": "pre_sales"}
    if user.role == "pre_sales":
        base_query["assigned_to"] = user.user_id
    
    # Get lead counts per stage
    pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$current_stage_id", "count": {"$sum": 1}}}
    ]
    # Run 4 reads in parallel — was sequential.
    (stage_counts, recent_leads, source_counts, total_leads) = await asyncio.gather(
        db.leads.aggregate(pipeline).to_list(100),
        db.leads.find(base_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10),
        db.leads.aggregate([{"$match": base_query}, {"$group": {"_id": "$source", "count": {"$sum": 1}}}]).to_list(20),
        db.leads.count_documents(base_query),
    )
    count_map = {s["_id"]: s["count"] for s in stage_counts}

    return {
        "stages": [
            {**stage, "lead_count": count_map.get(stage["stage_id"], 0)}
            for stage in stages
        ],
        "total_leads": total_leads,
        "recent_leads": recent_leads,
        "source_breakdown": {s["_id"]: s["count"] for s in source_counts},
        "is_filtered": user.role == "pre_sales",
        "user_name": user.name if user.role == "pre_sales" else None
    }


@router.get("/crm/pre-sales/leads")
async def get_pre_sales_leads(
    stage_id: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Pre-Sales leads with filters - filtered by assigned user for non-admins"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    # Auto-redistribute stale RNR leads (14+ days from last RNR attempt)
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        cutoff_str = cutoff.isoformat()
        stale_rnr = await db.leads.find(
            {
                "stage_type": "pre_sales",
                "current_stage_id": "stg_rnr",
                "$or": [
                    {"last_rnr_at": {"$lte": cutoff_str}},
                    {"last_rnr_at": {"$exists": False}, "updated_at": {"$lte": cutoff}}
                ],
                "rnr_redistributed": {"$ne": True}
            },
            {"_id": 0}
        ).to_list(500)
        
        logger.info(f"RNR check: found {len(stale_rnr)} stale leads to redistribute")
        
        if stale_rnr:
            # Get all pre-sales team members for round-robin
            settings = await get_distribution_settings()
            pre_sales_team = settings.get("pre_sales_team", [])
            
            if not pre_sales_team:
                # Fallback: get all pre_sales users
                ps_users = await db.users.find(
                    {"role": "pre_sales", "is_active": True},
                    {"_id": 0, "user_id": 1}
                ).to_list(50)
                pre_sales_team = [u["user_id"] for u in ps_users]
            
            if pre_sales_team:
                rr_idx = settings.get("rnr_rr_index", 0)
                
                for lead in stale_rnr:
                    new_owner = pre_sales_team[rr_idx % len(pre_sales_team)]
                    rr_idx = (rr_idx + 1) % len(pre_sales_team)
                    
                    # Get new owner name
                    owner_doc = await db.users.find_one({"user_id": new_owner}, {"_id": 0, "name": 1})
                    owner_name = owner_doc["name"] if owner_doc else "Unknown"
                    
                    await db.leads.update_one(
                        {"lead_id": lead["lead_id"]},
                        {"$set": {
                            "current_stage_id": "stg_new_rnr",
                            "assigned_to": new_owner,
                            "assigned_to_name": owner_name,
                            "rnr_redistributed": True,
                            "rnr_redistributed_at": datetime.now(timezone.utc),
                            "rnr_previous_owner": lead.get("assigned_to"),
                            "updated_at": datetime.now(timezone.utc)
                        }}
                    )
                
                # Save round-robin index
                await db.lead_distribution_settings.update_one(
                    {},
                    {"$set": {"rnr_rr_index": rr_idx, "updated_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True
                )
                
                logger.info(f"RNR auto-redistribution: {len(stale_rnr)} leads redistributed among {len(pre_sales_team)} team members")
    except Exception as e:
        logger.error(f"RNR auto-redistribution error: {e}")
    
    # Auto-move leads with due follow-ups to the Follow-up stage
    try:
        tomorrow_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
        followup_query = {
            "stage_type": "pre_sales",
            "current_stage_id": {"$ne": "stg_follow_up"},
            "follow_ups": {
                "$elemMatch": {
                    "scheduled_date": {"$lt": tomorrow_str},
                    "completed": False
                }
            }
        }
        if user.role == "pre_sales":
            followup_query["assigned_to"] = user.user_id
        
        due_leads = await db.leads.find(followup_query, {"_id": 0, "lead_id": 1, "current_stage_id": 1}).to_list(500)
        if due_leads:
            now = datetime.now(timezone.utc)
            for lead in due_leads:
                await db.leads.update_one(
                    {"lead_id": lead["lead_id"]},
                    {"$set": {
                        "previous_stage_id": lead["current_stage_id"],
                        "current_stage_id": "stg_follow_up",
                        "updated_at": now
                    },
                    "$push": {
                        "stage_history": {
                            "stage_id": "stg_follow_up",
                            "from_stage_id": lead["current_stage_id"],
                            "moved_at": now.isoformat(),
                            "moved_by": "system",
                            "action": "auto_followup_due"
                        }
                    }}
                )
            logger.info(f"Pre-Sales follow-up auto-move: {len(due_leads)} leads moved to Follow-up stage")
    except Exception as e:
        logger.error(f"Pre-Sales follow-up auto-move error: {e}")
    
    query = {"stage_type": "pre_sales"}
    
    # Filter by assigned_to for Pre-Sales users — show ONLY their own leads
    if user.role == "pre_sales":
        query["assigned_to"] = user.user_id
    
    if stage_id:
        query["current_stage_id"] = stage_id
    if source:
        query["source"] = source
    if search:
        search_conditions = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"alternative_phone": {"$regex": search, "$options": "i"}}
        ]
        query = {"$and": [query, {"$or": search_conditions}]}
    if date_from:
        query["created_at"] = {"$gte": datetime.fromisoformat(date_from.replace('Z', '+00:00'))}
    if date_to:
        if "created_at" in query:
            query["created_at"]["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        else:
            query["created_at"] = {"$lte": datetime.fromisoformat(date_to.replace('Z', '+00:00'))}
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    leads = await filter_contacts_leads(db, leads, user.role)
    return mask_leads_phone(leads, user.role)


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    alternative_phone: Optional[str] = None
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


@router.post("/crm/pre-sales/leads")
async def create_pre_sales_lead(data: LeadCreate, user: User = Depends(get_current_user)):
    """Create a new Pre-Sales lead"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    # Get default first stage
    stages = await get_default_pre_sales_stages()
    first_stage = stages[0] if stages else {"stage_id": "stg_new_lead"}
    
    # Auto-assign: Pre-Sales user's own leads go to themselves, otherwise round-robin
    if user.role == "pre_sales":
        assigned_user_id = user.user_id
        assigned_user_name = user.name
    else:
        assigned_user_id = await assign_lead_to_next_user("pre_sales")
        assigned_user_name = None
        if assigned_user_id:
            assigned_user = await db.users.find_one({"user_id": assigned_user_id}, {"_id": 0})
            assigned_user_name = assigned_user.get("name") if assigned_user else None
    
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
        created_by=user.user_id,
        assigned_to=assigned_user_id
    )
    
    lead_dict = lead.model_dump()
    lead_dict["assigned_to_name"] = assigned_user_name
    await db.leads.insert_one(lead_dict)
    
    return {"message": "Lead created", "lead_id": lead.lead_id, "assigned_to": assigned_user_name}


class AdminLeadCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    alternative_phone: Optional[str] = ""
    source: str = "other"
    city: Optional[str] = ""
    sqft: Optional[int] = None
    budget: Optional[int] = None
    notes: Optional[str] = ""
    stage_type: str = "pre_sales"
    assigned_to: Optional[str] = None


@router.post("/crm/leads")
async def create_lead_admin(data: AdminLeadCreate, user: User = Depends(get_current_user)):
    """Create a new lead - Super Admin, Sales, Pre-Sales"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales", "sales"]:
        raise HTTPException(status_code=403, detail="Sales/Pre-Sales/Admin access required")
    
    stage_type = LeadStageType.PRE_SALES if data.stage_type == "pre_sales" else LeadStageType.SALES
    
    # Get default first stage based on type
    if stage_type == LeadStageType.PRE_SALES:
        stages = await get_default_pre_sales_stages()
        first_stage = stages[0] if stages else {"stage_id": "stg_new_lead"}
    else:
        stages = await get_default_sales_stages()
        first_stage = stages[0] if stages else {"stage_id": "stg_new_appointment"}
    
    # Assign to specific user or auto-assign
    assigned_user_id = data.assigned_to
    assigned_user_name = None
    
    if not assigned_user_id:
        # Pre-sales/sales users creating leads get them assigned to themselves
        if user.role in ["pre_sales", "sales"]:
            assigned_user_id = user.user_id
            assigned_user_name = user.name
        else:
            # Admin/CRE: Auto-assign using round-robin
            team_type = "pre_sales" if stage_type == LeadStageType.PRE_SALES else "sales"
            assigned_user_id = await assign_lead_to_next_user(team_type)
    
    if assigned_user_id and not assigned_user_name:
        assigned_user = await db.users.find_one({"user_id": assigned_user_id}, {"_id": 0})
        assigned_user_name = assigned_user.get("name") if assigned_user else None
    
    lead = Lead(
        name=data.name,
        email=data.email or "",
        phone=data.phone or "",
        alternative_phone=data.alternative_phone or "",
        source=data.source,
        current_stage_id=first_stage["stage_id"],
        stage_type=stage_type,
        stage_history=[{
            "stage_id": first_stage["stage_id"],
            "moved_at": datetime.now(timezone.utc).isoformat(),
            "moved_by": user.user_id
        }],
        city=data.city or "",
        notes=data.notes or "",
        created_by=user.user_id,
        assigned_to=assigned_user_id,
        custom_fields={
            "sqft": data.sqft,
            "budget": data.budget
        } if data.sqft or data.budget else {}
    )
    
    lead_dict = lead.model_dump()
    lead_dict["assigned_to_name"] = assigned_user_name
    await db.leads.insert_one(lead_dict)
    
    # Create notification for assigned user
    if assigned_user_id:
        await create_notification(
            assigned_user_id,
            f"New lead assigned: {data.name}"
        )
    
    return {"message": "Lead created", "lead_id": lead.lead_id, "assigned_to": assigned_user_name}


class LeadStageUpdate(BaseModel):
    stage_id: str
    advance_amount: Optional[float] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    # Appointment booking fields (for pre-sales → sales transfer)
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    appointment_type: Optional[str] = None  # office_visit, online, home_visit
    # Office Visit fields (Sales → Pre-Sales sync)
    office_visit_date: Optional[str] = None
    office_visit_time: Optional[str] = None
    office_visit_location: Optional[str] = None
    office_visit_remarks: Optional[str] = None
    # Rough Estimate fields
    rough_requirement: Optional[str] = None
    # Stage move remarks (Discussion, Deal Closed, RE-To Client, Lost)
    remark: Optional[str] = None
    lost_reason: Optional[str] = None
    # Internal flag: set to True only when called by the /cre/convert-deal
    # or /cre/convert-re-project flow which has already collected payment
    # and created the project. Prevents direct moves to stg_payment_collect.
    internal_deal_convert: Optional[bool] = False


@router.patch("/crm/leads/{lead_id}/stage")
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
    
    # Block manual moves FROM "Payment Collect", "Accountant Approval", and
    # "Project Onboarded" stages. Once a deal has reached payment collection,
    # Sales must NOT be able to drag it back to an earlier stage — accounting
    # records, project creation, and downstream handovers depend on this lead
    # staying past the post-Deal-Close gate.
    if old_stage_id in ["stg_payment_collect", "stg_accountant_approval", "stg_project_onboarded"]:
        raise HTTPException(status_code=400, detail="This lead is past Deal Close and cannot be moved back. Payment has already been collected and the project has been created.")

    # Belt-and-braces: if the lead is linked to a real project (i.e. a deal was
    # closed and a project was spawned), block any manual stage move regardless
    # of the current stage_id. This catches edge cases where a lead's stage was
    # somehow reverted by a script while the project still exists.
    if lead.get("project_id") and not getattr(data, "internal_deal_convert", False):
        raise HTTPException(status_code=400, detail="This lead is already linked to an active project. Sales can no longer change its stage.")
    
    # Block manual moves TO "Project Onboarded" 
    if data.stage_id == "stg_project_onboarded":
        raise HTTPException(status_code=400, detail="Project Onboarded stage is auto-moved only after accountant approval.")
    
    # Block manual moves TO "RE - From Planning" (auto-moved on GM approval)
    if data.stage_id == "stg_re_from_planning":
        raise HTTPException(status_code=400, detail="This stage is auto-populated when GM approves the RE.")

    # Block direct moves TO "Deal Close" (stg_payment_collect). Must come through the
    # /cre/convert-deal or /cre/convert-re-project flow which atomically collects the
    # advance payment, creates the project, and notifies the Accountant.
    # Those endpoints call into this function with an internal bypass token.
    if data.stage_id == "stg_payment_collect" and not getattr(data, "internal_deal_convert", False):
        raise HTTPException(
            status_code=400,
            detail="Please use 'Deal Close' button which collects the advance payment and sends to Accountant. Direct stage move is not allowed.",
        )
    
    # Block manual moves TO "New RNR Leads" (auto-distributed only after 14 days)
    if data.stage_id == "stg_new_rnr":
        raise HTTPException(status_code=400, detail="New RNR Leads stage is auto-distributed only. Leads move here automatically after 14 days in RNR.")
    
    # Block Pre-Sales from manually moving to "Office Visit" (synced from Sales only)
    if data.stage_id == "stg_office_visit" and lead.get("stage_type") == "pre_sales":
        raise HTTPException(status_code=400, detail="Office Visit is auto-synced from Sales. The Sales team schedules the office visit.")
    
    # Update lead
    stage_history = lead.get("stage_history", [])
    history_entry = {
        "stage_id": data.stage_id,
        "from_stage_id": old_stage_id,
        "moved_at": datetime.now(timezone.utc).isoformat(),
        "moved_by": user.user_id
    }
    if data.remark:
        history_entry["remark"] = data.remark
    if data.lost_reason:
        history_entry["lost_reason"] = data.lost_reason
    stage_history.append(history_entry)
    
    update = {
        "current_stage_id": data.stage_id,
        "stage_history": stage_history,
        "updated_at": datetime.now(timezone.utc)
    }

    # When a lead progresses OUT of Followup to any downstream stage, auto-complete any
    # still-pending follow-ups. Otherwise the auto-move job in /crm/sales/leads would
    # silently bounce the lead back to Followup on the next refresh.
    DOWNSTREAM_OF_FOLLOWUP = {
        "stg_re_requested", "stg_re_from_planning", "stg_re_to_client",
        "stg_sv_client_land", "stg_sv_our_projects",
        "stg_payment_collect", "stg_accountant_approval",
        "stg_project_onboarded", "stg_lost",
    }
    if (
        old_stage_id == "stg_sales_followup"
        and data.stage_id in DOWNSTREAM_OF_FOLLOWUP
        and lead.get("follow_ups")
    ):
        completed_follow_ups = []
        for fu in lead.get("follow_ups", []):
            if not fu.get("completed"):
                fu = {**fu, "completed": True, "auto_completed": True,
                      "completed_at": datetime.now(timezone.utc).isoformat(),
                      "completed_reason": f"auto-closed on stage move to {data.stage_id}"}
            completed_follow_ups.append(fu)
        update["follow_ups"] = completed_follow_ups
    
    # Store remarks on lead for RE-Client
    if data.remark and data.stage_id in ["stg_re_to_client"]:
        remarks = lead.get("remarks", [])
        remarks.append({
            "text": data.remark,
            "stage": data.stage_id,
            "by": user.user_id,
            "by_name": user.name,
            "date": datetime.now(timezone.utc).isoformat()
        })
        update["remarks"] = remarks
    
    # Lost stage: store reason
    if data.stage_id == "stg_lost" and data.lost_reason:
        update["lost_reason"] = data.lost_reason
        update["lost_at"] = datetime.now(timezone.utc)
        update["lost_by"] = user.user_id
    
    # RNR: Auto-increment rnr_count when moved to RNR stage and set last_rnr_at
    if data.stage_id == "stg_rnr":
        rnr_count = lead.get("rnr_count", 0) + 1
        rnr_log = lead.get("rnr_log", [])
        rnr_log.append({
            "attempt": rnr_count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "logged_by": user.user_id,
            "logged_by_name": user.name,
            "action": "moved_to_rnr"
        })
        update["rnr_count"] = rnr_count
        update["rnr_log"] = rnr_log
        update["last_rnr_at"] = datetime.now(timezone.utc).isoformat()
        update["rnr_redistributed"] = False
    
    # Appointment Booked: store appointment date
    if data.stage_id == "stg_appointment":
        if data.appointment_date:
            update["appointment_date"] = data.appointment_date
        if data.appointment_time:
            update["appointment_time"] = data.appointment_time
    
    # Sales Office Visit: store date/time/location and sync to Pre-Sales
    if data.stage_id == "stg_sales_office_visit":
        office_visit_data = {
            "date": data.office_visit_date,
            "time": data.office_visit_time,
            "location": data.office_visit_location or "Office",
            "remarks": data.office_visit_remarks or "",
            "scheduled_by": user.user_id,
            "scheduled_by_name": user.name,
            "scheduled_at": datetime.now(timezone.utc).isoformat()
        }
        update["office_visit"] = office_visit_data
        
        # Sync to Pre-Sales lead — move the original pre-sales lead to "Office Visit" stage
        pre_sales_lead_id = lead.get("transferred_from_lead_id")
        if pre_sales_lead_id:
            await db.leads.update_one(
                {"lead_id": pre_sales_lead_id},
                {"$set": {
                    "current_stage_id": "stg_office_visit",
                    "office_visit": office_visit_data,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$push": {
                    "stage_history": {
                        "stage_id": "stg_office_visit",
                        "moved_at": datetime.now(timezone.utc).isoformat(),
                        "moved_by": "system",
                        "action": "synced_from_sales"
                    }
                }}
            )
    
    await db.leads.update_one({"lead_id": lead_id}, {"$set": update})
    
    # Check for special stage triggers
    result = {"message": "Lead stage updated", "new_stage": stage["name"]}
    
    # TRIGGER: Pre-Sales final stage -> Transfer to Sales CRM
    # Check by stage_id OR is_final flag for robustness
    is_presales_final = lead["stage_type"] == "pre_sales" and (stage.get("is_final") or data.stage_id == "stg_appointment")
    if is_presales_final and not lead.get("transferred_to_lead_id"):
        # Auto-transfer to Sales
        sales_stages = await get_default_sales_stages()
        first_sales_stage = sales_stages[0] if sales_stages else {"stage_id": "stg_new_appt"}
        
        # Auto-assign to Sales team member using round-robin
        assigned_sales_user_id = await assign_lead_to_next_user("sales")
        assigned_sales_user_name = None
        if assigned_sales_user_id:
            assigned_sales_user = await db.users.find_one({"user_id": assigned_sales_user_id}, {"_id": 0})
            assigned_sales_user_name = assigned_sales_user.get("name") if assigned_sales_user else None
        
        # Build appointment info
        appointment_info = {}
        if data.appointment_date:
            appointment_info = {
                "appointment_date": data.appointment_date,
                "appointment_time": data.appointment_time,
                "appointment_type": data.appointment_type,
                "booked_by": user.user_id,
                "booked_at": datetime.now(timezone.utc).isoformat()
            }
        
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
            created_by=user.user_id,
            assigned_to=assigned_sales_user_id
        )
        
        new_lead_dict = new_lead.model_dump()
        new_lead_dict["assigned_to_name"] = assigned_sales_user_name
        new_lead_dict["pre_sales_person_id"] = lead.get("assigned_to")
        new_lead_dict["pre_sales_person_name"] = lead.get("assigned_to_name")
        new_lead_dict["summary"] = lead.get("summary", "")
        new_lead_dict["follow_ups"] = lead.get("follow_ups", [])
        
        # Store appointment info
        if appointment_info:
            new_lead_dict["appointment"] = appointment_info
        
        await db.leads.insert_one(new_lead_dict)
        
        # Update original lead with transfer info
        await db.leads.update_one(
            {"lead_id": lead_id},
            {"$set": {"transferred_to_lead_id": new_lead.lead_id, "transferred_at": datetime.now(timezone.utc)}}
        )
        
        result["transferred_to_sales"] = True
        result["new_lead_id"] = new_lead.lead_id
        result["assigned_to"] = assigned_sales_user_name
        
        # Notify assigned Sales person
        if assigned_sales_user_id:
            notification = {
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": assigned_sales_user_id,
                "title": "New Sales Lead Assigned",
                "message": f"Lead '{lead['name']}' transferred from Pre-Sales (Appointment Booked)",
                "type": "lead_transfer",
                "reference_id": new_lead.lead_id,
                "is_read": False,
                "created_at": datetime.now(timezone.utc)
            }
            await db.notifications.insert_one(notification)
    
    # TRIGGER: Sales "RE - Request" -> Create RE Project (idempotent — don't duplicate if one exists)
    if lead["stage_type"] == "sales" and stage["stage_id"] == "stg_re_requested":
        existing_re_pid = lead.get("re_project_id")
        existing_re = None
        if existing_re_pid:
            existing_re = await db.re_projects.find_one({"re_project_id": existing_re_pid}, {"_id": 0})

        # If a non-converted RE already exists for this lead, do NOT create a duplicate.
        # Just keep the lead linked to the existing RE and refresh the rough requirement.
        if existing_re and existing_re.get("status") not in ("converted", "deleted"):
            if data.rough_requirement:
                await db.re_projects.update_one(
                    {"re_project_id": existing_re_pid},
                    {"$set": {
                        "rough_requirement": data.rough_requirement,
                        "rough_requirement_by": user.name,
                        "rough_requirement_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc),
                    }}
                )
            result["re_project_created"] = False
            result["re_project_id"] = existing_re_pid
            result["re_already_exists"] = True
        else:
            # Generate RE number
            re_number = await get_next_re_number()
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
                created_by=user.user_id,
                re_number=re_number,
                revision=0,
                parent_re_number=re_number
            )

            re_dict = re_project.model_dump()
            # Store rough requirement from Sales
            if data.rough_requirement:
                re_dict["rough_requirement"] = data.rough_requirement
                re_dict["rough_requirement_by"] = user.name
                re_dict["rough_requirement_at"] = datetime.now(timezone.utc).isoformat()
            await db.re_projects.insert_one(re_dict)

            # Link RE project to lead
            await db.leads.update_one({"lead_id": lead_id}, {"$set": {"re_project_id": re_project.re_project_id, "re_number": re_number}})

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
    
    # TRIGGER: Sales "Deal Close" (stg_payment_collect) -> Advance collection popup handled by frontend
    if lead["stage_type"] == "sales" and stage["stage_id"] == "stg_payment_collect":
        result["payment_collect"] = True
        result["deal_closed"] = True
    
    # TRIGGER: Sales "Project Onboarded" -> Final stage
    if lead["stage_type"] == "sales" and stage["stage_id"] == "stg_project_onboarded":
        result["project_onboarded"] = True
    
    return result


# ==================== CRM LEAD DETAILS & INTERACTIONS ====================

class LeadRemarkInput(BaseModel):
    remark: str
    remark_type: Optional[str] = "general"


class LeadFollowUpInput(BaseModel):
    scheduled_date: str
    scheduled_time: Optional[str] = None
    note: Optional[str] = None


class LeadUpdateInput(BaseModel):
    summary: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    alternative_phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None


# ==================== PROJECT ONBOARDING FLOW ====================

class AdvanceCollectionRequest(BaseModel):
    advance_amount: float
    payment_mode: str  # cash, upi, cheque, bank_transfer
    payment_reference: Optional[str] = None
    cheque_details: Optional[List[Dict[str, Any]]] = None
    remarks: Optional[str] = None


@router.post("/crm/leads/{lead_id}/rnr-log")
async def log_rnr_attempt(lead_id: str, user: User = Depends(get_current_user)):
    """Log an RNR (Ring Not Responding) attempt for a lead in RNR stage"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Pre-Sales access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if lead.get("current_stage_id") != "stg_rnr":
        raise HTTPException(status_code=400, detail="Lead must be in RNR stage to log RNR attempts")
    
    rnr_count = lead.get("rnr_count", 0) + 1
    rnr_log = lead.get("rnr_log", [])
    now = datetime.now(timezone.utc)
    
    rnr_log.append({
        "attempt": rnr_count,
        "timestamp": now.isoformat(),
        "logged_by": user.user_id,
        "logged_by_name": user.name
    })
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "rnr_count": rnr_count,
            "rnr_log": rnr_log,
            "last_rnr_at": now.isoformat(),
            "updated_at": now
        }}
    )
    
    return {
        "message": f"RNR attempt #{rnr_count} logged",
        "rnr_count": rnr_count,
        "timestamp": now.isoformat()
    }


@router.post("/crm/leads/{lead_id}/collect-advance")
async def collect_advance_payment(lead_id: str, data: AdvanceCollectionRequest, user: User = Depends(get_current_user)):
    """CRE/Sales collects advance payment from client at Project Onboarded stage"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales/CRE access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    user_name = user_doc.get("name", "Unknown") if user_doc else "Unknown"
    
    # Store advance payment on the lead
    advance_record = {
        "advance_amount": data.advance_amount,
        "payment_mode": data.payment_mode,
        "payment_reference": data.payment_reference or "",
        "cheque_details": data.cheque_details or [],
        "remarks": data.remarks or "",
        "collected_by": user.user_id,
        "collected_by_name": user_name,
        "collected_at": now.isoformat(),
        "onboarding_status": "advance_collected",  # advance_collected -> accountant_pending -> accountant_verified -> moved_to_planning
    }
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "advance_payment": advance_record,
            "onboarding_status": "advance_collected",
            "updated_at": now
        }}
    )
    
    return {"message": f"Advance of ₹{data.advance_amount:,.0f} collected. Send to accountant for verification."}


@router.post("/crm/leads/{lead_id}/send-to-accountant")
async def send_to_accountant(lead_id: str, user: User = Depends(get_current_user)):
    """CRE/Sales sends advance payment for accountant verification"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales/CRE access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("onboarding_status") != "advance_collected":
        raise HTTPException(status_code=400, detail="Advance must be collected first")
    
    now = datetime.now(timezone.utc)
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "onboarding_status": "accountant_pending",
            "updated_at": now
        }}
    )
    
    # Notify accountants
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_accountant",
        "title": "Advance Payment Verification",
        "message": f"Advance payment for '{lead['name']}' needs verification. Amount: ₹{lead.get('advance_payment', {}).get('advance_amount', 0):,.0f}",
        "type": "advance_verification",
        "reference_id": lead_id,
        "is_read": False,
        "created_at": now
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Sent to accountant for verification"}


@router.post("/crm/leads/{lead_id}/accountant-verify")
async def accountant_verify(lead_id: str, user: User = Depends(get_current_user)):
    """Accountant verifies the advance payment"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT]:
        raise HTTPException(status_code=403, detail="Accountant access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Allow verification if lead is in accountant_approval stage OR has accountant_pending status
    if lead.get("onboarding_status") != "accountant_pending" and lead.get("current_stage_id") != "stg_accountant_approval":
        raise HTTPException(status_code=400, detail="Not pending accountant verification")
    
    now = datetime.now(timezone.utc)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    
    # Auto-move lead to "Project Onboarded" stage
    project_onboarded_stage = await db.lead_stages.find_one({"stage_id": "stg_project_onboarded"}, {"_id": 0})
    target_stage_id = project_onboarded_stage["stage_id"] if project_onboarded_stage else "stg_project_onboarded"
    
    lead_stage_history = lead.get("stage_history", [])
    lead_stage_history.append({
        "stage_id": target_stage_id,
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "action": "auto_after_accountant_verified"
    })
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "onboarding_status": "accountant_verified",
            "current_stage_id": target_stage_id,
            "stage_history": lead_stage_history,
            "advance_payment.verified_by": user.user_id,
            "advance_payment.verified_by_name": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "advance_payment.verified_at": now.isoformat(),
            "updated_at": now
        }}
    )
    
    # Also update the project status
    if lead.get("project_id"):
        await db.projects.update_one(
            {"project_id": lead["project_id"]},
            {"$set": {
                "status": "payment_received",
                "accountant_verified": True,
                "accountant_verified_by": user.user_id,
                "accountant_verified_at": now
            }}
        )
    
    # Auto-notify Planning and CRE about new onboarded project
    for target in ["all_planning", "all_cre", "all_sales"]:
        notif = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": target,
            "title": "New Project Onboarded",
            "message": f"'{lead['name']}' is now onboarded. Advance verified by accountant. Ready for Planning handoff.",
            "type": "project_onboarded",
            "reference_id": lead_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.notifications.insert_one(notif)
    
    return {"message": "Advance payment verified by accountant"}


class MoveToPlanning(BaseModel):
    project_description: str

@router.post("/crm/leads/{lead_id}/move-to-planning")
async def move_to_planning(lead_id: str, data: MoveToPlanning, user: User = Depends(get_current_user)):
    """CRE moves the onboarded project to Planning with project description"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales/CRE access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("onboarding_status") != "accountant_verified":
        raise HTTPException(status_code=400, detail="Accountant must verify first")
    
    now = datetime.now(timezone.utc)
    advance = lead.get("advance_payment", {})
    
    # Find the approved RE project
    re_project = None
    if lead.get("re_number"):
        re_project = await db.re_projects.find_one(
            {"parent_re_number": lead["re_number"], "status": "client_approved"}, {"_id": 0}
        )
    if not re_project and lead.get("re_project_id"):
        re_project = await db.re_projects.find_one(
            {"re_project_id": lead["re_project_id"], "status": {"$in": ["client_approved", "re_approved"]}}, {"_id": 0}
        )
    
    # Create the main project
    project_count = await db.projects.count_documents({}) + 1
    project_code = f"USB{str(project_count).zfill(2)}{datetime.now().strftime('%m%y')}"
    expected_completion = now + timedelta(days=365)
    
    main_project = {
        "project_id": f"proj_{uuid.uuid4().hex[:12]}",
        "project_code": project_code,
        "name": re_project.get("project_name", f"Project - {lead['name']}") if re_project else f"Project - {lead['name']}",
        "client_name": lead["name"],
        "client_email": lead.get("email"),
        "client_phone": lead.get("phone"),
        "location": (re_project.get("location") or "") if re_project else "",
        "sqft": (re_project.get("sqft") or 0) if re_project else 0,
        "building_type": (re_project.get("building_type") or "residential") if re_project else "residential",
        "total_value": re_project.get("estimated_total", 0) if re_project else 0,
        "advance_amount": advance.get("advance_amount", 0),
        "advance_payment_mode": advance.get("payment_mode"),
        "advance_payment_reference": advance.get("payment_reference"),
        "advance_received_at": now,
        "additional_cost": 0,
        "income_project": advance.get("advance_amount", 0),
        "income_additional": 0,
        "total_expense": 0,
        "current_stage": "yet_to_start",
        "stage_history": [],
        "materials_locked": False,
        "start_date": now,
        "expected_completion": expected_completion,
        "status": "planning",
        "project_description": data.project_description,
        "re_project_id": re_project["re_project_id"] if re_project else None,
        "lead_id": lead_id,
        "created_by": user.user_id,
        "created_at": now
    }
    
    await db.projects.insert_one(main_project)
    
    # Update RE Project status
    if re_project:
        await db.re_projects.update_one(
            {"re_project_id": re_project["re_project_id"]},
            {"$set": {
                "status": "converted",
                "converted_project_id": main_project["project_id"],
                "converted_at": now,
                "converted_by": user.user_id,
                "advance_collected": advance.get("advance_amount", 0)
            }}
        )
    
    # Update lead onboarding status
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "onboarding_status": "moved_to_planning",
            "project_id": main_project["project_id"],
            "project_description": data.project_description,
            "updated_at": now
        }}
    )
    
    # Create income record
    if advance.get("advance_amount", 0) > 0:
        income_record = {
            "income_id": f"inc_{uuid.uuid4().hex[:12]}",
            "project_id": main_project["project_id"],
            "project_name": main_project["name"],
            "category": "advance_payment",
            "sub_category": "Deal Conversion Advance",
            "amount": advance["advance_amount"],
            "payment_mode": advance.get("payment_mode", "cash"),
            "payment_reference": advance.get("payment_reference", ""),
            "payment_date": now.isoformat(),
            "stage": "Advance Payment",
            "description": f"Advance payment - {lead['name']}",
            "collected_by": user.user_id,
            "status": "approved",
            "source": "onboarding",
            "created_at": now.isoformat()
        }
        await db.income.insert_one(income_record)
    
    # Notify Planning
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_planning",
        "title": "New Project for Planning",
        "message": f"Project '{main_project['name']}' moved to planning. Description: {data.project_description[:100]}",
        "type": "project_created",
        "reference_id": main_project["project_id"],
        "is_read": False,
        "created_at": now
    }
    await db.notifications.insert_one(notification)
    
    return {
        "message": "Project created and moved to Planning",
        "project_id": main_project["project_id"],
        "project_code": project_code
    }


@router.get("/crm/sales-overview")
async def get_sales_overview(user: User = Depends(get_current_user)):
    """Get sales overview stats including deal closed count and advance collected"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Count deals at Deal Close (payment_collect) or later stages
    deal_closed_count = await db.leads.count_documents({
        "current_stage_id": {"$in": ["stg_payment_collect", "stg_accountant_approval", "stg_project_onboarded"]}
    })
    
    # Total advance collected
    pipeline = [
        {"$match": {"advance_payment.advance_amount": {"$exists": True, "$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$advance_payment.advance_amount"}}}
    ]
    result = await db.leads.aggregate(pipeline).to_list(1)
    total_advance = result[0]["total"] if result else 0
    
    # Count by onboarding status
    onboarding_counts = {}
    for status in ["advance_collected", "accountant_pending", "accountant_verified", "moved_to_planning"]:
        count = await db.leads.count_documents({"onboarding_status": status})
        onboarding_counts[status] = count
    
    return {
        "deal_closed_count": deal_closed_count,
        "total_advance_collected": total_advance,
        "onboarding_counts": onboarding_counts
    }



## ===== SITE VISIT MANAGEMENT =====

class AssignSiteVisitInput(BaseModel):
    visit_type: str  # "client_land" or "ongoing_project"
    sr_engineer_id: Optional[str] = None
    project_id: Optional[str] = None
    visit_date: Optional[str] = None
    notes: Optional[str] = None

@router.get("/crm/sr-site-engineers")
async def get_sr_site_engineers(user: User = Depends(get_current_user)):
    """Get list of Senior Site Engineers for assignment"""
    engineers = await db.users.find(
        {"role": "sr_site_engineer", "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1, "region": 1}
    ).to_list(100)
    return engineers

@router.get("/crm/site-engineers")
async def get_all_site_engineers(user: User = Depends(get_current_user)):
    """Get list of all Site Engineers (Sr + Jr)"""
    engineers = await db.users.find(
        {"role": {"$in": ["sr_site_engineer", "site_engineer"]}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1, "role": 1, "region": 1}
    ).to_list(100)
    return engineers

@router.get("/crm/ongoing-projects")
async def get_ongoing_projects(search: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get ongoing projects with site engineer info for site visit assignment"""
    query = {"status": {"$in": ["active", "in_progress", "ongoing"]}}
    if search:
        query["$or"] = [
            {"project_name": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}}
        ]
    projects = await db.projects.find(query, {"_id": 0, "project_id": 1, "project_name": 1, "location": 1, "site_engineer_user_id": 1}).to_list(100)
    
    # Enrich with site engineer details
    for p in projects:
        if p.get("site_engineer_user_id"):
            eng = await db.users.find_one({"user_id": p["site_engineer_user_id"]}, {"_id": 0, "user_id": 1, "name": 1, "phone": 1, "email": 1})
            p["site_engineer"] = eng
        else:
            p["site_engineer"] = None
    return projects

@router.post("/crm/leads/{lead_id}/assign-site-visit")
async def assign_site_visit(lead_id: str, data: AssignSiteVisitInput, user: User = Depends(get_current_user)):
    """Assign a site visit to a lead - either client land or ongoing project"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc)
    visit_date = data.visit_date or now.strftime("%Y-%m-%d")
    
    site_visit_data = {
        "visit_type": data.visit_type,
        "visit_date": visit_date,
        "visit_status": "scheduled",
        "assigned_at": now.isoformat(),
        "assigned_by": user.user_id,
        "notes": data.notes or ""
    }
    
    # Determine target stage and engineer
    target_stage = None
    if data.visit_type == "client_land":
        if not data.sr_engineer_id:
            raise HTTPException(status_code=400, detail="Sr. Site Engineer is required for client land visit")
        site_visit_data["sr_engineer_id"] = data.sr_engineer_id
        eng = await db.users.find_one({"user_id": data.sr_engineer_id}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
        site_visit_data["sr_engineer_name"] = eng["name"] if eng else "Unknown"
        site_visit_data["sr_engineer_phone"] = eng.get("phone") if eng else None
        target_stage = "stg_sv_client_land"
    elif data.visit_type == "ongoing_project":
        if not data.project_id:
            raise HTTPException(status_code=400, detail="Project is required for ongoing project visit")
        project = await db.projects.find_one({"project_id": data.project_id}, {"_id": 0, "project_name": 1, "location": 1, "site_engineer_user_id": 1})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        site_visit_data["project_id"] = data.project_id
        site_visit_data["project_name"] = project.get("project_name")
        site_visit_data["project_location"] = project.get("location")
        if project.get("site_engineer_user_id"):
            eng = await db.users.find_one({"user_id": project["site_engineer_user_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
            site_visit_data["site_engineer_id"] = project["site_engineer_user_id"]
            site_visit_data["site_engineer_name"] = eng["name"] if eng else "Unknown"
            site_visit_data["site_engineer_phone"] = eng.get("phone") if eng else None
            site_visit_data["site_engineer_email"] = eng.get("email") if eng else None
        target_stage = "stg_sv_our_projects"
    else:
        raise HTTPException(status_code=400, detail="Invalid visit type")
    
    # Update lead with site visit data and move to target stage
    stage_history = lead.get("stage_history", [])
    stage_history.append({
        "stage_id": target_stage,
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "action": f"site_visit_{data.visit_type}"
    })
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "current_stage_id": target_stage,
            "site_visit_data": site_visit_data,
            "stage_history": stage_history,
            "updated_at": now
        }}
    )
    
    # Notify the assigned engineer
    engineer_id = site_visit_data.get("sr_engineer_id") or site_visit_data.get("site_engineer_id")
    if engineer_id:
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": engineer_id,
            "title": "New Site Visit Assigned",
            "message": f"Site visit for '{lead.get('name')}' on {visit_date}. Location: {lead.get('city', site_visit_data.get('project_location', 'N/A'))}",
            "type": "site_visit_assigned",
            "reference_id": lead_id,
            "is_read": False,
            "created_at": now
        }
        await db.notifications.insert_one(notification)
    
    return {"message": "Site visit assigned", "stage": target_stage, "site_visit_data": site_visit_data}

@router.post("/crm/leads/{lead_id}/assign-jr-engineer")
async def assign_jr_engineer(lead_id: str, jr_engineer_id: str = None, user: User = Depends(get_current_user)):
    """Sr. Site Engineer assigns Jr. Engineer to a client land visit"""
    if user.role not in [UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Sr. Site Engineers can assign Jr. Engineers")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead or not lead.get("site_visit_data"):
        raise HTTPException(status_code=404, detail="Lead or site visit not found")
    
    if not jr_engineer_id:
        raise HTTPException(status_code=400, detail="Jr. Engineer ID required")
    
    eng = await db.users.find_one({"user_id": jr_engineer_id}, {"_id": 0, "name": 1, "phone": 1})
    now = datetime.now(timezone.utc)
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "site_visit_data.jr_engineer_id": jr_engineer_id,
            "site_visit_data.jr_engineer_name": eng["name"] if eng else "Unknown",
            "site_visit_data.jr_engineer_phone": eng.get("phone") if eng else None,
            "updated_at": now
        }}
    )
    return {"message": f"Jr. Engineer {eng['name'] if eng else jr_engineer_id} assigned"}


@router.get("/crm/jr-engineers")
async def get_jr_engineers(user: User = Depends(get_current_user)):
    """Get list of Jr. Engineers (site_engineer, planning roles) for assignment"""
    if user.role not in [UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Permission denied")
    engineers = await db.users.find(
        {"role": {"$in": ["site_engineer", "planning"]}, "is_active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "phone": 1, "email": 1, "role": 1}
    ).to_list(100)
    return engineers

@router.post("/crm/leads/{lead_id}/complete-site-visit")
async def complete_site_visit(lead_id: str, user: User = Depends(get_current_user)):
    """Mark site visit as done - Jr. Engineer or Sr. Engineer can complete"""
    if user.role not in [UserRole.SITE_ENGINEER, UserRole.SR_SITE_ENGINEER, UserRole.SUPER_ADMIN, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Only Engineers can mark visit done")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    now = datetime.now(timezone.utc)
    stage_history = lead.get("stage_history", [])
    stage_history.append({
        "stage_id": "stg_re_requested",
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "action": "site_visit_completed"
    })
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "current_stage_id": "stg_re_requested",
            "site_visit_data.visit_status": "completed",
            "site_visit_data.completed_at": now.isoformat(),
            "site_visit_data.completed_by": user.user_id,
            "stage_history": stage_history,
            "updated_at": now
        }}
    )
    return {"message": "Site visit completed"}

@router.get("/crm/my-site-visits")
async def get_my_site_visits(user: User = Depends(get_current_user)):
    """Get site visits assigned to the current engineer - today's, upcoming, and past"""
    if user.role not in [UserRole.SR_SITE_ENGINEER, UserRole.SITE_ENGINEER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Site Engineer access required")
    
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Find leads where this engineer is assigned
    query = {
        "$or": [
            {"site_visit_data.sr_engineer_id": user.user_id},
            {"site_visit_data.jr_engineer_id": user.user_id},
            {"site_visit_data.site_engineer_id": user.user_id}
        ]
    }
    leads = await db.leads.find(query, {"_id": 0, "lead_id": 1, "name": 1, "phone": 1, "email": 1, "city": 1, "site_visit_data": 1, "current_stage_id": 1}).to_list(200)
    
    today_visits = []
    upcoming_visits = []
    past_visits = []
    
    for lead in leads:
        sv = lead.get("site_visit_data", {})
        visit_date = sv.get("visit_date", "")
        visit = {
            "lead_id": lead["lead_id"],
            "client_name": lead.get("name"),
            "client_phone": lead.get("phone"),
            "client_email": lead.get("email"),
            "location": lead.get("city") or sv.get("project_location", ""),
            "visit_type": sv.get("visit_type"),
            "visit_date": visit_date,
            "visit_status": sv.get("visit_status", "scheduled"),
            "project_name": sv.get("project_name"),
            "notes": sv.get("notes"),
            "sr_engineer_id": sv.get("sr_engineer_id"),
            "sr_engineer_name": sv.get("sr_engineer_name"),
            "jr_engineer_id": sv.get("jr_engineer_id"),
            "jr_engineer_name": sv.get("jr_engineer_name"),
            "jr_engineer_phone": sv.get("jr_engineer_phone"),
            "current_stage_id": lead.get("current_stage_id"),
            "assigned_to_me_as": "sr" if sv.get("sr_engineer_id") == user.user_id else ("jr" if sv.get("jr_engineer_id") == user.user_id else "other")
        }
        
        if visit_date == today_str:
            today_visits.append(visit)
        elif visit_date > today_str:
            upcoming_visits.append(visit)
        else:
            past_visits.append(visit)
    
    today_visits.sort(key=lambda x: x["visit_date"])
    upcoming_visits.sort(key=lambda x: x["visit_date"])
    
    return {
        "today": today_visits,
        "upcoming": upcoming_visits,
        "past": past_visits
    }


@router.get("/crm/leads/{lead_id}")
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


@router.patch("/crm/leads/{lead_id}")
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



class AppointmentInput(BaseModel):
    appointment_date: str
    appointment_time: str
    appointment_type: str  # office_visit, online, home_visit

@router.patch("/crm/leads/{lead_id}/appointment")
async def update_lead_appointment(lead_id: str, data: AppointmentInput, user: User = Depends(get_current_user)):
    """Add or edit appointment on a lead"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    appointment = {
        "appointment_date": data.appointment_date,
        "appointment_time": data.appointment_time,
        "appointment_type": data.appointment_type,
        "booked_by": user.user_id,
        "booked_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.leads.update_one({"lead_id": lead_id}, {"$set": {"appointment": appointment, "updated_at": datetime.now(timezone.utc)}})
    
    return {"message": "Appointment updated", "appointment": appointment}



@router.post("/crm/leads/{lead_id}/remarks")
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


@router.post("/crm/leads/{lead_id}/follow-ups")
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
        "scheduled_time": data.scheduled_time,
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


@router.patch("/crm/leads/{lead_id}/follow-ups/{follow_up_id}/complete")
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


class FollowUpCloseInput(BaseModel):
    closing_remark: str

@router.patch("/crm/leads/{lead_id}/follow-up/{index}/close")
async def close_follow_up_by_index(lead_id: str, index: int, data: FollowUpCloseInput, user: User = Depends(get_current_user)):
    """Close a follow-up by index with a closing remark"""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    follow_ups = lead.get("follow_ups", [])
    if index < 0 or index >= len(follow_ups):
        raise HTTPException(status_code=404, detail="Follow-up not found")
    
    follow_ups[index]["completed"] = True
    follow_ups[index]["completed_at"] = datetime.now(timezone.utc).isoformat()
    follow_ups[index]["closing_remark"] = data.closing_remark
    follow_ups[index]["closed_by"] = user.user_id
    follow_ups[index]["closed_by_name"] = user.name
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"follow_ups": follow_ups, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Follow-up closed with remark"}



# ==================== CRM B (SALES) ENDPOINTS ====================

@router.get("/crm/sales/dashboard")
async def get_sales_dashboard(user: User = Depends(get_current_user)):
    """Get Sales dashboard with stage counts"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")

    stages = await get_default_sales_stages()

    # Build query - filter by assigned_to for Sales users (not for Super Admin)
    base_query = {"stage_type": "sales"}
    if user.role == "sales":
        base_query["assigned_to"] = user.user_id

    pipeline = [
        {"$match": base_query},
        {"$group": {"_id": "$current_stage_id", "count": {"$sum": 1}}}
    ]

    # Run all 6 reads in parallel — was sequential & took 7+ seconds.
    (stage_counts, recent_leads, total_leads, re_requested, re_in_progress,
     re_approved, re_converted) = await asyncio.gather(
        db.leads.aggregate(pipeline).to_list(100),
        db.leads.find(base_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10),
        db.leads.count_documents(base_query),
        db.re_projects.count_documents({"status": "re_requested"}),
        db.re_projects.count_documents({"status": "re_in_progress"}),
        db.re_projects.count_documents({"status": "re_approved"}),
        db.re_projects.count_documents({"status": "converted"}),
    )
    count_map = {s["_id"]: s["count"] for s in stage_counts}
    re_stats = {
        "requested": re_requested,
        "in_progress": re_in_progress,
        "approved": re_approved,
        "converted": re_converted,
    }

    return {
        "stages": [
            {**stage, "lead_count": count_map.get(stage["stage_id"], 0)}
            for stage in stages
        ],
        "total_leads": total_leads,
        "recent_leads": recent_leads,
        "re_stats": re_stats,
        "is_filtered": user.role == "sales",
        "user_name": user.name if user.role == "sales" else None
    }


@router.get("/crm/sales/leads")
async def get_sales_leads(
    stage_id: Optional[str] = None,
    search: Optional[str] = None,
    has_re_project: Optional[bool] = None,
    followup_date: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get Sales leads with filters - filtered by assigned user for non-admins"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "sales"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    # Auto-move leads with due follow-ups to the Follow-up stage
    # IMPORTANT: only kick the lead back to followup if it's still in an EARLY pipeline stage.
    # Once a lead has progressed to RE / Negotiation / Deal Close / Onboarded / Lost, leave it alone —
    # otherwise the auto-move silently undoes Sales/Planning/GM stage changes.
    EARLY_SALES_STAGES = [
        "stg_new_appt",
        "stg_sales_office_visit",
        "stg_sv_client_land",
        "stg_sv_our_projects",
    ]
    tomorrow_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    followup_query = {
        "stage_type": "sales",
        "current_stage_id": {"$in": EARLY_SALES_STAGES},
        "follow_ups": {
            "$elemMatch": {
                "scheduled_date": {"$lt": tomorrow_str},
                "completed": False
            }
        }
    }
    if user.role == "sales":
        followup_query["assigned_to"] = user.user_id

    # Throttle the auto-move scan: run at most once every 60 seconds per user.
    # Was running on every page load, causing per-user multi-second writes when
    # the followup list grew. Replace per-call N+1 updates with a single
    # aggregating $set + $push using update_many.
    cache_key = f"sales_followup_scan:{user.user_id}"
    last_scan = _DASHBOARD_SCAN_CACHE.get(cache_key, 0)
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - last_scan > 60:
        _DASHBOARD_SCAN_CACHE[cache_key] = now_ts
        due_leads = await db.leads.find(followup_query, {"_id": 0, "lead_id": 1, "current_stage_id": 1}).to_list(500)
        if due_leads:
            now_dt = datetime.now(timezone.utc)
            # Bulk write — one round-trip per lead instead of per-doc await.
            ops = []
            for lead in due_leads:
                ops.append({
                    "filter": {"lead_id": lead["lead_id"]},
                    "update": {
                        "$set": {
                            "previous_stage_id": lead["current_stage_id"],
                            "current_stage_id": "stg_sales_followup",
                            "updated_at": now_dt,
                        },
                        "$push": {
                            "stage_history": {
                                "stage_id": "stg_sales_followup",
                                "from_stage_id": lead["current_stage_id"],
                                "moved_at": now_dt.isoformat(),
                                "moved_by": "system",
                                "action": "auto_followup_due",
                            }
                        },
                    },
                })
            from pymongo import UpdateOne
            await db.leads.bulk_write([UpdateOne(o["filter"], o["update"]) for o in ops])
    
    query = {"stage_type": "sales"}
    
    # Filter by assigned_to for Sales users — show ONLY their own leads
    if user.role == "sales":
        query["assigned_to"] = user.user_id
    
    if stage_id:
        query["current_stage_id"] = stage_id
    if search:
        search_conditions = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"alternative_phone": {"$regex": search, "$options": "i"}}
        ]
        # Use $and to combine with existing filters
        query = {"$and": [query, {"$or": search_conditions}]}
    if has_re_project is not None:
        if has_re_project:
            query["re_project_id"] = {"$ne": None}
        else:
            query["re_project_id"] = None
    
    # Filter by follow-up date if provided
    if followup_date:
        query["follow_ups"] = {
            "$elemMatch": {
                "scheduled_date": followup_date,
                "completed": False
            }
        }
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    leads = await filter_contacts_leads(db, leads, user.role)
    
    # Sort follow-up stage leads by earliest follow-up date (ascending)
    for lead in leads:
        if lead.get("current_stage_id") == "stg_sales_followup" and lead.get("follow_ups"):
            pending = [f for f in lead["follow_ups"] if not f.get("completed")]
            if pending:
                lead["next_followup_date"] = min(f["scheduled_date"] for f in pending)
    
    return mask_leads_phone(leads, user.role)


# ==================== LEAD STAGES MANAGEMENT ====================

@router.get("/crm/stages")
async def get_all_stages(stage_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all lead stages"""
    query = {"is_active": True}
    if stage_type:
        query["stage_type"] = stage_type

    # Always run idempotent migrations for sales stages (renames/reorders/deactivates legacy ones)
    # so the frontend reflects the latest 13-stage structure even on existing deployments.
    if stage_type == "sales":
        await get_default_sales_stages()
    elif stage_type == "pre_sales":
        await get_default_pre_sales_stages()
    elif stage_type is None:
        await get_default_pre_sales_stages()
        await get_default_sales_stages()

    stages = await db.lead_stages.find(query, {"_id": 0}).sort("order", 1).to_list(100)

    # Fallback safety net
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


@router.post("/crm/stages")
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


@router.patch("/crm/stages/{stage_id}")
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


@router.delete("/crm/stages/{stage_id}")
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


@router.get("/crm/stages/with-counts")
async def get_stages_with_counts(stage_type: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all stages with lead counts - for management UI"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can manage stages")
    
    query = {}
    if stage_type:
        query["stage_type"] = stage_type
    
    stages = await db.lead_stages.find(query, {"_id": 0}).sort([("stage_type", 1), ("order", 1)]).to_list(200)
    
    # Get lead counts per stage
    pipeline = [
        {"$group": {"_id": "$current_stage_id", "count": {"$sum": 1}}}
    ]
    lead_counts_raw = await db.leads.aggregate(pipeline).to_list(200)
    lead_counts = {item["_id"]: item["count"] for item in lead_counts_raw}
    
    for stage in stages:
        stage["lead_count"] = lead_counts.get(stage.get("stage_id"), 0)
    
    return stages



# ==================== CUSTOM FIELDS MANAGEMENT ====================

@router.get("/crm/custom-fields")
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


@router.post("/crm/custom-fields")
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


@router.patch("/crm/custom-fields/{field_id}")
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


@router.delete("/crm/custom-fields/{field_id}")
async def delete_custom_field(field_id: str, user: User = Depends(get_current_user)):
    """Delete a custom field (soft delete)"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Super Admin can delete fields")
    
    await db.custom_fields.update_one({"field_id": field_id}, {"$set": {"is_active": False}})
    return {"message": "Custom field deleted"}


# ==================== CSV IMPORT ENDPOINTS ====================

@router.get("/crm/import/template")
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


@router.post("/crm/import/csv")
async def import_csv_leads(data: CSVImportData, user: User = Depends(get_current_user)):
    """Import leads from CSV data"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get first stage
    stages = await get_default_pre_sales_stages()
    first_stage = stages[0] if stages else {"stage_id": "stg_new_lead"}
    
    import_batch_id = f"import_{uuid.uuid4().hex[:12]}"
    imported_count = 0
    skipped_duplicate = 0
    errors = []
    seen_phones_in_run: set[str] = set()
    
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
            
            # Country-code-tolerant + in-batch dedup on phone
            phone_raw = lead_data.get("phone") or ""
            phone_norm = normalize_phone(phone_raw)
            if phone_norm:
                if phone_norm in seen_phones_in_run:
                    skipped_duplicate += 1
                    continue
                existing = await find_existing_lead_by_phone(db, phone_raw)
                if existing:
                    skipped_duplicate += 1
                    continue
                seen_phones_in_run.add(phone_norm)

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
            
            lead_doc = lead.model_dump()
            if phone_norm:
                lead_doc["phone_normalized"] = phone_norm
            await db.leads.insert_one(lead_doc)
            imported_count += 1
            
        except Exception as e:
            errors.append({"row": idx + 1, "error": str(e)})
    
    return {
        "message": f"Imported {imported_count} leads ({skipped_duplicate} duplicates skipped)",
        "import_batch_id": import_batch_id,
        "imported_count": imported_count,
        "skipped_duplicate": skipped_duplicate,
        "error_count": len(errors),
        "errors": errors[:10]  # Return first 10 errors
    }


# ==================== RE PROJECT ENDPOINTS ====================

@router.get("/crm/re-projects")
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
    projects = await filter_contacts_re_projects(db, projects, user.role)
    return projects


@router.get("/crm/re-projects/search")
async def search_re_projects(q: str, user: User = Depends(get_current_user)):
    """Search RE projects by RE number (USB-RE0001) or project name"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"$or": [
        {"re_number": {"$regex": q, "$options": "i"}},
        {"project_name": {"$regex": q, "$options": "i"}},
        {"client_name": {"$regex": q, "$options": "i"}}
    ]}
    projects = await db.re_projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return projects


@router.get("/crm/re-projects/by-number/{re_number}")
async def get_re_revisions(re_number: str, user: User = Depends(get_current_user)):
    """Get all revisions for an RE number"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    projects = await db.re_projects.find(
        {"parent_re_number": re_number}, {"_id": 0}
    ).sort("revision", 1).to_list(50)
    return projects


@router.get("/crm/re-projects/{re_project_id}")
async def get_re_project(re_project_id: str, user: User = Depends(get_current_user)):
    """Get RE project details"""
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    # Get linked lead
    lead = await db.leads.find_one({"lead_id": project["lead_id"]}, {"_id": 0})
    
    result = {**project, "lead": lead}
    if user.role not in PRIVILEGED_ROLES:
        from core.contact_visibility import get_approved_re_project_ids
        approved = await get_approved_re_project_ids(db, [re_project_id])
        if re_project_id not in approved:
            result = strip_contact_fields(result)
    return result


class REProjectUpdate(BaseModel):
    project_name: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: Optional[str] = None
    rough_scope_items: Optional[List[Dict[str, Any]]] = None
    handover_months: Optional[int] = None
    estimated_total: Optional[float] = None
    planning_notes: Optional[str] = None


@router.patch("/crm/re-projects/{re_project_id}")
async def update_re_project(re_project_id: str, data: REProjectUpdate, user: User = Depends(get_current_user)):
    """Update RE project (Planning, GM, or Super Admin)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Planning or GM access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    # Lock RE after GM approval - only super_admin can override
    locked_statuses = ["re_approved", "sent_to_client", "client_feedback", "client_approved", "deal_closed", "converted"]
    if project["status"] in locked_statuses and user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="RE is locked after GM approval. Request a revision instead.")
    
    update = {"updated_at": datetime.now(timezone.utc)}
    changes = []
    
    if data.project_name is not None:
        if project.get("project_name") != data.project_name:
            changes.append({"field": "Project Name", "old": project.get("project_name", ""), "new": data.project_name})
        update["project_name"] = data.project_name
    if data.location is not None:
        if project.get("location") != data.location:
            changes.append({"field": "Location", "old": project.get("location", ""), "new": data.location})
        update["location"] = data.location
    if data.sqft is not None:
        if project.get("sqft") != data.sqft:
            changes.append({"field": "Square Feet", "old": str(project.get("sqft", "")), "new": str(data.sqft)})
        update["sqft"] = data.sqft
    if data.building_type is not None:
        if project.get("building_type") != data.building_type:
            changes.append({"field": "Building Type", "old": project.get("building_type", ""), "new": data.building_type})
        update["building_type"] = data.building_type
    if data.rough_scope_items is not None:
        old_items = project.get("rough_scope_items", [])
        new_items = data.rough_scope_items
        if old_items != new_items:
            old_count = len(old_items)
            new_count = len(new_items)
            old_total = sum(item.get("total", 0) for item in old_items)
            new_total = sum(item.get("total", 0) for item in new_items)
            changes.append({
                "field": "Scope Items",
                "old": f"{old_count} items, total {old_total}",
                "new": f"{new_count} items, total {new_total}"
            })
        update["rough_scope_items"] = data.rough_scope_items
        scope_total = sum(item.get("total", 0) for item in data.rough_scope_items)
        update["estimated_total"] = scope_total
    if data.handover_months is not None:
        if project.get("handover_months") != data.handover_months:
            changes.append({"field": "Handover Months", "old": str(project.get("handover_months", "")), "new": str(data.handover_months)})
        update["handover_months"] = data.handover_months
    if data.estimated_total is not None:
        update["estimated_total"] = data.estimated_total
    if data.planning_notes is not None:
        if project.get("planning_notes") != data.planning_notes:
            changes.append({"field": "Planning Notes", "old": project.get("planning_notes", ""), "new": data.planning_notes})
        update["planning_notes"] = data.planning_notes
    
    # Set status to in progress if it was requested or rejected
    if project["status"] in ["re_requested", "re_rejected"]:
        update["status"] = "re_in_progress"
        update["prepared_by"] = user.user_id
        update["prepared_at"] = datetime.now(timezone.utc)
    
    await db.re_projects.update_one({"re_project_id": re_project_id}, {"$set": update})
    
    # Save change log entry if there were actual changes
    if changes:
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1, "role": 1})
        log_entry = {
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "re_project_id": re_project_id,
            "user_id": user.user_id,
            "user_name": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "user_role": user.role,
            "changes": changes,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.re_change_logs.insert_one(log_entry)
    
    return {"message": "RE Project updated"}



@router.get("/crm/re-projects/{re_project_id}/change-logs")
async def get_re_change_logs(re_project_id: str, user: User = Depends(get_current_user)):
    """Get change logs for an RE project"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    logs = await db.re_change_logs.find(
        {"re_project_id": re_project_id}, {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    return logs



@router.post("/crm/re-projects/{re_project_id}/submit-for-approval")
async def submit_re_for_approval(re_project_id: str, user: User = Depends(get_current_user)):
    """Submit RE project for GM approval"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Planning access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    if project["status"] not in ["re_requested", "re_in_progress", "re_rejected"]:
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


@router.patch("/crm/re-projects/{re_project_id}/approve")
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
        
        # Update linked lead stage to "RE - From Planning"
        if project.get("lead_id"):
            await db.leads.update_one(
                {"lead_id": project["lead_id"]},
                {"$set": {"current_stage_id": "stg_re_from_planning", "updated_at": datetime.now(timezone.utc)}}
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
        now = datetime.now(timezone.utc)
        rejection_entry = {
            "reason": data.rejection_reason or "",
            "rejected_by": user.user_id,
            "rejected_by_name": user.name,
            "rejected_at": now.isoformat(),
            "revision": project.get("revision", 0),
            "re_number": project.get("re_number"),
            "estimated_total_at_rejection": project.get("estimated_total", 0),
        }
        update = {
            "status": "re_rejected",
            "gm_rejection_reason": data.rejection_reason,  # latest reason (legacy convenience)
            "gm_approved_at": now,
            "updated_at": now,
        }
        await db.re_projects.update_one(
            {"re_project_id": re_project_id},
            {"$set": update, "$push": {"rejection_history": rejection_entry}},
        )
        # Notify Planning about rejection
        notification = {
            "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": "all_planning",
            "title": "RE Rejected",
            "message": f"Rough Estimate for '{project.get('project_name', project['client_name'])}' was rejected. Reason: {data.rejection_reason or 'No reason provided'}",
            "type": "re_rejected",
            "reference_id": re_project_id,
            "is_read": False,
            "created_at": now,
        }
        await db.notifications.insert_one(notification)
        return {"message": "RE Project rejected"}

    await db.re_projects.update_one({"re_project_id": re_project_id}, {"$set": update})

    return {"message": "RE Project " + ("approved" if data.approved else "rejected")}



# ==================== RE REVISION & CLIENT WORKFLOW ====================

class SendToClientRequest(BaseModel):
    notes: Optional[str] = None

@router.post("/crm/re-projects/{re_project_id}/send-to-client")
async def send_re_to_client(re_project_id: str, data: SendToClientRequest = SendToClientRequest(), user: User = Depends(get_current_user)):
    """Sales sends RE to client after GM approval"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    if project["status"] != "re_approved":
        raise HTTPException(status_code=400, detail="RE must be GM-approved before sending to client")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "status": "sent_to_client",
            "sent_to_client_by": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "sent_to_client_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    return {"message": "RE sent to client"}


class ClientFeedbackRequest(BaseModel):
    feedback_notes: str

@router.post("/crm/re-projects/{re_project_id}/client-feedback")
async def add_client_feedback(re_project_id: str, data: ClientFeedbackRequest, user: User = Depends(get_current_user)):
    """Sales adds client feedback/suggestions for this RE revision"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    if project["status"] != "sent_to_client":
        raise HTTPException(status_code=400, detail="RE must be in 'Sent to Client' status")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "status": "client_feedback",
            "client_feedback_notes": data.feedback_notes,
            "client_feedback_by": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "client_feedback_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Notify Planning to create a revision
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_planning",
        "title": "Client Feedback on RE",
        "message": f"Client feedback received for '{project.get('project_name', project['client_name'])}' ({project.get('re_number', '')} RE{project.get('revision', 0)}). Revision needed.",
        "type": "re_client_feedback",
        "reference_id": re_project_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Client feedback added. Planning will be notified."}


@router.post("/crm/re-projects/{re_project_id}/client-approve")
async def client_approve_re(re_project_id: str, user: User = Depends(get_current_user)):
    """Sales marks RE as client-approved"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    if project["status"] != "sent_to_client":
        raise HTTPException(status_code=400, detail="RE must be in 'Sent to Client' status")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "status": "client_approved",
            "client_approved_by": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "client_approved_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    return {"message": "RE marked as client-approved. Ready for deal closure."}


class RevisionRequest(BaseModel):
    reason: Optional[str] = None

@router.post("/crm/re-projects/{re_project_id}/request-revision")
async def request_re_revision(re_project_id: str, data: RevisionRequest = RevisionRequest(), user: User = Depends(get_current_user)):
    """Sales/CRE requests a revision on an RE - notifies Planning to create the duplicate"""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales/CRE access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    allowed = ["re_approved", "sent_to_client", "client_feedback"]
    if project["status"] not in allowed:
        raise HTTPException(status_code=400, detail="RE must be approved or sent to client to request revision")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "revision_requested": True,
            "revision_requested_by": user_doc.get("name", "Unknown") if user_doc else "Unknown",
            "revision_requested_at": datetime.now(timezone.utc),
            "revision_reason": data.reason or "",
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Notify Planning
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_planning",
        "title": "Revision Requested",
        "message": f"Sales requested revision for '{project.get('project_name', project['client_name'])}' (RE{project.get('revision', 0)}). Reason: {data.reason or 'No reason specified'}",
        "type": "re_revision_requested",
        "reference_id": re_project_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Revision requested. Planning team has been notified."}


# ========== Sales-side RE-Client actions ==========
class SalesRevisionReq(BaseModel):
    reason: Optional[str] = None


@router.post("/crm/leads/{lead_id}/re-client-approve")
async def re_client_approve(lead_id: str, user: User = Depends(get_current_user)):
    """Sales marks the RE-Client stage as APPROVED → moves lead to Negotiation and marks RE client-approved."""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    now = datetime.now(timezone.utc)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    user_name = (user_doc or {}).get("name", "Unknown")
    re_project_id = lead.get("re_project_id")
    if re_project_id:
        await db.re_projects.update_one(
            {"re_project_id": re_project_id},
            {"$set": {
                "status": "client_approved",
                "client_approved_by": user_name,
                "client_approved_at": now,
                "updated_at": now
            }}
        )
    stage_history = lead.get("stage_history", [])
    stage_history.append({
        "stage_id": "stg_payment_collect",
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "moved_by_name": user_name,
        "action": "client_approved_re"
    })
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"current_stage_id": "stg_payment_collect", "stage_history": stage_history, "updated_at": now}}
    )
    return {"message": "Client approved RE. Lead moved to Deal Close."}


@router.post("/crm/leads/{lead_id}/re-client-revision")
async def re_client_revision(lead_id: str, data: SalesRevisionReq = SalesRevisionReq(), user: User = Depends(get_current_user)):
    """Sales requests REVISION from RE-Client → creates next revision (RE1..) and moves lead back to RE-Request."""
    if user.role not in [UserRole.SUPER_ADMIN, "sales", "cre"]:
        raise HTTPException(status_code=403, detail="Sales access required")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    re_project_id = lead.get("re_project_id")
    if not re_project_id:
        raise HTTPException(status_code=400, detail="No RE project linked to this lead")
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    now = datetime.now(timezone.utc)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    user_name = (user_doc or {}).get("name", "Unknown")
    # Flag revision on current
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$set": {
            "revision_requested": True,
            "revision_requested_by": user_name,
            "revision_requested_at": now,
            "revision_reason": data.reason or "",
            "updated_at": now,
        }}
    )
    parent_re_number = project.get("parent_re_number") or project.get("re_number")
    highest = await db.re_projects.find({"parent_re_number": parent_re_number}).sort("revision", -1).limit(1).to_list(1)
    next_revision = (highest[0]["revision"] + 1) if highest else 1
    new_re = REProject(
        lead_id=project["lead_id"],
        client_name=project["client_name"],
        client_email=project.get("client_email"),
        client_phone=project.get("client_phone"),
        project_name=project.get("project_name"),
        location=project.get("location"),
        sqft=project.get("sqft"),
        building_type=project.get("building_type"),
        handover_months=project.get("handover_months"),
        rough_scope_items=project.get("rough_scope_items", []),
        estimated_total=project.get("estimated_total", 0),
        planning_notes=project.get("planning_notes", ""),
        status=REProjectStatus.RE_IN_PROGRESS,
        created_by=user.user_id,
        re_number=project.get("re_number"),
        revision=next_revision,
        parent_re_number=parent_re_number,
    )
    new_dict = new_re.model_dump()
    new_dict["previous_client_feedback"] = data.reason or project.get("client_feedback_notes", "")
    new_dict["client_feedback_notes"] = data.reason or ""
    new_dict["client_feedback_by"] = user_name
    new_dict["client_feedback_at"] = now
    new_dict["revision_reason"] = data.reason or ""
    new_dict["duplicated_from_re_project_id"] = re_project_id
    # Carry over attachments from previous revision (planning may keep reference files)
    new_dict["attachments"] = project.get("attachments", [])
    await db.re_projects.insert_one(new_dict)
    stage_history = lead.get("stage_history", [])
    stage_history.append({
        "stage_id": "stg_re_requested",
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "moved_by_name": user_name,
        "action": f"revision_requested_re{next_revision}",
        "remark": data.reason or ""
    })
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "current_stage_id": "stg_re_requested",
            "stage_history": stage_history,
            "re_project_id": new_re.re_project_id,
            "re_revision_number": next_revision,
            "updated_at": now
        }}
    )
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_planning",
        "title": f"Revision Requested — RE{next_revision}",
        "message": f"Sales requested RE{next_revision} for '{project.get('project_name', project['client_name'])}'. Reason: {data.reason or 'None'}",
        "type": "re_revision_requested",
        "reference_id": new_re.re_project_id,
        "is_read": False,
        "created_at": now
    })
    return {
        "message": f"Revision RE{next_revision} created; lead moved back to RE-Request",
        "re_project_id": new_re.re_project_id,
        "revision": next_revision
    }


@router.post("/crm/re-projects/{re_project_id}/create-revision")
async def create_re_revision(re_project_id: str, user: User = Depends(get_current_user)):
    """Planning creates a new revision (RE1, RE2...) by duplicating the current RE"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Planning access required")
    
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE Project not found")
    
    allowed_for_revision = ["client_feedback", "re_approved", "sent_to_client"]
    if project["status"] not in allowed_for_revision and not project.get("revision_requested"):
        raise HTTPException(status_code=400, detail="RE must have client feedback or a revision request to create a new revision")
    
    parent_re_number = project.get("parent_re_number") or project.get("re_number")
    
    # Find highest revision number for this RE number group
    highest = await db.re_projects.find(
        {"parent_re_number": parent_re_number}
    ).sort("revision", -1).limit(1).to_list(1)
    next_revision = (highest[0]["revision"] + 1) if highest else 1
    
    # Create new revision - duplicate from previous
    new_re = REProject(
        lead_id=project["lead_id"],
        client_name=project["client_name"],
        client_email=project.get("client_email"),
        client_phone=project.get("client_phone"),
        project_name=project.get("project_name"),
        location=project.get("location"),
        sqft=project.get("sqft"),
        building_type=project.get("building_type"),
        handover_months=project.get("handover_months"),
        rough_scope_items=project.get("rough_scope_items", []),
        estimated_total=project.get("estimated_total", 0),
        planning_notes=project.get("planning_notes", ""),
        status=REProjectStatus.RE_IN_PROGRESS,
        created_by=user.user_id,
        re_number=project.get("re_number"),
        revision=next_revision,
        parent_re_number=parent_re_number
    )
    
    new_dict = new_re.model_dump()
    # Carry over context for Planning
    new_dict["previous_client_feedback"] = project.get("client_feedback_notes", "")
    new_dict["revision_reason"] = project.get("revision_reason", "")
    new_dict["duplicated_from_re_project_id"] = re_project_id
    await db.re_projects.insert_one(new_dict)
    
    # Update the lead to point to the latest revision
    await db.leads.update_one(
        {"lead_id": project["lead_id"]},
        {"$set": {"re_project_id": new_re.re_project_id, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Notify Sales about the new revision
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_sales",
        "title": f"RE Revision {next_revision} Created",
        "message": f"Planning created RE{next_revision} for '{project.get('project_name', project['client_name'])}'. The new revision is ready for review.",
        "type": "re_revision_created",
        "reference_id": new_re.re_project_id,
        "is_read": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.notifications.insert_one(notification)
    
    return {
        "message": f"Revision RE{next_revision} created",
        "re_project_id": new_re.re_project_id,
        "revision": next_revision
    }




# ==================== PLANNING RE DASHBOARD ====================

@router.get("/crm/planning/re-dashboard")
async def get_planning_re_dashboard(user: User = Depends(get_current_user)):
    """Get Planning Department RE dashboard"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER]:
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


# ==================== LEAD DISTRIBUTION ENGINE ====================

class LeadDistributionSettings(BaseModel):
    """Settings for auto-distributing leads"""
    settings_id: str = Field(default_factory=lambda: f"lds_{uuid.uuid4().hex[:8]}")
    distribution_type: str = "round_robin"  # round_robin, manual, weighted
    enabled: bool = True
    pre_sales_team: List[str] = []  # List of pre_sales user_ids
    sales_team: List[str] = []  # List of sales user_ids
    pre_sales_current_index: int = 0
    sales_current_index: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def get_distribution_settings():
    """Get or create distribution settings"""
    settings = await db.lead_distribution_settings.find_one({}, {"_id": 0})
    if not settings:
        # Initialize with existing pre_sales and sales users
        pre_sales_users = await db.users.find({"role": "pre_sales"}, {"_id": 0, "user_id": 1}).to_list(100)
        sales_users = await db.users.find({"role": "sales"}, {"_id": 0, "user_id": 1}).to_list(100)
        
        settings = LeadDistributionSettings(
            pre_sales_team=[u["user_id"] for u in pre_sales_users],
            sales_team=[u["user_id"] for u in sales_users]
        )
        settings_dict = settings.model_dump()
        settings_dict["created_at"] = settings_dict["created_at"].isoformat()
        settings_dict["updated_at"] = settings_dict["updated_at"].isoformat()
        await db.lead_distribution_settings.insert_one(settings_dict)
        return settings.model_dump()
    return settings


async def assign_lead_to_next_user(stage_type: str) -> Optional[str]:
    """Round-robin assignment of lead to next available team member"""
    settings = await get_distribution_settings()
    
    if not settings.get("enabled", True):
        return None
    
    if stage_type == "pre_sales":
        team = settings.get("pre_sales_team", [])
        current_idx = settings.get("pre_sales_current_index", 0)
        index_field = "pre_sales_current_index"
        role_name = "pre_sales"
    else:
        team = settings.get("sales_team", [])
        current_idx = settings.get("sales_current_index", 0)
        index_field = "sales_current_index"
        role_name = "sales"
    
    # Validate team members actually exist and are active in the DB
    if team:
        valid_users = await db.users.find(
            {"user_id": {"$in": team}, "role": role_name, "is_active": {"$ne": False}},
            {"_id": 0, "user_id": 1}
        ).to_list(100)
        valid_ids = [u["user_id"] for u in valid_users]
        if len(valid_ids) != len(team):
            logger.info(f"Round-robin {role_name}: stale team detected ({len(team)} saved, {len(valid_ids)} valid). Auto-refreshing.")
            team = valid_ids
    
    # Auto-detect team members from users collection if team is empty or all stale
    if not team:
        users = await db.users.find({"role": role_name, "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(100)
        team = [u["user_id"] for u in users]
        logger.info(f"Round-robin {role_name}: auto-detected {len(team)} team members from users collection")
    
    # Save refreshed team to settings
    if team:
        team_field = f"{stage_type}_team"
        await db.lead_distribution_settings.update_one(
            {},
            {"$set": {team_field: team, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
    
    if not team:
        logger.warning(f"Round-robin {role_name}: no team members found, cannot assign")
        return None
    
    # Ensure index is within bounds
    current_idx = current_idx % len(team)
    
    # Get next user (round-robin)
    assigned_user_id = team[current_idx]
    next_idx = (current_idx + 1) % len(team)
    
    # Update index
    await db.lead_distribution_settings.update_one(
        {},
        {"$set": {index_field: next_idx, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    logger.info(f"Round-robin {role_name}: assigned to {assigned_user_id} (index {current_idx} -> {next_idx})")
    return assigned_user_id


@router.get("/marketing/distribution-settings")
async def get_lead_distribution_settings(user: User = Depends(get_current_user)):
    """Get lead distribution settings - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    settings = await get_distribution_settings()
    
    # Get user details for team members
    pre_sales_users = await db.users.find(
        {"user_id": {"$in": settings.get("pre_sales_team", [])}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(100)
    
    sales_users = await db.users.find(
        {"user_id": {"$in": settings.get("sales_team", [])}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}
    ).to_list(100)
    
    settings["pre_sales_team_details"] = pre_sales_users
    settings["sales_team_details"] = sales_users
    
    return settings


class UpdateDistributionSettings(BaseModel):
    enabled: Optional[bool] = None
    distribution_type: Optional[str] = None
    pre_sales_team: Optional[List[str]] = None
    sales_team: Optional[List[str]] = None


@router.patch("/marketing/distribution-settings")
async def update_distribution_settings(data: UpdateDistributionSettings, user: User = Depends(get_current_user)):
    """Update lead distribution settings - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    update_dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.enabled is not None:
        update_dict["enabled"] = data.enabled
    if data.distribution_type:
        update_dict["distribution_type"] = data.distribution_type
    if data.pre_sales_team is not None:
        update_dict["pre_sales_team"] = data.pre_sales_team
        update_dict["pre_sales_current_index"] = 0
    if data.sales_team is not None:
        update_dict["sales_team"] = data.sales_team
        update_dict["sales_current_index"] = 0
    
    await get_distribution_settings()  # Ensure exists
    await db.lead_distribution_settings.update_one({}, {"$set": update_dict})
    
    return {"message": "Distribution settings updated"}


@router.post("/marketing/distribution-settings/refresh")
async def refresh_distribution_teams(user: User = Depends(get_current_user)):
    """Auto-detect and refresh team members from users collection"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    pre_sales_users = await db.users.find({"role": "pre_sales", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(100)
    sales_users = await db.users.find({"role": "sales", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(100)
    
    pre_sales_team = [u["user_id"] for u in pre_sales_users]
    sales_team = [u["user_id"] for u in sales_users]
    
    await db.lead_distribution_settings.update_one(
        {},
        {"$set": {
            "pre_sales_team": pre_sales_team,
            "sales_team": sales_team,
            "pre_sales_current_index": 0,
            "sales_current_index": 0,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {
        "message": "Teams refreshed",
        "pre_sales_team": [{"user_id": u["user_id"], "name": u["name"]} for u in pre_sales_users],
        "sales_team": [{"user_id": u["user_id"], "name": u["name"]} for u in sales_users]
    }



@router.post("/crm/fix-unassigned-sales-leads")
async def fix_unassigned_sales_leads(user: User = Depends(get_current_user)):
    """Fix existing unassigned leads by assigning them via round-robin - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    unassigned_query = {"$or": [
        {"assigned_to": None},
        {"assigned_to": {"$exists": False}},
        {"assigned_to": ""}
    ]}
    
    # Fix unassigned SALES leads
    sales_unassigned = await db.leads.find(
        {**unassigned_query, "stage_type": "sales"},
        {"_id": 0, "lead_id": 1, "name": 1}
    ).to_list(1000)
    
    sales_fixed = 0
    for lead in sales_unassigned:
        assigned_user_id = await assign_lead_to_next_user("sales")
        if assigned_user_id:
            assigned_user = await db.users.find_one({"user_id": assigned_user_id}, {"_id": 0, "name": 1})
            assigned_name = assigned_user.get("name") if assigned_user else None
            await db.leads.update_one(
                {"lead_id": lead["lead_id"]},
                {"$set": {
                    "assigned_to": assigned_user_id,
                    "assigned_to_name": assigned_name,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            sales_fixed += 1
    
    # Fix unassigned PRE-SALES leads
    presales_unassigned = await db.leads.find(
        {**unassigned_query, "stage_type": "pre_sales"},
        {"_id": 0, "lead_id": 1, "name": 1}
    ).to_list(5000)
    
    presales_fixed = 0
    for lead in presales_unassigned:
        assigned_user_id = await assign_lead_to_next_user("pre_sales")
        if assigned_user_id:
            assigned_user = await db.users.find_one({"user_id": assigned_user_id}, {"_id": 0, "name": 1})
            assigned_name = assigned_user.get("name") if assigned_user else None
            await db.leads.update_one(
                {"lead_id": lead["lead_id"]},
                {"$set": {
                    "assigned_to": assigned_user_id,
                    "assigned_to_name": assigned_name,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            presales_fixed += 1
    
    return {
        "message": f"Fixed {sales_fixed} sales + {presales_fixed} pre-sales unassigned leads",
        "sales_fixed": sales_fixed,
        "presales_fixed": presales_fixed,
        "total_sales_unassigned": len(sales_unassigned),
        "total_presales_unassigned": len(presales_unassigned)
    }



@router.get("/marketing/dashboard")
async def get_marketing_dashboard(user: User = Depends(get_current_user)):
    """Get Marketing Board dashboard - Super Admin can see all team performance"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Auto-refresh distribution settings to ensure team lists are up-to-date
    pre_sales_users_all = await db.users.find({"role": "pre_sales", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(100)
    sales_users_all = await db.users.find({"role": "sales", "is_active": {"$ne": False}}, {"_id": 0, "user_id": 1}).to_list(100)
    current_settings = await get_distribution_settings()
    saved_ps = set(current_settings.get("pre_sales_team", []))
    saved_sales = set(current_settings.get("sales_team", []))
    actual_ps = set(u["user_id"] for u in pre_sales_users_all)
    actual_sales = set(u["user_id"] for u in sales_users_all)
    if saved_ps != actual_ps or saved_sales != actual_sales:
        await db.lead_distribution_settings.update_one(
            {},
            {"$set": {
                "pre_sales_team": list(actual_ps),
                "sales_team": list(actual_sales),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        logger.info(f"Marketing dashboard: auto-refreshed distribution teams (PS: {len(actual_ps)}, Sales: {len(actual_sales)})")
    
    # Get all pre-sales and sales team members
    pre_sales_users = await db.users.find({"role": "pre_sales"}, {"_id": 0}).to_list(100)
    sales_users = await db.users.find({"role": "sales"}, {"_id": 0}).to_list(100)
    
    # Get lead counts per user
    pre_sales_stats = []
    for ps_user in pre_sales_users:
        leads = await db.leads.count_documents({
            "assigned_to": ps_user["user_id"],
            "stage_type": "pre_sales"
        })
        converted = await db.leads.count_documents({
            "assigned_to": ps_user["user_id"],
            "stage_type": "pre_sales",
            "transferred_to_lead_id": {"$ne": None}
        })
        pre_sales_stats.append({
            "user_id": ps_user["user_id"],
            "name": ps_user.get("name"),
            "email": ps_user.get("email"),
            "total_leads": leads,
            "converted": converted,
            "conversion_rate": round((converted / leads * 100), 1) if leads > 0 else 0
        })
    
    sales_stats = []
    for s_user in sales_users:
        leads = await db.leads.count_documents({
            "assigned_to": s_user["user_id"],
            "stage_type": "sales"
        })
        closed = await db.leads.count_documents({
            "assigned_to": s_user["user_id"],
            "stage_type": "sales",
            "current_stage_id": "stg_payment_collect"
        })
        sales_stats.append({
            "user_id": s_user["user_id"],
            "name": s_user.get("name"),
            "email": s_user.get("email"),
            "total_appointments": leads,
            "deals_closed": closed,
            "close_rate": round((closed / leads * 100), 1) if leads > 0 else 0
        })
    
    # Get overall stats
    total_pre_sales_leads = await db.leads.count_documents({"stage_type": "pre_sales"})
    total_sales_leads = await db.leads.count_documents({"stage_type": "sales"})
    
    # Get leads by source
    source_pipeline = [
        {"$match": {"stage_type": "pre_sales"}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    leads_by_source = await db.leads.aggregate(source_pipeline).to_list(20)
    
    # Get recent leads
    recent_leads = await db.leads.find(
        {},
        {"_id": 0, "lead_id": 1, "name": 1, "source": 1, "stage_type": 1, "assigned_to": 1, "created_at": 1}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    # Enrich with assigned user names
    user_ids = list(set(l.get("assigned_to") for l in recent_leads if l.get("assigned_to")))
    users_map = {}
    if user_ids:
        users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(100)
        users_map = {u["user_id"]: u["name"] for u in users}
    
    for lead in recent_leads:
        lead["assigned_to_name"] = users_map.get(lead.get("assigned_to"), "Unassigned")
    
    return {
        "pre_sales_team": pre_sales_stats,
        "sales_team": sales_stats,
        "total_pre_sales_leads": total_pre_sales_leads,
        "total_sales_leads": total_sales_leads,
        "leads_by_source": leads_by_source,
        "recent_leads": recent_leads,
        "distribution_settings": await get_distribution_settings()
    }


@router.get("/marketing/team-members")
async def get_team_members(user: User = Depends(get_current_user)):
    """Get all Pre-Sales and Sales team members"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    pre_sales = await db.users.find({"role": "pre_sales"}, {"_id": 0, "password": 0}).to_list(100)
    sales = await db.users.find({"role": "sales"}, {"_id": 0, "password": 0}).to_list(100)
    
    return {
        "pre_sales_team": pre_sales,
        "sales_team": sales
    }


class CreateTeamMemberInput(BaseModel):
    name: str
    email: str
    role: str  # pre_sales or sales
    phone: Optional[str] = None


@router.post("/marketing/team-members")
async def create_team_member(data: CreateTeamMemberInput, user: User = Depends(get_current_user)):
    """Create a new Pre-Sales or Sales team member - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    if data.role not in ["pre_sales", "sales"]:
        raise HTTPException(status_code=400, detail="Role must be 'pre_sales' or 'sales'")
    
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    new_user = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": data.email.lower(),
        "name": data.name,
        "role": data.role,
        "phone": data.phone,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(new_user)
    
    # Auto-add to distribution team
    settings = await get_distribution_settings()
    team_field = "pre_sales_team" if data.role == "pre_sales" else "sales_team"
    current_team = settings.get(team_field, [])
    current_team.append(new_user["user_id"])
    
    await db.lead_distribution_settings.update_one(
        {},
        {"$set": {team_field: current_team, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Team member created", "user_id": new_user["user_id"]}


@router.post("/marketing/assign-lead/{lead_id}")
async def manually_assign_lead(lead_id: str, assigned_to: str, user: User = Depends(get_current_user)):
    """Manually assign a lead to a team member - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Get assignee name
    assignee = await db.users.find_one({"user_id": assigned_to}, {"_id": 0})
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")
    
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "assigned_to": assigned_to,
            "assigned_to_name": assignee.get("name"),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": f"Lead assigned to {assignee.get('name')}"}


@router.get("/marketing/all-leads")
async def get_all_leads_for_marketing(
    user: User = Depends(get_current_user),
    stage_type: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = 500
):
    """Get all leads with assignment info - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    query = {}
    if stage_type and stage_type != 'all':
        query["stage_type"] = stage_type
    if assigned_to and assigned_to != 'all':
        query["assigned_to"] = assigned_to
    if source and source != 'all':
        query["source"] = source
    
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.leads.count_documents(query)
    
    # Enrich with assigned user names
    user_ids = list(set(l.get("assigned_to") for l in leads if l.get("assigned_to")))
    users_map = {}
    if user_ids:
        users = await db.users.find({"user_id": {"$in": user_ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(100)
        users_map = {u["user_id"]: u["name"] for u in users}
    
    for lead in leads:
        lead["assigned_to_name"] = users_map.get(lead.get("assigned_to"), "Unassigned")
    
    return {"leads": leads, "total": total}


@router.delete("/marketing/leads/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user)):
    """Delete a lead - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Check if lead exists
    lead = await db.leads.find_one({"lead_id": lead_id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Delete the lead
    await db.leads.delete_one({"lead_id": lead_id})
    
    # Also delete from sales_leads if exists
    await db.sales_leads.delete_one({"lead_id": lead_id})
    
    return {"message": "Lead deleted successfully"}


@router.post("/marketing/leads/bulk-delete")
async def bulk_delete_leads(request: Request, user: User = Depends(get_current_user)):
    """Bulk delete leads - Super Admin only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    data = await request.json()
    lead_ids = data.get("lead_ids", [])
    
    if not lead_ids:
        raise HTTPException(status_code=400, detail="No lead IDs provided")
    
    result = await db.leads.delete_many({"lead_id": {"$in": lead_ids}})
    await db.sales_leads.delete_many({"lead_id": {"$in": lead_ids}})
    
    return {"message": f"Deleted {result.deleted_count} leads", "deleted": result.deleted_count}



# ==================== END LEAD DISTRIBUTION ENGINE ====================


# ==================== GOOGLE SHEETS INTEGRATION ====================

from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from fastapi.responses import RedirectResponse
import warnings

# Google Sheets OAuth Config - loaded from environment
GOOGLE_SHEETS_CLIENT_ID = os.environ.get('GOOGLE_SHEETS_CLIENT_ID', '')
GOOGLE_SHEETS_CLIENT_SECRET = os.environ.get('GOOGLE_SHEETS_CLIENT_SECRET', '')
GOOGLE_SHEETS_REDIRECT_URI = os.environ.get('GOOGLE_SHEETS_REDIRECT_URI', '')
GOOGLE_SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]


class GoogleSheetSource(BaseModel):
    source_id: str = Field(default_factory=lambda: f"gs_{uuid.uuid4().hex[:12]}")
    name: str  # e.g., "Website", "Meta Ads"
    spreadsheet_id: str
    sheet_name: Optional[str] = "Sheet1"
    column_mapping: Dict[str, str] = {}  # {"A": "lead_name", "B": "phone", etc.}
    custom_fields: List[str] = []  # List of custom field names detected
    last_synced: Optional[str] = None
    row_count: int = 0
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class GoogleSheetsConfig(BaseModel):
    config_id: str = Field(default_factory=lambda: f"gsc_{uuid.uuid4().hex[:12]}")
    user_id: str
    is_connected: bool = False
    sources: List[GoogleSheetSource] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# Standard lead field mappings
STANDARD_LEAD_FIELDS = {
    "name": ["name", "lead name", "lead_name", "full name", "fullname", "client name", "customer name"],
    "phone": ["phone", "phone number", "phone_number", "mobile", "mobile number", "contact", "contact number", "number"],
    "email": ["email", "email address", "email_address", "e-mail", "mail"],
    "city": ["city", "location", "address", "area", "locality", "loaction"],
    "sqft": ["sqft", "sq ft", "square feet", "area sqft", "plot size", "area", "size"],
    "source": ["source", "lead source", "lead_source", "campaign", "utm_source"],
    "budget": ["budget", "expected budget", "price range"],
    "duration": ["duration", "timeline", "time frame", "timeframe", "when", "expected start", "start time", "construction timeline"],
    "notes": ["notes", "remarks", "comments", "description"]
}


def normalize_column_name(col: str) -> str:
    """Normalize column name for matching"""
    return col.lower().strip().replace("_", " ").replace("-", " ")


def normalize_phone(phone) -> str:
    """Normalize a phone string to its last 10 digits.

    Handles values like:
      "+91 9876543210", "91 9876543210", "9876543210", 9876543210 (int),
      "+91-98765-43210", "91 98765 43210" → all collapse to "9876543210".
    Returns empty string for missing/invalid input.
    """
    if phone is None:
        return ""
    digits = ''.join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return ""
    # Indian numbers are 10 digits. Anything longer → take the last 10.
    return digits[-10:] if len(digits) >= 10 else digits


async def find_existing_lead_by_phone(db_handle, phone: str):
    """Look up an existing lead by phone, tolerant of country-code variants."""
    norm = normalize_phone(phone)
    if not norm:
        return None
    # Match either the exact normalized 10-digit form OR any phone string
    # whose digits end with these 10 digits (covers stored values like
    # "+91 9876543210", "919876543210", etc.)
    return await db_handle.leads.find_one({
        "$or": [
            {"phone": norm},
            {"phone_normalized": norm},
            {"phone": {"$regex": f"{norm}$"}},
        ]
    })


def auto_map_column(col_name: str) -> Optional[str]:
    """Auto-map a column name to a standard field"""
    normalized = normalize_column_name(col_name)
    for field, aliases in STANDARD_LEAD_FIELDS.items():
        if normalized in aliases:
            return field
    return None


@router.get("/sheets/config")
async def get_sheets_config(user: User = Depends(get_current_user)):
    """Get Google Sheets configuration for current user"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    config = await db.google_sheets_config.find_one({"user_id": user.user_id}, {"_id": 0})
    if not config:
        # Create default config
        config = GoogleSheetsConfig(user_id=user.user_id).model_dump()
        await db.google_sheets_config.insert_one(config)
    
    # Check if OAuth tokens exist
    tokens = await db.google_sheets_tokens.find_one({"user_id": user.user_id}, {"_id": 0})
    config["is_connected"] = bool(tokens and tokens.get("access_token"))
    config["has_credentials"] = bool(GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET)
    
    return config


@router.get("/sheets/oauth/login")
async def sheets_oauth_login(request: Request, user: User = Depends(get_current_user)):
    """Start Google Sheets OAuth flow"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    if not GOOGLE_SHEETS_CLIENT_ID or not GOOGLE_SHEETS_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Google Sheets credentials not configured. Please add GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET to backend/.env")
    
    # Build redirect_uri from FRONTEND_URL (which is set per environment)
    frontend_url = os.environ.get('FRONTEND_URL', '')
    if frontend_url:
        redirect_uri = f"{frontend_url}/api/oauth/sheets/callback"
    else:
        # Fallback: try dynamic detection from request headers
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        scheme = request.headers.get("x-forwarded-proto") or "https"
        redirect_uri = f"{scheme}://{host}/api/oauth/sheets/callback" if host else GOOGLE_SHEETS_REDIRECT_URI
    logger.info(f"Sheets OAuth login: using redirect_uri={redirect_uri}")
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": GOOGLE_SHEETS_CLIENT_ID,
            "client_secret": GOOGLE_SHEETS_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=GOOGLE_SHEETS_SCOPES, redirect_uri=redirect_uri)
    
    url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent'
    )
    
    # Save state with user_id, redirect_uri, and code_verifier for callback
    state_doc = {
        "state": state,
        "user_id": user.user_id,
        "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    }
    # Save code_verifier if PKCE is used (newer google-auth-oauthlib)
    if hasattr(flow, 'code_verifier') and flow.code_verifier:
        state_doc["code_verifier"] = flow.code_verifier
    await db.oauth_states.insert_one(state_doc)
    
    return {"auth_url": url}


@router.get("/oauth/sheets/callback")
async def sheets_oauth_callback(code: str, state: str, request: Request, response: Response):
    """Handle Google Sheets OAuth callback"""
    # Verify state
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    
    user_id = state_doc["user_id"]
    # Use the same redirect_uri that was used during login
    redirect_uri = state_doc.get("redirect_uri", GOOGLE_SHEETS_REDIRECT_URI)
    code_verifier = state_doc.get("code_verifier")
    await db.oauth_states.delete_one({"state": state})
    
    if not GOOGLE_SHEETS_CLIENT_ID or not GOOGLE_SHEETS_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="Google Sheets credentials not configured")
    
    # Set environment variable to relax scope checking
    import os as _os
    _os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
    
    logger.info(f"Sheets OAuth callback: using redirect_uri={redirect_uri}, has_code_verifier={bool(code_verifier)}")
    
    flow = Flow.from_client_config({
        "web": {
            "client_id": GOOGLE_SHEETS_CLIENT_ID,
            "client_secret": GOOGLE_SHEETS_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token"
        }
    }, scopes=GOOGLE_SHEETS_SCOPES, redirect_uri=redirect_uri)
    
    # Restore code_verifier for PKCE
    if code_verifier:
        flow.code_verifier = code_verifier
    
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error(f"Token fetch error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to complete Google authentication: {str(e)}")
    
    creds = flow.credentials
    
    # Save tokens (don't block on scope mismatch - user may not have granted all)
    token_doc = {
        "user_id": user_id,
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expires_at": creds.expiry.isoformat() if creds.expiry else None,
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": GOOGLE_SHEETS_CLIENT_ID,
        "client_secret": GOOGLE_SHEETS_CLIENT_SECRET,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.google_sheets_tokens.update_one(
        {"user_id": user_id},
        {"$set": token_doc},
        upsert=True
    )
    
    # Update config
    await db.google_sheets_config.update_one(
        {"user_id": user_id},
        {"$set": {"is_connected": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    # Redirect back to marketing board - use the request origin for dynamic redirect
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    scheme = request.headers.get("x-forwarded-proto") or "https"
    frontend_url = f"{scheme}://{host}" if host else os.environ.get('FRONTEND_URL', '')
    return RedirectResponse(f"{frontend_url}/marketing-board?sheets_connected=true")


async def get_sheets_credentials(user_id: str) -> Optional[Credentials]:
    """Get valid Google Sheets credentials for a user"""
    token_doc = await db.google_sheets_tokens.find_one({"user_id": user_id})
    if not token_doc or not token_doc.get("access_token"):
        return None
    
    creds = Credentials(
        token=token_doc["access_token"],
        refresh_token=token_doc.get("refresh_token"),
        token_uri=token_doc["token_uri"],
        client_id=token_doc["client_id"],
        client_secret=token_doc["client_secret"]
    )
    
    # Check if expired and refresh
    if token_doc.get("expires_at"):
        expires = datetime.fromisoformat(token_doc["expires_at"].replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) >= expires:
            try:
                creds.refresh(GoogleRequest())
                # Update stored token
                await db.google_sheets_tokens.update_one(
                    {"user_id": user_id},
                    {"$set": {
                        "access_token": creds.token,
                        "expires_at": creds.expiry.isoformat() if creds.expiry else None,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            except Exception as e:
                logger.error(f"Failed to refresh sheets token: {e}")
                return None
    
    return creds


@router.post("/sheets/disconnect")
async def disconnect_sheets(user: User = Depends(get_current_user)):
    """Disconnect Google Sheets integration"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    await db.google_sheets_tokens.delete_one({"user_id": user.user_id})
    await db.google_sheets_config.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_connected": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Google Sheets disconnected"}


class PreviewSheetRequest(BaseModel):
    spreadsheet_url: str
    sheet_name: Optional[str] = None


def extract_spreadsheet_id(url: str) -> str:
    """Extract spreadsheet ID from Google Sheets URL"""
    # Handle full URLs like https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
    if match:
        return match.group(1)
    # If it's already just an ID
    if re.match(r'^[a-zA-Z0-9-_]+$', url):
        return url
    raise ValueError("Invalid Google Sheets URL or ID")


@router.post("/sheets/preview")
async def preview_sheet(data: PreviewSheetRequest, user: User = Depends(get_current_user)):
    """Preview a Google Sheet - get headers and sample data"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected. Please connect first.")
    
    try:
        spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        
        # Get spreadsheet metadata
        spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheets = [s['properties']['title'] for s in spreadsheet.get('sheets', [])]
        
        # Use specified sheet or first sheet
        sheet_name = data.sheet_name or sheets[0] if sheets else "Sheet1"
        
        # Get data from the sheet (first 100 rows for preview)
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:Z100"
        ).execute()
        
        values = result.get('values', [])
        if not values:
            return {
                "spreadsheet_id": spreadsheet_id,
                "sheets": sheets,
                "selected_sheet": sheet_name,
                "headers": [],
                "sample_data": [],
                "total_rows": 0,
                "column_suggestions": {}
            }
        
        headers = values[0] if values else []
        sample_data = values[1:11] if len(values) > 1 else []  # First 10 data rows
        
        # Auto-suggest column mappings
        column_suggestions = {}
        custom_fields = []
        
        for idx, header in enumerate(headers):
            col_letter = chr(65 + idx) if idx < 26 else f"A{chr(65 + idx - 26)}"
            mapped_field = auto_map_column(header)
            if mapped_field:
                column_suggestions[col_letter] = {
                    "original": header,
                    "suggested": mapped_field,
                    "is_standard": True
                }
            else:
                column_suggestions[col_letter] = {
                    "original": header,
                    "suggested": None,
                    "is_standard": False
                }
                custom_fields.append(header)
        
        return {
            "spreadsheet_id": spreadsheet_id,
            "sheets": sheets,
            "selected_sheet": sheet_name,
            "headers": headers,
            "sample_data": sample_data,
            "total_rows": len(values) - 1,  # Exclude header row
            "column_suggestions": column_suggestions,
            "custom_fields_detected": custom_fields
        }
        
    except Exception as e:
        logger.error(f"Failed to preview sheet: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to read spreadsheet: {str(e)}")


@router.post("/sheets/preview-all-tabs")
async def preview_all_tabs(data: PreviewSheetRequest, user: User = Depends(get_current_user)):
    """Preview ALL tabs in a Google Sheet - each tab with headers, auto-mapping, and sample data"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    try:
        spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheet_names = [s['properties']['title'] for s in spreadsheet.get('sheets', [])]
        spreadsheet_name = spreadsheet.get('properties', {}).get('title', 'Unknown')
        
        # Get existing custom fields
        existing_custom_fields = await db.custom_fields.find({}, {"_id": 0}).to_list(100)
        existing_field_names = {f.get("field_name", "").lower() for f in existing_custom_fields}
        
        tabs_preview = []
        for sheet_name in sheet_names:
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{sheet_name}'!A1:Z50"
                ).execute()
            except:
                continue
            
            values = result.get('values', [])
            if len(values) < 2:
                tabs_preview.append({
                    "tab_name": sheet_name,
                    "source_name": sheet_name.lower().replace(" ", "_").replace("-", "_"),
                    "headers": [],
                    "sample_data": [],
                    "total_rows": 0,
                    "column_mapping": {},
                    "unmapped_columns": [],
                    "is_empty": True
                })
                continue
            
            headers = values[0]
            sample_data = values[1:6]  # 5 sample rows
            
            column_mapping = {}
            unmapped_columns = []
            
            for idx, header in enumerate(headers):
                col_letter = chr(65 + idx) if idx < 26 else f"A{chr(65 + idx - 26)}"
                mapped = auto_map_column(header)
                if mapped:
                    column_mapping[col_letter] = {
                        "original": header,
                        "mapped_to": mapped,
                        "is_standard": True,
                        "is_custom_existing": False
                    }
                else:
                    # Check if it matches an existing custom field
                    normalized = header.lower().strip().replace(" ", "_")
                    is_existing_custom = normalized in existing_field_names
                    column_mapping[col_letter] = {
                        "original": header,
                        "mapped_to": normalized if is_existing_custom else None,
                        "is_standard": False,
                        "is_custom_existing": is_existing_custom
                    }
                    if not is_existing_custom:
                        unmapped_columns.append({
                            "col_letter": col_letter,
                            "header": header,
                            "suggested_field_name": normalized,
                            "sample_values": [row[idx] if idx < len(row) else "" for row in sample_data[:3]]
                        })
            
            tabs_preview.append({
                "tab_name": sheet_name,
                "source_name": sheet_name.lower().replace(" ", "_").replace("-", "_"),
                "headers": headers,
                "sample_data": sample_data,
                "total_rows": len(values) - 1,
                "column_mapping": column_mapping,
                "unmapped_columns": unmapped_columns,
                "is_empty": False
            })
        
        return {
            "spreadsheet_id": spreadsheet_id,
            "spreadsheet_name": spreadsheet_name,
            "total_tabs": len(sheet_names),
            "tabs": tabs_preview
        }
    except Exception as e:
        logger.error(f"Failed to preview all tabs: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to read spreadsheet: {str(e)}")


class ImportAllTabsRequest(BaseModel):
    spreadsheet_url: str
    tab_configs: List[Dict] = []  # [{tab_name, column_mapping, new_custom_fields}]




@router.post("/sheets/import-all-tabs")
async def import_all_tabs_configured(data: ImportAllTabsRequest, user: User = Depends(get_current_user)):
    """Import leads from all tabs with per-tab column mapping and custom field creation"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    try:
        spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        settings = await get_distribution_settings()
        pre_sales_team = settings.get("pre_sales_team", [])
        current_index = settings.get("pre_sales_current_index", 0)
        
        total_imported = 0
        total_skipped = 0
        sources_imported = []
        custom_fields_created = []
        # Dedup phones across the entire run (covers same-batch duplicates)
        seen_phones_in_run: set[str] = set()
        
        for tab_config in data.tab_configs:
            tab_name = tab_config.get("tab_name")
            col_mapping = tab_config.get("column_mapping", {})
            new_fields = tab_config.get("new_custom_fields", [])
            
            # Create new custom fields for this tab
            for field in new_fields:
                field_name = field.get("field_name", "").lower().strip().replace(" ", "_")
                existing = await db.custom_fields.find_one({"field_name": field_name})
                if not existing:
                    field_doc = {
                        "field_id": f"cf_{uuid.uuid4().hex[:8]}",
                        "field_name": field_name,
                        "display_name": field.get("display_name", field.get("header", field_name)),
                        "field_type": "text",
                        "source_tab": tab_name,
                        "created_by": user.user_id,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.custom_fields.insert_one(field_doc)
                    custom_fields_created.append(field_name)
            
            # Fetch sheet data
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{tab_name}'"
                ).execute()
            except Exception as e:
                logger.error(f"Failed to read tab {tab_name}: {e}")
                continue
            
            values = result.get('values', [])
            if len(values) < 2:
                continue
            
            headers = values[0]
            data_rows = values[1:]
            source_name = tab_name.lower().replace(" ", "_").replace("-", "_")
            tab_imported = 0
            tab_skipped = 0
            
            for row in data_rows:
                lead_data = {
                    "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                    "source": source_name,
                    "source_display": tab_name,
                    "stage_type": "pre_sales",
                    "current_stage_id": "stg_new_lead",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "imported_from_sheet": spreadsheet_id,
                    "custom_fields": {}
                }
                
                for col_letter, field_name in col_mapping.items():
                    if not field_name or field_name == '_skip':
                        continue
                    col_idx = ord(col_letter[0]) - 65
                    if len(col_letter) > 1:
                        col_idx = 26 + ord(col_letter[1]) - 65
                    
                    if col_idx < len(row):
                        value = str(row[col_idx]).strip() if row[col_idx] else ""
                        if field_name in ["name", "phone", "email", "city", "budget", "notes", "duration", "address", "state"]:
                            lead_data[field_name] = value
                        elif field_name == "sqft":
                            try:
                                lead_data["sqft"] = int(value.replace(",", "").replace(" ", ""))
                            except:
                                lead_data["sqft"] = value
                        else:
                            lead_data["custom_fields"][field_name] = value
                
                
                if not lead_data.get("name") and not lead_data.get("phone"):
                    tab_skipped += 1
                    continue
                
                phone_raw = lead_data.get("phone") or ""
                phone_norm = normalize_phone(phone_raw)
                if phone_norm:
                    if phone_norm in seen_phones_in_run:
                        tab_skipped += 1
                        continue
                    existing = await find_existing_lead_by_phone(db, phone_raw)
                    if existing:
                        tab_skipped += 1
                        continue
                    seen_phones_in_run.add(phone_norm)
                    lead_data["phone_normalized"] = phone_norm
                
                if settings.get("enabled") and pre_sales_team:
                    assigned_user_id = pre_sales_team[current_index % len(pre_sales_team)]
                    assignee = await db.users.find_one({"user_id": assigned_user_id}, {"_id": 0})
                    lead_data["assigned_to"] = assigned_user_id
                    lead_data["assigned_to_name"] = assignee.get("name") if assignee else None
                    current_index = (current_index + 1) % len(pre_sales_team)
                
                await db.leads.insert_one(lead_data)
                tab_imported += 1
            
            if tab_imported > 0 or tab_skipped > 0:
                sources_imported.append({
                    "tab": tab_name,
                    "source": source_name,
                    "imported": tab_imported,
                    "skipped": tab_skipped
                })
            total_imported += tab_imported
            total_skipped += tab_skipped
        
        if settings.get("enabled") and pre_sales_team:
            await db.lead_distribution_settings.update_one(
                {}, {"$set": {"pre_sales_current_index": current_index}}
            )
        
        # Save connected sheet config for auto-sync (track row counts per tab)
        
        # Upsert connected sheet
        connected_doc = {
            "spreadsheet_url": data.spreadsheet_url,
            "spreadsheet_id": spreadsheet_id,
            "spreadsheet_name": "",
            "user_id": user.user_id,
            "tab_configs": [{
                "tab_name": tc.get("tab_name"),
                "column_mapping": tc.get("column_mapping", {}),
                "new_custom_fields": tc.get("new_custom_fields", [])
            } for tc in data.tab_configs],
            "tab_row_counts": {},
            "last_synced": datetime.now(timezone.utc).isoformat(),
            "connected_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Get actual row counts from the sheet
        try:
            for tab_config in data.tab_configs:
                tn = tab_config.get("tab_name")
                result = service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id, range=f"'{tn}'"
                ).execute()
                rows = result.get('values', [])
                connected_doc["tab_row_counts"][tn] = len(rows) - 1 if len(rows) > 1 else 0
            
            meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            connected_doc["spreadsheet_name"] = meta.get("properties", {}).get("title", "")
        except:
            pass
        
        await db.connected_sheets.update_one(
            {"spreadsheet_id": spreadsheet_id, "user_id": user.user_id},
            {"$set": connected_doc},
            upsert=True
        )
        
        return {
            "message": f"Imported {total_imported} leads from {len(sources_imported)} tabs",
            "imported": total_imported,
            "skipped": total_skipped,
            "sources": sources_imported,
            "custom_fields_created": custom_fields_created
        }
    except Exception as e:
        logger.error(f"Failed to import all tabs: {e}")
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")



class AddSheetSourceRequest(BaseModel):
    name: str  # e.g., "Website", "Meta Ads"
    spreadsheet_url: str
    sheet_name: str
    column_mapping: Dict[str, str]  # {"A": "name", "B": "phone", etc.}
    custom_fields: List[str] = []


@router.post("/sheets/sources")
async def add_sheet_source(data: AddSheetSourceRequest, user: User = Depends(get_current_user)):
    """Add a new Google Sheet source"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    try:
        spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    source = GoogleSheetSource(
        name=data.name,
        spreadsheet_id=spreadsheet_id,
        sheet_name=data.sheet_name,
        column_mapping=data.column_mapping,
        custom_fields=data.custom_fields
    ).model_dump()
    
    # Add to config
    await db.google_sheets_config.update_one(
        {"user_id": user.user_id},
        {
            "$push": {"sources": source},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        },
        upsert=True
    )
    
    return {"message": "Sheet source added", "source": source}


@router.get("/sheets/sources")
async def get_sheet_sources(user: User = Depends(get_current_user)):
    """Get all configured sheet sources"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    config = await db.google_sheets_config.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"sources": config.get("sources", []) if config else []}


@router.delete("/sheets/sources/{source_id}")
async def delete_sheet_source(source_id: str, user: User = Depends(get_current_user)):
    """Delete a sheet source"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    await db.google_sheets_config.update_one(
        {"user_id": user.user_id},
        {"$pull": {"sources": {"source_id": source_id}}}
    )
    
    return {"message": "Source deleted"}


class ImportLeadsRequest(BaseModel):
    source_id: str


@router.post("/sheets/import")
async def import_leads_from_sheet(data: ImportLeadsRequest, user: User = Depends(get_current_user)):
    """Import leads from a configured Google Sheet source"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Get the source config
    config = await db.google_sheets_config.find_one({"user_id": user.user_id}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="No sheets configuration found")
    
    source = next((s for s in config.get("sources", []) if s["source_id"] == data.source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        
        # Get all data from the sheet
        result = service.spreadsheets().values().get(
            spreadsheetId=source["spreadsheet_id"],
            range=f"'{source['sheet_name']}'"
        ).execute()
        
        values = result.get('values', [])
        if len(values) < 2:
            return {"message": "No data to import", "imported": 0, "skipped": 0}
        
        headers = values[0]
        data_rows = values[1:]
        
        # Get distribution settings for round-robin
        settings = await get_distribution_settings()
        pre_sales_team = settings.get("pre_sales_team", [])
        current_index = settings.get("pre_sales_current_index", 0)
        
        imported_count = 0
        skipped_count = 0
        
        for row in data_rows:
            # Map columns to lead fields
            lead_data = {
                "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                "source": source["name"].lower().replace(" ", "_"),
                "stage_type": "pre_sales",
                "current_stage_id": "stg_new_lead",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "custom_fields": {}
            }
            
            for col_letter, field_name in source.get("column_mapping", {}).items():
                col_idx = ord(col_letter[0]) - 65
                if len(col_letter) > 1:
                    col_idx = 26 + ord(col_letter[1]) - 65
                
                if col_idx < len(row):
                    value = row[col_idx].strip() if row[col_idx] else ""
                    if field_name in ["name", "phone", "email", "city", "source", "budget", "notes", "duration", "address", "state"]:
                        lead_data[field_name] = value
                    elif field_name == "sqft":
                        # Try to parse as number
                        try:
                            lead_data["sqft"] = int(value.replace(",", ""))
                        except:
                            lead_data["sqft"] = value
                    else:
                        # Custom field
                        lead_data["custom_fields"][field_name] = value
            
            # Store any detected custom fields
            for cf in source.get("custom_fields", []):
                for col_idx, header in enumerate(headers):
                    if header.lower().strip() == cf.lower().strip() and col_idx < len(row):
                        lead_data["custom_fields"][cf] = row[col_idx]
            
            # Skip if no name or phone
            
            if not lead_data.get("name") and not lead_data.get("phone"):
                skipped_count += 1
                continue
            
            # Check for duplicate (same phone or email)
            if lead_data.get("phone"):
                existing = await db.leads.find_one({"phone": lead_data["phone"]})
                if existing:
                    skipped_count += 1
                    continue
            
            # Assign using round-robin
            rr_user_id = await assign_lead_to_next_user("pre_sales")
            if rr_user_id:
                rr_user = await db.users.find_one({"user_id": rr_user_id}, {"_id": 0})
                lead_data["assigned_to"] = rr_user_id
                lead_data["assigned_to_name"] = rr_user.get("name") if rr_user else None
            
            await db.leads.insert_one(lead_data)
            imported_count += 1
        
        # Update last synced timestamp
        await db.google_sheets_config.update_one(
            {"user_id": user.user_id, "sources.source_id": source["source_id"]},
            {"$set": {
                "sources.$.last_synced": datetime.now(timezone.utc).isoformat(),
                "sources.$.row_count": len(data_rows)
            }}
        )
        
        return {
            "message": "Import complete",
            "imported": imported_count,
            "skipped": skipped_count,
            "total_rows": len(data_rows)
        }
        
    except Exception as e:
        logger.error(f"Failed to import leads: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to import: {str(e)}")


# ==================== END GOOGLE SHEETS INTEGRATION ====================


class ImportAllSheetsRequest(BaseModel):
    spreadsheet_url: str
    column_mapping: Dict[str, str]  # Standard mapping to apply to all sheets


@router.post("/sheets/import-all")
async def import_all_sheets(data: ImportAllSheetsRequest, user: User = Depends(get_current_user)):
    """Import leads from ALL sheets/tabs in a spreadsheet - tab name becomes source"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    try:
        spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        
        # Get spreadsheet metadata - all sheets/tabs
        spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        sheet_names = [s['properties']['title'] for s in spreadsheet.get('sheets', [])]
        
        if not sheet_names:
            return {"message": "No sheets found", "imported": 0, "skipped": 0, "sources": []}
        
        # Get distribution settings for round-robin
        settings = await get_distribution_settings()
        pre_sales_team = settings.get("pre_sales_team", [])
        current_index = settings.get("pre_sales_current_index", 0)
        
        total_imported = 0
        total_skipped = 0
        sources_imported = []
        # Track phone numbers processed in this entire import run so duplicates
        # within the same sheet (or across tabs) are dropped, not inserted.
        seen_phones_in_run: set[str] = set()

        for sheet_name in sheet_names:
            # Get all data from this sheet
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{sheet_name}'"
                ).execute()
            except Exception as e:
                logger.error(f"Failed to read sheet {sheet_name}: {e}")
                continue
            
            values = result.get('values', [])
            if len(values) < 2:
                continue  # Skip empty sheets
            
            headers = values[0]
            data_rows = values[1:]
            
            # Use sheet name as source (lowercase, underscore)
            source_name = sheet_name.lower().replace(" ", "_").replace("-", "_")
            sheet_imported = 0
            sheet_skipped = 0
            
            for row in data_rows:
                # Map columns to lead fields
                lead_data = {
                    "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                    "source": source_name,
                    "source_display": sheet_name,  # Original tab name for display
                    "stage_type": "pre_sales",
                    "current_stage_id": "stg_new_lead",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "imported_from_sheet": spreadsheet_id,
                    "custom_fields": {}
                }
                
                for col_letter, field_name in data.column_mapping.items():
                    if not field_name or field_name == '_skip':
                        continue
                    col_idx = ord(col_letter[0]) - 65
                    if len(col_letter) > 1:
                        col_idx = 26 + ord(col_letter[1]) - 65
                    
                    if col_idx < len(row):
                        value = str(row[col_idx]).strip() if col_idx < len(row) and row[col_idx] else ""
                        if field_name in ["name", "phone", "email", "city", "budget", "notes", "duration", "address", "state"]:
                            lead_data[field_name] = value
                        elif field_name == "sqft":
                            try:
                                lead_data["sqft"] = int(value.replace(",", "").replace(" ", ""))
                            except:
                                lead_data["sqft"] = value
                        else:
                            lead_data["custom_fields"][field_name] = value
                
                # Skip if no name or phone
                
                if not lead_data.get("name") and not lead_data.get("phone"):
                    sheet_skipped += 1
                    continue
                
                # Check for duplicate (same phone, country-code tolerant)
                phone_raw = lead_data.get("phone") or ""
                phone_norm = normalize_phone(phone_raw)
                if phone_norm:
                    # 1) Already inserted earlier in this same run?
                    if phone_norm in seen_phones_in_run:
                        sheet_skipped += 1
                        continue
                    # 2) Already exists in DB (any phone format)?
                    existing = await find_existing_lead_by_phone(db, phone_raw)
                    if existing:
                        sheet_skipped += 1
                        continue
                    # Mark as seen and persist normalized form for fast future lookups
                    seen_phones_in_run.add(phone_norm)
                    lead_data["phone_normalized"] = phone_norm
                
                # Assign using round-robin
                rr_user_id = await assign_lead_to_next_user("pre_sales")
                if rr_user_id:
                    rr_user = await db.users.find_one({"user_id": rr_user_id}, {"_id": 0})
                    lead_data["assigned_to"] = rr_user_id
                    lead_data["assigned_to_name"] = rr_user.get("name") if rr_user else None
                
                await db.leads.insert_one(lead_data)
                sheet_imported += 1
            
            if sheet_imported > 0:
                sources_imported.append({
                    "name": sheet_name,
                    "imported": sheet_imported,
                    "skipped": sheet_skipped
                })
            
            total_imported += sheet_imported
            total_skipped += sheet_skipped
        
        return {
            "message": f"Import complete from {len(sources_imported)} sheets",
            "imported": total_imported,
            "skipped": total_skipped,
            "sources": sources_imported
        }
        
    except Exception as e:
        logger.error(f"Failed to import all sheets: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to import: {str(e)}")


class ExportLeadsRequest(BaseModel):
    spreadsheet_url: Optional[str] = None  # If provided, export to existing sheet
    sheet_name: str = "CRM Export"
    filters: Dict[str, str] = {}  # e.g., {"source": "meta", "stage_type": "pre_sales"}


@router.post("/sheets/export")
async def export_leads_to_sheet(data: ExportLeadsRequest, user: User = Depends(get_current_user)):
    """Export CRM leads to a Google Sheet"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.CRE, "pre_sales", "sales"]:
        raise HTTPException(status_code=403, detail="Sales/Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    try:
        service = build('sheets', 'v4', credentials=creds)
        
        # Build query filter
        query = {}
        if data.filters.get("source"):
            query["source"] = data.filters["source"]
        if data.filters.get("stage_type"):
            query["stage_type"] = data.filters["stage_type"]
        if data.filters.get("assigned_to"):
            query["assigned_to"] = data.filters["assigned_to"]
        
        # Fetch leads
        leads = await db.leads.find(query, {"_id": 0}).to_list(5000)
        
        if not leads:
            return {"message": "No leads to export", "exported": 0}
        
        # Prepare headers and rows
        headers = ["Name", "Phone", "Email", "Source", "City", "Sqft", "Budget", "Stage", "Assigned To", "Created At", "Notes"]
        rows = [headers]
        
        for lead in leads:
            rows.append([
                lead.get("name", ""),
                lead.get("phone", ""),
                lead.get("email", ""),
                lead.get("source_display") or lead.get("source", ""),
                lead.get("city", ""),
                str(lead.get("sqft", "")),
                str(lead.get("budget", "")),
                lead.get("current_stage_id", ""),
                lead.get("assigned_to_name", ""),
                lead.get("created_at", "")[:10] if lead.get("created_at") else "",
                lead.get("notes", "")
            ])
        
        if data.spreadsheet_url:
            # Export to existing spreadsheet
            spreadsheet_id = extract_spreadsheet_id(data.spreadsheet_url)
            
            # Check if sheet exists, create if not
            spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            existing_sheets = [s['properties']['title'] for s in spreadsheet.get('sheets', [])]
            
            if data.sheet_name not in existing_sheets:
                service.spreadsheets().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={"requests": [{"addSheet": {"properties": {"title": data.sheet_name}}}]}
                ).execute()
            
            # Clear existing data and write new
            service.spreadsheets().values().clear(
                spreadsheetId=spreadsheet_id,
                range=f"'{data.sheet_name}'"
            ).execute()
            
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{data.sheet_name}'!A1",
                valueInputOption="USER_ENTERED",
                body={"values": rows}
            ).execute()
            
            sheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        else:
            # Create new spreadsheet
            new_sheet = service.spreadsheets().create(
                body={
                    "properties": {"title": f"CRM Export - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"},
                    "sheets": [{"properties": {"title": data.sheet_name}}]
                }
            ).execute()
            
            spreadsheet_id = new_sheet['spreadsheetId']
            
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{data.sheet_name}'!A1",
                valueInputOption="USER_ENTERED",
                body={"values": rows}
            ).execute()
            
            sheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        
        return {
            "message": f"Exported {len(leads)} leads",
            "exported": len(leads),
            "sheet_url": sheet_url,
            "spreadsheet_id": spreadsheet_id
        }
        
    except Exception as e:
        logger.error(f"Failed to export leads: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to export: {str(e)}")


class AutoSyncConfig(BaseModel):
    enabled: bool = False
    interval_hours: int = 1  # Sync every N hours
    spreadsheet_url: Optional[str] = None
    column_mapping: Dict[str, str] = {}


@router.post("/sheets/auto-sync/config")
async def set_auto_sync_config(data: AutoSyncConfig, user: User = Depends(get_current_user)):
    """Configure auto-sync settings for Google Sheets"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    config = {
        "user_id": user.user_id,
        "enabled": data.enabled,
        "interval_hours": data.interval_hours,
        "spreadsheet_url": data.spreadsheet_url,
        "column_mapping": data.column_mapping,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sheets_auto_sync.update_one(
        {"user_id": user.user_id},
        {"$set": config},
        upsert=True
    )
    
    return {"message": "Auto-sync configuration updated", "config": {k: v for k, v in config.items() if k != "_id"}}


@router.get("/sheets/auto-sync/config")
async def get_auto_sync_config(user: User = Depends(get_current_user)):
    """Get auto-sync configuration"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    config = await db.sheets_auto_sync.find_one({"user_id": user.user_id}, {"_id": 0})
    return config or {"enabled": False, "interval_hours": 1}


@router.post("/sheets/auto-sync/run")
async def run_auto_sync(user: User = Depends(get_current_user)):
    """Sync all connected sheets — discovers NEW tabs and imports NEW rows"""
    if user.role not in [UserRole.SUPER_ADMIN, "pre_sales", "sales", UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Access required")
    
    # For non-admins, use admin's connected sheets and credentials
    sync_user_id = user.user_id
    if user.role != UserRole.SUPER_ADMIN:
        # Find the actual super admin user first
        admin_user = await db.users.find_one({"role": "super_admin"}, {"_id": 0, "user_id": 1})
        if admin_user:
            sync_user_id = admin_user["user_id"]
        else:
            admin_config = await db.connected_sheets.find_one({}, {"_id": 0, "user_id": 1})
            if admin_config:
                sync_user_id = admin_config["user_id"]
            else:
                raise HTTPException(status_code=400, detail="No sheets connected. Ask admin to connect a sheet from Marketing Board.")
    
    creds = await get_sheets_credentials(sync_user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected. Ask admin to connect Google account.")
    
    # Get all connected sheets
    connected = await db.connected_sheets.find({"user_id": sync_user_id}, {"_id": 0}).to_list(50)
    if not connected:
        raise HTTPException(status_code=400, detail="No sheets connected. Ask admin to import a sheet first.")
    
    service = build('sheets', 'v4', credentials=creds)
    settings = await get_distribution_settings()
    pre_sales_team = settings.get("pre_sales_team", [])
    current_index = settings.get("pre_sales_current_index", 0)
    
    total_new = 0
    total_skipped = 0
    sync_details = []
    
    for sheet_doc in connected:
        sid = sheet_doc.get("spreadsheet_id")
        tab_configs = sheet_doc.get("tab_configs", [])
        old_row_counts = sheet_doc.get("tab_row_counts", {})
        new_row_counts = {}
        known_tab_names = {tc.get("tab_name") for tc in tab_configs}
        
        # === DISCOVER NEW TABS in the spreadsheet ===
        try:
            meta = service.spreadsheets().get(spreadsheetId=sid).execute()
            all_sheet_tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
        except Exception as e:
            logger.error(f"Auto-sync: Failed to get spreadsheet metadata: {e}")
            all_sheet_tabs = list(known_tab_names)
        
        # For new tabs, auto-detect column mapping from header row
        for tab_title in all_sheet_tabs:
            if tab_title not in known_tab_names:
                # Read header row to auto-map columns
                try:
                    result = service.spreadsheets().values().get(
                        spreadsheetId=sid, range=f"'{tab_title}'!1:1"
                    ).execute()
                    headers = result.get('values', [[]])[0]
                    if not headers:
                        continue
                    
                    # Auto-map columns by matching header names to known fields
                    auto_mapping = {}
                    field_keywords = {
                        "name": ["name", "client", "customer", "lead name", "full name", "client name"],
                        "phone": ["phone", "mobile", "contact", "number", "cell", "tel"],
                        "email": ["email", "mail", "e-mail"],
                        "city": ["city", "location", "area", "place"],
                        "budget": ["budget", "amount", "value", "price"],
                        "notes": ["notes", "remarks", "comment", "description", "requirement"],
                        "address": ["address", "addr"],
                        "sqft": ["sqft", "sq ft", "area", "square feet", "sq.ft"],
                        "state": ["state"],
                    }
                    
                    for col_idx, header in enumerate(headers):
                        header_lower = header.strip().lower()
                        col_letter = chr(65 + col_idx) if col_idx < 26 else chr(64 + col_idx // 26) + chr(65 + col_idx % 26)
                        for field_name, keywords in field_keywords.items():
                            if any(kw in header_lower for kw in keywords):
                                if field_name not in auto_mapping.values():
                                    auto_mapping[col_letter] = field_name
                                break
                        else:
                            # Map unknown headers as custom fields
                            if header.strip():
                                auto_mapping[col_letter] = header.strip().lower().replace(" ", "_")
                    
                    if auto_mapping:
                        new_tab_config = {
                            "tab_name": tab_title,
                            "column_mapping": auto_mapping,
                            "new_custom_fields": [],
                            "auto_discovered": True,
                        }
                        tab_configs.append(new_tab_config)
                        known_tab_names.add(tab_title)
                        logger.info(f"Auto-sync: Discovered new tab '{tab_title}' with {len(auto_mapping)} columns")
                except Exception as e:
                    logger.error(f"Auto-sync: Failed to read new tab '{tab_title}': {e}")
                    continue
        
        # === SYNC ALL TABS (existing + newly discovered) ===
        for tc in tab_configs:
            tab_name = tc.get("tab_name")
            col_mapping = tc.get("column_mapping", {})
            old_count = old_row_counts.get(tab_name, 0)
            
            try:
                result = service.spreadsheets().values().get(
                    spreadsheetId=sid, range=f"'{tab_name}'"
                ).execute()
            except Exception as e:
                logger.error(f"Auto-sync: Failed to read tab {tab_name}: {e}")
                new_row_counts[tab_name] = old_count
                continue
            
            values = result.get('values', [])
            if len(values) < 2:
                new_row_counts[tab_name] = 0
                continue
            
            headers = values[0]
            all_data_rows = values[1:]
            current_count = len(all_data_rows)
            new_row_counts[tab_name] = current_count
            
            # Only process NEW rows (beyond old_count)
            if current_count <= old_count:
                continue
            
            new_rows = all_data_rows[old_count:]
            source_name = tab_name.lower().replace(" ", "_").replace("-", "_")
            tab_new = 0
            tab_skipped = 0
            
            for row in new_rows:
                lead_data = {
                    "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                    "source": source_name,
                    "source_display": tab_name,
                    "stage_type": "pre_sales",
                    "current_stage_id": "stg_new_lead",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "imported_from_sheet": sid,
                    "auto_synced": True,
                    "custom_fields": {}
                }
                
                for col_letter, field_name in col_mapping.items():
                    if not field_name or field_name == '_skip':
                        continue
                    col_idx = ord(col_letter[0]) - 65
                    if len(col_letter) > 1:
                        col_idx = 26 + ord(col_letter[1]) - 65
                    
                    if col_idx < len(row):
                        value = str(row[col_idx]).strip() if row[col_idx] else ""
                        if field_name in ["name", "phone", "email", "city", "budget", "notes", "duration", "address", "state"]:
                            lead_data[field_name] = value
                        elif field_name == "sqft":
                            try:
                                lead_data["sqft"] = int(value.replace(",", "").replace(" ", ""))
                            except:
                                lead_data["sqft"] = value
                        else:
                            lead_data["custom_fields"][field_name] = value
                
                
                if not lead_data.get("name") and not lead_data.get("phone"):
                    tab_skipped += 1
                    continue
                
                if lead_data.get("phone"):
                    existing = await db.leads.find_one({"phone": lead_data["phone"]})
                    if existing:
                        tab_skipped += 1
                        continue
                
                # Assign using round-robin
                rr_user_id = await assign_lead_to_next_user("pre_sales")
                if rr_user_id:
                    rr_user = await db.users.find_one({"user_id": rr_user_id}, {"_id": 0})
                    lead_data["assigned_to"] = rr_user_id
                    lead_data["assigned_to_name"] = rr_user.get("name") if rr_user else None
                
                await db.leads.insert_one(lead_data)
                tab_new += 1
            
            if tab_new > 0 or tab_skipped > 0:
                sync_details.append({"tab": tab_name, "new_leads": tab_new, "skipped": tab_skipped})
            total_new += tab_new
            total_skipped += tab_skipped
        
        # Update row counts AND tab_configs (includes newly discovered tabs)
        await db.connected_sheets.update_one(
            {"spreadsheet_id": sid, "user_id": user.user_id},
            {"$set": {
                "tab_configs": tab_configs,
                "tab_row_counts": new_row_counts,
                "last_synced": datetime.now(timezone.utc).isoformat()
            }}
        )
    
    if settings.get("enabled") and pre_sales_team:
        await db.lead_distribution_settings.update_one(
            {}, {"$set": {"pre_sales_current_index": current_index}}
        )
    
    # Update auto-sync last run time
    await db.sheets_auto_sync.update_one(
        {"user_id": user.user_id},
        {"$set": {"last_synced": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {
        "message": f"Synced {total_new} new leads" if total_new > 0 else "No new leads found",
        "new_leads": total_new,
        "skipped": total_skipped,
        "details": sync_details
    }


@router.post("/leads/dedupe")
async def dedupe_leads(user: User = Depends(get_current_user)):
    """One-time cleanup: backfill phone_normalized + remove duplicate leads.

    Strategy: keep the OLDEST lead per normalized phone (preserves history,
    pipeline stage, follow-ups). Delete subsequent duplicates.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")

    # Step 1 — backfill phone_normalized everywhere
    backfilled = 0
    cursor = db.leads.find({"phone_normalized": {"$exists": False}}, {"_id": 0, "lead_id": 1, "phone": 1})
    async for lead in cursor:
        norm = normalize_phone(lead.get("phone"))
        if norm:
            await db.leads.update_one({"lead_id": lead["lead_id"]}, {"$set": {"phone_normalized": norm}})
            backfilled += 1

    # Step 2 — find duplicates per normalized phone (keep the earliest created_at)
    pipeline = [
        {"$match": {"phone_normalized": {"$exists": True, "$ne": ""}}},
        {"$sort": {"created_at": 1}},  # oldest first
        {"$group": {
            "_id": "$phone_normalized",
            "leads": {"$push": {"lead_id": "$lead_id", "name": "$name", "stage": "$current_stage_id", "created_at": "$created_at"}},
            "count": {"$sum": 1},
        }},
        {"$match": {"count": {"$gt": 1}}},
    ]
    duplicates = await db.leads.aggregate(pipeline).to_list(10000)

    deleted = 0
    deleted_samples: List[Dict[str, Any]] = []
    for grp in duplicates:
        # Keep first (oldest), delete the rest
        to_delete = [l["lead_id"] for l in grp["leads"][1:]]
        if to_delete:
            res = await db.leads.delete_many({"lead_id": {"$in": to_delete}})
            deleted += res.deleted_count
            if len(deleted_samples) < 20:
                deleted_samples.append({
                    "phone": grp["_id"],
                    "kept": grp["leads"][0]["lead_id"],
                    "removed": to_delete,
                })

    return {
        "message": f"Backfilled {backfilled} leads, removed {deleted} duplicates.",
        "backfilled": backfilled,
        "deleted_duplicates": deleted,
        "duplicate_groups": len(duplicates),
        "samples": deleted_samples,
    }


@router.get("/sheets/connected")
async def get_connected_sheets(user: User = Depends(get_current_user)):
    """Get all connected sheets with their sync status"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sheets = await db.connected_sheets.find({"user_id": user.user_id}, {"_id": 0}).to_list(50)
    return {"sheets": sheets}


@router.delete("/sheets/connected/{spreadsheet_id}")
async def disconnect_sheet(spreadsheet_id: str, user: User = Depends(get_current_user)):
    """Disconnect a sheet from auto-sync"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    await db.connected_sheets.delete_one({"spreadsheet_id": spreadsheet_id, "user_id": user.user_id})
    return {"message": "Sheet disconnected"}


@router.get("/sheets/sync/{spreadsheet_id}")
async def sync_sheet(spreadsheet_id: str, user: User = Depends(get_current_user)):
    """Sync/refresh leads from a spreadsheet - imports new leads only"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    creds = await get_sheets_credentials(user.user_id)
    if not creds:
        raise HTTPException(status_code=401, detail="Google Sheets not connected")
    
    # Get existing column mapping from config
    config = await db.google_sheets_config.find_one({"user_id": user.user_id}, {"_id": 0})
    sources = config.get("sources", []) if config else []
    
    # Find source matching this spreadsheet
    source = next((s for s in sources if s.get("spreadsheet_id") == spreadsheet_id), None)
    column_mapping = source.get("column_mapping", {}) if source else {}
    
    if not column_mapping:
        raise HTTPException(status_code=400, detail="No column mapping found. Please configure the sheet first.")
    
    # Use import-all logic
    return await import_all_sheets(
        ImportAllSheetsRequest(spreadsheet_url=spreadsheet_id, column_mapping=column_mapping),
        user
    )


@router.get("/leads/sources")
async def get_lead_sources(user: User = Depends(get_current_user)):
    """Get all unique lead sources for filtering"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Get unique sources from leads collection
    pipeline = [
        {"$group": {"_id": "$source", "display": {"$first": "$source_display"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    sources = await db.leads.aggregate(pipeline).to_list(100)
    
    return {
        "sources": [
            {
                "id": s["_id"] or "unknown",
                "display": s.get("display") or s["_id"] or "Unknown",
                "count": s["count"]
            }
            for s in sources if s["_id"]
        ]
    }




# ==================== RE TEMPLATES ====================

class REScopeItem(BaseModel):
    name: str = ""
    quantity: float = 1
    unit: str = "nos"
    rate: float = 0
    total: float = 0

class RETemplateCreate(BaseModel):
    name: str
    sqft: Optional[float] = 0
    scope_items: List[REScopeItem] = []

class RETemplateUpdate(BaseModel):
    name: Optional[str] = None
    sqft: Optional[float] = None
    scope_items: Optional[List[REScopeItem]] = None


@router.post("/crm/re-templates")
async def create_re_template(data: RETemplateCreate, user: User = Depends(get_current_user)):
    if user.role not in ["planning", "super_admin", "general_manager"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")

    scope_items = [item.dict() for item in data.scope_items]
    for item in scope_items:
        item["total"] = round((float(item.get("quantity", 0)) or 0) * (float(item.get("rate", 0)) or 0), 2)

    estimated_total = sum(item["total"] for item in scope_items)

    template = {
        "template_id": str(uuid.uuid4()),
        "name": data.name.strip(),
        "sqft": data.sqft or 0,
        "scope_items": scope_items,
        "estimated_total": estimated_total,
        "created_by": user.user_id,
        "created_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.re_templates.insert_one(template)
    template.pop("_id", None)
    return template


@router.get("/crm/re-templates")
async def get_re_templates(user: User = Depends(get_current_user)):
    if user.role not in ["planning", "super_admin", "general_manager", "cre", "sales"]:
        raise HTTPException(status_code=403, detail="Access denied")
    templates = await db.re_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return templates


@router.get("/crm/re-templates/{template_id}")
async def get_re_template(template_id: str, user: User = Depends(get_current_user)):
    template = await db.re_templates.find_one({"template_id": template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/crm/re-templates/{template_id}")
async def update_re_template(template_id: str, data: RETemplateUpdate, user: User = Depends(get_current_user)):
    if user.role not in ["planning", "super_admin", "general_manager"]:
        raise HTTPException(status_code=403, detail="Access denied")

    template = await db.re_templates.find_one({"template_id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        if not data.name.strip():
            raise HTTPException(status_code=400, detail="Template name is required")
        update["name"] = data.name.strip()
    if data.sqft is not None:
        update["sqft"] = data.sqft
    if data.scope_items is not None:
        scope_items = [item.dict() for item in data.scope_items]
        for item in scope_items:
            item["total"] = round((float(item.get("quantity", 0)) or 0) * (float(item.get("rate", 0)) or 0), 2)
        update["scope_items"] = scope_items
        update["estimated_total"] = sum(item["total"] for item in scope_items)

    await db.re_templates.update_one({"template_id": template_id}, {"$set": update})
    updated = await db.re_templates.find_one({"template_id": template_id}, {"_id": 0})
    return updated


@router.delete("/crm/re-templates/{template_id}")
async def delete_re_template(template_id: str, user: User = Depends(get_current_user)):
    if user.role not in ["planning", "super_admin", "general_manager"]:
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.re_templates.delete_one({"template_id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


# ========== RE Project File Attachments ==========
@router.post("/crm/re-projects/{re_project_id}/attachments")
async def upload_re_attachment(
    re_project_id: str,
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    """Upload a file attachment to an RE project (per-revision). Allowed roles: Planning, GM, Sales, CRE, Super Admin."""
    allowed = [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER, "sales", "cre"]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE project not found")
    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")
    file_id = await fs.upload_from_stream(
        file.filename,
        contents,
        metadata={
            "contentType": file.content_type,
            "uploaded_by": user.user_id,
            "re_project_id": re_project_id,
            "label": label or file.filename,
        },
    )
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "name": 1})
    now = datetime.now(timezone.utc)
    attachment = {
        "file_id": str(file_id),
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(contents),
        "label": label or file.filename,
        "uploaded_by": user.user_id,
        "uploaded_by_name": (user_doc or {}).get("name", "Unknown"),
        "uploaded_at": now.isoformat(),
    }
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$push": {"attachments": attachment}, "$set": {"updated_at": now}},
    )
    return attachment


@router.get("/crm/re-projects/attachments/{file_id}")
async def download_re_attachment(file_id: str, request: Request):
    """Download an RE attachment file (cookie-auth for browser links)."""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    try:
        grid_out = await fs.open_download_stream(_ObjectId(file_id))
        contents = await grid_out.read()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    ct = (grid_out.metadata or {}).get("contentType") or "application/octet-stream"
    filename = grid_out.filename or "attachment"
    return Response(content=contents, media_type=ct, headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.delete("/crm/re-projects/{re_project_id}/attachments/{file_id}")
async def delete_re_attachment(re_project_id: str, file_id: str, user: User = Depends(get_current_user)):
    allowed = [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.GENERAL_MANAGER, "sales", "cre"]
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="RE project not found")
    try:
        await fs.delete(_ObjectId(file_id))
    except Exception:
        pass
    await db.re_projects.update_one(
        {"re_project_id": re_project_id},
        {"$pull": {"attachments": {"file_id": file_id}}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "Attachment deleted"}



# ============================================================================
# ROLE TRANSFER (Sales / Pre-Sales handover with full data migration)
# ============================================================================
# Super-Admin-only endpoint to transfer a Sales/Pre-Sales person's complete
# pipeline (leads + RE projects + appointments) to another active user, while
# stripping the source user's role so HR can re-assign them. Irreversible.
#
# User choices captured (from product owner):
#   • Move ALL leads (active + closed/lost), embedded follow-ups & remarks
#     stay with the lead doc (so they migrate automatically with the lead).
#   • Source user → role set to `employee` (no role) so HR can re-assign.
#   • Eligible target users: any active user (any role) who does NOT currently
#     have `sales` or `pre_sales` role.
#   • Same flow for both Sales & Pre-Sales — role auto-detected from source.
#   • Commissions: closed-deal commissions stay with original owner; only
#     open/in-flight leads carry forward (handled by tagging closed leads
#     with `commission_owner` before re-assigning).
#   • Public Quote / Package URLs: keep original `prepared_by` stamp; only
#     route NEW responses to the new owner (assigned_to gets re-stamped,
#     prepared_by stays as historical attribution).
# ============================================================================

class TransferPreviewResponse(BaseModel):
    from_user: Dict[str, Any]
    role: str
    eligible_targets: List[Dict[str, Any]]
    counts: Dict[str, int]


class TransferRoleRequest(BaseModel):
    from_user_id: str
    to_user_id: str
    reason: str
    confirm_password: str


def _is_closed_lead_status(stage_id: Optional[str], stage_name: Optional[str]) -> bool:
    """A lead is considered 'closed' (commission already earned) if its stage is
    a final stage like Project Onboarded / Lost."""
    if not stage_id and not stage_name:
        return False
    closed_ids = {"stg_project_onboarded", "stg_lost", "stg_pre_lost"}
    if stage_id in closed_ids:
        return True
    if stage_name and stage_name.lower() in {"project onboarded", "lost", "deal close"}:
        return True
    return False


@router.get("/admin/transfer-sales-role/preview/{from_user_id}")
async def get_transfer_preview(from_user_id: str, user: User = Depends(get_current_user)):
    """Show counts of what will move + list of eligible target users."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can transfer roles")

    src = await db.users.find_one({"user_id": from_user_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Source user not found")
    src_role = src.get("role")
    if src_role not in ("sales", "pre_sales"):
        raise HTTPException(status_code=400, detail=f"User has role '{src_role}' — only sales/pre_sales can be transferred")

    # Counts
    total_leads = await db.leads.count_documents({"assigned_to": from_user_id})
    open_leads = await db.leads.count_documents({
        "assigned_to": from_user_id,
        "current_stage_id": {"$nin": ["stg_project_onboarded", "stg_lost", "stg_pre_lost"]},
    })
    closed_leads = total_leads - open_leads
    sales_leads_total = await db.sales_leads.count_documents({"assigned_to": from_user_id})
    re_projects = await db.re_projects.count_documents({"prepared_by": from_user_id})

    # Eligible targets: any ACTIVE user who is either:
    #   (a) without sales/pre_sales role (will be promoted), OR
    #   (b) already in the SAME role as source (rebalance leads between teammates)
    targets = await db.users.find(
        {
            "is_active": {"$ne": False},
            "user_id": {"$ne": from_user_id},
            "$or": [
                {"role": {"$nin": ["sales", "pre_sales"]}},
                {"role": src_role},
            ],
        },
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "phone": 1},
    ).sort("name", 1).to_list(500)

    return TransferPreviewResponse(
        from_user={"user_id": src["user_id"], "name": src.get("name"), "email": src.get("email"), "role": src_role},
        role=src_role,
        eligible_targets=targets,
        counts={
            "total_leads": total_leads,
            "open_leads": open_leads,
            "closed_leads": closed_leads,
            "sales_leads": sales_leads_total,
            "re_projects_prepared": re_projects,
        },
    )


@router.post("/admin/transfer-sales-role")
async def transfer_sales_role(data: TransferRoleRequest, user: User = Depends(get_current_user)):
    """Atomically transfer a Sales/Pre-Sales user's pipeline to another user.

    Workflow:
      1. Verify Super Admin password (irreversible action).
      2. Validate from_user has sales/pre_sales role.
      3. Validate to_user is active and does NOT already have sales/pre_sales.
      4. Tag closed leads with `commission_owner=from_user_id` (so original
         owner keeps closed-deal commission attribution per product choice).
      5. Re-assign all leads (open + closed) to to_user; append handover history.
      6. Re-assign sales_leads (CRM B) similarly.
      7. Promote to_user to from_user's role; demote from_user to `employee`.
      8. Write `role_transfer_audit` row, notify both users.
    """
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can transfer roles")

    # 1) Re-verify Super Admin password
    from routes.auth import verify_password  # local import avoids circular
    me = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 1})
    if not me or not me.get("password_hash") or not verify_password(data.confirm_password, me["password_hash"]):
        raise HTTPException(status_code=401, detail="Super Admin password is incorrect")

    if data.from_user_id == data.to_user_id:
        raise HTTPException(status_code=400, detail="Source and target users must be different")

    # 2) Validate source
    src = await db.users.find_one({"user_id": data.from_user_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Source user not found")
    src_role = src.get("role")
    if src_role not in ("sales", "pre_sales"):
        raise HTTPException(status_code=400, detail=f"Source user has role '{src_role}' — only sales/pre_sales can be transferred")

    # 3) Validate target
    tgt = await db.users.find_one({"user_id": data.to_user_id}, {"_id": 0})
    if not tgt:
        raise HTTPException(status_code=404, detail="Target user not found")
    if tgt.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Target user is inactive")
    tgt_role = tgt.get("role")
    # Allow target to either have no sales/pre_sales role (will be promoted) OR
    # the SAME role as source (rebalance / handover within team — target keeps role)
    if tgt_role in ("sales", "pre_sales") and tgt_role != src_role:
        raise HTTPException(status_code=400, detail=f"Target user already has role '{tgt_role}' — pick a user without sales/pre_sales role, or with role '{src_role}'")
    same_role_transfer = (tgt_role == src_role)

    if not (data.reason or "").strip():
        raise HTTPException(status_code=400, detail="Reason is required for audit trail")

    now_iso = datetime.now(timezone.utc).isoformat()
    target_name = tgt.get("name") or ""
    src_name = src.get("name") or ""

    # 4) Tag closed leads with commission_owner BEFORE re-assigning
    closed_filter = {
        "assigned_to": data.from_user_id,
        "$or": [
            {"current_stage_id": {"$in": ["stg_project_onboarded", "stg_lost", "stg_pre_lost"]}},
            {"current_stage_name": {"$in": ["Project Onboarded", "Lost"]}},
        ],
    }
    await db.leads.update_many(
        {**closed_filter, "commission_owner": {"$exists": False}},
        {"$set": {
            "commission_owner": data.from_user_id,
            "commission_owner_name": src_name,
            "commission_locked_at": now_iso,
        }},
    )
    await db.sales_leads.update_many(
        {**closed_filter, "commission_owner": {"$exists": False}},
        {"$set": {
            "commission_owner": data.from_user_id,
            "commission_owner_name": src_name,
            "commission_locked_at": now_iso,
        }},
    )

    handover_record = {
        "transfer_type": "role_transfer",
        "from_user_id": data.from_user_id,
        "from_user_name": src_name,
        "to_user_id": data.to_user_id,
        "to_user_name": target_name,
        "reason": data.reason.strip(),
        "performed_by": user.user_id,
        "performed_at": now_iso,
    }

    # 5) Reassign ALL leads (assigned_to)
    leads_result = await db.leads.update_many(
        {"assigned_to": data.from_user_id},
        {
            "$set": {
                "assigned_to": data.to_user_id,
                "assigned_to_name": target_name,
                "updated_at": now_iso,
            },
            "$push": {"handover_history": handover_record},
        },
    )

    # 6) Reassign sales_leads (CRM B)
    sales_leads_result = await db.sales_leads.update_many(
        {"assigned_to": data.from_user_id},
        {
            "$set": {
                "assigned_to": data.to_user_id,
                "assigned_to_name": target_name,
                "updated_at": now_iso,
            },
            "$push": {"handover_history": handover_record},
        },
    )

    # 7) Role swap — source always demoted; target promoted only if not already same role
    await db.users.update_one(
        {"user_id": data.from_user_id},
        {"$set": {"role": "employee", "updated_at": now_iso, "previous_role": src_role}},
    )
    if not same_role_transfer:
        await db.users.update_one(
            {"user_id": data.to_user_id},
            {"$set": {"role": src_role, "updated_at": now_iso, "previous_role": tgt_role}},
        )

    # 8) Audit row + notifications
    audit_id = f"rta_{uuid.uuid4().hex[:12]}"
    await db.role_transfer_audit.insert_one({
        "audit_id": audit_id,
        "from_user_id": data.from_user_id,
        "from_user_name": src_name,
        "from_user_role": src_role,
        "to_user_id": data.to_user_id,
        "to_user_name": target_name,
        "to_user_previous_role": tgt_role,
        "same_role_transfer": same_role_transfer,
        "reason": data.reason.strip(),
        "leads_transferred": leads_result.modified_count,
        "sales_leads_transferred": sales_leads_result.modified_count,
        "performed_by": user.user_id,
        "performed_by_name": getattr(user, "name", None),
        "performed_at": now_iso,
    })

    try:
        if same_role_transfer:
            await create_notification(
                data.to_user_id,
                f"{leads_result.modified_count} leads from {src_name} have been transferred to your pipeline.",
            )
        else:
            await create_notification(
                data.to_user_id,
                f"You have been promoted to {src_role.replace('_', '-').title()} — {leads_result.modified_count} leads have been moved to your pipeline.",
            )
        await create_notification(
            data.from_user_id,
            f"Your {src_role.replace('_', '-').title()} role has been transferred to {target_name}. Closed-deal commissions remain attributed to you.",
        )
    except Exception:
        pass

    try:
        await create_audit_log(
            user.user_id,
            "role_transfer",
            "user",
            data.from_user_id,
            {
                "to_user_id": data.to_user_id,
                "role": src_role,
                "leads_transferred": leads_result.modified_count,
                "sales_leads_transferred": sales_leads_result.modified_count,
                "reason": data.reason.strip(),
            },
        )
    except Exception:
        pass

    return {
        "message": "Role transferred successfully",
        "audit_id": audit_id,
        "leads_transferred": leads_result.modified_count,
        "sales_leads_transferred": sales_leads_result.modified_count,
        "from_user_id": data.from_user_id,
        "to_user_id": data.to_user_id,
        "role": src_role,
    }


@router.get("/admin/role-transfer-audit")
async def list_role_transfer_audit(user: User = Depends(get_current_user)):
    """List recent role transfer audit entries (Super Admin only)."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    rows = await db.role_transfer_audit.find({}, {"_id": 0}).sort("performed_at", -1).to_list(200)
    return rows
