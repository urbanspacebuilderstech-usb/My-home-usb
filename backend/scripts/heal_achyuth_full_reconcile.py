"""
One-time DB heal: Mr Achyuth proper accounting reconciliation (option `a`).

Current state (broken):
  Stage 01 (₹93,202 milestone):
    - inc_b2ce0b55e502 (₹93,202, cheque slice from bulk col_08a9d6710e)
  Stage 02 (₹932,023 milestone, but stored as ₹956,798):
    - inc_7e7842c2c6e8 (₹306,798, cheque slice from bulk)
    - inc_0c7b240f2bb2 (₹450,000, current_account)
    - inc_1b652394135b (₹200,000, current_account)
  ORPHAN advance (pointing to deleted virtual stage ps_ce2f0ed5c4b7):
    - inc_45852eaaf10b (₹50,000, savings_account → Sales token advance)

Target (per user rule "token advance stays in Stage 01, no cascade out"):
  Stage 01 (₹93,202): received = ₹50,000 (advance) + ₹43,202 (cheque slice) = ₹93,202 ✓
  Stage 02 (₹932,023): received = ₹356,798 + ₹450,000 + ₹125,225 = ₹932,023 ✓
  Stage 03 (₹932,023, was 0/0): receives ₹74,775 partial pre-credit (from cheque excess)
  Total Income = ₹1,100,000 (now incl. ₹50K advance)

Transformations (each step idempotent — checks current value):
  1. Stage 02 milestone amount: ₹956,798 → ₹932,023
  2. Re-link advance income (inc_45852eaaf10b) to Stage 01 (ps_13dcd9e3f9c7)
     and stamp Stage 01's linked_income_id.
  3. Shrink inc_b2ce0b55e502 (Stage 01 cheque slice): ₹93,202 → ₹43,202
  4. Bump inc_7e7842c2c6e8 (Stage 02 cheque slice): ₹306,798 → ₹356,798
  5. Shrink inc_1b652394135b (Stage 02 current_account): ₹200,000 → ₹125,225
  6. Create NEW income for Stage 03 partial credit: ₹74,775 (sourced from
     the same current_account payment date — clones inc_1b652394135b metadata).
  7. Recompute payment_stages.amount_received and status for Stage 01/02/03.
"""
import asyncio
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

PROJECT_ID = "proj_2565adc810ae"
STAGE_01_ID = "ps_13dcd9e3f9c7"
STAGE_02_ID = "ps_41c15e654adf"
STAGE_03_ID = "ps_bef55bcd6329"

ADVANCE_INC_ID = "inc_45852eaaf10b"        # ₹50K savings → Stage 01
STAGE1_CHQ_INC_ID = "inc_b2ce0b55e502"     # ₹93,202 cheque slice → currently Stage 01
STAGE2_CHQ_INC_ID = "inc_7e7842c2c6e8"     # ₹306,798 cheque slice → Stage 02
STAGE2_CA_INC_ID = "inc_1b652394135b"      # ₹200,000 current_account → Stage 02 (will be shrunk)


