"""
Auth & Security Routes
Migrated from server.py monolith
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import httpx
import logging

from core.database import db
from core.deps import get_current_user, create_notification, create_audit_log, send_notification_email
from core.models import UserRole, User, UserSession
from security import (
    SecurityConfig, rate_limiter, InputValidator, SessionManager,
    AuditAction, AuditLogger, DataMasker
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Security Status Endpoint
@router.get("/security/status")
async def get_security_status(user: User = Depends(get_current_user)):
    """Get security status - Super Admin only"""
    if user.role not in [UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    # Get security metrics
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_24h_str = last_24h.isoformat()
    
    # Count recent events
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
    
    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"is_active": True})
    
    return {
        "status": "secure",
        "last_24_hours": {
            "failed_login_attempts": failed_logins,
            "successful_logins": successful_logins,
            "active_sessions": active_sessions
        },
        "users": {
            "total": total_users,
            "active": active_users
        },
        "security_features": {
            "rate_limiting": True,
            "session_expiry": f"{SecurityConfig.SESSION_EXPIRY_HOURS} hours",
            "input_validation": True,
            "nosql_injection_prevention": True,
            "audit_logging": True,
            "https_only": True,
            "security_headers": True
        },
        "checked_at": now.isoformat()
    }


# Audit Logs Endpoint
@router.get("/security/audit-logs")
async def get_audit_logs(
    limit: int = 100,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """Get audit logs - Super Admin and GM only"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {}
    if action:
        query["action"] = action
    if user_id:
        query["user_id"] = user_id
    
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return logs


class DemoLoginRequest(BaseModel):
    email: str


@router.post("/auth/demo-login")
async def demo_login(login_request: DemoLoginRequest, request: Request, response: Response):
    """Demo login with security controls"""
    # Get client IP for rate limiting
    client_ip = request.client.host if request.client else "unknown"
    
    # Check login rate limit (stricter than normal requests)
    if not rate_limiter.check_login_rate_limit(client_ip):
        # Log failed attempt
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown",
            action=AuditAction.LOGIN_FAILED,
            resource_type="auth",
            details={"reason": "rate_limit_exceeded", "email": login_request.email[:50]},
            ip_address=client_ip,
            success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait a minute.")
    
    # Validate and sanitize email
    try:
        email = InputValidator.validate_email(login_request.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check for NoSQL injection
    if not InputValidator.check_nosql_injection(email):
        logger.warning(f"Potential NoSQL injection attempt from IP: {client_ip}")
        raise HTTPException(status_code=400, detail="Invalid input detected")
    
    # Find user by email
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user_doc:
        # Log failed login attempt
        audit_entry = AuditLogger.create_audit_entry(
            user_id="unknown",
            action=AuditAction.LOGIN_FAILED,
            resource_type="auth",
            details={"reason": "user_not_found", "email": email[:50]},
            ip_address=client_ip,
            success=False
        )
        await db.audit_logs.insert_one(audit_entry)
        raise HTTPException(status_code=404, detail="User not found. Available demo users: admin@constructionos.com, accountant@constructionos.com, pm@constructionos.com, etc.")
    
    # Check if user is active
    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact administrator.")
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    # Create secure session token
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
    session_dict["ip_address"] = client_ip  # Track login IP
    session_dict["user_agent"] = request.headers.get("User-Agent", "")[:500]
    await db.user_sessions.insert_one(session_dict)
    
    # Log successful login
    audit_entry = AuditLogger.create_audit_entry(
        user_id=user_doc["user_id"],
        action=AuditAction.LOGIN,
        resource_type="auth",
        details={"method": "demo_login"},
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
    
    # Return user without sensitive fields
    return DataMasker.mask_document(user_doc)


@router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange Google OAuth session - ONLY for invited users"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session ID")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch session data: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid session")
    
    email = data["email"].lower()
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    # ONLY invited users can login via Google
    if not user_doc:
        raise HTTPException(
            status_code=403, 
            detail="Access denied. You must be invited by an administrator to access this system. Please contact your Super Admin."
        )
    
    # Update user profile picture and name from Google if available
    update_fields = {}
    if data.get("picture") and not user_doc.get("picture"):
        update_fields["picture"] = data["picture"]
    if data.get("name") and not user_doc.get("name"):
        update_fields["name"] = data["name"]
    
    if update_fields:
        await db.users.update_one({"email": email}, {"$set": update_fields})
        user_doc.update(update_fields)
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session = UserSession(
        user_id=user_doc["user_id"],
        session_token=session_token,
        expires_at=expires_at,
        created_at=datetime.now(timezone.utc)
    )
    
    session_dict = session.model_dump()
    session_dict["expires_at"] = session_dict["expires_at"].isoformat()
    session_dict["created_at"] = session_dict["created_at"].isoformat()
    await db.user_sessions.insert_one(session_dict)
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )
    
    return User(**user_doc)


