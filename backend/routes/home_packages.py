"""
Home Construction Packages — public share-link flow + admin CRUD.

Independent of the RE-template `packages.py`. Mirrors the quote_links flow
but for the 3 home-construction packages (Budget Friendly / Value for Money /
Builder's Choice) shown to prospects via a public no-login URL.
"""
import hmac
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from core.deps import get_current_user
from core.models import User, UserRole

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

router = APIRouter(tags=["home-packages"])

_PKG_SECRET = (os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "myhomeusb-package-2026").encode()
PKG_TTL_DAYS = 30


def _sign(payload: str) -> str:
    return hmac.new(_PKG_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:24]


def _make_token(link_id: str) -> str:
    return f"{link_id}.{_sign(link_id)}"


def _verify_token(token: str) -> Optional[str]:
    if not token or token.count(".") != 1:
        return None
    link_id, sig = token.split(".", 1)
    if not hmac.compare_digest(sig, _sign(link_id)):
        return None
    return link_id


# =========================================================================
# Home-Package CRUD (Super Admin only)
# =========================================================================

class HomePackageSection(BaseModel):
    title: str
    bullets: List[str] = []


class HomePackage(BaseModel):
    name: str
    short_name: Optional[str] = None
    price_per_sqft: float
    original_price_per_sqft: Optional[float] = None
    is_popular: bool = False
    sort_order: int = 0
    sections: List[HomePackageSection] = []


@router.get("/home-packages")
async def list_home_packages(user: User = Depends(get_current_user)):
    items = await db.home_packages.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("sort_order", 1).to_list(50)
    return items


@router.post("/home-packages")
async def create_home_package(data: HomePackage, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    now = datetime.now(timezone.utc)
    doc = data.model_dump()
    doc.update({
        "package_id": f"hpk_{uuid.uuid4().hex[:10]}",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
    })
    await db.home_packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/home-packages/{package_id}")
async def update_home_package(package_id: str, data: HomePackage, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc)
    update["updated_by"] = user.user_id
    r = await db.home_packages.update_one({"package_id": package_id}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Package not found")
    pkg = await db.home_packages.find_one({"package_id": package_id}, {"_id": 0})
    return pkg


@router.delete("/home-packages/{package_id}")
async def delete_home_package(package_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    r = await db.home_packages.update_one({"package_id": package_id}, {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Package not found")
    return {"message": "Package deactivated"}


# =========================================================================
# Sales: generate package share-link
# =========================================================================

@router.post("/leads/{lead_id}/generate-package-link")
async def generate_package_link(lead_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES]:
        raise HTTPException(status_code=403, detail="Only Sales/Pre-Sales can generate a package link")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    now = datetime.now(timezone.utc)
    await db.package_links.update_many(
        {"lead_id": lead_id, "is_revoked": {"$ne": True}},
        {"$set": {"is_revoked": True, "revoked_at": now.isoformat(), "revoked_by": user.user_id}},
    )

    link_id = f"pkl_{secrets.token_hex(10)}"
    token = _make_token(link_id)
    expires_at = now + timedelta(days=PKG_TTL_DAYS)
    sales_id = lead.get("assigned_to") or lead.get("created_by") or user.user_id
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1, "phone": 1, "email": 1})

    doc = {
        "link_id": link_id,
        "token": token,
        "lead_id": lead_id,
        "client_name": lead.get("name") or lead.get("client_name"),
        "client_phone": lead.get("phone") or lead.get("client_phone"),
        "client_email": lead.get("email") or lead.get("client_email"),
        "sales_user_id": sales_id,
        "sales_user_name": sales.get("name") if sales else None,
        "sales_user_phone": sales.get("phone") if sales else None,
        "is_revoked": False,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "created_by_name": user.name,
        "greeting": f"Hi {(lead.get('name') or lead.get('client_name') or 'there').split()[0]}, here are your Urban Space package details 👇",
        "open_count": 0,
        "last_opened_at": None,
    }
    await db.package_links.insert_one(doc)

    stage_history_entry = {
        "stage_id": "stg_package_send",
        "from_stage_id": lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": user.user_id,
        "moved_by_name": user.name,
        "action": "package_link_generated",
    }
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "active_package_link_id": link_id,
            "active_package_token": token,
            "active_package_expires_at": expires_at.isoformat(),
            "current_stage_id": "stg_package_send",
            "updated_at": now,
        },
        "$push": {"stage_history": stage_history_entry}},
    )

    doc.pop("_id", None)
    return doc


