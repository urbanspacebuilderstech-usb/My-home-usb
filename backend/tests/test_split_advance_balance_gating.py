"""A split advance must not expose its balance before delivery is verified
(Sep 27 2026).

USB-MR1322 (OPC 53 Grade Cement / Chennai Steel Corp, RE - Dummy Project):
procurement split a 250 advance into 100 now + 150 after delivery. The
accountant paid the 100, and the row immediately appeared under Approvals >
Materials > Partially Collected with a live Release Payment button, while the
material was still `in_transit` ("Awaiting Delivery").

That came from the Jul 7 2026 visibility rule, which pulled mid-flow
part-paid rows into the queue and treated `awaiting_stage` as an
informational badge only. Product decision on Sep 27 reverses it for these
two statuses: the balance is payable only once Procurement has verified.

The row is not lost. verify_delivery sets `pending_next_status`
(pending_balance_payment, else pending_accounts_approval) and the queue's
first clause matches both, so the SAME request returns to Partially Collected
once verification completes.

Accepted trade-off, recorded here so it is not mistaken for a regression: the
USB-MR161 symptom returns. A part-paid request is invisible to the accountant
while it is in transit.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")


def _src():
    return io.open(PROCUREMENT, encoding="utf8").read()


def _queue_fn():
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and "accountant" in node.name and "queue" in node.name:
            return ast.get_source_segment(src, node) or "", src
    raise AssertionError("accountant queue function not found")


# --------------------------------------------------------------------------
# The keep/drop rule, mirrored from the queue
# --------------------------------------------------------------------------

def kept(status, *, cheque_bounced=False, partially_collected=False):
    """True when the row survives into the accountant queue."""
    if status in ("in_transit", "procurement_verifying") and not cheque_bounced:
        return False
    if status == "pending_advance_payment" and not cheque_bounced and not partially_collected:
        return False
    return True


# ---- the reported case ----------------------------------------------------

def test_usb_mr1322_is_hidden_while_awaiting_delivery():
    """100 of 250 paid, material still in transit - must not be payable."""
    assert not kept("in_transit", partially_collected=True)


def test_it_is_still_hidden_while_procurement_is_verifying():
    """Verification must be COMPLETE, not merely started."""
    assert not kept("procurement_verifying", partially_collected=True)


@pytest.mark.parametrize("after_verification", [
    "pending_balance_payment",     # split advance: balance now due
    "pending_accounts_approval",   # the default next status
])
def test_the_same_request_returns_once_verification_completes(after_verification):
    assert kept(after_verification, partially_collected=True)


def test_verification_sets_one_of_those_two_statuses():
    """Pins the promise above to the real handler - if this changes, the row
    would never come back."""
    src = _src()
    assert 'next_status = req.get("pending_next_status") or "pending_accounts_approval"' in src
    assert 'if next_status in ("pending_accounts_approval", "pending_balance_payment"):' in src


def test_queue_matches_both_of_those_statuses():
    seg, _ = _queue_fn()
    assert '{"status": {"$in": ["pending_accounts_approval", "pending_balance_payment", "partially_paid"]}}' in seg


# ---- what must NOT change -------------------------------------------------

def test_a_bounced_cheque_still_reaches_the_accountant_at_any_stage():
    """A bounce is money that did not arrive; it cannot wait for delivery."""
    for status in ("in_transit", "procurement_verifying", "pending_advance_payment"):
        assert kept(status, cheque_bounced=True), status


def test_a_part_paid_advance_stays_visible():
    """pending_advance_payment is the ADVANCE still being collected, not a
    balance waiting on delivery - Swarnaa Agency USB-MR191."""
    assert kept("pending_advance_payment", partially_collected=True)


def test_an_untouched_advance_request_stays_hidden():
    assert not kept("pending_advance_payment")


@pytest.mark.parametrize("status", [
    "pending_accounts_approval", "pending_balance_payment", "partially_paid",
])
def test_the_ordinary_queue_statuses_are_unaffected(status):
    assert kept(status)


def test_full_advance_flow_is_untouched():
    """A 100%-advance request has no balance, so partially_collected is never
    set and it was never in this queue via the mid-flow rule anyway. Once it
    completes it goes to delivered, which is not a queue status."""
    assert not kept("in_transit")
    assert kept("delivered"), "delivered is filtered elsewhere, not by this rule"


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_mid_flow_rows_are_no_longer_pulled_in_by_the_or_clause():
    seg, _ = _queue_fn()
    assert '{"advance_paid_amount": {"$gt": 0}, "status": {"$in": ["in_transit", "procurement_verifying"]}}' not in seg


def test_partially_collected_no_longer_exempts_mid_flow_rows():
    seg, _ = _queue_fn()
    old = ('if r.get("status") in ("in_transit", "procurement_verifying", '
           '"pending_advance_payment") and not r.get("cheque_bounced") '
           'and not r.get("partially_collected"):')
    assert old not in seg
    assert ('if r.get("status") in ("in_transit", "procurement_verifying") '
            'and not r.get("cheque_bounced"):') in seg


def test_the_reversal_is_documented_where_the_old_rule_was():
    """The Jul 7 rationale stays in the file so the trade-off is not silently
    re-litigated by whoever reads it next."""
    seg, _ = _queue_fn()
    assert "USB-MR161" in seg
    assert "REVERSED Sep 27 2026" in seg
    assert "USB-MR1322" in seg


def test_awaiting_stage_is_no_longer_called_release_always_available():
    seg, _ = _queue_fn()
    assert "Release always available" not in seg
