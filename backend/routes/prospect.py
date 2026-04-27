"""
Prospect (pre-purchase mobile user) routes.
- Sales creates a prospect login from a lead/RE-Project via "Move to RE Client" flow.
- Prospect can view ONLY their GM-approved rough estimate, salesperson contact,
  and curated content (testimonial videos, completed/ongoing project showcases).
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr

from core.deps import get_current_user
from core.models import User, UserRole
from routes.auth import hash_password

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

router = APIRouter(tags=["prospect"])


# ============ Sales: Create prospect login ============

class CreateProspectUserRequest(BaseModel):
    lead_id: str
    re_project_id: Optional[str] = None
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None


@router.post("/leads/{lead_id}/create-prospect-user")
async def create_prospect_user(lead_id: str, data: CreateProspectUserRequest, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.PRE_SALES]:
        raise HTTPException(status_code=403, detail="Only Sales can create a prospect")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    email = data.email.lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if len(data.password or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"A user with email {email} already exists")

    re_project_id = data.re_project_id or lead.get("re_project_id")
    # Resolve assigned salesperson — falls back to the lead's owner / current user
    sales_user_id = lead.get("assigned_to") or lead.get("created_by") or user.user_id
    sales_user = await db.users.find_one({"user_id": sales_user_id}, {"_id": 0, "name": 1, "phone": 1, "email": 1})

    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    prospect_user = {
        "user_id": user_id,
        "email": email,
        "name": (data.name or "").strip() or lead.get("client_name") or "Prospect",
        "role": "prospect",
        "phone": data.phone or lead.get("client_phone") or "",
        "password_hash": hash_password(data.password),
        "is_active": True,
        "status": "active",
        "created_at": now,
        # Linkages
        "lead_id": lead_id,
        "re_project_id": re_project_id,
        "assigned_sales_user_id": sales_user_id,
        "assigned_sales_user_name": sales_user.get("name") if sales_user else None,
        "created_by": user.user_id,
        "created_by_name": user.name,
    }
    await db.users.insert_one(prospect_user)

    # Tag the lead so we know a login was provisioned
    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": {
            "prospect_user_id": user_id,
            "prospect_user_email": email,
            "prospect_user_created_at": now,
        }}
    )
    prospect_user.pop("password_hash", None)
    prospect_user.pop("_id", None)
    return prospect_user


# ============ Prospect: My Quote (GM-approved RE) ============

@router.get("/prospect/me")
async def prospect_me(user: User = Depends(get_current_user)):
    if user.role != UserRole.PROSPECT:
        raise HTTPException(status_code=403, detail="Prospect only")
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    sales = None
    if udoc and udoc.get("assigned_sales_user_id"):
        s = await db.users.find_one({"user_id": udoc["assigned_sales_user_id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1})
        if s:
            sales = {"name": s.get("name"), "phone": s.get("phone"), "email": s.get("email")}
    return {"user": udoc, "sales_person": sales}


@router.get("/prospect/my-quote")
async def prospect_my_quote(user: User = Depends(get_current_user)):
    """Return the GM-approved rough estimate for this prospect's RE project."""
    if user.role != UserRole.PROSPECT:
        raise HTTPException(status_code=403, detail="Prospect only")
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    re_project_id = udoc.get("re_project_id") if udoc else None
    if not re_project_id:
        raise HTTPException(status_code=404, detail="No quote linked to your account yet")

    project = await db.re_projects.find_one({"re_project_id": re_project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Quote not found")
    if project.get("status") not in ("re_approved",):
        raise HTTPException(status_code=403, detail="Your quote is not yet approved by management")

    estimate_id = project.get("rough_estimate_id") or project.get("estimate_id")
    estimate = None
    if estimate_id:
        estimate = await db.rough_estimates.find_one({"estimate_id": estimate_id}, {"_id": 0})
    return {
        "re_project": project,
        "estimate": estimate,
        "approved_at": project.get("gm_approved_at"),
    }


# ============ Prospect: Inspiration (testimonials + showcases) ============

@router.get("/prospect/inspiration")
async def prospect_inspiration(user: User = Depends(get_current_user)):
    if user.role != UserRole.PROSPECT:
        raise HTTPException(status_code=403, detail="Prospect only")
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    re_project = None
    floor_config = None
    if udoc and udoc.get("re_project_id"):
        re_project = await db.re_projects.find_one({"re_project_id": udoc["re_project_id"]}, {"_id": 0})
        if re_project:
            floor_config = re_project.get("floor_config") or re_project.get("config_type")

    # Filter by config when set on the showcase entry
    def _match(item):
        cfg = (item.get("floor_config") or "").strip().lower()
        if not cfg or cfg == "all":
            return True
        if not floor_config:
            return False
        return cfg == floor_config.strip().lower()

    testimonials = await db.user_app_testimonials.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    completed = await db.user_app_completed_projects.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    ongoing = await db.user_app_ongoing_projects.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(200)
    return {
        "testimonials": [t for t in testimonials if _match(t)],
        "completed": [c for c in completed if _match(c)],
        "ongoing": [o for o in ongoing if _match(o)],
    }


# ============ Admin: User App content management ============

class TestimonialIn(BaseModel):
    title: str
    youtube_url: str
    description: Optional[str] = None
    floor_config: Optional[str] = None  # 'all' or '2BHK G+1' etc.
    sort_order: Optional[int] = 0


class ShowcaseProjectIn(BaseModel):
    title: str
    location: Optional[str] = None
    description: Optional[str] = None
    cover_image_url: Optional[str] = None
    youtube_url: Optional[str] = None
    floor_config: Optional[str] = None
    sort_order: Optional[int] = 0


def _can_manage_user_app(user: User) -> bool:
    return user.role in [UserRole.SUPER_ADMIN, UserRole.SALES, UserRole.MARKETING_HEAD]


# Testimonials
@router.get("/user-app/testimonials")
async def list_testimonials(user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await db.user_app_testimonials.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)


@router.post("/user-app/testimonials")
async def create_testimonial(data: TestimonialIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": f"ut_{uuid.uuid4().hex[:10]}", **data.model_dump(), "is_active": True, "created_at": now, "created_by": user.user_id}
    await db.user_app_testimonials.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/user-app/testimonials/{tid}")
async def update_testimonial(tid: str, data: TestimonialIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.user_app_testimonials.update_one({"id": tid}, {"$set": {**data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Updated"}


@router.delete("/user-app/testimonials/{tid}")
async def delete_testimonial(tid: str, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    await db.user_app_testimonials.update_one({"id": tid}, {"$set": {"is_active": False}})
    return {"message": "Deactivated"}


# Completed projects
@router.get("/user-app/completed")
async def list_completed(user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await db.user_app_completed_projects.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)


@router.post("/user-app/completed")
async def create_completed(data: ShowcaseProjectIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": f"uc_{uuid.uuid4().hex[:10]}", **data.model_dump(), "is_active": True, "created_at": now, "created_by": user.user_id}
    await db.user_app_completed_projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/user-app/completed/{cid}")
async def update_completed(cid: str, data: ShowcaseProjectIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.user_app_completed_projects.update_one({"id": cid}, {"$set": {**data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Updated"}


@router.delete("/user-app/completed/{cid}")
async def delete_completed(cid: str, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    await db.user_app_completed_projects.update_one({"id": cid}, {"$set": {"is_active": False}})
    return {"message": "Deactivated"}


# Ongoing projects
@router.get("/user-app/ongoing")
async def list_ongoing(user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    return await db.user_app_ongoing_projects.find({}, {"_id": 0}).sort("sort_order", 1).to_list(500)


@router.post("/user-app/ongoing")
async def create_ongoing(data: ShowcaseProjectIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": f"uo_{uuid.uuid4().hex[:10]}", **data.model_dump(), "is_active": True, "created_at": now, "created_by": user.user_id}
    await db.user_app_ongoing_projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/user-app/ongoing/{oid}")
async def update_ongoing(oid: str, data: ShowcaseProjectIn, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    res = await db.user_app_ongoing_projects.update_one({"id": oid}, {"$set": {**data.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Updated"}


@router.delete("/user-app/ongoing/{oid}")
async def delete_ongoing(oid: str, user: User = Depends(get_current_user)):
    if not _can_manage_user_app(user):
        raise HTTPException(status_code=403, detail="Permission denied")
    await db.user_app_ongoing_projects.update_one({"id": oid}, {"$set": {"is_active": False}})
    return {"message": "Deactivated"}
