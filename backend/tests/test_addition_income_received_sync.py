"""Regression tests for `_sync_addition_cost_received` helper in
routes/financial.py.

Verifies that when an APPROVED income tied to an Addition payment stage is
reversed (reject / send-for-correction / cheque bounce), the linked
`additional_costs.income_received` decrements in lockstep with
`payment_stages.amount_received`, and `cre_approved` flips back to False.

Test strategy: seed Mongo directly into the "approved" state, then hit the
public endpoint with a Super Admin session and re-read the docs.
"""
import os
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# --------------------------- helpers ---------------------------

def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "admin@constructionos.com", "password": "Demo@1234"}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _seed_approved_addition(amount=2000.0):
    """Seed project + additional_cost + addition stage in APPROVED state.

    Returns (project_id, cost_id, stage_id, income_id).
    """
    project_id = f"TEST_proj_{uuid.uuid4().hex[:8]}"
    cost_id = f"TEST_addn_{uuid.uuid4().hex[:8]}"
    stage_id = f"TEST_stage_{uuid.uuid4().hex[:8]}"
    income_id = f"TEST_inc_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    async def _go():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        await db.projects.insert_one({
            "project_id": project_id,
            "name": "TEST Addition Sync",
            "client_name": "TEST Client",
            "total_value": 100000,
            "is_active": True,
        })
        await db.additional_costs.insert_one({
            "cost_id": cost_id,
            "project_id": project_id,
            "name": "TEST Addition Item",
            "qty": 1,
            "price": amount,
            "estimated_amount": amount,
            # Stamp the post-approval state the helper has to UNDO.
            "income_received": amount,
            "cre_approved": True,
            "cre_approved_at": now,
        })
        await db.payment_stages.insert_one({
            "stage_id": stage_id,
            "project_id": project_id,
            "stage_name": "Additional: TEST",
            "stage_label": "Additional: TEST",
            "is_addition": True,
            "linked_addition_id": cost_id,
            "amount": amount,
            "amount_received": amount,
            "status": "paid",
            "workflow_status": "collected",
            "paid_at": now,
            "collected_at": now,
        })
        await db.income.insert_one({
            "income_id": income_id,
            "project_id": project_id,
            "project_name": "TEST Addition Sync",
            "payment_stage_id": stage_id,
            "stage": "Additional: TEST",
            "amount": amount,
            "payment_mode": "cash",
            "payment_date": now,
            "received_date": now,
            "status": "approved",
            "category": "addition",
            "created_by": "TEST_user",
            "collected_by": "TEST_user",
        })
        cli.close()
    _run(_go())
    return project_id, cost_id, stage_id, income_id


def _read_cost_and_stage(cost_id, stage_id):
    async def _go():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        cost = await db.additional_costs.find_one({"cost_id": cost_id}, {"_id": 0})
        stage = await db.payment_stages.find_one({"stage_id": stage_id}, {"_id": 0})
        cli.close()
        return cost, stage
    return _run(_go())


def _cleanup(project_id, cost_id, stage_id, income_id, cheque_id=None):
    async def _go():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        await db.projects.delete_one({"project_id": project_id})
        await db.additional_costs.delete_one({"cost_id": cost_id})
        await db.payment_stages.delete_one({"stage_id": stage_id})
        await db.income.delete_one({"income_id": income_id})
        if cheque_id:
            await db.cheques.delete_one({"cheque_id": cheque_id})
        cli.close()
    _run(_go())


# --------------------------- tests ---------------------------

def test_reject_approved_addition_income_resyncs_cost():
    """POST /api/approvals/income/{id}/reject must drop linked
    additional_costs.income_received to 0 and clear cre_approved."""
    project_id, cost_id, stage_id, income_id = _seed_approved_addition(amount=2000)
    try:
        s = _admin_session()
        # Sanity precondition
        cost, stage = _read_cost_and_stage(cost_id, stage_id)
        assert cost["income_received"] == 2000
        assert cost.get("cre_approved") is True

        r = s.post(f"{API}/approvals/income/{income_id}/reject",
                   params={"reason": "TEST reject"}, timeout=30)
        assert r.status_code in (200, 201), f"reject failed: {r.status_code} {r.text}"

        cost, stage = _read_cost_and_stage(cost_id, stage_id)
        assert stage["amount_received"] == 0, f"stage.amount_received not rolled back: {stage}"
        assert cost["income_received"] == 0, f"cost.income_received still stale: {cost}"
        assert cost.get("cre_approved") is False, f"cre_approved not cleared: {cost}"
    finally:
        _cleanup(project_id, cost_id, stage_id, income_id)


