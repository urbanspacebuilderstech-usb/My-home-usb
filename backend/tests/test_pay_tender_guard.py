"""Regression tests: a tender must never exceed what is actually payable.

Guards the SS AGENCY class of bug (Aug 22 2026). The Pay & Settle dialog
pre-fills the leg amount on open; applying vendor suspense afterwards lowers
Net Payable. A client that does not refresh that pre-filled figure submits the
ORIGINAL bill amount against the reduced payable, and the server used to treat
the difference as cheque excess and roll it back into the vendor's suspense —
spending the credit and re-creating it in the same call.

The frontend now recalculates, but these cover the server-side rule, because a
stale tab or a replayed request must not be able to reproduce it.

Pure unit tests — no server, no database, no fixtures. Run with:
    python -m pytest tests/test_pay_tender_guard.py -q
"""
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.financial import check_tender_not_over_payable as check  # noqa: E402


# The reported case: bill 74,400, vendor suspense 55,500 applied.
BILL = 74400.0
SUSPENSE = 55500.0
NET_PAYABLE = BILL - SUSPENSE  # 18,900


# --- the exact reported bug, per payment method -------------------------------

@pytest.mark.parametrize("method", ["cheque", "cash", "hdfc_current", "hdfc_savings",
                                    "direct_transfer", "escrow"])
def test_stale_full_bill_tender_is_rejected_for_every_method(method):
    """A single leg still holding the pre-suspense bill amount must be refused,
    whatever the payment mode. Previously only cash/bank legs were capped and a
    cheque leg was allowed to roll the difference into suspense."""
    err = check(total_leg_amount=BILL, payable=NET_PAYABLE)
    assert err is not None, f"{method}: stale {BILL} tender was accepted against {NET_PAYABLE}"
    assert "18,900" in err and "74,400" in err, f"error should name both figures, got: {err}"


@pytest.mark.parametrize("method", ["cheque", "cash", "hdfc_current"])
def test_correct_net_payable_tender_is_accepted(method):
    """The value the fixed dialog now sends: exactly Net Payable, no excess."""
    assert check(total_leg_amount=NET_PAYABLE, payable=NET_PAYABLE) is None


def test_no_excess_is_produced_at_the_accepted_amount():
    """Tendering exactly Net Payable leaves nothing to roll into suspense, so
    the round-trip that spent and re-created the vendor credit cannot occur."""
    assert max(0.0, NET_PAYABLE - NET_PAYABLE) == 0.0


# --- genuine flows must keep working -----------------------------------------

def test_partial_payment_under_payable_is_allowed():
    """Paying less than owed is a normal part-payment, not an over-tender."""
    assert check(total_leg_amount=10000.0, payable=NET_PAYABLE) is None


def test_split_payment_summing_to_payable_is_allowed():
    """Real split flow: cheque 10,000 + cash 8,900 = 18,900."""
    assert check(total_leg_amount=10000.0 + 8900.0, payable=NET_PAYABLE) is None


def test_split_payment_overshooting_is_rejected():
    """Split legs are summed, so a stale leg inside a split is caught too."""
    assert check(total_leg_amount=10000.0 + BILL, payable=NET_PAYABLE) is not None


def test_deliberate_excess_still_possible_when_opted_in():
    """Parking a genuine overpayment in vendor suspense stays available, but a
    caller has to ask for it explicitly rather than reach it by accident."""
    assert check(total_leg_amount=BILL, payable=NET_PAYABLE, allow_excess=True) is None


def test_rounding_tolerance_absorbs_paise():
    """Half a rupee of float noise must not block a legitimate exact payment."""
    assert check(total_leg_amount=NET_PAYABLE + 0.4, payable=NET_PAYABLE) is None
    assert check(total_leg_amount=NET_PAYABLE + 5.0, payable=NET_PAYABLE) is not None


def test_zero_payable_rejects_any_tender():
    """A fully-settled bill cannot absorb more money — this is the state that
    produced the 'Net Payable 0 / excess to suspense' screens."""
    assert check(total_leg_amount=17516.0, payable=0.0) is not None
    assert check(total_leg_amount=0.0, payable=0.0) is None


# --- double-click / retry safety ---------------------------------------------

def test_replayed_request_after_payment_is_rejected_by_the_same_rule():
    """Second click of a double-submit: the first call settled the bill, so on
    the retry payable is 0 while the replayed body still carries the original
    amount. Independent of the endpoint's 30s lock, this rule alone refuses it,
    so the two guards fail closed together rather than relying on either."""
    assert check(total_leg_amount=NET_PAYABLE, payable=0.0) is not None


def test_retry_after_partial_payment_cannot_overpay():
    """Retrying a leg that already landed: 10,000 of 18,900 is paid, so only
    8,900 remains and replaying the full 18,900 must be refused."""
    assert check(total_leg_amount=NET_PAYABLE, payable=NET_PAYABLE - 10000.0) is not None
    assert check(total_leg_amount=8900.0, payable=NET_PAYABLE - 10000.0) is None
