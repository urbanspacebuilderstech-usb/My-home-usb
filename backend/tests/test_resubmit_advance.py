"""Test: resubmit-advance after accountant rejection (no re-conversion needed)."""
import os, uuid, asyncio, requests
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}


def _login(c):
    s = requests.Session(); s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=c)
    assert r.status_code == 200, r.text
    return s


def _seed():
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    pid = f"proj_test_{uuid.uuid4().hex[:8]}"
    lid = f"lead_test_{uuid.uuid4().hex[:8]}"
    rpid = f"re_test_{uuid.uuid4().hex[:8]}"

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.re_projects.insert_one({
            "re_project_id": rpid, "lead_id": lid, "client_name": "Test",
            "status": "converted", "converted_to_project": True,
            "estimated_total": 500000,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.projects.insert_one({
            "project_id": pid, "name": "Test Resubmit Project", "lead_id": lid,
            "re_project_id": rpid, "total_value": 500000,
            "advance_amount": 0, "income_project": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.leads.insert_one({
            "lead_id": lid, "name": "Test Lead Resubmit",
            "assigned_to": "user_superadmin001",
            "current_stage_id": "stg_payment_collect",
            "onboarding_status": "accountant_rejected",
            "project_id": pid, "re_project_id": rpid,
            "advance_payment": {
                "advance_amount": 50000,
                "rejection_reason": "Test rejection",
                "rejected_by_name": "Accountant",
            },
            "rejection_reason": "Test rejection",
            "stage_history": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return pid, lid, rpid

    return asyncio.get_event_loop().run_until_complete(_run())


def _cleanup(pid, lid, rpid):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.delete_many({"project_id": pid})
        await d.leads.delete_many({"lead_id": lid})
        await d.re_projects.delete_many({"re_project_id": rpid})
        await d.income.delete_many({"lead_id": lid})

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


def test_resubmit_advance_creates_new_income_and_bounces_to_accountant():
    admin = _login(ADMIN)
    pid, lid, rpid = _seed()
    try:
        r = admin.post(f"{BASE}/api/crm/leads/{lid}/resubmit-advance", json={
            "advance_amount": 75000,
            "payment_entries": [
                {"amount": 75000, "payment_mode": "cash", "reference": "REC-1",
                 "payment_date": "2026-05-22"}
            ],
            "remarks": "Re-collected after rejection",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["onboarding_status"] == "accountant_pending"
        assert body["project_id"] == pid
        new_inc_id = body["income_id"]

        # New income tied to project + lead, status pending_approval.
        inc = _get("income", income_id=new_inc_id)
        assert inc["lead_id"] == lid
        assert inc["project_id"] == pid
        assert inc["amount"] == 75000
        assert inc["status"] == "pending_approval"
        assert inc["category"] == "advance_payment"

        # Lead bounced to Accountant Approval, rejection markers cleared.
        lead = _get("leads", lead_id=lid)
        assert lead["onboarding_status"] == "accountant_pending"
        assert lead["current_stage_id"] == "stg_accountant_approval"
        assert lead["advance_payment"]["advance_amount"] == 75000
        assert lead["advance_payment"].get("rejection_reason") in (None, "")
        assert lead.get("rejection_reason") in (None, "")
    finally:
        _cleanup(pid, lid, rpid)
