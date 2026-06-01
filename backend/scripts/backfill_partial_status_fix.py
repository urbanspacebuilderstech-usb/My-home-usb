"""One-shot backfill: fix payment_stages where status='partial' but the math
says the stage is fully collected (amount_received >= amount AND workflow_status='collected').

These are legacy rows where SmartCollect/collect-payment forgot to flip
status='partial' to 'paid' after a final payment landed.

After this runs the Collected sub-tab in CRE/Planning/Accountant Payment
Schedule will populate correctly.

Safe to run multiple times — only touches rows that match the bad-state filter.

Usage:
    cd /var/www/myhomeusb/app/backend && ./venv/bin/python3 scripts/backfill_partial_status_fix.py
"""
import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not (mongo and dbname):
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        mongo = os.environ["MONGO_URL"]
        dbname = os.environ["DB_NAME"]

    cli = AsyncIOMotorClient(mongo)
    db = cli[dbname]
    fixed = 0
    skipped = 0
    cursor = db.payment_stages.find(
        {"status": "partial", "workflow_status": "collected"},
        {"_id": 0, "stage_id": 1, "stage_name": 1, "amount": 1, "amount_received": 1},
    )
    async for s in cursor:
        amt = s.get("amount") or 0
        rec = s.get("amount_received") or 0
        # Treat as fully paid only when math agrees with at most ₹1 rounding tolerance.
        if amt > 0 and rec >= amt - 1:
            await db.payment_stages.update_one(
                {"stage_id": s["stage_id"]},
                {"$set": {"status": "paid"}},
            )
            fixed += 1
            if fixed <= 25:
                print(f"  Fixed {s['stage_id']}: {s['stage_name'][:60]} (amount={amt}, received={rec})")
        else:
            skipped += 1
    print(f"\nFixed: {fixed}  Skipped (genuinely partial — balance > 1): {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
