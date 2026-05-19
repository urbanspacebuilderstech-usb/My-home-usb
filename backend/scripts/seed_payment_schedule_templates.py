"""Seed default Payment Schedule templates.

Template 1 — "Standard - Independent House (50 rows)" — Mirrors the schedule
visible in the production screenshot the user attached. Total = 100%.

Idempotent: safe to re-run.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


TEMPLATE_1_ROWS = [
    {"stage_name": "Payment Schedule ONE",  "percentage": 2,  "notes": ""},
    {"stage_name": "Payment Schedule TWO",  "percentage": 2,  "notes": ""},
    {"stage_name": "Payment Schedule THREE", "percentage": 2, "notes": ""},
    {"stage_name": "Stage 01 Payment", "percentage": 2, "notes": ""},
    {"stage_name": "Advance payment for Foundation, Plinth Beam and upto Basement", "percentage": 20, "notes": ""},
    {"stage_name": "Completion of Foundation", "percentage": 8, "notes": ""},
    {"stage_name": "Completion of Plinth Beam & filling work", "percentage": 8, "notes": ""},
    {"stage_name": "Completion of Ground Floor Roof Slab", "percentage": 12, "notes": ""},
    {"stage_name": "Completion of Brick work — Ground Floor", "percentage": 6, "notes": ""},
    {"stage_name": "Completion of First Floor Roof Slab", "percentage": 12, "notes": ""},
    {"stage_name": "Completion of Brick work — First Floor", "percentage": 6, "notes": ""},
    {"stage_name": "Completion of Plastering", "percentage": 6, "notes": ""},
    {"stage_name": "Completion of Electrical & Plumbing rough-in", "percentage": 4, "notes": ""},
    {"stage_name": "Completion of Flooring", "percentage": 4, "notes": ""},
    {"stage_name": "Completion of Painting (Primer + 1st coat)", "percentage": 3, "notes": ""},
    {"stage_name": "Final Handover (Snag-list & Painting)", "percentage": 3, "notes": ""},
]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    now = datetime.now(timezone.utc).isoformat()
    name = "Standard - Independent House"
    existing = await db.payment_schedule_templates.find_one({"template_name": name})
    if existing:
        # Update rows in case the canonical list changed
        await db.payment_schedule_templates.update_one(
            {"template_id": existing["template_id"]},
            {"$set": {"rows": TEMPLATE_1_ROWS, "updated_at": now}},
        )
        print(f"Updated existing template '{name}' ({existing['template_id']})")
    else:
        doc = {
            "template_id": f"pst_{uuid.uuid4().hex[:10]}",
            "template_name": name,
            "description": "Default schedule for independent G+1/G+2 houses",
            "rows": TEMPLATE_1_ROWS,
            "created_by": "system",
            "created_at": now,
            "updated_at": now,
        }
        await db.payment_schedule_templates.insert_one(doc)
        print(f"Created template '{name}' ({doc['template_id']}) with {len(TEMPLATE_1_ROWS)} rows")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
