"""USB-MR1255: a wiped paid_amount with a surviving payment row (Oct 20 2026).

M-Sand / OM MURUGA EARTH (Mr. Muralikannan), bill 16,885. On Oct 8 15,895.37
was settled from the vendor's suspense (Cashbook: "M-Sand (via Cheque #105863
suspense)"). The bill later came back pending with paid_amount wiped while
remaining_balance 989.63 and last_partial_paid_at stayed, so:

    card       "Partially Paid: 0 of 16,885 paid"   Balance 990   tab Pending
    Pay & Settle  Net Payable 16,885                (a second full payment)

recover_wiped_paid_amounts proves the real figure from two records that must
agree (the bill's own live payment rows + its remaining_balance = the bill),
and every reader of "already paid" uses it. /admin/usb-mr1255-paid-repair-*
writes the figure back onto the bill. These tests pin both.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")
CARD = os.path.join(BACKEND, "..", "frontend", "src", "components", "AccountantMaterialPayments.jsx")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
    "find_one_and_replace", "bulk_write", "drop",
}
CONSTANTS = ("_PAID_LEG_EXCLUDED_STATUS", "_PAID_RECOVERY_STATUSES", "_MR1255", "_MR1255_BAD_CHEQUE_STATUS")
PURE = ("_num", "_material_bill_amount", "_is_paid_recovery_candidate", "corroborated_paid_from_legs",
        "_mr1255_paid_repair_decide")


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
    """The pure helpers and their constants, from the real source."""
    src = _read(FINANCIAL)
    ns = {}
    exec("from typing import Any, Dict, List", ns)
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id in CONSTANTS for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
    for name in PURE:
        exec(_seg(name), ns)
    return ns


NS = _load()
recover = NS["corroborated_paid_from_legs"]
decide = NS["_mr1255_paid_repair_decide"]


def bill(**over):
    b = {"expense_id": "mexp_1255", "status": "pending_accounts_approval", "final_amount": 16885.0,
         "paid_amount": None, "remaining_balance": 989.63, "last_partial_paid_at": "2026-10-08T10:00:00+00:00"}
    b.update(over)
    return b


def leg(**over):
    l = {"expense_id": "exp_susp", "request_id": "mexp_1255", "amount": 15895.37, "status": "approved",
         "source": "approval_suspense", "cheque_id": "chq_105863"}
    l.update(over)
    return l


# --------------------------------------------------------------------------
# The recovery rule
# --------------------------------------------------------------------------

def test_mr1255_as_reported_recovers_the_suspense_payment():
    assert recover(bill(), [leg()]) == 15895.37


def test_partially_paid_with_zero_recorded_recovers_too():
    """USB-MR1181's shape: status kept, paid_amount 0 from the cash-only bug."""
    assert recover(bill(status="partially_paid", paid_amount=0), [leg()]) == 15895.37


def test_a_real_stored_figure_is_never_replaced():
    assert recover(bill(paid_amount=100.0), [leg()]) == 0.0


def test_no_partial_payment_stamp_means_no_recovery():
    assert recover(bill(last_partial_paid_at=None), [leg()]) == 0.0


def test_a_settled_or_rejected_bill_is_left_alone():
    for status in ("paid", "accountant_rejected", "superseded"):
        assert recover(bill(status=status), [leg()]) == 0.0, status


def test_rows_of_another_bill_are_not_evidence():
    assert recover(bill(), [leg(request_id="mexp_other")]) == 0.0


def test_bounced_rejected_or_deleted_rows_are_not_evidence():
    for bad in (leg(status="cheque_bounced"), leg(status="accountant_rejected"), leg(is_deleted=True)):
        assert recover(bill(), [bad]) == 0.0


def test_rows_and_balance_must_add_up_to_the_bill():
    """A phase-reused mirror (advance rows + a balance-phase remaining) or any
    other mismatch proves nothing, so the stored 0 stands."""
    assert recover(bill(remaining_balance=500.0), [leg()]) == 0.0
    assert recover(bill(), [leg(), leg(expense_id="exp_adv", amount=5000.0)]) == 0.0


def test_fifty_paise_of_rounding_is_tolerated():
    assert recover(bill(remaining_balance=990.0), [leg()]) == 15895.37


def test_odd_stored_values_do_not_raise():
    """It runs over every row of the Approvals list."""
    assert recover(bill(paid_amount="", remaining_balance="n/a"), [leg(amount=None)]) == 0.0
    assert recover({}, []) == 0.0


# --------------------------------------------------------------------------
# Every reader uses it
# --------------------------------------------------------------------------

def test_already_paid_recovers_a_wiped_zero():
    seg = _seg("_reconciled_already_paid")
    assert "recover_wiped_paid_amounts([req])" in seg
    assert "USB-MR1255" in seg


