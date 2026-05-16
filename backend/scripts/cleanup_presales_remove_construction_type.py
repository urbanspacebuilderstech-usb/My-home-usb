"""One-time DB tweaks for Pre-Sales custom fields:
  1. Remove the 'Construction Type' field entirely.
  2. Move the 'Requirements' textarea to the bottom of the form
     (assign it the largest 'order' value so it renders last).
Idempotent: safe to re-run.
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
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1) Remove all "Construction Type" custom fields (match by label, case-insensitive)
    ct_fields = await db.custom_fields.find(
        {"label": {"$regex": r"^\s*construction\s+type\s*$", "$options": "i"}},
        {"_id": 0, "field_id": 1, "label": 1},
    ).to_list(100)
    ct_ids = [f["field_id"] for f in ct_fields]
    if ct_ids:
        res = await db.custom_fields.delete_many({"field_id": {"$in": ct_ids}})
        print(f"Deleted Construction Type custom fields: {res.deleted_count} ({ct_ids})")
        # Strip from leads' custom_fields dicts
        for cf_id in ct_ids:
            await db.leads.update_many(
                {f"custom_fields.{cf_id}": {"$exists": True}},
                {"$unset": {f"custom_fields.{cf_id}": ""}},
            )
    else:
        print("No Construction Type fields found (already cleaned up).")

    # 2) Move 'Requirements' (textarea) to the bottom — assign order = max + 10
    max_order_field = await db.custom_fields.find_one(
        {"is_active": True}, sort=[("order", -1)]
    )
    max_order = (max_order_field or {}).get("order", 0) or 0
    new_order = int(max_order) + 10

    upd = await db.custom_fields.update_many(
        {"label": {"$regex": r"^\s*requirements?\s*$", "$options": "i"}},
        {"$set": {"order": new_order}},
    )
    print(f"Moved 'Requirements' field to order={new_order}: {upd.modified_count} doc(s) updated")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
