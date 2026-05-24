"""Final Estimate workflow.

State machine (lives in `project.fe.*`):
    draft
      → pending_gm_review      (Planning clicks "Submit to GM")
      → rejected_by_gm         (GM rejects — Planning can edit and resubmit)
      → pending_cre_review     (GM approves — CRE's queue)
      → review_pending         (CRE requests changes — back to Planning)
      → pending_client_review  (CRE clicks "Send for Client Approval"; permanent token issued)
      → feedback_received      (Client posts feedback through public page)
      → pending_client_review  (CRE edits & resends; revision +1)
      → approved               (Client clicks Approve / CRE direct-approves)

Public link is permanent (no expiry) and identifies the latest revision only —
old revisions are kept in `project.fe.history` but not exposed publicly.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

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
        "sent_to_gm_at": fe.get("sent_to_gm_at"),
        "sent_to_gm_by": fe.get("sent_to_gm_by"),
        "gm_approved_at": fe.get("gm_approved_at"),
        "gm_approved_by": fe.get("gm_approved_by"),
        "gm_rejections": fe.get("gm_rejections", []),   # [{revision, reason, by, at}]
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
# Planning → "Submit to GM"  (push FE into GM's queue for pre-CRE approval)
# ──────────────────────────────────────────────────────────────────────────────
async def _submit_fe_to_gm(project_id: str, user: User) -> dict:
    """Shared core logic for Planning submitting the FE to GM."""
    if user.role not in [UserRole.PLANNING, UserRole.PLANNING_PERSON, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only Planning can submit Final Estimate")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    # Must have at least one scope item before sending
    scope_count = await db.scope_items.count_documents({"project_id": project_id})
    if scope_count == 0:
        raise HTTPException(status_code=400, detail="Add at least one scope item before sending Final Estimate")

    # Only allowable from draft / rejected_by_gm / review_pending
    if fe["status"] in ("pending_gm_review", "pending_cre_review", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot submit from status: {fe['status']}")

    fe["status"] = "pending_gm_review"
    fe["sent_to_gm_at"] = _now()
    fe["sent_to_gm_by"] = user.user_id
    # Bump revision when Planning re-submits after a GM rejection or CRE review
    if fe.get("gm_rejections") and any(r.get("revision") == fe["revision"] for r in fe["gm_rejections"]):
        fe["revision"] = (fe.get("revision") or 0) + 1
    elif any(r for r in (fe.get("reviews") or []) if r.get("revision") == fe["revision"]):
        fe["revision"] = (fe.get("revision") or 0) + 1
    fe["history"] = (fe.get("history") or []) + [{
        "action": "submit_to_gm",
        "revision": fe["revision"],
        "by": user.user_id,
        "at": fe["sent_to_gm_at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify all GMs (and super admins)
    recipients = await db.users.find(
        {"role": {"$in": ["general_manager", "super_admin"]}, "is_active": True},
        {"_id": 0, "user_id": 1},
    ).to_list(50)
    for r in recipients:
        await _notify(
            r["user_id"],
            "Final Estimate ready for GM approval",
            f"Planning has submitted Final Estimate for {project.get('name', '')}",
            "final_estimate_ready_gm",
            project_id,
        )
    return {"message": "Final Estimate sent to GM for approval", "fe": fe}


@router.post("/planning/projects/{project_id}/final-estimate/submit-to-gm")
async def submit_fe_to_gm(project_id: str, user: User = Depends(get_current_user)):
    return await _submit_fe_to_gm(project_id, user)


# Legacy alias so old UI calls keep working during rollout. Routes to the GM step.
@router.post("/planning/projects/{project_id}/final-estimate/send-to-cre")
async def send_fe_to_cre(project_id: str, user: User = Depends(get_current_user)):
    return await _submit_fe_to_gm(project_id, user)


# ──────────────────────────────────────────────────────────────────────────────
# GM queue + GM approve/reject
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/gm/final-estimates")
async def list_gm_final_estimates(user: User = Depends(get_current_user)):
    """Projects whose Final Estimate is awaiting GM action."""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM can access this")

    projects = await db.projects.find(
        {
            "fe.status": {"$in": ["pending_gm_review", "rejected_by_gm"]},
            "$or": [{"is_archived": {"$exists": False}}, {"is_archived": False}],
        },
        {"_id": 0, "project_id": 1, "name": 1, "client_name": 1, "client_phone": 1,
         "location": 1, "total_value": 1, "fe": 1, "created_at": 1},
    ).sort("fe.sent_to_gm_at", -1).to_list(200)
    return projects


@router.post("/gm/final-estimates/{project_id}/approve")
async def gm_approve_fe(project_id: str, user: User = Depends(get_current_user)):
    """GM approves → moves FE to CRE's queue."""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM can approve")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if fe["status"] != "pending_gm_review":
        raise HTTPException(status_code=400, detail=f"Cannot GM-approve from status: {fe['status']}")

    fe["status"] = "pending_cre_review"
    fe["gm_approved_at"] = _now()
    fe["gm_approved_by"] = user.user_id
    fe["sent_to_cre_at"] = fe["gm_approved_at"]
    fe["sent_to_cre_by"] = user.user_id
    fe["history"] = (fe.get("history") or []) + [{
        "action": "gm_approve",
        "revision": fe["revision"],
        "by": user.user_id,
        "at": fe["gm_approved_at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify CRE
    cres = await db.users.find({"role": "cre", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for c in cres:
        await _notify(
            c["user_id"],
            "Final Estimate ready for CRE review",
            f"GM approved Final Estimate for {project.get('name', '')}",
            "final_estimate_ready",
            project_id,
        )
    return {"message": "GM approved. Sent to CRE.", "fe": fe}


class GmRejectBody(BaseModel):
    reason: str


@router.post("/gm/final-estimates/{project_id}/reject")
async def gm_reject_fe(project_id: str, body: GmRejectBody, user: User = Depends(get_current_user)):
    """GM rejects → goes back to Planning with a rejection reason banner."""
    if user.role not in [UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Only GM can reject")

    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    project = await _get_project_or_404(project_id)
    fe = _ensure_fe(project)

    if fe["status"] != "pending_gm_review":
        raise HTTPException(status_code=400, detail=f"Cannot GM-reject from status: {fe['status']}")

    fe["status"] = "rejected_by_gm"
    rejection = {
        "revision": fe["revision"],
        "reason": reason,
        "by": user.user_id,
        "by_name": getattr(user, "name", None),
        "at": _now(),
    }
    fe["gm_rejections"] = (fe.get("gm_rejections") or []) + [rejection]
    fe["history"] = (fe.get("history") or []) + [{
        "action": "gm_reject",
        "revision": fe["revision"],
        "reason": reason,
        "by": user.user_id,
        "at": rejection["at"],
    }]

    await db.projects.update_one({"project_id": project_id}, {"$set": {"fe": fe}})

    # Notify Planning
    planners = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        await _notify(
            p["user_id"],
            "Final Estimate rejected by GM",
            f"GM rejected Final Estimate for {project.get('name', '')}: {reason[:120]}",
            "final_estimate_rejected_gm",
            project_id,
        )
    return {"message": "Rejected. Sent back to Planning.", "fe": fe}


# ──────────────────────────────────────────────────────────────────────────────
# Helper: lock project_value to the latest approved FE grand_total and recompute
# all existing payment_stage amounts from their stored percentages.
# This is called when CRE approves an FE (final approval). The locked value
# becomes the source of truth for ALL payment-stage math going forward.
# Selected behaviour (per user choice "a"): FE re-approval AUTO-refreshes
# project.total_value to the new grand_total — payment stage amounts re-scale.
# ──────────────────────────────────────────────────────────────────────────────
async def _lock_project_value_to_fe(project_id: str, actor_user_id: Optional[str] = None) -> Dict[str, Any]:
    scope = await db.scope_items.find({"project_id": project_id}, {"_id": 0, "total_amount": 1}).to_list(500)
    adds = await db.additional_costs.find({"project_id": project_id}, {"_id": 0, "estimated_amount": 1}).to_list(500)
    deds = await db.deductions.find({"project_id": project_id}, {"_id": 0, "amount": 1}).to_list(500)
    scope_total = round(sum((s.get("total_amount") or 0) for s in scope), 2)
    add_total = sum((a.get("estimated_amount") or 0) for a in adds)
    ded_total = sum((d.get("amount") or 0) for d in deds)
    grand = round(scope_total + add_total - ded_total, 2)

    # PROJECT VALUE = FE scope total ONLY (no additions/deductions).
    # Grand Project Value is a separate denormalized field for UI display.
    project_value = scope_total

    now = _now()
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "total_value": project_value,        # canonical Project Value
            "fe_locked_value": project_value,
            "grand_project_value": grand,        # for UI summary cards
            "fe_locked_at": now,
            "fe_locked_by": actor_user_id,
        }}
    )

    # Recompute every existing payment stage's amount from its stored percentage
    # against the LOCKED Project Value (scope-only).
    stages = await db.payment_stages.find({"project_id": project_id}, {"_id": 0, "stage_id": 1, "percentage": 1, "amount_received": 1, "amount": 1}).to_list(500)
    updated = 0
    for st in stages:
        pct = st.get("percentage")
        if pct is None or pct == "":
            continue
        try:
            pct_f = float(pct)
        except Exception:
            continue
        new_amount = round((project_value * pct_f) / 100) if project_value > 0 else 0
        already = st.get("amount_received") or 0
        if new_amount < already:
            new_amount = already
        await db.payment_stages.update_one(
            {"stage_id": st["stage_id"]},
            {"$set": {"amount": new_amount, "fe_recalc_at": now}}
        )
        updated += 1
    return {"project_value": project_value, "grand_project_value": grand, "stages_recalced": updated}


# ──────────────────────────────────────────────────────────────────────────────
# FE totals (Final Estimate scope + additions - deductions)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/projects/{project_id}/fe-total")
async def get_fe_total(project_id: str, user: User = Depends(get_current_user)):
    """Return the aggregate Final Estimate figure:
    final_estimate_total (scope items) + additional_total − deduction_total = grand_total.
    """
    project = await _get_project_or_404(project_id)
    _ = project  # keep lint quiet
    scope = await db.scope_items.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    adds = await db.additional_costs.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    deds = await db.deductions.find({"project_id": project_id}, {"_id": 0}).to_list(500)

    fe_total = sum((s.get("total_amount") or 0) for s in scope)
    add_total = sum((a.get("estimated_amount") or 0) for a in adds)
    ded_total = sum((d.get("amount") or 0) for d in deds)
    grand = fe_total + add_total - ded_total
    return {
        "final_estimate_total": round(fe_total, 2),
        "additional_total": round(add_total, 2),
        "deduction_total": round(ded_total, 2),
        "grand_total": round(grand, 2),
        "scope_count": len(scope),
        "addition_count": len(adds),
        "deduction_count": len(deds),
    }


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

    # Approve allowed from any non-final status the FE moves through
    if fe["status"] not in ("pending_cre_review", "pending_client_review", "feedback_received", "review_pending"):
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

    # ✅ Lock project_value to this approved FE grand_total + recompute all
    # payment stages from their stored percentages. User-confirmed behaviour:
    # FE re-approval auto-refreshes the locked value (option "a").
    lock_result = await _lock_project_value_to_fe(project_id, user.user_id)

    # Notify Planning
    planners = await db.users.find({"role": "planning", "is_active": True}, {"_id": 0, "user_id": 1}).to_list(50)
    for p in planners:
        await _notify(
            p["user_id"],
            "Final Estimate approved",
            f"CRE approved Final Estimate (Rev {fe['revision']}) for {project.get('name', '')}. Project Value locked at ₹{lock_result['project_value']:,.0f}.",
            "fe_approved",
            project_id,
        )
    return {"message": "Final Estimate approved", "fe": fe, "lock": lock_result}


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

    # Review allowed any time the FE is "in flight" — but never on draft or already-approved
    # (use the Revision flow for post-approval changes).
    if fe["status"] not in ("pending_cre_review", "pending_client_review", "feedback_received", "review_pending"):
        raise HTTPException(status_code=400, detail=f"Cannot review from status: {fe['status']}. Use Revision instead if the FE is already approved.")

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

