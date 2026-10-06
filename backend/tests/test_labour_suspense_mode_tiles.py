"""Labour Suspense mode tiles must follow the cheque, not the expense method
(Oct 6 2026).

Accounts > Suspense A/c > Labour read:

    CASH 1,86,949    HDFC CURRENT 0    HDFC SAVINGS 0    CHEQUE -81,017

against a 1,05,932 total. The total was right - it matched the four
contractors (7,179 + 22,583 + 10,500 + 65,670) - but a suspense tile cannot
truthfully go below zero: you cannot spend more of a mode than ever entered
it. That negative was the proof the split was misassigned.

The whole CASH tile was two rows:

    sl_37be6835  KAG TILES  99,670  cheque_no 350532
                 "Cheque 350532 excess from approved 1,480"
    sl_5ded242b  Yuvaraj    87,279  cheque_no 521266
                 "Cheque 521266 excess from approved 12,900"

Both name their cheque in the description AND carry a cheque_no. Neither is
cash. They were filed under Cash because the mode fell to

    row.payment_mode  or  linked_expense.payment_method  or  cheque_no

and their linked expense recorded method "cash", while every debit that spent
them recorded "cheque". The cheque_no - the strongest evidence on the row -
was consulted last, only if the other two were empty.

Reordering so cheque_no outranks the linked expense's method puts all of it in
one bucket: CASH 0, CHEQUE 1,05,932, matching the header exactly.

A hypothesis worth recording as DISPROVED: the asymmetry was NOT credits and
debits reading different fields. The live audit showed both sides resolving
through "linked expense payment_method" - 31 credits and 90 debits, same
source. Acting on that guess would have changed the wrong thing.
"""
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


# --------------------------------------------------------------------------
# The precedence, mirrored from the endpoint
# --------------------------------------------------------------------------

def resolve_mode(row_payment_mode=None, cheque_no=None, expense_method=None):
    return (row_payment_mode
            or ("cheque" if cheque_no else None)
            or expense_method)


# The two rows that made up the entire CASH tile.
MISFILED = [
    ("sl_37be6835", 99670.00, "350532", "cash"),
    ("sl_5ded242b", 87279.00, "521266", "cash"),
]
CHEQUE_NET_BEFORE = -81017.00
TRUE_TOTAL = 105932.00


def test_a_row_with_a_cheque_number_is_cheque():
    for _, _, cheque_no, expense_method in MISFILED:
        assert resolve_mode(cheque_no=cheque_no, expense_method=expense_method) == "cheque"


def test_the_old_precedence_called_them_cash():
    """Proof this was the cause, not something downstream."""
    def old(row_payment_mode=None, cheque_no=None, expense_method=None):
        return (row_payment_mode or expense_method
                or ("cheque" if cheque_no else None))
    for _, _, cheque_no, expense_method in MISFILED:
        assert old(cheque_no=cheque_no, expense_method=expense_method) == "cash"


def test_the_whole_cash_tile_was_those_two_rows():
    assert round(sum(a for _, a, _, _ in MISFILED), 2) == 186949.00


def test_moving_them_clears_the_negative_and_matches_the_total():
    moved = round(sum(a for _, a, _, _ in MISFILED), 2)
    assert round(CHEQUE_NET_BEFORE + moved, 2) == TRUE_TOTAL
    assert round(TRUE_TOTAL, 2) == round(7179 + 22583 + 10500 + 65670, 2)


def test_no_tile_goes_negative_afterwards():
    assert CHEQUE_NET_BEFORE + 186949.00 > 0


# --------------------------------------------------------------------------
# The rest of the precedence must be unchanged
# --------------------------------------------------------------------------

def test_an_explicit_row_mode_still_wins():
    """The ledger row's own payment_mode is the most direct statement there
    is - a cheque_no must not override it."""
    assert resolve_mode(row_payment_mode="hdfc_current", cheque_no="123456") == "hdfc_current"


def test_the_expense_method_is_still_used_when_there_is_no_cheque():
    assert resolve_mode(expense_method="hdfc_savings") == "hdfc_savings"


def test_a_genuine_cash_row_stays_cash():
    """No cheque_no, so nothing changes for real cash suspense."""
    assert resolve_mode(expense_method="cash") == "cash"


def test_nothing_anywhere_means_unattributed():
    assert resolve_mode() is None


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_endpoint_checks_the_cheque_before_the_expense():
    src = _src()
    block = src[src.index('"mode": (row.get("payment_mode")'):]
    block = block[:block.index('"status": src.get("status")')]
    assert block.index('"cheque" if row.get("cheque_no")') < block.index('src.get("payment_method")')


def test_the_audit_mirrors_the_same_precedence():
    """If the diagnostic and the page disagree, the diagnostic is useless."""
    src = _src()
    assert "mode = own or from_cheque_no or from_exp" in src
    assert "mode = own or from_exp or from_cheque_no" not in src


def test_the_audit_flags_a_cheque_row_filed_elsewhere():
    src = _src()
    assert 'if e.get("cheque_no") and e.get("mode_bucket") != "cheque"' in src


def test_the_audits_source_comparison_compares_sources_not_counts():
    """It previously compared the whole dicts, so {'x': 31} vs {'x': 90} read
    as 'different places' when both were the same place."""
    src = _src()
    assert "if set(credit_sources) != set(debit_sources):" in src


def test_the_case_is_documented():
    src = _src()
    assert "sl_37be6835" in src
    assert "350532" in src
