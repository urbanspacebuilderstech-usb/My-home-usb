"""Authentication dependencies"""
from fastapi import Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from .database import db
from .enums import UserRole


class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: UserRole
    phone: Optional[str] = None


async def get_current_user(request: Request) -> User:
    """Get current authenticated user from session cookie"""
    session_id = request.cookies.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session
    session = await db.sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Find user
    user_doc = await db.users.find_one({"user_id": session["user_id"]})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(
        user_id=user_doc["user_id"],
        email=user_doc["email"],
        name=user_doc.get("name", user_doc["email"]),
        role=user_doc.get("role", "client"),
        phone=user_doc.get("phone")
    )
