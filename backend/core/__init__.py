"""
Core module - shared infrastructure for all route files
"""
from .database import db, client, fs
from .deps import get_current_user, create_notification, create_audit_log, send_notification_email
