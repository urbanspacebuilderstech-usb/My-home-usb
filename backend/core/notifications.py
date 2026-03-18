"""
Email notification service - sends contextual emails for key events
"""
import asyncio
import os
import logging
import resend

from core.database import db

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://procure-pay-4.preview.emergentagent.com')


def _email_wrapper(subject: str, body_html: str) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1F2937; padding: 15px 20px; text-align: center;">
            <h2 style="margin: 0; color: #FBBF24; font-size: 18px;">ConstructionOS</h2>
        </div>
        <div style="padding: 25px; background: #ffffff; border: 1px solid #E5E7EB;">
            <h3 style="color: #1F2937; margin-top: 0;">{subject}</h3>
            {body_html}
        </div>
        <div style="padding: 10px; text-align: center; background: #F9FAFB;">
            <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                <a href="{FRONTEND_URL}" style="color: #6B7280;">Open ConstructionOS</a>
            </p>
        </div>
    </div>
    """


async def _send(to_email: str, subject: str, html: str):
    """Send email via Resend (non-blocking)"""
    if not resend.api_key:
        return
    try:
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": f"ConstructionOS - {subject}", "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent: '{subject}' to {to_email}")
    except Exception as e:
        logger.error(f"Email failed: {e}")


async def _get_user_email(user_id: str) -> str:
    """Get user email from user_id"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    return user.get("email", "") if user else ""


async def _get_users_by_role(role: str) -> list:
    """Get all active users with a specific role"""
    users = await db.users.find({"role": role, "is_active": True}, {"_id": 0, "email": 1, "name": 1}).to_list(50)
    return users


# ==================== NOTIFICATION TRIGGERS ====================

async def notify_material_request_created(request_data: dict, requested_by_name: str):
    """When Site Engineer creates a material request → notify PM + Procurement"""
    project_name = request_data.get("project_name", "Unknown Project")
    items = request_data.get("items", [])
    item_count = len(items) if isinstance(items, list) else 1

    body = _email_wrapper("New Material Request", f"""
        <p style="color: #4B5563;"><strong>{requested_by_name}</strong> has submitted a material request.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Items</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{item_count} item(s)</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Urgency</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{request_data.get('urgency', 'normal')}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/procurement-board-v2" style="color: #2563EB;">View in Procurement Board</a></p>
    """)

    for role in ["procurement", "project_manager"]:
        users = await _get_users_by_role(role)
        for u in users:
            await _send(u["email"], "New Material Request", body)


async def notify_payment_received(project_name: str, amount: float, payment_mode: str):
    """When payment is received → notify Accountant"""
    body = _email_wrapper("Payment Received", f"""
        <p style="color: #4B5563;">A new payment has been recorded.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB; color: #059669; font-weight: bold;">Rs. {amount:,.2f}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Mode</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{payment_mode}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/accountant-module" style="color: #2563EB;">View in Accountant Module</a></p>
    """)

    accountants = await _get_users_by_role("accountant")
    for u in accountants:
        await _send(u["email"], "Payment Received", body)


async def notify_project_approved(project_name: str, approved_by_name: str, pm_user_id: str):
    """When project is approved → notify PM"""
    pm_email = await _get_user_email(pm_user_id)
    if not pm_email:
        return

    body = _email_wrapper("Project Approved", f"""
        <p style="color: #4B5563;">Great news! Your project has been approved.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Approved by</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{approved_by_name}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/projects" style="color: #2563EB;">View Projects</a></p>
    """)

    await _send(pm_email, "Project Approved", body)


async def notify_petty_cash_request(request_data: dict, requested_by_name: str):
    """When petty cash is requested → notify Accountant"""
    body = _email_wrapper("Petty Cash Request", f"""
        <p style="color: #4B5563;"><strong>{requested_by_name}</strong> has submitted a petty cash request.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{request_data.get('project_name', 'N/A')}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">Rs. {request_data.get('amount', 0):,.2f}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Purpose</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{request_data.get('purpose', 'N/A')}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/accountant-module" style="color: #2563EB;">Review in Accountant Module</a></p>
    """)

    accountants = await _get_users_by_role("accountant")
    for u in accountants:
        await _send(u["email"], "Petty Cash Request", body)


async def notify_approval_needed(item_type: str, item_name: str, submitted_by_name: str):
    """When something needs GM/Admin approval → notify GM + Admin"""
    body = _email_wrapper(f"{item_type} Pending Approval", f"""
        <p style="color: #4B5563;">A new {item_type.lower()} requires your approval.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Item</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{item_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Submitted by</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{submitted_by_name}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/approvals" style="color: #2563EB;">Review Approvals</a></p>
    """)

    for role in ["general_manager", "super_admin"]:
        users = await _get_users_by_role(role)
        for u in users:
            await _send(u["email"], f"{item_type} Pending Approval", body)


async def notify_labour_request_created(request_data: dict, requested_by_name: str):
    """When Site Engineer creates a labour request → notify PM + Planning"""
    project_name = request_data.get("project_name", request_data.get("project_id", "Unknown"))
    labour_type = request_data.get("labour_type", "General")
    workers = request_data.get("num_workers", 0)
    total = request_data.get("total_amount", 0)

    body = _email_wrapper("New Labour Request", f"""
        <p style="color: #4B5563;"><strong>{requested_by_name}</strong> has submitted a labour request.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Type</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{labour_type}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Workers</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{workers}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Total</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">Rs. {total:,.2f}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/planning-board" style="color: #2563EB;">View in Planning Board</a></p>
    """)

    for role in ["planning", "project_manager"]:
        users = await _get_users_by_role(role)
        for u in users:
            await _send(u["email"], "New Labour Request", body)


async def notify_project_final_approved(project_name: str, approved_by_name: str):
    """When project gets final approval → notify Planning + CRE"""
    body = _email_wrapper("Project Approved for Execution", f"""
        <p style="color: #4B5563;">A project has been approved and is ready for execution.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Approved by</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{approved_by_name}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/projects" style="color: #2563EB;">View Projects</a></p>
    """)

    for role in ["planning", "cre"]:
        users = await _get_users_by_role(role)
        for u in users:
            await _send(u["email"], "Project Approved for Execution", body)


async def notify_income_recorded(project_name: str, amount: float, payment_mode: str, recorded_by_name: str):
    """When income is recorded → notify Accountant + GM"""
    body = _email_wrapper("Income Recorded", f"""
        <p style="color: #4B5563;"><strong>{recorded_by_name}</strong> has recorded an income entry.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Project</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{project_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB; color: #059669; font-weight: bold;">Rs. {amount:,.2f}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #E5E7EB; background: #F9FAFB;"><strong>Mode</strong></td>
                <td style="padding: 8px; border: 1px solid #E5E7EB;">{payment_mode}</td></tr>
        </table>
        <p><a href="{FRONTEND_URL}/income" style="color: #2563EB;">View Income Module</a></p>
    """)

    for role in ["accountant", "general_manager"]:
        users = await _get_users_by_role(role)
        for u in users:
            await _send(u["email"], "Income Recorded", body)
