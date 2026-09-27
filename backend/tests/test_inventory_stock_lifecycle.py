"""Inventory only counts collected stock, and drops it once spent (Sep 28 2026).

Two reports against Planning > DLR & DPR > Inventory:

1. USB-MR1807 (Anbu Material Test, 2 unit, RE - Dummy Project) was listed
   with Current Stock 2 and Today In +2 while the Site Engineer card still
   read "In Transit" - the stage bar stopped at Transit, Collected not yet
   reached. The batch builder fell back to the ORDERED quantity for anything
   priced, so material merely on its way already counted as stock on site.

2. USB-MR1808 received 4 and used 4 the same day. The day of consumption
   should show the -4 movement, and from the next day the exhausted row
   should disappear rather than sit at 0 forever.

Stock now begins at the SE's "Material Collecting" step, and an exhausted
batch is listed only while it has movement inside the selected range.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_OPS = os.path.join(BACKEND, "routes", "site_ops.py")


def _src():
    return io.open(SITE_OPS, encoding="utf8").read()


def _collected_statuses():
    src = _src()
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(
                getattr(t, "id", None) == "_COLLECTED_STATUSES" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("_COLLECTED_STATUSES not found")


COLLECTED = _collected_statuses()


# --------------------------------------------------------------------------
# 1. Stock starts at Material Collecting
# --------------------------------------------------------------------------

def counts_as_stock(status):
    return str(status or "") in COLLECTED


@pytest.mark.parametrize("status", [
    "requested", "pm_approved", "procurement_priced",
    "pending_advance_payment", "in_transit",
    "planning_initial_pending", "planning_initial_rejected",
    "procurement_rejected", "procurement_revision",
])
def test_material_not_yet_collected_is_not_stock(status):
    assert not counts_as_stock(status)


def test_usb_mr1807_in_transit_contributes_nothing():
    """The reported case: ordered and paid for, but not yet received."""
    assert not counts_as_stock("in_transit")


@pytest.mark.parametrize("status", [
    "collected",
    "procurement_verifying", "procurement_verify_rejected",
    "pending_accounts_approval", "pending_balance_payment",
    "partially_paid", "paid",
    "delivered", "received_completed",
])
def test_everything_from_collection_onwards_is_stock(status):
    assert counts_as_stock(status)


def test_collection_is_the_boundary():
    """in_transit is the step immediately before; collected is the step the
    SE's Material Collecting button reaches."""
    assert not counts_as_stock("in_transit")
    assert counts_as_stock("collected")


def test_a_rejected_verification_keeps_its_stock():
    """The goods are on site even if Procurement disputes the paperwork."""
    assert counts_as_stock("procurement_verify_rejected")


def test_unknown_or_missing_status_is_not_stock():
    for s in (None, "", "something_new"):
        assert not counts_as_stock(s)


# --------------------------------------------------------------------------
# 2. An exhausted batch drops off after its consumption day
# --------------------------------------------------------------------------

def listed(remaining, today_in, today_out):
    """The row-emission rule."""
    if remaining <= 0.0001 and today_in <= 0.0001 and today_out <= 0.0001:
        return False
    return True


def test_usb_mr1808_is_listed_on_the_day_it_was_used():
    """4 received, 4 used, same day: Current Stock 0 but Today Out 4, so the
    SE still sees the -4 movement."""
    assert listed(remaining=0.0, today_in=4.0, today_out=4.0)


def test_it_disappears_the_next_day():
    """Nothing moved in range and nothing left."""
    assert not listed(remaining=0.0, today_in=0.0, today_out=0.0)


def test_stock_still_on_hand_is_always_listed():
    assert listed(remaining=2.0, today_in=0.0, today_out=0.0)


def test_a_partial_draw_keeps_the_row():
    assert listed(remaining=1.0, today_in=0.0, today_out=3.0)


def test_a_receipt_with_no_consumption_is_listed():
    assert listed(remaining=4.0, today_in=4.0, today_out=0.0)


def test_widening_the_range_brings_the_history_back():
    """Rows are hidden only when nothing moved INSIDE the range, so a wider
    filter that includes the consumption day shows it again."""
    assert not listed(remaining=0.0, today_in=0.0, today_out=0.0)
    assert listed(remaining=0.0, today_in=4.0, today_out=4.0)


def test_floating_point_dust_does_not_resurrect_a_row():
    assert not listed(remaining=0.00001, today_in=0.0, today_out=0.00002)


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_builder_skips_uncollected_requests():
    src = _src()
    assert 'if str(d.get("status") or "") not in _COLLECTED_STATUSES:' in src


def _segment(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(name + " not found")


@pytest.mark.parametrize("fn", [
    "_inventory_request_rows_for_projects",
    "_backfill_missing_inventory_entries",
])
def test_the_ordered_quantity_is_no_longer_a_blanket_fallback(fn):
    """It may still fill in a collected row that never recorded a receipt
    qty, but it must sit AFTER the collection gate - in BOTH the read path
    and the backfill that writes material_inventory rows."""
    seg = _segment(fn)
    gate = seg.index("not in _COLLECTED_STATUSES")
    fallback = seg.index('qty = d.get("approved_quantity")')
    assert gate < fallback, fn


def test_the_backfill_no_longer_writes_rows_for_material_in_transit():
    """Its docstring claimed "priced + received" while only ever checking
    priced, so it persisted ledger rows for undelivered material."""
    seg = _segment("_backfill_missing_inventory_entries")
    assert "_COLLECTED_STATUSES" in seg
    assert '"status": 1}' in seg, "status must be projected or the gate reads None"


def test_the_exhausted_row_rule_is_present():
    src = _src()
    assert 'if (b["remaining"] <= 0.0001' in src
    assert 'and b["today_out"] <= 0.0001):' in src


def test_both_cases_are_documented():
    src = _src()
    assert "USB-MR1807" in src
    assert "USB-MR1808" in src
