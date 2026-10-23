"""Material purchase: every reject sends the request one step back (Oct 23 2026).

SE -> Planning -> Procurement -> Accountant -> SE collects. Planning rejects
to the SE, Procurement to Planning, Accounts to Procurement, and Purchase
Verification to the SE. Money already paid is never asked for twice:

- A delivery rejected in verification stops counting toward received qty,
  so the SE's re-delivery replaces it (10 bags re-received read as 20 and
  billed 20; after one more send-back, 30).
- Procurement re-pricing a request with money paid on it (a paid advance
  whose delivery the SE sent back) deducts it, instead of parking it at
  pending_advance_payment with no bill for the Accountant.
- After Accounts rejects the balance of an Advance order, the paid advance
  bill (reused as the balance bill) still counts as paid, so the restart
  does not ask the Accountant for the advance again.
- Procurement can reject an Accounts-rejected bill back to Planning, not
  only re-approve it.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BACKEND, "routes", "procurement.py")
SITE = os.path.join(BACKEND, "routes", "site_ops.py")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "ProcurementBoardSimple.jsx")


def _read(path):
    return io.open(path, encoding="utf8").read()


def _seg(path, name):
    src = _read(path)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_verification_reject_flags_the_receipt():
    seg = _seg(PROC, "procurement_verify_reject")
    assert '{"$set": {"verify_rejected": True, "verify_rejected_at": now}}' in seg


def test_received_qty_skips_rejected_receipts():
    assert _read(SITE).count('"verify_rejected": {"$ne": True},') == 2


def test_any_paid_request_restarts_when_priced_again():
    seg = _seg(PROC, "procurement_simple_assign_vendor")
    assert "restart = on_site or paid_before > 0.5" in seg
    assert "if restart:\n" in seg
    assert "if on_site:\n" not in seg


def test_a_bill_holding_money_counts_as_paid():
    paid = _seg(PROC, "_paid_before_restart")
    assert 'or float(b.get("paid_amount") or 0) > 0.5), 2)' in paid
    restart = _seg(PROC, "_restart_after_accounts_reject")
    # closed back to the paid advance before the unpaid bills are superseded
    assert restart.index('"paid_amount": {"$gt": 0.5}}') < restart.index('"status": "superseded"')
    assert '"status": "paid", "final_amount": held' in restart


def test_procurement_can_reject_an_accounts_rejected_bill_to_planning():
    seg = _seg(PROC, "procurement_simple_reject")
    assert "on_site = _accounts_rejected_on_site(req)" in seg
    assert 'and not on_site:' in seg
    assert "restart = await _restart_after_accounts_reject(req, paid, user, now)" in seg
    board = _read(BOARD)
    assert "{!onSite && (\n                <Button variant=\"outline\" size=\"sm\" className=\"text-red-600" not in board
    assert 'data-testid="proc-assign-reject"' in board
    assert "!(paidBefore > 0.5 && advanceCovered)" in board
