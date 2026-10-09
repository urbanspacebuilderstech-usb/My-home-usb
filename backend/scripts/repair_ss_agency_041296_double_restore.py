"""Oct 9 2026 — one-off repair: SS AGENCY's suspense carries ₹6,000 twice
after Cheque #041296 bounced.

What happened, from the vendor's own ledger and the Sep 30 commits:

  29 Sep  #041296 (₹2,00,000) swiped on a bill: ₹77,400 to the bill,
          ₹1,22,600 excess to SS AGENCY's suspense.
  29 Sep  Four bills paid from that suspense: ₹30,600 (₹24,600 of it the
          last of #607981's credit, ₹6,000 of it #041296's), then ₹38,700,
          ₹51,000 and ₹2,300 entirely from #041296.
  30 Sep  backfill_bounced_cheque_material_suspense.py reversed the bounce:
          the three whole payments marked cheque_bounced, and for the
          ₹30,600 one a +₹6,000 "Restore" (se_c5b745607a) cancelling the part
          #041296 had funded. Balance -₹67,100 -> +₹30,900 (f128f475 /
          2e07fef5).
  later   That ₹30,600 payment was sent back to Approvals from the Cashbook.
          _reverse_mirror_cheque_and_suspense deleted its whole -₹30,600
          debit, which hands the full ₹30,600 back to the pool — including
          the ₹6,000 the Restore had already handed back. The Restore stayed.

So the bounced cheque still adds ₹6,000 to SS AGENCY's suspense (₹61,500
where ₹55,500 is real), and the Ledger dialog's "Suspense by cheque" shows
it as "#041296 ₹6,000".

The fix is one offsetting -₹6,000 entry. The Restore is left in place so the
history reads as it happened. The new entry is tagged cheque_bounce_reversal
like the Restore, so the bounce replay in
_reverse_cheque_material_suspense_and_bills ignores both, and names
"Cheque 041296" in its description so the chip nets to zero.

Refuses to write unless every check holds:
  * the cheque is #041296, bounced, and the Restore is SS AGENCY's ₹6,000
    cheque_bounce_reversal for it
  * the debit the Restore reversed no longer exists (it was deleted, not
    merely left standing — if it still stood, the Restore would be correct)
  * every live suspense-funded payment on that bill has its own debit (the
    payment really was undone, rather than its debit vanishing while it stood;
    a later re-payment from suspense is fine)
  * this repair has not already been applied (restore_tag guard)

    (no flag)  dry run — prints the checks, balances and planned entry, no writes
    --apply    write the entry, then verify the balance fell by exactly ₹6,000
               and the #041296 chip is gone
"""
import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

import routes.financial as F  # noqa: E402
import routes.procurement as P  # noqa: E402
from core.models import User, UserRole  # noqa: E402

VENDOR = "SS AGENCY"
CHEQUE_NUMBER = "041296"
RESTORE_ENTRY_ID = "se_c5b745607a"
AMOUNT = 6000.0
RESTORE_TAG = f"repair_ss_agency_041296_double_restore:{RESTORE_ENTRY_ID}"
CHIP_LABEL = f"#{CHEQUE_NUMBER}"

REPORT_USER = User(user_id="system_repair", email="repair@example.com",
                   name="System Repair", role=UserRole.SUPER_ADMIN,
                   created_at=datetime.now(timezone.utc))


