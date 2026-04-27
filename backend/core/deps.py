"""
Shared dependencies - auth, notifications, audit logging
"""
import uuid
import asyncio
import resend
import os
import logging
from datetime import datetime, timezone
from fastapi import Request, HTTPException

from .database import db
from security import (
    SecurityConfig, rate_limiter, InputValidator, SessionManager,
    AuditAction, AuditLogger, DataMasker
)

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')


# Import User model - must be done after db is available
# We import lazily to avoid circular imports
def _get_user_model():
    from core.models import User
    return User


async def get_current_user(request: Request):
    """Get current authenticated user with security checks"""
    from core.models import User

    # Real client IP (Cloudflare > X-Forwarded-For > direct). Used only for
    # logging; we no longer rate-limit by IP because shared-NAT offices put
    # 50+ users on a single IP and starve everyone — per-user limits below
    # are the right tool for authenticated SPAs.
    cf = request.headers.get("cf-connecting-ip") or request.headers.get("CF-Connecting-IP")
    if cf:
        client_ip = cf.strip()
    else:
        fwd = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
        if fwd:
            client_ip = fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        else:
            client_ip = request.client.host if request.client else "unknown"

    # /auth/me is exempt from any rate limiting (lightweight polling endpoint).
    path = request.url.path or ""
    skip_rate_limit = path.endswith("/auth/me")

    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]

    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    if not session_token or len(session_token) < 10:
        raise HTTPException(status_code=401, detail="Invalid session token")

    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc.get("expires_at")
    if SessionManager.is_session_expired(expires_at if isinstance(expires_at, str) else expires_at.isoformat() if expires_at else None):
        await db.user_sessions.delete_one({"session_token": session_token})
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Per-user rate limit (skipped for /auth/me to avoid throttling polling).
    if not skip_rate_limit and not rate_limiter.check_rate_limit(f"user:{user_doc['user_id']}", max_requests=SecurityConfig.RATE_LIMIT_MAX_REQUESTS_PER_USER):
        logger.warning(f"User-level rate limit exceeded for: {user_doc.get('email')}")
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    user_doc = DataMasker.mask_document(user_doc)

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
        "message": InputValidator.sanitize_string(message, 500),
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification)
    return notification


async def create_audit_log(user_id: str, action: str, resource_type: str, resource_id: str = None, details: dict = None, ip_address: str = None):
    """Create an audit log entry"""
    audit_entry = AuditLogger.create_audit_entry(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
        success=True
    )
    await db.audit_logs.insert_one(audit_entry)
    return audit_entry
