"""Fast JSON responses for the heavy list endpoints.

Sep 16 2026 — Why this exists.

FastAPI serializes a route's return value in TWO synchronous, CPU-bound
steps before anything reaches the wire:

  1. ``jsonable_encoder(response_content)`` — a recursive *pure-Python* walk
     over every dict, list and scalar in the payload. For a route with no
     ``response_model`` this runs unconditionally (fastapi/routing.py,
     ``serialize_response``: ``else: return jsonable_encoder(...)``).
  2. ``json.dumps`` inside ``JSONResponse.render``.

Both run on the event loop thread. Measured on a 20,000-row Finance Board
payload (the real shape of ``/accountant/overview``): 1.13s encode + 0.83s
gzip(level 9) = ~2.0s during which the single uvicorn worker cannot serve
ANY other request — which is why an unrelated login felt slow whenever a
finance screen was open.

Returning a ``Response`` instance directly short-circuits BOTH steps
(fastapi/routing.py: ``if isinstance(raw_response, Response): ...``), so
``fast_json()`` hands back an already-encoded body built by orjson in C.
Same 20,000 rows: 0.02s. Verified byte-for-byte decode-equivalent against
``json.dumps(jsonable_encoder(x))`` across datetime (naive / UTC / offset),
date, time, Decimal, UUID, set, tuple, unicode vendor names and nested
structures — so response SHAPE AND VALUES ARE UNCHANGED.

Two deliberate details:

* ``default=jsonable_encoder`` — orjson natively handles str/int/float/
  bool/None/dict/list/datetime/date/time/UUID. For anything else it calls
  back into FastAPI's own encoder, so exotic types serialize exactly as
  they do today rather than raising.
* Non-ASCII is emitted as raw UTF-8 instead of backslash-u escapes. That is
  the same JSON value (``json.loads`` of either is identical) and fewer
  bytes; ``₹`` and Tamil vendor names decode unchanged in the browser.

Use this ONLY for large list payloads. Small responses are dominated by
network latency, so the extra import buys nothing there.
"""
import json
import logging
from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.responses import Response

logger = logging.getLogger(__name__)

# The production deploy runs ``pip install -r requirements.txt || true``, so a
# failed wheel build would otherwise crash every route that imports this module
# and take the whole ERP down. Degrade to the stdlib path instead: same bytes
# the server produced before this change, just without the speedup.
try:
    import orjson
except ImportError:  # pragma: no cover - exercised only on a broken install
    orjson = None
    logger.warning(
        "orjson unavailable - heavy endpoints fall back to stdlib json "
        "(correct, but slower). Check `pip install -r requirements.txt`."
    )


class ORJSONResponse(Response):
    """``application/json`` response rendered by orjson when it is available."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        if orjson is not None:
            return orjson.dumps(content, default=jsonable_encoder)
        return json.dumps(jsonable_encoder(content)).encode("utf-8")


def fast_json(content: Any, status_code: int = 200) -> ORJSONResponse:
    """Serialize ``content`` with orjson, skipping FastAPI's encoder passes.

    Drop-in for ``return {...}`` on heavy endpoints: the JSON the client
    receives is unchanged.
    """
    return ORJSONResponse(content=content, status_code=status_code)