def test_send_for_correction_addition_income_resyncs_cost():
    """POST /api/approvals/income/{id}/send-for-correction must drop linked
    additional_costs.income_received to 0 and clear cre_approved."""
    project_id, cost_id, stage_id, income_id = _seed_approved_addition(amount=3500)
    try:
        s = _admin_session()
        r = s.post(f"{API}/approvals/income/{income_id}/send-for-correction",
                   json={"reason": "TEST needs fix"}, timeout=30)
        assert r.status_code in (200, 201), f"send-for-correction failed: {r.status_code} {r.text}"

        cost, stage = _read_cost_and_stage(cost_id, stage_id)
        assert stage["amount_received"] == 0, f"stage.amount_received not rolled back: {stage}"
        assert cost["income_received"] == 0, f"cost.income_received still stale: {cost}"
        assert cost.get("cre_approved") is False, f"cre_approved not cleared: {cost}"
    finally:
        _cleanup(project_id, cost_id, stage_id, income_id)


def test_bounce_cheque_addition_income_resyncs_cost():
    """POST /api/cheques/{cheque_id}/bounce on a cheque that paid an Addition
    stage must drop additional_costs.income_received in lockstep."""
    amount = 5000.0
    project_id, cost_id, stage_id, income_id = _seed_approved_addition(amount=amount)
    cheque_id = f"TEST_chq_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    async def _seed_cheque():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        # Convert income to cheque mode and add a cheque doc.
        await db.income.update_one(
            {"income_id": income_id},
            {"$set": {
                "payment_mode": "cheque",
                "payment_reference": "TEST123",
                "cheque_id": cheque_id,
                "cheque_number": "TEST123",
            }}
        )
        await db.cheques.insert_one({
            "cheque_id": cheque_id,
            "cheque_number": "TEST123",
            "project_id": project_id,
            "income_id": income_id,
            "amount": amount,
            "status": "received",
            "bank_name": "TEST Bank",
            "received_at": now,
        })
        cli.close()
    _run(_seed_cheque())

    try:
        s = _admin_session()
        r = s.post(f"{API}/accountant/cheques/{cheque_id}/bounce",
                   json={"reason": "TEST insufficient funds", "charges": 0}, timeout=30)
        assert r.status_code in (200, 201), f"bounce failed: {r.status_code} {r.text}"

        cost, stage = _read_cost_and_stage(cost_id, stage_id)
        assert stage["amount_received"] == 0, f"stage.amount_received not rolled back: {stage}"
        assert cost["income_received"] == 0, f"cost.income_received still stale: {cost}"
        assert cost.get("cre_approved") is False, f"cre_approved not cleared: {cost}"
    finally:
        _cleanup(project_id, cost_id, stage_id, income_id, cheque_id=cheque_id)


def test_approve_fresh_addition_income_sets_cost_received():
    """Regression: forward path — approving a freshly-recorded income on an
    Addition stage must set additional_costs.income_received=amount AND
    cre_approved=True (existing behaviour must not regress).
    """
    amount = 2500.0
    project_id = f"TEST_proj_{uuid.uuid4().hex[:8]}"
    cost_id = f"TEST_addn_{uuid.uuid4().hex[:8]}"
    stage_id = f"TEST_stage_{uuid.uuid4().hex[:8]}"
    income_id = f"TEST_inc_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    async def _seed():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        await db.projects.insert_one({
            "project_id": project_id, "name": "TEST Forward Sync",
            "client_name": "TEST", "total_value": 50000, "is_active": True,
        })
        await db.additional_costs.insert_one({
            "cost_id": cost_id, "project_id": project_id, "name": "TEST Addn Fwd",
            "qty": 1, "price": amount, "estimated_amount": amount,
            "income_received": 0, "cre_approved": False,
        })
        # Stage already has the money on it (CRE recorded collection); income is
        # waiting for accountant approval.
        await db.payment_stages.insert_one({
            "stage_id": stage_id, "project_id": project_id,
            "stage_name": "Additional: FWD", "stage_label": "Additional: FWD",
            "is_addition": True, "linked_addition_id": cost_id,
            "amount": amount, "amount_received": amount,
            "status": "paid", "workflow_status": "collected",
            "paid_at": now, "collected_at": now,
        })
        await db.income.insert_one({
            "income_id": income_id, "project_id": project_id,
            "project_name": "TEST Forward Sync", "payment_stage_id": stage_id,
            "stage": "Additional: FWD", "amount": amount,
            "payment_mode": "cash", "payment_date": now, "received_date": now,
            "status": "pending_approval", "category": "addition",
            "created_by": "TEST_user", "collected_by": "TEST_user",
        })
        cli.close()
    _run(_seed())

    try:
        s = _admin_session()
        r = s.post(f"{API}/approvals/income/{income_id}/approve", timeout=30)
        assert r.status_code in (200, 201), f"approve failed: {r.status_code} {r.text}"

        cost, stage = _read_cost_and_stage(cost_id, stage_id)
        assert cost["income_received"] == amount, f"forward income_received wrong: {cost}"
        assert cost.get("cre_approved") is True, f"cre_approved not set after approve: {cost}"
    finally:
        _cleanup(project_id, cost_id, stage_id, income_id)


if __name__ == "__main__":
    test_reject_approved_addition_income_resyncs_cost(); print("PASS reject")
    test_send_for_correction_addition_income_resyncs_cost(); print("PASS correction")
    test_bounce_cheque_addition_income_resyncs_cost(); print("PASS bounce")
    test_approve_fresh_addition_income_sets_cost_received(); print("PASS approve")
