"""
Sequential ID counters — provides globally-running numbered identifiers
(USB-W00001, USB-P00001, USB-FE0001, USB-RE0001, USB-MR001, …).

All counters live in `db.counters`. `find_one_and_update` with `$inc` +
`upsert` gives atomic, race-free allocation.
"""
from pymongo import ReturnDocument
from core.database import db


# Registry: counter_key → (prefix, zero-pad width)
COUNTER_FORMATS = {
    "project_work_order_global": ("USB-W", 5),
    "project_global":            ("USB-P", 5),
    "final_estimate_global":     ("USB-FE", 4),
    "rough_estimate_global":     ("USB-RE", 4),
    "material_request_global":   ("USB-MR", 3),
}


async def next_seq(counter_key: str) -> str:
    """Atomically allocate the next number for `counter_key` and return the
    formatted string (e.g. `USB-W00042`). Race-safe across processes.
    """
    if counter_key not in COUNTER_FORMATS:
        raise ValueError(f"Unknown counter key: {counter_key}")
    prefix, width = COUNTER_FORMATS[counter_key]
    res = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    seq = (res or {}).get("seq") or 1
    return f"{prefix}{int(seq):0{width}d}"


async def backfill_collection(*, counter_key: str, collection, number_field: str,
                              missing_filter=None, sort_field: str = "created_at"):
    """One-time backfill: assign `number_field` (e.g. `work_order_number`)
    to every doc in `collection` that doesn't already have one, ordered by
    `sort_field`. The shared counter is bumped past the highest existing
    value so future allocations never overlap.

    Returns: (count_backfilled, last_seq_used)
    Idempotent — safe to call repeatedly.
    """
    if counter_key not in COUNTER_FORMATS:
        raise ValueError(f"Unknown counter key: {counter_key}")
    prefix, width = COUNTER_FORMATS[counter_key]

    miss_q = missing_filter if missing_filter is not None else {
        "$or": [
            {number_field: {"$exists": False}},
            {number_field: ""},
            {number_field: None},
        ]
    }
    cursor = collection.find(miss_q, {"_id": 1, number_field: 1}).sort(sort_field, 1)
    missing = await cursor.to_list(20000)

    existing_max = 0
    async for d in collection.find(
        {number_field: {"$regex": f"^{prefix}[0-9]+$"}},
        {"_id": 0, number_field: 1},
    ):
        try:
            n = int((d.get(number_field) or f"{prefix}0")[len(prefix):])
            if n > existing_max:
                existing_max = n
        except Exception:
            pass
    ctr = await db.counters.find_one({"_id": counter_key}, {"_id": 0, "seq": 1}) or {}
    start = max(existing_max, int(ctr.get("seq", 0) or 0))

    for doc in missing:
        start += 1
        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {number_field: f"{prefix}{start:0{width}d}"}},
        )
    await db.counters.update_one(
        {"_id": counter_key},
        {"$set": {"seq": start}},
        upsert=True,
    )
    return len(missing), start
