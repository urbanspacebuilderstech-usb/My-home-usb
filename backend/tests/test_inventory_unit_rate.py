"""Regression tests: Inventory stock value can never exceed what was billed.

USB-MR566 (Door frame, Mr Susikar Robert, SHANMUGAM INTERIORS): a lump-sum bill
of 1,86,600 was entered against Approved Qty 1, so `unit_price` held the WHOLE
bill rather than a per-unit rate. Inventory valued the 39 nos received at
"1,86,600 each" and reported 72,77,400 of stock - 39x the real cost, and more
than a third of the 1,97,44,545 company-wide stock value shown on the tab.

Core rule under test: the request's own total is authoritative. A stored
unit_price that does not multiply back up to it is not a per-unit rate, so the
rate implied by the total wins. Genuine per-unit prices must pass through
untouched, and transport/discount must stay out of the rate.

    python -m pytest tests/test_inventory_unit_rate.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.site_ops import reconciled_unit_rate  # noqa: E402


def req(unit_price=None, total=None, transport=0, discount=0, **extra):
    d = {"transport_cost": transport, "discount": discount}
    if unit_price is not None:
        d["unit_price"] = unit_price
    if total is not None:
        d["total_amount"] = total
    d.update(extra)
    return d


# ------------------------------------------------------------------ the bug

def test_usb_mr566_lump_sum_is_not_treated_as_a_unit_rate():
    """1,86,600 for 39 nos must value at 1,86,600, never 72,77,400."""
    rate = reconciled_unit_rate(req(unit_price=186600, total=186600), 39)
    assert rate == 4784.62
    assert round(rate * 39) == 186600


def test_stock_value_never_exceeds_the_bill():
    """The property that matters, across a spread of lump-sum shapes."""
    for total, qty in ((186600, 39), (5750, 250), (400, 200), (99000, 3), (1200, 7)):
        rate = reconciled_unit_rate(req(unit_price=total, total=total), qty)
        assert rate * qty <= total + 1, (total, qty, rate)


# ------------------------------------------------- genuine rates pass through

def test_real_per_unit_price_is_left_alone():
    """Cement: 250 bag x Rs 23 = 5,750. Nothing to correct."""
    assert reconciled_unit_rate(req(unit_price=23, total=5750), 250) == 23


def test_transport_is_not_folded_into_the_rate():
    """310/bag x 100 + 500 transport = 31,500. The rate stays 310, not 315."""
    assert reconciled_unit_rate(req(unit_price=310, total=31500, transport=500), 100) == 310


def test_discount_is_not_folded_into_the_rate():
    assert reconciled_unit_rate(req(unit_price=310, total=30500, discount=500), 100) == 310


def test_rounding_noise_does_not_trigger_a_rewrite():
    """4784.62 x 39 = 186,600.18 - a rounding tail, not a mispricing."""
    assert reconciled_unit_rate(req(unit_price=4784.62, total=186600), 39) == 4784.62


# ------------------------------------------------------------------ edges

def test_unpriced_request_stays_zero():
    """Callers skip rate <= 0; this must not invent one out of a total."""
    assert reconciled_unit_rate(req(unit_price=0, total=5000), 10) == 0


def test_no_total_leaves_the_stored_rate_untouched():
    """Nothing authoritative to reconcile against, so do not guess."""
    assert reconciled_unit_rate(req(unit_price=310), 100) == 310
    assert reconciled_unit_rate(req(unit_price=310, total=0), 100) == 310


def test_zero_or_negative_quantity_is_not_divided_by():
    assert reconciled_unit_rate(req(unit_price=186600, total=186600), 0) == 186600
    assert reconciled_unit_rate(req(unit_price=186600, total=186600), -5) == 186600


def test_unit_rate_field_is_honoured_when_unit_price_is_absent():
    assert reconciled_unit_rate({"unit_rate": 23, "total_amount": 5750}, 250) == 23


def test_falls_back_through_final_price_then_estimated_price():
    assert reconciled_unit_rate({"unit_price": 186600, "final_price": 186600}, 39) == 4784.62
    assert reconciled_unit_rate({"unit_price": 186600, "estimated_price": 186600}, 39) == 4784.62


def test_received_more_than_billed_is_capped_at_the_bill():
    """Billed 200 x Rs 2 = 400 but 250 received: value the 250 at 400 total,
    not 500. Stock is never worth more than it cost."""
    rate = reconciled_unit_rate(req(unit_price=2, total=400), 250)
    assert rate == 1.6
    assert rate * 250 == 400


# ------------------------------------------------------- generic, not USB-MR566
# The rule must hold for ANY project / material / amount, so these sweep a wide
# spread of shapes rather than asserting one repaired request.

def test_lump_sum_defect_is_corrected_at_any_amount_and_quantity():
    for total in (500, 1200, 7350, 186600, 999999, 12_50_000):
        for qty in (2, 3, 7, 39, 100, 250, 1000, 2.5, 0.75):
            rate = reconciled_unit_rate(req(unit_price=total, total=total), qty)
            assert abs(rate * qty - total) <= 1, (total, qty, rate)


def test_genuine_rates_survive_at_any_amount_and_quantity():
    """No false positives: a correct per-unit price is never rewritten."""
    for rate_in in (1.5, 23, 73, 310, 4784.62, 19300):
        for qty in (1, 7, 39, 100, 250, 1000):
            total = round(rate_in * qty, 2)
            assert reconciled_unit_rate(req(unit_price=rate_in, total=total), qty) == rate_in


def test_transport_and_discount_never_leak_into_the_rate_at_any_scale():
    for rate_in in (23, 310, 4784.62):
        for qty in (10, 39, 250):
            for transport, discount in ((0, 0), (500, 0), (0, 500), (750, 250)):
                total = round(rate_in * qty + transport - discount, 2)
                got = reconciled_unit_rate(
                    req(unit_price=rate_in, total=total, transport=transport, discount=discount), qty)
                assert got == rate_in, (rate_in, qty, transport, discount, got)


def test_stock_is_never_valued_above_the_bill_for_any_shape():
    """The invariant that actually protects the company stock figure."""
    for total in (400, 5750, 31500, 186600, 4_00_000):
        for qty in (1, 5, 39, 137, 500):
            for stored in (total, total / 2, total * 3, 1, 0.5):
                rate = reconciled_unit_rate(req(unit_price=stored, total=total), qty)
                assert rate * qty <= total + max(1.0, total * 0.02), (total, qty, stored, rate)


def test_tolerance_absorbs_small_orders_without_masking_real_errors():
    # Within 2%: untouched.
    assert reconciled_unit_rate(req(unit_price=100, total=1020), 10) == 100
    # A 39x error is nowhere near tolerance.
    assert reconciled_unit_rate(req(unit_price=1000, total=1000), 10) == 100
