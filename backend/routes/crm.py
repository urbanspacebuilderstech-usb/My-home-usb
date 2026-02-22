"""
CRM Routes

Handles:
- Pre-Sales lead management
- Sales lead management
- Lead stages
- Custom fields
- Lead transfer between stages

TODO: Extract from server.py (27 routes)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/crm", tags=["CRM"])

# Routes will be migrated here from server.py
# Current routes:
# - GET/POST /crm/pre-sales/leads
# - GET/POST /crm/sales/leads
# - GET/POST /crm/stages
# - PATCH /crm/leads/{lead_id}/stage
# - GET/POST /crm/custom-fields
# - etc.
