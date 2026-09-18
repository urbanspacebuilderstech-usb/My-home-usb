"""Sep 18 2026 — bulk backfill: cheque-excess -> vendor suspense for EVERY
already-used cheque with unallocated leftover balance.

Generalizes the one-off Anbu test Vendor / Cheque #1234 fix
(backfill_anbu_test_vendor_cheque_excess.py) to every cheque in the system,
now that the excess-to-suspense flow is restored as the default (see
PayApprovalDialog.jsx / financial.py — already deployed).

For each cheque where cheque_available_map() reports a leftover > 0.5 (the
exact same helper the live payment flow uses, so "available" here always
matches what Cheque Management shows) AND that has at least one linked
recorded_expenses swipe (cheque_id/cheque_ids match) — i.e. it was actually
used for a real vendor payment at least once; an untouched cheque's balance
is normal and is left alone:

  - Every swipe on that cheque names the SAME vendor -> credit that
    vendor's material suspense with the leftover, and record a matching
    cheque_allocations row so the cheque's available balance becomes 0.
    This mirrors exactly what the one-off #1234 fix did.
  - Swipes span MORE THAN ONE vendor (the cheque was split across
    different vendors during the Aug 18 - Sep 18 window, when partial
    draws were allowed) -> the leftover is attributed to whichever
    vendor's swipe is most recent, and the row is printed under
    "MULTI-VENDOR (attributed to most recent)" so it is visible rather
    than silently decided. Nothing is skipped, but this case is called
    out plainly.
  - A cheque already fully allocated/seeded (available <= 0.5), one with
    zero swipes, or one already covered by an entry carrying this
    script's own restore_tag is left untouched.

Every write is per-cheque and independently guarded by a restore_tag keyed
on that cheque's id, so a re-run (e.g. every future deploy, matching this
repo's convention for one-off repairs) can never double-credit — and a
cheque that legitimately still has money left because it simply hasn't
been fully spent yet is correctly identified by cheque_available_map()
the same way the rest of the app already sees it.

    (no flag)  dry run — lists every affected cheque + planned action,
               no writes
    --apply    perform it for every row listed, then verify each one
"""
import argparse, asyncio, os, sys, uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

RESTORE_TAG_PREFIX = "backfill_all_cheque_excess:"


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
        print("=== Bulk cheque-excess -> vendor suspense backfill ===")

        all_cheques = await db.cheques.find(
            {"status": {"$nin": ["deleted", "disabled", "cancelled"]}}, {"_id": 0}
        ).to_list(20000)
        avail_map = await F.cheque_available_map(all_cheques)

        candidates = [c for c in all_cheques if avail_map.get(c["cheque_id"], 0.0) > 0.5]
        print(f"  cheques scanned            : {len(all_cheques)}")
        print(f"  cheques with leftover > 0  : {len(candidates)}")

        plan = []
        skipped_untouched = 0
        skipped_already_done = 0
        for cq in candidates:
            cid = cq["cheque_id"]
            restore_tag = f"{RESTORE_TAG_PREFIX}{cid}"
            prior = await db.suspense_entries.find_one({"restore_tag": restore_tag}, {"_id": 0})
            if prior:
                skipped_already_done += 1
                continue

            swipes = await db.recorded_expenses.find(
                {"$or": [{"cheque_id": cid}, {"cheque_ids": cid}]},
                {"_id": 0, "expense_id": 1, "request_id": 1, "vendor_name": 1, "created_at": 1},
            ).sort("created_at", 1).to_list(200)
            swipes = [s for s in swipes if s.get("vendor_name")]
            if not swipes:
                skipped_untouched += 1
                continue

            vendors = sorted({s["vendor_name"] for s in swipes})
            excess = round(avail_map[cid], 2)
            if len(vendors) == 1:
                target_vendor = vendors[0]
                multi = False
            else:
                target_vendor = swipes[-1]["vendor_name"]  # most recent swipe
                multi = True

            latest_swipe = swipes[-1]
            plan.append({
                "cheque_id": cid,
                "cheque_number": cq.get("cheque_number"),
                "face": float(cq.get("amount") or 0),
                "excess": excess,
                "vendors": vendors,
                "target_vendor": target_vendor,
                "multi": multi,
                "expense_id": latest_swipe.get("expense_id"),
                "request_id": latest_swipe.get("request_id"),
                "restore_tag": restore_tag,
            })

        print(f"  already backfilled (skip)  : {skipped_already_done}")
        print(f"  untouched, no swipes (skip): {skipped_untouched}")
        print(f"  to process                 : {len(plan)}")
        print()

        for row in plan:
            tag = "MULTI-VENDOR (attributed to most recent)" if row["multi"] else "single vendor"
            print(f"  cheque #{row['cheque_number']} ({row['cheque_id']}) face={row['face']:,.2f} "
                  f"excess={row['excess']:,.2f} -> {row['target_vendor']}  [{tag}]")
            if row["multi"]:
                print(f"      all vendors on this cheque: {', '.join(row['vendors'])}")

        if not a.apply:
            print("\n  DRY RUN — nothing written.")
            return 0

        now = datetime.now(timezone.utc).isoformat()
        failures = []
        for row in plan:
            await db.cheque_allocations.insert_one({
                "allocation_id": f"cha_{uuid.uuid4().hex[:10]}",
                "cheque_id": row["cheque_id"], "cheque_number": row["cheque_number"],
                "expense_id": row["expense_id"], "request_id": row["request_id"],
                "request_type": "historical_opening", "amount": row["excess"], "status": "active",
                "source": "historical_opening",
                "note": f"Bulk backfill — leftover on this cheque routed to {row['target_vendor']}'s "
                        f"suspense after the excess-to-suspense flow was restored.",
                "created_at": now,
            })
            await db.suspense_entries.insert_one({
                "entry_id": f"se_{uuid.uuid4().hex[:10]}",
                "type": "material", "vendor_name": row["target_vendor"], "amount": row["excess"],
                "description": f"Excess from cheque #{row['cheque_number']} — bulk backfilled after "
                                f"the excess-to-suspense flow was restored"
                                + (f" (cheque was split across multiple vendors: {', '.join(row['vendors'])}; "
                                   f"attributed to the most recently paid one)" if row["multi"] else ""),
                "payment_mode": "cheque",
                "linked_expense_id": row["expense_id"],
                "linked_request_id": row["request_id"],
                "linked_cheque_ids": [row["cheque_id"]],
                "restore_tag": row["restore_tag"],
                "created_at": now,
            })

        # Verify every row
        print("\n  --- verification ---")
        for row in plan:
            cq2 = await db.cheques.find_one({"cheque_id": row["cheque_id"]}, {"_id": 0})
            avail_after = (await F.cheque_available_map([cq2]))[row["cheque_id"]]
            pool_after = await pool_balance(db, row["target_vendor"])
            ok = abs(avail_after) <= 0.5
            if not ok:
                failures.append(row["cheque_id"])
            print(f"  #{row['cheque_number']}: available_after={avail_after:,.2f} (target 0)  "
                  f"{row['target_vendor']} pool_after={pool_after:,.2f}  "
                  + ("OK" if ok else "VERIFY FAILED"))

        print(f"\n  processed={len(plan)} failed={len(failures)}")
        print("  APPLIED AND VERIFIED" if not failures else "  SOME ROWS FAILED VERIFICATION — review above")
        return 0 if not failures else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
