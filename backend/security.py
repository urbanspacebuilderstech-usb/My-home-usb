"""
Security Module for Construction CRM
=====================================
P0 Security Implementation:
- Session management with expiration
- Input validation & sanitization
- Rate limiting
- RBAC enforcement
- Audit logging
- NoSQL injection prevention
"""

import re
import html
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from functools import wraps
from collections import defaultdict
import time

from fastapi import HTTPException, Request, status
from pydantic import BaseModel, validator, Field


# =============================================================================
# CONFIGURATION
# =============================================================================

class SecurityConfig:
    # Session settings
    SESSION_EXPIRY_HOURS = 24  # Sessions expire after 24 hours
    SESSION_REFRESH_THRESHOLD_HOURS = 12  # Refresh if less than 12 hours remaining
    
    # Rate limiting
    RATE_LIMIT_WINDOW_SECONDS = 60  # 1 minute window
    RATE_LIMIT_MAX_REQUESTS = 100  # Max 100 requests per minute per IP
    LOGIN_RATE_LIMIT_MAX = 5  # Max 5 login attempts per minute
    
    # Password policy
    MIN_PASSWORD_LENGTH = 8
    REQUIRE_UPPERCASE = True
    REQUIRE_LOWERCASE = True
    REQUIRE_DIGIT = True
    REQUIRE_SPECIAL = True
    
    # Input validation
    MAX_STRING_LENGTH = 10000
    MAX_NAME_LENGTH = 200
    MAX_EMAIL_LENGTH = 254
    MAX_PHONE_LENGTH = 20
    
    # Sensitive fields to never return
    SENSITIVE_FIELDS = ['password', 'password_hash', 'session_token', 'access_token', 'refresh_token', 'secret_key']


# =============================================================================
# RATE LIMITING
# =============================================================================

class RateLimiter:
    """In-memory rate limiter for API endpoints"""
    
    def __init__(self):
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self.login_attempts: Dict[str, List[float]] = defaultdict(list)
    
    def _clean_old_requests(self, key: str, storage: Dict[str, List[float]], window: int):
        """Remove requests older than the window"""
        cutoff = time.time() - window
        storage[key] = [t for t in storage[key] if t > cutoff]
    
    def check_rate_limit(self, identifier: str, max_requests: int = None, window: int = None) -> bool:
        """Check if request is within rate limit. Returns True if allowed."""
        max_req = max_requests or SecurityConfig.RATE_LIMIT_MAX_REQUESTS
        win = window or SecurityConfig.RATE_LIMIT_WINDOW_SECONDS
        
        self._clean_old_requests(identifier, self.requests, win)
        
        if len(self.requests[identifier]) >= max_req:
            return False
        
        self.requests[identifier].append(time.time())
        return True
    
    def check_login_rate_limit(self, identifier: str) -> bool:
        """Special rate limit for login attempts"""
        self._clean_old_requests(identifier, self.login_attempts, SecurityConfig.RATE_LIMIT_WINDOW_SECONDS)
        
        if len(self.login_attempts[identifier]) >= SecurityConfig.LOGIN_RATE_LIMIT_MAX:
            return False
        
        self.login_attempts[identifier].append(time.time())
        return True
    
    def get_remaining_requests(self, identifier: str) -> int:
        """Get remaining requests for identifier"""
        self._clean_old_requests(identifier, self.requests, SecurityConfig.RATE_LIMIT_WINDOW_SECONDS)
        return max(0, SecurityConfig.RATE_LIMIT_MAX_REQUESTS - len(self.requests[identifier]))


# Global rate limiter instance
rate_limiter = RateLimiter()


# =============================================================================
# INPUT VALIDATION & SANITIZATION
# =============================================================================

