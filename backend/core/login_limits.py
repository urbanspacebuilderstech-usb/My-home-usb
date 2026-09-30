"""
Login attempt limits shared by every backend worker.

Sep 30 2026 — `security.rate_limiter` counts attempts in process memory. With
`uvicorn --workers N`, each worker kept its own count, so the per-minute
login cap became N times the configured value. Counting in MongoDB keeps the
cap the same however many workers run. One counter document per identifier
per minute; the TTL index on `expires_at` (created at startup) removes old
ones.
"""
import logging
import time
from datetime import datetime, timezone

from pymongo import ReturnDocument

from security import SecurityConfig, rate_limiter
from .database import db

logger = logging.getLogger(__name__)


async def login_attempt_allowed(identifier: str, max_attempts: int) -> bool:
    """Count one attempt for `identifier`; False once it is over the cap."""
    window = SecurityConfig.RATE_LIMIT_WINDOW_SECONDS
    bucket = int(time.time() // window)
    try:
        doc = await db.login_rate_limits.find_one_and_update(
            {"_id": f"{identifier}:{bucket}"},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"expires_at": datetime.fromtimestamp((bucket + 2) * window, tz=timezone.utc)},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return doc["count"] <= max_attempts
    except Exception as e:
        # Never lock everyone out because the counter is unavailable: fall
        # back to this worker's in-memory count.
        logger.warning(f"Shared login limit unavailable ({e}); using this worker's count")
        return rate_limiter.check_login_rate_limit(identifier, max_attempts)
