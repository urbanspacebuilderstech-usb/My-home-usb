"""
Authentication Routes

Handles:
- Demo login
- Google OAuth session exchange
- User session management
- User invitations
- Logout

TODO: Extract from server.py lines 1340-1695
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Routes will be migrated here from server.py
# Current routes in server.py:
# - POST /auth/demo-login
# - POST /auth/session
# - POST /auth/invite-user
# - GET /auth/invitations
# - DELETE /auth/invitations/{invitation_id}
# - POST /auth/resend-invitation/{email}
# - GET /auth/me
# - POST /auth/logout
