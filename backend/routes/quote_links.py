"""
Public Rough-Estimate share-link routes.

Replaces the older prospect-login flow:
- Sales generates a signed share link from the lead detail
- Link works without auth for 30 days
- After expiry, prospect can book a follow-up appointment which lands back
  on the original Sales person as a new tagged appointment
"""
import hmac
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from core.deps import get_current_user
from core.models import User, UserRole

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

router = APIRouter(tags=["quote-links"])

# Re-uses the JWT secret already in env, stable across restarts.
_QUOTE_SECRET = (os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "myhomeusb-rough-estimate-2026").encode()
QUOTE_TTL_DAYS = 30


def _sign(payload: str) -> str:
    return hmac.new(_QUOTE_SECRET, payload.encode(), hashlib.sha256).hexdigest()[:24]


def _make_token(quote_id: str) -> str:
    """Token = quote_id.signature — quote_id is unique random; sig prevents tampering."""
    return f"{quote_id}.{_sign(quote_id)}"


def _verify_token(token: str) -> Optional[str]:
    if not token or token.count(".") != 1:
        return None
    quote_id, sig = token.split(".", 1)
    if not hmac.compare_digest(sig, _sign(quote_id)):
        return None
    return quote_id


# ============ Sales: generate / regenerate share link ============

class GenerateQuoteLinkRequest(BaseModel):
    re_project_id: Optional[str] = None  # optional — falls back to lead.re_project_id


@router.post("/leads/{lead_id}/generate-quote-link")
async def generate_quote_link(lead_id: str, data: GenerateQuoteLinkRequest, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES]:
        raise HTTPException(status_code=403, detail="Only Sales can generate a quote link")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    re_project_id = data.re_project_id or lead.get("re_project_id")
    if not re_project_id:
        raise HTTPException(status_code=400, detail="No RE project linked to this lead yet")

    re_project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0, "status": 1, "re_project_id": 1})
    if not re_project:
        raise HTTPException(status_code=404, detail="RE project not found")
    if re_project.get("status") != "re_approved":
        raise HTTPException(status_code=400, detail="RE must be GM-approved before sharing the link")

    # Revoke any existing live link for this lead so only one is ever active
    now = datetime.now(timezone.utc)
    await db.quote_links.update_many(
        {"lead_id": lead_id, "is_revoked": {"$ne": True}},
        {"$set": {"is_revoked": True, "revoked_at": now.isoformat(), "revoked_by": user.user_id}}
    )

    quote_id = f"q_{secrets.token_hex(10)}"
    token = _make_token(quote_id)
    expires_at = now + timedelta(days=QUOTE_TTL_DAYS)
    sales_id = lead.get("assigned_to") or lead.get("created_by") or user.user_id
    sales = await db.users.find_one({"user_id": sales_id}, {"_id": 0, "name": 1, "phone": 1, "email": 1})

    doc = {
        "quote_id": quote_id,
        "token": token,
        "lead_id": lead_id,
        "re_project_id": re_project_id,
        "client_name": lead.get("name") or lead.get("client_name"),
        "client_phone": lead.get("phone") or lead.get("client_phone"),
        "client_email": lead.get("email") or lead.get("client_email"),
        "sales_user_id": sales_id,
        "sales_user_name": sales.get("name") if sales else None,
        "sales_user_phone": sales.get("phone") if sales else None,
        "is_revoked": False,
        "expires_at": expires_at.isoformat(),
        "expires_at_dt": expires_at,
        "created_at": now.isoformat(),
        "created_by": user.user_id,
        "created_by_name": user.name,
        "open_count": 0,
        "last_opened_at": None,
    }
    await db.quote_links.insert_one(doc)

    # Stamp the lead with the active quote token (keeps the header chip simple)
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "active_quote_id": quote_id,
            "active_quote_token": token,
            "active_quote_expires_at": expires_at.isoformat(),
            "current_stage_id": "stg_re_to_client",
            "updated_at": now,
        },
        "$push": {"stage_history": {
            "stage_id": "stg_re_to_client",
            "from_stage_id": lead.get("current_stage_id"),
            "moved_at": now.isoformat(),
            "moved_by": user.user_id,
            "moved_by_name": user.name,
            "action": "quote_link_generated",
        }}}
    )

    doc.pop("_id", None)
    doc.pop("expires_at_dt", None)
    return doc


