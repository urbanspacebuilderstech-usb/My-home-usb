"""
ConstructionOS Backend - Modular Entry Point

This is the new modular entry point that will gradually replace server.py.
Currently, it imports from server.py for backwards compatibility while
allowing new routes to be added in a modular way.

Migration Plan:
1. Create core/ - database, dependencies, enums (DONE)
2. Create routes/ - organized by feature domain
3. Gradually move routes from server.py to routes/
4. Once all routes are migrated, deprecate server.py
"""

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
import os

# Import the existing app from server.py for backwards compatibility
# This allows us to gradually migrate without breaking existing functionality
from server import app

# Future imports (uncomment as routes are migrated):
# from routes import auth_router, crm_router, cre_router, projects_router

# ============================================================
# MIGRATION STATUS
# ============================================================
# Total Routes: 322
# Migrated: 0
# Remaining: 322
#
# Priority Order:
# 1. auth (8 routes) - Core authentication
# 2. crm (27 routes) - CRM functionality  
# 3. cre (13 routes) - CRE board
# 4. projects (24 routes) - Project management
# 5. procurement (27 routes) - Purchase orders, vendors
# 6. expenses (20 routes) - Expense tracking
# 7. work-orders (17 routes) - Work order management
# 8. site-engineer (16 routes) - Site operations
# 9. hr (13 routes) - Staff, attendance, payroll
# 10. financial (13 routes) - Financial reports
# 11. accountant (13 routes) - Account operations
# 12. Others...
# ============================================================

# When routes are migrated, include them like this:
# app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
# app.include_router(crm_router, prefix="/api/crm", tags=["CRM"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
