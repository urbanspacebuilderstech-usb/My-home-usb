"""
Test: Income send-for-correction loop (post-approval pull-back) + resubmit + filter.

  1. Seed an approved income on a fresh project with cashflow_ledger + payment_stage.
  2. GET /approvals/unified?status_filter=approved → income visible.
  3. POST /approvals/income/{id}/send-for-correction → status='under_correction',
     cashflow_ledger row reversed, payment_stage rolled back.
  4. GET /approvals/unified?status_filter=under_correction → income visible.
  5. POST /approvals/income/{id}/resubmit {amount, payment_mode, ...} →
     status='pending_approval', edits applied.
  6. GET /approvals/unified?status_filter=pending → income visible.
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
    sid = f"ps_test_{uuid.uuid4().hex[:8]}"

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.insert_one({
            "project_id": pid, "name": "Test Correction Project",
            "total_value": 1_000_000, "advance_amount": 0, "income_project": 50000,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.payment_stages.insert_one({
            "stage_id": sid, "project_id": pid, "stage_name": "Test Stage 1",
            "stage_number": 1, "amount": 200000, "amount_received": 50000,
            "status": "partial", "percentage": 20,
        })
        await d.income.insert_one({
            "income_id": iid, "project_id": pid, "project_name": "Test Correction Project",
            "amount": 50000, "payment_mode": "cheque", "category": "payment_collection",
            "stage": "1", "payment_stage_id": sid, "status": "approved",
            "collected_by": "user_superadmin001", "collected_by_name": "Test Collector",
            "created_by": "user_superadmin001",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await d.cashflow_ledger.insert_one({
            "ledger_id": f"cf_{uuid.uuid4().hex[:10]}", "kind": "income", "source_id": iid,
            "project_id": pid, "amount": 50000, "direct_amount": 42500, "indirect_amount": 7500,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return pid, iid, sid

    return asyncio.get_event_loop().run_until_complete(_run())


def _cleanup(pid):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.delete_many({"project_id": pid})
        await d.income.delete_many({"project_id": pid})
        await d.cashflow_ledger.delete_many({"project_id": pid})
        await d.payment_stages.delete_many({"project_id": pid})

    asyncio.get_event_loop().run_until_complete(_run())


def _doc(coll, **kw):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d[coll].find_one(kw, {"_id": 0})

    return asyncio.get_event_loop().run_until_complete(_run())


def _count(coll, **kw):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d[coll].count_documents(kw)

    return asyncio.get_event_loop().run_until_complete(_run())


def test_income_correction_loop():
    admin = _login(ADMIN)
    pid, iid, sid = _seed()
    try:
        # 1. Approved filter shows the income.
        r = admin.get(f"{BASE}/api/approvals/unified", params={"status_filter": "approved"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert any(i["income_id"] == iid for i in body["income"]), f"Approved income missing in filter: {body['income']}"

        # 2. Send for correction.
        r = admin.post(f"{BASE}/api/approvals/income/{iid}/send-for-correction", json={"reason": "Wrong project tagged"})
        assert r.status_code == 200, f"send-for-correction failed: {r.text}"
        assert r.json()["status"] == "under_correction"

        inc = _doc("income", income_id=iid)
        assert inc["status"] == "under_correction", inc["status"]
        assert inc["correction_reason"] == "Wrong project tagged"
        assert inc["prev_approved_status"] == "approved"
        assert any(h["action"] == "sent_for_correction" for h in inc["correction_history"])
        # cashflow ledger reversed
        assert _count("cashflow_ledger", source_id=iid) == 0, "cashflow ledger should be reversed"
        # payment_stage amount_received rolled back
        stage = _doc("payment_stages", stage_id=sid)
        assert stage["amount_received"] == 0, f"stage rollback failed: {stage}"
        assert stage["status"] == "pending", stage["status"]

        # 3. under_correction filter shows it.
        r = admin.get(f"{BASE}/api/approvals/unified", params={"status_filter": "under_correction"})
        assert any(i["income_id"] == iid for i in r.json()["income"])

        # 4. Resubmit with edits.
        r = admin.post(f"{BASE}/api/approvals/income/{iid}/resubmit", json={
            "amount": 75000,
            "payment_mode": "cash",
            "remarks": "Re-collected via cash",
        })
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending_approval"

        inc = _doc("income", income_id=iid)
        assert inc["status"] == "pending_approval", inc["status"]
        assert inc["amount"] == 75000
        assert inc["payment_mode"] == "cash"
        assert inc.get("rejection_reason") in (None, ""), inc.get("rejection_reason")
        assert inc.get("correction_reason") in (None, ""), inc.get("correction_reason")
        assert any(h["action"] == "resubmitted" for h in inc["correction_history"])

        # 5. pending filter shows it now.
        r = admin.get(f"{BASE}/api/approvals/unified", params={"status_filter": "pending"})
        assert any(i["income_id"] == iid for i in r.json()["income"])

        # 6. 'all' filter also shows it.
        r = admin.get(f"{BASE}/api/approvals/unified", params={"status_filter": "all"})
        assert any(i["income_id"] == iid for i in r.json()["income"])
    finally:
        _cleanup(pid)
