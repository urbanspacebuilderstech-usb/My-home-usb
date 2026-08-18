"""USB-MR034 / SATHISKUMAR AGENCY / Cheque #001684 — production repair.

Established from the audit trail (read-only, /admin/payment-funding-audit):
the 11 Aug payment of this bill recorded credit_used=17,516, new_suspense=0,
leg_count=0 — i.e. it was funded ENTIRELY from the vendor's suspense pool with
no payment leg of any kind. It was NOT a cheque payment. The 14 Aug one-time
script rebuilt it as a Cheque #001684 payment, which was wrong, and that is
what locked the cheque and left this tangle.

Two independent corrections, each individually guarded:

A. Cheque #001684 available 2,00,000 -> 0.
   Evidence: its single direct swipe (exp_e0cee333fc29, 2 Jul) tendered the
   full 2,00,000 face value, applying 19,630 to a P sand bill and seeding the
   rest as suspense. The cheque is spent. Recorded as ONE opening allocation
   equal to that tendered amount — derived from the swipe, not assumed.

B. Return 17,516 to SATHISKUMAR AGENCY's suspense, because that is where the
   payment came from. Which action is correct depends on live state, so the
   script decides from the data rather than assuming:
     - a debit for this bill still stands -> DELETE it. Removing the debit is
       the restoration (pool = credits - debits); no new row, so no duplicate.
     - no debit stands -> the amount is already back. A credit is inserted
       ONLY if no prior restoration exists, tagged with the bill id so a
       re-run can never add a second one.

Never creates a payment, never touches another bill, cheque or allocation.

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

BILL_ID = "mexp_9e27d6b45119"
VENDOR = "SATHISKUMAR AGENCY"
AMOUNT = 17516.0
CHEQUE_NO = "001684"
CHEQUE_ID = "chq_8e7e0aae"
RESTORE_TAG = f"usb_mr034_suspense_restore:{BILL_ID}"


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
        print("  ABORT: MONGO_URL/DB_NAME missing"); return 1
    cli = AsyncIOMotorClient(url, serverSelectionTimeoutMS=10000)
    db = cli[name]
    import routes.financial as F
    F.db = db
    try:
        print("=== USB-MR034 repair ===")
        cq = await db.cheques.find_one({"cheque_id": CHEQUE_ID}, {"_id": 0})
        if not cq:
            print(f"  ABORT: cheque {CHEQUE_ID} not found"); return 1
        face = float(cq.get("amount") or 0)
        cheque_before = (await F.cheque_available_map([cq]))[CHEQUE_ID]
        allocs = await db.cheque_allocations.find({"cheque_id": CHEQUE_ID}, {"_id": 0}).to_list(50)
        pool_before = await pool_balance(db, VENDOR)

        # The swipe that actually consumed this cheque — the opening figure
        # comes from its own tendered_amount.
        swipe = await db.recorded_expenses.find_one(
            {"$or": [{"cheque_id": CHEQUE_ID}, {"cheque_ids": CHEQUE_ID}],
             "source": {"$ne": "approval_suspense"},
             "tendered_amount": {"$gt": 0}}, {"_id": 0})
        opening = round(float((swipe or {}).get("tendered_amount") or 0), 2)

        stale_debits = await db.suspense_entries.find(
            {"amount": {"$gte": -AMOUNT - 0.5, "$lte": -AMOUNT + 0.5},
             "$or": [{"linked_request_id": BILL_ID}, {"linked_expense_id": BILL_ID}]},
            {"_id": 0}).to_list(20)
        prior_restore = await db.suspense_entries.find_one({"restore_tag": RESTORE_TAG}, {"_id": 0})

        print(f"  cheque #{CHEQUE_NO} face          : {face:>12,.2f}")
        print(f"  cheque available NOW          : {cheque_before:>12,.2f}")
        print(f"  existing allocation rows      : {len(allocs)}")
        print(f"  consuming swipe found         : {(swipe or {}).get('expense_id')} tendered={opening:,.2f}")
        print(f"  vendor pool NOW               : {pool_before:>12,.2f}")
        print(f"  standing debits for this bill : {len(stale_debits)}")
        print(f"  prior restoration entry       : {'yes' if prior_restore else 'no'}")

        # ---- Plan A: cheque ----
        do_cheque = False
        if allocs:
            print("  [A] SKIP cheque — allocation row(s) already exist (no double-count).")
        elif opening <= 0:
            print("  [A] SKIP cheque — no consuming swipe found; refusing to invent a figure.")
        elif abs(cheque_before - face) > 0.5:
            print(f"  [A] SKIP cheque — available {cheque_before:,.2f} is not the full face; already partly accounted.")
        else:
            do_cheque = True
            print(f"  [A] cheque_allocations INSERT amount={opening:,.2f} -> available becomes "
                  f"{max(0.0, face - opening):,.2f}")

        # ---- Plan B: suspense ----
        plan_b = "none"
        if prior_restore:
            print("  [B] SKIP suspense — already restored once (guard tag present).")
        elif stale_debits:
            plan_b = "delete_debit"
            print(f"  [B] DELETE {len(stale_debits)} standing debit(s) of -{AMOUNT:,.2f} "
                  f"-> pool becomes {pool_before + AMOUNT * len(stale_debits):,.2f}")
        else:
            plan_b = "insert_credit"
            print(f"  [B] suspense_entries INSERT credit +{AMOUNT:,.2f} (no debit stands, none "
                  f"previously restored) -> pool becomes {pool_before + AMOUNT:,.2f}")

        print("\n  Not touched: any other bill, cheque, allocation or suspense row. No payment created.")
        if not a.apply:
            print("\n  DRY RUN — nothing written.")
            return 0

        now = datetime.now(timezone.utc).isoformat()
        if do_cheque:
            await db.cheque_allocations.insert_one({
                "allocation_id": f"cha_{uuid.uuid4().hex[:10]}",
                "cheque_id": CHEQUE_ID, "cheque_number": CHEQUE_NO,
                "expense_id": None, "request_id": None,
                "request_type": "historical_opening", "amount": opening, "status": "active",
                "source": "historical_opening",
                "note": f"Consumed by swipe {(swipe or {}).get('expense_id')}; recorded so available reflects reality.",
                "created_at": now,
            })
        if plan_b == "delete_debit":
            for d in stale_debits:
                await db.suspense_entries.delete_one({"entry_id": d["entry_id"]})
        elif plan_b == "insert_credit":
            await db.suspense_entries.insert_one({
                "entry_id": f"se_{uuid.uuid4().hex[:10]}",
                "type": "material", "vendor_name": VENDOR, "amount": AMOUNT,
                "description": f"Restore {AMOUNT:,.0f} to suspense — USB-MR034 was funded from this "
                               f"pool (audit 11 Aug: credit_used={AMOUNT:,.0f}, leg_count=0) and the "
                               f"payment was later deleted.",
                "linked_request_id": BILL_ID, "restore_tag": RESTORE_TAG,
                "created_at": now,
            })

        cq2 = await db.cheques.find_one({"cheque_id": CHEQUE_ID}, {"_id": 0})
        cheque_after = (await F.cheque_available_map([cq2]))[CHEQUE_ID]
        pool_after = await pool_balance(db, VENDOR)
        bill = await db.material_expenses.find_one({"expense_id": BILL_ID}, {"_id": 0})
        already_paid = await F._reconciled_already_paid(bill or {})
        bill_amt = float((bill or {}).get("final_amount") or 0)

        print(f"\n  cheque available AFTER        : {cheque_after:>12,.2f}   (target 0)")
        print(f"  vendor pool AFTER             : {pool_after:>12,.2f}   (was {pool_before:,.2f}, +{pool_after - pool_before:,.2f})")
        print(f"  USB-MR034 already_paid        : {already_paid:>12,.2f}   (target 0)")
        print(f"  USB-MR034 net payable         : {bill_amt - already_paid:>12,.2f}   (target {AMOUNT:,.2f})")

        # A re-run legitimately moves nothing, so only require the delta when
        # this run actually performed the suspense step. Otherwise verify the
        # end state alone — "already correct" is success, not failure.
        moved_suspense = plan_b in ("delete_debit", "insert_credit") and not prior_restore
        ok = (abs(cheque_after) <= 0.5
              and already_paid <= 0.5
              and abs((bill_amt - already_paid) - AMOUNT) <= 0.5
              and (abs((pool_after - pool_before) - AMOUNT) <= 0.5 if moved_suspense
                   else abs(pool_after - pool_before) <= 0.5))
        print("  APPLIED AND VERIFIED" if ok else "  VERIFY FAILED — review above")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
