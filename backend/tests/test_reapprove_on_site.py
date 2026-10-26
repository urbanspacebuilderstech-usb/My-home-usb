"""Accounts-rejected bill: Approve restarts the order (Oct 22 2026).

USB-MR2304 (Advance demo, Anbu test Vendor) was delivered and verified, then
Accounts rejected its bill. Procurement re-approves it with the full form
(vendor, price, payment mode, advance, delivery date) and it runs again like
a new order: advance if any, transit, the SE confirms collection again,
verification, Accounts. Money already paid is deducted: it is kept as advance
paid, an advance it covers raises no bill, a larger one a top-up bill for the
difference, and the final bill (balance, full or credit) is reduced by it.
A part-paid bill is refused. The first receipt's stock comes out at the
restart and that receipt stops counting toward received qty.

Oct 26 2026 — the Procurement board no longer offers that restart for an
Accounts-rejected delivery: it stays in Purchase Verification and opens
Verify (see test_accounts_reject_reverify.py). The restart still runs when
Procurement prices again an order with money paid on it.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.join(BACKEND, "routes")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "ProcurementBoardSimple.jsx")
PROC = os.path.join(ROUTES, "procurement.py")
SITE = os.path.join(ROUTES, "site_ops.py")
FIN = os.path.join(ROUTES, "financial.py")


def _read(path):
    return io.open(path, encoding="utf8").read()


def _seg(path, name):
    src = _read(path)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_on_site_rule_matches_the_board():
    ns = {}
    exec(_seg(PROC, "_accounts_rejected_on_site"), ns)
    f = ns["_accounts_rejected_on_site"]
    base = {"status": "procurement_verifying", "received_at": "2026-10-22T08:00:00+00:00"}
    assert f({**base, "accounts_rejected_at": "2026-10-22T10:00:00+00:00"})
    assert not f({**base, "accounts_rejected_at": "2026-10-20T10:00:00+00:00"})
    assert not f(base)
    assert "String(at) > String(req.received_at)" in _read(BOARD)


def test_restart_runs_after_validation_and_before_the_write():
    seg = _seg(PROC, "procurement_simple_assign_vendor")
    assert "paid_before = await _paid_before_restart(req)\n    restart = on_site or paid_before > 0.5" in seg
    restart = seg.index("restart = await _restart_after_accounts_reject(")
    assert seg.index("# ---- Payment mode ----") < restart
    assert seg.index('"Late delivery reason is required') < restart
    assert restart < seg.index("await db.material_requests.update_one(")


def test_money_paid_before_is_deducted_from_the_new_advance():
    seg = _seg(PROC, "procurement_simple_assign_vendor")
    assert "if advance_amount <= paid_before + 0.5:" in seg
    assert "advance_bill_amount = round(advance_amount - paid_before, 2)" in seg
    assert '"advance_paid_before": paid_before,' in seg
    assert "existing_exp = None if restart else" in seg
    fin = _read(FIN)
    assert fin.count('- float(req.get("advance_paid_before") or 0))') == 2  # pay context + pay
    assert 'settled_this_phase + float(req.get("advance_paid_before") or 0)' in fin


def test_restart_resets_the_delivery_and_supersedes_unpaid_bills():
    seg = _seg(PROC, "_restart_after_accounts_reject")
    assert '"status": {"$nin": ["superseded", *_RESTART_PAID_BILL]}' in seg
    assert "_reverse_material_receipt_inventory(" in seg
    assert '"superseded_by_restart": True' in seg
    src = _read(PROC)
    fields = src.split("_RESTART_RECEIPT_FIELDS = (", 1)[1].split(")", 1)[0]
    for f in ("received_at", "collected_at", "received_quantity", "pending_next_status"):
        assert f'"{f}"' in fields
    paid = _seg(PROC, "_paid_before_restart")
    assert "part-paid on this bill" in paid


def test_receipts_from_before_a_restart_do_not_count():
    src = _read(SITE)
    assert src.count('"superseded_by_restart": {"$ne": True},') == 2


def test_final_bill_and_credit_are_reduced_by_money_paid_before():
    verify = _seg(PROC, "procurement_verify_approve")
    assert 'amount = max(0.0, amount - float(merged.get("advance_paid_amount") or 0)' in verify
    assert 'next_status in ("pending_balance_payment", "pending_accounts_approval")' in verify
    # a paid advance bill is never reopened as the full bill
    assert 'phase == "full" and (existing_exp.get("status") or "").lower() in ("paid", "completed")' in verify
    assert _read(SITE).count('- float(request.get("advance_paid_amount") or 0)') == 2  # credit ledger x2


def test_accounts_rejects_leave_stock_until_the_restart():
    site = _seg(SITE, "accountant_reject_material_request")
    assert "_reverse_material_receipt_inventory" not in site.split('"""', 2)[2]
    fin = _seg(FIN, "reject_material_expense")
    assert "_reverse_material_receipt_inventory" not in fin.split('"""', 2)[2]


def test_queue_heals_only_stamps_no_money_backs():
    seg = _seg(PROC, "_heal_stale_paid_stamps")
    assert "if not rb:\n            continue" in seg
    assert '("paid", "completed", "partially_paid")' in seg
    assert "in paid_links" in seg
    assert "await _heal_stale_paid_stamps(rows, user)" in _seg(PROC, "procurement_simple_queue")
