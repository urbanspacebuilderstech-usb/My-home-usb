"""Cheque Bounce workflow lifecycle test.

Two scenarios:
  1. Expense cheque bounce: Accountant pays a material expense via cheque → cheque
     bounces → recorded_expense flips to 'cheque_bounced', material_expenses
     approval row reopens to 'pending_accounts_approval' with `cheque_bounced=true`
     and bounced_from_* metadata so the Materials approval tab can surface a
     "Cheque Bounced" banner.
  2. Income cheque bounce: incoming cheque tied to a payment_stage → bounces →
     income row + original payment_stage flagged 'cheque_bounced'; a NEW pending
     payment_stage row is cloned with cheque_bounced_recollect=true and the
     bounced_from_* metadata for CRE re-collection.
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


def test_cheque_bounce_reverses_material_expense():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    mexp_id = f"mexp_{uuid.uuid4().hex[:12]}"
    rec_exp_id = f"exp_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    vendor = f"BounceVendor_{uuid.uuid4().hex[:6]}"

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Bounce Test", "is_active": True})
        # Material approval expense (already paid)
        await db.material_expenses.insert_one({
            "expense_id": mexp_id,
            "project_id": proj_id,
            "vendor_name": vendor,
            "material_name": "Steel",
            "final_amount": 50000,
            "status": "paid",
            "paid_via_expense_id": rec_exp_id,
            "request_type": "material",
            "created_at": now,
        })
        # Recorded expense (cashbook outgoing) for the cheque payment
        await db.recorded_expenses.insert_one({
            "expense_id": rec_exp_id,
            "project_id": proj_id,
            "vendor_name": vendor,
            "amount": 50000,
            "payment_method": "cheque",
            "cheque_id": cheque_id,
            "approval_id": mexp_id,
            "request_type": "material",
            "status": "approved",
            "category": "material",
            "created_at": now,
        })
        # The cheque consumed by this expense
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": f"BNC{uuid.uuid4().hex[:6].upper()}",
            "cheque_type": "incoming",
            "amount": 50000,
            "bank_name": "HDFC",
            "status": "deposited",
            "is_opened": True,
            "used_for_expense_id": rec_exp_id,
            "project_id": proj_id,
            "created_at": now,
        })

    async def cleanup():
        await db.projects.delete_one({"project_id": proj_id})
        await db.material_expenses.delete_one({"expense_id": mexp_id})
        await db.recorded_expenses.delete_one({"expense_id": rec_exp_id})
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")

        # 1. Bounce the cheque
        r = sess.post(f"{API}/accountant/cheques/{cheque_id}/bounce", json={
            "reason": "Insufficient funds",
            "charges": 500,
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["expense_reversed"] is True
        assert result["income_reversed"] is False

        # 2. Verify cheque marked bounced
        async def fetch_cheque():
            return await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
        c = asyncio.get_event_loop().run_until_complete(fetch_cheque())
        assert c["status"] == "bounced"
        assert c["bounce_reason"] == "Insufficient funds"
        assert c["bounce_charges"] == 500

        # 3. Verify recorded_expense reversed
        async def fetch_rec():
            return await db.recorded_expenses.find_one({"expense_id": rec_exp_id}, {"_id": 0})
        rec = asyncio.get_event_loop().run_until_complete(fetch_rec())
        assert rec["status"] == "cheque_bounced", f"Expected cheque_bounced, got {rec['status']}"

        # 4. Verify material_expense approval re-opened
        async def fetch_mexp():
            return await db.material_expenses.find_one({"expense_id": mexp_id}, {"_id": 0})
        mexp = asyncio.get_event_loop().run_until_complete(fetch_mexp())
        assert mexp["status"] == "pending_accounts_approval", f"Got {mexp['status']}"
        assert mexp["cheque_bounced"] is True
        assert mexp["bounced_from_cheque_id"] == cheque_id
        assert mexp["paid_via_expense_id"] is None
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_cheque_bounce_reduces_stage_received_in_place():
    """A bounced cheque should:
       • Mark the linked income as `cheque_bounced` (so it drops out of cashbook).
       • DEDUCT its amount from the SAME stage's `amount_received` and recompute
         status (paid → pending if fully bounced, or partial if it was partially
         received from other sources).  No new clone stage is created.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    stage_id = f"ps_{uuid.uuid4().hex[:12]}"
    income_id = f"inc_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Income Bounce Test", "is_active": True})
        # Stage that was fully paid (₹1L) via this cheque
        await db.payment_stages.insert_one({
            "stage_id": stage_id,
            "project_id": proj_id,
            "stage_name": "Advance",
            "amount": 100000,
            "amount_received": 100000,
            "collected_amount": 100000,
            "status": "paid",
            "workflow_status": "collected",
            "payment_method": "cheque",
            "collected_at": now,
            "paid_at": now,
            "cheque_id": cheque_id,
            "created_at": now,
        })
        # Income tied to that stage
        await db.income.insert_one({
            "income_id": income_id,
            "project_id": proj_id,
            "payment_stage_id": stage_id,
            "amount": 100000,
            "payment_mode": "cheque",
            "cheque_id": cheque_id,
            "status": "approved",
            "created_at": now,
        })
        # The incoming cheque
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": f"INC{uuid.uuid4().hex[:6].upper()}",
            "cheque_type": "incoming",
            "amount": 100000,
            "bank_name": "ICICI",
            "status": "deposited",
            "is_opened": True,
            "income_id": income_id,
            "project_id": proj_id,
            "created_at": now,
        })

    async def cleanup():
        await db.projects.delete_one({"project_id": proj_id})
        await db.payment_stages.delete_many({"project_id": proj_id})
        await db.income.delete_one({"income_id": income_id})
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/accountant/cheques/{cheque_id}/bounce", json={
            "reason": "Account closed",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["income_reversed"] is True
        assert result["bounced_amount"] == 100000
        # No clone — the SAME stage is adjusted in place
        assert result["stages_adjusted"], "Expected stages_adjusted in response"
        assert result["stages_adjusted"][0]["stage_id"] == stage_id
        assert result["stages_adjusted"][0]["reduction"] == 100000
        assert result["stages_adjusted"][0]["new_received"] == 0
        assert result["stages_adjusted"][0]["new_status"] == "pending"

        async def fetch():
            stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
            inc = await db.income.find_one({"income_id": income_id}, {"_id": 0})
            # Verify NO clone stage was created
            clones = await db.payment_stages.find({"project_id": proj_id, "stage_id": {"$ne": stage_id}}, {"_id": 0}).to_list(20)
            return stage, inc, clones
        stage, inc, clones = asyncio.get_event_loop().run_until_complete(fetch())

        # Same stage adjusted in place
        assert stage["amount_received"] == 0
        assert stage["status"] == "pending"
        assert stage["cheque_bounced"] is True
        assert stage["last_bounce_amount"] == 100000
        assert stage["last_bounce_cheque_id"] == cheque_id
        assert stage["paid_at"] is None

        # Income marked bounced
        assert inc["status"] == "cheque_bounced"

        # No clone created
        assert len(clones) == 0, f"Expected no clone stages, found {len(clones)}"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_cheque_bounce_rejects_already_bounced():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    rec_id = f"exp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": "ALREADY-BNC",
            "cheque_type": "incoming",
            "amount": 1000,
            "bank_name": "X",
            "status": "bounced",
            "is_opened": True,
            "used_for_expense_id": rec_id,
            "created_at": now,
        })

    async def cleanup():
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/accountant/cheques/{cheque_id}/bounce", json={"reason": "test"}, timeout=20)
        assert r.status_code == 400, r.text
        assert "already" in r.json()["detail"].lower()
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
