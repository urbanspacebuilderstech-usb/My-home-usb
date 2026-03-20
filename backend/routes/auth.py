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
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://labour-materials-hub.preview.emergentagent.com")


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
    """Check if the application has been set up (any users exist)"""
    count = await db.users.count_documents({})
    settings = await db.app_settings.find_one({"setting_key": "company_info"}, {"_id": 0})
    return {
        "setup_complete": count > 0,
        "user_count": count,
        "company_name": settings.get("company_name", "") if settings else "",
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
    """One-time setup to create the first Super Admin and company settings.
    Only works when no users exist in the database."""
    count = await db.users.count_documents({})
    if count > 0:
        raise HTTPException(status_code=400, detail="Setup already completed. Users already exist.")

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


@router.post("/auth/login")
async def login(login_request: LoginRequest, request: Request, response: Response):
    """Real login with email + password"""
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

    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])

    return await _create_session_and_respond(user_doc, request, response, "password")


# ==================== DEMO LOGIN (kept for testing) ====================

class DemoLoginRequest(BaseModel):
    email: str


@router.post("/auth/demo-login")
async def demo_login(login_request: DemoLoginRequest, request: Request, response: Response):
    """Demo login - email only, no password. For testing/demo purposes."""
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
        "setup_link": setup_link if not email_sent else None,
        "note": "Setup link sent via email" if email_sent else f"Email not configured. Share this setup link manually: {setup_link}"
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
        return {"message": "Email not configured", "email_sent": False, "setup_link": setup_link}

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
        return {"message": "Failed to send email", "email_sent": False, "setup_link": setup_link}


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
