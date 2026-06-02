"""One-shot cleanup: realign db.monthly_schedule_entries to each stage's
current expected_payment_date / due_date. After SE/Planning updates the
expected date, the stale pin keeps the row in the old month — this script
fixes that by either deleting the stale entry or repinning it.

Safe to run multiple times — idempotent.

Usage:
    cd /var/www/myhomeusb/app/backend && ./venv/bin/python3 scripts/realign_monthly_schedule_entries.py
"""
import asyncio
import os
from datetime import datetime


def _parse(d):
    if not d:
        return None
    if isinstance(d, datetime):
        return d
    try:
        return datetime.fromisoformat(str(d).replace("Z", "+00:00").split("T")[0])
    except (ValueError, TypeError):
        return None


async def main():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not (mongo and dbname):
        from dotenv import load_dotenv
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
        mongo = os.environ["MONGO_URL"]
        dbname = os.environ["DB_NAME"]
    cli = AsyncIOMotorClient(mongo)
    db = cli[dbname]

    repinned = 0
    deleted = 0
    untouched = 0
    cursor = db.monthly_schedule_entries.find({"is_carryover": {"$ne": True}, "is_hidden": {"$ne": True}}, {"_id": 0})
    async for e in cursor:
        sid = e.get("stage_id")
        if not sid:
            untouched += 1
            continue
        stage = await db.payment_stages.find_one({"stage_id": sid}, {"_id": 0, "expected_payment_date": 1, "due_date": 1})
        if not stage:
            # Stage gone — drop the orphan entry.
            await db.monthly_schedule_entries.delete_one({"entry_id": e["entry_id"]})
            deleted += 1
            continue
        d = _parse(stage.get("expected_payment_date")) or _parse(stage.get("due_date"))
        if not d:
            untouched += 1
            continue
        if e.get("month") == d.month and e.get("year") == d.year:
            untouched += 1
            continue
        # Stale month — repin.
        await db.monthly_schedule_entries.update_one(
            {"entry_id": e["entry_id"]},
            {"$set": {"month": d.month, "year": d.year, "expected_payment_date": d.date().isoformat()}},
        )
        repinned += 1
        if repinned <= 25:
            print(f"  Repinned {sid}: {e.get('month')}/{e.get('year')} -> {d.month}/{d.year}")
    print(f"\nRepinned: {repinned}  Deleted (orphan): {deleted}  Untouched: {untouched}")


if __name__ == "__main__":
    asyncio.run(main())
