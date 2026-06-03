"""Cheque Suspense Account lifecycle tests.

Scenario (vendor-keyed material flow):
  • Accountant has a material expense for ₹90,000 from vendor "Acme Cement".
  • CRE has opened 1 cheque of ₹100,000 (HDFC current account).
  • Accountant pays with that cheque → expense ₹90,000 booked, ₹10,000 excess
    auto-credited to suspense for vendor "Acme Cement".
  • Next expense for same vendor is ₹110,000:
      - pay-context shows existing balance ₹10,000, payable ₹100,000.
      - Accountant pays the ₹100,000 via current_account, ₹10,000 auto-deducted.
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


def test_cheque_suspense_overpay_then_consume_next_expense():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor_name = f"Acme Cement Test {uuid.uuid4().hex[:6]}"
    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    expense1_id = f"exp_{uuid.uuid4().hex[:12]}"
    expense2_id = f"exp_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "Suspense Test Project",
            "client_name": "T",
            "is_active": True,
        })
        # Material expense 1: ₹90,000
        await db.material_expenses.insert_one({
            "expense_id": expense1_id,
            "project_id": project_id,
            "vendor_name": vendor_name,
            "material_name": "OPC 53 grade",
            "final_amount": 90000,
            "status": "approved",
            "created_at": now,
        })
        # Material expense 2: ₹110,000 (for next-expense suspense consumption)
        await db.material_expenses.insert_one({
            "expense_id": expense2_id,
            "project_id": project_id,
            "vendor_name": vendor_name,
            "material_name": "Steel TMT",
            "final_amount": 110000,
            "status": "approved",
            "created_at": now,
        })
        # CRE-opened ₹1,00,000 cheque
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": f"CHQ{uuid.uuid4().hex[:6].upper()}",
            "cheque_type": "incoming",
            "amount": 100000,
            "bank_name": "HDFC",
            "status": "issued",
            "is_opened": True,
            "project_id": project_id,
            "cheque_date": now,
            "created_at": now,
        })
        # Clear any existing suspense for this vendor
        await db.suspense_entries.delete_many({"vendor_name": vendor_name})

    async def cleanup():
        await db.projects.delete_one({"project_id": project_id})
        await db.material_expenses.delete_many({"vendor_name": vendor_name})
        await db.cheques.delete_one({"cheque_id": cheque_id})
        await db.suspense_entries.delete_many({"vendor_name": vendor_name})
        await db.recorded_expenses.delete_many({"vendor_name": vendor_name})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")

        # 1. pay-context for expense 1 — initial balance should be 0
        r = sess.get(f"{API}/approvals/material/{expense1_id}/pay-context", timeout=20)
        assert r.status_code == 200, r.text
        ctx = r.json()
        assert ctx["request"]["vendor_name"] == vendor_name
        assert ctx["request"]["bill_amount"] == 90000
        assert ctx["suspense"]["vendor_balance"] == 0
        assert ctx["payable_after_suspense"] == 90000
        # active cheque must include our seeded cheque
        active_ids = [c["cheque_id"] for c in ctx["active_cheques"]]
        assert cheque_id in active_ids

        # 2. Pay expense 1 with the ₹100,000 cheque (over-payment by ₹10K)
        r = sess.post(f"{API}/approvals/material/{expense1_id}/pay", json={
            "payment_method": "cheque",
            "cheque_ids": [cheque_id],
            "remarks": "Overpay test",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        # paid_amount = effective amount applied to the bill (= payable)
        # new_suspense_credit = cheque excess credited to vendor
        assert result["paid_amount"] == 90000
        assert result["new_suspense_credit"] == 10000
        assert result["credit_used"] == 0
        assert result["payable"] == 90000

        # 3. pay-context for expense 2 — balance should now show 10K, payable=100K
        r = sess.get(f"{API}/approvals/material/{expense2_id}/pay-context", timeout=20)
        assert r.status_code == 200, r.text
        ctx2 = r.json()
        assert ctx2["request"]["bill_amount"] == 110000
        assert ctx2["suspense"]["vendor_balance"] == 10000, f"Expected ₹10K suspense, got {ctx2['suspense']['vendor_balance']}"
        assert ctx2["payable_after_suspense"] == 100000
        assert ctx2["suspense"]["credit_to_apply"] == 10000

        # 4. Pay expense 2 via current_account (no cheque)
        r = sess.post(f"{API}/approvals/material/{expense2_id}/pay", json={
            "payment_method": "current_account",
            "transaction_id": f"UTR{uuid.uuid4().hex[:10].upper()}",
            "remarks": "Pay after suspense deduction",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result2 = r.json()
        assert result2["credit_used"] == 10000, f"Expected ₹10K credit, got {result2['credit_used']}"
        assert result2["payable"] == 100000
        assert result2["new_suspense_credit"] == 0

        # 5. Final vendor suspense balance must be zero
        async def get_balance():
            entries = await db.suspense_entries.find({"vendor_name": vendor_name}, {"_id": 0}).to_list(100)
            return sum(float(e.get("amount", 0) or 0) for e in entries)
        final_balance = asyncio.get_event_loop().run_until_complete(get_balance())
        assert final_balance == 0, f"Expected ₹0 final balance, got {final_balance}"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_cheque_suspense_smaller_next_expense_carries_forward():
    """Suspense balance ₹10K but next expense only ₹3K — should consume ₹3K and
    leave ₹7K carried forward for the NEXT next expense (partial consumption)."""
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor_name = f"PartialVendor {uuid.uuid4().hex[:6]}"
    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    exp_id = f"exp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "Partial Suspense Test",
            "is_active": True,
        })
        await db.material_expenses.insert_one({
            "expense_id": exp_id,
            "project_id": project_id,
            "vendor_name": vendor_name,
            "material_name": "Bricks",
            "final_amount": 3000,
            "status": "approved",
            "created_at": now,
        })
        # Seed an existing ₹10K suspense for this vendor
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": "material",
            "vendor_name": vendor_name,
            "amount": 10000,
            "description": "Seed suspense",
            "created_at": now,
        })

    async def cleanup():
        await db.projects.delete_one({"project_id": project_id})
        await db.material_expenses.delete_one({"expense_id": exp_id})
        await db.suspense_entries.delete_many({"vendor_name": vendor_name})
        await db.recorded_expenses.delete_many({"vendor_name": vendor_name})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")

        # pay-context: bill 3K, balance 10K, payable 0
        r = sess.get(f"{API}/approvals/material/{exp_id}/pay-context", timeout=20)
        assert r.status_code == 200, r.text
        ctx = r.json()
        assert ctx["suspense"]["vendor_balance"] == 10000
        assert ctx["payable_after_suspense"] == 0
        assert ctx["suspense"]["credit_to_apply"] == 3000  # consume only 3K

        # Pay the bill with cash, denominations total 0 (since payable=0).
        # When payable=0, our cash check should allow zero denomination.
        r = sess.post(f"{API}/approvals/material/{exp_id}/pay", json={
            "payment_method": "cash",
            "denominations": [],
            "remarks": "Fully covered by suspense",
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["credit_used"] == 3000
        assert result["payable"] == 0
        assert result["new_suspense_credit"] == 0

        # Verify remaining suspense = ₹7K
        async def get_balance():
            entries = await db.suspense_entries.find({"vendor_name": vendor_name}, {"_id": 0}).to_list(100)
            return sum(float(e.get("amount", 0) or 0) for e in entries)
        bal = asyncio.get_event_loop().run_until_complete(get_balance())
        assert bal == 7000, f"Expected ₹7K carry-forward, got ₹{bal}"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