class InputValidator:
    """Validate and sanitize user inputs to prevent injection attacks"""
    
    # Patterns for validation
    EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    PHONE_PATTERN = re.compile(r'^[+]?[\d\s\-()]{7,20}$')
    ALPHANUMERIC_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,!?@#$%&*()]+$')
    
    # MongoDB injection patterns to block
    NOSQL_INJECTION_PATTERNS = [
        r'\$where',
        r'\$gt',
        r'\$lt',
        r'\$ne',
        r'\$in',
        r'\$nin',
        r'\$or',
        r'\$and',
        r'\$not',
        r'\$nor',
        r'\$exists',
        r'\$type',
        r'\$mod',
        r'\$regex',
        r'\$text',
        r'\$where',
        r'\$elemMatch',
        r'\$size',
        r'\$all',
        r'{\s*\$',
    ]
    
    @classmethod
    def sanitize_string(cls, value: str, max_length: int = None) -> str:
        """Sanitize a string input"""
        if not isinstance(value, str):
            return str(value) if value is not None else ""
        
        # Trim whitespace
        value = value.strip()
        
        # Limit length
        max_len = max_length or SecurityConfig.MAX_STRING_LENGTH
        if len(value) > max_len:
            value = value[:max_len]
        
        # HTML encode to prevent XSS
        value = html.escape(value)
        
        return value
    
    @classmethod
    def sanitize_html(cls, value: str) -> str:
        """Remove potentially dangerous HTML/script tags"""
        if not value:
            return ""
        
        # Remove script tags
        value = re.sub(r'<script[^>]*>.*?</script>', '', value, flags=re.IGNORECASE | re.DOTALL)
        # Remove event handlers
        value = re.sub(r'\s*on\w+\s*=\s*["\'][^"\']*["\']', '', value, flags=re.IGNORECASE)
        # Remove javascript: urls
        value = re.sub(r'javascript:', '', value, flags=re.IGNORECASE)
        
        return value
    
    @classmethod
    def check_nosql_injection(cls, value: Any) -> bool:
        """Check if value contains potential NoSQL injection. Returns True if safe."""
        if value is None:
            return True
        
        str_value = str(value).lower()
        
        for pattern in cls.NOSQL_INJECTION_PATTERNS:
            if re.search(pattern, str_value, re.IGNORECASE):
                return False
        
        return True
    
    @classmethod
    def validate_email(cls, email: str) -> str:
        """Validate and sanitize email"""
        email = cls.sanitize_string(email, SecurityConfig.MAX_EMAIL_LENGTH).lower()
        
        if not email:
            raise ValueError("Email is required")
        
        if not cls.EMAIL_PATTERN.match(email):
            raise ValueError("Invalid email format")
        
        return email
    
    @classmethod
    def validate_phone(cls, phone: str) -> str:
        """Validate and sanitize phone number"""
        if not phone:
            return ""
        
        phone = cls.sanitize_string(phone, SecurityConfig.MAX_PHONE_LENGTH)
        # Remove all non-digit characters except + for country code
        phone = re.sub(r'[^\d+]', '', phone)
        
        if phone and not cls.PHONE_PATTERN.match(phone):
            raise ValueError("Invalid phone format")
        
        return phone
    
    @classmethod
    def validate_name(cls, name: str) -> str:
        """Validate and sanitize name"""
        name = cls.sanitize_string(name, SecurityConfig.MAX_NAME_LENGTH)
        
        if not name:
            raise ValueError("Name is required")
        
        # Remove any potential script injections
        name = cls.sanitize_html(name)
        
        return name
    
    @classmethod
    def sanitize_dict(cls, data: Dict[str, Any], deep: bool = True) -> Dict[str, Any]:
        """Recursively sanitize all string values in a dictionary"""
        if not isinstance(data, dict):
            return data
        
        sanitized = {}
        for key, value in data.items():
            # Sanitize the key too
            safe_key = cls.sanitize_string(str(key), 100)
            
            if isinstance(value, str):
                sanitized[safe_key] = cls.sanitize_string(value)
            elif isinstance(value, dict) and deep:
                sanitized[safe_key] = cls.sanitize_dict(value, deep=True)
            elif isinstance(value, list) and deep:
                sanitized[safe_key] = [
                    cls.sanitize_dict(item) if isinstance(item, dict) 
                    else cls.sanitize_string(item) if isinstance(item, str)
                    else item
                    for item in value
                ]
            else:
                sanitized[safe_key] = value
        
        return sanitized