async def main() -> None:
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]
    now_iso = datetime.now(timezone.utc).isoformat()

    print("=" * 70)
    print("Mr Achyuth — Stage 01/02 reconciliation (option a)")
    print("=" * 70)

    # 1. Stage 02 milestone correction (₹956,798 → ₹932,023)
    s2 = await db.payment_stages.find_one({"stage_id": STAGE_02_ID}, {"_id": 0})
    if not s2:
        print(f"ERROR: Stage 02 {STAGE_02_ID} missing")
        cli.close()
        return
    if float(s2.get("amount") or 0) == 956798.0:
        await db.payment_stages.update_one(
            {"stage_id": STAGE_02_ID, "amount": 956798.0},
            {"$set": {"amount": 932023.0}},
        )
        print("  [1] Stage 02 amount: ₹956,798 → ₹932,023")
    else:
        print(f"  [1] Stage 02 amount already = ₹{s2.get('amount'):,.0f} (skip)")

    # 2. Re-link advance income to Stage 01
    adv = await db.income.find_one({"income_id": ADVANCE_INC_ID}, {"_id": 0, "payment_stage_id": 1})
    if adv and adv.get("payment_stage_id") != STAGE_01_ID:
        await db.income.update_one(
            {"income_id": ADVANCE_INC_ID},
            {"$set": {"payment_stage_id": STAGE_01_ID}},
        )
        print(f"  [2] Advance income re-linked: → Stage 01 ({STAGE_01_ID})")
    else:
        print("  [2] Advance already linked to Stage 01 (skip)")

    # Stamp Stage 01's linked_income_id
    s1 = await db.payment_stages.find_one({"stage_id": STAGE_01_ID}, {"_id": 0})
    if s1 and s1.get("linked_income_id") != ADVANCE_INC_ID:
        await db.payment_stages.update_one(
            {"stage_id": STAGE_01_ID},
            {"$set": {"linked_income_id": ADVANCE_INC_ID, "is_advance": True}},
        )
        print(f"  [2b] Stage 01 linked_income_id = {ADVANCE_INC_ID}")

    # 3. Shrink Stage 01 cheque slice income: 93,202 → 43,202
    s1c = await db.income.find_one({"income_id": STAGE1_CHQ_INC_ID}, {"_id": 0, "amount": 1})
    if s1c and float(s1c.get("amount") or 0) == 93202.0:
        await db.income.update_one(
            {"income_id": STAGE1_CHQ_INC_ID, "amount": 93202.0},
            {"$set": {"amount": 43202.0, "reconciled_at": now_iso,
                      "reconciliation_note": "Split from bulk col_08a9d6710e: ₹43,202 to S1 balance after ₹50K token advance; ₹50,000 moved to Stage 02 (see inc_7e7842c2c6e8)."}},
        )
        print("  [3] inc_b2ce0b55e502 amount: ₹93,202 → ₹43,202")
    else:
        print(f"  [3] Stage 01 cheque slice already = ₹{(s1c or {}).get('amount'):,.0f} (skip)")

    # 4. Bump Stage 02 cheque slice income: 306,798 → 356,798
    s2c = await db.income.find_one({"income_id": STAGE2_CHQ_INC_ID}, {"_id": 0, "amount": 1})
    if s2c and float(s2c.get("amount") or 0) == 306798.0:
        await db.income.update_one(
            {"income_id": STAGE2_CHQ_INC_ID, "amount": 306798.0},
            {"$set": {"amount": 356798.0, "reconciled_at": now_iso,
                      "reconciliation_note": "Absorbed ₹50K from Stage 01 cheque slice (re-allocated by accounting heal)."}},
        )
        print("  [4] inc_7e7842c2c6e8 amount: ₹306,798 → ₹356,798")
    else:
        print(f"  [4] Stage 02 cheque slice already = ₹{(s2c or {}).get('amount'):,.0f} (skip)")

    # 5. Shrink Stage 02 last current_account income: 200,000 → 125,225
    s2ca = await db.income.find_one({"income_id": STAGE2_CA_INC_ID}, {"_id": 0, "amount": 1, "payment_date": 1,
                                                                      "payment_mode": 1, "payment_reference": 1,
                                                                      "project_id": 1, "project_name": 1,
                                                                      "collected_by": 1, "collected_by_name": 1,
                                                                      "approved_by": 1, "approved_at": 1,
                                                                      "category": 1, "sub_category": 1,
                                                                      "description": 1})
    if s2ca and float(s2ca.get("amount") or 0) == 200000.0:
        await db.income.update_one(
            {"income_id": STAGE2_CA_INC_ID, "amount": 200000.0},
            {"$set": {"amount": 125225.0, "reconciled_at": now_iso,
                      "reconciliation_note": "Split: ₹125,225 keeps Stage 02 milestone clean; ₹74,775 moved to Stage 03 pre-credit (see new inc_*)."}},
        )
        print("  [5] inc_1b652394135b amount: ₹200,000 → ₹125,225")

        # 6. Create new income for Stage 03 partial: ₹74,775
        new_inc_id = f"inc_{secrets.token_hex(6)}"
        new_inc = {
            "income_id": new_inc_id,
            "project_id": s2ca.get("project_id"),
            "project_name": s2ca.get("project_name"),
            "category": "payment_collection",
            "sub_category": "Stage 03 partial pre-credit (from reconciliation)",
            "amount": 74775.0,
            "payment_mode": s2ca.get("payment_mode") or "current_account",
            "payment_reference": s2ca.get("payment_reference") or "",
            "payment_date": s2ca.get("payment_date"),
            "stage": "3",
            "description": "Reconciliation pre-credit: ₹74,775 from over-allocated Stage 02 collection re-attributed to Stage 03.",
            "remarks": "Auto-created by Mr Achyuth heal script — option (a).",
            "collected_by": s2ca.get("collected_by"),
            "collected_by_name": s2ca.get("collected_by_name"),
            "status": "approved",
            "source": "approval",
            "payment_stage_id": STAGE_03_ID,
            "approved_at": s2ca.get("approved_at") or now_iso,
            "approved_by": s2ca.get("approved_by"),
            "created_at": now_iso,
            "reconciled_at": now_iso,
            "reconciliation_note": "Split-off from inc_1b652394135b to balance Stage 02 milestone.",
        }
        await db.income.insert_one(new_inc)
        print(f"  [6] Created new income {new_inc_id} for Stage 03 = ₹74,775 (partial)")
    else:
        print("  [5] Stage 02 last income already adjusted (skip steps 5-6)")

    # 7. Recompute payment_stages amount_received & status for S1/S2/S3
    print()
    print("  Recomputing stage rollups…")
    EXCLUDED = {"rejected", "accountant_rejected", "under_correction", "pending_approval", "cheque_bounced"}
    for sid in [STAGE_01_ID, STAGE_02_ID, STAGE_03_ID]:
        stage = await db.payment_stages.find_one({"stage_id": sid}, {"_id": 0})
        if not stage:
            print(f"    {sid}: missing — skip")
            continue
        agg = db.income.find({"payment_stage_id": sid}, {"_id": 0, "amount": 1, "status": 1})
        total_recv = 0.0
        async for e in agg:
            if (e.get("status") or "approved") in EXCLUDED:
                continue
            total_recv += float(e.get("amount") or 0)
        amt = float(stage.get("amount") or 0)
        if amt > 0 and abs(total_recv - amt) < 0.5:
            new_status = "paid"
        elif total_recv > 0.5:
            new_status = "partial" if total_recv < (amt - 0.5) else "paid"
        else:
            new_status = "pending"
        set_doc = {"amount_received": round(total_recv, 2), "status": new_status}
        if new_status == "paid":
            set_doc["paid_at"] = stage.get("paid_at") or now_iso
        await db.payment_stages.update_one({"stage_id": sid}, {"$set": set_doc})
        label = stage.get("stage_label") or "?"
        print(f"    Stage {label} ({sid}): amount=₹{amt:,.0f}, received=₹{total_recv:,.0f}, status={new_status}")

    # 8. Final summary
    print()
    print("=" * 70)
    print("VERIFICATION")
    print("=" * 70)
    all_stages = await db.payment_stages.find(
        {"project_id": PROJECT_ID, "stage_label": {"$nin": [None, ""]}},
        {"_id": 0},
    ).to_list(50)
    all_stages.sort(key=lambda s: int(s.get("stage_label") or 0))
    sum_amt = 0
    sum_recv = 0
    for s in all_stages:
        amt = float(s.get("amount") or 0)
        recv = float(s.get("amount_received") or 0)
        sum_amt += amt
        sum_recv += recv
        print(f"  Stage {s['stage_label']} | {s.get('percentage')}% | amount=₹{amt:>11,.0f} | received=₹{recv:>11,.0f} | status={s.get('status')}")
    print(f"  TOTAL                | amount=₹{sum_amt:>11,.0f} | received=₹{sum_recv:>11,.0f}")
    p = await db.projects.find_one({"project_id": PROJECT_ID}, {"_id": 0, "total_value": 1})
    print(f"  Project total_value  = ₹{p.get('total_value'):,.2f}")
    diff = sum_amt - float(p.get("total_value") or 0)
    print(f"  Amount vs Total diff = ₹{diff:,.2f} " + ("✓ aligned" if abs(diff) < 1 else "❌ mismatch"))

    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