@router.get("/leads/{lead_id}/package-link")
async def get_active_package_link(lead_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES, UserRole.PROJECT_MANAGER, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    link = await db.package_links.find_one({"lead_id": lead_id, "is_revoked": {"$ne": True}}, {"_id": 0}, sort=[("created_at", -1)])
    if not link:
        return {"link": None, "status": "none"}
    # Package links never expire — always report live unless revoked.
    return {"link": link, "status": "live"}


class GreetingUpdate(BaseModel):
    greeting: str


@router.patch("/leads/{lead_id}/package-link/greeting")
async def update_package_link_greeting(lead_id: str, data: GreetingUpdate, user: User = Depends(get_current_user)):
    """Save a custom greeting (used when the sales person shares the link)."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES]:
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.package_links.update_one(
        {"lead_id": lead_id, "is_revoked": {"$ne": True}},
        {"$set": {"greeting": data.greeting, "updated_at": datetime.now(timezone.utc).isoformat()}},
        sort=[("created_at", -1)],
    ) if False else None  # Motor doesn't support sort in update_one directly
    # Fallback: find the latest then update by link_id
    latest = await db.package_links.find_one({"lead_id": lead_id, "is_revoked": {"$ne": True}}, {"_id": 0, "link_id": 1}, sort=[("created_at", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="No active package link")
    await db.package_links.update_one({"link_id": latest["link_id"]}, {"$set": {"greeting": data.greeting, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Greeting updated"}


@router.get("/home-packages/generic-link")
async def get_generic_package_link(user: User = Depends(get_current_user)):
    """Returns a stable, non-customer-specific package link ('Portfolio + Packages')
    that admins can share on WhatsApp/social/marketing posts. It has no lead
    attached and never expires or moves anyone's stage."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES, UserRole.MARKETING_HEAD]:
        raise HTTPException(status_code=403, detail="Permission denied")
    existing = await db.package_links.find_one({"is_generic": True, "is_revoked": {"$ne": True}}, {"_id": 0}, sort=[("created_at", -1)])
    if existing:
        return existing

    now = datetime.now(timezone.utc)
    link_id = "pkl_generic_portfolio"
    token = _make_token(link_id)
    doc = {
        "link_id": link_id,
        "token": token,
        "lead_id": None,
        "is_generic": True,
        "client_name": "Urban Space Builders",
        "sales_user_id": user.user_id,
        "sales_user_name": user.name,
        "sales_user_phone": None,
        "is_revoked": False,
        "expires_at": None,
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "created_by_name": user.name,
        "greeting": "Explore our Home Construction Packages 👇",
        "open_count": 0,
    }
    await db.package_links.insert_one(doc)
    doc.pop("_id", None)
    return doc


# =========================================================================
# Public: anyone with the token
# =========================================================================

@router.get("/public/package/{token}")
async def public_get_package(token: str):
    link_id = _verify_token(token)
    if not link_id:
        raise HTTPException(status_code=404, detail="Invalid link")
    link = await db.package_links.find_one({"link_id": link_id, "token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if link.get("is_revoked"):
        raise HTTPException(status_code=410, detail="Link has been revoked")

    # Package links do NOT expire — per user request, they stay live indefinitely.
    # (We still keep the `expires_at` column for historical parity but never enforce it.)
    packages = await db.home_packages.find(
        {"is_active": {"$ne": False}}, {"_id": 0, "created_by": 0, "updated_by": 0}
    ).sort("sort_order", 1).to_list(50)

    testimonials = await db.user_app_testimonials.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    home_tours = await db.user_app_home_tours.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    completed = await db.user_app_completed_projects.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    ongoing = await db.user_app_ongoing_projects.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    upcoming = await db.user_app_upcoming_projects.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)

    # Prefill payload for the Visit-our-Office popup
    src_lead = await db.leads.find_one({"lead_id": link["lead_id"]}, {"_id": 0}) or {}

    await db.package_links.update_one(
        {"link_id": link_id},
        {"$set": {"last_opened_at": datetime.now(timezone.utc).isoformat()}, "$inc": {"open_count": 1}},
    )

    return {
        "expired": False,
        "client_name": link.get("client_name"),
        "client_phone": link.get("client_phone"),
        "client_email": link.get("client_email"),
        "client_requirement": src_lead.get("requirement") or src_lead.get("notes") or "",
        "packages": packages,
        "testimonials": testimonials,
        "home_tours": home_tours,
        "completed": completed,
        "ongoing": ongoing,
        "upcoming": upcoming,
        "sales_person": {
            "name": link.get("sales_user_name"),
            "phone": link.get("sales_user_phone"),
        },
    }


class BookPkgAppointmentReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    appointment_date: str
    appointment_time: str
    requirement: Optional[str] = None


@router.post("/public/package/{token}/book-appointment")
async def public_book_pkg_appointment(token: str, data: BookPkgAppointmentReq):
    link_id = _verify_token(token)
    if not link_id:
        raise HTTPException(status_code=404, detail="Invalid link")
    link = await db.package_links.find_one({"link_id": link_id, "token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if not data.appointment_date or not data.appointment_time:
        raise HTTPException(status_code=400, detail="Date and time are required")

    now = datetime.now(timezone.utc)
    src_lead = await db.leads.find_one({"lead_id": link["lead_id"]}, {"_id": 0}) or {}
    new_lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    new_lead = {
        "lead_id": new_lead_id,
        "name": (data.name or src_lead.get("name") or link.get("client_name") or "Package Prospect").strip(),
        "phone": (data.phone or src_lead.get("phone") or link.get("client_phone") or "").strip(),
        "email": src_lead.get("email") or link.get("client_email") or "",
        "stage_type": "pre_sales",
        "current_stage_id": "stg_appointment",
        "source": "package_link_callback",
        "tags": ["package_appointment", "from_package_link"],
        "assigned_to": link.get("sales_user_id"),
        "assigned_to_name": link.get("sales_user_name"),
        "created_at": now,
        "created_by": "public",
        "created_by_name": "Public package viewer",
        "previous_lead_id": link["lead_id"],
        "appointment": {
            "appointment_date": data.appointment_date,
            "appointment_time": data.appointment_time,
            "appointment_type": "consultation",
            "notes": data.requirement or "",
            "scheduled_via": "public_package_link",
            "scheduled_at": now.isoformat(),
        },
        "stage_history": [{
            "stage_id": "stg_appointment",
            "moved_at": now.isoformat(),
            "moved_by": "public",
            "moved_by_name": "Public",
            "action": "package_link_appointment",
        }],
    }
    await db.leads.insert_one(new_lead)

    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": link.get("sales_user_id") or "all_pre_sales",
        "title": "Package consultation booked",
        "message": f"{new_lead['name']} requested a consultation on {data.appointment_date} at {data.appointment_time}.",
        "type": "package_appointment",
        "reference_id": new_lead_id,
        "is_read": False,
        "created_at": now,
    })

    return {"message": "Appointment booked. Our team will reach out shortly.", "lead_id": new_lead_id}


class OfficeVisitReq(BaseModel):
    appointment_date: str  # YYYY-MM-DD
    appointment_time: str  # HH:MM (24-h)
    requirement: Optional[str] = None
    # Allow the prospect to correct details captured on the lead
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@router.post("/public/package/{token}/book-office-visit")
async def public_book_office_visit(token: str, data: OfficeVisitReq):
    """Books an OFFICE VISIT against the SAME source lead (no new lead created).

    Validates Mon-Sat + 10:00-18:00 office hours. Moves the lead to
    `stg_appointment` (Appointment Booked) and adds a highlight tag
    `client_office_visit` so it stands out in the Pre-Sales board.
    """
    link_id = _verify_token(token)
    if not link_id:
        raise HTTPException(status_code=404, detail="Invalid link")
    link = await db.package_links.find_one({"link_id": link_id, "token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Validate office hours
    try:
        d = datetime.strptime(data.appointment_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    if d.weekday() == 6:  # Sunday
        raise HTTPException(status_code=400, detail="Office is closed on Sundays. Please pick Mon–Sat.")
    if d < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Date must be today or later")
    try:
        h, m = (int(p) for p in data.appointment_time.split(":")[:2])
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid time format")
    minutes = h * 60 + m
    if minutes < 10 * 60 or minutes > 18 * 60:
        raise HTTPException(status_code=400, detail="Office hours: 10:00 AM – 6:00 PM")

    now = datetime.now(timezone.utc)
    src_lead = await db.leads.find_one({"lead_id": link["lead_id"]}, {"_id": 0})
    if not src_lead:
        raise HTTPException(status_code=404, detail="Source lead missing")

    existing_tags = src_lead.get("tags") or []
    if "client_office_visit" not in existing_tags:
        existing_tags = list(existing_tags) + ["client_office_visit"]

    # Apply prospect-edited contact details (only when non-empty + actually changed)
    contact_updates: Dict[str, Any] = {}
    name_in = (data.name or "").strip()
    if name_in and name_in != (src_lead.get("name") or ""):
        contact_updates["name"] = name_in
    phone_in = (data.phone or "").strip()
    if phone_in and phone_in != (src_lead.get("phone") or ""):
        contact_updates["phone"] = phone_in
    email_in = (data.email or "").strip()
    if email_in and email_in != (src_lead.get("email") or ""):
        contact_updates["email"] = email_in

    stage_history_entry = {
        "stage_id": "stg_appointment",
        "from_stage_id": src_lead.get("current_stage_id"),
        "moved_at": now.isoformat(),
        "moved_by": "public",
        "moved_by_name": "Client (Package Link)",
        "action": "client_booked_office_visit",
    }

    await db.leads.update_one(
        {"lead_id": link["lead_id"]},
        {
            "$set": {
                "current_stage_id": "stg_appointment",
                "tags": existing_tags,
                "client_office_visit_booked_at": now,
                "appointment": {
                    "appointment_date": data.appointment_date,
                    "appointment_time": data.appointment_time,
                    "appointment_type": "office_visit",
                    "notes": data.requirement or src_lead.get("requirement") or "",
                    "scheduled_via": "public_package_link",
                    "scheduled_at": now.isoformat(),
                    "booked_by_client": True,
                },
                "updated_at": now,
                **contact_updates,
            },
            "$push": {"stage_history": stage_history_entry},
        },
    )

    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": link.get("sales_user_id") or "all_pre_sales",
        "title": "🎯 Client booked an Office Visit",
        "message": f"{src_lead.get('name','Client')} booked a visit on {data.appointment_date} at {data.appointment_time}. Lead is now in Appointment Booked stage.",
        "type": "client_office_visit",
        "reference_id": link["lead_id"],
        "is_read": False,
        "created_at": now,
    })

    return {
        "message": "Office visit booked. Our team will reach out shortly.",
        "lead_id": link["lead_id"],
        "stage": "stg_appointment",
        "appointment_date": data.appointment_date,
        "appointment_time": data.appointment_time,
    }


# =========================================================================
# Seed defaults (idempotent — Super Admin only)
# =========================================================================

@router.post("/home-packages/seed-defaults")
async def seed_default_home_packages(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin only")
    DEFAULTS = _build_default_home_packages()
    inserted, updated = 0, 0
    now = datetime.now(timezone.utc)
    for pkg in DEFAULTS:
        existing = await db.home_packages.find_one({"name": pkg["name"]})
        if existing:
            await db.home_packages.update_one({"name": pkg["name"]}, {"$set": {**pkg, "updated_at": now}})
            updated += 1
        else:
            doc = {**pkg, "package_id": f"hpk_{uuid.uuid4().hex[:10]}", "is_active": True, "created_at": now, "updated_at": now, "created_by": user.user_id}
            await db.home_packages.insert_one(doc)
            inserted += 1
    return {"inserted": inserted, "updated": updated}


def _build_default_home_packages() -> List[Dict[str, Any]]:
    """Default 3 packages from urbanspacebuilders.com/packages/."""
    budget = {
        "name": "Budget Friendly",
        "short_name": "BASIC PACKAGE",
        "price_per_sqft": 1899,
        "original_price_per_sqft": 2099,
        "is_popular": False,
        "sort_order": 1,
        "sections": [
            {"title": "Design & Drawings", "bullets": ["2D – Floor Plans - 01no", "3D - Elevation Design - 01no"]},
            {"title": "Structure & Core construction Materials", "bullets": [
                "Basement height - 2 feet from the Natural ground level",
                "Foundation height - Upto 5 feet",
                "Above given Sqft rate considered for Safe bearing capacity of soil is 230 Kpa, if value is below 230 kpa cost may vary",
                "Car parking basement height - 1.5 feet from the Natural ground level",
                "Ceiling height - 9 feet (Finished floor level to finished floor level)",
                "Semi-Framed RCC structure",
                "Cut lintel over doors and windows",
                "Steel - Any ISI brand", "Cement - Any ISI brand",
                "Aggregates - 20mm, 40mm", "Concrete - M20 Grade",
                "Sand - M sand (Blockwork) / P sand (Plastering)",
                "Fly ash - Up to Basement, sump, septic tank, compound walls, Ramp",
                "Fly ash Bricks", "Anti-Termite - Not applicable",
            ]},
            {"title": "Flooring", "bullets": [
                "Living/Dining/Bedroom/Kitchen — Tiles up to ₹45/sqft (2x2 paper joint)",
                "Balcony & Open Area — Tiles up to ₹35/sqft",
                "Staircase — Anti-skid Tiles up to ₹35/sqft",
                "Parking — Anti-skid Tiles up to ₹35/sqft",
            ]},
            {"title": "Fixtures", "bullets": [
                "Kitchen Wall Tiles 2 ft above slab @ ₹45/sqft",
                "Main Sink Faucet — up to ₹1,500 ISI standard (1 No)",
                "Kitchen Sink — Stainless Steel up to ₹3,000 (1 No)",
                "Kitchen Granite Counters — 20mm thick up to ₹100/sqft",
                "Bathroom Wall Tiles 7 ft @ ₹35/sqft",
                "Sanitary Ware & CP Fittings up to ₹8,000",
                "CPVC / PVC — Neroplast or equivalent",
                "Bathroom accessories — EWC, Health Faucet, Wash Basin, 2-in-1 Wall Mixer, Overhead Shower",
            ]},
            {"title": "Plumbing", "bullets": [
                "Bathroom — 1 wash basin with tap, 1 shower with wall mixer (hot/cold), 1 floor mount WC with health faucet",
                "All bathroom fittings white color, basic ISI brand",
                "Kitchen — 1 single SS sink with 1 tap, 1 tap point + outlet for washing machine",
            ]},
            {"title": "Door & Window", "bullets": [
                "Main Door — Malaysian Teak Door + Teak Frame 3.5'x7' @ ₹20,000 incl. fixtures",
                "Internal Door — Flush Door + Sal Wood Frame 4\"x3\" @ ₹8,000",
                "Bathroom & Balcony — PVC Waterproof 2.5'x7' @ ₹8,000",
                "Windows — Aluminum 2-Track ISI 4'x4' @ ₹380/sqft (excl. grills)",
            ]},
            {"title": "Painting", "bullets": [
                "Interior — 1 coat Birla Putty + Tractor Emulsion",
                "Exterior — Asian Primer with Ace Emulsion",
            ]},
            {"title": "Electricals", "bullets": ["Wires — Orbit or equivalent", "Switches — Any ISI Brand (white)"]},
            {"title": "Inclusive", "bullets": ["Overhead Tank — Not in our scope"]},
            {"title": "Exclusion", "bullets": [
                "Compound Wall", "Lift", "Borewell", "Roof weathering", "Carpentry & other wooden work",
                "EB Connections & Charges", "Water Connections & Charges",
                "Underground water storage Sump @ ₹23/litre", "Underground septic tank @ ₹21/litre",
                "Overhead sintex tank @ ₹12/litre", "Overhead concrete tank @ ₹25/litre",
                "Set back area development", "Ceiling putty", "OTS — Glass and grill",
                "Elevation Work", "Water recycling tank", "Rainwater filtration system",
                "Additional foundation height", "Additional basement height", "Structural design",
                "Elevation 3D design", "Govt approval charges", "Safety gates and compound wall gates",
                "Dewatering charges", "Soak pits", "Soil testing", "Cool roof tile",
                "Tie beam additional cost (basement > 3 ft)",
                "Soil/congested-area neighbour issues out of scope",
                "Steel ladder head room",
            ]},
        ],
    }
    value = {
        "name": "Value for Money",
        "short_name": "VALUE FOR MONEY",
        "price_per_sqft": 2099,
        "original_price_per_sqft": 2299,
        "is_popular": False,
        "sort_order": 2,
        "sections": [
            {"title": "Design & Drawings", "bullets": ["2D – Floor Plans", "2D - Structural Design", "3D - Elevation Design"]},
            {"title": "Structure & Core construction Materials", "bullets": [
                "Basement height - 3 feet from the Natural ground level",
                "Foundation height - Upto 5 feet",
                "Sqft rate considers Safe bearing capacity of soil = 230 Kpa",
                "Car parking basement height - 1.5 feet",
                "Ceiling height - 10 ft / Head room 8 ft",
                "RCC Framed Structure (typical floor plan)",
                "Cut lintel over doors and windows",
                "Steel - Kamachi / Arun / Sumangala / Viki or equivalent", "Cement - Zuari",
                "Aggregates - 20mm, 40mm", "Concrete - M20 Grade",
                "M sand (Blockwork) / P sand (Plastering)",
                "Fly ash - Basement, sump, septic tank, compound walls, ramp",
                "Red Bricks (Sulai)", "Anti-Termite (basement floor level only)",
            ]},
            {"title": "Flooring", "bullets": [
                "Living/Dining/Bedroom/Kitchen — Tiles up to ₹50/sqft (2x2, 4x2 paper joint)",
                "Balcony & Open Area — up to ₹45/sqft",
                "Staircase — Anti-skid Tiles up to ₹50/sqft (1x1)",
                "Parking — Anti-skid Tiles up to ₹50/sqft",
            ]},
            {"title": "Fixtures", "bullets": [
                "Kitchen Wall Tiles 4 ft above slab @ ₹50/sqft",
                "Main Sink Faucet up to ₹2,500 ISI (1 No)",
                "Kitchen Sink — SS up to ₹4,000 (1 No)",
                "Kitchen Granite Slab — 20mm thick up to ₹135/sqft",
                "Bathroom Wall Tiles 7 ft @ ₹45/sqft (spacer joint, white cement grout)",
                "Sanitary Ware & CP Fittings up to ₹16,000",
                "CPVC / PVC — Supreme, Neroplast or equivalent",
                "Bathroom accessories — EWC, Health Faucet, Wash Basin, 2-in-1 Wall Mixer, Overhead Shower",
            ]},
            {"title": "Plumbing", "bullets": [
                "Bathroom — 1 wash basin with tap, 1 shower with wall mixer (hot/cold), 1 floor mount WC with health faucet",
                "Bathroom fittings — Parryware white basic",
                "Dining — 1 wash basin with tap",
                "Kitchen — 1 double SS sink with 1 tap, 1 RO point, 1 tap + outlet for washing machine",
            ]},
            {"title": "Door & Window", "bullets": [
                "Main Door — Malaysian Teak Door + Teak Frame 5\"x3\" thick 3.5'x7' @ ₹30,000 (incl. fixtures + varnish)",
                "Internal — Flush/Skin Door + Sal Wood Frame 4\"x3\" @ ₹9,000",
                "Bathroom & Balcony — WPC Waterproof 2.5'x7' @ ₹9,000",
                "Windows — UPVC 2-Track ISI 4'x4' @ ₹400/sqft (excl. grills)",
            ]},
            {"title": "Painting", "bullets": [
                "Interior — 2 coat Birla Putty + 1 primer + 2 coat Tractor Emulsion (Asian)",
                "Exterior — 1 primer + 2 coat Ace or equivalent",
            ]},
            {"title": "Electricals", "bullets": ["Wires — Orbit FLRS or equivalent", "Switches — Anchor Roma white basic"]},
            {"title": "Loft & Shelves", "bullets": [
                "1 Loft in each bedroom & kitchen",
                "1 Shelf in each bedroom & kitchen + L-Shape kitchen counter top",
            ]},
            {"title": "Inclusive", "bullets": [
                "Overhead Tank — 1000 L Sintex (rest over roof slab)",
                "MS Staircase Railing",
                "Balcony elevation — MS handrail up to 15 rft",
            ]},
            {"title": "Exclusion", "bullets": [
                "Compound Wall", "Lift", "Borewell", "Front Elevation", "Carpentry & other wooden work",
                "EB Connections & Charges", "Water Connections & Charges",
                "Underground water storage Sump @ ₹24/litre", "Underground septic tank @ ₹22/litre",
                "Overhead concrete tank @ ₹26/litre", "Set back area development",
                "Ceiling putty", "OTS — Glass and grill", "Elevation Work",
                "Water recycling tank", "Rainwater filtration system",
                "Additional foundation/basement height", "Govt approval charges",
                "Safety gates and compound wall gates", "Dewatering charges", "Soak pits",
                "Soil testing", "Cool roof tile",
                "Tie beam additional cost (basement > 3 ft)",
                "Soil/congested-area neighbour issues out of scope",
                "Steel ladder head room",
            ]},
        ],
    }
    builders = {
        "name": "Builder's Choice",
        "short_name": "BUILDER'S CHOICE",
        "price_per_sqft": 2299,
        "original_price_per_sqft": 2599,
        "is_popular": True,
        "sort_order": 3,
        "sections": [
            {"title": "Design & Drawings", "bullets": [
                "2D – Floor Plans", "2D - Furniture Layout", "2D - Structural Design",
                "2D - Working drawing", "3D - Elevation Design",
                "2D - Electrical and Plumbing drawing",
            ]},
            {"title": "Structure & Core construction Materials", "bullets": [
                "Basement height 3 feet (outer wall inner plastering applicable)",
                "Foundation height - upto 5 feet",
                "Sqft rate considers Safe bearing capacity 230 Kpa",
                "Car parking basement height - 1.5 feet",
                "Ceiling height - 10 ft / Head room 8 ft",
                "RCC Framed Structure (typical floor plan)",
                "Cut lintel over doors and windows",
                "Steel - JSW", "Cement - Dalmia",
                "Aggregates - 20mm, 40mm", "Concrete - M20 Grade",
                "M sand (Blockwork) / P sand (Plastering)",
                "Fly ash - Basement, sump, septic tank, compound walls, ramp",
                "Red Bricks - Wire cut bricks", "Anti-Termite (basement floor level only)",
            ]},
            {"title": "Flooring", "bullets": [
                "Living/Dining/Bedroom/Kitchen — Tiles up to ₹60/sqft (4x2 paper joint)",
                "Balcony & Open Area — up to ₹50/sqft",
                "Staircase — Granite up to ₹140/sqft",
                "Parking — Anti-skid Tiles up to ₹55/sqft",
            ]},
            {"title": "Fixtures", "bullets": [
                "Kitchen Wall Tiles 4 ft above slab @ ₹55/sqft (2x2/4x2)",
                "Main Sink Faucet up to ₹3,500 ISI (1 No)",
                "Kitchen Sink — SS up to ₹5,000 (1 No)",
                "Kitchen Granite Slab — 20mm thick up to ₹150/sqft",
                "Bathroom Wall Tiles 10 ft @ ₹55/sqft",
                "Sanitary Ware & CP Fittings up to ₹20,000",
                "CPVC / PVC — Ashirwad or equivalent",
                "Bathroom accessories — EWC, Health Faucet, Wash Basin, 2-in-1 Wall Mixer, Overhead Shower",
            ]},
            {"title": "Plumbing", "bullets": [
                "Bathroom — 1 wash basin with tap, 1 shower with wall mixer (hot/cold), 1 floor mount WC with health faucet",
                "Bathroom fittings — Jaquar white basic",
                "Dining — 1 wash basin with tap",
                "Kitchen — 1 double SS sink with 1 tap, 1 RO point, 1 tap + outlet for washing machine",
            ]},
            {"title": "Door & Window", "bullets": [
                "Main Door — Malaysian Teak Door + Teak Frame 5\"x3\" thick 3.5'x7' @ ₹40,000 (incl. fixtures + varnish)",
                "Internal — Flush Door with Laminates + Sal Wood Frame 4\"x3\" @ ₹10,000",
                "Bathroom & Balcony — High-quality design WPC 2.5'x7' @ ₹10,000",
                "Windows — UPVC 3-Track ISI 4'x4' @ ₹450/sqft (excl. grills)",
            ]},
            {"title": "Painting", "bullets": [
                "Interior — 2 coat Birla Putty + 1 primer + 2 coat Premium paint (Asian)",
                "Exterior — 1 white cement wash + 1 primer + 2 coat Apex or equivalent",
            ]},
            {"title": "Electricals", "bullets": [
                "Wires — Finolex FLRS or equivalent",
                "Switches — Legrand Mylinc / GM G9 (white) basic",
            ]},
            {"title": "Loft & Shelves", "bullets": [
                "1 Loft in each bedroom & kitchen",
                "1 Shelf in each bedroom & kitchen + L-Shape kitchen counter top",
            ]},
            {"title": "Inclusive", "bullets": [
                "Overhead Tank — 1000 L Sintex (rest 6\" above roof slab)",
                "SS Staircase Railing",
                "Balcony elevation — MS/SS handrail up to 15 rft",
                "Safety gate 1 no (max 3'6\" x 7')",
                "Ceiling putty (RCC ceiling or False ceiling)",
            ]},
            {"title": "Exclusion", "bullets": [
                "Compound Wall", "Lift", "Borewell", "Front Elevation", "Carpentry & other wooden work",
                "EB Connections & Charges", "Water Connections & Charges",
                "Underground water storage Sump @ ₹26/litre", "Underground septic tank @ ₹24/litre",
                "Overhead concrete tank @ ₹27/litre", "Set back area development",
                "OTS — Glass and grill", "Elevation Work", "Water recycling tank",
                "Rainwater filtration system", "Additional foundation/basement height",
                "Govt approval charges", "Safety gates and compound wall gates",
                "Dewatering charges", "Soak pits", "Soil testing", "Cool roof tile",
                "Tie beam additional cost (basement > 3 ft)",
                "Soil/congested-area neighbour issues out of scope",
                "Steel ladder head room",
            ]},
        ],
    }
    return [budget, value, builders]
