"""One-time DB tweaks for Pre-Sales custom fields:
  1. Remove the duplicate 'Residence Type' field (cf_25063b20)
     — Construction Type already covers this.
  2. Convert 'Square Feet' (cf_sqft) from number-only to text so users
     can enter values like "1200 sqft" or "30 x 40".
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

    # 1) Remove the Residence Type custom field
    res = await db.custom_fields.delete_many({"label": "Residence Type"})
    print(f"Deleted Residence Type custom fields: {res.deleted_count}")
    # Also strip it from existing leads' custom_fields dict (best-effort cleanup)
    await db.leads.update_many(
        {"custom_fields.cf_25063b20": {"$exists": True}},
        {"$unset": {"custom_fields.cf_25063b20": ""}},
    )

    # 2) Convert Square Feet to free-text
    upd = await db.custom_fields.update_many(
        {"field_id": "cf_sqft"},
        {"$set": {"field_type": "text"}},
    )
    print(f"Updated cf_sqft field_type → text: {upd.modified_count}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
