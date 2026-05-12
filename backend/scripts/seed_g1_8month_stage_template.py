"""Seed: 'G+1 / 8 Months — Independent House' project-stage template.

Built from Diwakar's overall schedule. Each section header (e.g. "Boomi pooja
and Project start date", "Foundation work", "Basement Work" …) is stored as a
non-task `is_section_header=True` row so the Planning Project Stages table can
render bold group titles. Actual stages carry a short `sl_no` code (PO1, FW1,
BW1, GF1, …) plus a day-offset start/end. Frontend converts those offsets to
real calendar dates once the project start date is set.

Idempotent: safe to re-run (upserts on `template_name`).
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

TEMPLATE_NAME = "G+1 - 8 Months (Independent House)"
TEMPLATE_DESCRIPTION = (
    "Standard 8-month G+1 independent house schedule covering pre-construction, "
    "foundation, ground floor, first floor, plastering, flooring, electrical, "
    "carpentry, painting and handover. Grouped into bold sections."
)

# Each entry: (section_title, code_prefix, [(stage_name, start_day, end_day), ...])
SECTIONS = [
    ("Boomi pooja and Project start date", "PO", [
        ("Soil test",                                0,  2),
        ("Architectural Design Finalization",        3,  6),
        ("Structural drawings",                      7, 13),
        ("Approvals & Permits",                     14, 21),
    ]),
    ("Foundation work", "FW", [
        ("Excavation",                              22, 24),
        ("PCC (Plain Cement Reinforcement)",        25, 26),
        ("Footing Reinforcement",                   27, 28),
        ("Footing Concrete",                        29, 30),
        ("Column upto Plinth beam",                 31, 34),
        ("Backfilling",                             35, 36),
    ]),
    ("Basement Work", "BW", [
        ("Plinth beam reinforcement",               37, 38),
        ("Plinth beam Concrete Casting",            39, 41),
        ("Brickwork",                               42, 45),
        ("Tie Beam",                                46, 47),
        ("Backfilling",                             48, 50),
        ("Floor PCC Completion",                    51, 53),
    ]),
    ("Ground floor (Brickwork and Roof slab)", "GF", [
        ("Column Starter",                          54, 55),
        ("Column Reinforcement",                    56, 57),
        ("Concrete Casting",                        58, 60),
        ("Brickwork upto Lintel level",             61, 63),
        ("Staircase work",                          64, 66),
        ("Brickwork above Lintel",                  67, 69),
        ("Roof slab Shuttering",                    70, 72),
        ("Roof Slab Reinforcement",                 73, 74),
        ("Roof slab concrete casting",              75, 77),
    ]),
    ("First floor (Brickwork and Roof slab)", "FF", [
        ("Column Starter",                          78, 79),
        ("Column Reinforcement",                    80, 81),
        ("Concrete Casting",                        82, 84),
        ("Brickwork upto Lintel level",             85, 87),
        ("Staircase work",                          88, 90),
        ("Brickwork above Lintel",                  91, 93),
        ("Roof slab Shuttering",                    94, 96),
        ("Roof Slab Reinforcement",                 97, 98),
        ("Roof slab concrete casting",              99, 101),
    ]),
    ("Headroom", "HR", [
        ("Column starter",                         102, 103),
        ("Column Reinforcement",                   104, 105),
        ("Concrete Casting",                       106, 107),
        ("Brickwork headroom",                     108, 110),
        ("Roof slab Shuttering",                   111, 112),
        ("Roof Slab Reinforcement",                113, 114),
        ("Roof slab concrete casting",             115, 116),
        ("Parapet wall",                           117, 119),
    ]),
    ("Plastering — Inner Plastering Ground Floor", "GP", [
        ("Electrical conduit fixing in wall",      120, 121),
        ("Cupboard / Shelves brickwork",           122, 123),
        ("Door / Window frame fixing",             124, 125),
        ("Toilet Plumbing work",                   126, 127),
        ("Plastering work — Internal",             128, 132),
    ]),
    ("Plastering — Inner Plastering First Floor", "FP", [
        ("Electrical conduit fixing in wall",      133, 134),
        ("Cupboard / Shelves brickwork",           135, 136),
        ("Door / Window frame fixing",             137, 138),
        ("Toilet Plumbing work",                   139, 140),
        ("Plastering work — Internal",             141, 145),
    ]),
    ("Plastering — Inner Plastering Terrace Floor", "TP", [
        ("Electrical conduit fixing in wall",      146, 147),
        ("Cupboard / Shelves brickwork",           148, 149),
        ("Door / Window frame fixing",             150, 151),
        ("Toilet Plumbing work",                   152, 153),
        ("Plastering work — Internal",             154, 158),
    ]),
    ("Outer Plastering", "OP", [
        ("Plastering on all sides",                159, 163),
        ("Outer pipeline work",                    164, 166),
    ]),
    ("Flooring work", "FL", [
        ("Ground Floor tiles work",                167, 170),
        ("First Floor tiles work",                 171, 174),
        ("Terrace Tiles work",                     175, 177),
        ("Staircase tiles work",                   178, 180),
    ]),
    ("Carpentary work", "CP", [
        ("Doors fixing",                           181, 183),
        ("Windows Fixing",                         184, 186),
    ]),
    ("Inner Electrical work", "EL", [
        ("Ground floor, 1st floor and headroom electrical wiring", 187, 192),
    ]),
    ("Painting works", "PW", [
        ("Putty works",                            193, 197),
        ("Primer one coat",                        198, 199),
        ("Two Coat Colour",                        200, 203),
        ("Handing over and completion",            204, 205),
    ]),
]


def build_stages_payload():
    """Flatten SECTIONS into a single ordered list with section-header rows + stages."""
    payload = []
    for section_title, prefix, stages in SECTIONS:
        # Section header row (no dates, not a real task)
        payload.append({
            "id": f"st_{uuid.uuid4().hex[:8]}",
            "stage_name": section_title,
            "section_title": section_title,
            "is_section_header": True,
            "sl_no": "",
            "start_day": None,
            "end_day": None,
            "duration_days": None,
            "remarks": "",
            "status": "yet_to_start",
        })
        # Stage rows
        for idx, (name, start, end) in enumerate(stages, start=1):
            payload.append({
                "id": f"st_{uuid.uuid4().hex[:8]}",
                "stage_name": name,
                "section_title": section_title,
                "is_section_header": False,
                "sl_no": f"{prefix}{idx}",
                "start_day": start,
                "end_day": end,
                "duration_days": max(1, end - start + 1),
                "remarks": "",
                "status": "yet_to_start",
            })
    return payload


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    stages_payload = build_stages_payload()
    real_stage_count = sum(1 for s in stages_payload if not s["is_section_header"])

    template_doc = {
        "template_id": f"tpl_{uuid.uuid4().hex[:8]}",
        "template_name": TEMPLATE_NAME,
        "description": TEMPLATE_DESCRIPTION,
        "stages": stages_payload,
        "stage_count": real_stage_count,
        "section_count": len(SECTIONS),
        "duration_months": 8,
        "is_active": True,
        "created_by": "system_seed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    existing = await db.stage_templates.find_one(
        {"template_name": TEMPLATE_NAME}, {"_id": 0, "template_id": 1}
    )
    if existing:
        template_doc["template_id"] = existing["template_id"]
        await db.stage_templates.update_one(
            {"template_name": TEMPLATE_NAME}, {"$set": template_doc}
        )
        print(
            f"✓ Updated '{TEMPLATE_NAME}' — {len(SECTIONS)} sections, "
            f"{real_stage_count} stages ({len(stages_payload)} rows incl. headers)"
        )
    else:
        await db.stage_templates.insert_one(template_doc)
        print(
            f"✓ Inserted '{TEMPLATE_NAME}' — {len(SECTIONS)} sections, "
            f"{real_stage_count} stages ({len(stages_payload)} rows incl. headers)"
        )

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
