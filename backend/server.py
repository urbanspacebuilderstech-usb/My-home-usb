"""
ConstructionOS - Main Application Entry Point
All routes are in modular files under /routes/
Shared infrastructure is in /core/
"""
from fastapi import FastAPI, APIRouter, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
import secrets
import logging
from pathlib import Path

from security import SECURITY_HEADERS
from core.database import client

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# App setup
app = FastAPI(title="ConstructionOS API")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Security middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


# CSRF Protection middleware
class CSRFMiddleware(BaseHTTPMiddleware):
    """CSRF protection for state-changing requests.
    Validates Origin/Referer header matches allowed origins for POST/PATCH/PUT/DELETE."""
    
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
    
    async def dispatch(self, request: Request, call_next):
        if request.method in self.SAFE_METHODS:
            return await call_next(request)
        
        origin = request.headers.get("origin", "")
        
        # Allow if no origin (same-origin / server-to-server)
        if not origin:
            return await call_next(request)
        
        allowed_origins = os.environ.get('CORS_ORIGINS', '').split(',')
        
        # Check explicit origins
        is_allowed = any(origin.startswith(ao.strip()) for ao in allowed_origins if ao.strip())
        
        # Also allow Cloudflare preview cluster origins (cluster-N pattern)
        if not is_allowed and '.preview.emergentcf.cloud' in origin:
            app_name = allowed_origins[0].split('//')[1].split('.')[0] if allowed_origins else ''
            if app_name and app_name in origin:
                is_allowed = True
        
        if not is_allowed:
            logger.warning(f"CSRF: Blocked request from origin {origin}")
            return Response(content='{"detail":"CSRF validation failed"}', status_code=403,
                          media_type="application/json")
        
        return await call_next(request)


# Include modular routers
from routes.auth import router as auth_router
from routes.projects import router as projects_router
from routes.site_ops import router as site_ops_router
from routes.financial import router as financial_router
from routes.procurement import router as procurement_router
from routes.operations import router as operations_router
from routes.crm import router as crm_router
from routes.files import router as files_router

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(site_ops_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(procurement_router, prefix="/api")
app.include_router(operations_router, prefix="/api")
app.include_router(crm_router, prefix="/api")
app.include_router(files_router, prefix="/api")

# Add security middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CSRFMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'https://finance-ops-6.preview.emergentagent.com').split(',') + [
        f"https://construction-crm-6.cluster-{i}.preview.emergentcf.cloud" for i in range(10)
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def startup_init():
    """Initialize services at startup"""
    try:
        from core.storage import init_storage
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init failed (non-fatal): {e}")

    # Auto-seed demo users if none exist
    try:
        from core.database import db as startup_db
        from passlib.context import CryptContext
        from datetime import datetime, timezone

        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        existing = await startup_db.users.count_documents({})
        if existing == 0:
            demo_password_hash = pwd_ctx.hash("Demo@1234")
            demo_users = [
                {"user_id": "user_superadmin001", "email": "admin@constructionos.com", "name": "Rajesh Kumar", "role": "super_admin", "phone": "+91 9876543210"},
                {"user_id": "user_gm001", "email": "gm@constructionos.com", "name": "Suresh Menon", "role": "general_manager", "phone": "+91 9876543220"},
                {"user_id": "user_cre001", "email": "cre@constructionos.com", "name": "Anita Desai", "role": "cre", "phone": "+91 9876543221"},
                {"user_id": "user_accountant001", "email": "accountant@constructionos.com", "name": "Priya Sharma", "role": "accountant", "phone": "+91 9876543211"},
                {"user_id": "user_pm001", "email": "pm@constructionos.com", "name": "Rajesh PM", "role": "project_manager", "phone": "+91 9876543212"},
                {"user_id": "user_planning001", "email": "planning@constructionos.com", "name": "Amit Patel", "role": "planning", "phone": "+91 9876543213"},
                {"user_id": "user_procurement001", "email": "procurement@constructionos.com", "name": "Sneha Reddy", "role": "procurement", "phone": "+91 9876543214"},
                {"user_id": "user_engineer001", "email": "engineer@constructionos.com", "name": "Vikram Singh", "role": "site_engineer", "phone": "+91 9876543215"},
                {"user_id": "user_presales001", "email": "presales@constructionos.com", "name": "Kavitha Nair", "role": "pre_sales", "phone": "+91 9876543230"},
                {"user_id": "user_sales001", "email": "sales@constructionos.com", "name": "Ravi Sales", "role": "sales", "phone": "+91 9876543231"},
                {"user_id": "user_client001", "email": "raj@client.com", "name": "Mr. Raj", "role": "client", "phone": "+91 9876543216"},
                {"user_id": "user_client002", "email": "mohan@client.com", "name": "Mr. Mohan", "role": "client", "phone": "+91 9876543217"},
                {"user_id": "user_vendor001", "email": "vendor@balaji.com", "name": "Balaji Vendor", "role": "vendor", "phone": "+91 9876501234"},
            ]
            now = datetime.now(timezone.utc).isoformat()
            for u in demo_users:
                u["password_hash"] = demo_password_hash
                u["is_active"] = True
                u["status"] = "active"
                u["created_at"] = now
            await startup_db.users.insert_many(demo_users)
            logger.info(f"Auto-seeded {len(demo_users)} demo users (password: Demo@1234)")
        else:
            logger.info(f"Database has {existing} users, skipping seed")
    except Exception as e:
        logger.warning(f"Auto-seed failed (non-fatal): {e}")
