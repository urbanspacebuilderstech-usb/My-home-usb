"""Final Estimate workflow.

State machine (lives in `project.fe.*`):
    draft
      → pending_cre_review     (Planning clicks "Send for Approval")
      → pending_client_review  (CRE clicks "Send for Client Approval"; permanent token issued)
      → feedback_received      (Client posts feedback through public page)
      → pending_client_review  (CRE edits & resends; revision +1)
      → approved               (Client clicks Approve)

Public link is permanent (no expiry) and identifies the latest revision only —
old revisions are kept in `project.fe.history` but not exposed publicly.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import get_current_user
from core.database import db
from core.models import User, UserRole

router = APIRouter()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_fe(project: dict) -> dict:
    """Return a normalised `fe` block; never mutates the project document."""
    fe = project.get("fe") or {}
    return {
        "status": fe.get("status", "draft"),
        "revision": fe.get("revision", 0),
        "public_token": fe.get("public_token"),
        "sent_to_cre_at": fe.get("sent_to_cre_at"),
        "sent_to_cre_by": fe.get("sent_to_cre_by"),
        "sent_to_client_at": fe.get("sent_to_client_at"),
        "sent_to_client_by": fe.get("sent_to_client_by"),
        # CRE-side reviews flow back to Planning. Each entry records the rev
        # being reviewed, the CRE who wrote it, when, and the message.
        "reviews": fe.get("reviews", []),
        "client_approved_at": fe.get("client_approved_at"),
        "history": fe.get("history", []),
    }


async def _get_project_or_404(project_id: str) -> dict:
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_scope_items(project_id: str) -> List[dict]:
    items = await db.scope_items.find(
        {"project_id": project_id},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(500)
    return items


async def _notify(user_id: str, title: str, message: str, kind: str, ref_id: str) -> None:
    await db.notifications.insert_one({
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": kind,
        "reference_id": ref_id,
        "is_read": False,
        "created_at": _now(),
    })


# ──────────────────────────────────────────────────────────────────────────────
# Planning → "Send for Approval"  (push FE into CRE's queue)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/planning/projects/{project_id}/final-estimate/send-to-cre")
async def send_fe_to_cre(project_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.PLANNING, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can submit Final Estimate")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    # Must have at least one scope item before sending
    scope_count = await db.scope_items.count_documents({"project_id": project_id})
    if scope_count == 0:
        raise HTTPException(status_code=400, detail="Add at least one scope item before sending Final Estimate")

    fe["status"] = "pending_cre_review"
    fe["sent_to_cre_at"] = _now()
    fe["sent_to_cre_by"] = user.user_id
    # Bump revision when re-sending after a CRE review (avoid bumping on the
    # very first send so first-time sends stay at Rev 0).
    if any(r for r in (fe.get("reviews") or []) if r.get("revision") == fe["revision"]):
        fe["revision"] = (fe.get("revision") or 0) + 1
    fe["history"] = (fe.get("history") or []) + [{
        "action": "send_to_cre",
        "revision": fe["revision"],
        "by": user.user_id,
        "at": fe["sent_to_cre_at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify all CREs
    cres = await db.users.find({"role": "cre", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for c in cres:
        await _notify(
            c["user_id"],
            "Final Estimate ready for review",
            f"Planning has submitted Final Estimate for {project.get('name', '')}",
            "final_estimate_ready",
            project_id,
        )

    return {"message": "Final Estimate sent to CRE", "fe": fe}


# ──────────────────────────────────────────────────────────────────────────────
# CRE list — projects with FE awaiting CRE/client action
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/cre/final-estimates")
async def list_cre_final_estimates(user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can access this")

    # Surface every project whose FE has been touched (excludes drafts).
    # Includes review_pending so CRE can still see what they sent back to Planning,
    # and pending_client_review / feedback_received so CRE can track in-flight client reviews.
    projects = await db.projects.find(
        {
            "fe.status": {"$in": ["pending_cre_review", "review_pending", "approved", "pending_client_review", "feedback_received"]},
            "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}],
        },
        {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "client_phone": 1,
         "location": 1, "total_value": 1, "fe": 1, "created_at": 1},
    ).sort("fe.sent_to_cre_at", -1).to_list(200)

    return projects


# ──────────────────────────────────────────────────────────────────────────────
# CRE → "Approve"  (direct approval — no client involvement)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/cre/final-estimates/{project_id}/approve")
async def cre_approve_fe(project_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can approve")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if fe["status"] not in ("pending_cre_review",):
        raise HTTPException(status_code=400, detail=f"Cannot approve from status: {fe['status']}")

    fe["status"] = "approved"
    fe["client_approved_at"] = _now()
    fe["history"] = (fe.get("history") or []) + [{
        "action": "cre_approve",
        "revision": fe["revision"],
        "by": user.user_id,
        "at": fe["client_approved_at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify Planning
    planners = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        await _notify(
            p["user_id"],
            "Final Estimate approved",
            f"CRE approved Final Estimate (Rev {fe['revision']}) for {project.get('name', '')}",
            "fe_approved",
            project_id,
        )
    return {"message": "Final Estimate approved", "fe": fe}


# ──────────────────────────────────────────────────────────────────────────────
# CRE → "Review"  (submits review back to Planning; bumps revision counter)
# ──────────────────────────────────────────────────────────────────────────────
class ReviewBody(BaseModel):
    review: str


@router.post("/cre/final-estimates/{project_id}/review")
async def cre_submit_review(project_id: str, body: ReviewBody, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can submit review")

    text = (body.review or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Review cannot be empty")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if fe["status"] not in ("pending_cre_review",):
        raise HTTPException(status_code=400, detail=f"Cannot review from status: {fe['status']}")

    review_index = len(fe.get("reviews", [])) + 1
    new_review = {
        "review_no": review_index,
        "revision": fe["revision"],
        "text": text,
        "by": user.user_id,
        "by_name": user.name if hasattr(user, "name") else None,
        "at": _now(),
    }
    fe["reviews"] = (fe.get("reviews") or []) + [new_review]
    fe["status"] = "review_pending"   # Planning's queue
    fe["history"] = (fe.get("history") or []) + [{
        "action": "cre_review",
        "review_no": review_index,
        "revision": fe["revision"],
        "by": user.user_id,
        "at": new_review["at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify Planning
    planners = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        await _notify(
            p["user_id"],
            f"Final Estimate Review #{review_index}",
            f"CRE requested changes on Final Estimate for {project.get('name', '')}",
            "fe_review",
            project_id,
        )

    return {"message": f"Review #{review_index} sent to Planning", "review_no": review_index}


# ──────────────────────────────────────────────────────────────────────────────
# CRE → "Request Revision"  (post-approval revision: bumps revision +1 and sends back to Planning)
# Allowed only when fe.status == "approved" — i.e. CRE already signed off, but
# something needs to change after the fact (client called back, scope mismatch, etc.).
# ──────────────────────────────────────────────────────────────────────────────
class RevisionRequestBody(BaseModel):
    description: str


@router.post("/cre/final-estimates/{project_id}/request-revision")
async def cre_request_revision(project_id: str, body: RevisionRequestBody, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can request a revision")

    description = (body.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Revision description cannot be empty")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if fe["status"] != "approved":
        raise HTTPException(status_code=400, detail=f"Revision can only be requested on an Approved Final Estimate. Current status: {fe['status']}")

    # Bump revision counter and move back to Planning's queue
    new_revision = (fe.get("revision") or 0) + 1
    fe["revision"] = new_revision

    review_index = len(fe.get("reviews", [])) + 1
    new_review = {
        "review_no": review_index,
        "revision": new_revision,
        "text": description,
        "kind": "post_approval_revision",
        "by": user.user_id,
        "by_name": user.name if hasattr(user, "name") else None,
        "at": _now(),
    }
    fe["reviews"] = (fe.get("reviews") or []) + [new_review]
    fe["status"] = "review_pending"
    # Clear the previous client-approval timestamp since the FE is now in flux again
    fe["client_approved_at"] = None
    fe["history"] = (fe.get("history") or []) + [{
        "action": "cre_request_revision",
        "review_no": review_index,
        "revision": new_revision,
        "by": user.user_id,
        "at": new_review["at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify Planning
    planners = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        await _notify(
            p["user_id"],
            f"FE Revision Requested — FE {new_revision:02d}",
            f"CRE requested a post-approval revision on Final Estimate for {project.get('name', '')}",
            "fe_revision_requested",
            project_id,
        )

    return {"message": f"Revision FE {new_revision:02d} sent to Planning", "revision": new_revision, "review_no": review_index}


# ──────────────────────────────────────────────────────────────────────────────
# CRE → "Send for Client Approval"  (issue / refresh permanent token; view-only)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/cre/final-estimates/{project_id}/send-to-client")
async def cre_send_fe_to_client(project_id: str, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.CRE, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only CRE can send to client")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if not fe.get("public_token"):
        fe["public_token"] = uuid.uuid4().hex

    fe["sent_to_client_at"] = _now()
    fe["sent_to_client_by"] = user.user_id
    # Status not changed — public link is purely informational. Approve / Review
    # actions are now performed by CRE inside the app, not by client.
    fe["history"] = (fe.get("history") or []) + [{
        "action": "send_to_client",
        "revision": fe["revision"],
        "by": user.user_id,
        "at": fe["sent_to_client_at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    return {
        "message": "Public link generated",
        "public_token": fe["public_token"],
        "public_url": f"/fe/{fe['public_token']}",
        "revision": fe["revision"],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Public client page — view, approve, feedback (no auth)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/public/fe/{token}")
async def public_view_fe(token: str):
    project = await db.projects.find_one({"fe.public_token": token}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Invalid link")

    fe = _ensure_fe(project)
    scope = await _get_scope_items(project["project_id"])

    return {
        "project_id": project["project_id"],
        "project_name": project.get("name"),
        "client_name": project.get("client_name"),
        "client_phone": project.get("client_phone"),
        "location": project.get("location"),
        "total_value": sum((s.get("total_amount") or 0) for s in scope),
        "scope": scope,
        "fe_status": fe["status"],
        "revision": fe["revision"],
        "sent_at": fe.get("sent_to_client_at"),
        "approved_at": fe.get("client_approved_at"),
    }

