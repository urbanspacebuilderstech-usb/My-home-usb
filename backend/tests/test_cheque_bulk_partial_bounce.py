"""Bulk-collection bounce: a single ₹1L cheque was part of a ₹5L bulk
collection that produced 2 incomes (₹4,56,798 + ₹43,202). On bounce, the
₹1L should be deducted from the NEWEST income (₹4,56,798 → ₹3,56,798);
the smaller income (₹43,202) stays untouched. The cashbook total drops by
exactly ₹1L.
"""
import os
import asyncio
import uuid
import requests
from datetime import datetime, timezone, timedelta
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


def test_bulk_collection_partial_bounce_deducts_from_newest_income():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    bulk_id = f"col_{uuid.uuid4().hex[:10]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    stage1_id = f"ps_{uuid.uuid4().hex[:12]}"  # ₹43,202
    stage2_id = f"ps_{uuid.uuid4().hex[:12]}"  # ₹4,56,798
    inc1_id = f"inc_{uuid.uuid4().hex[:12]}"   # older
    inc2_id = f"inc_{uuid.uuid4().hex[:12]}"   # newer (newest)
    t0 = datetime.now(timezone.utc) - timedelta(hours=1)
    t1 = t0 + timedelta(minutes=5)

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Bulk Partial Bounce", "is_active": True})
        # Stage 1 (smaller): fully paid via ₹43,202
        await db.payment_stages.insert_one({
            "stage_id": stage1_id,
            "project_id": proj_id,
            "stage_name": "Stage 1",
            "amount": 43202,
            "amount_received": 43202,
            "status": "paid",
            "workflow_status": "collected",
            "payment_method": "cheque",
            "paid_at": t0.isoformat(),
            "collected_at": t0.isoformat(),
            "created_at": t0.isoformat(),
        })
        # Stage 2 (larger): fully paid via ₹4,56,798
        await db.payment_stages.insert_one({
            "stage_id": stage2_id,
            "project_id": proj_id,
            "stage_name": "Stage 2",
            "amount": 456798,
            "amount_received": 456798,
            "status": "paid",
            "workflow_status": "collected",
            "payment_method": "cheque",
            "paid_at": t1.isoformat(),
            "collected_at": t1.isoformat(),
            "created_at": t1.isoformat(),
        })
        # Two incomes — note: created_at on inc2 > inc1 (newest first)
        await db.income.insert_one({
            "income_id": inc1_id,
            "project_id": proj_id,
            "payment_stage_id": stage1_id,
            "amount": 43202,
            "payment_mode": "cheque",
            "bulk_collection_id": bulk_id,
            "status": "approved",
            "created_at": t0.isoformat(),
        })
        await db.income.insert_one({
            "income_id": inc2_id,
            "project_id": proj_id,
            "payment_stage_id": stage2_id,
            "amount": 456798,
            "payment_mode": "cheque",
            "bulk_collection_id": bulk_id,
            "status": "approved",
            "created_at": t1.isoformat(),
        })
        # One ₹1L cheque from the bulk (this one is bouncing)
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": "BULKP-1",
            "cheque_type": "incoming",
            "amount": 100000,
            "bank_name": "HDFC",
            "status": "deposited",
            "is_opened": True,
            "bulk_collection_id": bulk_id,
            "project_id": proj_id,
            "created_at": t1.isoformat(),
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
            "reason": "Signature mismatch",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["bounced_amount"] == 100000
        assert result["total_income_reversed"] == 100000

        async def verify():
            # Newest income (Stage 2) reduced by ₹1L; still approved & visible
            inc2 = await db.income.find_one({"income_id": inc2_id}, {"_id": 0})
            assert inc2["status"] == "approved", f"expected approved, got {inc2['status']}"
            assert inc2["amount"] == 356798, f"expected 356798, got {inc2['amount']}"
            assert inc2.get("partial_bounce_deducted") == 100000

            # Older income (Stage 1) UNTOUCHED
            inc1 = await db.income.find_one({"income_id": inc1_id}, {"_id": 0})
            assert inc1["status"] == "approved"
            assert inc1["amount"] == 43202

            # Stage 2 dropped to partial with ₹3,56,798 received
            s2 = await db.payment_stages.find_one({"stage_id": stage2_id}, {"_id": 0})
            assert s2["amount_received"] == 356798
            assert s2["status"] == "partial"
            assert s2["cheque_bounced"] is True
            assert s2["last_bounce_amount"] == 100000

            # Stage 1 untouched
            s1 = await db.payment_stages.find_one({"stage_id": stage1_id}, {"_id": 0})
            assert s1["amount_received"] == 43202
            assert s1["status"] == "paid"

            # Cashbook (project income endpoint) drops by ₹1L
            body = sess.get(f"{API}/projects/{proj_id}/income", timeout=20).json()
            assert body["summary"]["total_income"] == 400000  # 500000 - 100000

        asyncio.get_event_loop().run_until_complete(verify())
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
