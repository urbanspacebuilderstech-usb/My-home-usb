"""A balance bill must not have the advance deducted twice (Sep 27 2026).

USB-MR1801 (Anbu Test / Champion Demo Test, RE - Dummy Project). Ordered
5 x 100 = 500 with a 100 advance. The accountant paid the advance; Procurement
then verified 6 received, so the parent became total 600 / advance 100 /
balance 500. The Approvals card read 600 total, 100 paid, balance 500 -
correct.

Pay & Settle offered 400.

For a balance leg `bill_amount` is the parent's `balance_amount`, which is
total MINUS advance, so the advance is already taken out. But this request
reuses ONE mirror across both phases: after the advance was paid,
mexp_d83d7d14fe1a still carried paid_amount 100 while its payment_phase had
moved on to "balance". `_reconciled_already_paid` returned that 100, and

    payable = bill_amount - already_paid        # 500 - 100 = 400

took it out a second time. Paying the proposed 400 would have settled the
bill at 500 of 600 and left 100 uncollectable from the vendor, with the row
looking finished.

The ordinary (non-split) flow never hit this: procurement creates a FRESH
balance mirror with paid_amount 0, so already_paid is 0 and there is nothing
to subtract twice. That is exactly the "Full Advance flow is different" the
report called out.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _load_helper():
    src = _src()
    for node in ast.parse(src).body:
        if isinstance(node, ast.FunctionDef) and node.name == "_prior_phase_paid_to_exclude":
            ns = {}
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<h>", "exec"), ns)
            return ns["_prior_phase_paid_to_exclude"]
    raise AssertionError("_prior_phase_paid_to_exclude not found")


def _func_segment(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


exclude = _load_helper()


def payable(bill, already_paid, *, phase, parent_balance, advance_paid, credit=0.0):
    """The net-payable pipeline, with the fix applied."""
    adjusted = max(0.0, already_paid - exclude(phase, bill, parent_balance, advance_paid))
    return max(0.0, bill - adjusted - credit)


# --------------------------------------------------------------------------
# The reported case
# --------------------------------------------------------------------------

MR1801 = dict(phase="balance", parent_balance=500.0, advance_paid=100.0)


def test_usb_mr1801_now_offers_the_full_balance():
    assert payable(500.0, 100.0, **MR1801) == 500.0


def test_the_old_behaviour_under_charged_by_the_advance():
    """Proof this was the defect and not something downstream."""
    assert max(0.0, 500.0 - 100.0) == 400.0, "what the dialog used to show"
    assert payable(500.0, 100.0, **MR1801) - 400.0 == 100.0


def test_paying_the_old_figure_would_have_stranded_money():
    total, advance, old_offer = 600.0, 100.0, 400.0
    assert advance + old_offer == 500.0
    assert total - (advance + old_offer) == 100.0, "uncollectable, bill looks settled"


# --------------------------------------------------------------------------
# What must not change
# --------------------------------------------------------------------------

def test_ordinary_split_flow_with_a_fresh_balance_mirror_is_unchanged():
    """paid_amount 0 on the balance mirror - nothing to exclude, and the
    advance is already out of balance_amount."""
    assert payable(500.0, 0.0, **MR1801) == 500.0


def test_a_part_payment_within_the_balance_phase_still_counts():
    """Shared mirror holding 100 advance + 200 of the balance: only the
    advance is excluded, so 200 still reduces what is due."""
    assert payable(500.0, 300.0, **MR1801) == 300.0


def test_an_advance_leg_is_untouched():
    assert payable(100.0, 0.0, phase="advance", parent_balance=500.0, advance_paid=0.0) == 100.0


def test_a_full_payment_leg_is_untouched():
    for phase in ("full", None, "post", "credit"):
        assert exclude(phase, 600.0, 500.0, 100.0) == 0.0


def test_applied_suspense_still_reduces_the_payable():
    assert payable(500.0, 100.0, credit=200.0, **MR1801) == 300.0


def test_payable_never_goes_negative():
    assert payable(500.0, 100.0, credit=9999.0, **MR1801) == 0.0


# --------------------------------------------------------------------------
# The guard conditions on the helper itself
# --------------------------------------------------------------------------

def test_nothing_excluded_when_the_bill_is_not_the_balance_figure():
    """If bill_amount came from the parent TOTAL, the advance was never
    deducted from it, so removing it here would under-charge instead."""
    assert exclude("balance", 600.0, 500.0, 100.0) == 0.0


def test_nothing_excluded_when_the_parent_has_no_balance():
    assert exclude("balance", 0.0, 0.0, 100.0) == 0.0


def test_nothing_excluded_when_no_advance_was_paid():
    assert exclude("balance", 500.0, 500.0, 0.0) == 0.0


def test_none_advance_is_treated_as_zero():
    assert exclude("balance", 500.0, 500.0, None) == 0.0


def test_a_negative_stored_advance_cannot_inflate_the_payable():
    assert exclude("balance", 500.0, 500.0, -50.0) == 0.0


@pytest.mark.parametrize("bill", [499.6, 500.0, 500.4])
def test_rounding_slack_matches_the_bill_to_the_balance(bill):
    """The codebase settles money to within 50 paise everywhere else."""
    assert exclude("balance", bill, 500.0, 100.0) == 100.0


@pytest.mark.parametrize("bill", [499.0, 501.0])
def test_a_real_difference_is_not_treated_as_the_balance(bill):
    assert exclude("balance", bill, 500.0, 100.0) == 0.0


# --------------------------------------------------------------------------
# Structural guards - the two paths must not drift
# --------------------------------------------------------------------------

def test_both_the_preview_and_the_payment_apply_it():
    """The file's own comments warn repeatedly that the GET preview and the
    POST that charges the card drifted apart before. Both must call it."""
    for name in ("get_pay_context", "pay_approval"):
        assert "_prior_phase_paid_to_exclude(" in _func_segment(name), name


def test_both_read_the_parents_advance_paid_amount():
    src = _src()
    assert src.count('"advance_paid_amount": 1}') >= 2, (
        "both parent projections must fetch advance_paid_amount or the "
        "exclusion silently computes zero")


def test_the_adjustment_happens_after_bill_amount_is_settled():
    """bill_amount is compared against parent_balance, so it has to be final."""
    seg = _func_segment("pay_approval")
    assert seg.index("bill_amount = _parent_total") < seg.index("_prior_phase_paid_to_exclude(")


def test_the_case_is_documented_in_the_helper():
    seg = _func_segment("_prior_phase_paid_to_exclude")
    assert "USB-MR1801" in seg
