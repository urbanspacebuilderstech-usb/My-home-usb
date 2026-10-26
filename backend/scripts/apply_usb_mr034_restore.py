"""Oct 26 2026 — one-off: run /admin/usb-mr034-restore-apply on the server.

SATHISKUMAR AGENCY's "#001684" chip reads 21,378 where the Expense list gives
3,862: the USB-MR034 restore credit se_2499341b08 hands its 17,516 back a
second time (see the Oct 26 block in routes/financial.py). The live dry run
came back with no problems, steps remove_restore + send_back, suspense
60,730 -> 43,214.

This calls the endpoint's own function, so every check it makes runs again
here and a surprise refuses with nothing written. It stops at once if the
repair's audit entry already exists, so the deploy step that runs it can stay
until it is removed without ever acting twice - even after USB-MR034 is paid
again, which the endpoint would read as a different state.

    (no flag)  dry run — prints the plan, no writes
    --apply    apply, then print the state after
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
from fastapi import HTTPException  # noqa: E402
from core.database import client, db  # noqa: E402
from core.models import User, UserRole  # noqa: E402
import routes.financial as F  # noqa: E402

SYSTEM_USER = User(user_id="system_repair", email="repair@example.com", name="System Repair",
                   role=UserRole.SUPER_ADMIN, created_at=datetime.now(timezone.utc))


def show(obj):
    print(json.dumps(obj, indent=2, default=str, ensure_ascii=False))


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    print("=== USB-MR034 duplicate 17,516 restore ===")

    done = await db.audit_logs.find_one({"action": "usb_mr034_restore_removed"}, {"_id": 0})
    if done:
        print(f"  Already applied on {done.get('timestamp')} by {done.get('user_id')}. Nothing to do.")
        return 0

    if not a.apply:
        show(await F.usb_mr034_restore_dryrun(user=SYSTEM_USER))
        print("\n  DRY RUN — nothing written. Re-run with --apply to perform this.")
        return 0

    try:
        res = await F.usb_mr034_restore_apply(user=SYSTEM_USER)
    except HTTPException as e:
        print(f"  REFUSED ({e.status_code}): {e.detail}")
        return 1
    show(res)
    after = res["after"]
    ok = not after["restore_exists"] and after["bill_status"] == "pending_accounts_approval"
    print("\n  APPLIED AND VERIFIED" if ok else "\n  VERIFY FAILED — review above")
    return 0 if ok else 1


# Motor bound its loop when core.database was imported, so run on that loop.
raise SystemExit(client.get_io_loop().run_until_complete(main()))
