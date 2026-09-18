"""Sep 18 2026 — Anbu test Vendor / Cheque #1234 — backfill missing excess.

The accountant paid Anbu test Vendor's ~2,000 PPC Cement bill using Cheque
#1234 (face value 5,000). At the time, a cheque leg was capped at "what the
bill needs" (Aug 18 2026 change), so only 2,000 was drawn and the remaining
3,000 was left as unallocated balance on the cheque instead of the vendor's
suspense credit. That flow is restored going forward (PayApprovalDialog.jsx /
financial.py, already deployed, no further code change needed) — this is the
one-off fix for the specific payment already made before that fix shipped.

Finds the payment and cheque by their known, distinguishing characteristics
(vendor name, cheque number, bill amount) rather than hardcoded ids, prints
the plan, and only writes on --apply. Idempotent — guarded by a restore_tag
so a re-run (e.g. every future deploy, matching this repo's convention for
one-off repairs) can never double-credit. Aborts instead of guessing if live
state doesn't match what was reported.

    (no flag)  dry run — reports the plan
    --apply    perform it, then verify
"""
import argparse, asyncio, os, sys, uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

VENDOR = "Anbu test Vendor"
CHEQUE_NO = "1234"
BILL_AMOUNT = 2000.0
EXCESS = 3000.0
RESTORE_TAG = "backfill_anbu_test_vendor_cheque_1234_excess"


async def pool_balance(db, vendor):
    rows = await db.suspense_entries.find(
        {"type": "material", "vendor_name": vendor}, {"_id": 0, "amount": 1}).to_list(5000)
    return round(sum(float(r.get("amount") or 0) for r in rows), 2)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    url, name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not url or not name:
        print("  ABORT: MONGO_URL/DB_NAME missing")
        return 1
    cli = AsyncIOMotorClient(url, serverSelectionTimeoutMS=10000)
    db = cli[name]
    import routes.financial as F
    F.db = db
    try:
        print("=== Anbu test Vendor / Cheque #1234 excess backfill ===")

        prior = await db.suspense_entries.find_one({"restore_tag": RESTORE_TAG}, {"_id": 0})
        if prior:
            print("  SKIP — already backfilled (guard tag present).")
            return 0

        cq = await db.cheques.find_one({"cheque_number": CHEQUE_NO}, {"_id": 0})
        if not cq:
            print(f"  ABORT: cheque #{CHEQUE_NO} not found")
            return 1
        cheque_id = cq["cheque_id"]
        face = float(cq.get("amount") or 0)
        avail = (await F.cheque_available_map([cq]))[cheque_id]

        expense = await db.recorded_expenses.find_one(
            {"vendor_name": VENDOR,
             "$or": [{"cheque_id": cheque_id}, {"cheque_ids": cheque_id}],
             "amount": {"$gte": BILL_AMOUNT - 0.5, "$lte": BILL_AMOUNT + 0.5}},
            {"_id": 0}, sort=[("created_at", -1)])
        if not expense:
            print(f"  ABORT: no recorded_expenses row found for {VENDOR} / cheque {cheque_id} / ~{BILL_AMOUNT:,.0f}")
            return 1

        pool_before = await pool_balance(db, VENDOR)

        print(f"  cheque #{CHEQUE_NO} ({cheque_id}) face   : {face:>12,.2f}")
        print(f"  cheque available NOW                 : {avail:>12,.2f}")
        print(f"  matched expense                      : {expense.get('expense_id')} amount={expense.get('amount')}")
        print(f"  linked request_id                    : {expense.get('request_id')}")
        print(f"  vendor pool NOW                       : {pool_before:>12,.2f}")

        if abs(avail - EXCESS) > 0.5:
            print(f"\n  ABORT: cheque available ({avail:,.2f}) is not the expected leftover "
                  f"({EXCESS:,.2f}) — state has moved since this was written, refusing to guess.")
            return 1

        print(f"\n  [A] cheque_allocations INSERT amount={EXCESS:,.2f} -> available becomes 0.00")
        print(f"  [B] suspense_entries INSERT credit +{EXCESS:,.2f} for {VENDOR} -> pool becomes {pool_before + EXCESS:,.2f}")

        if not a.apply:
            print("\n  DRY RUN — nothing written.")
            return 0

        now = datetime.now(timezone.utc).isoformat()
        await db.cheque_allocations.insert_one({
            "allocation_id": f"cha_{uuid.uuid4().hex[:10]}",
            "cheque_id": cheque_id, "cheque_number": CHEQUE_NO,
            "expense_id": expense.get("expense_id"), "request_id": expense.get("request_id"),
            "request_type": "historical_opening", "amount": EXCESS, "status": "active",
            "source": "historical_opening",
            "note": f"Backfill — bill {expense.get('expense_id')} only drew {BILL_AMOUNT:,.0f} of this "
                    f"cheque before the excess-to-suspense flow was restored; this allocation "
                    f"consumes the remainder so it is not double-counted with the new suspense credit.",
            "created_at": now,
        })
        await db.suspense_entries.insert_one({
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": "material", "vendor_name": VENDOR, "amount": EXCESS,
            "description": f"Excess from cheque #{CHEQUE_NO} on bill {expense.get('expense_id')} "
                            f"— backfilled after the excess-to-suspense flow was restored.",
            "payment_mode": "cheque",
            "linked_expense_id": expense.get("expense_id"),
            "linked_request_id": expense.get("request_id"),
            "linked_cheque_ids": [cheque_id],
            "restore_tag": RESTORE_TAG,
            "created_at": now,
        })

        cq2 = await db.cheques.find_one({"cheque_id": cheque_id}, {"_id": 0})
        avail_after = (await F.cheque_available_map([cq2]))[cheque_id]
        pool_after = await pool_balance(db, VENDOR)
        print(f"\n  cheque available AFTER : {avail_after:>12,.2f}   (target 0)")
        print(f"  vendor pool AFTER      : {pool_after:>12,.2f}   (was {pool_before:,.2f}, +{pool_after - pool_before:,.2f})")
        ok = abs(avail_after) <= 0.5 and abs((pool_after - pool_before) - EXCESS) <= 0.5
        print("  APPLIED AND VERIFIED" if ok else "  VERIFY FAILED — review above")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
