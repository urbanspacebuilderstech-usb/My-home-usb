"""
ConstructionOS - Main Application Entry Point
All routes are in modular files under /routes/
Shared infrastructure is in /core/
"""
from fastapi import FastAPI, APIRouter, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os
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


# Include modular routers
from routes.auth import router as auth_router
from routes.projects import router as projects_router
from routes.site_ops import router as site_ops_router
from routes.financial import router as financial_router
from routes.procurement import router as procurement_router
from routes.operations import router as operations_router
from routes.crm import router as crm_router

app.include_router(auth_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(site_ops_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(procurement_router, prefix="/api")
app.include_router(operations_router, prefix="/api")
app.include_router(crm_router, prefix="/api")

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
