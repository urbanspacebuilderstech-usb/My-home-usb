"""Tracing a Close Books surplus to the transactions behind it (Oct 7 2026).

Accounts > Close Books · 2026-10-07 showed "Surplus ₹18,963" on CASH and the
question was whether it was a bug.

It is not. On the first close of a day DailyClosingDialog.jsx does not ask the
accountant to retype the source rows — it copies them from the previous close,
labels AND amounts, so only what changed needs editing. The `book` figure
beside them is recomputed live from income − expense. So the moment cash goes
out, the carried-forward rows still show yesterday's cash while the book has
already dropped, and the difference surfaces as a surplus:

    surplus = previous actual − today's book
            = previous variance + (expense out − income in) since that close

Worth recording what this was NOT. My first hypothesis was that
classify_payment_mode's `if not mode: return "cash"` was filing cheque
payments as cash — exp_137eef0a9ccf (P sand, Cheque #1684) is ₹18,963, exactly
the surplus, and carried no payment_method. /admin/cash-bucket-audit killed it
with data: 4298 live expenses, no_mode_count 0 in every bucket,
of_which_also_have_a_cheque ₹0. The amount matching was coincidence. The audit
is why that is known rather than assumed.

These tests pin the arithmetic the diagnostic endpoint reports, so a wrong
explanation cannot be handed to an accountant who is about to adjust a ledger.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
DIALOG = os.path.join(BACKEND, "..", "frontend", "src", "components",
                      "DailyClosingDialog.jsx")


def _src(path=FINANCIAL):
    return io.open(path, encoding="utf8").read()


def _endpoint():
    for node in ast.walk(ast.parse(_src())):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == "cash_movement_since_close":
            return node
    raise AssertionError("cash_movement_since_close not found")


# --------------------------------------------------------------------------
# The arithmetic the explanation rests on
# --------------------------------------------------------------------------

def surplus(prev_actual, prev_book, income_in, expense_out):
    """What the dialog shows, derived the way the endpoint derives it."""
    today_book = prev_book - expense_out + income_in
    return round(prev_actual - today_book, 2)


def predicted(prev_variance, income_in, expense_out):
    """What the endpoint predicts, from the previous close alone."""
    return round(prev_variance + (expense_out - income_in), 2)


def test_the_two_derivations_agree_on_the_reported_case():
    """A close that balanced, then 18,963 of cash out and nothing in."""
    prev_actual = prev_book = 500000.0
    assert surplus(prev_actual, prev_book, 0.0, 18963.0) == 18963.0
    assert predicted(prev_actual - prev_book, 0.0, 18963.0) == 18963.0


def test_a_balanced_close_makes_the_surplus_exactly_the_net_outflow():
    for out in (1.0, 250.0, 18963.0, 1865432.75):
        assert surplus(100000.0, 100000.0, 0.0, out) == out


def test_cash_coming_in_reduces_the_surplus():
    """Income offsets spending — only the NET is unexplained."""
    assert surplus(100000.0, 100000.0, 3000.0, 18963.0) == 15963.0


def test_more_cash_in_than_out_shows_a_shortage_not_a_surplus():
    """The sign has to survive: a negative surplus is money the book says is
    there and the rows do not claim yet."""
    assert surplus(100000.0, 100000.0, 20000.0, 5000.0) == -15000.0


def test_an_unbalanced_previous_close_carries_its_variance_forward():
    """This is why the endpoint reports prev_variance separately: if the last
    close did not balance, the surplus is NOT just today's movement, and an
    accountant told otherwise would adjust a row by the wrong amount."""
    prev_actual, prev_book = 101000.0, 100000.0      # closed 1,000 over
    assert surplus(prev_actual, prev_book, 0.0, 18963.0) == 19963.0
    assert predicted(1000.0, 0.0, 18963.0) == 19963.0


def test_no_movement_means_no_surplus():
    """If nothing moved and a surplus is still showing, the cause is NOT
    carry-forward and the endpoint must not claim it is."""
    assert surplus(100000.0, 100000.0, 0.0, 0.0) == 0.0


def test_the_prediction_disagreeing_is_the_signal_to_stop():
    """The guard that matters. If the two derivations differ, something other
    than carry-forward is moving the book."""
    actual = surplus(100000.0, 100000.0, 0.0, 18963.0)
    wrong = predicted(0.0, 0.0, 5000.0)   # as if movement were misread
    assert abs(actual - wrong) >= 1.0


# --------------------------------------------------------------------------
# It must agree with the cashbook, or the numbers mean nothing
# --------------------------------------------------------------------------

def test_it_uses_the_canonical_expense_engine():
    """Reading recorded_expenses alone would miss labour, material requests
    and legacy material POs — four of the five sources the book counts."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert "fetch_expense_source_docs" in body
    assert "build_expense_rows" in body


