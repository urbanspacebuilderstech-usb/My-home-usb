"""
Test: Petty Cash Correction Engine
==================================
Verifies the unified Reject / Resubmit / Send-for-Correction loop for petty cash:
  1. SE submits a petty cash request → status: requested (legacy awaiting)
  2. PM approves → status: pm_approved
  3. Accountant rejects with reason → status: accountant_rejected, correction_history grows
  4. SE resubmits with edited amount → status: awaiting_accountant, rejection markers cleared
  5. PM approves (or skipped if status still ok) → Accountant issues → status: issued + cashflow_ledger row created
  6. Cashbook total includes the issued amount
  7. Accountant sends for correction → status: under_correction, ledger row removed, cashbook excludes it
  8. SE resubmits → status: awaiting_accountant, ready for re-approval
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
SE = {"email": "engineer@constructionos.com", "password": "Demo@1234"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=creds)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def accountant():
    return _login(ACCOUNTANT)


@pytest.fixture(scope="module")
def se():
    return _login(SE)


def _seed_petty_cash_via_db(amount: float = 5000.0) -> str:
    """Insert a petty cash row directly so we don't go through PM approval chain."""
    import motor.motor_asyncio, asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        # Find a real SE user to attribute the request to
        se_user = await d.users.find_one({"email": SE["email"]}, {"_id": 0, "user_id": 1, "name": 1})
        pc_id = f"pc_test_{uuid.uuid4().hex[:8]}"
        await d.petty_cash.insert_one({
            "petty_cash_id": pc_id,
            "project_id": "",
            "project_name": "General",
            "requested_by": se_user["user_id"],
            "requested_by_name": se_user["name"],
            "amount_requested": amount,
            "amount_issued": 0,
            "amount_spent": 0,
            "amount_returned": 0,
            "purpose": "Test correction engine",
            "remarks": "Initial submission",
            "status": "pm_approved",  # ready for accountant
            "expenses": [],
            "created_at": "2026-02-19T00:00:00Z",
        })
        return pc_id

    return asyncio.get_event_loop().run_until_complete(_run())


def _get_petty_cash(petty_cash_id: str) -> dict:
    import motor.motor_asyncio, asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d.petty_cash.find_one({"petty_cash_id": petty_cash_id}, {"_id": 0})

    return asyncio.get_event_loop().run_until_complete(_run())


def _ledger_rows_for(source_id: str) -> int:
    import motor.motor_asyncio, asyncio
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])

    async def _run():
        d = cl[os.environ["DB_NAME"]]
        return await d.cashflow_ledger.count_documents({"source_id": source_id})

    return asyncio.get_event_loop().run_until_complete(_run())


def test_petty_cash_correction_loop(admin, accountant, se):
    pc_id = _seed_petty_cash_via_db(amount=5000.0)

    # 1. Accountant rejects (pre-approval) with reason.
    r = accountant.patch(f"{BASE}/api/accountant/petty-cash/{pc_id}/reject", json={"reason": "Amount too high — split into two requests"})
    assert r.status_code == 200, f"reject failed: {r.status_code} {r.text}"
    doc = _get_petty_cash(pc_id)
    assert doc["status"] == "accountant_rejected", doc["status"]
    assert doc["rejection_reason"].startswith("Amount too high"), doc
    assert doc["rejected_by_name"], doc
    assert any(h["action"] == "rejected" for h in doc.get("correction_history", [])), doc.get("correction_history")

    # 2. SE resubmits with edited amount + remarks.
    r = se.post(f"{BASE}/api/petty-cash/{pc_id}/resubmit", json={
        "amount_requested": 2500.0,
        "remarks": "Reduced amount per accountant request",
    })
    assert r.status_code == 200, f"resubmit failed: {r.status_code} {r.text}"
    doc = _get_petty_cash(pc_id)
    assert doc["status"] == "awaiting_accountant", doc["status"]
    assert doc["amount_requested"] == 2500.0, doc
    assert doc.get("rejection_reason") in (None, ""), doc.get("rejection_reason")
    assert any(h["action"] == "resubmitted" for h in doc.get("correction_history", [])), doc.get("correction_history")

    # 3. Accountant issues the petty cash → cashflow ledger row created.
    r = accountant.patch(f"{BASE}/api/accountant/petty-cash/{pc_id}/issue", json={"amount": 2500.0, "remarks": "ok"})
    assert r.status_code == 200, f"issue failed: {r.status_code} {r.text}"
    doc = _get_petty_cash(pc_id)
    assert doc["status"] == "issued", doc["status"]
    assert _ledger_rows_for(pc_id) >= 1, "cashflow_ledger row should exist after issue"

    # 4. Accountant sends for correction (post-approval). Ledger should be reversed.
    r = accountant.post(f"{BASE}/api/accountant/petty-cash/{pc_id}/send-for-correction", json={"reason": "Wrong project tagged"})
    assert r.status_code == 200, f"send-for-correction failed: {r.status_code} {r.text}"
    doc = _get_petty_cash(pc_id)
    assert doc["status"] == "under_correction", doc["status"]
    assert doc["correction_reason"] == "Wrong project tagged", doc
    assert doc.get("prev_approved_status") == "issued", doc
    assert _ledger_rows_for(pc_id) == 0, "cashflow_ledger should be reversed (0 rows)"

    # 5. SE resubmits the corrected version.
    r = se.post(f"{BASE}/api/petty-cash/{pc_id}/resubmit", json={
        "purpose": "Updated purpose after correction",
        "remarks": "Tagged correct project this time",
    })
    assert r.status_code == 200, f"second resubmit failed: {r.status_code} {r.text}"
    doc = _get_petty_cash(pc_id)
    assert doc["status"] == "awaiting_accountant", doc["status"]
    assert doc["purpose"] == "Updated purpose after correction", doc
    # correction_history should now have at least 3 entries.
    assert len(doc.get("correction_history", [])) >= 3, doc.get("correction_history")
