"""A part-settled bill must show as partially collected (Sep 25 2026).

USB-MR1181 (Inner Primer / SAI VISHNU PAINTS, Mr Sudharsan): 610 of a 6,360
bill was settled from the vendor's suspense credit. The approvals card still
read "6,360 / 0" and sat in Pending instead of Partially Collected.

One field caused all of it. pay_approval wrote the mirror's paid_amount from
`new_total_paid`, which is cash-only and therefore 0 for a suspense-funded
payment. The accountant queue derives what has been collected from exactly
that field:

    mirror_partial += m["paid_amount"]          # for mirrors in partially_paid
    collected       = adv_paid + mirror_partial
    if collected > 0.01 and bal > 0.01: r["partially_collected"] = True

collected was 0, so the flag was never set, the row stayed in Pending, and the
full amount still looked due.

paid_amount now records `settled_this_phase` (cash + suspense credit).
remaining_balance is unchanged in value - `bill - credit_used - new_total_paid`
and `bill - settled_this_phase` are the same number - but both are now written
against one figure so they cannot drift.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")
CARD = os.path.join(BACKEND, "..", "frontend", "src", "components",
                    "AccountantMaterialPayments.jsx")


def _pay_approval():
    src = io.open(FINANCIAL, encoding="utf8").read()
    for n in ast.parse(src).body:
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == "pay_approval":
            return ast.get_source_segment(src, n) or "", src
    raise AssertionError("pay_approval not found")


# --------------------------------------------------------------------------
# The arithmetic
# --------------------------------------------------------------------------

def settled(already, effective, credit):
    return round(already + effective + credit, 2)


def queue_collected(adv_paid, mirror_paid_amount):
    """What /procurement-simple/accountant/queue computes."""
    return adv_paid + mirror_paid_amount


def usb_mr1181():
    """The real case: 610 from suspense against a 6,360 bill."""
    bill, already, effective, credit = 6360.0, 0.0, 0.0, 610.0
    return bill, settled(already, effective, credit)


def test_the_reported_case_now_records_610():
    bill, paid = usb_mr1181()
    assert paid == 610.0, "the suspense-funded 610 must be recorded as paid"
    assert round(bill - paid, 2) == 5750.0, "balance must be 5,750"


def test_the_row_now_qualifies_as_partially_collected():
    bill, paid = usb_mr1181()
    collected = queue_collected(0.0, paid)
    balance = max(0.0, bill - collected)
    assert collected > 0.01 and balance > 0.01, (
        "queue requires collected > 0 AND a balance to set partially_collected")


def test_it_did_not_qualify_before_the_fix():
    """Proof this was the blocker, not something else."""
    cash_only = 0.0   # new_total_paid for a fully suspense-funded payment
    collected = queue_collected(0.0, cash_only)
    assert not (collected > 0.01), "old behaviour: never flagged partially collected"


def test_remaining_balance_is_unchanged_by_the_rewrite():
    """`bill - credit_used - new_total_paid` == `bill - settled_this_phase`."""
    for bill, already, effective, credit in [
        (6360.0, 0.0, 0.0, 610.0),
        (1000.0, 0.0, 400.0, 100.0),
        (500.0, 100.0, 50.0, 0.0),
        (100.0, 0.0, 0.0, 100.0),
    ]:
        old = max(0.0, bill - credit - (already + effective))
        new = max(0.0, bill - settled(already, effective, credit))
        assert old == pytest.approx(new)


@pytest.mark.parametrize("already,effective", [(0.0, 500.0), (200.0, 300.0), (0.0, 0.0)])
def test_cash_payments_are_unaffected(already, effective):
    assert settled(already, effective, 0.0) == round(already + effective, 2)


def test_full_settlement_from_suspense_is_not_marked_partial():
    """If suspense covers the whole bill there is no balance, so the row must
    complete rather than sit in Partially Collected."""
    bill = 610.0
    paid = settled(0.0, 0.0, 610.0)
    assert paid == bill
    assert max(0.0, bill - paid) == 0.0


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_mirror_paid_amount_uses_the_settled_figure():
    seg, _ = _pay_approval()
    assert '"paid_amount": settled_this_phase,' in seg
    assert '"paid_amount": new_total_paid,' not in seg


def test_remaining_balance_written_against_the_same_figure():
    seg, _ = _pay_approval()
    assert 'max(0.0, bill_amount - settled_this_phase)' in seg
    assert "bill_amount - credit_used - new_total_paid" not in seg


def test_new_total_paid_still_exists_for_cash_only_semantics():
    seg, _ = _pay_approval()
    assert "new_total_paid = already_paid + effective_paid" in seg


def test_queue_still_derives_collected_from_mirror_paid_amount():
    """If this changes, the fix above stops reaching the board."""
    src = io.open(PROCUREMENT, encoding="utf8").read()
    assert 'mirror_partial += float(m.get("paid_amount") or 0)' in src
    assert 'r["partially_collected"] = True' in src
    assert 'r["collected_amount"] = collected' in src


def test_card_reads_the_collected_amount_the_queue_computes():
    ui = io.open(CARD, encoding="utf8").read()
    assert "req.collected_amount ?? req.paid_amount ?? 0" in ui
    assert "const paid = req.paid_amount || 0;" not in ui


def test_card_banner_uses_the_queue_balance():
    ui = io.open(CARD, encoding="utf8").read()
    assert "req.balance_due ?? req.remaining_balance" in ui
    assert "req.partially_collected" in ui
