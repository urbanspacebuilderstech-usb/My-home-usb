"""
ConstructionOS - Main Application Entry Point
All routes are in modular files under /routes/
Shared infrastructure is in /core/
"""
from fastapi import FastAPI, APIRouter, Request, Response, Depends
from fastapi.responses import FileResponse
from core.deps import get_current_user
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
        
        # Also allow the production domain
        production_origins = [
            "https://myhomeusb.com",
            "https://www.myhomeusb.com",
            "http://myhomeusb.com",
            "http://www.myhomeusb.com",
        ]
        allowed_origins = allowed_origins + production_origins
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
from routes.branding import router as branding_router
from routes.architect import router as architect_router
from routes.contractors import router as contractors_router
from routes.hr import router as hr_router
from routes.packages import router as packages_router
from routes.prospect import router as prospect_router
from routes.quote_links import router as quote_links_router
from routes.home_packages import router as home_packages_router
from routes.uploads import router as uploads_router
from routes.slots import router as slots_router
from routes.final_estimates import router as final_estimates_router
from routes.pre_construction import router as pre_construction_router
from routes.cashflow import router as cashflow_router
from routes.expense_split import router as expense_split_router

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(site_ops_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(procurement_router, prefix="/api")
app.include_router(operations_router, prefix="/api")
app.include_router(crm_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(branding_router, prefix="/api")
app.include_router(architect_router, prefix="/api")
app.include_router(contractors_router, prefix="/api")
app.include_router(hr_router, prefix="/api")
app.include_router(packages_router, prefix="/api")
app.include_router(prospect_router, prefix="/api")
app.include_router(quote_links_router, prefix="/api")
app.include_router(home_packages_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(slots_router, prefix="/api")
app.include_router(final_estimates_router, prefix="/api")
app.include_router(pre_construction_router, prefix="/api")
app.include_router(cashflow_router, prefix="/api")
app.include_router(expense_split_router, prefix="/api")

@app.get("/api/reports/api-endpoints-pdf")
async def download_api_report_pdf(user=Depends(get_current_user)):
    pdf_path = Path(__file__).parent / "static" / "api_report.pdf"
    if not pdf_path.exists():
        return Response(content='{"detail":"PDF not found"}', status_code=404, media_type="application/json")
    return FileResponse(str(pdf_path), media_type="application/pdf", filename="API_Endpoints_Report.pdf")

from collections import defaultdict
import time as _time


# Global rate limiting middleware (100 requests/minute per IP)
class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)  # IP -> list of timestamps

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for static files and health checks
        path = request.url.path
        if path.startswith("/static") or path == "/api/health":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = _time.time()

        # Clean old entries
        self.requests[client_ip] = [t for t in self.requests[client_ip] if now - t < self.window_seconds]

        if len(self.requests[client_ip]) >= self.max_requests:
            return Response(
                content='{"detail":"Rate limit exceeded. Please slow down."}',
                status_code=429,
                media_type="application/json"
            )

        self.requests[client_ip].append(now)
        return await call_next(request)


# Add security middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CSRFMiddleware)
# GlobalRateLimitMiddleware disabled per request — was causing false-positive
# 429s on legitimate dashboard usage (multiple parallel fetches on tab switch).
# The per-user RateLimiter in core/deps.py is also bypassed for the same reason.

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'https://crm-onboard-flow.preview.emergentagent.com').split(',') + [
        "https://myhomeusb.com",
        "https://www.myhomeusb.com",
        "http://myhomeusb.com",
        "http://www.myhomeusb.com",
    ] + [
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

    # ───── Critical performance indexes ─────
    # These are idempotent; MongoDB no-ops if the index already exists.
    # Each index is wrapped individually so a pre-existing conflict on one
    # doesn't abort creation of the rest.
    from core.database import db as startup_db

    async def _safe_index(coll, keys, **opts):
        try:
            await coll.create_index(keys, **opts)
        except Exception as ie:
            logger.debug(f"Index {keys} on {coll.name} skipped: {ie}")

    await _safe_index(startup_db.leads, [("stage_type", 1), ("current_stage_id", 1)])
    await _safe_index(startup_db.leads, [("stage_type", 1), ("assigned_to", 1)])
    await _safe_index(startup_db.leads, [("stage_type", 1), ("created_at", -1)])
    await _safe_index(startup_db.leads, [("lead_id", 1)], unique=True)
    await _safe_index(startup_db.leads, [("re_project_id", 1)])
    await _safe_index(startup_db.re_projects, [("status", 1)])
    await _safe_index(startup_db.re_projects, [("re_project_id", 1)], unique=True)
    await _safe_index(startup_db.re_projects, [("lead_id", 1)])
    await _safe_index(startup_db.material_expenses, [("status", 1), ("created_at", -1)])
    await _safe_index(startup_db.material_expenses, [("expense_id", 1)], unique=True)
    await _safe_index(startup_db.labour_expenses, [("status", 1), ("created_at", -1)])
    await _safe_index(startup_db.user_sessions, [("session_token", 1)])
    await _safe_index(startup_db.user_sessions, [("user_id", 1)])
    await _safe_index(startup_db.users, [("email", 1)])
    await _safe_index(startup_db.users, [("role", 1), ("is_active", 1)])
    await _safe_index(startup_db.cheques, [("cheque_type", 1), ("is_opened", 1), ("status", 1)])
    await _safe_index(startup_db.recorded_expenses, [("project_id", 1), ("created_at", -1)])
    await _safe_index(startup_db.income, [("status", 1), ("payment_mode", 1)])
    # Projects collection — heavy queries from Planning Board, CRE, Accountant.
    # These are the biggest perf wins for slow Planning Board loads.
    await _safe_index(startup_db.projects, [("project_id", 1)], unique=True)
    await _safe_index(startup_db.projects, [("planning_status", 1), ("is_archived", 1), ("is_deleted", 1)])
    await _safe_index(startup_db.projects, [("status", 1), ("sent_to_planning_at", 1)])
    await _safe_index(startup_db.projects, [("is_archived", 1), ("archived_at", -1)])
    await _safe_index(startup_db.projects, [("lead_id", 1)])
    await _safe_index(startup_db.projects, [("re_project_id", 1)])
    await _safe_index(startup_db.projects, [("created_at", -1)])
    await _safe_index(startup_db.projects, [("client_phone", 1)])
    # Notifications — user_id lookup on every page (header bell)
    await _safe_index(startup_db.notifications, [("user_id", 1), ("created_at", -1)])
    await _safe_index(startup_db.notifications, [("user_id", 1), ("read", 1)])
    # Material/Labour by project_id (used in delete-blocking + project detail)
    await _safe_index(startup_db.material_requests, [("project_id", 1), ("status", 1)])
    await _safe_index(startup_db.material_expenses, [("project_id", 1)])
    await _safe_index(startup_db.labour_expenses, [("project_id", 1)])
    # Income/Expenses by project_id (used in cashbook + safe-delete check)
    await _safe_index(startup_db.income, [("project_id", 1), ("created_at", -1)])
    await _safe_index(startup_db.expenses, [("project_id", 1), ("created_at", -1)])
    logger.info("MongoDB indexes verified/created")

    # Auto-seed demo users only in DEMO_MODE
    try:
        from core.database import db as startup_db
        from passlib.context import CryptContext
        from datetime import datetime, timezone

        demo_mode = os.environ.get("DEMO_MODE", "false").lower() == "true"
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        existing = await startup_db.users.count_documents({})

        if existing == 0 and demo_mode:
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
        elif existing == 0 and not demo_mode:
            logger.info("No users found and DEMO_MODE is off. Awaiting first-time setup via /api/auth/initial-setup")
        else:
            logger.info(f"Database has {existing} users, skipping seed")

        # Production Super Admin is created via /setup page — no auto-seed needed

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

        # Sales stage migration: rename/re-order/deactivate obsolete stages
        try:
            from routes.crm import get_default_sales_stages
            await get_default_sales_stages()
            logger.info("Sales stage migration completed")
        except Exception as e:
            logger.warning(f"Sales stage migration failed (non-fatal): {e}")

        # Backfill `site_engineer_assignments` for projects that have legacy
        # `team.site_engineer / sr_site_engineer / associate_pm` set but no
        # corresponding active assignment doc. Required so SE dashboards (`my-projects`)
        # show projects assigned via /api/projects/{id}/team before this fix landed.
        try:
            backfill_count = 0
            SE_LIKE_ROLES = ("site_engineer", "sr_site_engineer", "associate_pm")
            cursor = startup_db.projects.find(
                {"team": {"$type": "object"}, "is_deleted": {"$ne": True}},
                {"_id": 0, "project_id": 1, "name": 1, "project_name": 1, "team": 1},
            )
            async for proj in cursor:
                team = proj.get("team") or {}
                project_id = proj.get("project_id")
                project_name = proj.get("name") or proj.get("project_name") or project_id
                if not project_id:
                    continue
                for role in SE_LIKE_ROLES:
                    uid = team.get(role)
                    if not uid:
                        continue
                    has_assignment = await startup_db.site_engineer_assignments.find_one(
                        {"project_id": project_id, "user_id": uid, "is_active": True},
                        {"_id": 1},
                    )
                    if has_assignment:
                        continue
                    target_user = await startup_db.users.find_one(
                        {"user_id": uid}, {"_id": 0, "name": 1, "role": 1}
                    )
                    if not target_user:
                        continue
                    await startup_db.site_engineer_assignments.insert_one({
                        "assignment_id": f"sea_{uuid.uuid4().hex[:12]}",
                        "user_id": uid,
                        "user_name": target_user.get("name", ""),
                        "user_role": target_user.get("role", role),
                        "project_id": project_id,
                        "project_name": project_name,
                        "assigned_by": "system_backfill",
                        "assigned_by_name": "System Backfill",
                        "is_active": True,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                    if role == "site_engineer":
                        await startup_db.projects.update_one(
                            {"project_id": project_id},
                            {"$set": {"assigned_se": uid, "assigned_se_name": target_user.get("name", "")}},
                        )
                    backfill_count += 1
            if backfill_count:
                logger.info(f"Backfilled {backfill_count} site_engineer_assignments from project.team data")
        except Exception as e:
            logger.warning(f"SE assignment backfill failed (non-fatal): {e}")
    except Exception as e:
        logger.warning(f"Auto-seed failed (non-fatal): {e}")

    # Start background auto-sync for Google Sheets
    import asyncio
    
    async def sheets_auto_sync_loop():
        """Background task: check connected sheets for new rows every 60 seconds"""
        from core.database import db as sync_db
        while True:
            try:
                await asyncio.sleep(60)  # Check every 1 minute for near-immediate sync
                
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
                        
                        # Use the client_id/secret saved on the token itself (set at
                        # OAuth-issue time from the DB-saved credentials, falling back
                        # to env vars only for old tokens issued before that existed)
                        # rather than reading os.environ directly, so a Super Admin
                        # rotating credentials via the app doesn't strand existing
                        # tokens on the old client.
                        creds = Credentials(
                            token=token_doc.get("access_token"),
                            refresh_token=token_doc.get("refresh_token"),
                            token_uri="https://oauth2.googleapis.com/token",
                            client_id=token_doc.get("client_id") or os.environ.get("GOOGLE_SHEETS_CLIENT_ID"),
                            client_secret=token_doc.get("client_secret") or os.environ.get("GOOGLE_SHEETS_CLIENT_SECRET")
                        )
                        
                        service = build('sheets', 'v4', credentials=creds)
                        
                        for sheet_doc in connected:
                            sid = sheet_doc.get("spreadsheet_id")
                            tab_configs = list(sheet_doc.get("tab_configs", []))
                            old_row_counts = sheet_doc.get("tab_row_counts", {})
                            new_row_counts = {}
                            new_leads_total = 0
                            known_tab_names = {tc.get("tab_name") for tc in tab_configs}
                            
                            # Discover new tabs
                            try:
                                meta = service.spreadsheets().get(spreadsheetId=sid).execute()
                                all_sheet_tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
                            except:
                                all_sheet_tabs = list(known_tab_names)
                            
                            for tab_title in all_sheet_tabs:
                                if tab_title not in known_tab_names:
                                    try:
                                        result = service.spreadsheets().values().get(
                                            spreadsheetId=sid, range=f"'{tab_title}'!1:1"
                                        ).execute()
                                        headers = result.get('values', [[]])[0]
                                        if not headers:
                                            continue
                                        auto_mapping = {}
                                        field_keywords = {
                                            "name": ["name", "client", "customer", "lead name", "full name", "client name"],
                                            "phone": ["phone", "mobile", "contact", "number", "cell", "tel"],
                                            "email": ["email", "mail", "e-mail"],
                                            "city": ["city", "location", "area", "place"],
                                            "budget": ["budget", "amount", "value", "price"],
                                            "notes": ["notes", "remarks", "comment", "description", "requirement"],
                                        }
                                        for col_idx, header in enumerate(headers):
                                            header_lower = header.strip().lower()
                                            col_letter = chr(65 + col_idx) if col_idx < 26 else chr(64 + col_idx // 26) + chr(65 + col_idx % 26)
                                            for field_name, keywords in field_keywords.items():
                                                if any(kw in header_lower for kw in keywords):
                                                    if field_name not in auto_mapping.values():
                                                        auto_mapping[col_letter] = field_name
                                                    break
                                            else:
                                                if header.strip():
                                                    auto_mapping[col_letter] = header.strip().lower().replace(" ", "_")
                                        if auto_mapping:
                                            tab_configs.append({"tab_name": tab_title, "column_mapping": auto_mapping, "auto_discovered": True})
                                            known_tab_names.add(tab_title)
                                            logger.info(f"Auto-sync: Discovered new tab '{tab_title}'")
                                    except:
                                        continue
                            
                            for tc in tab_configs:
                                tab_name = tc.get("tab_name")
                                col_mapping = tc.get("column_mapping", {})
                                old_count = old_row_counts.get(tab_name, 0)
                                # Track phones already inserted in this auto-sync pass
                                seen_phones_in_run: set[str] = set()
                                
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
                                    # Country-code-tolerant + in-batch dedup
                                    from routes.crm import normalize_phone, find_existing_lead_by_phone
                                    phone_raw = lead_data.get("phone") or ""
                                    phone_norm = normalize_phone(phone_raw)
                                    if phone_norm:
                                        if phone_norm in seen_phones_in_run:
                                            continue
                                        existing = await find_existing_lead_by_phone(sync_db, phone_raw)
                                        if existing:
                                            continue
                                        seen_phones_in_run.add(phone_norm)
                                        lead_data["phone_normalized"] = phone_norm
                                    
                                    # Auto-assign via round-robin
                                    from routes.crm import assign_lead_to_next_user
                                    rr_user_id = await assign_lead_to_next_user("pre_sales")
                                    if rr_user_id:
                                        rr_user = await sync_db.users.find_one({"user_id": rr_user_id}, {"_id": 0})
                                        lead_data["assigned_to"] = rr_user_id
                                        lead_data["assigned_to_name"] = rr_user.get("name") if rr_user else None
                                    
                                    await sync_db.leads.insert_one(lead_data)
                                    new_leads_total += 1
                            
                            # Update row counts + tab_configs (with newly discovered tabs)
                            await sync_db.connected_sheets.update_one(
                                {"spreadsheet_id": sid, "user_id": user_id},
                                {"$set": {
                                    "tab_configs": tab_configs,
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
    logger.info("Background Google Sheets auto-sync started (1-min interval)")
