"""A bounced cheque reopens the material request it paid (Oct 26 2026).

USB-MR2374 (PV Check, advance 450 of 900): the balance 450 was paid by
cheque #0711, which bounced. The bill came back to Approvals, but the request
only got a cheque_bounced flag, so Procurement still read Completed, 900 / 900.
Now the paid stamp for the bill's phase is dropped (as a Cashbook send-back
does) and a completed request goes back to Payment Pending; paying it again
returns it to Completed. Requests already left Completed are fixed when the
Procurement board loads. Checked end to end against a local Mongo (balance
bounce, 100% advance bounce after delivery, advance bounce before collection).
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIN = os.path.join(BACKEND, "routes", "financial.py")
PROC = os.path.join(BACKEND, "routes", "procurement.py")


def _seg(path, name):
    src = io.open(path, encoding="utf8").read()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_both_bounce_paths_reopen_the_request():
    assert "await reopen_request_after_bill_bounce(req_id, user)" in _seg(FIN, "bounce_cheque")
    assert "await reopen_request_after_bill_bounce(expense_id, user)" in _seg(
        FIN, "_reverse_cheque_material_suspense_and_bills")


def test_reopen_drops_the_paid_stamp_and_leaves_completed():
    seg = _seg(FIN, "reopen_request_after_bill_bounce")
    assert "await _clear_parent_phase_paid_stamp(bill_id, user)" in seg
    assert '"status": "pending_balance_payment" if phase == "balance" else "pending_accounts_approval"' in seg
    assert '"reopened_by_bounce_from_status": parent["status"]' in seg


def test_paying_again_returns_it_to_completed():
    seg = _seg(FIN, "pay_approval")
    assert 'parent_update["status"] = parent["reopened_by_bounce_from_status"]' in seg
    assert '"status": parent["reopened_by_bounce_from_status"]' in seg
    assert '{"$unset": {"reopened_by_bounce_from_status": ""}}' in seg


def test_board_and_accountant_queue_heal_requests_left_completed():
    assert "await _heal_completed_with_bounced_bill(rows, user)" in _seg(PROC, "procurement_simple_queue")
    assert "await heal_completed_with_bounced_bill(user)" in _seg(PROC, "procurement_simple_accountant_queue")
    board = _seg(PROC, "_heal_completed_with_bounced_bill")
    assert 'r.get("cheque_bounced")' not in board  # the Accountant queue had cleared it on MR2374
    seg = _seg(FIN, "heal_completed_with_bounced_bill")
    assert '"cheque_bounced": True, "status": {"$in": ["pending_accounts_approval", "partially_paid"]}' in seg
    assert "await _bounce_sibling_suspense_legs(" in seg


def test_accountant_queue_keeps_the_flag_while_a_bill_is_open():
    seg = _seg(PROC, "procurement_simple_accountant_queue")
    assert 'm.get("status") in ("pending_accounts_approval", "partially_paid")' in seg


def test_vendor_credit_paid_with_the_bounced_cheque_goes_back():
    seg = _seg(FIN, "_bounce_sibling_suspense_legs")
    assert '"primary_expense_id": primary_leg_id, "expense_id": {"$ne": primary_leg_id}' in seg
    assert '"source": "approval_suspense"' in seg
    assert '"status": "cheque_bounced"' in seg
    assert "await _bounce_sibling_suspense_legs(expense_id, cheque_id, payload.reason.strip(), now)" in _seg(
        FIN, "bounce_cheque")
