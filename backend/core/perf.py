"""
Find what freezes the backend.

Sep 30 2026 — Sampling the live API showed 2-6 second stalls every minute or
so in which even a 401 waited, i.e. some request was holding a worker's event
loop. Nothing recorded which one. This module records it:

* RequestTimingMiddleware notes every request in flight and logs any that
  take SLOW_REQUEST_SECONDS or more, labelled by route pattern.
* A watchdog THREAD checks a heartbeat the event loop updates every 100 ms.
  When the loop misses it for STALL_SECONDS the watchdog reads the loop
  thread's current Python stack, so the record names the exact backend line
  that was running, plus the requests in flight at the time.

Events go to the log and to the capped `perf_events` collection, shared by
all workers. Super Admin: GET /api/admin/perf-events.
"""
import asyncio
import itertools
import logging
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from .database import db
from .deps import get_current_user

logger = logging.getLogger(__name__)

SLOW_REQUEST_SECONDS = 2.0
STALL_SECONDS = 1.0
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_inflight = {}  # request id -> (method, route label, start monotonic)
_ids = itertools.count()
_pending = []  # events from the watchdog thread, written by the loop
_pending_lock = threading.Lock()
_beat = time.monotonic()
_stall_capture = None  # (stack, requests in flight) seen by the watchdog


def _route_label(scope) -> str:
    route = scope.get("route")
    return getattr(route, "path", None) or scope.get("path", "")


def _queue_event(event: dict) -> None:
    event["pid"] = os.getpid()
    event["at"] = datetime.now(timezone.utc).isoformat()
    with _pending_lock:
        _pending.append(event)


class RequestTimingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rid = next(_ids)
        start = time.monotonic()
        _inflight[rid] = (scope["method"], scope.get("path", ""), start)
        status = 0

        async def send_wrapper(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                # The router has matched by now: switch to the route pattern.
                _inflight[rid] = (scope["method"], _route_label(scope), start)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _inflight.pop(rid, None)
            seconds = time.monotonic() - start
            if seconds >= SLOW_REQUEST_SECONDS:
                label = _route_label(scope)
                logger.warning(f"Slow request: {scope['method']} {label} took {seconds:.2f}s (status {status})")
                _queue_event({
                    "kind": "slow_request",
                    "method": scope["method"],
                    "route": label,
                    "seconds": round(seconds, 2),
                    "status": status,
                })


def _loop_stack(thread_id: int) -> list:
    frame = sys._current_frames().get(thread_id)
    if frame is None:
        return []
    frames = traceback.extract_stack(frame)
    ours = [f for f in frames if f.filename.startswith(_BACKEND_DIR) and "/venv/" not in f.filename.replace("\\", "/")]
    return [
        f"{os.path.relpath(f.filename, _BACKEND_DIR)}:{f.lineno} {f.name}"
        for f in (ours or frames)[-8:]
    ]


def _watchdog(loop_thread_id: int) -> None:
    """Thread: while the loop is stalled, capture what it is running (once)."""
    global _stall_capture
    while True:
        time.sleep(0.25)
        if _stall_capture is None and time.monotonic() - _beat >= STALL_SECONDS:
            try:
                now = time.monotonic()
                running = sorted(((now - s, m, p) for m, p, s in list(_inflight.values())), reverse=True)[:5]
                _stall_capture = (_loop_stack(loop_thread_id), [f"{m} {p} ({age:.1f}s)" for age, m, p in running])
            except Exception as e:  # never let diagnostics kill the thread
                _stall_capture = ([f"stack unavailable: {e}"], [])


async def _heartbeat() -> None:
    global _beat, _stall_capture
    while True:
        before = time.monotonic()
        await asyncio.sleep(0.1)
        _beat = time.monotonic()
        gap = _beat - before
        if gap >= STALL_SECONDS:
            stack, inflight = _stall_capture or ([], [])
            _stall_capture = None
            logger.warning(
                f"Event loop blocked {gap:.2f}s; stack: {' <- '.join(reversed(stack))}; in flight: {inflight}"
            )
            _queue_event({"kind": "loop_blocked", "seconds": round(gap, 2), "stack": stack, "inflight": inflight})
        if _pending:
            with _pending_lock:
                events = _pending[:]
                _pending.clear()
            try:
                await db.perf_events.insert_many(events)
            except Exception as e:
                logger.debug(f"perf_events write failed: {e}")


async def start_monitoring() -> None:
    """Called from the app's startup hook in every worker."""
    try:
        await db.create_collection("perf_events", capped=True, size=4 * 1024 * 1024, max=5000)
    except Exception:
        pass  # already exists (or another worker just made it)
    asyncio.create_task(_heartbeat())
    threading.Thread(target=_watchdog, args=(threading.get_ident(),), name="loop-watchdog", daemon=True).start()


router = APIRouter()


@router.get("/health")
async def health():
    """Public liveness check, plus the worker count the deploy chose
    (hostinger_setup/backend_workers.sh). `workers` is null when
    WEB_CONCURRENCY never reached this process, i.e. uvicorn runs one worker
    because PM2 didn't pass the variable on."""
    raw = os.environ.get("WEB_CONCURRENCY")
    return {
        "status": "ok",
        "workers": int(raw) if raw and raw.isdigit() else None,
        "sized_by": os.environ.get("WORKERS_SIZED_BY"),
    }


@router.get("/admin/perf-events")
async def get_perf_events(limit: int = 300, user=Depends(get_current_user)):
    """Recent slow requests and event-loop stalls, newest first, with totals per route."""
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin only")
    limit = max(1, min(limit, 2000))
    events = await db.perf_events.find({}, {"_id": 0}).sort("$natural", -1).to_list(limit)
    by_route = {}
    for e in events:
        if e.get("kind") != "slow_request":
            continue
        row = by_route.setdefault(e["route"], {"route": e["route"], "count": 0, "max_seconds": 0, "total_seconds": 0})
        row["count"] += 1
        row["max_seconds"] = max(row["max_seconds"], e["seconds"])
        row["total_seconds"] = round(row["total_seconds"] + e["seconds"], 2)
    return {
        "slow_routes": sorted(by_route.values(), key=lambda r: r["total_seconds"], reverse=True),
        "events": events,
    }
