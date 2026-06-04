"""Password-protected orphan cheque delete.

Rules:
  • Only Super Admin / Accountant can delete.
  • Must re-authenticate with their own password.
  • Only orphan cheques (no real linked income/expense) can be deleted.
  • Soft delete only: status -> 'deleted'.
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


def test_delete_orphan_cheque_with_correct_password():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        # An orphan cheque: income_id and project_id reference IDs that don't exist
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": f"ORPH{uuid.uuid4().hex[:5].upper()}",
            "cheque_type": "incoming",
            "amount": 100000,
            "bank_name": "HDFC",
            "party_name": "GhostParty",
            "status": "issued",
            "is_opened": True,
            "income_id": "inc_does_not_exist",
            "project_id": "proj_does_not_exist",
            "created_at": now,
        })

    async def cleanup():
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")

        # 1. Wrong password → 401
        r = sess.delete(f"{API}/accountant/cheques/{cheque_id}", json={"password": "WRONG_PW"}, timeout=20)
        assert r.status_code == 401, r.text

        # 2. Correct password → 200
        r = sess.delete(f"{API}/accountant/cheques/{cheque_id}", json={"password": "Demo@1234"}, timeout=20)
        assert r.status_code == 200, r.text

        # 3. Cheque marked deleted in DB
        async def fetch():
            return await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
        c = asyncio.get_event_loop().run_until_complete(fetch())
        assert c["status"] == "deleted"
        assert c.get("deleted_at")
        assert c.get("deleted_by")

        # 4. Hitting again → 400 (already deleted)
        r = sess.delete(f"{API}/accountant/cheques/{cheque_id}", json={"password": "Demo@1234"}, timeout=20)
        assert r.status_code == 400
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_delete_blocked_when_cheque_has_real_income():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    inc_id = f"inc_{uuid.uuid4().hex[:12]}"
    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Real Proj", "is_active": True})
        await db.income.insert_one({
            "income_id": inc_id,
            "project_id": proj_id,
            "amount": 50000,
            "payment_mode": "cheque",
            "status": "approved",
            "created_at": now,
        })
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": f"REAL{uuid.uuid4().hex[:5].upper()}",
            "cheque_type": "incoming",
            "amount": 50000,
            "bank_name": "HDFC",
            "status": "deposited",
            "is_opened": True,
            "income_id": inc_id,
            "project_id": proj_id,
            "created_at": now,
        })

    async def cleanup():
        await db.cheques.delete_one({"cheque_id": cheque_id})
        await db.income.delete_one({"income_id": inc_id})
        await db.projects.delete_one({"project_id": proj_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.delete(f"{API}/accountant/cheques/{cheque_id}", json={"password": "Demo@1234"}, timeout=20)
        assert r.status_code == 400, r.text
        assert "linked" in r.json()["detail"].lower()

        # Cheque must still be issued (not deleted)
        async def fetch():
            return await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
        c = asyncio.get_event_loop().run_until_complete(fetch())
        assert c["status"] != "deleted"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_delete_forbidden_for_non_accountant():
    """Site engineer or CRE cannot delete cheques."""
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.cheques.insert_one({
            "cheque_id": cheque_id, "cheque_number": "RBAC1",
            "cheque_type": "incoming", "amount": 1000,
            "bank_name": "X", "status": "issued", "is_opened": True,
            "created_at": now,
        })

    async def cleanup():
        await db.cheques.delete_one({"cheque_id": cheque_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("cre@constructionos.com", "Demo@1234")
        r = sess.delete(f"{API}/accountant/cheques/{cheque_id}", json={"password": "Demo@1234"}, timeout=20)
        assert r.status_code == 403, r.text
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
