"""Regression: addition rows must always display the linked addition cost's
full total (qty × price) — not the partial Request Payment amount.

Repro: ₹2,000 addition (2 × ₹1000). Planning raises a Request Payment for ₹500
(partial). The Payment Schedule row used to render Amount=₹500 / Received=₹500
/ Balance=₹0 (looks like it's fully done). Correct output:
    Amount  | Received | Balance
    ₹2,000  | ₹500     | ₹1,500
"""
import os
import asyncio
import uuid
import requests
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


def test_addition_partial_collection_amount_balance():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    cost_id = f"test_addn_{uuid.uuid4().hex[:8]}"
    stage_id = f"test_stage_{uuid.uuid4().hex[:8]}"
    aug_date = "2026-08-01"

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "Test Addition Partial",
            "client_name": "Tester",
            "total_value": 100000,
            "is_active": True,
        })
        await db.additional_costs.insert_one({
            "cost_id": cost_id,
            "project_id": project_id,
            "name": "BBBB",
            "qty": 2,
            "price": 1000,
            "estimated_amount": 2000,
            "income_received": 500,
        })
        await db.payment_stages.insert_one({
            "stage_id": stage_id,
            "project_id": project_id,
            "stage_name": "Additional: BBBB",
            "stage_label": "Additional: BBBB",
            "is_addition": True,
            "linked_addition_id": cost_id,
            # Bug-simulating: the Request Payment overwrote stage.amount to the
            # partial requested amount.
            "amount": 500,
            "amount_received": 500,
            "expected_payment_date": aug_date,
            "due_date": aug_date,
            "status": "pending",
        })

    async def cleanup():
        await db.payment_stages.delete_one({"stage_id": stage_id})
        await db.additional_costs.delete_one({"cost_id": cost_id})
        await db.projects.delete_one({"project_id": project_id})

    loop = asyncio.new_event_loop()
    loop.run_until_complete(setup())
    try:
        s = _login("cre@constructionos.com", "Demo@1234")
        r = s.get(f"{API}/planning/monthly-schedule", params={"month": 8, "year": 2026})
        assert r.status_code == 200, r.text
        rows = [e for e in r.json().get("entries", []) if e["stage_id"] == stage_id]
        assert len(rows) == 1, f"Expected exactly one row, got {len(rows)}"
        row = rows[0]
        assert row["amount"] == 2000, f"Amount should be 2000 (qty × price), got {row['amount']}"
        assert row["amount_received"] == 500, f"Received should be 500 (partial), got {row['amount_received']}"
        assert row["balance_due"] == 1500, f"Balance should be 1500, got {row['balance_due']}"
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


if __name__ == "__main__":
    test_addition_partial_collection_amount_balance()
    print("PASS")
