"""
Pick ONE backend worker to run startup seeding/backfills and background loops.

Sep 29 2026 — The backend used to run as a single uvicorn process, so the
Google Sheets auto-sync loop, the priority-decay loop and the startup
"check, then insert" seeding/backfills each ran exactly once. With
`uvicorn --workers N` every worker runs the startup hook: N sync loops would
import the same sheet rows N times, and the backfills would race each other
into duplicate documents.

The first worker to take an exclusive, non-blocking flock on LOCK_PATH is the
leader. It keeps the file open for its whole life; if it dies, the kernel
releases the lock and another worker takes over on its next try (the loops
call try_become_leader() every cycle). Where fcntl doesn't exist (a Windows
dev box running a single process) that process is always the leader.
"""
import logging
import os

logger = logging.getLogger(__name__)

LOCK_PATH = os.environ.get("BACKGROUND_LEADER_LOCK", "/tmp/myhomeusb-background.lock")

_lock_file = None


def try_become_leader() -> bool:
    """True if this process is (or has just become) the background leader."""
    global _lock_file
    if _lock_file is not None:
        return True
    try:
        import fcntl
    except ImportError:
        return True
    try:
        f = open(LOCK_PATH, "a+")
    except OSError as e:
        # Never let the lock stop the backend from starting: behave as the
        # old single process did (this worker runs everything).
        logger.warning(f"Background leader lock {LOCK_PATH} unusable ({e}); running background jobs here")
        _lock_file = False  # remembered, so this warning is logged once
        return True
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return False
    f.seek(0)
    f.truncate()
    f.write(str(os.getpid()))
    f.flush()
    _lock_file = f  # held open for the life of the process: that IS the lock
    logger.info(f"Background leader: pid {os.getpid()} runs seeding, backfills and background loops")
    return True