# =============================================================================
# SESSION MANAGEMENT
# =============================================================================

class SessionManager:
    """Secure session management with expiration"""
    
    @staticmethod
    def generate_session_token() -> str:
        """Generate a cryptographically secure session token"""
        return f"sess_{secrets.token_urlsafe(32)}"
    
    @staticmethod
    def get_session_expiry() -> datetime:
        """Get session expiry time"""
        return datetime.now(timezone.utc) + timedelta(hours=SecurityConfig.SESSION_EXPIRY_HOURS)
    
    @staticmethod
    def is_session_expired(expires_at: str) -> bool:
        """Check if session has expired"""
        if not expires_at:
            return True
        
        try:
            expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            return datetime.now(timezone.utc) > expiry
        except:
            return True
    
    @staticmethod
    def should_refresh_session(expires_at: str) -> bool:
        """Check if session should be refreshed"""
        if not expires_at:
            return True
        
        try:
            expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
            remaining = expiry - datetime.now(timezone.utc)
            return remaining < timedelta(hours=SecurityConfig.SESSION_REFRESH_THRESHOLD_HOURS)
        except:
            return True


# =============================================================================
# RBAC (Role-Based Access Control)
# =============================================================================

class RBACConfig:
    """Role-Based Access Control configuration"""
    
    # Role hierarchy (higher number = more permissions)
    ROLE_HIERARCHY = {
        'client': 1,
        'site_engineer': 2,
        'senior_site_engineer': 2,
        'pre_sales': 3,
        'sales': 3,
        'cre': 4,
        'planning': 4,
        'procurement': 4,
        'accountant': 5,
        'project_manager': 6,
        'associate_project_manager': 5,
        'marketing_head': 6,
        'gm': 7,
        'super_admin': 10,
    }
    
    # Resource permissions by role
    PERMISSIONS = {
        # Projects
        'projects:read': ['client', 'site_engineer', 'senior_site_engineer', 'pre_sales', 'sales', 'cre', 'planning', 'procurement', 'accountant', 'project_manager', 'associate_project_manager', 'marketing_head', 'gm', 'super_admin'],
        'projects:create': ['cre', 'planning', 'project_manager', 'gm', 'super_admin'],
        'projects:update': ['cre', 'planning', 'project_manager', 'gm', 'super_admin'],
        'projects:delete': ['gm', 'super_admin'],
        
        # Financials
        'financials:read': ['accountant', 'cre', 'project_manager', 'gm', 'super_admin'],
        'financials:write': ['accountant', 'gm', 'super_admin'],
        
        # Users
        'users:read': ['project_manager', 'marketing_head', 'gm', 'super_admin'],
        'users:create': ['gm', 'super_admin'],
        'users:update': ['gm', 'super_admin'],
        'users:delete': ['super_admin'],
        
        # Leads
        'leads:read': ['pre_sales', 'sales', 'cre', 'marketing_head', 'gm', 'super_admin'],
        'leads:create': ['pre_sales', 'sales', 'marketing_head', 'super_admin'],
        'leads:update': ['pre_sales', 'sales', 'cre', 'marketing_head', 'gm', 'super_admin'],
        
        # Material Requests
        'material_requests:create': ['site_engineer', 'senior_site_engineer', 'project_manager'],
        'material_requests:approve': ['project_manager', 'planning', 'procurement', 'accountant', 'gm', 'super_admin'],
        
        # Petty Cash
        'petty_cash:request': ['site_engineer', 'senior_site_engineer', 'project_manager'],
        'petty_cash:approve': ['accountant', 'gm', 'super_admin'],
        
        # Reports
        'reports:read': ['accountant', 'project_manager', 'marketing_head', 'gm', 'super_admin'],
        'reports:export': ['accountant', 'gm', 'super_admin'],
        
        # Settings
        'settings:read': ['gm', 'super_admin'],
        'settings:write': ['super_admin'],
        
        # Audit Logs
        'audit:read': ['gm', 'super_admin'],
    }
    
    @classmethod
    def has_permission(cls, role: str, permission: str) -> bool:
        """Check if role has specific permission"""
        if not role or not permission:
            return False
        
        role = role.lower()
        allowed_roles = cls.PERMISSIONS.get(permission, [])
        return role in allowed_roles
    
    @classmethod
    def get_role_level(cls, role: str) -> int:
        """Get role hierarchy level"""
        return cls.ROLE_HIERARCHY.get(role.lower(), 0)
    
    @classmethod
    def can_manage_role(cls, manager_role: str, target_role: str) -> bool:
        """Check if manager role can manage target role"""
        return cls.get_role_level(manager_role) > cls.get_role_level(target_role)


