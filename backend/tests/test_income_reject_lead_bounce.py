"""
Test: Income reject from Accountant Approvals → Sales Lead banner flow

  1. Seed a lead in stg_accountant_approval + onboarding_status='accountant_pending'
     + a project + a pending_approval income row that carries lead_id link.
  2. Accountant calls POST /api/approvals/income/{income_id}/reject with reason.
  3. Verify:
     - income.status = 'rejected' + rejection_reason saved
     - lead.onboarding_status = 'accountant_rejected'
     - lead.current_stage_id = 'stg_payment_collect'
     - lead.advance_payment.rejection_reason saved (this powers the red banner)
     - lead.advance_payment.rejected_by_name saved
  4. Sales user re-collects via /collect-advance — banner clears, status flips.
"""
import os
import uuid
import asyncio
import requests
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return s


def _seed():
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    pid = f"proj_test_{uuid.uuid4().hex[:8]}"
    iid = f"inc_test_{uuid.uuid4().hex[:8]}"
    lid = f"lead_test_{uuid.uuid4().hex[:8]}"

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.insert_one({
            "project_id": pid, "name": "Test RE - IncomeReject",
            "total_value": 500000, "advance_amount": 0, "income_project": 0,
            "lead_id": lid,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.leads.insert_one({
            "lead_id": lid, "name": "Test Lead IncomeReject",
            "assigned_to": "user_superadmin001", "assigned_to_name": "Test Sales",
            "current_stage_id": "stg_accountant_approval",
            "onboarding_status": "accountant_pending",
            "project_id": pid,
            "advance_payment": {
                "advance_amount": 50000,
                "payment_mode": "savings_account",
                "collected_by": "user_superadmin001",
                "collected_at": datetime.now(timezone.utc).isoformat(),
            },
            "stage_history": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.income.insert_one({
            "income_id": iid, "project_id": pid, "project_name": "Test RE - IncomeReject",
            "lead_id": lid,
            "amount": 50000, "payment_mode": "savings_account",
            "category": "advance_payment", "stage": "Advance Payment",
            "description": "RE advance payment - Test Lead",
            "collected_by": "user_superadmin001", "collected_by_name": "Test Sales",
            "created_by": "user_superadmin001",
            "status": "pending_approval",
            "source": "approval",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return pid, iid, lid

    return asyncio.get_event_loop().run_until_complete(_run())


def _cleanup(pid, lid):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.delete_many({"project_id": pid})
        await d.income.delete_many({"project_id": pid})
        await d.leads.delete_many({"lead_id": lid})

    asyncio.get_event_loop().run_until_complete(_run())


def _get(coll, **kw):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d[coll].find_one(kw, {"_id": 0})

    return asyncio.get_event_loop().run_until_complete(_run())


def test_income_reject_propagates_to_lead():
    admin = _login(ADMIN)
    accountant = _login(ACCOUNTANT)
    pid, iid, lid = _seed()
    try:
        # Accountant rejects the income from the Approvals queue.
        r = accountant.post(
            f"{BASE}/api/approvals/income/{iid}/reject",
            params={"reason": "Amount mismatch — please re-enter"}
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["lead_bounced"] is True, body

        # Income row carries the rejection markers.
        inc = _get("income", income_id=iid)
        assert inc["status"] == "rejected", inc["status"]
        assert inc["rejection_reason"].startswith("Amount mismatch"), inc["rejection_reason"]

        # Lead bounced back to Deal Close with banner-ready data.
        lead = _get("leads", lead_id=lid)
        assert lead["onboarding_status"] == "accountant_rejected", lead["onboarding_status"]
        assert lead["current_stage_id"] == "stg_payment_collect", lead["current_stage_id"]
        ap = lead.get("advance_payment", {})
        assert ap.get("rejection_reason", "").startswith("Amount mismatch"), ap
        assert ap.get("rejected_by_name"), ap
        # Stage history records the bounce-back.
        hist = lead.get("stage_history", [])
        assert any(h.get("action") == "accountant_rejected_via_income" for h in hist), hist

        # Sales re-collects → banner clears automatically (collect-advance overwrites
        # the advance_payment doc with a fresh one, no rejection_reason).
        r = admin.post(f"{BASE}/api/crm/leads/{lid}/collect-advance", json={
            "advance_amount": 75000,
            "payment_mode": "cash",
            "payment_reference": "REC-1",
            "remarks": "re-collected after rejection",
        })
        assert r.status_code == 200, r.text
        lead = _get("leads", lead_id=lid)
        assert lead["onboarding_status"] == "advance_collected", lead["onboarding_status"]
        assert lead["advance_payment"]["advance_amount"] == 75000
        assert not lead["advance_payment"].get("rejection_reason"), lead["advance_payment"]
    finally:
        _cleanup(pid, lid)
