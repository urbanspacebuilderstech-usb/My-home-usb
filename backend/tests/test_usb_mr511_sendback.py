"""USB-MR511 back to Approvals (Oct 16 2026).

On Oct 12 USB-MR511's only payment row (exp_137eef0a9ccf, 18,963 from
SATHISKUMAR AGENCY's suspense) was deleted from the Cheque tile drill-down.
That button hard-deletes instead of sending back, so the money trail showed:

    bill mexp_13ab1263c1e3   status "paid", paid_via_expense_still_exists false
    payment rows             none
    debit se_c8729f5736      -18,963, linked to the deleted row

A "paid" bill never reaches Approvals → Materials, and the debit is ignored by
every balance (its row is gone), so the vendor's pool already shows the 18,963
as available. /admin/usb-mr511-sendback-apply does what a send-back would have
done. These tests pin when it may run, and that the dry run cannot write.
"""
import ast
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "AccountsBoard.jsx")


def _read(path):
    return io.open(path, encoding="utf8").read()


def _nodes(src):
    return ast.parse(src).body


def _seg(name):
    src = _read(FINANCIAL)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def _decide():
    """Load the pure decision function and its constants from the real source."""
    src = _read(FINANCIAL)
    ns = {}
    for node in _nodes(src):
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id in ("_MR511", "_MR511_SENDBACK") for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
    exec(_seg("_mr511_sendback_decide"), ns)
    return ns["_mr511_sendback_decide"]


# What the money trail returned on Oct 16.
BILL = {"expense_id": "mexp_13ab1263c1e3", "status": "paid", "source_request_id": "mreq_f6b13b50d3dc",
        "paid_via_expense_id": "exp_137eef0a9ccf"}
REQUEST = {"request_id": "mreq_f6b13b50d3dc", "request_number": "USB-MR511", "status": "delivered"}
DEBIT = {"entry_id": "se_c8729f5736", "amount": -18963.0, "linked_expense_id": "exp_137eef0a9ccf"}


def run(**over):
    args = dict(bill=BILL, request=REQUEST, bill_rows_for_request=1, payment_row_exists=False,
                live_legs=[], debit=DEBIT, restores=[])
    args.update(over)
    return _decide()(**args)


def test_the_reported_state_plans_both_steps():
    out = run()
    assert out == {"problems": [], "steps": ["send_back", "delete_debit"]}


def test_a_rerun_after_apply_plans_nothing():
    out = run(bill={**BILL, "status": "pending_accounts_approval"}, debit=None)
    assert out == {"problems": [], "steps": []}


def test_refuses_if_the_payment_row_came_back():
    assert run(payment_row_exists=True)["problems"]


def test_refuses_if_the_bill_was_paid_again():
    out = run(live_legs=["exp_new"])
    assert any("paid again" in p for p in out["problems"])


def test_refuses_an_unexpected_bill_status():
    out = run(bill={**BILL, "status": "partially_paid"})
    assert any("expected 'paid'" in p for p in out["problems"])


def test_refuses_a_second_bill_row_on_the_request():
    """The send-back resets every row of the request; a superseded twin would
    come back as a duplicate Approvals card."""
    assert run(bill_rows_for_request=2)["problems"]


def test_refuses_a_bill_linked_to_another_request():
    assert run(bill={**BILL, "source_request_id": "mreq_other"})["problems"]


def test_refuses_a_debit_that_is_not_mr511s():
    assert run(debit={**DEBIT, "amount": -1447.0})["problems"]
    assert run(debit={**DEBIT, "linked_expense_id": "exp_other"})["problems"]


def test_refuses_when_a_bounce_restore_points_at_the_debit():
    """Deleting the debit would then hand part of it back twice (SS AGENCY #041296)."""
    assert run(restores=["se_restore"])["problems"]


# --------------------------------------------------------------------------
# The real code
# --------------------------------------------------------------------------

WRITES = re.compile(r"\.(insert_one|insert_many|update_one|update_many|delete_one|delete_many|"
                    r"replace_one|find_one_and_update|find_one_and_delete|bulk_write)\(")


def test_the_dry_run_and_the_plan_cannot_write():
    for name in ("usb_mr511_sendback_dryrun", "_plan_mr511_sendback", "_mr511_sendback_decide"):
        assert not WRITES.search(_seg(name)), name


def test_apply_reuses_the_send_back_and_guards_the_delete():
    seg = _seg("usb_mr511_sendback_apply")
    assert "send_material_back_to_approvals(_MR511_SENDBACK[\"bill_id\"], user)" in seg
    assert 'raise HTTPException(status_code=409' in seg
    delete = seg[seg.index("delete_one("):]
    assert '"linked_expense_id": _MR511["expense_id"]' in delete
    assert '"amount": {"$gte"' in delete


def test_both_endpoints_are_super_admin_only():
    for name in ("usb_mr511_sendback_dryrun", "usb_mr511_sendback_apply"):
        assert "user.role != UserRole.SUPER_ADMIN" in _seg(name)


def test_tile_drilldown_trash_no_longer_hard_deletes():
    """The Oct 15 change: the board's expense trash posts the send-back."""
    board = _read(BOARD)
    start = board.index("const handleDeleteExpense = async")
    handler = board[start:board.index("};", start)]
    assert "send-back-to-approvals" in handler
    assert "axios.delete" not in handler
