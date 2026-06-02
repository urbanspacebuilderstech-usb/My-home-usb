"""Regression: Planning Person initial-approve now accepts edited fields
(description, brand, quantity, SE expected hours) — body is applied before
the request advances to Procurement.
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


def test_planning_initial_approve_edits_fields():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    request_id = f"test_mreq_{uuid.uuid4().hex[:8]}"
    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "PP Edit Test",
            "client_name": "Tester",
            "is_active": True,
        })
        await db.material_requests.insert_one({
            "request_id": request_id,
            "project_id": project_id,
            "material_name": "P sand",
            "brand": "Double wash",
            "quantity": 12,
            "unit": "cft",
            "se_requested_hours": 48,
            "se_delivery_choice": "48h",
            "status": "planning_initial_pending",
        })

    async def cleanup():
        await db.material_requests.delete_one({"request_id": request_id})
        await db.projects.delete_one({"project_id": project_id})

    async def fetch():
        return await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})

    loop = asyncio.new_event_loop()
    loop.run_until_complete(setup())
    try:
        s = _login("planning@constructionos.com", "Demo@1234")
        r = s.patch(
            f"{API}/procurement-simple/material-requests/{request_id}/planning-initial-approve",
            json={
                "material_name": "M Sand",
                "brand": "Triple wash",
                "quantity": 18,
                "se_requested_hours": 24,
                "notes": "edited by PP",
            },
        )
        assert r.status_code == 200, r.text

        doc = loop.run_until_complete(fetch())
        assert doc["status"] == "pm_approved", doc.get("status")
        assert doc["material_name"] == "M Sand"
        assert doc["brand"] == "Triple wash"
        assert doc["quantity"] == 18
        assert doc["se_requested_hours"] == 24
        assert doc["se_delivery_choice"] == "24h"
        assert doc.get("planning_edited_by_name")
        assert doc.get("planning_initial_approved_by_name")
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


if __name__ == "__main__":
    test_planning_initial_approve_edits_fields()
    print("PASS")
