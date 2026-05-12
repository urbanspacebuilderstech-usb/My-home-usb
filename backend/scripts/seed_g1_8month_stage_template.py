"""Seed: 'G+1 / 8 Months — Independent House' project-stage template.

Built from the actual schedule provided by the Diwakar / Thiruporur project so
Planning can load it on any new project with one click from the
"Load Template" dropdown on the Stages - Project Stages tab.

Idempotent: safe to re-run (upserts on `template_name`). Dates use Day-N offsets
from project start; the frontend converts these to actual calendar dates when
the project's start date is captured.
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
TEMPLATE_DESCRIPTION = "Standard 8-month G+1 independent house schedule covering pre-construction, foundation, ground floor, first floor, plastering, flooring, electrical, carpentry, painting and handover."

# (stage_name, start_day_offset, end_day_offset, remarks)
STAGES = [
    # ---------- Stage 1: Pre-construction & Foundation ----------
    ("Bhoomi Pooja & Project Start",                0,   1, "Advance payment for project confirmation (token advance)"),
    ("Soil Test",                                   2,   2, ""),
    ("Architectural Design Finalization",           3,   3, ""),
    ("Structural Drawings",                        20,  26, ""),
    ("Approvals & Permits",                        28,  36, ""),
    ("Foundation Work",                            38,  99, ""),
    # ---------- Stage 2: Foundation + Plinth Beam + GF + FF roof ----------
    ("Advance Payment — Foundation, Plinth & Basement", 38, 38, ""),
    ("Excavation",                                 40,  40, ""),
    ("PCC (Plain Cement Concrete)",                42,  42, ""),
    ("Footing Reinforcement",                      44,  44, ""),
    ("Footing Concrete",                           46,  46, ""),
    ("Column up to Plinth Beam",                   48,  50, ""),
    ("Backfilling",                                51,  53, ""),
    ("Basement Work",                              55,  57, ""),
    ("Plinth Beam Reinforcement",                  59,  59, ""),
    ("Plinth Beam Concrete Casting",               60,  62, ""),
    ("Brickwork",                                  63,  65, ""),
    ("Tie Beam",                                   67,  67, ""),
    ("Backfilling (Floor Level)",                  69,  71, ""),
    ("Floor PCC Completion",                       73,  75, ""),
    ("Ground Floor — Column Starter",              75,  75, ""),
    ("Ground Floor — Column Reinforcement",        77,  77, ""),
    ("Ground Floor — Column Concrete Casting",     80,  82, ""),
    ("Ground Floor — Brickwork up to Lintel",      81,  81, ""),
    ("Staircase Work (GF)",                        82,  84, ""),
    ("Ground Floor — Brickwork above Lintel",      85,  87, ""),
    ("Ground Floor — Roof Slab Shuttering",        88,  89, ""),
    ("Ground Floor — Roof Slab Reinforcement",     91,  92, ""),
    ("Ground Floor — Roof Slab Concrete Casting",  93,  96, ""),
    # ---------- First Floor structure ----------
    ("First Floor — Column Starter",               98,  98, ""),
    ("First Floor — Column Reinforcement",        100, 100, ""),
    ("First Floor — Column Concrete Casting",     101, 103, ""),
    ("First Floor — Brickwork up to Lintel",      103, 103, ""),
    ("Staircase Work (FF)",                       105, 107, ""),
    ("First Floor — Brickwork above Lintel",      107, 109, ""),
    ("First Floor — Roof Slab Shuttering",        112, 113, ""),
    ("First Floor — Roof Slab Reinforcement",     114, 115, ""),
    ("First Floor — Roof Slab Concrete Casting",  116, 119, ""),
    # ---------- Headroom ----------
    ("Headroom — Column Starter",                 123, 123, ""),
    ("Headroom — Column Reinforcement",           124, 124, ""),
    ("Headroom — Column Concrete Casting",        125, 125, ""),
    ("Headroom — Brickwork",                      126, 128, ""),
    ("Headroom — Roof Slab Shuttering",           129, 131, ""),
    ("Headroom — Roof Slab Reinforcement",        134, 134, ""),
    ("Headroom — Roof Slab Concrete Casting",     136, 136, ""),
    # ---------- Stage 3: Super Structure Ground Floor ----------
    ("Advance Payment — Super Structure (GF)",    106, 106, ""),
    ("Parapet Wall",                              107, 107, ""),
    ("GF — Electrical Conduit Fixing",            109, 109, ""),
    ("GF — Cupboard / Shelves Brickwork",         109, 109, ""),
    ("GF — Door & Window Frame Fixing",           109, 109, ""),
    ("GF — Toilet Plumbing Work",                 109, 109, ""),
    ("GF — Internal Plastering",                  112, 120, ""),
    # ---------- First Floor finishing ----------
    ("FF — Electrical Conduit Fixing",            114, 114, ""),
    ("FF — Cupboard / Shelves Brickwork",         115, 115, ""),
    ("FF — Door & Window Frame Fixing",           116, 116, ""),
    ("FF — Toilet Plumbing Work",                 117, 117, ""),
    ("FF — Internal Plastering",                  119, 126, ""),
    # ---------- Terrace ----------
    ("Terrace — Electrical Conduit Fixing",       129, 129, ""),
    # ---------- Stage 4: Super Structure First Floor ----------
    ("Advance Payment — Super Structure (FF)",    106, 106, ""),
    ("Terrace — Cupboard / Shelves Brickwork",    137, 137, ""),
    ("Terrace — Door & Window Frame Fixing",      137, 137, ""),
    ("Terrace — Toilet Plumbing Work",            137, 137, ""),
    ("Terrace — Internal Plastering",             137, 141, ""),
    ("External Plastering",                       143, 153, ""),
    # ---------- Stage 7: Block work & Finishing ----------
    ("Advance Payment — Blockwork & Plastering",  146, 146, ""),
    ("Plastering on All Sides",                   147, 150, ""),
    ("Outer Pipeline Work",                       150, 150, ""),
    # Flooring
    ("Ground Floor Tiles",                        152, 152, ""),
    ("First Floor Tiles",                         153, 153, ""),
    ("Terrace Tiles",                             153, 153, ""),
    ("Staircase Tiles",                           153, 153, ""),
    # Carpentry
    ("Door Fixing",                               155, 155, ""),
    ("Window Fixing",                             156, 156, ""),
    # Electrical
    ("Inner Electrical Wiring (GF/FF/Headroom)",  158, 158, ""),
    # Painting
    ("Putty Works",                               162, 164, ""),
    ("Primer — One Coat",                         165, 165, ""),
    ("Paint — Two Coat Colour",                   166, 167, ""),
    # Handover
    ("Handover & Project Completion",             168, 168, ""),
]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    stages_payload = [
        {
            "id": f"st_{uuid.uuid4().hex[:8]}",
            "stage_name": name,
            "start_day": start,
            "end_day": end,
            "duration_days": max(1, end - start + 1),
            "remarks": remarks,
            "status": "Yet to Start",
        }
        for (name, start, end, remarks) in STAGES
    ]
    
    template_doc = {
        "template_id": f"tpl_{uuid.uuid4().hex[:8]}",
        "template_name": TEMPLATE_NAME,
        "description": TEMPLATE_DESCRIPTION,
        "stages": stages_payload,
        "stage_count": len(stages_payload),
        "duration_months": 8,
        "is_active": True,
        "created_by": "system_seed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    existing = await db.stage_templates.find_one({"template_name": TEMPLATE_NAME}, {"_id": 0, "template_id": 1})
    if existing:
        # Preserve existing template_id; just refresh fields
        template_doc["template_id"] = existing["template_id"]
        await db.stage_templates.update_one(
            {"template_name": TEMPLATE_NAME},
            {"$set": template_doc}
        )
        print(f"✓ Updated existing template '{TEMPLATE_NAME}' with {len(stages_payload)} stages")
    else:
        await db.stage_templates.insert_one(template_doc)
        print(f"✓ Inserted new template '{TEMPLATE_NAME}' with {len(stages_payload)} stages")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
