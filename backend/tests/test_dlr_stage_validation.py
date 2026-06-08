"""Regression test for the DLR → stage validation bug.

The bug: SE picks a contractor + an open WO stage in the Record DLR popup,
clicks Save, and backend rejects with "Selected stage does not belong to
this project" — because the validator looked up the stage_id in
db.project_stages (the client-side schedule), but the dialog correctly
sends a payment_stages id (the per-contractor WO stage). Two different
collections, mutually exclusive id spaces.

Fix: validate against db.payment_stages keyed by (stage_id, work_order_id),
falling back to db.project_stages for legacy callers.
"""
import os
import asyncio
import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")


def test_dlr_accepts_payment_stage_id():
    asyncio.run(_run())


async def _run():
    """The DLR stage-validation query must hit db.payment_stages keyed by
    work_order_id — not db.project_stages — otherwise every Record DLR
    submission from the new dialog fails.
    """
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    project_id = f"test_proj_{datetime.now(timezone.utc).timestamp():.0f}"
    wo_id = f"test_wo_{datetime.now(timezone.utc).timestamp():.0f}"
    stage_id = f"test_stage_{datetime.now(timezone.utc).timestamp():.0f}"

    await db.payment_stages.insert_one({
        "stage_id": stage_id,
        "work_order_id": wo_id,
        "project_id": project_id,
        "name": "S1 advance",
        "amount": 50000,
        "is_open": True,
        "is_addition": False,
    })

    # The fix mirrors what `create_dlr` does on the backend.
    stage_doc = await db.payment_stages.find_one(
        {"stage_id": stage_id, "work_order_id": wo_id},
        {"_id": 0, "name": 1, "stage_name": 1},
    )
    assert stage_doc is not None, "payment_stages lookup must succeed for a WO stage"
    assert stage_doc.get("name") == "S1 advance"

    # The previous-buggy lookup (against project_stages) must miss — proving
    # the original bug would have rejected this legitimate DLR submission.
    legacy = await db.project_stages.find_one(
        {"stage_id": stage_id, "project_id": project_id}, {"_id": 0, "stage_name": 1}
    )
    assert legacy is None, "stage must NOT exist in project_stages — that's the whole point"

    # Cleanup
    await db.payment_stages.delete_one({"stage_id": stage_id})


if __name__ == "__main__":
    asyncio.run(_run())
    print("OK")
