"""Reopen labour RABs stranded by a cheque bounce that predates the fix.

ce011993 made the bounce handler reopen a labour RAB for the bounced leg, but
it only acts at bounce time. Any RAB whose cheque bounced BEFORE that shipped
is still stranded: the expense is correctly cheque_bounced and out of the
Cashbook, while the request stays status="approved" and reads as Released and
fully paid. The contractor is owed the money and nothing appears in any queue.

Stranded means ALL of:
  - a recorded_expenses row with status cheque_bounced, for a labour release
  - its WO payment_request still status "approved"
  - money still OUTSTANDING: bill less every live expense against it
  - never already reopened (no reopened_amount)

Outstanding is compared by AMOUNT, not by whether some replacement exists. A
RAB can bounce twice and be only partly re-paid - pr_c5108732 had 1,400 and
3,600 of a 5,000 bill both bounce, with only 1,400 coming back - which an
existence check calls settled while 3,600 is still owed.

Each one is reopened for the BOUNCED LEG ONLY, using the same
bounced_leg_amount() the live flow uses, so suspense / cash / bank legs that
settled part of a bill are never re-demanded. The bounced expense is left
untouched as audit history.

Generic: nothing about any project, contractor or amount is hardcoded.

    (no flag)  dry run - report every stranded RAB and what would change
    --apply    reopen them, then verify
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

LIVE_STATUS = ["approved", "accounts_approved", "super_admin_approved"]


async def find_stranded(db, bounced_leg_amount):
    bounced = await db.recorded_expenses.find(
        {"status": "cheque_bounced",
         "$or": [{"request_type": "labour_stage_payment"}, {"category": "labour"}]},
        {"_id": 0}).to_list(2000)

    out, seen = [], set()
    for e in bounced:
        req_id = e.get("request_id")
        if not req_id:
            continue
        wo = await db.project_work_orders.find_one(
            {"stages.payment_requests.request_id": req_id}, {"_id": 0})
        if not wo:
            continue
        pr = stage_name = None
        for stg in wo.get("stages", []) or []:
            for cand in stg.get("payment_requests", []) or []:
                if cand.get("request_id") == req_id:
                    pr, stage_name = cand, stg.get("name")
        if not pr or pr.get("status") != "approved" or pr.get("reopened_amount"):
            continue
        # Compare AMOUNTS, not mere existence. A RAB can bounce twice and be
        # only partly re-paid (pr_c5108732: 1,400 + 3,600 of a 5,000 bill both
        # bounced, only 1,400 came back), which an existence check reports as
        # settled while 3,600 is still owed. What is owed is the bill less
        # everything still live against it.
        live_rows = await db.recorded_expenses.find(
            {"request_id": req_id, "status": {"$in": LIVE_STATUS}},
            {"_id": 0, "expense_id": 1, "amount": 1}).to_list(50)
        live_total = round(sum(float(r.get("amount") or 0) for r in live_rows), 2)
        bill = float(pr.get("amount") or 0)
        outstanding = round(max(0.0, bill - live_total), 2)
        if outstanding <= 0.5:
            continue  # fully settled by live payments; nothing owed
        ch = await db.cheques.find_one(
            {"cheque_id": e.get("bounced_by_cheque_id")}, {"_id": 0}) or {}
        # One entry per REQUEST, not per bounced expense. A RAB that bounced
        # twice has two cheque_bounced rows; emitting both listed it twice and
        # double-counted the total, and reopening per-bounce would restore only
        # one leg's amount. What is owed is the outstanding figure, once.
        if req_id in seen:
            continue
        seen.add(req_id)
        amount = outstanding
        if amount <= 0.005:
            continue
        out.append({
            "wo_id": wo.get("work_order_id"), "project_id": wo.get("project_id"),
            "contractor": wo.get("contractor_name"), "rab": pr.get("rab_number"),
            "request_id": req_id, "stage": stage_name,
            "bill_amount": bill, "live_paid": live_total, "outstanding": outstanding,
            "prior_approved": float(pr.get("approved_amount") or pr.get("amount") or 0),
            "reopen_amount": amount,
            "expense_id": e.get("expense_id"),
            "cheque_number": ch.get("cheque_number"), "cheque_id": ch.get("cheque_id"),
            "bounced_at": e.get("bounced_at"), "reason": e.get("bounce_reason"),
        })
    return out


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    url, name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not url or not name:
        print("  ABORT: MONGO_URL/DB_NAME missing")
        return 1
    cli = AsyncIOMotorClient(url, serverSelectionTimeoutMS=10000)
    db = cli[name]
    import routes.financial as F
    F.db = db
    try:
        rows = await find_stranded(db, F.bounced_leg_amount)
        print("=== Labour RABs stranded by a cheque bounce ===")
        if not rows:
            print("  none found — nothing to do.")
            return 0
        total = round(sum(r["reopen_amount"] for r in rows), 2)
        for r in rows:
            print(f"  {r['rab'] or '?':8} {str(r['contractor'])[:18]:18} bill={r['bill_amount']:>10,.0f} "
                  f"live={r['live_paid']:>10,.0f} owed={r['outstanding']:>10,.0f} "
                  f"reopen={r['reopen_amount']:>12,.2f}  chq#{r['cheque_number']} "
                  f"bounced={str(r['bounced_at'])[:10]}  {r['request_id']}")
        print(f"  ---- {len(rows)} stranded, total to reopen {total:,.2f}")
        print("  Each: payment_request status approved -> planning_approved, "
              "reopened_amount set, released_at/by cleared. Bounced expense untouched.")

        if not args.apply:
            print("\n  DRY RUN — nothing written.")
            return 0

        now = datetime.now(timezone.utc).isoformat()
        done = 0
        for r in rows:
            pr_id = r["request_id"]
            wo = await db.project_work_orders.find_one(
                {"stages.payment_requests.request_id": pr_id}, {"_id": 0})
            target = None
            for stg in (wo or {}).get("stages", []) or []:
                for cand in stg.get("payment_requests", []) or []:
                    if cand.get("request_id") == pr_id:
                        target = cand
            if not target or target.get("status") != "approved" or target.get("reopened_amount"):
                print(f"  SKIP {pr_id} — state changed since the scan.")
                continue
            history = list(target.get("bounce_history") or [])
            history.append({
                "cheque_id": r["cheque_id"], "cheque_number": r["cheque_number"],
                "amount": r["reopen_amount"], "reason": r["reason"],
                "bounced_at": r["bounced_at"], "expense_id": r["expense_id"],
                "reopened_by": "backfill: bounce predates the reopen fix",
            })
            res = await db.project_work_orders.update_one(
                {"work_order_id": r["wo_id"], "stages.payment_requests.request_id": pr_id},
                {"$set": {
                    "stages.$[s].payment_requests.$[p].status": "planning_approved",
                    "stages.$[s].payment_requests.$[p].reopened_amount": r["reopen_amount"],
                    "stages.$[s].payment_requests.$[p].settled_before_bounce":
                        round(max(0.0, r["prior_approved"] - r["reopen_amount"]), 2),
                    "stages.$[s].payment_requests.$[p].bounce_history": history,
                    "stages.$[s].payment_requests.$[p].reopened_after_bounce_at": now,
                    "stages.$[s].payment_requests.$[p].released_at": None,
                    "stages.$[s].payment_requests.$[p].released_by": None,
                    "stages.$[s].payment_requests.$[p].accountant_approved_at": None,
                    "stages.$[s].payment_requests.$[p].approved_amount": 0,
                }},
                array_filters=[{"s.payment_requests.request_id": pr_id}, {"p.request_id": pr_id}],
            )
            if res.modified_count:
                done += 1

        remaining = await find_stranded(db, F.bounced_leg_amount)
        print(f"\n  reopened={done}  still stranded after={len(remaining)}")
        ok = len(remaining) == 0
        print("  APPLIED AND VERIFIED" if ok else "  VERIFY FAILED — some remain stranded")
        return 0 if ok else 1
    finally:
        cli.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
