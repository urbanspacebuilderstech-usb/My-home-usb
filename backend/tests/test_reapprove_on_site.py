"""Accounts-rejected material on site: re-approve straight to Accounts (Oct 22 2026).

USB-MR2304 (Advance demo, Anbu test Vendor) was delivered and verified, then
Accounts rejected its bill. It came back under New Request with only a Verify
button. Procurement wants Approve with price and vendor; the material is
already on site, so after approval it skips transit and a second collection
and goes straight to Accounts. Money already paid is netted off even if the
vendor changes (Accounts settles that by hand); a part-paid bill is refused.
Because nothing re-collects it, Accounts rejects no longer take the SE's
stock-in back out of the Daily Inventory Register.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.join(BACKEND, "routes")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "ProcurementBoardSimple.jsx")


def _read(*parts):
    return io.open(os.path.join(*parts), encoding="utf8").read()


def _seg(path, name):
    src = io.open(path, encoding="utf8").read()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


PROC = os.path.join(ROUTES, "procurement.py")


def _on_site():
    ns = {}
    exec(_seg(PROC, "_accounts_rejected_on_site"), ns)
    return ns["_accounts_rejected_on_site"]


def test_on_site_rule_matches_the_board():
    f = _on_site()
    base = {"status": "procurement_verifying", "received_at": "2026-10-22T08:00:00+00:00"}
    assert f({**base, "accounts_rejected_at": "2026-10-22T10:00:00+00:00"})
    # an old reject from before the latest receipt no longer counts
    assert not f({**base, "accounts_rejected_at": "2026-10-20T10:00:00+00:00"})
    assert not f(base)
    assert not f({**base, "status": "pending_accounts_approval", "accounts_rejected_at": "2026-10-22T10:00:00+00:00"})
    board = _read(BOARD)
    assert "String(at) > String(req.received_at)" in board


def test_assign_vendor_routes_on_site_before_timeline_and_payment_mode():
    seg = _seg(PROC, "procurement_simple_assign_vendor")
    assert "on_site = _accounts_rejected_on_site(req)" in seg
    assert "and not on_site:" in seg
    assert seg.index("return await _reapprove_on_site(") < seg.index("# ---- Timeline")
    assert seg.index("return await _reapprove_on_site(") < seg.index('"status": "in_transit"')


def test_reapprove_bills_what_is_still_due():
    seg = _seg(PROC, "_reapprove_on_site")
    assert "due = round(max(0.0, total - paid), 2)" in seg
    assert 'phase = "balance" if paid > 0.5 else "full"' in seg
    assert '"pending_balance_payment", "balance_amount": due' in seg
    assert '"payment_mode": "post_delivery"' in seg
    assert '"in_transit"' not in seg and "transit_started" not in seg
    # part-paid bills are refused rather than guessed at
    assert "part-paid on this bill" in seg
    # one live bill: the others are superseded so they cannot be paid twice
    assert '"status": "superseded"' in seg
    # stale stamps go only when no bill holds money
    assert "if bills and not paid_bills:" in seg


def test_accounts_rejects_leave_stock_on_site():
    site_ops = _seg(os.path.join(ROUTES, "site_ops.py"), "accountant_reject_material_request")
    assert "_reverse_material_receipt_inventory" not in site_ops.split('"""', 2)[2]
    fin = _seg(os.path.join(ROUTES, "financial.py"), "reject_material_expense")
    assert "_reverse_material_receipt_inventory" not in fin.split('"""', 2)[2]


def test_board_opens_approve_for_accounts_rejected():
    board = _read(BOARD)
    assert "=== 'procurement_verifying' && !isAccountsRejected(r)" in board
    assert "const isActionable = accountsRejected ||" in board
    assert "&& !isAccountsRejected(open)" in board
    assert "onSite ? 'Send to Accounts'" in board
