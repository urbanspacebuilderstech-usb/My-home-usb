"""
Auth & Security Routes
Includes: Real password login, forgot/reset password, user invitation, demo login, Google OAuth
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import hashlib
import secrets
import os
import httpx
import asyncio
import resend
import logging

from passlib.context import CryptContext

from core.database import db
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import UserRole, User, UserSession
from security import (
    SecurityConfig, rate_limiter, InputValidator, SessionManager,
    AuditAction, AuditLogger, DataMasker
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://crm-onboard-flow.preview.emergentagent.com")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ==================== FIRST-TIME SETUP (models + status check) ====================

class InitialSetupRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=100)
    admin_name: str = Field(..., min_length=2, max_length=100)
    admin_email: str = Field(..., min_length=5, max_length=100)
    admin_phone: Optional[str] = None
    admin_password: str = Field(..., min_length=6, max_length=100)

@router.get("/auth/setup-status")
async def get_setup_status():
    """Check if the application has been set up (any super_admin exists)"""
    admin_count = await db.users.count_documents({"role": "super_admin"})
    settings = await db.app_settings.find_one({"setting_key": "company_info"}, {"_id": 0})
    return {
        "setup_needed": admin_count == 0,
        "setup_complete": admin_count > 0,
        "company_name": settings.get("company_name", "") if settings else "",
        "demo_mode": DEMO_MODE,
    }


async def _create_session_and_respond(user_doc: dict, request: Request, response: Response, login_method: str):
    """Shared session creation logic for all login methods"""
    client_ip = request.client.host if request.client else "unknown"

    session_token = SessionManager.generate_session_token()
    expires_at = SessionManager.get_session_expiry()

    session = UserSession(
        user_id=user_doc["user_id"],
        session_token=session_token,
        expires_at=expires_at,
        created_at=datetime.now(timezone.utc)
    )

    session_dict = session.model_dump()
    session_dict["expires_at"] = session_dict["expires_at"].isoformat()
    session_dict["created_at"] = session_dict["created_at"].isoformat()
    session_dict["ip_address"] = client_ip
    session_dict["user_agent"] = request.headers.get("User-Agent", "")[:500]
    await db.user_sessions.insert_one(session_dict)

    audit_entry = AuditLogger.create_audit_entry(
        user_id=user_doc["user_id"],
        action=AuditAction.LOGIN,
        resource_type="auth",
        details={"method": login_method},
        ip_address=client_ip,
        success=True
    )
    await db.audit_logs.insert_one(audit_entry)

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SecurityConfig.SESSION_EXPIRY_HOURS * 60 * 60
    )

    return DataMasker.mask_document(user_doc)


# ==================== INITIAL SETUP (POST - needs _create_session_and_respond) ====================

@router.post("/auth/initial-setup")
async def initial_setup(data: InitialSetupRequest, request: Request, response: Response):
    """Setup to create a Super Admin and company settings."""
    # Check if email already exists
    existing = await db.users.find_one({"email": data.admin_email.lower().strip()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    if "@" not in data.admin_email or "." not in data.admin_email:
        raise HTTPException(status_code=400, detail="Invalid email format")

    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user_{uuid.uuid4().hex[:12]}"

    admin_user = {
        "user_id": user_id,
        "email": data.admin_email.lower().strip(),
        "name": data.admin_name.strip(),
        "role": "super_admin",
        "phone": data.admin_phone or "",
        "password_hash": hash_password(data.admin_password),
        "is_active": True,
        "status": "active",
        "created_at": now,
    }
    await db.users.insert_one(admin_user)

    await db.app_settings.update_one(
        {"setting_key": "company_info"},
        {"$set": {
            "setting_key": "company_info",
            "company_name": data.company_name.strip(),
            "admin_email": data.admin_email.lower().strip(),
            "setup_at": now,
        }},
        upsert=True,
    )

    logger.info(f"Initial setup complete: {data.admin_email} as Super Admin for {data.company_name}")

    admin_user.pop("_id", None)
    return await _create_session_and_respond(admin_user, request, response, "initial_setup")


# ==================== SECURITY STATUS ====================

@router.get("/security/status")
async def get_security_status(user: User = Depends(get_current_user)):
    """Get security status - Super Admin only"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Super Admin access required")

    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_24h_str = last_24h.isoformat()

    failed_logins = await db.audit_logs.count_documents({
        "action": AuditAction.LOGIN_FAILED,
        "timestamp": {"$gte": last_24h_str}
    })

    successful_logins = await db.audit_logs.count_documents({
        "action": AuditAction.LOGIN,
        "timestamp": {"$gte": last_24h_str}
    })

    active_sessions = await db.user_sessions.count_documents({
        "expires_at": {"$gte": now.isoformat()}
    })

    return {
        "status": "secure",
        "security_features": {
            "rate_limiting": True,
            "input_sanitization": True,
            "nosql_injection_prevention": True,
            "session_management": True,
            "security_headers": True,
            "audit_logging": True,
            "password_hashing": True,
            "rbac": True
        },
        "metrics": {
            "active_sessions": active_sessions,
            "failed_logins_24h": failed_logins,
            "successful_logins_24h": successful_logins
        },
        "config": {
            "session_expiry": f"{SecurityConfig.SESSION_EXPIRY_HOURS} hours",
            "rate_limit": f"{SecurityConfig.MAX_REQUESTS_PER_MINUTE} req/min",
            "login_rate_limit": f"{SecurityConfig.MAX_LOGIN_ATTEMPTS} attempts/min"
        }
    }