@router.get("/leads/{lead_id}/quote-link")
async def get_active_quote_link(lead_id: str, user: User = Depends(get_current_user)):
    """Return the current active link + Live/Expired status for the lead header chip."""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    link = await db.quote_links.find_one({"lead_id": lead_id, "is_revoked": {"$ne": True}}, {"_id": 0}, sort=[("created_at", -1)])
    if not link:
        return {"link": None, "status": "none"}
    expires_at = link.get("expires_at")
    is_expired = False
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            is_expired = datetime.now(timezone.utc) >= exp
        except ValueError:
            is_expired = False
    return {"link": link, "status": "expired" if is_expired else "live"}


# ============ Public: anyone with the token can view ============

@router.get("/public/quote/{token}")
async def public_get_quote(token: str):
    quote_id = _verify_token(token)
    if not quote_id:
        raise HTTPException(status_code=404, detail="Invalid link")
    link = await db.quote_links.find_one({"quote_id": quote_id, "token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if link.get("is_revoked"):
        raise HTTPException(status_code=410, detail="Link has been revoked")

    # Expiry check
    is_expired = False
    expires_at_iso = link.get("expires_at")
    if expires_at_iso:
        try:
            exp = datetime.fromisoformat(expires_at_iso)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            is_expired = datetime.now(timezone.utc) >= exp
        except ValueError:
            pass

    if is_expired:
        # Return a stub with sales contact so the FE can show the appointment-booking page
        return {
            "expired": True,
            "lead_id": link.get("lead_id"),
            "client_name": link.get("client_name"),
            "client_phone": link.get("client_phone"),
            "client_email": link.get("client_email"),
            "sales_person": {
                "name": link.get("sales_user_name"),
                "phone": link.get("sales_user_phone"),
            },
        }

    re_project = await db.re_projects.find_one({"re_project_id": link["re_project_id"]}, {"_id": 0})
    if not re_project:
        raise HTTPException(status_code=404, detail="Quote details not found")
    # CLIENT-FACING: never expose internal rejection notes / GM critique.
    # planning_notes IS exposed deliberately — they're the inclusions list that
    # Planning curates for the client (replaces the hardcoded "What's Included").
    for k in ("gm_rejection_reason", "rejection_history", "internal_notes"):
        re_project.pop(k, None)
    sales_person = {
        "name": link.get("sales_user_name"),
        "phone": link.get("sales_user_phone"),
    }

    # Lazy open-tracking — fire and forget update.
    await db.quote_links.update_one(
        {"quote_id": quote_id},
        {"$set": {"last_opened_at": datetime.now(timezone.utc).isoformat()},
         "$inc": {"open_count": 1}}
    )

    return {
        "expired": False,
        "client_name": link.get("client_name"),
        "re_project": re_project,
        "estimate": None,  # legacy field for UI compatibility
        "approved_at": re_project.get("gm_approved_at"),
        "sales_person": sales_person,
        "expires_at": expires_at_iso,
    }


class BookAppointmentReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    appointment_date: str
    appointment_time: str
    notes: Optional[str] = None


@router.post("/public/quote/{token}/book-appointment")
async def public_book_appointment(token: str, data: BookAppointmentReq):
    quote_id = _verify_token(token)
    if not quote_id:
        raise HTTPException(status_code=404, detail="Invalid link")
    link = await db.quote_links.find_one({"quote_id": quote_id, "token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    if not data.appointment_date or not data.appointment_time:
        raise HTTPException(status_code=400, detail="Date and time are required")

    now = datetime.now(timezone.utc)
    # Clone the original lead minimal data into a fresh lead with "client_appointment" tag.
    src_lead = await db.leads.find_one({"lead_id": link["lead_id"]}, {"_id": 0}) or {}
    new_lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    new_lead = {
        "lead_id": new_lead_id,
        "name": (data.name or src_lead.get("name") or link.get("client_name") or "Returning Prospect").strip(),
        "phone": (data.phone or src_lead.get("phone") or link.get("client_phone") or "").strip(),
        "email": src_lead.get("email") or link.get("client_email") or "",
        "stage_type": "sales",
        "current_stage_id": "stg_new_appt",
        "source": "expired_quote_returning",
        "tags": ["client_appointment", "returning_prospect"],
        "assigned_to": link.get("sales_user_id"),
        "assigned_to_name": link.get("sales_user_name"),
        "created_at": now,
        "created_by": "public",
        "created_by_name": "Public quote viewer",
        "previous_lead_id": link["lead_id"],
        "previous_re_project_id": link.get("re_project_id"),
        "appointment": {
            "appointment_date": data.appointment_date,
            "appointment_time": data.appointment_time,
            "appointment_type": "office_visit",
            "notes": data.notes or "Returning prospect from expired RE link",
            "scheduled_via": "public_quote_link",
            "scheduled_at": now.isoformat(),
        },
        "stage_history": [{
            "stage_id": "stg_new_appt",
            "moved_at": now.isoformat(),
            "moved_by": "public",
            "moved_by_name": "Public",
            "action": "expired_link_appointment",
        }],
    }
    await db.leads.insert_one(new_lead)

    # Notify the original sales person
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": link.get("sales_user_id") or "all_sales",
        "title": "Returning prospect booked an appointment",
        "message": f"{new_lead['name']} (₹ quote expired) wants to meet on {data.appointment_date} at {data.appointment_time}.",
        "type": "client_appointment",
        "reference_id": new_lead_id,
        "is_read": False,
        "created_at": now,
    })

    return {"message": "Appointment booked. Your sales executive will reach out shortly.", "lead_id": new_lead_id}


# ============ Sales: Regenerate RE — sends back to Planning ============

class RegenerateReReq(BaseModel):
    remarks: str


@router.post("/leads/{lead_id}/regenerate-re")
async def regenerate_re(lead_id: str, data: RegenerateReReq, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES]:
        raise HTTPException(status_code=403, detail="Only Sales can regenerate RE")
    if not (data.remarks or "").strip():
        raise HTTPException(status_code=400, detail="Remarks are required")

    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    re_project_id = lead.get("re_project_id")
    if not re_project_id:
        raise HTTPException(status_code=400, detail="No RE project linked to this lead")
    src = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Source RE project not found")

    now = datetime.now(timezone.utc)
    new_re_id = f"re_{uuid.uuid4().hex[:12]}"
    revision = int(src.get("revision", 1)) + 1
    new_re = {
        **{k: v for k, v in src.items() if k not in ("re_project_id", "_id", "status", "gm_approved_at", "gm_approved_by",
                                                       "rough_scope_items", "estimated_total", "rough_requirement",
                                                       "created_at", "updated_at", "stage_history")},
        "re_project_id": new_re_id,
        "lead_id": lead_id,
        "previous_re_project_id": re_project_id,
        "revision": revision,
        "status": "re_in_progress",
        "regenerate_remarks": data.remarks.strip(),
        "regenerate_requested_by": user.user_id,
        "regenerate_requested_by_name": user.name,
        "regenerate_requested_at": now.isoformat(),
        # carry over the existing seed values so Planning sees what to revise
        "rough_requirement": src.get("rough_requirement", ""),
        "rough_scope_items": src.get("rough_scope_items", []),
        "estimated_total": src.get("estimated_total", 0),
        "created_at": now,
        "updated_at": now,
        "created_by": user.user_id,
        "created_by_name": user.name,
    }
    await db.re_projects.insert_one(new_re)

    # NB: Old quote link stays live until the new RE is approved.
    # Lead points to the new RE project + moves to "RE - Planning" stage.
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "re_project_id": new_re_id,
            "current_stage_id": "stg_re_request",
            "updated_at": now,
        },
        "$push": {"stage_history": {
            "stage_id": "stg_re_request",
            "from_stage_id": lead.get("current_stage_id"),
            "moved_at": now.isoformat(),
            "moved_by": user.user_id,
            "moved_by_name": user.name,
            "action": "re_regenerate_requested",
            "remark": data.remarks.strip(),
        }}}
    )

    # Notify Planning team
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": "all_planning",
        "title": "RE Regeneration Requested",
        "message": f"{user.name} requested a regenerated RE for {lead.get('name', 'lead')} (revision {revision}).",
        "type": "re_regenerate",
        "reference_id": new_re_id,
        "is_read": False,
        "created_at": now,
    })
    return {"message": "Regeneration request sent to Planning", "re_project_id": new_re_id, "revision": revision}


