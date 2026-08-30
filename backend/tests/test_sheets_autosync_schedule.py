"""Regression tests: the Sheets auto-sync loop must honour interval_hours.

sheets_auto_sync_loop() ticked every 60s and did the FULL Google round trip
(connected_sheets lookup, token load, spreadsheet metadata, per-tab value
reads) for every enabled config on every tick, ignoring interval_hours
entirely. Production logs showed "cycle start ... cycle end ~5s, configs=2"
every single minute, each cycle triggering google_auth_httplib2 "Refreshing
credentials due to a 401 response" - roughly 60x more Google API work than the
interval_hours=1 configs asked for.

The loop still wakes every 60s on purpose (different configs may have
different intervals, so it cannot sleep for any one of them). What changed is
that each config is now gated on its own schedule before any Google work.

    python -m pytest tests/test_sheets_autosync_schedule.py -q
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from server import sheets_config_is_due  # noqa: E402

NOW = datetime(2026, 8, 29, 12, 0, 0, tzinfo=timezone.utc)


def cfg(interval_hours=1, ago_minutes=None, **extra):
    """A config last run `ago_minutes` before NOW (None = never run)."""
    c = {"user_id": "u1", "enabled": True, "interval_hours": interval_hours}
    if ago_minutes is not None:
        c["last_run_at"] = (NOW - timedelta(minutes=ago_minutes)).isoformat()
    c.update(extra)
    return c


# ------------------------------------------------------------ the core defect

def test_hourly_config_is_skipped_across_sixty_second_ticks():
    """The actual bug: 59 one-minute ticks, at most one unit of Google work."""
    config = cfg(interval_hours=1, ago_minutes=0)
    due_ticks = 0
    for minute in range(1, 60):  # ticks at +1min .. +59min
        if sheets_config_is_due(config, NOW + timedelta(minutes=minute)):
            due_ticks += 1
    assert due_ticks == 0, "an hourly config must not run during its first hour"


def test_hourly_config_becomes_due_at_the_hour():
    config = cfg(interval_hours=1, ago_minutes=0)
    assert sheets_config_is_due(config, NOW + timedelta(minutes=59)) is False
    assert sheets_config_is_due(config, NOW + timedelta(minutes=60)) is True
    assert sheets_config_is_due(config, NOW + timedelta(minutes=61)) is True


def test_a_due_config_still_processes():
    """The fix must not stop work happening - only re-time it."""
    assert sheets_config_is_due(cfg(interval_hours=1, ago_minutes=60), NOW) is True
    assert sheets_config_is_due(cfg(interval_hours=1, ago_minutes=600), NOW) is True


def test_never_run_config_runs_immediately():
    """First tick after deploy syncs, then settles onto the interval."""
    assert sheets_config_is_due(cfg(interval_hours=1), NOW) is True
    assert sheets_config_is_due(cfg(interval_hours=6), NOW) is True


# --------------------------------------------------- independent per-config schedules

def test_different_configs_keep_different_intervals():
    """Ticked together at +3h: only those whose own interval elapsed run."""
    at = NOW + timedelta(hours=3)
    hourly = cfg(interval_hours=1, ago_minutes=0)
    six_hourly = cfg(interval_hours=6, ago_minutes=0)
    daily = cfg(interval_hours=24, ago_minutes=0)
    assert sheets_config_is_due(hourly, at) is True
    assert sheets_config_is_due(six_hourly, at) is False
    assert sheets_config_is_due(daily, at) is False


def test_one_config_being_due_does_not_drag_another_along():
    at = NOW + timedelta(hours=7)
    assert sheets_config_is_due(cfg(interval_hours=6, ago_minutes=0), at) is True
    assert sheets_config_is_due(cfg(interval_hours=24, ago_minutes=0), at) is False


# ------------------------------------------------------------------ retries

def test_failure_does_not_permanently_block_future_retries():
    """last_run_at is stamped on ATTEMPT, so a failing config still comes back
    round - on its interval, not every 60 seconds."""
    failed = cfg(interval_hours=1, ago_minutes=0)  # attempt stamped, sync failed
    assert sheets_config_is_due(failed, NOW + timedelta(minutes=30)) is False
    assert sheets_config_is_due(failed, NOW + timedelta(minutes=60)) is True


def test_unreadable_timestamp_does_not_wedge_a_config_off_forever():
    for bad in ("", None, "not-a-date", "2026-13-45T99:99:99", 12345):
        assert sheets_config_is_due(cfg(interval_hours=1, last_run_at=bad), NOW) is True, bad


# ------------------------------------------------------------------ interval edges

def test_missing_or_invalid_interval_falls_back_to_one_hour():
    for bad in (None, 0, -5, "", "abc", {}):
        c = {"user_id": "u1", "last_run_at": NOW.isoformat()}
        if bad is not None:
            c["interval_hours"] = bad
        assert sheets_config_is_due(c, NOW + timedelta(minutes=30)) is False, bad
        assert sheets_config_is_due(c, NOW + timedelta(minutes=60)) is True, bad


def test_string_interval_is_accepted():
    """The API model types this int, but stored data is not guaranteed to be."""
    c = cfg(interval_hours="2", ago_minutes=0)
    assert sheets_config_is_due(c, NOW + timedelta(hours=1)) is False
    assert sheets_config_is_due(c, NOW + timedelta(hours=2)) is True


def test_naive_timestamp_is_treated_as_utc_not_crashed_on():
    c = {"user_id": "u1", "interval_hours": 1,
         "last_run_at": NOW.replace(tzinfo=None).isoformat()}
    assert sheets_config_is_due(c, NOW + timedelta(minutes=30)) is False
    assert sheets_config_is_due(c, NOW + timedelta(minutes=61)) is True


def test_null_spreadsheet_url_is_irrelevant_to_scheduling():
    """Real spreadsheet ids live in connected_sheets; a null url here must not
    change whether the config is scheduled."""
    c = cfg(interval_hours=1, ago_minutes=90, spreadsheet_url=None)
    assert sheets_config_is_due(c, NOW) is True


# ------------------------------------------------------------------ API-call budget

def test_google_api_work_drops_from_sixty_per_hour_to_one():
    """Count units of Google work over 24h of 60-second ticks."""
    config = cfg(interval_hours=1, ago_minutes=None)
    last_run = None
    work = 0
    for minute in range(0, 24 * 60):
        at = NOW + timedelta(minutes=minute)
        c = dict(config)
        if last_run is not None:
            c["last_run_at"] = last_run.isoformat()
        if sheets_config_is_due(c, at):
            work += 1
            last_run = at          # loop stamps the attempt
    assert work == 24, f"expected 24 syncs in 24h, got {work}"