async def chip(vendor_name: str) -> float:
    ledger = await P.material_vendor_payment_ledger(f"name:{vendor_name.lower()}", user=REPORT_USER)
    return next((c["balance"] for c in ledger.get("suspense_by_cheque") or []
                 if c["label"] == CHIP_LABEL), 0.0)


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
    P.db = F.db = db
    try:
        print(f"=== Repair: {VENDOR} ₹{AMOUNT:,.0f} counted twice after Cheque #{CHEQUE_NUMBER} bounced ===")
        problems = []

        cheques = await db.cheques.find({"cheque_number": CHEQUE_NUMBER}, {"_id": 0}).to_list(10)
        cheque = cheques[0] if len(cheques) == 1 else None
        if cheque is None:
            problems.append(f"expected exactly one cheque #{CHEQUE_NUMBER}, found {len(cheques)}")
        elif cheque.get("status") != "bounced":
            problems.append(f"cheque #{CHEQUE_NUMBER} status is {cheque.get('status')!r}, not 'bounced'")
        if cheque:
            print(f"  cheque     : #{CHEQUE_NUMBER} ({cheque.get('cheque_id')}) "
                  f"face ₹{float(cheque.get('amount') or 0):,.2f}  status {cheque.get('status')}")

        restore = await db.suspense_entries.find_one({"entry_id": RESTORE_ENTRY_ID}, {"_id": 0})
        if not restore:
            problems.append(f"Restore entry {RESTORE_ENTRY_ID} not found")
            restore = {}
        else:
            print(f"  restore    : {RESTORE_ENTRY_ID}  ₹{float(restore.get('amount') or 0):,.2f}  "
                  f"{restore.get('created_at')}  {restore.get('description')}")
            if (restore.get("vendor_name") or "").strip().lower() != VENDOR.lower():
                problems.append(f"Restore belongs to {restore.get('vendor_name')!r}, not {VENDOR}")
            if restore.get("type") != "material":
                problems.append(f"Restore type is {restore.get('type')!r}, not 'material'")
            if restore.get("source_type") != "cheque_bounce_reversal":
                problems.append(f"Restore source_type is {restore.get('source_type')!r}")
            if abs(float(restore.get("amount") or 0) - AMOUNT) > 0.5:
                problems.append(f"Restore amount is {restore.get('amount')}, expected {AMOUNT}")
            if cheque and restore.get("cheque_id") != cheque.get("cheque_id"):
                problems.append(f"Restore names cheque {restore.get('cheque_id')}, not #{CHEQUE_NUMBER}")

        debit_id = restore.get("reversed_entry_id")
        if restore and not debit_id:
            problems.append("Restore has no reversed_entry_id — cannot tell which debit it cancelled")
        if debit_id:
            debit = await db.suspense_entries.find_one({"entry_id": debit_id}, {"_id": 0})
            if debit:
                problems.append(
                    f"the debit it cancelled ({debit_id}, ₹{float(debit.get('amount') or 0):,.2f}) still "
                    f"exists, so the Restore is still offsetting it and must stay")
            else:
                print(f"  debit      : {debit_id} — deleted (the payment was sent back from the Cashbook)")

        bill_id = restore.get("linked_request_id")
        if bill_id:
            bill = await db.material_expenses.find_one({"expense_id": bill_id}, {"_id": 0}) or {}
            print(f"  bill       : {bill_id}  {bill.get('material_name')}  status {bill.get('status')}  "
                  f"paid ₹{float(bill.get('paid_amount') or 0):,.2f}  "
                  f"bill ₹{float(bill.get('final_amount') or bill.get('estimated_cost') or 0):,.2f}")
            ids = [i for i in {bill_id, bill.get("source_request_id")} if i]
            legs = await db.recorded_expenses.find(
                {"$or": [{"request_id": {"$in": ids}},
                         {"material_request_id": {"$in": ids}},
                         {"material_expense_id": {"$in": ids}}]},
                {"_id": 0, "expense_id": 1, "amount": 1, "status": 1, "source": 1,
                 "credit_applied": 1, "is_deleted": 1},
            ).to_list(100)
            live_suspense_legs = [
                l for l in legs
                if (l.get("status") or "").lower() not in F._PAID_LEG_EXCLUDED_STATUS
                and not l.get("is_deleted")
                and ((l.get("source") or "") == "approval_suspense"
                     or float(l.get("credit_applied") or 0) > 0.5)
            ]
            # A bill paid again from suspense after the send-back is fine — that
            # payment wrote its own debit. A live suspense-funded payment with NO
            # debit behind it means the debit vanished while the payment stood,
            # and voiding ₹6,000 would not be the whole story.
            for l in live_suspense_legs:
                target = round(float(l.get("credit_applied") or l.get("amount") or 0), 2)
                own_debit = await db.suspense_entries.find_one(
                    {"$or": [{"linked_expense_id": l["expense_id"]},
                             {"linked_request_id": {"$in": ids},
                              "amount": {"$gte": -target - 0.5, "$lte": -target + 0.5}}],
                     "amount": {"$lt": -0.5}},
                    {"_id": 0, "entry_id": 1, "amount": 1})
                if own_debit:
                    print(f"  later leg  : {l['expense_id']} ₹{float(l.get('amount') or 0):,.2f} has its own "
                          f"debit {own_debit['entry_id']} — a re-payment, unaffected")
                else:
                    problems.append(
                        f"live suspense-funded payment {l['expense_id']} (₹{float(l.get('amount') or 0):,.2f}) "
                        f"on that bill has no suspense debit behind it — this repair does not fit")
        elif restore:
            print("  bill       : (Restore carries no linked_request_id)")

        if await db.suspense_entries.find_one({"restore_tag": RESTORE_TAG}, {"_id": 0, "entry_id": 1}):
            print("\n  Already applied — an entry tagged for this repair exists. Nothing to do.")
            return 0

        balance_before = round(await F._live_vendor_suspense_balance("material", VENDOR, {}), 2)
        chip_before = await chip(VENDOR)
        print(f"\n  {VENDOR} suspense now    : ₹{balance_before:,.2f}")
        print(f"  {CHIP_LABEL} chip now       : ₹{chip_before:,.2f}")
        print(f"  after this repair        : ₹{balance_before - AMOUNT:,.2f} "
              f"(chip ₹{chip_before - AMOUNT:,.2f})")

        if problems:
            print("\n  REFUSING — checks failed:")
            for p in problems:
                print(f"    - {p}")
            return 1

        now = datetime.now(timezone.utc).isoformat()
        entry = {
            "entry_id": f"se_{uuid.uuid4().hex[:10]}",
            "type": "material",
            "vendor_name": restore.get("vendor_name"),
            "amount": -AMOUNT,
            "description": (f"Void — duplicate Restore after Cheque {CHEQUE_NUMBER} bounced "
                            f"({RESTORE_ENTRY_ID} returned ₹{AMOUNT:,.0f} of a payment that was later "
                            f"sent back to Approvals, which returned it again)"),
            "payment_mode": restore.get("payment_mode"),
            "linked_request_id": restore.get("linked_request_id"),
            "source_type": "cheque_bounce_reversal",
            "reversed_entry_id": RESTORE_ENTRY_ID,
            "cheque_id": restore.get("cheque_id"),
            "restore_tag": RESTORE_TAG,
            "created_at": now,
            "created_by": REPORT_USER.user_id,
        }
        print("\n  planned entry:")
        for k in ("entry_id", "vendor_name", "amount", "description", "payment_mode",
                  "linked_request_id", "source_type", "reversed_entry_id", "cheque_id", "restore_tag"):
            print(f"    {k:18}: {entry[k]}")

        if not a.apply:
            print("\n  DRY RUN — nothing written. Re-run with --apply to perform this.")
            return 0

        await db.suspense_entries.insert_one(dict(entry))
        balance_after = round(await F._live_vendor_suspense_balance("material", VENDOR, {}), 2)
        chip_after = await chip(VENDOR)
        print(f"\n  written {entry['entry_id']}")
        print(f"  {VENDOR} suspense : ₹{balance_before:,.2f} -> ₹{balance_after:,.2f}")
        print(f"  {CHIP_LABEL} chip    : ₹{chip_before:,.2f} -> ₹{chip_after:,.2f}")
        ok = abs((balance_before - balance_after) - AMOUNT) < 0.5 and abs(chip_after) < 0.5
        print("  Verify: OK" if ok else "  Verify: FAILED — see figures above.")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
