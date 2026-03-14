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
import uuid
from datetime import datetime, timezone
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
    allow_origins=os.environ.get('CORS_ORIGINS', 'https://estimate-redesign.preview.emergentagent.com').split(',') + [
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

        # Always ensure production Super Admin exists
        prod_admin_email = "urbanspacebuilderstech@gmail.com"
        existing_admin = await startup_db.users.find_one({"email": prod_admin_email}, {"_id": 0})
        if not existing_admin:
            import uuid as _uuid
            now = datetime.now(timezone.utc).isoformat()
            await startup_db.users.insert_one({
                "user_id": f"user_{_uuid.uuid4().hex[:12]}",
                "email": prod_admin_email,
                "name": "Urban Space Builders",
                "role": "super_admin",
                "is_active": True,
                "status": "active",
                "created_at": now,
            })
            logger.info(f"Created production Super Admin: {prod_admin_email} (use Forgot Password to set password)")
        else:
            # Ensure role is super_admin
            if existing_admin.get("role") != "super_admin":
                await startup_db.users.update_one({"email": prod_admin_email}, {"$set": {"role": "super_admin"}})
                logger.info(f"Updated {prod_admin_email} to super_admin role")

        # Ensure RNR stage exists in pre_sales
        rnr_exists = await startup_db.lead_stages.find_one({"$or": [{"stage_id": "stg_rnr"}, {"name": "RNR", "stage_type": "pre_sales"}]})
        if not rnr_exists:
            pre_sales_stages = await startup_db.lead_stages.count_documents({"stage_type": "pre_sales"})
            if pre_sales_stages > 0:
                await startup_db.lead_stages.insert_one({
                    "stage_id": "stg_rnr", "name": "RNR", "stage_type": "pre_sales",
                    "order": 3, "color": "#ef4444", "is_final": False, "is_active": True,
                    "created_by": "system", "created_at": datetime.now(timezone.utc).isoformat()
                })
                logger.info("Added RNR stage to pre-sales pipeline")
    except Exception as e:
        logger.warning(f"Auto-seed failed (non-fatal): {e}")

    # Start background auto-sync for Google Sheets
    import asyncio
    
    async def sheets_auto_sync_loop():
        """Background task: check connected sheets for new rows every N minutes"""
        from core.database import db as sync_db
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                
                # Get all auto-sync configs that are enabled
                configs = await sync_db.sheets_auto_sync.find({"enabled": True}, {"_id": 0}).to_list(50)
                
                for config in configs:
                    user_id = config.get("user_id")
                    if not user_id:
                        continue
                    
                    # Get connected sheets for this user
                    connected = await sync_db.connected_sheets.find({"user_id": user_id}, {"_id": 0}).to_list(50)
                    if not connected:
                        continue
                    
                    # Get Google credentials
                    token_doc = await sync_db.google_sheets_tokens.find_one({"user_id": user_id}, {"_id": 0})
                    if not token_doc:
                        continue
                    
                    try:
                        from google.oauth2.credentials import Credentials
                        from googleapiclient.discovery import build
                        
                        creds = Credentials(
                            token=token_doc.get("access_token"),
                            refresh_token=token_doc.get("refresh_token"),
                            token_uri="https://oauth2.googleapis.com/token",
                            client_id=os.environ.get("GOOGLE_SHEETS_CLIENT_ID"),
                            client_secret=os.environ.get("GOOGLE_SHEETS_CLIENT_SECRET")
                        )
                        
                        service = build('sheets', 'v4', credentials=creds)
                        
                        for sheet_doc in connected:
                            sid = sheet_doc.get("spreadsheet_id")
                            tab_configs = sheet_doc.get("tab_configs", [])
                            old_row_counts = sheet_doc.get("tab_row_counts", {})
                            new_row_counts = {}
                            new_leads_total = 0
                            
                            for tc in tab_configs:
                                tab_name = tc.get("tab_name")
                                col_mapping = tc.get("column_mapping", {})
                                old_count = old_row_counts.get(tab_name, 0)
                                
                                try:
                                    result = service.spreadsheets().values().get(
                                        spreadsheetId=sid, range=f"'{tab_name}'"
                                    ).execute()
                                except:
                                    new_row_counts[tab_name] = old_count
                                    continue
                                
                                values = result.get('values', [])
                                if len(values) < 2:
                                    new_row_counts[tab_name] = 0
                                    continue
                                
                                all_data = values[1:]
                                current_count = len(all_data)
                                new_row_counts[tab_name] = current_count
                                
                                if current_count <= old_count:
                                    continue
                                
                                new_rows = all_data[old_count:]
                                source_name = tab_name.lower().replace(" ", "_").replace("-", "_")
                                
                                for row in new_rows:
                                    lead_data = {
                                        "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                                        "source": source_name,
                                        "source_display": tab_name,
                                        "stage_type": "pre_sales",
                                        "current_stage_id": "stg_new_lead",
                                        "created_at": datetime.now(timezone.utc).isoformat(),
                                        "imported_from_sheet": sid,
                                        "auto_synced": True,
                                        "custom_fields": {}
                                    }
                                    
                                    for col_letter, field_name in col_mapping.items():
                                        if not field_name or field_name == '_skip':
                                            continue
                                        col_idx = ord(col_letter[0]) - 65
                                        if len(col_letter) > 1:
                                            col_idx = 26 + ord(col_letter[1]) - 65
                                        if col_idx < len(row):
                                            value = str(row[col_idx]).strip() if row[col_idx] else ""
                                            if field_name in ["name", "phone", "email", "city", "budget", "notes", "address", "state"]:
                                                lead_data[field_name] = value
                                            else:
                                                lead_data["custom_fields"][field_name] = value
                                    
                                    if not lead_data.get("name") and not lead_data.get("phone"):
                                        continue
                                    if lead_data.get("phone"):
                                        existing = await sync_db.leads.find_one({"phone": lead_data["phone"]})
                                        if existing:
                                            continue
                                    
                                    await sync_db.leads.insert_one(lead_data)
                                    new_leads_total += 1
                            
                            # Update row counts
                            await sync_db.connected_sheets.update_one(
                                {"spreadsheet_id": sid, "user_id": user_id},
                                {"$set": {
                                    "tab_row_counts": new_row_counts,
                                    "last_synced": datetime.now(timezone.utc).isoformat()
                                }}
                            )
                            
                            if new_leads_total > 0:
                                logger.info(f"Auto-sync: {new_leads_total} new leads from sheet {sid}")
                    except Exception as e:
                        logger.warning(f"Auto-sync error for user {user_id}: {e}")
            except Exception as e:
                logger.warning(f"Auto-sync loop error: {e}")
    
    asyncio.create_task(sheets_auto_sync_loop())
    logger.info("Background Google Sheets auto-sync started (5-min interval)")
