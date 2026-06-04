"""Cheque usage scoping — ensures cheque #123456 (Mithran, ₹1L, no project)
does NOT pull in incomes from a different project with the same cheque number.
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


def test_duplicate_cheque_number_across_projects_does_not_cross_match():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_mithran = f"test_mithran_{uuid.uuid4().hex[:8]}"
    proj_abinaya = f"test_abinaya_{uuid.uuid4().hex[:8]}"
    # Shared cheque number across both projects
    shared_num = f"DUP{uuid.uuid4().hex[:5].upper()}"

    cheque_mithran_id = f"chq_{uuid.uuid4().hex[:12]}"
    inc_a1 = f"inc_{uuid.uuid4().hex[:12]}"
    inc_a2 = f"inc_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_many([
            {"project_id": proj_mithran, "name": "Mithran Proj", "is_active": True},
            {"project_id": proj_abinaya, "name": "Abinaya Proj", "is_active": True},
        ])
        # Mithran cheque (the one we'll look up)
        await db.cheques.insert_one({
            "cheque_id": cheque_mithran_id,
            "cheque_number": shared_num,
            "cheque_type": "incoming",
            "amount": 100000,
            "bank_name": "HDFC",
            "party_name": "Mithran",
            "status": "issued",
            "is_opened": True,
            "project_id": proj_mithran,
            "created_at": now,
        })
        # Abinaya project — TWO incomes with same payment_reference (the shared cheque number)
        # but belonging to a DIFFERENT project. These must NOT show up in Mithran cheque's view.
        await db.income.insert_many([
            {
                "income_id": inc_a1, "project_id": proj_abinaya, "project_name": "Abinaya Proj",
                "amount": 185760, "payment_mode": "cheque",
                "payment_reference": shared_num,
                "status": "approved", "created_at": now,
            },
            {
                "income_id": inc_a2, "project_id": proj_abinaya, "project_name": "Abinaya Proj",
                "amount": 7995, "payment_mode": "cheque",
                "payment_reference": shared_num,
                "status": "approved", "created_at": now,
            },
        ])

    async def cleanup():
        await db.projects.delete_many({"project_id": {"$in": [proj_mithran, proj_abinaya]}})
        await db.cheques.delete_one({"cheque_id": cheque_mithran_id})
        await db.income.delete_many({"income_id": {"$in": [inc_a1, inc_a2]}})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.get(f"{API}/cheques/{cheque_mithran_id}/usage", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Mithran cheque has NO collections of its own → expect zero incomes,
        # NOT the Abinaya ones that share the cheque number.
        assert data["summary"]["total_incomes"] == 0, f"Cross-project leakage: {data['incomes']}"
        assert data["summary"]["total_income_amount"] == 0
        assert data["incomes"] == []
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


def test_same_project_cheque_number_matches_correctly():
    """Positive case: cheque-number match works when project_id is the same."""
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    proj_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    cheque_id = f"chq_{uuid.uuid4().hex[:12]}"
    inc_id = f"inc_{uuid.uuid4().hex[:12]}"
    cheque_num = f"SAME{uuid.uuid4().hex[:5].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({"project_id": proj_id, "name": "Same Proj", "is_active": True})
        await db.cheques.insert_one({
            "cheque_id": cheque_id, "cheque_number": cheque_num,
            "cheque_type": "incoming", "amount": 50000,
            "bank_name": "HDFC", "status": "deposited", "is_opened": True,
            "project_id": proj_id, "created_at": now,
        })
        await db.income.insert_one({
            "income_id": inc_id, "project_id": proj_id, "project_name": "Same Proj",
            "amount": 50000, "payment_mode": "cheque", "payment_reference": cheque_num,
            "collected_by_name": "CRE Tester", "payment_date": now,
            "category": "advance_payment", "status": "approved", "created_at": now,
        })

    async def cleanup():
        await db.projects.delete_one({"project_id": proj_id})
        await db.cheques.delete_one({"cheque_id": cheque_id})
        await db.income.delete_one({"income_id": inc_id})

    asyncio.get_event_loop().run_until_complete(setup())
    try:
        sess = _login("accountant@constructionos.com", "Demo@1234")
        r = sess.get(f"{API}/cheques/{cheque_id}/usage", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["summary"]["total_incomes"] == 1
        assert data["summary"]["total_income_amount"] == 50000
        inc = data["incomes"][0]
        assert inc["project_name"] == "Same Proj"
        assert inc["collected_by_name"] == "CRE Tester"
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())
