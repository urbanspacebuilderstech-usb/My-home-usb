"""
One-time DB heal: Reconcile Mr. Achyuth's project Stage-2 math gap.

Problem (Feb 2026):
  Stage-2's stored `total_value` exceeds the 20% slice of the project's
  `total_value` by ~₹24,775. Per user decision: bump the **project total
  value UP** by the gap so the 20% slice matches Stage-2's amount.

Strategy (idempotent):
  1. Find the Achyuth project by client_name regex (case-insensitive).
  2. Locate Stage-2 in `payment_stages` (by `stage_label == "2"` or
     `stage_index == 2` or by `name` containing "Stage 2"/the order).
  3. Compute   gap = stage2.total_value - 0.20 * project.total_value
     If gap > ₹1 and gap < ₹1,00,000, patch:
       project.total_value += gap
     and log before/after for audit.
  4. If gap <= ₹1 → already aligned, exit clean.

Run on VPS:
  python -m backend.scripts.fix_achyuth_stage2_math_gap
"""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")


async def main() -> None:
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]

    # 1. Find Achyuth project
    proj = await db.projects.find_one(
        {"client_name": {"$regex": "achyuth", "$options": "i"}},
        {"_id": 0},
    )
    if not proj:
        print("ERROR: No project found for client_name ~= 'achyuth'")
        cli.close()
        return

    project_id = proj["project_id"]
    project_name = proj.get("name") or proj.get("project_name") or "Unknown"
    proj_total = float(proj.get("total_value") or 0)
    print(f"Project: {project_name} ({project_id})")
    print(f"  current total_value = ₹{proj_total:,.2f}")

    # 2. Find Stage-2 — prefer stage_label, fall back to stage_index/order
    stage2 = None
    for query in (
        {"project_id": project_id, "stage_label": "2"},
        {"project_id": project_id, "stage_index": 2},
        {"project_id": project_id, "order": 2},
    ):
        stage2 = await db.payment_stages.find_one(query, {"_id": 0})
        if stage2:
            print(f"  Stage-2 matched via query: {query}")
            break

    if not stage2:
        # Last resort: list all stages so we can debug
        all_stages = await db.payment_stages.find(
            {"project_id": project_id}, {"_id": 0}
        ).to_list(50)
        print("  Could not auto-locate Stage-2. All stages on this project:")
        for s in all_stages:
            print(
                f"    id={s.get('stage_id')} label={s.get('stage_label')} "
                f"idx={s.get('stage_index')} order={s.get('order')} "
                f"name={s.get('name')} total={s.get('total_value')}"
            )
        cli.close()
        return

    stage2_total = float(stage2.get("total_value") or 0)
    expected_share = 0.20 * proj_total
    gap = stage2_total - expected_share
    print(f"  Stage-2 total_value = ₹{stage2_total:,.2f}")
    print(f"  Expected 20% slice  = ₹{expected_share:,.2f}")
    print(f"  Gap (stage2 - 20%)  = ₹{gap:,.2f}")

    if gap <= 1:
        print("  No fix required — gap already <= ₹1.")
        cli.close()
        return
    if gap > 1_00_000:
        print(
            "  ABORT: gap > ₹1,00,000 — refusing to auto-patch a large diff."
            " Investigate manually."
        )
        cli.close()
        return

    # 3. Per user choice (b): bump project total_value UP by `gap`
    new_total = proj_total + gap
    res = await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"total_value": new_total}},
    )
    print(
        f"  Patched projects.total_value: ₹{proj_total:,.2f} → ₹{new_total:,.2f} "
        f"(modified={res.modified_count})"
    )

    # 4. Re-verify
    fresh = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    new_share = 0.20 * float(fresh.get("total_value") or 0)
    new_gap = stage2_total - new_share
    print(f"  Verify: stage2 ₹{stage2_total:,.2f} − new 20% ₹{new_share:,.2f} = ₹{new_gap:,.2f}")
    if abs(new_gap) <= 1:
        print("  SUCCESS: Stage-2 and project total now aligned.")
    else:
        print("  WARN: residual gap remains — recheck rounding logic.")

    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
