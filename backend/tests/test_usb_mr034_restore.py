"""USB-MR034's 17,516 handed back twice (Oct 26 2026).

SATHISKUMAR AGENCY, Accounts > Suspense A/c > Materials > View:

    Suspense by cheque   #825413 25,698 · #001684 21,378 · #000015 13,654

while the Expense list's #1684 rows add up to 1,96,138, so the cheque has
2,00,000 - 1,96,138 = 3,862 left. The 17,516 between the two is se_2499341b08,
the credit repair_usb_mr034_suspense_and_cheque.py inserted on 18 Aug when "no
debit stands": USB-MR034's payment and its debit were already gone, so its
17,516 was back in the pool and the credit returned it a second time.

On 11 Aug USB-MR034 was paid from exactly the two cheques' remainders:

    #000015 excess 80,435.20 + #001684 left 3,862.40
        = #000015's four bills 66,781.60 + USB-MR034 17,516

/admin/usb-mr034-restore-apply deletes the credit. These tests pin when it may
run, and that the dry run cannot write.
"""
import ast
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
SCRIPT = os.path.join(BACKEND, "scripts", "repair_usb_mr034_suspense_and_cheque.py")


def _read(path):
    return io.open(path, encoding="utf8").read()


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
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "_MR034" for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
    exec(_seg("_mr034_restore_decide"), ns)
    return ns["_mr034_restore_decide"]


RESTORE = {"entry_id": "se_2499341b08", "type": "material", "vendor_name": "SATHISKUMAR AGENCY",
           "amount": 17516.0, "linked_request_id": "mexp_9e27d6b45119",
           "restore_tag": "usb_mr034_suspense_restore:mexp_9e27d6b45119",
           "description": "Restore 17,516 to suspense — USB-MR034 was funded from this pool (audit 11 Aug: "
                          "credit_used=17,516, leg_count=0) and the payment was later deleted. "
                          "Pool of cheque #001684 (USB-MR034 was paid from it on 11 Aug)."}
BILL = {"expense_id": "mexp_9e27d6b45119", "status": "pending_accounts_approval",
        "source_request_id": "mreq_mr034"}
REQUEST = {"request_id": "mreq_mr034", "request_number": "USB-MR034", "status": "pending_accounts_approval"}
POOL = 60730.0      # 25,698 + 21,378.40 + 13,653.60, the header figure on screen


def run(**over):
    args = dict(restore=RESTORE, bill=BILL, request=REQUEST, bill_rows_for_request=1, live_legs=[],
                standing_debits=[], drew_on_restore=[], pool_now=POOL)
    args.update(over)
    return _decide()(**args)


# --------------------------------------------------------------------------
# The arithmetic behind the repair
# --------------------------------------------------------------------------

def test_the_chip_is_the_expense_list_figure_plus_the_restore():
    expense_list_1684 = [19630.00, 16308.00, 17516.00, 19630.00, 19630.00, 17516.00,
                         17516.00, 19630.00, 16855.80, 15049.80, 16856.00]
    assert round(sum(expense_list_1684), 2) == 196137.60
    left = round(200000.00 - sum(expense_list_1684), 2)
    assert left == 3862.40
    assert round(left + 17516.00, 2) == 21378.40


def test_mr034_was_paid_from_the_two_remainders_to_the_paisa():
    debits_0015 = [19564.80, 18442.87, 16519.80, 12254.13]
    assert round(80435.20 + 3862.40, 2) == round(sum(debits_0015) + 17516.00, 2)
    assert round(3862.40 + 13653.60, 2) == 17516.00


def test_after_the_repair():
    assert round(POOL - 17516.00, 2) == 43214.00
    assert round(25698.00 + 3862.40 + 13653.60, 2) == 43214.00


# --------------------------------------------------------------------------
# The decision
# --------------------------------------------------------------------------

def test_bill_already_in_approvals_plans_only_the_removal():
    assert run() == {"problems": [], "steps": ["remove_restore"]}


def test_bill_stuck_paid_with_no_payment_is_sent_back_too():
    out = run(bill={**BILL, "status": "paid"})
    assert out == {"problems": [], "steps": ["remove_restore", "send_back"]}


def test_a_rerun_after_apply_plans_nothing():
    assert run(restore=None) == {"problems": [], "steps": []}


def test_any_other_bill_status_is_left_alone():
    for status in ("delivered", "rejected", "accounts_rejected", "procurement_verifying"):
        assert run(bill={**BILL, "status": status}) == {"problems": [], "steps": ["remove_restore"]}


def test_refuses_while_an_mr034_debit_still_counts():
    """Then the credit is offsetting it, not duplicating it."""
    out = run(standing_debits=["se_d1"])
    assert out["steps"] == [] and any("must stay" in p for p in out["problems"])


def test_refuses_when_a_payment_drew_on_the_restore():
    out = run(drew_on_restore=["se_pay"])
    assert out["steps"] == [] and any("drew on the restore" in p for p in out["problems"])


def test_refuses_when_the_pool_would_go_below_zero():
    out = run(pool_now=10000.0)
    assert out["steps"] == [] and any("below zero" in p for p in out["problems"])


def test_refuses_an_entry_that_is_not_the_mr034_restore():
    for bad in ({"restore_tag": "something_else"}, {"amount": 6000.0},
                {"vendor_name": "SS AGENCY"}, {"type": "labour"}):
        out = run(restore={**RESTORE, **bad})
        assert out["problems"] and "remove_restore" not in out["steps"], bad


def test_refuses_when_mr034_has_been_paid_again():
    out = run(live_legs=["exp_new"])
    assert any("paid again" in p for p in out["problems"])


def test_refuses_when_the_bill_is_missing():
    assert run(bill=None)["problems"]


def test_send_back_guards():
    paid = {**BILL, "status": "paid"}
    assert run(bill=paid, bill_rows_for_request=2)["problems"]
    assert run(bill=paid, request=None)["problems"]
    assert run(bill=paid, request={**REQUEST, "request_id": "mreq_other"})["problems"]


# --------------------------------------------------------------------------
# The real code
# --------------------------------------------------------------------------

WRITES = re.compile(r"\.(insert_one|insert_many|update_one|update_many|delete_one|delete_many|"
                    r"replace_one|find_one_and_update|find_one_and_delete|bulk_write)\(")


def test_the_dry_run_and_the_plan_cannot_write():
    for name in ("usb_mr034_restore_dryrun", "_plan_mr034_restore", "_mr034_restore_decide"):
        assert not WRITES.search(_seg(name)), name


def test_apply_guards_the_delete_and_reuses_the_send_back():
    seg = _seg("usb_mr034_restore_apply")
    assert 'raise HTTPException(status_code=409' in seg
    delete = seg[seg.index("delete_one("):]
    assert '"restore_tag": _MR034["restore_tag"]' in delete
    assert '"amount": {"$gte"' in delete
    assert 'send_material_back_to_approvals(_MR034["bill_id"], user)' in seg
    assert "create_audit_log(" in seg


def test_both_endpoints_are_super_admin_only():
    for name in ("usb_mr034_restore_dryrun", "usb_mr034_restore_apply"):
        assert "user.role != UserRole.SUPER_ADMIN" in _seg(name)


def test_the_old_repair_script_can_no_longer_insert_a_credit():
    """Its "no debit stands" branch is what handed the 17,516 back twice."""
    src = _read(SCRIPT)
    assert "suspense_entries.insert_one" not in src
    assert "insert_credit" not in src
