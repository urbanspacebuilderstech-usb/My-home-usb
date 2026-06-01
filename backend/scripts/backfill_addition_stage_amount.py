"""One-shot backfill: fix payment_stages.amount for stages linked to
additional_costs where the linked-cost's estimated_amount (the true total)
differs from the stage.amount (sometimes accidentally set to the first
partial collection amount during the "Request Payment" flow).

Sets:
  payment_stages.amount = additional_cost.estimated_amount (or .price)
  payment_stages.status = 'partial' if amount_received < amount, else 'paid'

Safe to run multiple times — only touches rows where amount disagrees.

Usage:
    cd /var/www/myhomeusb/app/backend && ./venv/bin/python3 scripts/backfill_addition_stage_amount.py
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
    skipped_match = 0
    skipped_no_total = 0
    cursor = db.payment_stages.find(
        {"is_addition": True, "linked_addition_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "stage_id": 1, "stage_name": 1, "amount": 1, "amount_received": 1,
         "status": 1, "workflow_status": 1, "linked_addition_id": 1},
    )
    async for s in cursor:
        cost = await db.additional_costs.find_one(
            {"cost_id": s["linked_addition_id"]},
            {"_id": 0, "estimated_amount": 1, "price": 1, "total": 1, "actual_amount": 1, "qty": 1, "rate": 1},
        )
        if not cost:
            skipped_no_total += 1
            continue
        # Determine the canonical total: prefer explicit `total`, then estimated_amount,
        # then price, then qty * rate.
        truth = (cost.get("total")
                 or cost.get("estimated_amount")
                 or cost.get("price")
                 or ((cost.get("qty") or 0) * (cost.get("rate") or 0) if (cost.get("qty") and cost.get("rate")) else None))
        if not truth or truth <= 0:
            skipped_no_total += 1
            continue
        old_amt = s.get("amount") or 0
        if abs(float(old_amt) - float(truth)) < 0.5:
            skipped_match += 1
            continue
        rec = s.get("amount_received") or 0
        new_status = "paid" if rec >= truth - 0.5 else ("partial" if rec > 0 else "pending")
        await db.payment_stages.update_one(
            {"stage_id": s["stage_id"]},
            {"$set": {
                "amount": float(truth),
                "status": new_status,
            }},
        )
        fixed += 1
        if fixed <= 25:
            print(f"  Fixed {s['stage_id']} ({s.get('stage_name','')[:40]}): amount {old_amt} -> {truth} | received={rec} | status={new_status}")

    print(f"\nFixed: {fixed}  Skipped (already match): {skipped_match}  Skipped (no total on cost): {skipped_no_total}")


if __name__ == "__main__":
    asyncio.run(main())
