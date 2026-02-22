"""
Projects Routes

Handles:
- Project CRUD
- Project details
- Project stages
- Scope items
- Payment schedules
- Additions/Deductions

TODO: Extract from server.py (24 routes)
"""

from fastapi import APIRouter

router = APIRouter(prefix="/projects", tags=["Projects"])

# Routes will be migrated here from server.py
# Current routes:
# - GET/POST /projects
# - GET/PATCH/DELETE /projects/{project_id}
# - GET /projects/{project_id}/full-details
# - GET /projects/{project_id}/payment-summary
# - etc.
