"""Regression: uncollected past-due stages carry forward into the CURRENT
calendar month view. Collected stages stay pinned to their planned month.

Scenario:
  • Today = current month/year (from datetime.now()).
  • Stage A planned 6 months ago, fully uncollected → must appear in current
    month with is_carryover=True.
  • Stage B planned 6 months ago, fully collected → must NOT appear in
    current month; must appear only in its planned month.
"""
import os
import asyncio
import uuid
import requests
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
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


def test_past_due_uncollected_carries_forward_to_current_month():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    stage_a = f"test_uncol_{uuid.uuid4().hex[:8]}"
    stage_b = f"test_col_{uuid.uuid4().hex[:8]}"

    now = datetime.now(timezone.utc)
    past = now - relativedelta(months=6)
    past_iso = past.replace(day=1).date().isoformat()
    collected_iso = past.replace(day=15).date().isoformat()  # collected in planned month

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "Carry-Forward Test",
            "client_name": "T",
            "total_value": 100000,
            "is_active": True,
        })
        await db.payment_stages.insert_many([
            {
                "stage_id": stage_a,
                "project_id": project_id,
                "stage_name": "Stage A — pending overdue",
                "amount": 5000,
                "amount_received": 0,
                "expected_payment_date": past_iso,
                "due_date": past_iso,
                "status": "pending",
            },
            {
                "stage_id": stage_b,
                "project_id": project_id,
                "stage_name": "Stage B — collected on time",
                "amount": 3000,
                "amount_received": 3000,
                "expected_payment_date": past_iso,
                "due_date": past_iso,
                "status": "collected",
                "collected_at": collected_iso,
            },
        ])

    async def cleanup():
        await db.payment_stages.delete_many({"stage_id": {"$in": [stage_a, stage_b]}})
        await db.projects.delete_one({"project_id": project_id})

    loop = asyncio.new_event_loop()
    loop.run_until_complete(setup())
    try:
        s = _login("cre@constructionos.com", "Demo@1234")

        # Current month view — should see Stage A (carry-forward), NOT Stage B.
        r = s.get(f"{API}/planning/monthly-schedule", params={"month": now.month, "year": now.year})
        assert r.status_code == 200, r.text
        rows = r.json().get("entries", [])
        ids_in_current = {e["stage_id"]: e for e in rows}
        assert stage_a in ids_in_current, f"Stage A (past-due, uncollected) MUST appear in current month tab. Got ids: {list(ids_in_current)[:10]}"
        assert ids_in_current[stage_a]["is_carryover"] is True
        assert ids_in_current[stage_a]["carry_from_month"] == past.month
        assert ids_in_current[stage_a]["carry_from_year"] == past.year
        assert stage_b not in ids_in_current, "Stage B (collected in past) MUST NOT appear in current month tab"

        # Past month view — Stage B (collected) should appear; Stage A should NOT
        # (it has been carried forward, not duplicated).
        r2 = s.get(f"{API}/planning/monthly-schedule", params={"month": past.month, "year": past.year})
        rows2 = r2.json().get("entries", [])
        ids_in_past = {e["stage_id"] for e in rows2}
        assert stage_b in ids_in_past, "Stage B (collected) MUST appear in its planned (past) month"
        assert stage_a not in ids_in_past, "Stage A MUST be carried forward, not duplicated"
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


if __name__ == "__main__":
    test_past_due_uncollected_carries_forward_to_current_month()
    print("PASS")