def require_permission(permission: str):
    """Decorator to enforce permission check"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get user from kwargs
            user = kwargs.get('user') or kwargs.get('current_user')
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            if not RBACConfig.has_permission(user.role, permission):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission denied. Required: {permission}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def require_roles(*roles):
    """Decorator to enforce role check"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user = kwargs.get('user') or kwargs.get('current_user')
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            if user.role.lower() not in [r.lower() for r in roles]:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Access denied. Required roles: {', '.join(roles)}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# AUDIT LOGGING
# =============================================================================

class AuditAction:
    """Audit action types"""
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    APPROVE = "approve"
    REJECT = "reject"
    EXPORT = "export"
    PERMISSION_DENIED = "permission_denied"


class AuditLogger:
    """Security audit logging"""
    
    @staticmethod
    def create_audit_entry(
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: str = None,
        details: Dict[str, Any] = None,
        ip_address: str = None,
        success: bool = True
    ) -> Dict[str, Any]:
        """Create an audit log entry"""
        return {
            "audit_id": f"aud_{secrets.token_hex(8)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": InputValidator.sanitize_dict(details) if details else {},
            "ip_address": ip_address,
            "success": success,
        }


# =============================================================================
# DATA MASKING
# =============================================================================

class DataMasker:
    """Mask sensitive data in responses"""
    
    @classmethod
    def mask_document(cls, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Remove sensitive fields from document"""
        if not doc:
            return doc
        
        masked = {}
        for key, value in doc.items():
            if key.lower() in SecurityConfig.SENSITIVE_FIELDS:
                continue  # Skip sensitive fields entirely
            elif isinstance(value, dict):
                masked[key] = cls.mask_document(value)
            elif isinstance(value, list):
                masked[key] = [
                    cls.mask_document(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                masked[key] = value
        
        return masked
    
    @classmethod
    def mask_email(cls, email: str) -> str:
        """Partially mask email for display"""
        if not email or '@' not in email:
            return email
        
        local, domain = email.split('@', 1)
        if len(local) <= 2:
            masked_local = local[0] + '*'
        else:
            masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
        
        return f"{masked_local}@{domain}"
    
    @classmethod
    def mask_phone(cls, phone: str) -> str:
        """Partially mask phone for display"""
        if not phone or len(phone) < 6:
            return phone
        
        return phone[:2] + '*' * (len(phone) - 4) + phone[-2:]


# =============================================================================
# SECURITY HEADERS
# =============================================================================

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


# =============================================================================
# EXPORTS
# =============================================================================

__all__ = [
    'SecurityConfig',
    'RateLimiter',
    'rate_limiter',
    'InputValidator',
    'SessionManager',
    'RBACConfig',
    'require_permission',
    'require_roles',
    'AuditAction',
    'AuditLogger',
    'DataMasker',
    'SECURITY_HEADERS',
]
