"""
Test: Income Reject + Delete reversal — Mr Achyuth bug fix
==========================================================
Verifies that the Project Payment Summary header Total Income matches the
Cashflow Engine even after the Accountant rejects or deletes an income.

Flow:
  1. Seed a project + 2 approved income rows (₹50k each) + cashflow_ledger entries.
  2. GET /projects/{id}/payment-summary → total_received = 100,000 (both approved).
  3. Accountant rejects one of them (post-approval) → cashflow_ledger row removed.
  4. GET /payment-summary → total_received drops to 50,000.
  5. Accountant deletes the other → income row gone, cashflow_ledger row gone.
  6. GET /payment-summary → total_received = 0.
"""
import os
import uuid
import requests
import pytest
import asyncio
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=creds)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return s


def _seed():
    """Seed a project + 2 approved income rows + cashflow_ledger rows."""
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    pid = f"proj_test_{uuid.uuid4().hex[:8]}"
    inc1 = f"inc_test_{uuid.uuid4().hex[:8]}"
    inc2 = f"inc_test_{uuid.uuid4().hex[:8]}"

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.insert_one({
            "project_id": pid,
            "name": "Test Achyuth Project",
            "client_name": "Test Client",
            "total_value": 1_000_000,
            "scope_total": 1_000_000,
            "advance_amount": 0,
            "income_project": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        for iid, amt in [(inc1, 50000), (inc2, 50000)]:
            await d.income.insert_one({
                "income_id": iid,
                "project_id": pid,
                "project_name": "Test Achyuth Project",
                "amount": amt,
                "payment_mode": "savings_account",
                "category": "stage_payment",
                "status": "approved",
                "created_by": "user_superadmin001",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            # Mirror into cashflow_ledger (85/15 split)
            await d.cashflow_ledger.insert_one({
                "ledger_id": f"cf_{uuid.uuid4().hex[:10]}",
                "kind": "income",
                "source": "income",
                "source_id": iid,
                "project_id": pid,
                "project_name": "Test Achyuth Project",
                "amount": float(amt),
                "direct_amount": float(amt) * 0.85,
                "indirect_amount": float(amt) * 0.15,
                "snapshot_split": {"direct_pct": 85.0, "indirect_pct": 15.0},
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        return pid, inc1, inc2

    return asyncio.get_event_loop().run_until_complete(_run())


def _cleanup(pid):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        await d.projects.delete_many({"project_id": pid})
        await d.income.delete_many({"project_id": pid})
        await d.cashflow_ledger.delete_many({"project_id": pid})

    asyncio.get_event_loop().run_until_complete(_run())


def _ledger_count(pid):
    import motor.motor_asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d.cashflow_ledger.count_documents({"project_id": pid})

    return asyncio.get_event_loop().run_until_complete(_run())


def test_payment_summary_reject_delete_reversal():
    admin = _login(ADMIN)
    accountant = _login(ACCOUNTANT)

    pid, inc1, inc2 = _seed()
    try:
        # 1. Baseline — total_received = 100,000, 2 ledger rows
        r = admin.get(f"{BASE}/api/projects/{pid}/payment-summary")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["summary"]["total_received"] == 100000, body["summary"]
        assert _ledger_count(pid) == 2

        # 2. Reject inc1 (post-approval). Should drop to 50k + 1 ledger row.
        r = accountant.post(f"{BASE}/api/approvals/income/{inc1}/reject", params={"reason": "Wrong project tagged"})
        assert r.status_code == 200, r.text
        assert r.json().get("was_approved_before_reject") is True

        r = admin.get(f"{BASE}/api/projects/{pid}/payment-summary")
        body = r.json()
        assert body["summary"]["total_received"] == 50000, body["summary"]
        assert _ledger_count(pid) == 1, "cashflow_ledger row for rejected income should be reversed"

        # 3. Delete inc2 → total_received = 0 + 0 ledger rows
        r = accountant.delete(f"{BASE}/api/income/{inc2}")
        assert r.status_code == 200, r.text
        # Falls back to legacy advance + stages (both 0).
        r = admin.get(f"{BASE}/api/projects/{pid}/payment-summary")
        body = r.json()
        assert body["summary"]["total_received"] == 0, body["summary"]
        assert _ledger_count(pid) == 0, "cashflow_ledger should be empty after delete"
    finally:
        _cleanup(pid)
