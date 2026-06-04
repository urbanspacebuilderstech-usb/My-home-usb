"""Multi-stage cheque bounce: one ₹5L cheque settled 3 payment stages, then
bounces — all 3 stages should revert with a cheque-bounced tag and 3 new
pending re-collect rows are cloned. Project income drops by ₹5L.
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


def test_one_cheque_covering_three_stages_bounces_all():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    bulk_id = f"bulk_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    cheque_number = f"BNC{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    # 3 payment stages, each collected via the SAME cheque
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
                "collected_amount": spec["amount"],
                "status": "collected",
                "payment_method": "cheque",
                "payment_reference": cheque_number,
                "bulk_collection_id": bulk_id,
                "collected_at": now,
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
        # The single ₹5L cheque that covered all 3 stages
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

        # Bounce the single cheque
        r = sess.post(f"{API}/accountant/cheques/{cheque_id}/bounce", json={
            "reason": "Insufficient funds",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["income_reversed"] is True
        # 3 stages must have been reverted
        assert result["stages_reverted"] == 3, f"Expected 3, got {result.get('stages_reverted')}"
        assert len(result["new_stage_ids"]) == 3
        assert result["total_income_reversed"] == 500000

        # Each old stage marked cheque_bounced
        async def verify():
            for sid in stage_ids:
                old = await db.payment_stages.find_one({"stage_id": sid}, {"_id": 0})
                assert old["status"] == "cheque_bounced", f"stage {sid} status={old['status']}"
                assert old["bounced_from_cheque_id"] == cheque_id

            # All 3 incomes flagged bounced
            for iid in income_ids:
                inc = await db.income.find_one({"income_id": iid}, {"_id": 0})
                assert inc["status"] == "cheque_bounced"

            # 3 new pending stages exist with bounced_from_* metadata
            new_stages = await db.payment_stages.find({
                "project_id": proj_id,
                "cheque_bounced_recollect": True,
            }, {"_id": 0}).to_list(20)
            assert len(new_stages) == 3
            for ns in new_stages:
                assert ns["status"] == "pending"
                assert ns["collected_amount"] == 0
                assert ns["bounced_from_cheque_id"] == cheque_id
                assert ns["bounced_from_cheque_number"] == cheque_number

        asyncio.get_event_loop().run_until_complete(verify())
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
