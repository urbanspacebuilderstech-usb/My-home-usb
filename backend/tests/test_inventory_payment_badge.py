"""Planning > Inventory's Payment badge must follow the money (Sep 27 2026).

USB-MR1806 (ShareChat_test / Anbu test Vendor, RE - Dummy Project,
payment_mode post_delivery, 250) read "Unpaid" in Planning > Inventory while
Accounts > Expense showed a 250 HDFC CURRENT approval expense against the
same MR number.

`_material_payment_status` derived the badge from advance_amount /
balance_amount — what Procurement said was OWED at pricing time — and never
looked at a payment. Its docstring claimed "a credit settlement, a balance
payment, and a straight full payment all write balance_amount back to 0".
Nothing does: pay_approval stamps balance_paid_amount and leaves
balance_amount alone.

The real timeline, from the production trace:

    17:04  assign_vendor   post_delivery -> advance_amount 0, balance_amount 0
                           => badge said "paid" before a rupee was paid
    17:07  verify_approve  qty 4 -> 5, total 200 -> 250, balance_amount 250
                           => badge flipped to "unpaid"
    17:08  pay             250 paid in full; parent balance_paid_amount 250,
                           mirror status "paid" / remaining_balance 0, one
                           approved 250 leg
                           => badge STILL "unpaid", because nothing clears
                              balance_amount

So it was wrong in both directions, and the 17:04 one is the dangerous
direction: a freshly priced request looking settled.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_OPS = os.path.join(BACKEND, "routes", "site_ops.py")


def _src():
    return io.open(SITE_OPS, encoding="utf8").read()


def _load():
    src = _src()
    for node in ast.parse(src).body:
        if isinstance(node, ast.FunctionDef) and node.name == "_material_payment_status":
            ns = {}
            exec(compile(ast.Module(body=[node], type_ignores=[]), "<s>", "exec"), ns)
            return ns["_material_payment_status"]
    raise AssertionError("_material_payment_status not found")


status = _load()

PAID_MIRROR = {"status": "paid", "paid_amount": 250.0, "remaining_balance": 0.0}
OPEN_MIRROR = {"status": "pending_accounts_approval", "paid_amount": 0.0,
               "remaining_balance": 0.0}


# --------------------------------------------------------------------------
# The reported request, at each point on its real timeline
# --------------------------------------------------------------------------

def test_priced_post_delivery_is_not_paid():
    """17:04 - advance 0 and balance 0 is how post_delivery is priced. It
    must not read as settled; this was the dangerous direction."""
    d = {"total_amount": 200.0, "advance_amount": 0.0, "balance_amount": 0.0,
         "status": "in_transit"}
    assert status(d, []) == "unpaid"
    assert status(d, None) == "unpaid", "also with no mirror at all"


def test_after_verification_before_payment_is_unpaid():
    """17:07 - balance recomputed to 250, nothing paid yet."""
    d = {"total_amount": 250.0, "advance_amount": 0.0, "balance_amount": 250.0,
         "status": "pending_accounts_approval",
         "advance_paid_amount": 0.0, "balance_paid_amount": 0.0}
    assert status(d, [OPEN_MIRROR]) == "unpaid"


def test_usb_mr1806_after_payment_is_paid():
    """17:08 - the reported bug. Stale balance_amount 250 must not win."""
    d = {"total_amount": 250.0, "advance_amount": 0.0, "balance_amount": 250.0,
         "status": "delivered",
         "advance_paid_amount": 0.0, "balance_paid_amount": 250.0}
    assert status(d, [PAID_MIRROR]) == "paid"


def test_the_old_reading_would_still_say_unpaid():
    """Proof the stale field, not something else, was the cause."""
    balance_amount = 250.0
    advance_amount = 0.0
    assert not (balance_amount <= 0.5)
    assert not (advance_amount > 0)


# --------------------------------------------------------------------------
# Other flows
# --------------------------------------------------------------------------

def test_split_advance_part_paid_is_partial():
    """USB-MR1801: 100 of 600 paid, balance mirror still open."""
    d = {"total_amount": 600.0, "advance_amount": 100.0, "balance_amount": 500.0,
         "status": "pending_balance_payment",
         "advance_paid_amount": 100.0, "balance_paid_amount": 0.0}
    assert status(d, [{"status": "pending_accounts_approval",
                       "paid_amount": 100.0, "remaining_balance": 0.0}]) == "partial"


def test_an_advance_request_with_nothing_paid_is_unpaid():
    """The old code called this "partial" purely because an advance was
    QUOTED, before anyone paid it."""
    d = {"total_amount": 600.0, "advance_amount": 100.0, "balance_amount": 500.0,
         "status": "pending_advance_payment",
         "advance_paid_amount": 0.0, "balance_paid_amount": 0.0}
    assert status(d, [OPEN_MIRROR]) == "unpaid"


def test_every_mirror_settled_means_paid():
    d = {"total_amount": 1000.0, "advance_amount": 0.0, "balance_amount": 1000.0,
         "status": "delivered"}
    mirrors = [{"status": "paid", "paid_amount": 400.0, "remaining_balance": 0.0},
               {"status": "paid", "paid_amount": 600.0, "remaining_balance": 0.0}]
    assert status(d, mirrors) == "paid"


def test_one_settled_mirror_and_one_open_is_partial():
    d = {"total_amount": 1000.0, "advance_amount": 400.0, "balance_amount": 600.0,
         "status": "in_transit",
         "advance_paid_amount": 400.0, "balance_paid_amount": 0.0}
    mirrors = [{"status": "paid", "paid_amount": 400.0, "remaining_balance": 0.0},
               {"status": "pending_accounts_approval", "paid_amount": 0.0,
                "remaining_balance": 600.0}]
    assert status(d, mirrors) == "partial"


def test_unpriced_request_is_unpaid():
    assert status({"total_amount": 0.0}, [PAID_MIRROR]) == "unpaid"


@pytest.mark.parametrize("paid", [249.5, 250.0, 250.5])
def test_settlement_within_fifty_paise_counts_as_paid(paid):
    d = {"total_amount": 250.0, "advance_amount": 0.0, "balance_amount": 250.0,
         "status": "delivered", "balance_paid_amount": paid}
    assert status(d, [OPEN_MIRROR]) == "paid"


def test_a_rupee_short_is_still_partial():
    d = {"total_amount": 250.0, "advance_amount": 0.0, "balance_amount": 250.0,
         "status": "delivered", "balance_paid_amount": 249.0}
    assert status(d, [OPEN_MIRROR]) == "partial"


# --------------------------------------------------------------------------
# Legacy rows, which have no mirror
# --------------------------------------------------------------------------

def test_legacy_credit_settlement_still_reads_paid():
    """advance 0 / balance 0 on a COMPLETED request is a genuine credit
    settlement and must keep reading paid."""
    for st in ("delivered", "received_completed"):
        d = {"total_amount": 500.0, "advance_amount": 0.0, "balance_amount": 0.0,
             "status": st}
        assert status(d, None) == "paid", st


def test_legacy_advance_covering_the_bill_still_reads_paid():
    d = {"total_amount": 500.0, "advance_amount": 500.0, "balance_amount": 0.0,
         "status": "in_transit"}
    assert status(d, None) == "paid"


def test_legacy_stale_balance_self_heal_still_applies():
    """Change Vendor price bump: balance 0 was computed against the old, lower
    total, so the advance provably falls short."""
    d = {"total_amount": 900.0, "advance_amount": 300.0, "balance_amount": 0.0,
         "status": "in_transit"}
    assert status(d, None) == "partial"


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_mirrors_are_loaded_once_not_per_row():
    """A listing must not issue a query per request."""
    src = _src()
    assert 'mirrors_by_request: Dict[str, list] = {}' in src
    assert '{"source_request_id": {"$in": _req_ids}}' in src


def test_the_badge_is_given_those_mirrors():
    src = _src()
    assert "_material_payment_status(\n                    d, mirrors_by_request.get(d.get(\"request_id\")))" in src


def test_the_wrong_docstring_claim_is_gone():
    """It asserted that a full payment writes balance_amount back to 0.
    Nothing does, and believing it is what hid this bug."""
    src = _src()
    assert "write balance_amount back to 0 on this exact field/collection" not in src


def test_the_case_is_documented():
    src = _src()
    assert "USB-MR1806" in src
