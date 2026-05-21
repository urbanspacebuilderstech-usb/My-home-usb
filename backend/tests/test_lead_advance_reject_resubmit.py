"""
Test: Sales Lead Advance Rejection & Re-submission Loop
========================================================
Flow under test:
  1. Sales creates a lead and drags it through to Deal Close.
  2. Sales collects advance + sends to Accountant (status: accountant_pending).
  3. Accountant REJECTS the advance with a reason.
     -> Lead bounces back to stg_deal_close.
     -> onboarding_status = 'accountant_rejected'.
     -> advance_payment.rejection_reason saved.
     -> A notification is created for the Sales user.
  4. Sales re-collects advance with corrected amount.
     -> onboarding_status flips to 'advance_collected' (banner clears).
     -> advance_payment.rejection_reason is wiped.
  5. Sales re-sends to Accountant.
     -> onboarding_status flips back to 'accountant_pending'.
  6. Accountant verifies. Lead moves to stg_project_onboarded.
"""

import os
import uuid
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # Fallback for local invocation
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
SALES = {"email": "sales@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=creds)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def accountant():
    return _login(ACCOUNTANT)


@pytest.fixture(scope="module")
def sales():
    try:
        return _login(SALES)
    except AssertionError:
        # Fall back to admin acting as sales for environments without a sales seed.
        return _login(ADMIN)


def _find_sales_user_id(admin_sess):
    r = admin_sess.get(f"{BASE}/api/users")
    assert r.status_code == 200, r.text
    users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
    for u in users:
        if u.get("role") == "sales" and u.get("is_active", True):
            return u["user_id"]
    # Fall back to super admin if no sales user
    for u in users:
        if u.get("role") == "super_admin":
            return u["user_id"]
    raise AssertionError("No sales/admin user found to assign lead to")


def test_reject_resubmit_loop(admin, accountant, sales):
    # 1. Create a fresh lead in the sales pipeline.
    name = f"AdvRejectTest {uuid.uuid4().hex[:6]}"
    sales_uid = _find_sales_user_id(admin)
    create = admin.post(f"{BASE}/api/crm/leads", json={
        "name": name,
        "phone": "9876500000",
        "email": "advreject@test.local",
        "source": "manual",
        "stage_type": "sales",
        "assigned_to": sales_uid,
        "sqft": 1200,
        "budget": 1500000,
    })
    assert create.status_code in (200, 201), f"Create lead failed: {create.status_code} {create.text}"
    lead_id = create.json()["lead_id"]

    # 2. Move lead through sales stages to stg_payment_collect (a.k.a. "Deal Close").
    #    We rely on the stage update endpoint. The test target is the
    #    reject/resubmit loop, not the stage hopper, so we forcefully
    #    walk it via PATCH. Direct move to stg_payment_collect is blocked,
    #    so we instead seed the lead directly via the admin lead stage update
    #    helper that allows the move via internal flag.
    # Direct DB seed to skip stage hopper since /api/crm/leads creates at first stage.
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    import asyncio as _a
    async def _seed():
        d = cl[os.environ["DB_NAME"]]
        await d.leads.update_one({"lead_id": lead_id}, {"$set": {"current_stage_id": "stg_payment_collect"}})
    _a.get_event_loop().run_until_complete(_seed())

    # 3. Sales collects advance.
    r = sales.post(f"{BASE}/api/crm/leads/{lead_id}/collect-advance", json={
        "advance_amount": 50000,
        "payment_mode": "upi",
        "payment_reference": "TEST-UPI-1",
        "remarks": "first collection",
    })
    assert r.status_code == 200, f"collect-advance failed: {r.status_code} {r.text}"

    # 4. Sales sends to Accountant.
    r = sales.post(f"{BASE}/api/crm/leads/{lead_id}/send-to-accountant")
    assert r.status_code == 200, f"send-to-accountant failed: {r.status_code} {r.text}"

    # Verify status — after our send-to-accountant fix the lead also moves into
    # the Accountant Approval column so the per-card Verify/Reject buttons render.
    r = sales.get(f"{BASE}/api/crm/leads/{lead_id}")
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead.get("onboarding_status") == "accountant_pending", lead.get("onboarding_status")
    assert lead.get("current_stage_id") == "stg_accountant_approval", lead.get("current_stage_id")

    # 5. Accountant REJECTS.
    reject_reason = "Amount mismatch — collected via UPI but cheque expected"
    r = accountant.post(f"{BASE}/api/crm/leads/{lead_id}/accountant-reject", json={"reason": reject_reason})
    assert r.status_code == 200, f"accountant-reject failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("status") == "accountant_rejected", body

    # 6. Sales (and admin) should now see onboarding_status = accountant_rejected
    #    AND advance_payment.rejection_reason populated.
    r = sales.get(f"{BASE}/api/crm/leads/{lead_id}")
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead.get("onboarding_status") == "accountant_rejected", (
        f"Expected accountant_rejected, got {lead.get('onboarding_status')}"
    )
    ap = lead.get("advance_payment") or {}
    assert ap.get("rejection_reason") == reject_reason, ap
    assert ap.get("rejected_by_name"), "rejected_by_name missing"
    assert lead.get("current_stage_id") == "stg_payment_collect", lead.get("current_stage_id")

    # 7. Sales re-collects with the corrected amount.
    r = sales.post(f"{BASE}/api/crm/leads/{lead_id}/collect-advance", json={
        "advance_amount": 75000,
        "payment_mode": "cheque",
        "payment_reference": "CHQ-RETRY-9",
        "remarks": "corrected after rejection",
    })
    assert r.status_code == 200, f"re-collect failed: {r.status_code} {r.text}"

    r = sales.get(f"{BASE}/api/crm/leads/{lead_id}")
    lead = r.json()
    assert lead.get("onboarding_status") == "advance_collected", lead.get("onboarding_status")
    # The new advance_payment doc should NOT carry the old rejection_reason.
    ap = lead.get("advance_payment") or {}
    assert ap.get("advance_amount") == 75000, ap
    assert not ap.get("rejection_reason"), f"rejection_reason should be cleared, got {ap.get('rejection_reason')!r}"

    # 8. Sales sends again -> accountant_pending.
    r = sales.post(f"{BASE}/api/crm/leads/{lead_id}/send-to-accountant")
    assert r.status_code == 200, r.text
    r = sales.get(f"{BASE}/api/crm/leads/{lead_id}")
    assert r.json().get("onboarding_status") == "accountant_pending"

    # 9. Accountant verifies -> accountant_verified + stg_project_onboarded.
    r = accountant.post(f"{BASE}/api/crm/leads/{lead_id}/accountant-verify")
    assert r.status_code == 200, r.text
    r = sales.get(f"{BASE}/api/crm/leads/{lead_id}")
    lead = r.json()
    assert lead.get("onboarding_status") == "accountant_verified", lead.get("onboarding_status")
    assert lead.get("current_stage_id") == "stg_project_onboarded", lead.get("current_stage_id")
