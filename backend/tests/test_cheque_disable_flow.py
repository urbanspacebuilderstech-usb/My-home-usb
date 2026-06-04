"""Cheque Disable / Retrieve / Hard-delete lifecycle.

Rules covered:
  • Disable allowed for Super Admin & Accountant on Received-state cheques.
  • Disable requires password + reason.
  • Disabled cheque is filtered out of normal lists (status != deleted query
    still returns it; the frontend hides it from non-Disabled tabs).
  • Retrieve allowed for Super Admin only. Resets is_disabled and clears reason.
  • Hard delete allowed for Super Admin only and only after disable. Removes
    the cheque document entirely; audit log is kept.
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


def _mk_received_cheque(db, cheque_id):
    now = datetime.now(timezone.utc).isoformat()
    return db.cheques.insert_one({
        "cheque_id": cheque_id,
        "cheque_number": f"DIS{uuid.uuid4().hex[:6].upper()}",
        "cheque_type": "incoming",
        "amount": 75000,
        "bank_name": "HDFC",
        "party_name": "DisableTestParty",
        "status": "issued",
        "is_opened": False,
        "open_requested": False,
        "created_at": now,
    })


def test_disable_retrieve_then_hard_delete_full_cycle():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    loop = asyncio.get_event_loop()
    loop.run_until_complete(_mk_received_cheque(db, cheque_id))
    try:
        # 1. Accountant disables — wrong password fails
        acc = _login("accountant@constructionos.com", "Demo@1234")
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "WRONG", "reason": "x"}, timeout=20)
        assert r.status_code == 401, r.text

        # Missing reason → 400
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "Demo@1234", "reason": ""}, timeout=20)
        assert r.status_code == 400

        # Correct → 200, is_disabled=True
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "Demo@1234", "reason": "Cheque damaged"}, timeout=20)
        assert r.status_code == 200, r.text

        async def fetch():
            return await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
        c = loop.run_until_complete(fetch())
        assert c.get("is_disabled") is True
        assert c.get("disable_reason") == "Cheque damaged"
        assert c.get("disabled_by_name")

        # Double-disable → 400
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "Demo@1234", "reason": "again"}, timeout=20)
        assert r.status_code == 400

        # 2. Accountant trying to Retrieve → 403
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/retrieve",
                     json={"password": "Demo@1234", "reason": "oops"}, timeout=20)
        assert r.status_code == 403, r.text

        # Super Admin can Retrieve
        sa = _login("admin@constructionos.com", "Demo@1234")
        r = sa.post(f"{API}/accountant/cheques/{cheque_id}/retrieve",
                    json={"password": "Demo@1234", "reason": "Disabled by mistake"}, timeout=20)
        assert r.status_code == 200, r.text
        c = loop.run_until_complete(fetch())
        assert c.get("is_disabled") is False
        assert c.get("retrieved_by_name")
        assert c.get("retrieve_reason") == "Disabled by mistake"
        assert "disable_reason" not in c  # unset

        # 3. Disable again → then Hard-delete via Super Admin
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "Demo@1234", "reason": "Truly invalid"}, timeout=20)
        assert r.status_code == 200

        # Accountant cannot Hard-delete
        r = acc.delete(f"{API}/accountant/cheques/{cheque_id}/hard",
                       json={"password": "Demo@1234", "reason": "x"}, timeout=20)
        assert r.status_code == 403

        # Super Admin can — wrong password fails
        r = sa.delete(f"{API}/accountant/cheques/{cheque_id}/hard",
                      json={"password": "WRONG", "reason": "x"}, timeout=20)
        assert r.status_code == 401

        # Correct → 200, doc removed
        r = sa.delete(f"{API}/accountant/cheques/{cheque_id}/hard",
                      json={"password": "Demo@1234", "reason": "Cleanup test record"}, timeout=20)
        assert r.status_code == 200, r.text
        c = loop.run_until_complete(fetch())
        assert c is None
    finally:
        # Ensure cleanup even if the hard-delete already removed it
        loop.run_until_complete(db.cheques.delete_one({"cheque_id": cheque_id}))


def test_disable_blocked_on_used_or_opened_cheque():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]
    loop = asyncio.get_event_loop()

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    loop.run_until_complete(db.cheques.insert_one({
        "cheque_id": cheque_id, "cheque_number": "ALREADYUSED",
        "cheque_type": "incoming", "amount": 10000,
        "bank_name": "ICICI", "status": "issued",
        "is_opened": True, "open_requested": False,
        "used_for_expense_id": "exp_xyz",  # already endorsed to vendor
        "created_at": now,
    }))
    try:
        acc = _login("accountant@constructionos.com", "Demo@1234")
        r = acc.post(f"{API}/accountant/cheques/{cheque_id}/disable",
                     json={"password": "Demo@1234", "reason": "trying"}, timeout=20)
        assert r.status_code == 400, r.text
    finally:
        loop.run_until_complete(db.cheques.delete_one({"cheque_id": cheque_id}))


def test_hard_delete_requires_disabled_first():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]
    loop = asyncio.get_event_loop()

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    loop.run_until_complete(_mk_received_cheque(db, cheque_id))
    try:
        sa = _login("admin@constructionos.com", "Demo@1234")
        # Not disabled yet → hard delete must refuse
        r = sa.delete(f"{API}/accountant/cheques/{cheque_id}/hard",
                      json={"password": "Demo@1234", "reason": "should fail"}, timeout=20)
        assert r.status_code == 400, r.text
    finally:
        loop.run_until_complete(db.cheques.delete_one({"cheque_id": cheque_id}))
