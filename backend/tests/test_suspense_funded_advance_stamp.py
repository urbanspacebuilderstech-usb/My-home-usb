"""A bill settled from vendor suspense must still count as paid (Sep 23 2026).

USB-MR1706 (Granite Tile / Chennai Steel Corp) had its 50 advance settled
entirely from the vendor's suspense credit. pay_approval agreed the bill was
fully paid - the mirror row went to status `paid` with remaining_balance 0 -
and then stamped the parent with advance_paid_amount = 0, because that stamp
was fed `new_total_paid`, which is deliberately CASH-ONLY:

    is_full_payment = (already_paid + effective_paid + credit_used) >= bill   # includes credit
    new_total_paid  =  already_paid + effective_paid                          # excludes credit

The Procurement board decides purely on `advance_paid_amount > 0`, so it kept
showing "Advance Pending 50" for an advance that was already settled.

The parent stamps now use `settled_this_phase`, which includes credit_used and
so matches is_full_payment's own definition. These tests pin both halves: that
the two formulas agree, and that nothing changes for an ordinary cash payment.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _source():
    return io.open(FINANCIAL, encoding="utf8").read()


def _pay_approval():
    src = _source()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and node.name == "pay_approval":
            return node, src
    raise AssertionError("pay_approval not found")


# --------------------------------------------------------------------------
# The arithmetic the fix rests on
# --------------------------------------------------------------------------

def settled(already, effective, credit):
    """What the parent advance/balance stamp now records."""
    return round(already + effective + credit, 2)


def cash_only(already, effective):
    """What it used to record."""
    return round(already + effective, 2)


def is_full_payment(already, effective, credit, bill):
    """pay_approval's own definition, line-for-line."""
    return (already + effective + credit) >= bill - 0.5


@pytest.mark.parametrize("already,effective,credit,bill", [
    (0.0, 0.0, 50.0, 50.0),      # USB-MR1706: entirely from suspense
    (0.0, 30.0, 20.0, 50.0),     # part cash, part suspense
    (0.0, 0.0, 1000.0, 1000.0),  # large, entirely suspense
])
def test_fully_settled_bills_record_the_full_amount(already, effective, credit, bill):
    """If the code calls it fully paid, the stamp must say so too."""
    assert is_full_payment(already, effective, credit, bill)
    assert settled(already, effective, credit) == pytest.approx(bill)
    # the old behaviour under-reported precisely by the credit applied
    assert cash_only(already, effective) == pytest.approx(bill - credit)


@pytest.mark.parametrize("already,effective", [
    (0.0, 50.0), (0.0, 100.0), (30.0, 20.0), (0.0, 0.0),
])
def test_no_change_when_no_suspense_credit_is_used(already, effective):
    """Ordinary cash/cheque payments must behave exactly as before."""
    assert settled(already, effective, 0.0) == cash_only(already, effective)


def test_continuation_cannot_double_count():
    """A part-payment continuation forces credit_used to 0, so the second call
    adds only new cash on top of what is already recorded."""
    # first call: 20 cash + 30 credit settles 50 of an 80 bill
    first = settled(0.0, 20.0, 30.0)
    assert first == 50.0
    # continuation: credit_used is forced to 0 by the code, already_paid = 50
    second = settled(first, 30.0, 0.0)
    assert second == 80.0, "continuation must not re-apply the earlier credit"


def test_stamp_never_exceeds_the_bill_for_a_single_settlement():
    for bill in (50.0, 100.0, 1000.0):
        for credit in (0.0, bill / 2, bill):
            effective = bill - credit
            assert settled(0.0, effective, credit) == pytest.approx(bill)


# --------------------------------------------------------------------------
# Structural guards on the real source
# --------------------------------------------------------------------------

def test_parent_stamps_use_the_settled_amount():
    _, src = _pay_approval()
    assert '"advance_paid_amount": settled_this_phase,' in src
    assert '"balance_paid_amount": settled_this_phase,' in src
    assert '"advance_paid_amount": new_total_paid,' not in src
    assert '"balance_paid_amount": new_total_paid,' not in src


def test_settled_this_phase_includes_credit_used():
    fn, src = _pay_approval()
    seg = ast.get_source_segment(src, fn) or ""
    assert "settled_this_phase = round(already_paid + effective_paid + credit_used, 2)" in seg


def test_cash_only_semantics_are_left_alone_elsewhere():
    """remaining_balance and the mirror row deliberately treat new_total_paid
    as cash-only and subtract credit_used separately - that must not change,
    or balances would shift across the app."""
    fn, src = _pay_approval()
    seg = ast.get_source_segment(src, fn) or ""
    assert "new_total_paid = already_paid + effective_paid" in seg
    assert '"paid_amount": new_total_paid,' in seg
    assert "max(0.0, bill_amount - credit_used - new_total_paid)" in seg


def test_is_full_payment_and_the_stamp_share_one_definition():
    """The bug was these two disagreeing. They must now be the same sum."""
    fn, src = _pay_approval()
    seg = ast.get_source_segment(src, fn) or ""
    assert "is_full_payment = (already_paid + effective_paid + credit_used) >= bill_amount - 0.5" in seg
    assert "settled_this_phase = round(already_paid + effective_paid + credit_used, 2)" in seg


def test_suspense_legs_are_not_labelled_manual_in_the_ui():
    """source 'approval_suspense' must classify as an approval, not Manual."""
    ui = io.open(os.path.join(BACKEND, "..", "frontend", "src", "pages",
                              "AccountsBoard.jsx"), encoding="utf8").read()
    assert "e.source === 'approval' ? 'approval' : 'manual'" not in ui
    assert "entry.source === 'approval' ? 'Approval' : 'Manual'" not in ui
    assert ui.count("startsWith('approval')") >= 3
