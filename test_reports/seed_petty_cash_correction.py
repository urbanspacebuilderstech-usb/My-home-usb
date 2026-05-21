"""Seed petty cash rows in various states for iteration 156 UI testing."""
import asyncio
import os
import uuid
import sys
import json
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")


async def seed():
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cl[os.environ["DB_NAME"]]

    se = await d.users.find_one({"email": "engineer@constructionos.com"}, {"_id": 0, "user_id": 1, "name": 1})
    if not se:
        print("ERROR: SE not found")
        return

    seeded = {}

    # 1. pm_approved (so acc-pc-reject button should appear on accountant view)
    pc1 = f"pc_seed_pm_{uuid.uuid4().hex[:6]}"
    await d.petty_cash.insert_one({
        "petty_cash_id": pc1,
        "project_id": "",
        "project_name": "General",
        "requested_by": se["user_id"],
        "requested_by_name": se["name"],
        "amount_requested": 3000.0,
        "amount_issued": 0,
        "amount_spent": 0,
        "amount_returned": 0,
        "purpose": "Seed pm_approved",
        "remarks": "iter156 seed",
        "status": "pm_approved",
        "expenses": [],
        "created_at": "2026-02-19T00:00:00Z",
    })
    seeded["pm_approved"] = pc1

    # 2. accountant_rejected (so SE side correction banner appears)
    pc2 = f"pc_seed_rej_{uuid.uuid4().hex[:6]}"
    await d.petty_cash.insert_one({
        "petty_cash_id": pc2,
        "project_id": "",
        "project_name": "General",
        "requested_by": se["user_id"],
        "requested_by_name": se["name"],
        "amount_requested": 7500.0,
        "amount_issued": 0,
        "amount_spent": 0,
        "amount_returned": 0,
        "purpose": "Seed accountant_rejected",
        "remarks": "iter156 seed",
        "status": "accountant_rejected",
        "rejection_reason": "Excessive amount, please justify or split",
        "rejected_by_name": "Accountant Demo",
        "rejected_at": "2026-02-20T00:00:00Z",
        "correction_history": [
            {"action": "rejected", "by_name": "Accountant Demo", "reason": "Excessive amount, please justify or split", "at": "2026-02-20T00:00:00Z"}
        ],
        "expenses": [],
        "created_at": "2026-02-19T00:00:00Z",
    })
    seeded["accountant_rejected"] = pc2

    # 3. issued (so 'Send for Correction' button appears on accountant view)
    pc3 = f"pc_seed_iss_{uuid.uuid4().hex[:6]}"
    await d.petty_cash.insert_one({
        "petty_cash_id": pc3,
        "project_id": "",
        "project_name": "General",
        "requested_by": se["user_id"],
        "requested_by_name": se["name"],
        "amount_requested": 4000.0,
        "amount_issued": 4000.0,
        "amount_spent": 0,
        "amount_returned": 0,
        "purpose": "Seed issued",
        "remarks": "iter156 seed",
        "status": "issued",
        "issued_at": "2026-02-21T00:00:00Z",
        "expenses": [],
        "created_at": "2026-02-19T00:00:00Z",
    })
    seeded["issued"] = pc3

    # Also create a corresponding cashflow_ledger row for pc3 so we can verify removal after send-for-correction
    await d.cashflow_ledger.insert_one({
        "ledger_id": f"led_seed_{uuid.uuid4().hex[:6]}",
        "source_id": pc3,
        "source_kind": "petty_cash",
        "project_id": "",
        "amount": 4000.0,
        "direction": "out",
        "created_at": "2026-02-21T00:00:00Z",
    })

    print(json.dumps(seeded))


asyncio.get_event_loop().run_until_complete(seed())
