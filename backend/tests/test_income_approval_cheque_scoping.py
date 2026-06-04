"""Income approval popup must show ONLY the cheques tied to THIS income.

Regression for: "the previous cheque also show this payment only collect 5 no
of 2L cheque but it shows already approved cheques of 7L".

Verifies that GET /api/approvals/income/{income_id}/cheques:
  • Returns cheques linked via cheque.income_id (preferred)
  • Falls back to bulk_collection_id, then stage_id
  • Does NOT fall back to project-wide cheques
  • Excludes disabled / bounced cheques
"""
import os
import asyncio
import uuid
import requests
from datetime import datetime, timezone, timedelta
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


def test_income_cheques_scoped_strictly_to_this_income():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]
    loop = asyncio.get_event_loop()

    proj = f"test_proj_{uuid.uuid4().hex[:8]}"
    # Income A — has 2 cheques linked via bulk_collection_id
    bulk_a = f"col_{uuid.uuid4().hex[:8]}"
    inc_a = f"inc_{uuid.uuid4().hex[:12]}"
    chq_a1 = f"chq_{uuid.uuid4().hex[:12]}"
    chq_a2 = f"chq_{uuid.uuid4().hex[:12]}"
    # Income B — separate bulk, separate cheque (this one should NOT leak into A)
    bulk_b = f"col_{uuid.uuid4().hex[:8]}"
    inc_b = f"inc_{uuid.uuid4().hex[:12]}"
    chq_b1 = f"chq_{uuid.uuid4().hex[:12]}"
    # Plus a project-wide orphan cheque not linked to any of the above
    chq_orphan = f"chq_{uuid.uuid4().hex[:12]}"
    # A bounced cheque also linked to bulk_a — must be excluded
    chq_a_bounced = f"chq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    async def setup():
        await db.projects.insert_one({"project_id": proj, "name": "Income Scoping", "is_active": True})
        await db.income.insert_many([
            {"income_id": inc_a, "project_id": proj, "bulk_collection_id": bulk_a,
             "amount": 400000, "payment_mode": "cheque", "status": "pending_approval",
             "created_at": now},
            {"income_id": inc_b, "project_id": proj, "bulk_collection_id": bulk_b,
             "amount": 100000, "payment_mode": "cheque", "status": "pending_approval",
             "created_at": now},
        ])
        await db.cheques.insert_many([
            # Income A cheques
            {"cheque_id": chq_a1, "cheque_number": "A001", "cheque_type": "incoming",
             "amount": 200000, "status": "issued", "bulk_collection_id": bulk_a,
             "project_id": proj, "created_at": now},
            {"cheque_id": chq_a2, "cheque_number": "A002", "cheque_type": "incoming",
             "amount": 200000, "status": "issued", "bulk_collection_id": bulk_a,
             "project_id": proj, "created_at": now},
            # Bounced A cheque (must be hidden)
            {"cheque_id": chq_a_bounced, "cheque_number": "A-BNC", "cheque_type": "incoming",
             "amount": 50000, "status": "bounced", "bulk_collection_id": bulk_a,
             "project_id": proj, "created_at": now},
            # Income B cheque (must NOT leak into income A's popup)
            {"cheque_id": chq_b1, "cheque_number": "B001", "cheque_type": "incoming",
             "amount": 100000, "status": "issued", "bulk_collection_id": bulk_b,
             "project_id": proj, "created_at": now},
            # Orphan cheque on the same project — must NOT leak
            {"cheque_id": chq_orphan, "cheque_number": "ORPH", "cheque_type": "incoming",
             "amount": 70000, "status": "issued", "project_id": proj, "created_at": now},
        ])

    async def cleanup():
        await db.projects.delete_one({"project_id": proj})
        await db.income.delete_many({"project_id": proj})
        await db.cheques.delete_many({"project_id": proj})

    loop.run_until_complete(setup())
    try:
        s = _login("admin@constructionos.com", "Demo@1234")
        # Income A popup → should see ONLY chq_a1 + chq_a2 (bounced excluded, B excluded, orphan excluded)
        r = s.get(f"{API}/approvals/income/{inc_a}/cheques", timeout=20)
        assert r.status_code == 200, r.text
        ids = {c["cheque_id"] for c in r.json().get("cheques", [])}
        assert ids == {chq_a1, chq_a2}, f"expected only A's open cheques, got {ids}"

        # Income B popup → should see ONLY chq_b1
        r = s.get(f"{API}/approvals/income/{inc_b}/cheques", timeout=20)
        ids_b = {c["cheque_id"] for c in r.json().get("cheques", [])}
        assert ids_b == {chq_b1}, f"expected only B's cheque, got {ids_b}"

        # An income with no links and no bulk → must NOT fall back to project-wide
        ghost = f"inc_{uuid.uuid4().hex[:12]}"
        loop.run_until_complete(db.income.insert_one({
            "income_id": ghost, "project_id": proj, "amount": 1000,
            "payment_mode": "cheque", "status": "pending_approval", "created_at": now,
        }))
        try:
            r = s.get(f"{API}/approvals/income/{ghost}/cheques", timeout=20)
            assert r.status_code == 200
            assert r.json().get("cheques") == [], "must not leak project cheques when nothing is linked"
        finally:
            loop.run_until_complete(db.income.delete_one({"income_id": ghost}))
    finally:
        loop.run_until_complete(cleanup())
