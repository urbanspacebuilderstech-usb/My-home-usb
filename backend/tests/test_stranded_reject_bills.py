"""USB-MR1306: a bill left payable in Approvals by an Accounts reject (Oct 26 2026).

UPVC Window / PLS Windows. Advance 83,903.52 paid (50,000 + 33,903.52), then
Procurement verified 154.01 sqft = 84,903.58 and the paid advance bill was
reused as the 1,000.06 balance bill. Accounts rejected it at 14:57 IST, before
0affc40f made a reject take the bill out of Approvals, so the order went back
to Purchase Verification while Approvals kept a Legacy card reading
"83,903.52 of 1,000.06 paid, Balance 33,903.52".

/admin/stranded-reject-bills-* finds such bills and does what the reject does
today. These tests pin the rule.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
    "find_one_and_replace", "bulk_write", "drop",
}


def _read(path):
    return io.open(path, encoding="utf8").read()


def _func(name):
    src = _read(FINANCIAL)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found in financial.py")


def _writes(name):
    node, _ = _func(name)
    return [ast.unparse(c.func.value) + "." + c.func.attr for c in ast.walk(node)
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr in WRITE_METHODS]


def _load():
    ns = {}
    exec("from typing import Any, Dict, List", ns)
    for name in ("_num", "_stranded_reject_decide"):
        node, src = _func(name)
        exec(ast.get_source_segment(src, node), ns)
    return ns


decide = _load()["_stranded_reject_decide"]


def bill(**over):
    b = {"expense_id": "mexp_67dfed89857f", "status": "pending_accounts_approval", "payment_mode": "advance",
         "payment_phase": "balance", "final_amount": 1000.0599999999977, "paid_amount": 83903.52,
         "remaining_balance": 33903.520000000004, "updated_at": "2026-10-22T12:43:35.558125+00:00"}
    b.update(over)
    return b


def parent(**over):
    p = {"request_id": "mreq_14a07b3037eb", "status": "procurement_verifying",
         "accounts_rejected_at": "2026-10-26T09:27:25.982863+00:00",
         "accounts_rejected_by": "user_6c739704aa26", "accounts_rejected_by_name": "Ramya C",
         "accounts_rejected_reason": "Rejected by accountant"}
    p.update(over)
    return p


def test_mr1306_as_reported_goes_back_to_the_paid_advance():
    d = decide(bill(), parent(), 83903.52)
    assert d["class"] == "paid_advance"
    assert d["set"] == {"status": "paid", "final_amount": 83903.52, "estimated_cost": 83903.52,
                        "remaining_balance": 0.0, "payment_phase": "advance"}


def test_paid_figure_not_backed_by_live_payment_rows_is_left_for_review():
    # The 33,904 paid on Sep 4 was deleted from the Cashbook; if paid_amount
    # still counted it, the payment rows would not add up and nothing is written.
    d = decide(bill(paid_amount=117807.52), parent(), 83903.52)
    assert d["class"] == "manual"
    assert "set" not in d


def test_paid_non_advance_bill_is_left_for_review():
    assert decide(bill(payment_mode="credit"), parent(), 83903.52)["class"] == "manual"


def test_unpaid_bill_is_marked_rejected_with_the_parents_reason():
    d = decide(bill(paid_amount=0), parent(), 0.0)
    assert d["class"] == "unpaid"
    assert d["set"]["status"] == "accountant_rejected"
    assert d["set"]["rejected_by_name"] == "Ramya C"
    assert d["set"]["rejection_reason"] == "Rejected by accountant"


def test_bill_refreshed_after_the_reject_is_not_touched():
    # Procurement re-verified and re-sent it: the bill is live again.
    assert decide(bill(updated_at="2026-10-27T05:00:00+00:00"), parent(), 83903.52)["class"] == "skip"


def test_parent_never_rejected_by_accounts_is_not_touched():
    assert decide(bill(), parent(accounts_rejected_at=None), 83903.52)["class"] == "skip"


def test_scan_writes_nothing_and_apply_writes_only_pinned_bills():
    assert _writes("stranded_reject_bills_scan") == []
    assert _writes("_plan_stranded_reject_scan") == []
    assert _writes("stranded_reject_bills_apply") == ["db.material_expenses.update_one"]
    node, src = _func("stranded_reject_bills_apply")
    assert '**r["stored"]' in ast.get_source_segment(src, node)
