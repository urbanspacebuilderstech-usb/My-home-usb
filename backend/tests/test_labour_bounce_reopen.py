"""Regression tests: a cheque bounce reopens ONLY the bounced leg.

Venkatesh RAB-07 (Mr harish Gunasekaran): Cheque #000013 for 1,00,000 bounced
on 10 Aug 2026 ("signature mismatch"). The expense was correctly marked
cheque_bounced and dropped out of the Cashbook, but the RAB stayed
status="approved" - reading as Released and fully paid while no live expense
existed, so the contractor was owed the money with nothing in any queue.

The bounce handler re-queued material bills and had no labour branch at all.

Core rule under test: reopen the amount funded by the BOUNCED CHEQUE, never the
whole bill. Suspense / cash / bank legs that settled part of it stay valid and
are not re-demanded.

    python -m pytest tests/test_labour_bounce_reopen.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.financial import bounced_leg_amount  # noqa: E402
from routes.projects import rab_payable_amount   # noqa: E402

CHQ = "chq_x1"


# --- the worked example from the spec -----------------------------------------
# Bill 1,00,000 = 10,000 suspense + 90,000 cheque. The cheque bounces.

def test_cheque_plus_suspense_reopens_only_the_cheque_leg():
    exp = {"amount": 90000.0, "payment_entries": [
        {"method": "cheque", "amount": 90000.0, "cheque_ids": [CHQ]},
    ]}
    assert bounced_leg_amount(exp, CHQ, 90000.0) == 90000.0


def test_suspense_portion_is_not_reopened():
    """The 10,000 already applied from suspense must not come back as payable,
    or the same credit would be spent twice."""
    pr = {"amount": 100000.0, "reopened_amount": 90000.0}
    assert rab_payable_amount(pr) == 90000.0
    assert rab_payable_amount(pr) != 100000.0


def test_repaying_the_reopened_amount_settles_the_bill_exactly_once():
    """10,000 suspense (already applied) + 90,000 repaid = 100,000, once."""
    suspense_applied, reopened = 10000.0, 90000.0
    pr = {"amount": 100000.0, "reopened_amount": reopened}
    repaid = rab_payable_amount(pr)
    assert repaid == 90000.0
    assert suspense_applied + repaid == 100000.0


# --- every funding shape ------------------------------------------------------

def test_100_percent_cheque_payment():
    exp = {"amount": 100000.0, "payment_entries": [
        {"method": "cheque", "amount": 100000.0, "cheque_ids": [CHQ]}]}
    assert bounced_leg_amount(exp, CHQ, 100000.0) == 100000.0


def test_cheque_plus_cash_reopens_only_the_cheque():
    exp = {"amount": 100000.0, "payment_entries": [
        {"method": "cheque", "amount": 70000.0, "cheque_ids": [CHQ]},
        {"method": "cash", "amount": 30000.0},
    ]}
    assert bounced_leg_amount(exp, CHQ, 70000.0) == 70000.0


def test_cheque_plus_bank_reopens_only_the_cheque():
    exp = {"amount": 100000.0, "payment_entries": [
        {"method": "cheque", "amount": 40000.0, "cheque_ids": [CHQ]},
        {"method": "current_account", "amount": 60000.0, "bank_ref": "UTR1"},
    ]}
    assert bounced_leg_amount(exp, CHQ, 40000.0) == 40000.0


def test_multi_leg_with_two_cheques_reopens_only_the_bounced_one():
    exp = {"amount": 100000.0, "payment_entries": [
        {"method": "cheque", "amount": 25000.0, "cheque_ids": [CHQ]},
        {"method": "cheque", "amount": 45000.0, "cheque_ids": ["chq_other"]},
        {"method": "cash", "amount": 30000.0},
    ]}
    assert bounced_leg_amount(exp, CHQ, 25000.0) == 25000.0
    assert bounced_leg_amount(exp, "chq_other", 45000.0) == 45000.0


def test_one_leg_naming_several_cheques_still_matches():
    exp = {"amount": 80000.0, "payment_entries": [
        {"method": "cheque", "amount": 80000.0, "cheque_ids": [CHQ, "chq_b"]}]}
    assert bounced_leg_amount(exp, CHQ, 50000.0) == 80000.0


# --- legacy rows without payment_entries (the Venkatesh shape) ----------------

def test_legacy_single_cheque_expense_without_legs():
    """RAB-07's mirror stored no payment_entries at all - fall back to the
    expense amount when the method is cheque."""
    exp = {"amount": 100000.0, "payment_method": "cheque", "payment_entries": None}
    assert bounced_leg_amount(exp, CHQ, 100000.0) == 100000.0


def test_cheque_face_larger_than_the_expense_is_capped():
    """A 2,00,000 cheque part-funding a 60,000 bill reopens 60,000, not the face."""
    exp = {"amount": 60000.0, "payment_method": "cheque", "payment_entries": []}
    assert bounced_leg_amount(exp, CHQ, 200000.0) == 60000.0


# --- rab_payable_amount fallbacks ---------------------------------------------

def test_untouched_request_is_payable_for_its_full_amount():
    assert rab_payable_amount({"amount": 100000.0}) == 100000.0


def test_zero_or_missing_reopened_amount_falls_back_to_the_bill():
    assert rab_payable_amount({"amount": 50000.0, "reopened_amount": 0}) == 50000.0
    assert rab_payable_amount({"amount": 50000.0, "reopened_amount": None}) == 50000.0


def test_a_bad_reopened_value_never_breaks_the_payable():
    assert rab_payable_amount({"amount": 50000.0, "reopened_amount": "oops"}) == 50000.0


def test_reopened_amount_never_exceeds_what_the_bounce_returned():
    """Reopening must not inflate the bill: 90,000 back on a 1,00,000 bill."""
    pr = {"amount": 100000.0, "reopened_amount": 90000.0}
    assert rab_payable_amount(pr) <= pr["amount"]
