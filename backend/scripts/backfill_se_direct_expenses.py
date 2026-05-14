"""Backfill recorded_expenses + petty_cash.amount_spent for every legacy
SE direct expense that pre-dates the auto-mirror logic.

Idempotent (skips lines already mirrored via direct_expense_item_id)."""
import asyncio
import os
import secrets
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main() -> None:
    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]

    legacy = await db.direct_expenses.find({}, {"_id": 0}).to_list(2000)
    print(f"Found {len(legacy)} direct_expense records")

    expenses_inserted = 0
    pc_spent_increments = {}  # se_user_id -> total

    for de in legacy:
        for item in de.get("items", []):
            item_id = item.get("item_id")
            if not item_id:
                continue
            existing = await db.recorded_expenses.find_one(
                {"direct_expense_item_id": item_id},
                {"_id": 0, "expense_id": 1},
            )
            if existing:
                continue
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{secrets.token_hex(6)}",
                "project_id": de.get("project_id"),
                "project_name": de.get("project_name", ""),
                "category": "petty_cash",
                "description": item.get("expense_name") or item.get("category", "Direct Expense"),
                "amount": item.get("amount", 0),
                "payment_method": "cash",
                "payment_mode": "cash",
                "bill_file_id": item.get("bill_file_id"),
                "bill_filename": item.get("bill_filename"),
                "vendor_name": item.get("category", ""),
                "recorded_by": de.get("recorded_by") or "system_backfill",
                "recorded_by_name": de.get("recorded_by_name") or "System Backfill",
                "status": "recorded",
                "source": "site_engineer_direct",
                "direct_expense_id": de.get("expense_id"),
                "direct_expense_item_id": item_id,
                "created_at": de.get("created_at"),
            })
            expenses_inserted += 1
            se_id = de.get("recorded_by")
            if se_id:
                pc_spent_increments[se_id] = pc_spent_increments.get(se_id, 0) + (item.get("amount") or 0)

    # Sync petty_cash.amount_spent for each SE that has unrecorded spend.
    for se_id, additional_spend in pc_spent_increments.items():
        if additional_spend <= 0:
            continue
        # find the most-recent open petty cash row for this SE
        open_pc = await db.petty_cash.find_one(
            {"requested_by": se_id, "status": {"$in": ["payment_done", "acknowledged", "issued", "partially_spent"]}},
            sort=[("created_at", -1)],
            projection={"_id": 0, "petty_cash_id": 1, "amount_spent": 1, "amount_issued": 1},
        )
        if not open_pc:
            continue
        # Use SET (not increment) — total_spent across all direct_expenses is the source of truth.
        # Re-aggregate to avoid double-counting after re-runs.
        agg = await db.recorded_expenses.aggregate([
            {"$match": {"recorded_by": se_id, "category": "petty_cash"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        true_spent = agg[0]["total"] if agg else 0
        new_status = "partially_spent" if true_spent < (open_pc.get("amount_issued") or 0) else "settled"
        await db.petty_cash.update_one(
            {"petty_cash_id": open_pc["petty_cash_id"]},
            {"$set": {"amount_spent": true_spent, "status": new_status}},
        )
        print(f"  ⤷ {se_id}: petty_cash.amount_spent ⇒ ₹{true_spent:,.0f}")

    print(f"\nBackfill complete: {expenses_inserted} recorded_expenses inserted, {len(pc_spent_increments)} SE balances synced")
    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