def test_pay_context_nets_already_paid_whatever_the_status():
    """pay_approval subtracts already_paid regardless of status; the preview
    must too or it pre-fills the full bill while showing the balance."""
    seg = _seg("get_pay_context")
    assert "is_continuation = already_paid > 0\n" in seg
    assert 'is_continuation = already_paid > 0 and req.get("status") == "partially_paid"' not in seg
    assert "payable = max(0.0, bill_amount - already_paid - credit_used)" in _seg("pay_approval")


def test_unified_approvals_tags_the_recovered_figure():
    seg = _seg("get_unified_approvals")
    assert "recover_wiped_paid_amounts(materials)" in seg
    assert 'item["collected_amount"]' in seg


def test_legacy_card_reads_the_recovered_figure():
    ui = _read(CARD)
    assert "const legacyPaid = (exp) => exp.collected_amount || exp.total_paid || exp.paid_amount || 0;" in ui
    assert "const paid = legacyPaid(exp);" in ui
    assert "{fmt(legacyPaid(exp))} of {fmt(amt)} paid" in ui
    assert "{fmt(amt)} / {fmt(legacyPaid(exp))}" in ui


def test_live_queue_counts_the_recovered_figure():
    src = _read(PROCUREMENT)
    assert "recover_wiped_paid_amounts(_all_mirrors)" in src
    assert 'mirror_partial += _recovered_paid.get(m.get("expense_id"), 0.0)' in src
    # The fields the rule needs must be in the mirror projection.
    for f in ('"last_partial_paid_at": 1', '"final_amount": 1', '"remaining_balance": 1'):
        assert f in src, f


# --------------------------------------------------------------------------
# The one-off repair
# --------------------------------------------------------------------------

REQUEST = {"request_id": "mreq_1255", "request_number": "USB-MR1255", "status": "pending_accounts_approval"}
CHEQUE = {"cheque_id": "chq_105863", "cheque_number": "105863", "status": "deposited"}
DEBIT = {"entry_id": "se_1255", "amount": -15895.37, "linked_expense_id": "exp_susp"}


def plan(**over):
    args = dict(request=REQUEST, bills=[bill()], legs=[leg()], broad_paid=15895.37,
                cheques=[CHEQUE], debits=[DEBIT], restores=[])
    args.update(over)
    return decide(**args)


def test_repair_restores_the_paid_amount_as_reported():
    assert plan() == {"problems": [], "steps": ["restore_paid_amount"]}


def test_a_rerun_after_apply_plans_nothing():
    assert plan(bills=[bill(paid_amount=15895.37)]) == {"problems": [], "steps": []}


def test_repair_refuses_when_the_cheque_came_back():
    for status in ("bounced", "deleted", "cancelled"):
        p = plan(cheques=[dict(CHEQUE, status=status)])
        assert any("105863 is %s" % status in x for x in p["problems"]), status


def test_repair_refuses_when_the_cheque_cannot_be_found_or_differs():
    assert any("not found" in x for x in plan(cheques=[])["problems"])
    assert any("expected #105863" in x for x in plan(cheques=[dict(CHEQUE, cheque_number="222222")])["problems"])


def test_repair_refuses_after_a_partial_bounce_restore():
    assert any("Restore" in x for x in plan(restores=["se_restore"])["problems"])


def test_repair_refuses_without_the_suspense_debit_behind_the_payment():
    assert any("suspense debits" in x for x in plan(debits=[])["problems"])


def test_repair_refuses_when_rows_are_missing_or_borrowed():
    assert any("live payment rows" in x for x in plan(legs=[leg(status="cheque_bounced")])["problems"])
    assert any("another bill" in x for x in plan(broad_paid=20000.0)["problems"])


def test_repair_refuses_a_bill_that_moved_on():
    assert any("no longer waiting" in x for x in plan(bills=[bill(status="paid")])["problems"])
    assert any("paid_amount is 500" in x for x in plan(bills=[bill(paid_amount=500.0)])["problems"])
    assert any("expected exactly 1" in x for x in plan(bills=[bill(), bill(expense_id="mexp_2")])["problems"])


def test_dry_run_cannot_write():
    assert _writes("_plan_mr1255_paid_repair") == []
    assert _writes("usb_mr1255_paid_repair_dryrun") == []


def test_apply_writes_only_the_bill_and_pins_the_checked_value():
    assert _writes("usb_mr1255_paid_repair_apply") == ["db.material_expenses.update_one"]
    seg = _seg("usb_mr1255_paid_repair_apply")
    assert '"paid_amount": bill["paid_amount"]}' in seg
    assert "user.role != UserRole.SUPER_ADMIN" in seg
    assert '"status"' not in seg.split("$set")[1].split("}")[0]
