"""Every bill showing "Partially Paid: 0 of X paid" (Oct 20 2026).

After USB-MR1255, USB-MR1494 and USB-MR1156 (M Sand / OM MURUGA EARTH,
Mr Shiva, 16,445 each) turned up with the same card: a Partially Paid badge
and a Balance (185 / 2,890) next to "0 paid", Pay & Settle asking for the full
16,445. The same card has two opposite truths - the payment is still live and
paid_amount was wiped, or a bounced / deleted cheque took the money back and
it is the badge and Balance that are left over. /admin/wiped-paid-bills-scan
sorts each bill by its own payment rows; the apply fixes only what they prove.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
CARD = os.path.join(BACKEND, "..", "frontend", "src", "components", "AccountantMaterialPayments.jsx")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
    "find_one_and_replace", "bulk_write", "drop",
}
CONSTANTS = ("_PAID_LEG_EXCLUDED_STATUS", "_GONE_CHEQUE_STATUS", "_PARTIAL_STAMP_FIELDS", "_WIPED_FIXABLE")
PURE = ("_num", "_material_bill_amount", "_is_suspense_leg", "_classify_wiped_bill", "_wiped_bill_after")


def _read(path):
    return io.open(path, encoding="utf8").read()


def _func(name):
    src = _read(FINANCIAL)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found in financial.py")


def _seg(name):
    node, src = _func(name)
    return ast.get_source_segment(src, node) or ""


def _writes(name):
    node, _ = _func(name)
    return [ast.unparse(c.func.value) + "." + c.func.attr for c in ast.walk(node)
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr in WRITE_METHODS]


def _load():
    src = _read(FINANCIAL)
    ns = {}
    exec("from typing import Any, Dict, List, Optional", ns)
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id in CONSTANTS for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
    for name in PURE:
        exec(_seg(name), ns)
    return ns


NS = _load()
classify = NS["_classify_wiped_bill"]
after = NS["_wiped_bill_after"]


def bill(**over):
    b = {"expense_id": "mexp_1494", "status": "pending_accounts_approval", "final_amount": 16445.0,
         "paid_amount": None, "remaining_balance": 185.0, "last_partial_paid_at": "2026-09-29T10:00:00+00:00"}
    b.update(over)
    return b


def cheque_leg(**over):
    l = {"expense_id": "exp_chq", "request_id": "mexp_1494", "amount": 16260.0, "status": "approved",
         "source": "approval", "payment_method": "cheque", "cheque_id": "chq_1"}
    l.update(over)
    return l


def susp_leg(**over):
    l = {"expense_id": "exp_susp", "request_id": "mexp_1494", "amount": 16260.0, "status": "approved",
         "source": "approval_suspense", "credit_applied": 16260.0, "cheque_id": "chq_1"}
    l.update(over)
    return l


def run(b=None, legs=None, broad=None, cheques=None, debits=None, restored=None):
    legs = [cheque_leg()] if legs is None else legs
    live_total = round(sum(l["amount"] for l in legs
                           if not l.get("is_deleted") and l["status"] not in NS["_PAID_LEG_EXCLUDED_STATUS"]), 2)
    return classify(b or bill(), legs, live_total if broad is None else broad,
                    {"chq_1": "deposited"} if cheques is None else cheques,
                    {} if debits is None else debits, set() if restored is None else restored)


# --------------------------------------------------------------------------
# The fixable cases
# --------------------------------------------------------------------------

def test_live_payment_with_a_wiped_paid_amount_gets_it_back():
    v = run()
    assert v["class"] == "paid_amount_wiped"
    assert v["fix"] == {"set": {"paid_amount": 16260.0, "remaining_balance": 185.0}}


def test_mr1255_suspense_shape():
    b = bill(expense_id="mexp_1255", final_amount=16885.0, remaining_balance=989.63)
    leg = susp_leg(request_id="mexp_1255", amount=15895.37, credit_applied=15895.37)
    v = run(b, [leg], debits={"exp_susp": -15895.37})
    assert v["class"] == "paid_amount_wiped"
    assert v["fix"]["set"] == {"paid_amount": 15895.37, "remaining_balance": 989.63}


def test_everything_bounced_clears_the_left_over_badge_and_balance():
    """bounce_cheque / delete-cheque wipe paid_amount but keep the stamps."""
    v = run(legs=[cheque_leg(status="cheque_bounced")], cheques={"chq_1": "bounced"})
    assert v["class"] == "stale_after_bounce"
    assert v["fix"] == {"unset": ["remaining_balance", "last_partial_paid_at",
                                  "last_partial_paid_by", "last_partial_paid_by_name"]}


def test_suspense_bounce_resets_the_balance_to_the_full_bill():
    """_reverse_cheque_material_suspense_and_bills writes remaining = bill."""
    v = run(bill(remaining_balance=16445.0), [susp_leg(status="cheque_bounced")])
    assert v["class"] == "stale_after_bounce"


def test_part_bounced_keeps_only_the_good_money():
    """USB-MR1156 shape if one of two payments bounced: 13,555 paid, 2,890 left."""
    legs = [cheque_leg(amount=10000.0, status="cheque_bounced"),
            cheque_leg(expense_id="exp_cash", amount=3555.0, payment_method="cash", cheque_id=None)]
    v = run(bill(expense_id="mexp_1494", remaining_balance=2890.0), legs)
    assert v["class"] == "partly_bounced"
    assert v["fix"]["set"] == {"paid_amount": 3555.0, "remaining_balance": 12890.0}


# --------------------------------------------------------------------------
# Left alone
# --------------------------------------------------------------------------

def test_no_payment_row_at_all_is_unclear():
    assert run(legs=[])["class"] == "unclear"
    assert run(legs=[cheque_leg(is_deleted=True)])["class"] == "unclear"


def test_live_payment_on_a_cheque_that_came_back_is_unclear():
    for status in ("bounced", "deleted", "cancelled"):
        v = run(cheques={"chq_1": status})
        assert v["class"] == "unclear" and status in v["reason"], status


def test_live_payment_naming_a_missing_cheque_is_unclear():
    assert run(cheques={})["class"] == "unclear"


def test_suspense_payment_needs_its_own_debit_and_no_restore():
    assert run(legs=[susp_leg()])["class"] == "unclear"
    v = run(legs=[susp_leg()], debits={"exp_susp": -16260.0}, restored={"exp_susp"})
    assert v["class"] == "unclear" and "handed back" in v["reason"]
    assert run(legs=[susp_leg()], debits={"exp_susp": -16260.0})["class"] == "paid_amount_wiped"


def test_rows_linked_another_way_are_unclear():
    assert run(broad=20000.0)["class"] == "unclear"


def test_amounts_that_do_not_add_up_are_unclear():
    assert run(bill(remaining_balance=500.0))["class"] == "unclear"
    assert run(bill(remaining_balance=500.0), [cheque_leg(status="cheque_bounced")])["class"] == "unclear"


def test_rejected_rows_alone_prove_nothing():
    assert run(legs=[cheque_leg(status="accountant_rejected")])["class"] == "unclear"


def test_after_describes_the_card_and_the_dialog():
    v = run()
    assert after(v["class"], 16445.0, v["fix"]) == {
        "card": "Partially Collected - 16260.0 of 16445.0 paid, Balance 185.0",
        "pay_and_settle_asks_for": 185.0}
    s = run(legs=[cheque_leg(status="cheque_bounced")])
    assert after(s["class"], 16445.0, s["fix"])["pay_and_settle_asks_for"] == 16445.0
    assert after("unclear", 16445.0, None) == "unchanged"


# --------------------------------------------------------------------------
# Structure
# --------------------------------------------------------------------------

def test_scan_reads_only_and_picks_the_right_bills():
    assert _writes("_plan_wiped_paid_scan") == []
    assert _writes("wiped_paid_bills_scan") == []
    seg = _seg("_plan_wiped_paid_scan")
    assert 'b.get("last_partial_paid_at")' in seg
    assert '_num(b.get("paid_amount")) <= 0.5' in seg
    assert "user.role != UserRole.SUPER_ADMIN" in _seg("wiped_paid_bills_scan")


def test_apply_writes_only_proven_bills_and_pins_what_it_read():
    assert _writes("wiped_paid_bills_apply") == ["db.material_expenses.update_one"]
    seg = _seg("wiped_paid_bills_apply")
    assert "user.role != UserRole.SUPER_ADMIN" in seg
    assert "await _plan_wiped_paid_scan()" in seg
    assert 'if r["class"] not in _WIPED_FIXABLE:' in seg
    assert '{"expense_id": r["expense_id"], **r["stored"]}' in seg
    assert '"status"' not in seg


def test_legacy_card_shows_why_a_bill_went_back_to_unpaid():
    ui = _read(CARD)
    assert "acc-mat-bounced-legacy-" in ui
    assert "{exp.cheque_bounced && (" in ui
