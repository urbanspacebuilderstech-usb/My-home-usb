"""Multi-leg + partial payment lifecycle for material expense approvals.

Scenarios:
  1. Multi-leg exact pay: ₹1,53,767 bill paid by ₹1,00,000 cheque + ₹53,767 cash
     → status=paid, two recorded_expense rows (one per leg).
  2. Partial payment: ₹1,53,767 bill paid first ₹1,00,000 cheque only → status=
     'partially_paid', remaining_balance=53,767. Second call adds ₹53,767 cash
     → status=paid, total_paid_so_far accumulates.
  3. Cheque excess only: ₹1,53,767 bill paid by ₹2,00,000 cheque (cash leg
     forbidden when excess) → status=paid, ₹46,233 → vendor suspense.
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


def _setup_expense_and_cheque(db, vendor, bill, cheque_amount=None):
    """Helper to seed a material_expense and (optionally) one CRE-opened cheque."""
    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    mexp_id = f"mexp_{uuid.uuid4().hex[:12]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}" if cheque_amount else None
    now = datetime.now(timezone.utc).isoformat()

    async def run():
        await db.projects.insert_one({"project_id": proj_id, "name": "Multi-Leg Test", "is_active": True})
        await db.material_expenses.insert_one({
            "expense_id": mexp_id, "project_id": proj_id, "vendor_name": vendor,
            "material_name": "Cement", "final_amount": bill, "status": "approved",
            "created_at": now,
        })
        if cheque_id:
            await db.cheques.insert_one({
                "cheque_id": cheque_id,
                "cheque_number": f"CHQ{uuid.uuid4().hex[:6].upper()}",
                "cheque_type": "incoming", "amount": cheque_amount,
                "bank_name": "HDFC", "status": "deposited",
                "is_opened": True, "project_id": proj_id, "created_at": now,
            })
        # Clear vendor suspense
        await db.suspense_entries.delete_many({"vendor_name": vendor})

    asyncio.get_event_loop().run_until_complete(run())
    return proj_id, mexp_id, cheque_id


def _cleanup(db, proj_id, mexp_id, cheque_id, vendor):
    async def run():
        await db.projects.delete_one({"project_id": proj_id})
        await db.material_expenses.delete_one({"expense_id": mexp_id})
        if cheque_id:
            await db.cheques.delete_one({"cheque_id": cheque_id})
        await db.suspense_entries.delete_many({"vendor_name": vendor})
        await db.recorded_expenses.delete_many({"vendor_name": vendor})
    asyncio.get_event_loop().run_until_complete(run())


def test_multi_leg_exact_payment_cheque_plus_cash():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor = f"MultiLegVendor_{uuid.uuid4().hex[:6]}"
    proj_id, mexp_id, cheque_id = _setup_expense_and_cheque(db, vendor, bill=153767, cheque_amount=100000)
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/approvals/material/{mexp_id}/pay", json={
            "payment_legs": [
                {"method": "cheque", "amount": 100000, "cheque_ids": [cheque_id]},
                {"method": "cash", "amount": 53767, "denominations": [
                    {"note": 500, "count": 100},
                    {"note": 100, "count": 37},
                    {"note": 50, "count": 1},
                    {"note": 10, "count": 1},
                    {"note": 5, "count": 1},
                    {"note": 2, "count": 1},
                ]},
            ],
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["is_partial"] is False
        assert result["status"] == "paid"
        assert result["paid_amount"] == 153767
        assert result["new_suspense_credit"] == 0
        assert len(result["leg_expense_ids"]) == 2

        # Two recorded_expense rows
        async def count_rows():
            return await db.recorded_expenses.count_documents({"vendor_name": vendor})
        assert asyncio.get_event_loop().run_until_complete(count_rows()) == 2
    finally:
        _cleanup(db, proj_id, mexp_id, cheque_id, vendor)


def test_partial_then_balance_payment():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor = f"PartialVendor_{uuid.uuid4().hex[:6]}"
    proj_id, mexp_id, cheque_id = _setup_expense_and_cheque(db, vendor, bill=153767, cheque_amount=100000)
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")

        # Step 1: pay only ₹1L via cheque (under-pay)
        r = sess.post(f"{API}/approvals/material/{mexp_id}/pay", json={
            "payment_legs": [
                {"method": "cheque", "amount": 100000, "cheque_ids": [cheque_id]},
            ],
        }, timeout=20)
        assert r.status_code == 200, r.text
        s1 = r.json()
        assert s1["is_partial"] is True
        assert s1["status"] == "partially_paid"
        assert s1["paid_amount"] == 100000
        assert s1["total_paid_so_far"] == 100000
        assert abs(s1["remaining_balance"] - 53767) < 0.5

        # Step 2: get fresh pay-context — should reflect already_paid + remaining
        r2 = sess.get(f"{API}/approvals/material/{mexp_id}/pay-context", timeout=20)
        ctx = r2.json()
        assert ctx["request"]["already_paid"] == 100000
        assert ctx["request"]["is_continuation"] is True
        assert abs(ctx["payable_after_suspense"] - 53767) < 0.5

        # Step 3: pay remaining ₹53,767 in cash
        r3 = sess.post(f"{API}/approvals/material/{mexp_id}/pay", json={
            "payment_legs": [
                {"method": "cash", "amount": 53767, "denominations": [
                    {"note": 500, "count": 107},
                    {"note": 100, "count": 2},
                    {"note": 50, "count": 1},
                    {"note": 10, "count": 1},
                    {"note": 5, "count": 1},
                    {"note": 2, "count": 1},
                ]},
            ],
        }, timeout=20)
        assert r3.status_code == 200, r3.text
        s2 = r3.json()
        assert s2["is_partial"] is False
        assert s2["status"] == "paid"
        assert s2["paid_amount"] == 53767
        assert s2["total_paid_so_far"] == 153767
        assert s2["remaining_balance"] == 0
    finally:
        _cleanup(db, proj_id, mexp_id, cheque_id, vendor)


def test_cheque_excess_only_goes_to_suspense():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor = f"ExcessVendor_{uuid.uuid4().hex[:6]}"
    proj_id, mexp_id, cheque_id = _setup_expense_and_cheque(db, vendor, bill=153767, cheque_amount=200000)
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/approvals/material/{mexp_id}/pay", json={
            "payment_legs": [
                {"method": "cheque", "amount": 200000, "cheque_ids": [cheque_id]},
            ],
        }, timeout=20)
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["status"] == "paid"
        assert result["new_suspense_credit"] == 46233
        # Vendor's suspense balance should reflect the excess
        async def bal():
            entries = await db.suspense_entries.find({"vendor_name": vendor}, {"_id": 0}).to_list(100)
            return sum(float(e.get("amount", 0) or 0) for e in entries)
        assert asyncio.get_event_loop().run_until_complete(bal()) == 46233
    finally:
        _cleanup(db, proj_id, mexp_id, cheque_id, vendor)


def test_cash_overpay_is_rejected():
    """Cash/bank legs cannot exceed payable; only cheque legs can create excess."""
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    vendor = f"OverpayVendor_{uuid.uuid4().hex[:6]}"
    proj_id, mexp_id, _ = _setup_expense_and_cheque(db, vendor, bill=10000)
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.post(f"{API}/approvals/material/{mexp_id}/pay", json={
            "payment_legs": [
                {"method": "cash", "amount": 15000, "denominations": [{"note": 500, "count": 30}]},
            ],
        }, timeout=20)
        assert r.status_code == 400, r.text
        assert "exceeds" in r.json()["detail"].lower()
    finally:
        _cleanup(db, proj_id, mexp_id, None, vendor)
