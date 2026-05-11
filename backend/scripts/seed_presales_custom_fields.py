"""Idempotent seed for Pre-Sales custom fields.

Adds the 9 questions requested for the Pre-Sales lead form. Safe to re-run —
skips any field whose `name` is already present in `db.custom_fields`.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Make backend imports work when run as a standalone script
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


PRESALES_FIELDS = [
    {
        "name": "plot_area",
        "label": "Plot Area",
        "field_type": "text",
        "placeholder": "e.g., 1200 sqft or 30 x 40 ft",
        "options": [],
    },
    {
        "name": "facing",
        "label": "Facing",
        "field_type": "dropdown",
        "placeholder": "Select facing direction",
        "options": [
            "East", "West", "North", "South",
            "North-East", "North-West", "South-East", "South-West",
        ],
    },
    {
        "name": "road_width",
        "label": "Road Width",
        "field_type": "text",
        "placeholder": "e.g., 30 ft / 9 m",
        "options": [],
    },
    {
        "name": "number_of_floors",
        "label": "Number of Floors",
        "field_type": "dropdown",
        "placeholder": "Select floors",
        "options": ["Ground", "G+1", "G+2", "G+3", "G+4", "G+5", "G+6 or more"],
    },
    {
        "name": "construction_type",
        "label": "Construction Type",
        "field_type": "dropdown",
        "placeholder": "Select construction type",
        "options": [
            "New Construction",
            "Renovation",
            "Extension / Addition",
            "Demolish & Rebuild",
            "Interior Only",
        ],
    },
    {
        "name": "residence_type",
        "label": "Residence Type",
        "field_type": "dropdown",
        "placeholder": "Select residence type",
        "options": [
            "Independent House",
            "Villa",
            "Apartment",
            "Duplex",
            "Triplex",
            "Row House",
            "Commercial",
        ],
    },
    {
        "name": "expected_timeline",
        "label": "Expected Timeline",
        "field_type": "dropdown",
        "placeholder": "When do you plan to start?",
        "options": [
            "Immediate (within 1 month)",
            "1-3 months",
            "3-6 months",
            "6-12 months",
            "1+ year",
            "Just exploring",
        ],
    },
    {
        "name": "project_location",
        "label": "Project Location",
        "field_type": "text",
        "placeholder": "City / Locality / Pincode",
        "options": [],
    },
    {
        "name": "hidden_notes",
        "label": "Hidden",
        "field_type": "textarea",
        "placeholder": "Internal / hidden notes (not shown to client)",
        "options": [],
    },
]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Find the highest existing `order` so the new fields append cleanly
    last = await db.custom_fields.find_one({}, sort=[("order", -1)])
    next_order = (last.get("order", 0) + 1) if last else 1

    inserted, skipped = 0, 0
    for spec in PRESALES_FIELDS:
        existing = await db.custom_fields.find_one(
            {"name": spec["name"], "is_active": {"$ne": False}}, {"_id": 0}
        )
        if existing:
            skipped += 1
            print(f"  · skip   {spec['name']} (already exists)")
            continue

        doc = {
            "field_id": f"cf_{uuid.uuid4().hex[:8]}",
            "name": spec["name"],
            "label": spec["label"],
            "field_type": spec["field_type"],
            "required": False,
            "options": spec["options"],
            "placeholder": spec["placeholder"],
            "default_value": None,
            "order": next_order,
            "is_conditional": False,
            "condition_field": None,
            "condition_value": None,
            "is_active": True,
            "created_by": "system_seed",
            "created_at": datetime.now(timezone.utc),
        }
        await db.custom_fields.insert_one(doc)
        inserted += 1
        next_order += 1
        print(f"  ✓ added  {spec['name']} ({spec['label']})")

    print(f"\nDone. Inserted={inserted}, Skipped={skipped}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
