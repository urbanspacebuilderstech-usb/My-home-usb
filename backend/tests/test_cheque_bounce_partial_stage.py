"""Partial bounce of one cheque inside a stage that was paid by multiple
cheques. The bounce should drop the SAME stage to `partial` status with
balance == bounced amount, NOT create a clone row.

User scenario: Stage 2 was fully paid ₹5,00,000 via 5 cheques of ₹1L each.
One cheque bounces — Stage 2 should become partial with ₹4L collected and
₹1L balance. Project income should drop by ₹1L (cashbook reflects).
"""
import os
import asyncio
import uuid
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return s


def test_partial_bounce_drops_stage_to_partial():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    stage_id = f"ps_{uuid.uuid4().hex[:12]}"
    cheque_ids = [f"chq_{uuid.uuid4().hex[:12]}" for _ in range(5)]
    income_ids = [f"inc_{uuid.uuid4().hex[:12]}" for _ in range(5)]
    bounce_chq_id = cheque_ids[2]   # bounce the 3rd cheque
    bounce_inc_id = income_ids[2]
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Partial Bounce", "is_active": True})
        # Single stage fully paid via 5 incomes (each ₹1L)
        await db.payment_stages.insert_one({
            "stage_id": stage_id,
            "project_id": proj_id,
            "stage_name": "Stage 2",
            "amount": 500000,
            "amount_received": 500000,
            "status": "paid",
            "workflow_status": "collected",
            "payment_method": "cheque",
            "paid_at": now,
            "collected_at": now,
            "created_at": now,
        })
        for inc_id, chq_id in zip(income_ids, cheque_ids):
            await db.income.insert_one({
                "income_id": inc_id,
                "project_id": proj_id,
                "payment_stage_id": stage_id,
                "amount": 100000,
                "payment_mode": "cheque",
                "cheque_id": chq_id,
                "status": "approved",
                "created_at": now,
            })
            await db.cheques.insert_one({
                "cheque_id": chq_id,
                "cheque_number": f"PB{chq_id[-4:].upper()}",
                "cheque_type": "incoming",
                "amount": 100000,
                "bank_name": "HDFC",
                "status": "deposited",
                "is_opened": True,
                "income_id": inc_id,
                "project_id": proj_id,
                "created_at": now,
            })

    async def cleanup():
        await db.projects.delete_one({"project_id": proj_id})
        await db.payment_stages.delete_many({"project_id": proj_id})
        await db.income.delete_many({"project_id": proj_id})
        await db.cheques.delete_many({"cheque_id": {"$in": cheque_ids}})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/accountant/cheques/{bounce_chq_id}/bounce", json={
            "reason": "Signature mismatch",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["bounced_amount"] == 100000
        assert result["stages_reverted"] == 1
        assert result["stages_adjusted"][0]["stage_id"] == stage_id
        assert result["stages_adjusted"][0]["reduction"] == 100000
        assert result["stages_adjusted"][0]["new_received"] == 400000
        assert result["stages_adjusted"][0]["new_status"] == "partial"

        async def verify():
            # Stage is now partial with ₹4L received, ₹1L balance
            s = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
            assert s["amount_received"] == 400000
            assert s["status"] == "partial"
            assert s["cheque_bounced"] is True
            assert s["last_bounce_amount"] == 100000
            assert s["paid_at"] is None
            # Only the bounced income is flagged
            bounced_inc = await db.income.find_one({"income_id": bounce_inc_id}, {"_id": 0})
            assert bounced_inc["status"] == "cheque_bounced"
            # The other 4 incomes remain approved
            other_incs = await db.income.find(
                {"income_id": {"$in": [i for i in income_ids if i != bounce_inc_id]}}, {"_id": 0}
            ).to_list(20)
            for inc in other_incs:
                assert inc["status"] == "approved", f"income {inc['income_id']} flipped to {inc['status']}"
            # Cashbook view (project income endpoint excludes bounced)
            r2 = sess.get(f"{API}/projects/{proj_id}/income", timeout=20)
            assert r2.status_code == 200
            body = r2.json()
            rows = body.get("entries", body) if isinstance(body, dict) else body
            assert all(row["status"] != "cheque_bounced" for row in rows)
            assert body["summary"]["total_income"] == 400000

        asyncio.get_event_loop().run_until_complete(verify())
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
