"""One-off repair: USB-MR435 (perfectware Building Products pvt ltd, Tiles bill)
lost track of a ₹50,000 payment that was already made against it. The bill's
`recorded_expenses` payment leg still shows the ₹50,000 as Approved, but the
parent `material_expenses` doc was reset to status=pending_accounts_approval
for the FULL ₹1,75,888 — most likely by a "send back to approvals" action on
a related entry, which unconditionally wipes paid_amount with no check for
whether an earlier separate partial payment should have survived.

This sets the bill back to the correct partially_paid state:
  paid_amount = 50000
  status = partially_paid
  remaining_balance = 125888

Safe to run once. Refuses to touch the document unless vendor_name and
final_amount match exactly, and is a no-op if it's already partially_paid
(so re-running it is harmless).

Usage (PROD):
    cd /var/www/myhomeusb/app/backend && python3 scripts/repair_usb_mr435_partial_payment.py
"""
import asyncio
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

REQUEST_NUMBER = "USB-MR435"
EXPECTED_VENDOR_SUBSTRING = "perfectware"
EXPECTED_TOTAL = 175888.0
ALREADY_PAID = 50000.0


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

    doc = await db.material_expenses.find_one({"request_number": REQUEST_NUMBER}, {"_id": 0})
    if not doc:
        print(f"NOT FOUND: no material_expenses doc with request_number={REQUEST_NUMBER!r}. Nothing changed.")
        return

    vendor = (doc.get("vendor_name") or "")
    total = float(doc.get("final_amount") or doc.get("amount") or 0)
    print(f"Found {REQUEST_NUMBER}: vendor={vendor!r}  status={doc.get('status')!r}  "
          f"final_amount={total}  paid_amount={doc.get('paid_amount')}")

    if EXPECTED_VENDOR_SUBSTRING.lower() not in vendor.lower():
        print(f"REFUSING: vendor {vendor!r} doesn't contain {EXPECTED_VENDOR_SUBSTRING!r}. Nothing changed.")
        return
    if abs(total - EXPECTED_TOTAL) > 0.5:
        print(f"REFUSING: final_amount {total} != expected {EXPECTED_TOTAL}. Nothing changed.")
        return

    if doc.get("status") == "partially_paid" and abs(float(doc.get("paid_amount") or 0) - ALREADY_PAID) < 0.5:
        print("Already repaired (status=partially_paid, paid_amount matches). No-op.")
        return

    now = datetime.now(timezone.utc).isoformat()
    remaining = round(EXPECTED_TOTAL - ALREADY_PAID, 2)
    id_field = "expense_id" if doc.get("expense_id") else "material_expense_id"
    id_value = doc.get(id_field)

    update = {
        "status": "partially_paid",
        "paid_amount": ALREADY_PAID,
        "remaining_balance": remaining,
        "last_partial_paid_at": now,
        "last_partial_paid_by": "manual_repair_script",
        "last_partial_paid_by_name": "Manual repair (USB-MR435 lost-payment fix)",
        "updated_at": now,
    }
    result = await db.material_expenses.update_one({id_field: id_value}, {"$set": update})
    print(f"Updated ({result.modified_count} doc): status=partially_paid, paid_amount={ALREADY_PAID}, "
          f"remaining_balance={remaining}")


if __name__ == "__main__":
    asyncio.run(main())