# ==================== USER INVITATION SYSTEM ====================

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
    invitation_token: str = Field(default_factory=lambda: uuid.uuid4().hex)
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
    
    email = invite.email.lower()
    
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Check for existing pending invitation
    existing_invite = await db.user_invitations.find_one({
        "email": email, 
        "status": "pending"
    }, {"_id": 0})
    
    if existing_invite:
        # Update existing invitation
        await db.user_invitations.update_one(
            {"invitation_id": existing_invite["invitation_id"]},
            {"$set": {
                "role": invite.role,
                "invitation_token": uuid.uuid4().hex,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                "invited_by": user.user_id,
                "invited_by_name": user.name
            }}
        )
        invitation_token = existing_invite["invitation_token"]
    else:
        # Create new invitation
        invitation = UserInvitation(
            email=email,
            role=invite.role,
            invited_by=user.user_id,
            invited_by_name=user.name
        )
        
        inv_dict = invitation.model_dump()
        inv_dict["expires_at"] = inv_dict["expires_at"].isoformat()
        inv_dict["created_at"] = inv_dict["created_at"].isoformat()
        await db.user_invitations.insert_one(inv_dict)
        invitation_token = invitation.invitation_token
    
    # Create the user in database (status: invited, pending activation)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "name": invite.name or "",
        "role": invite.role,
        "status": "invited",  # User is invited but hasn't logged in yet
        "invited_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)
    
    # Send invitation email (or mock it)
    frontend_url = os.environ.get("FRONTEND_URL", "https://construction-control.preview.emergentagent.com")
    
    if resend.api_key:
        try:
            await send_notification_email(
                email,
                "You've been invited to ConstructionOS",
                f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: #FBBF24; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; color: #1F2937;">ConstructionOS</h1>
                    </div>
                    <div style="padding: 30px; background: #ffffff;">
                        <h2 style="color: #1F2937;">You've been invited!</h2>
                        <p style="color: #4B5563;">
                            <strong>{user.name}</strong> has invited you to join ConstructionOS as a <strong>{invite.role.replace('_', ' ').title()}</strong>.
                        </p>
                        <p style="color: #4B5563;">
                            Click the button below to login with your Google account:
                        </p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="{frontend_url}/login" 
                               style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Login with Google
                            </a>
                        </div>
                        <p style="color: #6B7280; font-size: 14px;">
                            Note: You must login using this email address ({email}) to access the system.
                        </p>
                    </div>
                    <div style="background: #F3F4F6; padding: 15px; text-align: center; color: #6B7280; font-size: 12px;">
                        This invitation expires in 7 days.
                    </div>
                </div>
                """
            )
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to send invitation email: {e}")
            email_sent = False
    else:
        email_sent = False
    
    return {
        "message": f"User invited successfully",
        "email": email,
        "role": invite.role,
        "email_sent": email_sent,
        "note": "User can now login with Google using this email" if email_sent else "Email not sent (Resend API key not configured). User can login with Google using this email."
    }


@router.get("/auth/invitations")
async def get_invitations(user: User = Depends(get_current_user)):
    """Get all user invitations (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can view invitations")
    
    invitations = await db.user_invitations.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return invitations


@router.delete("/auth/invitations/{invitation_id}")
async def cancel_invitation(invitation_id: str, user: User = Depends(get_current_user)):
    """Cancel a pending invitation (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can cancel invitations")
    
    invitation = await db.user_invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    # Delete the invitation
    await db.user_invitations.delete_one({"invitation_id": invitation_id})
    
    # Also delete the user if they haven't logged in yet
    await db.users.delete_one({"email": invitation["email"], "status": "invited"})
    
    return {"message": "Invitation cancelled"}


@router.post("/auth/resend-invitation/{email}")
async def resend_invitation(email: str, user: User = Depends(get_current_user)):
    """Resend invitation email (Super Admin only)"""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can resend invitations")
    
    email = email.lower()
    user_doc = await db.users.find_one({"email": email, "status": "invited"}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Pending invitation not found for this email")
    
    frontend_url = os.environ.get("FRONTEND_URL", "https://construction-control.preview.emergentagent.com")
    
    if not resend.api_key:
        return {
            "message": "Email not sent (Resend API key not configured)",
            "email_sent": False,
            "note": f"User can login at {frontend_url}/login with Google using {email}"
        }
    
    try:
        await send_notification_email(
            email,
            "Reminder: You've been invited to ConstructionOS",
            f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #FBBF24; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; color: #1F2937;">ConstructionOS</h1>
                </div>
                <div style="padding: 30px; background: #ffffff;">
                    <h2 style="color: #1F2937;">Reminder: You're invited!</h2>
                    <p style="color: #4B5563;">
                        You were invited to join ConstructionOS as a <strong>{user_doc.get('role', 'user').replace('_', ' ').title()}</strong>.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{frontend_url}/login" 
                           style="background: #FBBF24; color: #1F2937; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Login with Google
                        </a>
                    </div>
                    <p style="color: #6B7280; font-size: 14px;">
                        Login using: {email}
                    </p>
                </div>
            </div>
            """
        )
        return {"message": "Invitation email resent", "email_sent": True}
    except Exception as e:
        logger.error(f"Failed to resend invitation: {e}")
        return {"message": "Failed to send email", "email_sent": False, "error": str(e)}


# ==================== END USER INVITATION SYSTEM ====================


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
