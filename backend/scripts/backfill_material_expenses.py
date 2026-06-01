"""One-shot backfill: mirror existing `material_requests` rows in states
`pending_accounts_approval` / `pending_balance_payment` into `material_expenses`
so they appear in the Accountant Approvals queue.

Safe to run multiple times — skips rows already mirrored.

Usage (PROD):
    cd /var/www/myhomeusb/app/backend && python3 scripts/backfill_material_expenses.py
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not (mongo and dbname):
        # Fallback: load backend/.env
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        mongo = os.environ["MONGO_URL"]
        dbname = os.environ["DB_NAME"]

    cli = AsyncIOMotorClient(mongo)
    db = cli[dbname]
    backfilled = 0
    skipped = 0
    rescued = 0

    # 1) Items already at pending_accounts_approval / pending_balance_payment — straight mirror.
    # 2) "Orphan" pre_paid items: status='delivered' with procurement_verified_at set, but no
    #    mirrored expense — these were verified under the OLD pre_paid logic that skipped Accountant.
    #    Revert them to pending_accounts_approval so the Accountant sees + pays them.
    primary_q = {"status": {"$in": ["pending_accounts_approval", "pending_balance_payment"]}}
    orphan_q = {
        "status": "delivered",
        "payment_mode": "pre_paid",
        "procurement_verified_at": {"$exists": True, "$ne": None},
    }
    cursor = db.material_requests.find({"$or": [primary_q, orphan_q]}, {"_id": 0})
    async for req in cursor:
        rid = req.get("request_id")
        existing = await db.material_expenses.find_one(
            {"$or": [
                {"source_request_id": rid},
                {"expense_id": req.get("expense_id") or "_none_"},
            ]},
            {"_id": 0},
        )
        if existing:
            skipped += 1
            continue
        is_orphan = req.get("status") == "delivered" and req.get("payment_mode") == "pre_paid"
        phase = "balance" if req.get("status") == "pending_balance_payment" else "full"
        amount = float(req.get("total_amount") or req.get("estimated_price") or 0)
        if phase == "balance":
            amount = float(req.get("balance_amount") or amount)
        exp_id = f"mexp_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        await db.material_expenses.insert_one({
            "expense_id": exp_id,
            "source_request_id": rid,
            "project_id": req.get("project_id"),
            "project_name": req.get("project_name"),
            "material_name": req.get("material_name"),
            "quantity": req.get("approved_quantity") or req.get("quantity"),
            "unit": req.get("unit"),
            "unit_price": req.get("unit_price") or req.get("unit_rate"),
            "vendor_id": req.get("vendor_id"),
            "vendor_name": req.get("vendor_name") or "Unknown",
            "estimated_cost": amount,
            "final_amount": amount,
            "payment_mode": req.get("payment_mode"),
            "payment_phase": phase,
            "invoice_no": req.get("procurement_verify_invoice_no", ""),
            "status": "pending_accounts_approval",
            "site_engineer_id": req.get("site_engineer_id"),
            "site_engineer_name": req.get("site_engineer_name"),
            "created_at": req.get("procurement_verified_at") or now,
            "updated_at": now,
            "description": f"{req.get('material_name','')} ({req.get('quantity','')} {req.get('unit','')})",
            "request_type": "material",
        })
        # Roll status back to pending_accounts_approval for orphan pre_paid items.
        material_request_set = {"expense_id": exp_id}
        if is_orphan:
            material_request_set["status"] = "pending_accounts_approval"
            material_request_set["backfilled_from_delivered"] = True
            rescued += 1
        else:
            backfilled += 1
        await db.material_requests.update_one({"request_id": rid}, {"$set": material_request_set})
        tag = "RESCUED" if is_orphan else "MIRRORED"
        print(f"  [{tag}] {rid} -> {exp_id}: {req.get('material_name')} ({amount})")
    print(f"\nMirrored: {backfilled}  Rescued (pre_paid orphans): {rescued}  Skipped: {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
