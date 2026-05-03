"""
Slot-based assignment system.

Concept:
  * A "slot" is a role-bound assignment label (e.g. PreSalesUSB01).
  * A slot is held by exactly one active user at a time.
  * When an employee is off-boarded, we end-date their assignment and
    immediately assign the replacement — leads keep the same `assigned_slot`
    and the stage/history are preserved intact.
  * Each lead's `assigned_to` / `assigned_to_name` is derived at view-time
    from the slot's currently-active assignment, so the UI always reflects
    the person who owns the lead right now.

Data model
----------
slots collection:
  slot_id          str (PK)
  slot_code        "PreSalesUSB01" (unique, human-readable)
  label            "Pre-Sales Seat 01" (display-friendly)
  role             one of UserRole values — which role the slot belongs to
  is_active        bool
  created_at       datetime (iso)
  created_by       str (user_id)

slot_assignments collection:
  assignment_id    str (PK)
  slot_id          str (ref slots.slot_id)
  user_id          str (ref users.user_id)
  user_name        str (denormalised)
  start_date       iso str (inclusive)
  end_date         Optional[iso str] — None means "current"
  assigned_by      str (user_id)
  note             Optional[str]
  created_at       datetime (iso)
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import os
import uuid

from core.deps import get_current_user
from core.models import User, UserRole

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

router = APIRouter(tags=["slots"])

# Roles that we allow to be slot-managed. Other roles (GM, Super Admin,
# Site Engineers, etc.) stay tied to individual users.
SLOT_ELIGIBLE_ROLES = {
    UserRole.PRE_SALES.value,
    UserRole.SALES.value,
    UserRole.CRE.value,
    UserRole.MARKETING_HEAD.value,
}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SlotCreate(BaseModel):
    slot_code: str   # e.g. "PreSalesUSB01"
    label: Optional[str] = None
    role: str

class SlotAssignReq(BaseModel):
    user_id: str
    note: Optional[str] = None
    # If provided and the user previously held this slot, we re-open their
    # assignment. Normally omitted; we start a fresh assignment from "now".
    start_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _only_super_admin(user: User):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")


async def _active_assignment_for_slot(slot_id: str) -> Optional[Dict[str, Any]]:
    """Return the current (end_date=None) assignment for a slot, or None."""
    return await db.slot_assignments.find_one(
        {"slot_id": slot_id, "end_date": None}, {"_id": 0}
    )


async def _enrich_slot(slot: Dict[str, Any]) -> Dict[str, Any]:
    """Attach the active holder (if any) + count of history entries."""
    active = await _active_assignment_for_slot(slot["slot_id"])
    history_count = await db.slot_assignments.count_documents({"slot_id": slot["slot_id"]})
    holder = None
    if active:
        holder = {
            "user_id": active.get("user_id"),
            "user_name": active.get("user_name"),
            "start_date": active.get("start_date"),
            "assignment_id": active.get("assignment_id"),
        }
    return {
        **slot,
        "current_holder": holder,
        "history_count": history_count,
    }


# ---------------------------------------------------------------------------
# Slot CRUD
# ---------------------------------------------------------------------------

@router.get("/slots")
async def list_slots(role: Optional[str] = None, user: User = Depends(get_current_user)):
    """Any authenticated user can see slots (they appear on lead cards)."""
    q: Dict[str, Any] = {}
    if role:
        q["role"] = role
    cursor = db.slots.find(q, {"_id": 0}).sort("slot_code", 1)
    out: List[Dict[str, Any]] = []
    async for slot in cursor:
        out.append(await _enrich_slot(slot))
    return out


@router.post("/slots")
async def create_slot(data: SlotCreate, user: User = Depends(get_current_user)):
    _only_super_admin(user)
    if data.role not in SLOT_ELIGIBLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Role '{data.role}' is not slot-eligible. Allowed: {sorted(SLOT_ELIGIBLE_ROLES)}",
        )
    code = data.slot_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="slot_code is required")

    existing = await db.slots.find_one({"slot_code": code})
    if existing:
        raise HTTPException(status_code=409, detail=f"Slot '{code}' already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
        "slot_code": code,
        "label": data.label or code,
        "role": data.role,
        "is_active": True,
        "created_at": now,
        "created_by": user.user_id,
    }
    await db.slots.insert_one(doc)
    doc.pop("_id", None)
    return await _enrich_slot(doc)


@router.delete("/slots/{slot_id}")
async def deactivate_slot(slot_id: str, user: User = Depends(get_current_user)):
    _only_super_admin(user)
    await db.slots.update_one({"slot_id": slot_id}, {"$set": {"is_active": False}})
    # Also end any current assignment
    now = datetime.now(timezone.utc).isoformat()
    await db.slot_assignments.update_many(
        {"slot_id": slot_id, "end_date": None},
        {"$set": {"end_date": now}},
    )
    return {"deactivated": True}


# ---------------------------------------------------------------------------
# Slot Assignment (swap a user in/out)
# ---------------------------------------------------------------------------

@router.post("/slots/{slot_id}/assign")
async def assign_user_to_slot(slot_id: str, data: SlotAssignReq, user: User = Depends(get_current_user)):
    _only_super_admin(user)
    slot = await db.slots.find_one({"slot_id": slot_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    new_user = await db.users.find_one({"user_id": data.user_id}, {"_id": 0, "password": 0})
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")
    if new_user.get("role") != slot["role"]:
        raise HTTPException(
            status_code=400,
            detail=f"User role ({new_user.get('role')}) does not match slot role ({slot['role']})",
        )

    now = datetime.now(timezone.utc).isoformat()

    # End-date any currently-active assignment for this slot.
    await db.slot_assignments.update_many(
        {"slot_id": slot_id, "end_date": None},
        {"$set": {"end_date": now}},
    )

    new_assignment = {
        "assignment_id": f"sa_{uuid.uuid4().hex[:12]}",
        "slot_id": slot_id,
        "user_id": new_user["user_id"],
        "user_name": new_user.get("name"),
        "start_date": data.start_date or now,
        "end_date": None,
        "assigned_by": user.user_id,
        "assigned_by_name": user.name,
        "note": data.note,
        "created_at": now,
    }
    await db.slot_assignments.insert_one(new_assignment)
    new_assignment.pop("_id", None)
    return new_assignment


@router.post("/slots/{slot_id}/unassign")
async def unassign_slot(slot_id: str, user: User = Depends(get_current_user)):
    _only_super_admin(user)
    now = datetime.now(timezone.utc).isoformat()
    res = await db.slot_assignments.update_many(
        {"slot_id": slot_id, "end_date": None},
        {"$set": {"end_date": now}},
    )
    return {"closed_assignments": res.modified_count}


@router.get("/slots/{slot_id}/history")
async def slot_history(slot_id: str, user: User = Depends(get_current_user)):
    """All past + present assignments for a slot, most recent first."""
    cursor = db.slot_assignments.find({"slot_id": slot_id}, {"_id": 0}).sort("start_date", -1)
    return [row async for row in cursor]


# ---------------------------------------------------------------------------
# One-time migration: create a slot per existing user in a slot-eligible role
# and back-fill `assigned_slot` on their current leads.
# ---------------------------------------------------------------------------

@router.post("/slots/migrate")
async def migrate_existing_users_to_slots(user: User = Depends(get_current_user)):
    _only_super_admin(user)
    now = datetime.now(timezone.utc).isoformat()

    # Counter per-role so we number seats PreSalesUSB01, PreSalesUSB02…
    role_prefix = {
        UserRole.PRE_SALES.value: "PreSalesUSB",
        UserRole.SALES.value: "SalesUSB",
        UserRole.CRE.value: "CREUSB",
        UserRole.MARKETING_HEAD.value: "MktgUSB",
    }

    slots_created = 0
    assignments_created = 0
    leads_updated = 0
    created: List[Dict[str, Any]] = []

    for role_value, prefix in role_prefix.items():
        # count existing slots for role so we keep numbering sequential
        existing_slots = await db.slots.count_documents({"role": role_value})
        users_in_role = await db.users.find(
            {"role": role_value, "is_active": {"$ne": False}},
            {"_id": 0, "password": 0},
        ).to_list(200)

        for idx, u in enumerate(users_in_role, start=existing_slots + 1):
            # Skip users that already have a current slot
            already = await db.slot_assignments.find_one(
                {"user_id": u["user_id"], "end_date": None}, {"_id": 0}
            )
            if already:
                continue

            slot_code = f"{prefix}{idx:02d}"
            slot_doc = {
                "slot_id": f"slot_{uuid.uuid4().hex[:12]}",
                "slot_code": slot_code,
                "label": f"{prefix.replace('USB', '')} Seat {idx:02d}",
                "role": role_value,
                "is_active": True,
                "created_at": now,
                "created_by": user.user_id,
                "seeded": True,
            }
            await db.slots.insert_one(slot_doc)
            slots_created += 1

            assign_doc = {
                "assignment_id": f"sa_{uuid.uuid4().hex[:12]}",
                "slot_id": slot_doc["slot_id"],
                "user_id": u["user_id"],
                "user_name": u.get("name"),
                "start_date": now,
                "end_date": None,
                "assigned_by": user.user_id,
                "assigned_by_name": user.name,
                "note": "Auto-seeded from existing user",
                "created_at": now,
            }
            await db.slot_assignments.insert_one(assign_doc)
            assignments_created += 1

            # Back-fill all leads currently assigned to this user with the new slot
            res = await db.leads.update_many(
                {"assigned_to": u["user_id"], "assigned_slot": {"$exists": False}},
                {"$set": {"assigned_slot": slot_doc["slot_id"]}},
            )
            leads_updated += res.modified_count

            created.append({
                "slot_code": slot_code,
                "role": role_value,
                "user_name": u.get("name"),
                "leads_linked": res.modified_count,
            })

    return {
        "slots_created": slots_created,
        "assignments_created": assignments_created,
        "leads_updated": leads_updated,
        "details": created,
    }


# ---------------------------------------------------------------------------
# Lead ↔ Slot helpers
# ---------------------------------------------------------------------------

@router.get("/slots/resolve-holder/{slot_id}")
async def resolve_slot_holder(slot_id: str, user: User = Depends(get_current_user)):
    """Returns the current holder for a slot. Used by lead detail UI."""
    active = await _active_assignment_for_slot(slot_id)
    if not active:
        return {"slot_id": slot_id, "holder": None}
    return {"slot_id": slot_id, "holder": active}


@router.get("/leads/{lead_id}/slot-timeline")
async def get_lead_slot_timeline(lead_id: str, user: User = Depends(get_current_user)):
    """Return the full slot-ownership timeline for a lead's `assigned_slot`.
    Used to render the 'Owned by' timeline on the lead detail page."""
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0, "assigned_slot": 1})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    slot_id = lead.get("assigned_slot")
    if not slot_id:
        return {"slot": None, "timeline": []}

    slot = await db.slots.find_one({"slot_id": slot_id}, {"_id": 0})
    cursor = db.slot_assignments.find({"slot_id": slot_id}, {"_id": 0}).sort("start_date", 1)
    timeline = [row async for row in cursor]
    return {"slot": slot, "timeline": timeline}
