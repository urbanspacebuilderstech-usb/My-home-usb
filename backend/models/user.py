"""User-related Pydantic models"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from core.enums import UserRole


class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: UserRole
    phone: Optional[str] = None
    picture: Optional[str] = None
    created_at: Optional[datetime] = None


class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime


class UserInvitation(BaseModel):
    invitation_id: str
    email: str
    name: str
    role: UserRole
    invited_by: str
    created_at: datetime
    status: str = "pending"  # pending, accepted, expired
