"""READ-ONLY dry run: historical opening allocation for Cheque #001684.

Cheque #001684 (chq_8e7e0aae, face 2,00,000) predates the partial-allocation
model, and the old send-back bug deleted the suspense credit that used to
account for its unspent portion. It therefore has no record of the 1,72,484
already spent from it, and under the new formula

    available = face - sum(active allocations) - sum(suspense credits seeded)

it reads as a full 2,00,000 available, which would let those rupees be spent
a second time.

The fix is ONE opening allocation row of 1,72,484 representing that historical
usage, after which available = 27,516 and the normal flow takes over: paying
USB-MR034's 17,516 leaves 10,000.

THIS SCRIPT WRITES NOTHING. It reports the live state, confirms no allocation
rows already represent that usage, and computes the projected balance.

    --assert no-existing-allocations  no allocation rows on this cheque yet
    --assert no-seeded-suspense       no surviving suspense credit for it
    --assert projected-27516          seeding 1,72,484 yields exactly 27,516
    (no flag)                         full report
"""
import argparse, asyncio, os, sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

CHEQUE_ID = "chq_8e7e0aae"
CHEQUE_NO = "001684"
FACE = 200000.0
HISTORICAL_USED = 172484.0
EXPECTED_AVAILABLE = 27516.0


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--assert", dest="a", default=None, choices=[
        "no-existing-allocations", "no-seeded-suspense", "projected-27516"])
    args = ap.parse_args()

    mongo_url, db_name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("  ABORT: MONGO_URL/DB_NAME missing"); return 1
    cli = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
    db = cli[db_name]
    import routes.financial as F
    F.db = db  # bind the shared helper to this loop's client
    try:
        cq = await db.cheques.find_one({"cheque_id": CHEQUE_ID}, {"_id": 0})
        if not cq:
            print(f"  ABORT: cheque {CHEQUE_ID} not found"); return 1

        allocs = await db.cheque_allocations.find({"cheque_id": CHEQUE_ID}, {"_id": 0}).to_list(200)
        active = [a for a in allocs if a.get("status") == "active"]
        alloc_total = round(sum(float(a.get("amount") or 0) for a in active), 2)
        susp = await db.suspense_entries.find(
            {"linked_cheque_ids": CHEQUE_ID}, {"_id": 0, "entry_id": 1, "amount": 1}).to_list(200)
        susp_credit = round(sum(float(s.get("amount") or 0) for s in susp if float(s.get("amount") or 0) > 0), 2)
        current_available = (await F.cheque_available_map([cq]))[CHEQUE_ID]
        projected = round(max(0.0, float(cq.get("amount") or 0) - (alloc_total + HISTORICAL_USED) - susp_credit), 2)

        print(f"=== Cheque #{CHEQUE_NO} ({CHEQUE_ID}) — READ-ONLY DRY RUN ===")
        print(f"  face value (stored)        : {float(cq.get('amount') or 0):,.2f}")
        print(f"  used_for_expense_id        : {cq.get('used_for_expense_id')!r}")
        print(f"  status / is_opened         : {cq.get('status')!r} / {cq.get('is_opened')!r}")
        print(f"  existing allocation rows   : {len(allocs)} (active {len(active)}, total {alloc_total:,.2f})")
        for a in allocs:
            print(f"      - {a.get('allocation_id')} {a.get('status')} {float(a.get('amount') or 0):,.2f} exp={a.get('expense_id')}")
        print(f"  suspense rows linked       : {len(susp)} (positive credit {susp_credit:,.2f})")
        for s in susp:
            print(f"      - {s.get('entry_id')} {float(s.get('amount') or 0):,.2f}")
        print(f"  CURRENT available          : {current_available:,.2f}")
        print(f"  PROPOSED opening allocation: {HISTORICAL_USED:,.2f}  (historical usage, status=active)")
        print(f"  PROJECTED available        : {projected:,.2f}   (target {EXPECTED_AVAILABLE:,.2f})")
        print(f"  then USB-MR034 pays 17,516 : {projected - 17516:,.2f}   (target 10,000.00)")
        print("  NOTHING WAS WRITTEN.")

        if args.a == "no-existing-allocations":
            ok = len(allocs) == 0
            print(f"  assert no-existing-allocations: {'PASS' if ok else 'FAIL'} ({len(allocs)} rows)")
            return 0 if ok else 1
        if args.a == "no-seeded-suspense":
            ok = susp_credit <= 0.5
            print(f"  assert no-seeded-suspense: {'PASS' if ok else 'FAIL'} ({susp_credit:,.2f})")
            return 0 if ok else 1
        if args.a == "projected-27516":
            ok = abs(projected - EXPECTED_AVAILABLE) <= 0.5
            print(f"  assert projected-27516: {'PASS' if ok else 'FAIL'} ({projected:,.2f})")
            return 0 if ok else 1
        return 0
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
