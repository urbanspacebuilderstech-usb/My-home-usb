"""Multi-stage cheque bounce: one ₹5L cheque settled 3 payment stages, then
bounces. New behaviour (in-place adjustment): every affected stage has its
`amount_received` reduced by the bounced portion; no clone rows are created;
the bounced incomes are flagged cheque_bounced so cashbook totals drop.
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


def test_one_cheque_covering_three_stages_bounces_all_in_place():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    bulk_id = f"bulk_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    cheque_number = f"BNC{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    stage_specs = [
        {"name": "Advance", "amount": 200000},
        {"name": "Excavation", "amount": 200000},
        {"name": "Foundation", "amount": 100000},
    ]
    stage_ids = []
    income_ids = []

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Multi-Stage Bounce", "is_active": True})
        for spec in stage_specs:
            sid = f"ps_{uuid.uuid4().hex[:12]}"
            iid = f"inc_{uuid.uuid4().hex[:12]}"
            stage_ids.append(sid)
            income_ids.append(iid)
            await db.payment_stages.insert_one({
                "stage_id": sid,
                "project_id": proj_id,
                "stage_name": spec["name"],
                "amount": spec["amount"],
                "amount_received": spec["amount"],
                "status": "paid",
                "workflow_status": "collected",
                "payment_method": "cheque",
                "payment_reference": cheque_number,
                "bulk_collection_id": bulk_id,
                "collected_at": now,
                "paid_at": now,
                "created_at": now,
            })
            await db.income.insert_one({
                "income_id": iid,
                "project_id": proj_id,
                "payment_stage_id": sid,
                "amount": spec["amount"],
                "payment_mode": "cheque",
                "payment_reference": cheque_number,
                "bulk_collection_id": bulk_id,
                "status": "approved",
                "created_at": now,
            })
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": cheque_number,
            "cheque_type": "incoming",
            "amount": 500000,
            "bank_name": "ICICI",
            "status": "deposited",
            "is_opened": True,
            "income_id": income_ids[0],
            "bulk_collection_id": bulk_id,
            "project_id": proj_id,
            "created_at": now,
        })

    async def cleanup():
        await db.projects.delete_one({"project_id": proj_id})
        await db.payment_stages.delete_many({"project_id": proj_id})
        await db.income.delete_many({"project_id": proj_id})
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/accountant/cheques/{cheque_id}/bounce", json={
            "reason": "Insufficient funds",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["income_reversed"] is True
        assert result["stages_reverted"] == 3
        assert result["total_income_reversed"] == 500000
        assert result["bounced_amount"] == 500000

        async def verify():
            # Each stage adjusted in place — same stage_id, amount_received → 0
            for sid in stage_ids:
                s = await db.payment_stages.find_one({"stage_id": sid}, {"_id": 0})
                assert s["amount_received"] == 0
                assert s["status"] == "pending"
                assert s["cheque_bounced"] is True
                assert s["last_bounce_cheque_id"] == cheque_id
                assert s["paid_at"] is None
            # Incomes marked bounced
            for iid in income_ids:
                inc = await db.income.find_one({"income_id": iid}, {"_id": 0})
                assert inc["status"] == "cheque_bounced"
            # No clones created — total stages on the project is still 3
            all_stages = await db.payment_stages.find({"project_id": proj_id}, {"_id": 0, "stage_id": 1}).to_list(20)
            assert len(all_stages) == 3, f"Expected 3 stages (no clones), found {len(all_stages)}"

        asyncio.get_event_loop().run_until_complete(verify())
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
