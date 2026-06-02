"""Regression: collected stages must remain pinned to their PLANNED
(expected_payment_date) month — not the collection month. A stage planned for
Aug 2026 that was collected in June 2026 should only appear in the Aug 2026
schedule view, never in Jun 2026 with a bogus "Carried from Aug 2026" badge.
"""
import os
import asyncio
import uuid
import requests
from datetime import datetime, timezone, timedelta

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return s


def test_collected_stage_pinned_to_planned_month():
    """Seed a fake collected payment_stage planned for Aug, collected in Jun,
    then hit the monthly-schedule endpoint for both months and confirm the
    stage only appears in Aug.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    stage_id = f"test_stage_{uuid.uuid4().hex[:8]}"
    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    aug_date = "2026-08-01"
    jun_date = "2026-06-15"

    async def setup_and_query():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "Test Planned-Month Pin",
            "client_name": "Tester",
            "total_value": 100000,
            "is_active": True,
        })
        await db.payment_stages.insert_one({
            "stage_id": stage_id,
            "project_id": project_id,
            "stage_name": "Test Stage",
            "stage_label": "Test Stage",
            "amount": 5000,
            "amount_received": 5000,
            "expected_payment_date": aug_date,
            "due_date": aug_date,
            "status": "collected",
            "collected_at": jun_date,
            "is_addition": False,
        })

    async def cleanup():
        await db.payment_stages.delete_one({"stage_id": stage_id})
        await db.projects.delete_one({"project_id": project_id})

    asyncio.get_event_loop().run_until_complete(setup_and_query())
    try:
        s = _login("cre@constructionos.com", "Demo@1234")
        jun = s.get(f"{API}/planning/monthly-schedule", params={"month": 6, "year": 2026}).json()
        aug = s.get(f"{API}/planning/monthly-schedule", params={"month": 8, "year": 2026}).json()

        jun_ids = {e["stage_id"] for e in jun.get("entries", [])}
        aug_ids = {e["stage_id"] for e in aug.get("entries", [])}

        assert stage_id not in jun_ids, (
            f"BUG: stage planned for Aug but collected in Jun is showing in Jun view. "
            f"Jun entries: {[e.get('stage_id') for e in jun.get('entries', [])]}"
        )
        assert stage_id in aug_ids, (
            f"REGRESSION: stage planned for Aug should appear in Aug view. "
            f"Aug entries: {[e.get('stage_id') for e in aug.get('entries', [])]}"
        )

        aug_row = next(e for e in aug["entries"] if e["stage_id"] == stage_id)
        assert aug_row["is_carryover"] is False, "Planned-month row must not be flagged as carryover"
        assert aug_row["carry_from_month"] is None
    finally:
        asyncio.get_event_loop().run_until_complete(cleanup())


if __name__ == "__main__":
    test_collected_stage_pinned_to_planned_month()
    print("PASS")
