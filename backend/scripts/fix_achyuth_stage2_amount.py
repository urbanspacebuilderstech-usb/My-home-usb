"""
One-time DB heal: Fix Mr Achyuth Stage-2 milestone amount.

Stage 2 ("Advance payment for Foundation and Plinth Beam Concrete") is
20% of the project total (₹4,660,113.50 × 20% = ₹932,022.70) but was
stored with amount=₹956,798 — a ₹24,775 inflation vs the other 20%
stages on the project (Stage 3 and Stage 4 both correctly show ₹932,023).

User decision (Feb 2026): correct Stage 2's `amount` to ₹932,023 to match
the 20% slice. `amount_received` stays at ₹956,798 since the cash was
actually collected — the ₹24,775 over-collection becomes a credit / extra
income visible in the rollups (it does NOT vanish).

Idempotent: only patches if amount currently == 956798.
"""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

PROJECT_ID = "proj_2565adc810ae"
STAGE_ID = "ps_41c15e654adf"
EXPECTED_OLD_AMOUNT = 956798.0
NEW_AMOUNT = 932023.0  # matches Stage 3 & Stage 4 stored amounts (round)


async def main() -> None:
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    s = await db.payment_stages.find_one({"stage_id": STAGE_ID}, {"_id": 0})
    if not s:
        print(f"ERROR: Stage {STAGE_ID} not found.")
        cli.close()
        return

    print(f"Project: {PROJECT_ID}")
    print(f"Stage: {s.get('stage_name')} (label={s.get('stage_label')}, pct={s.get('percentage')}%)")
    print(f"  Before: amount=₹{float(s.get('amount') or 0):,.2f}, "
          f"amount_received=₹{float(s.get('amount_received') or 0):,.2f}")

    if float(s.get("amount") or 0) != EXPECTED_OLD_AMOUNT:
        print("  No-op: stored amount is not ₹956,798 — already patched or different value. Aborting.")
        cli.close()
        return

    res = await db.payment_stages.update_one(
        {"stage_id": STAGE_ID, "amount": EXPECTED_OLD_AMOUNT},
        {"$set": {"amount": NEW_AMOUNT}},
    )
    print(f"  Updated rows: {res.modified_count}")

    fresh = await db.payment_stages.find_one({"stage_id": STAGE_ID}, {"_id": 0})
    print(f"  After:  amount=₹{float(fresh.get('amount') or 0):,.2f}, "
          f"amount_received=₹{float(fresh.get('amount_received') or 0):,.2f}")
    over = float(fresh.get("amount_received") or 0) - float(fresh.get("amount") or 0)
    print(f"  Net over-collection retained as credit: ₹{over:,.2f}")
    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