# ============ Lead: Timeline ============

@router.get("/leads/{lead_id}/timeline")
async def get_lead_timeline(lead_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES, UserRole.PROJECT_MANAGER, UserRole.GENERAL_MANAGER, UserRole.ACCOUNTANT, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Permission denied")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    events = []
    # Stage history
    for h in lead.get("stage_history", []) or []:
        events.append({
            "type": "stage",
            "icon": "git-branch",
            "at": h.get("moved_at"),
            "title": f"Moved to {h.get('stage_id', '').replace('stg_', '').replace('_', ' ').title()}",
            "by": h.get("moved_by_name") or h.get("moved_by"),
            "detail": h.get("remark") or h.get("action") or "",
            "meta": h,
        })
    # Follow-ups
    for f in lead.get("follow_ups", []) or []:
        events.append({
            "type": "followup",
            "icon": "phone",
            "at": f.get("created_at") or f.get("scheduled_date"),
            "title": f"Follow-up scheduled · {f.get('scheduled_date', '')}",
            "by": f.get("created_by_name") or f.get("created_by"),
            "detail": f.get("notes") or "",
            "meta": f,
        })
    # Appointment
    if lead.get("appointment"):
        a = lead["appointment"]
        events.append({
            "type": "appointment",
            "icon": "calendar",
            "at": a.get("scheduled_at") or a.get("created_at") or lead.get("created_at"),
            "title": f"Appointment {a.get('appointment_type', '')} · {a.get('appointment_date', '')} {a.get('appointment_time', '')}",
            "by": a.get("scheduled_by_name") or "—",
            "detail": a.get("notes") or "",
            "meta": a,
        })
    # Advance payment
    ap = lead.get("advance_payment")
    if ap:
        events.append({
            "type": "payment",
            "icon": "dollar",
            "at": ap.get("collected_at") or ap.get("verified_at"),
            "title": f"Advance ₹{int(ap.get('advance_amount', 0)):,} {ap.get('payment_mode', '')}",
            "by": ap.get("collected_by_name") or ap.get("verified_by_name") or "",
            "detail": ap.get("remarks") or "",
            "meta": ap,
        })
    # Quote links (live + revoked)
    async for q in db.quote_links.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1):
        events.append({
            "type": "quote_link",
            "icon": "link",
            "at": q.get("created_at"),
            "title": f"Quote link {'revoked' if q.get('is_revoked') else 'generated'}",
            "by": q.get("created_by_name"),
            "detail": f"Expires {q.get('expires_at', '')[:10]}" if q.get("expires_at") else "",
            "meta": {"quote_id": q.get("quote_id"), "is_revoked": q.get("is_revoked"), "open_count": q.get("open_count", 0)},
        })

    # Sort: newest first
    def _key(e):
        return e.get("at") or ""
    events.sort(key=_key, reverse=True)
    return {"lead_id": lead_id, "events": events}
