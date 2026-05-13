"""Backfill recorded_expenses rows for petty_cash records that were processed
through `accountant_process_payment` before that endpoint started inserting
recorded_expenses. Idempotent — safe to re-run."""
import asyncio
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Statuses that mean cash has actually left the accountant's hands
    issued_statuses = {"payment_done", "acknowledged", "issued", "partially_spent", "pending_settlement", "settled"}
    target = await db.petty_cash.find(
        {"status": {"$in": list(issued_statuses)}, "amount_issued": {"$gt": 0}},
        {"_id": 0},
    ).to_list(2000)
    print(f"Found {len(target)} issued petty cash records to inspect")

    inserted = 0
    for pc in target:
        pc_id = pc["petty_cash_id"]
        existing = await db.recorded_expenses.find_one(
            {"petty_cash_id": pc_id, "category": "petty_cash"},
            {"_id": 0, "expense_id": 1},
        )
        if existing:
            continue
        pay = pc.get("payment_details") or {}
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{secrets.token_hex(6)}",
            "project_id": pc.get("project_id") or "",
            "project_name": pc.get("project_name", ""),
            "category": "petty_cash",
            "description": f"Petty cash issued to {pc.get('requested_by_name', 'SE')} - {pc.get('purpose', '')}",
            "amount": pc.get("amount_issued") or pay.get("amount_paid") or 0,
            "payment_method": pay.get("payment_mode", "cash"),
            "payment_mode": pay.get("payment_mode", "cash"),
            "bank_name": pay.get("bank_name", ""),
            "cheque_number": pay.get("cheque_number", ""),
            "reference_number": pay.get("reference_number", ""),
            "vendor_name": pc.get("requested_by_name"),
            "recorded_by": pc.get("payment_processed_by") or pc.get("issued_by") or "system_backfill",
            "recorded_by_name": pc.get("payment_processed_by_name") or pc.get("issued_by_name") or "System Backfill",
            "status": "recorded",
            "source": "approval",
            "petty_cash_id": pc_id,
            "created_at": pc.get("payment_processed_at") or pc.get("issued_at") or datetime.now(timezone.utc).isoformat(),
        })
        inserted += 1
        print(f"  + backfilled expense for {pc_id} (₹{pc.get('amount_issued', 0):,.0f})")

    print(f"\nBackfill complete: inserted {inserted} new recorded_expenses rows")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
