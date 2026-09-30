"""Sep 30 2026 — one-off backfill: reverse material-vendor suspense + send
downstream bills back to Approvals for every ALREADY-bounced cheque that
predates the fix in financial.py::_reverse_cheque_material_suspense_and_bills.

Before that fix, bounce_cheque() had no idea a material vendor's SUSPENSE
credit (db.suspense_entries, type="material") could have come from a
cheque's excess — so a bounced cheque's excess-derived suspense credit,
and every downstream bill payment that drew from it, silently stayed live.
Motivating case: SS AGENCY / Cheque #041296 — bounced, but ₹53,300 of
vendor payments (Red brick - Wire cut brick / Red brick - Sulai) its
excess had funded stayed fully paid, and the vendor's suspense pool went
to -₹67,100 (real debits standing on a credit that was never real).

This scans every cheque with status="bounced" for a material suspense
credit (linked_cheque_ids contains that cheque_id) that hasn't already
been voided (no "cheque_bounce_reversal" entry pointing back at it), and
runs the SAME function the live bounce_cheque() now calls automatically —
so a bounced cheque going forward and a historical one backfilled here
can never disagree on the outcome.

Every write is an offsetting suspense_entries insert (never mutates an
existing one) plus the same material_expenses/material_requests/
recorded_expenses field updates the live path makes — safe to re-run
(the function's own idempotency skips anything already reversed).

    (no flag)  dry run — lists every affected cheque + the exact plan
               (credits voided, debits restored, bills reversed/partially
               reversed), no writes
    --apply    perform it for every row listed, then verify each one
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")


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
        print("=== Backfill: bounced-cheque material suspense + bill reversal ===")

        bounced_cheques = await db.cheques.find({"status": "bounced"}, {"_id": 0}).to_list(5000)
        print(f"  bounced cheques scanned    : {len(bounced_cheques)}")

        system_user = SimpleNamespace(user_id="system_backfill", name="System Backfill")
        now = datetime.now(timezone.utc).isoformat()

        candidates = []
        for cq in bounced_cheques:
            cid = cq["cheque_id"]
            credits = await db.suspense_entries.find(
                {"type": "material", "amount": {"$gt": 0.5}, "linked_cheque_ids": cid},
                {"_id": 0, "entry_id": 1},
            ).to_list(50)
            if not credits:
                continue
            already_voided_ids = {
                r.get("reversed_entry_id") async for r in db.suspense_entries.find(
                    {"source_type": "cheque_bounce_reversal", "cheque_id": cid}, {"_id": 0, "reversed_entry_id": 1},
                )
            }
            unhandled = [c for c in credits if c["entry_id"] not in already_voided_ids]
            if not unhandled:
                continue
            candidates.append(cq)

        print(f"  with un-reversed material suspense credit: {len(candidates)}")
        print()

        total_plan = []
        for cq in candidates:
            cheque_for_call = {
                **cq,
                "bounce_reason": cq.get("bounce_reason") or "",
            }
            plan = await F._reverse_cheque_material_suspense_and_bills(
                cheque_for_call, system_user, now, dry_run=not a.apply,
            )
            total_plan.append((cq, plan))
            print(f"  cheque #{cq.get('cheque_number')} ({cq['cheque_id']}) "
                  f"face={float(cq.get('amount') or 0):,.2f} bounced_at={cq.get('bounced_at', '')[:10]}")
            for c in plan.get("credits_voided", []):
                print(f"      void credit  {c['entry_id']}  {c['vendor_name']}  ₹{c['amount']:,.2f}")
            for d in plan.get("debits_restored", []):
                print(f"      restore debit {d['entry_id']}  {d['vendor_name']}  ₹{d['amount']:,.2f}")
            for b in plan.get("bills_reversed", []):
                print(f"      bill -> pending_accounts_approval: {b['expense_id']}  reduced ₹{b['reduced_by']:,.2f} (full bill ₹{b['bill_amount']:,.2f})")
            for b in plan.get("bills_partially_reversed", []):
                print(f"      bill -> partially_paid: {b['expense_id']}  reduced ₹{b['reduced_by']:,.2f}  new paid ₹{b['new_paid_amount']:,.2f}")
            for k in ("skipped_already_voided_credits", "skipped_already_restored_debits"):
                if plan.get(k):
                    print(f"      {k}: {plan[k]}")

        if not total_plan:
            print("  Nothing to do — no bounced cheque has an un-reversed material suspense credit.")
            return 0

        if not a.apply:
            print("\n  DRY RUN — nothing written. Re-run with --apply to perform this.")
            return 0

        # Verify: re-run in dry_run mode and confirm every credit/debit for
        # each touched cheque now shows up as already-skipped.
        print("\n  Verifying...")
        ok = True
        for cq, _ in total_plan:
            recheck = await F._reverse_cheque_material_suspense_and_bills(
                {**cq, "bounce_reason": cq.get("bounce_reason") or ""}, system_user, now, dry_run=True,
            )
            if recheck.get("credits_voided") or recheck.get("debits_restored"):
                print(f"  MISMATCH for cheque {cq['cheque_id']}: still finds unreversed entries after apply: {recheck}")
                ok = False
        print("  Verify: OK — every touched cheque's material suspense is now fully reversed." if ok else "  Verify: FAILED — see above.")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
