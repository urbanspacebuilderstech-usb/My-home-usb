"""Regression tests: who changed a material request's qty / price.

The Details tab shows an "Approved Qty" (USB-MR490 M Sand: 300 against a
requested 3) that no Timeline entry accounted for, so there was no way to tell
who entered it. The request document keeps only the CURRENT approved_quantity
and unit_price - every intermediate value is overwritten - but each transition
already writes an audit_logs row carrying the payload it applied, so the trail
is reconstructed from those rather than newly recorded.

Core rules under test: only movements that actually happened are reported, a
first-ever value is not a "change from nothing", and a blank or non-numeric
field is never read as a real 0.

    python -m pytest tests/test_material_qty_history.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.procurement import (  # noqa: E402
    derive_applied_snapshots,
    derive_qty_history_events,
)

NAMES = {"u_sar": "Saravanan G R", "u_sur": "Suriya S", "u_pra": "Prabu S"}


def log(ts, uid, action, **details):
    return {"timestamp": ts, "user_id": uid, "action": action, "details": details}


def _changes(event, field):
    return [(c["from"], c["to"]) for c in event["changes"] if c["field"] == field]


# ---------------------------------------------------------------- the real shape

def test_step_that_changes_nothing_is_silent():
    """Assign-vendor confirming the SE's own qty is not a change."""
    events = derive_qty_history_events(3, [
        log("2026-07-18T10:58", "u_sar", "assign_vendor", approved_quantity=3, unit_price=6240),
        log("2026-07-20T09:00", "u_sur", "change_vendor", approved_quantity=300, unit_price=60),
    ], NAMES)
    assert [e["action"] for e in events] == ["change_vendor"]


def test_the_person_who_moved_the_qty_is_named():
    events = derive_qty_history_events(3, [
        log("2026-07-18T10:58", "u_sar", "assign_vendor", approved_quantity=3, unit_price=6240),
        log("2026-07-20T09:00", "u_sur", "change_vendor", approved_quantity=300, unit_price=60),
    ], NAMES)
    assert events[0]["by_name"] == "Suriya S"
    assert _changes(events[0], "approved_quantity") == [(3.0, 300.0)]
    assert _changes(events[0], "unit_price") == [(6240.0, 60.0)]


def test_procurement_raising_the_se_qty_is_reported():
    events = derive_qty_history_events(3, [
        log("t1", "u_sar", "assign_vendor", approved_quantity=300),
    ], NAMES)
    assert [(e["title"], e["by_name"]) for e in events] == [
        ("Procurement set qty / price", "Saravanan G R")]
    assert _changes(events[0], "approved_quantity") == [(3.0, 300.0)]


def test_chain_compares_against_previous_value_not_the_baseline():
    events = derive_qty_history_events(10, [
        log("t1", "u_sar", "assign_vendor", approved_quantity=20),
        log("t2", "u_sur", "planning_approve", approved_quantity=30),
        log("t3", "u_sar", "verify_approve", approved_quantity=30),  # re-confirm
    ], NAMES)
    assert [_changes(e, "approved_quantity")[0] for e in events] == [(10.0, 20.0), (20.0, 30.0)]


# ---------------------------------------------------------------- false positives

def test_first_ever_unit_price_is_not_a_change():
    """No prior value means no "from" - reporting it would invent a 0 -> n."""
    assert derive_qty_history_events(
        3, [log("t1", "u_sar", "assign_vendor", unit_price=6240)], NAMES) == []


def test_blank_and_garbage_are_never_a_change_to_zero():
    for bad in ("", None, "n/a", {}):
        assert derive_qty_history_events(
            3, [log("t1", "u_sar", "assign_vendor", approved_quantity=bad)], NAMES) == [], bad


def test_sub_paisa_drift_is_ignored():
    assert derive_qty_history_events(
        3, [log("t1", "u_sar", "assign_vendor", approved_quantity=3.001)], NAMES) == []


def test_unrelated_audit_rows_produce_nothing():
    assert derive_qty_history_events(3, [
        log("t1", "u_sar", "toggle_priority", is_high_priority=True),
        log("t2", "u_sar", "archive"),
    ], NAMES) == []


# ---------------------------------------------------------------- edges

def test_short_delivery_to_zero_is_a_real_change():
    """A genuine drop to 0 must be reported, unlike a missing field."""
    events = derive_qty_history_events(300, [
        log("t1", "u_pra", "mark_received", received_quantity=300),
        log("t2", "u_sar", "verify_approve", received_quantity=0),
    ], NAMES)
    assert [(e["action"], _changes(e, "received_quantity")[0]) for e in events] == [
        ("verify_approve", (300.0, 0.0))]


def test_unknown_user_and_unmapped_action_still_surface():
    """Never drop a real change just because we cannot label it nicely."""
    events = derive_qty_history_events(
        3, [log("t1", "u_ghost", "some_new_action", approved_quantity=99)], NAMES)
    assert events[0]["by_name"] == "Unknown"
    assert events[0]["title"] == "Some New Action"


def test_no_audit_rows_yields_no_events():
    assert derive_qty_history_events(3, [], NAMES) == []


# ------------------------------------------------- per-step values (applied)
# The Timeline used to render CURRENT document fields on historical rows, so a
# later correction rewrote what earlier steps appeared to have entered. These
# snapshots recover each step's own figures for requests that predate the
# frozen `procurement_priced_*` / `se_reported_quantity` stamps.

def test_applied_recovers_what_each_step_entered():
    """USB Cement: assigned at 200 x Rs 2, verified up to 250 x Rs 23."""
    applied = derive_applied_snapshots([
        log("t1", "u_sar", "assign_vendor",
            approved_quantity=200, unit_price=2, total_amount=400),
        log("t2", "u_pra", "mark_received", received_quantity=200),
        log("t3", "u_sar", "verify_approve",
            received_quantity=250, unit_price=23, total_amount=5750),
    ])
    assert applied["assign_vendor"] == {
        "approved_quantity": 200.0, "unit_price": 2.0, "total_amount": 400.0}
    assert applied["mark_received"]["received_quantity"] == 200.0
    assert applied["verify_approve"]["total_amount"] == 5750.0


def test_applied_last_write_per_action_wins():
    applied = derive_applied_snapshots([
        log("t1", "u_sar", "assign_vendor", unit_price=2),
        log("t2", "u_sar", "assign_vendor", unit_price=9),
    ])
    assert applied["assign_vendor"]["unit_price"] == 9.0


def test_applied_skips_non_numeric_and_empty_rows():
    applied = derive_applied_snapshots([
        log("t1", "u_sar", "assign_vendor", unit_price="", approved_quantity="n/a"),
        log("t2", "u_sar", "archive"),
        log("t3", "u_sar", "toggle_priority", is_high_priority=True),
    ])
    assert applied == {}