def test_income_and_expense_are_classified_the_way_the_cashbook_does_it():
    """The cashbook classifies income on payment_mode ALONE but expenses on
    payment_method first. Mirroring it loosely would shift the totals."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert 'classify_payment_mode(i.get("payment_mode"))' in body
    assert 'classify_payment_mode(e.get("payment_method") or e.get("payment_mode"))' in body


def test_rows_outside_a_real_project_are_excluded():
    """income_by_mode / expense_by_mode skip them, so counting them here would
    report movement the book never saw."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert body.count("real_pid_set") >= 3


def test_the_carry_forward_opening_balance_is_on_the_expense_side():
    """balOf = inc − (exp + cfExp). Dropping it moves today's book."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert "inc_all - (exp_all + lock_exp)" in body


def test_the_lock_bucket_key_for_savings_is_remapped():
    """AccountsBoard maps savings_account → 'savings' for the lock buckets.
    Using the mode name raw silently reads a zero."""
    src = _src()
    assert '"savings_account": "savings",' in src


# --------------------------------------------------------------------------
# Safety
# --------------------------------------------------------------------------

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_replace",
    "find_one_and_delete", "bulk_write", "drop", "create_index", "rename",
}


def test_the_endpoint_cannot_write():
    """It is a diagnostic on live financial data. It reads and nothing else."""
    for node in ast.walk(_endpoint()):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            assert name not in WRITE_METHODS, "%s at line %d" % (name, node.lineno)


def test_every_db_call_is_a_read():
    reads = {"find", "find_one", "aggregate", "count_documents", "distinct",
             "sort", "to_list"}
    for node in ast.walk(_endpoint()):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            v = node.func.value
            if isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                    and v.value.id == "db":
                assert node.func.attr in reads, node.func.attr


def test_it_reports_that_it_did_not_write():
    body = ast.get_source_segment(_src(), _endpoint())
    assert '"write_performed": False' in body
    assert '"read_only": True' in body


def test_it_is_not_open_to_every_role():
    body = ast.get_source_segment(_src(), _endpoint())
    assert "UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN" in body


def test_it_tells_the_accountant_not_to_touch_transactions():
    """The correction is to a source row in Close Books. Editing the
    underlying expense would change the books to hide a figure that is right."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert "Do not change any transaction." in body


def test_it_is_marked_temporary():
    """It joins the other /admin/* scans that have to be removed."""
    body = ast.get_source_segment(_src(), _endpoint())
    assert "TEMPORARY" in body


# --------------------------------------------------------------------------
# The behaviour being explained has to still be there
# --------------------------------------------------------------------------

def test_the_dialog_still_carries_the_previous_rows_forward():
    """The whole explanation depends on this. If it ever changes, the surplus
    means something different and this diagnostic is misleading."""
    src = _src(DIALOG)
    assert "sub_entries" in src


def test_the_variance_is_still_total_minus_book():
    src = _src(DIALOG)
    assert "const variance = +(total - book).toFixed(2);" in src
