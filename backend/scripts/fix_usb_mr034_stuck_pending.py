"""
One-time DB heal: USB-MR034 stuck in Account Approvals after it was paid.

Material bill mexp_9e27d6b45119 (Mr Devan / M Sand / SATHISKUMAR AGENCY,
Rs 17,516) was paid via Cheque #001684, then sent back from the Cashbook
under the old send_material_back_to_approvals bug, which reset BOTH the
material_expenses mirror AND the material_requests parent to
"pending_accounts_approval".

The Aug 14 one-time correction (commit ece5c7e8, since removed in 6bde2160)
restored the mirror to "paid" and re-locked the cheque, but its
material_requests update wrote only balance_paid_amount / balance_paid_at /
balance_paid_by. It never wrote the parent status transition the real
payment path performs: pay_approval's full-payment phase cascade sets
status="delivered" + delivered_at on the parent. The parent was therefore
left at "pending_accounts_approval".

/procurement-simple/accountant/queue selects on the PARENT's status and its
keep-filter only drops in_transit / procurement_verifying /
pending_advance_payment rows, so a fully-paid "pending_accounts_approval"
row is never dropped. The bill shows as Pending forever while the mirror
reports paid, and Release Payment offers already-paid 17,516 -> net payable
0 -> the whole tender would be credited to vendor suspense as "excess".

This script writes ONE field (plus its timestamp) on ONE document, bringing
the parent to the same state a real full payment leaves it in:

    material_requests / mreq_022165ca5e8c
        status: pending_accounts_approval -> delivered
        delivered_at: <now>

It creates no payment, no suspense entry, touches no cheque, and touches no
other request. Idempotent: re-running after success is a no-op.

Exit codes (so a CI run's pass/fail is a trustworthy signal):
    0  applied, post-conditions verified  |  already corrected
    1  live state does not match the diagnosis -- nothing written

Stages
------
Run with --stage to isolate WHICH check fails. CI exposes per-step pass/fail
but not step output without a token, so each stage is wired as its own deploy
step and the pattern of conclusions localises the problem with no log access:

    --stage env            can we load .env and reach Mongo at all
    --stage records        do the three documents exist
    --stage preconditions  does the live state match the diagnosis
    --stage apply          perform the write, then verify (default)

env/records/preconditions are strictly read-only.
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

REQUEST_ID = "mreq_022165ca5e8c"
BILL_EXPENSE_ID = "mexp_9e27d6b45119"
CHEQUE_ID = "chq_8e7e0aae"
AMOUNT = 17516.0
FROM_STATUS = "pending_accounts_approval"
TO_STATUS = "delivered"

# Parent statuses that keep a row in /procurement-simple/accountant/queue.
QUEUE_STATUSES = ("pending_accounts_approval", "pending_balance_payment", "partially_paid")


def fail(msg: str) -> None:
    print(f"  ABORT: {msg}")
    print("  Nothing was written.")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="apply",
                    choices=["env", "records", "preconditions", "apply"])
    stage = ap.parse_args().stage

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    print(f"=== USB-MR034 heal / stage={stage} ===")
    if not mongo_url or not db_name:
        fail(f"MONGO_URL/DB_NAME missing from environment (looked in {BACKEND_DIR / '.env'}). "
             f"MONGO_URL set={bool(mongo_url)} DB_NAME set={bool(db_name)}")
        return 1

    cli = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
    db = cli[db_name]
    try:
        if stage == "env":
            n = await db.material_requests.count_documents({})
            print(f"  db={db_name} reachable; material_requests={n}")
            return 0

        parent = await db.material_requests.find_one({"request_id": REQUEST_ID}, {"_id": 0})
        bill = await db.material_expenses.find_one({"expense_id": BILL_EXPENSE_ID}, {"_id": 0})
        cheque = await db.cheques.find_one({"cheque_id": CHEQUE_ID}, {"_id": 0})

        if not parent:
            fail(f"material_requests {REQUEST_ID} not found.")
            # Help locate the right document if the id has moved.
            by_num = await db.material_requests.find_one({"request_number": "USB-MR034"}, {"_id": 0})
            print(f"  lookup by request_number USB-MR034: "
                  f"{by_num.get('request_id') if by_num else 'also not found'}")
            return 1
        print(f"  request_number : {parent.get('request_number')}")
        print(f"  material       : {parent.get('material_name')} / {parent.get('vendor_name')}")
        print(f"  project        : {parent.get('project_name')}")
        print(f"  parent status  : {parent.get('status')}")
        print(f"  cheque_bounced : {parent.get('cheque_bounced')}")
        print(f"  bill status    : {(bill or {}).get('status')} "
              f"paid_amount={(bill or {}).get('paid_amount')}")
        print(f"  cheque #{(cheque or {}).get('cheque_number')} "
              f"used_for_expense_id={(cheque or {}).get('used_for_expense_id')}")

        if not bill:
            fail(f"material_expenses {BILL_EXPENSE_ID} not found.")
            return 1
        if stage == "records":
            print("  all three documents present")
            return 0

        # Idempotent success path.
        if parent.get("status") == TO_STATUS:
            print(f"  Already corrected -- parent status is '{TO_STATUS}'. No-op.")
            return 0

        # Preconditions. Any mismatch means the live state is not what was
        # diagnosed, so refuse rather than guess.
        if parent.get("status") != FROM_STATUS:
            fail(f"parent status is '{parent.get('status')}', expected '{FROM_STATUS}'.")
            return 1
        if bill.get("status") != "paid":
            fail(f"bill status is '{bill.get('status')}', expected 'paid' -- "
                 "the payment is NOT already recorded, so this heal does not apply.")
            return 1
        if abs(float(bill.get("paid_amount") or 0) - AMOUNT) > 0.01:
            fail(f"bill paid_amount is {bill.get('paid_amount')}, expected {AMOUNT}.")
            return 1
        if not (cheque and cheque.get("used_for_expense_id")):
            fail("Cheque #001684 is not locked to an expense -- payment trail not intact.")
            return 1
        if parent.get("cheque_bounced"):
            # A bounce would re-select this row through the queue's other $or
            # branch anyway, and would mean the payment is not good. Clearing
            # it here would mask a real bounce, so stop instead.
            fail("parent has cheque_bounced=True -- the payment story differs from "
                 "the diagnosis. Not clearing it; needs a human decision.")
            return 1
        if stage == "preconditions":
            print("  all preconditions match -- safe to apply")
            return 0

        now = datetime.now(timezone.utc).isoformat()
        res = await db.material_requests.update_one(
            {"request_id": REQUEST_ID, "status": FROM_STATUS},
            {"$set": {"status": TO_STATUS, "delivered_at": now, "updated_at": now}},
        )
        print(f"  matched={res.matched_count} modified={res.modified_count}")

        # Verify post-state, including the things that must NOT have changed.
        after = await db.material_requests.find_one({"request_id": REQUEST_ID}, {"_id": 0})
        bill_after = await db.material_expenses.find_one({"expense_id": BILL_EXPENSE_ID}, {"_id": 0})
        cheque_after = await db.cheques.find_one({"cheque_id": CHEQUE_ID}, {"_id": 0})

        ok = True
        if after.get("status") != TO_STATUS:
            print(f"  VERIFY FAIL: parent status is '{after.get('status')}'")
            ok = False
        if after.get("status") in QUEUE_STATUSES or after.get("cheque_bounced"):
            print("  VERIFY FAIL: parent would still appear in the accountant queue")
            ok = False
        if bill_after.get("status") != "paid" or abs(float(bill_after.get("paid_amount") or 0) - AMOUNT) > 0.01:
            print("  VERIFY FAIL: bill payment changed")
            ok = False
        if cheque_after.get("used_for_expense_id") != cheque.get("used_for_expense_id"):
            print("  VERIFY FAIL: cheque lock changed")
            ok = False

        print(f"  after: status={after.get('status')} delivered_at={after.get('delivered_at')}")
        print(f"  bill unchanged: status={bill_after.get('status')} paid_amount={bill_after.get('paid_amount')}")
        print(f"  cheque still locked to: {cheque_after.get('used_for_expense_id')}")
        print("  APPLIED AND VERIFIED" if ok else "  POST-CONDITION CHECK FAILED")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
