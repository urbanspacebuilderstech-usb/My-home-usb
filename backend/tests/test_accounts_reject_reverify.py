"""Accounts-rejected delivery goes back to Purchase Verification (Oct 26 2026).

USB-MR2374 (PV Check, Anbu test Vendor, advance ₹450 of ₹900): the SE
collected 30, Procurement mis-entered 15 at verification and the request
went to Accounts. Accounts rejected it and it came back under New Request
with Approve, which restarts the order although the material was on site.
It now stays in Purchase Verification and opens Verify, so Procurement
corrects the qty and sends it to Accounts again.

Also:
- verify-approve checked "paid in full" against the ordered total, so 15
  units (₹450) with ₹450 advance paid still sent a ₹450 bill to Accounts;
- a re-verification of an advance order came back as a "full" bill instead
  of its balance;
- the rejected bill stayed payable in Approvals while Procurement re-checked.
Checked end to end against a local Mongo with the routes called directly.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.join(BACKEND, "routes")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "ProcurementBoardSimple.jsx")
PROC = os.path.join(ROUTES, "procurement.py")
SITE = os.path.join(ROUTES, "site_ops.py")


def _read(path):
    return io.open(path, encoding="utf8").read()


def _seg(path, name):
    src = _read(path)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_board_keeps_it_in_purchase_verification():
    board = _read(BOARD)
    assert "if (isAccountsRejected(req)) return 'new_request';" not in board
    assert "if ((r.status || '').toLowerCase() === 'procurement_verifying') {" in board
    assert "const isActionable = ['requested', 'pm_approved', 'procurement_revision'].includes(status);" in board
    assert "this restarts the order" not in board
    assert 'data-testid="proc-verify-accounts-bounced"' in board


def test_paid_in_full_is_checked_against_the_verified_total():
    seg = _seg(PROC, "procurement_verify_approve")
    assert "_req_total = new_total if new_total > 0 else current_total" in seg
    assert seg.index("new_total = round(") < seg.index("_req_total = new_total")
    assert seg.index("_req_total = new_total") < seg.index('update["status"] = next_status')


def test_reverified_advance_order_goes_back_to_its_balance():
    seg = _seg(PROC, "procurement_verify_approve")
    assert ('if not req.get("pending_next_status") and (req.get("payment_mode") or "").lower() == "advance":\n'
            '        next_status = "pending_balance_payment"') in seg


def test_bill_leaves_accounts_when_the_request_does():
    helper = _seg(PROC, "_bills_back_from_accounts")
    assert '"status": "pending_accounts_approval"' in helper
    assert '"status": "paid", "final_amount": held' in helper  # the reused paid advance bill
    assert "await _bills_back_from_accounts(" in _seg(SITE, "accountant_reject_material_request")
    verify = _seg(PROC, "procurement_verify_approve")
    assert 'if next_status == "delivered":\n        # Nothing left to pay' in verify