@router.get("/security/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    action: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super Admin access required")

    query = {}
    if action:
        query["action"] = action

    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs


# ==================== REAL PASSWORD LOGIN ====================

class LoginRequest(BaseModel):
    email: str
    password: str
    totp_code: Optional[str] = None


@router.post("/auth/login")
async def login(login_request: LoginRequest, request: Request, response: Response):
    """Real login with email + password + optional 2FA"""
    client_ip = request.client.host if request.client else "unknown"

    if not rate_limiter.check_login_rate_limit(client_ip):
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown", action=AuditAction.LOGIN_FAILED,
            resource_type="auth", details={"reason": "rate_limit_exceeded"},
            ip_address=client_ip, success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute.")

    try:
        email = InputValidator.validate_email(login_request.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not InputValidator.check_nosql_injection(email):
        raise HTTPException(status_code=400, detail="Invalid input detected")

    user_doc = await db.users.find_one({"email": email}, {"_id": 0})

    if not user_doc:
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown", action=AuditAction.LOGIN_FAILED,
            resource_type="auth", details={"reason": "user_not_found"},
            ip_address=client_ip, success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact administrator.")

    # Check password
    stored_hash = user_doc.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="Password not set. Please use 'Forgot Password' or contact administrator.")

    if not verify_password(login_request.password, stored_hash):
        audit_entry = AuditLogger.create_audit_entry(
            user_id=user_doc.get("user_id", "unknown"), action=AuditAction.LOGIN_FAILED,
            resource_type="auth", details={"reason": "invalid_password"},
            ip_address=client_ip, success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check 2FA
    if user_doc.get("two_factor_enabled") and user_doc.get("totp_secret"):
        if not login_request.totp_code:
            return {"requires_2fa": True, "message": "2FA verification required"}
        import pyotp
        totp = pyotp.TOTP(user_doc["totp_secret"])
        if not totp.verify(login_request.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    return await _create_session_and_respond(user_doc, request, response, "password")


# ==================== DEMO LOGIN (kept for testing) ====================

class DemoLoginRequest(BaseModel):
    email: str


DEMO_MODE = os.environ.get("DEMO_MODE", "true").lower() == "true"


@router.post("/auth/demo-login")
async def demo_login(login_request: DemoLoginRequest, request: Request, response: Response):
    """Demo login - email only, no password. Disabled when DEMO_MODE=false."""
    if not DEMO_MODE:
        raise HTTPException(status_code=403, detail="Demo login is disabled in production.")

    client_ip = request.client.host if request.client else "unknown"

    if not rate_limiter.check_login_rate_limit(client_ip):
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown", action=AuditAction.LOGIN_FAILED,
            resource_type="auth", details={"reason": "rate_limit_exceeded", "email": login_request.email[:50]},
            ip_address=client_ip, success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute.")

    try:
        email = InputValidator.validate_email(login_request.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not InputValidator.check_nosql_injection(email):
        raise HTTPException(status_code=400, detail="Invalid input detected")

    user_doc = await db.users.find_one({"email": email}, {"_id": 0})

    if not user_doc:
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown", action=AuditAction.LOGIN_FAILED,
            resource_type="auth", details={"reason": "user_not_found", "email": email[:50]},
            ip_address=client_ip, success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=404, detail="User not found")

    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact administrator.")

    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    return await _create_session_and_respond(user_doc, request, response, "demo_login")


# ==================== FORGOT / RESET PASSWORD ====================

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class SetupPasswordRequest(BaseModel):
    token: str
    name: str
    password: str


@router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Send password reset email"""
    email = req.email.lower().strip()

    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return success to prevent email enumeration
    if not user_doc:
        return {"message": "If an account exists with this email, a reset link has been sent."}

    # Generate reset token
    reset_token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    await db.password_resets.delete_many({"email": email})
    await db.password_resets.insert_one({
        "email": email,
        "token_hash": hashlib.sha256(reset_token.encode()).hexdigest(),
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    email_sent = False
    if resend.api_key:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": "ConstructionOS - Reset Your Password",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #1F2937; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; color: #FBBF24;">ConstructionOS</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff; border: 1px solid #E5E7EB;">
                        <h2 style="color: #1F2937;">Reset Your Password</h2>
                        <p style="color: #4B5563;">
                            We received a request to reset your password. Click the button below to set a new password.
                        </p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{reset_link}"
                               style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        <p style="color: #9CA3AF; font-size: 13px;">
                            This link expires in 1 hour. If you didn't request this, ignore this email.
                        </p>
                    </div>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
            logger.info(f"Password reset email sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send reset email: {e}")

    return {"message": "If an account exists with this email, a reset link has been sent."}


@router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """Reset password using token"""
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    token_hash = hashlib.sha256(req.token.encode()).hexdigest()

    reset_doc = await db.password_resets.find_one({"token_hash": token_hash}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if reset_doc.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        await db.password_resets.delete_one({"token_hash": token_hash})
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    email = reset_doc["email"]
    hashed = hash_password(req.new_password)

    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hashed, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Cleanup
    await db.password_resets.delete_many({"email": email})
    # Invalidate all existing sessions for security
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if user_doc:
        await db.user_sessions.delete_many({"user_id": user_doc["user_id"]})

    return {"message": "Password reset successfully. You can now login."}


# ==================== USER INVITATION + PASSWORD SETUP ====================

class UserInvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class UserInvitation(BaseModel):
    invitation_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    email: str
    role: UserRole
    invited_by: str
    invited_by_name: Optional[str] = None
    status: UserInvitationStatus = UserInvitationStatus.PENDING
    invitation_token: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InviteUserRequest(BaseModel):
    email: str
    role: UserRole
    name: Optional[str] = None


@router.post("/auth/invite-user")
async def invite_user(invite: InviteUserRequest, user: User = Depends(get_current_user)):
    """Super Admin invites a new user by email"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can invite users")

    email = invite.email.lower().strip()

    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create invitation
    invitation = UserInvitation(
        email=email,
        role=invite.role,
        invited_by=user.user_id,
        invited_by_name=user.name
    )

    # Upsert invitation
    await db.user_invitations.update_one(
        {"email": email, "status": "pending"},
        {"$set": {
            **invitation.model_dump(),
            "expires_at": invitation.expires_at.isoformat(),
            "created_at": invitation.created_at.isoformat()
        }},
        upsert=True
    )

    # Create user record (status: invited)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": invite.name or "",
        "role": invite.role,
        "is_active": True,
        "status": "invited",
        "invited_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)

    # Send invitation email
    setup_link = f"{FRONTEND_URL}/setup-password?token={invitation.invitation_token}"
    email_sent = False

    if resend.api_key:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": "You've been invited to ConstructionOS",
                "html": f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #1F2937; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; color: #FBBF24;">ConstructionOS</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff; border: 1px solid #E5E7EB;">
                        <h2 style="color: #1F2937;">You've been invited!</h2>
                        <p style="color: #4B5563;">
                            <strong>{user.name}</strong> has invited you to join ConstructionOS as a <strong>{invite.role.value.replace('_', ' ').title()}</strong>.
                        </p>
                        <p style="color: #4B5563;">Click below to set up your password and get started:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{setup_link}"
                               style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                Set Up Your Account
                            </a>
                        </div>
                        <p style="color: #9CA3AF; font-size: 13px;">This invitation expires in 7 days.</p>
                    </div>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to send invitation email: {e}")

    return {
        "message": "User invited successfully",
        "email": email,
        "role": invite.role,
        "email_sent": email_sent,
        "note": "Invitation email sent" if email_sent else "Email delivery failed. Please resend or ask user to contact admin."
    }


@router.get("/auth/verify-invitation/{token}")
async def verify_invitation(token: str):
    """Verify an invitation token is valid"""
    invitation = await db.user_invitations.find_one({
        "invitation_token": token,
        "status": "pending"
    }, {"_id": 0})

    if not invitation:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation link")

    if invitation.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        await db.user_invitations.update_one(
            {"invitation_token": token},
            {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=400, detail="Invitation has expired. Contact administrator.")

    return {
        "email": invitation["email"],
        "role": invitation["role"],
        "invited_by_name": invitation.get("invited_by_name", "Administrator")
    }


@router.post("/auth/setup-password")
async def setup_password(req: SetupPasswordRequest):
    """Accept invitation and set password"""
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    invitation = await db.user_invitations.find_one({
        "invitation_token": req.token,
        "status": "pending"
    }, {"_id": 0})

    if not invitation:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation link")

    if invitation.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Invitation has expired")

    email = invitation["email"]
    hashed = hash_password(req.password)

    # Update user with name and password
    result = await db.users.update_one(
        {"email": email},
        {"$set": {
            "name": req.name.strip(),
            "password_hash": hashed,
            "status": "active",
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User account not found")

    # Mark invitation as accepted
    await db.user_invitations.update_one(
        {"invitation_token": req.token},
        {"$set": {"status": "accepted"}}
    )

    return {"message": "Account setup complete! You can now login."}


# ==================== INVITATION MANAGEMENT ====================

@router.get("/auth/invitations")
async def get_invitations(user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can view invitations")
    invitations = await db.user_invitations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return invitations


@router.delete("/auth/invitations/{invitation_id}")
async def cancel_invitation(invitation_id: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can cancel invitations")

    invitation = await db.user_invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    await db.user_invitations.delete_one({"invitation_id": invitation_id})
    await db.users.delete_one({"email": invitation["email"], "status": "invited"})

    return {"message": "Invitation cancelled"}


@router.post("/auth/resend-invitation/{email}")
async def resend_invitation(email: str, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can resend invitations")

    email = email.lower()
    invitation = await db.user_invitations.find_one({"email": email, "status": "pending"}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found for this email")

    # Generate new token
    new_token = secrets.token_urlsafe(48)
    await db.user_invitations.update_one(
        {"email": email, "status": "pending"},
        {"$set": {
            "invitation_token": new_token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        }}
    )

    setup_link = f"{FRONTEND_URL}/setup-password?token={new_token}"

    if not resend.api_key:
        return {"message": "Email service not configured. Contact system administrator.", "email_sent": False}

    try:
        user_doc = await db.users.find_one({"email": email}, {"_id": 0})
        role_name = user_doc.get("role", "user").replace("_", " ").title() if user_doc else "User"

        params = {
            "from": SENDER_EMAIL,
            "to": [email],
            "subject": "Reminder: You're invited to ConstructionOS",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #1F2937; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; color: #FBBF24;">ConstructionOS</h1>
                </div>
                <div style="padding: 30px; background: #ffffff; border: 1px solid #E5E7EB;">
                    <h2 style="color: #1F2937;">Reminder: You're invited!</h2>
                    <p style="color: #4B5563;">You were invited to join as <strong>{role_name}</strong>.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{setup_link}"
                           style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                            Set Up Your Account
                        </a>
                    </div>
                </div>
            </div>
            """
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return {"message": "Invitation email resent", "email_sent": True}
    except Exception as e:
        logger.error(f"Failed to resend invitation: {e}")
        return {"message": "Failed to send email. Please try again.", "email_sent": False}


# ==================== CURRENT USER & LOGOUT ====================

@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}



# ==================== PROFILE & 2FA ====================

import pyotp
import qrcode
import io
import base64

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


@router.get("/auth/profile")
async def get_profile(user: User = Depends(get_current_user)):
    """Get current user profile"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    user_doc["two_factor_enabled"] = user_doc.get("two_factor_enabled", False)
    return user_doc


@router.put("/auth/profile")
async def update_profile(data: UpdateProfileRequest, user: User = Depends(get_current_user)):
    """Update basic profile info"""
    updates = {}
    if data.name and data.name.strip():
        updates["name"] = data.name.strip()
    if data.phone is not None:
        updates["phone"] = data.phone.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": user.user_id}, {"$set": updates})
    return {"message": "Profile updated", **updates}


class TwoFactorSetupRequest(BaseModel):
    password: str


@router.post("/auth/2fa/setup")
async def setup_2fa(data: TwoFactorSetupRequest, user: User = Depends(get_current_user)):
    """Step 1: Verify password and generate TOTP secret + QR code"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    if user_doc.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="2FA is already enabled")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # Generate TOTP secret
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    email = user_doc.get("email", "user")
    provisioning_uri = totp.provisioning_uri(name=email, issuer_name="My Home USB")

    # Generate QR code as base64
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    # Store secret temporarily (not yet enabled)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"totp_secret_pending": secret}}
    )

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri
    }


class TwoFactorVerifyRequest(BaseModel):
    code: str


@router.post("/auth/2fa/verify")
async def verify_and_enable_2fa(data: TwoFactorVerifyRequest, user: User = Depends(get_current_user)):
    """Step 2: Verify TOTP code and enable 2FA"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    pending_secret = user_doc.get("totp_secret_pending")
    if not pending_secret:
        raise HTTPException(status_code=400, detail="No 2FA setup in progress. Start setup first.")

    totp = pyotp.TOTP(pending_secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid verification code. Please try again.")

    # Enable 2FA
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "totp_secret": pending_secret,
            "two_factor_enabled": True,
            "two_factor_enabled_at": datetime.now(timezone.utc).isoformat()
        }, "$unset": {"totp_secret_pending": ""}}
    )

    return {"message": "2FA enabled successfully", "two_factor_enabled": True}


class TwoFactorDisableRequest(BaseModel):
    password: str
    code: str


@router.post("/auth/2fa/disable")
async def disable_2fa(data: TwoFactorDisableRequest, user: User = Depends(get_current_user)):
    """Disable 2FA — requires password + current TOTP code"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    if not user_doc.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash or not verify_password(data.password, stored_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    secret = user_doc.get("totp_secret")
    totp = pyotp.TOTP(secret)
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"two_factor_enabled": False},
         "$unset": {"totp_secret": "", "totp_secret_pending": ""}}
    )

    return {"message": "2FA disabled successfully", "two_factor_enabled": False}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(data: ChangePasswordRequest, user: User = Depends(get_current_user)):
    """Change password for logged-in user"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash or not verify_password(data.current_password, stored_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "password_hash": new_hash,
            "password_changed_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    return {"message": "Password changed successfully"}


@router.post("/auth/send-password-otp")
async def send_password_otp(user: User = Depends(get_current_user)):
    """Send OTP to user's email for password change"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    email = user_doc.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="No email associated with this account")

    import random
    otp = str(random.randint(100000, 999999))
    otp_hash = hash_password(otp)

    await db.password_otps.delete_many({"user_id": user.user_id})
    await db.password_otps.insert_one({
        "user_id": user.user_id,
        "email": email,
        "otp_hash": otp_hash,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "used": False
    })

    if resend.api_key:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [email],
                "subject": "Your Password Reset OTP",
                "html": f"""
                <div style="font-family:Arial,sans-serif;max-width:450px;margin:0 auto;padding:24px;">
                  <h2 style="color:#1a1a1a;margin-bottom:8px;">Password Reset OTP</h2>
                  <p style="color:#555;font-size:14px;">Use this OTP to reset your password. It expires in 10 minutes.</p>
                  <div style="background:#f8f9fa;border:2px dashed #d97706;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
                    <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">{otp}</span>
                  </div>
                  <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
                </div>
                """
            }
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logger.error(f"Failed to send OTP email: {e}")
            # OTP is still stored — email delivery failed but flow continues
            logger.warning("OTP stored but email delivery failed")

    return {"message": "OTP sent to your email", "email": email[:3] + "***" + email[email.index("@"):]}


class VerifyOTPResetRequest(BaseModel):
    otp: str
    new_password: str


@router.post("/auth/verify-otp-reset-password")
async def verify_otp_reset_password(data: VerifyOTPResetRequest, user: User = Depends(get_current_user)):
    """Verify OTP and set new password"""
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    otp_doc = await db.password_otps.find_one(
        {"user_id": user.user_id, "used": False},
        {"_id": 0}
    )
    if not otp_doc:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")

    if datetime.now(timezone.utc).isoformat() > otp_doc.get("expires_at", ""):
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if not verify_password(data.otp, otp_doc.get("otp_hash", "")):
        raise HTTPException(status_code=400, detail="Invalid OTP. Please check and try again.")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "password_hash": new_hash,
            "password_changed_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await db.password_otps.update_many({"user_id": user.user_id}, {"$set": {"used": True}})

    return {"message": "Password updated successfully"}
