"""Regression: Advance payment mode end-to-end.

Flow:
  1. Procurement assigns vendor + Advance 30% → status `pending_advance_payment`,
     advance bill mirrored to material_expenses (payment_phase='advance').
  2. Accountant pays advance via /approvals/material/{exp}/pay → parent flips to
     `in_transit`, expense status `paid`, advance_paid_amount stamped.
  3. (SE/procurement-verify simulated by mutating status to procurement_verifying
     and then verifying.)
  4. Procurement verifies → balance expense mirrored, parent `pending_balance_payment`.
  5. Accountant pays balance → parent → `delivered`.
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


def test_advance_flow_end_to_end():
    from motor.motor_asyncio import AsyncIOMotorClient
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    project_id = f"test_proj_{uuid.uuid4().hex[:8]}"
    request_id = f"test_mreq_{uuid.uuid4().hex[:8]}"
    vendor_id = f"test_vendor_{uuid.uuid4().hex[:6]}"

    async def setup():
        await db.projects.insert_one({
            "project_id": project_id, "name": "Advance Flow Test", "client_name": "T", "is_active": True,
        })
        await db.material_requests.insert_one({
            "request_id": request_id,
            "project_id": project_id,
            "material_name": "M Sand",
            "brand": "Double wash",
            "quantity": 10,
            "unit": "cft",
            "status": "pm_approved",
        })
        # Ensure an opened cheque is NOT needed because we'll use current_account method.

    async def cleanup():
        await db.material_requests.delete_one({"request_id": request_id})
        await db.material_expenses.delete_many({"source_request_id": request_id})
        await db.recorded_expenses.delete_many({"request_id": {"$exists": True}})
        await db.projects.delete_one({"project_id": project_id})

    async def get_req():
        return await db.material_requests.find_one({"request_id": request_id}, {"_id": 0})

    loop = asyncio.new_event_loop()
    loop.run_until_complete(setup())
    try:
        proc = _login("procurement@constructionos.com", "Demo@1234")
        acc = _login("accountant@constructionos.com", "Demo@1234")

        # 1. Procurement assigns vendor with Advance 30%
        r = proc.patch(
            f"{API}/procurement-simple/material-requests/{request_id}/assign-vendor",
            json={
                "vendor_id": vendor_id,
                "vendor_name": "Test Vendor",
                "unit_price": 100,
                "approved_quantity": 10,
                "payment_mode": "advance",
                "advance_input_mode": "percent",
                "advance_percent": 30,
                "timeline_type": "days",
                "timeline_value": 2,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending_advance_payment", body
        doc = loop.run_until_complete(get_req())
        assert doc["status"] == "pending_advance_payment"
        assert doc["next_payment_phase"] == "advance"
        assert doc.get("advance_expense_id")
        expense_id = doc["advance_expense_id"]

        # 2. Accountant pays advance via bank
        r = acc.post(
            f"{API}/approvals/material/{expense_id}/pay",
            json={
                "payment_method": "current_account",
                "transaction_id": f"TXN-{uuid.uuid4().hex[:8]}",
                "remarks": "advance",
            },
        )
        assert r.status_code == 200, r.text
        doc = loop.run_until_complete(get_req())
        assert doc["status"] == "in_transit", f"After advance pay, parent should be in_transit, got {doc['status']}"
        assert doc.get("advance_paid_amount") == 300, doc.get("advance_paid_amount")

        # 3. Simulate SE received → Procurement verifying
        loop.run_until_complete(db.material_requests.update_one(
            {"request_id": request_id},
            {"$set": {
                "status": "procurement_verifying",
                "pending_next_status": "pending_balance_payment",
                "pending_next_extra": {"next_payment_phase": "balance"},
            }},
        ))

        # 4. Procurement verifies
        r = proc.post(
            f"{API}/procurement-simple/material-requests/{request_id}/verify-approve",
            json={"invoice_no": "INV-001", "price_match": True, "qty_match": True},
        )
        assert r.status_code == 200, r.text
        doc = loop.run_until_complete(get_req())
        assert doc["status"] == "pending_balance_payment", doc["status"]

        # Find the balance expense
        bal_exp = loop.run_until_complete(db.material_expenses.find_one(
            {"source_request_id": request_id, "payment_phase": "balance"},
            {"_id": 0},
        ))
        assert bal_exp, "Balance expense not mirrored"
        assert abs(float(bal_exp["final_amount"]) - 700) < 0.5, bal_exp

        # 5. Accountant pays balance
        r = acc.post(
            f"{API}/approvals/material/{bal_exp['expense_id']}/pay",
            json={
                "payment_method": "current_account",
                "transaction_id": f"TXN-{uuid.uuid4().hex[:8]}",
                "remarks": "balance",
            },
        )
        assert r.status_code == 200, r.text
        doc = loop.run_until_complete(get_req())
        assert doc["status"] == "delivered", f"After balance pay, parent should be delivered, got {doc['status']}"
        assert doc.get("balance_paid_amount") == 700, doc.get("balance_paid_amount")
    finally:
        loop.run_until_complete(cleanup())
        loop.close()


if __name__ == "__main__":
    test_advance_flow_end_to_end()
    print("PASS")
