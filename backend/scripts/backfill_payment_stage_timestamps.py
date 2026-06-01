"""One-shot backfill: set paid_at / collected_at on payment_stages rows
where status='paid' or status='collected' but those timestamps are missing.

Uses due_date / expected_payment_date as the best historical guess so the
monthly Payment Schedule can attribute legacy collections to the correct
calendar month.

Safe to run multiple times — only touches rows missing both timestamps.

Usage:
    cd /var/www/myhomeusb/app/backend && ./venv/bin/python3 scripts/backfill_payment_stage_timestamps.py
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
    untouched = 0
    cursor = db.payment_stages.find(
        {"status": {"$in": ["paid", "collected"]}},
        {"_id": 0, "stage_id": 1, "paid_at": 1, "collected_at": 1,
         "due_date": 1, "expected_payment_date": 1, "updated_at": 1,
         "created_at": 1,
         "amount_received": 1, "amount": 1, "status": 1},
    )
    async for s in cursor:
        sid = s.get("stage_id")
        existing_paid = s.get("paid_at")
        existing_coll = s.get("collected_at")
        if existing_paid or existing_coll:
            untouched += 1
            continue
        # Order of preference for "when was this collected":
        #   1) updated_at (best — last edit, usually the collection event)
        #   2) created_at (close fallback — stage was created-as-collected)
        #   3) expected_payment_date / due_date (last resort — planned month)
        fallback = (s.get("updated_at")
                    or s.get("created_at")
                    or s.get("expected_payment_date")
                    or s.get("due_date"))
        if not fallback:
            skipped += 1
            continue
        set_doc = {"collected_at": fallback}
        # Only stamp paid_at when stage is fully collected (status='paid' and
        # received >= amount). Partials should keep paid_at empty.
        rec = s.get("amount_received") or 0
        amt = s.get("amount") or 0
        if s.get("status") == "paid" and amt > 0 and rec >= amt - 0.5:
            set_doc["paid_at"] = fallback
        await db.payment_stages.update_one({"stage_id": sid}, {"$set": set_doc})
        fixed += 1
        if fixed <= 20:
            print(f"  Fixed {sid} -> collected_at={fallback}"
                  + (" paid_at=" + fallback if set_doc.get("paid_at") else ""))
    print(f"\nFixed: {fixed}  Skipped (no date hint): {skipped}  Untouched (already had timestamp): {untouched}")


if __name__ == "__main__":
    asyncio.run(main())
