"""A payment sent back from the Cashbook stops counting as paid (Oct 22 2026).

USB-MR2304 (Advance demo, Anbu test Vendor, 100 = 50 advance + 50 balance):
the 50 advance was paid, then trashed in the Cashbook, then rejected. The
Procurement card still read "✓ Advance ₹50 Collected" and Total / Paid
100 / 50, because the send-back reset the advance bill but never the
request's advance_paid_* stamp, which pay_approval's phase cascade writes and
the board, verify-approve and the vendor summary all read.

It also wiped the bill's payment_phase, so paying the advance again ran the
balance cascade (request -> delivered, balance stamp), and an advance re-paid
after delivery dragged the request back to in_transit.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _seg(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_stamps_cover_both_phases():
    src = _src()
    for f in ("advance_paid_at", "advance_paid_by", "advance_paid_by_name", "advance_paid_amount",
              "balance_paid_at", "balance_paid_by", "balance_paid_by_name", "balance_paid_amount"):
        assert f'"{f}"' in src.split("_PHASE_PAID_STAMPS = {", 1)[1].split("}", 1)[0]


def test_clear_skips_a_bill_still_fully_paid():
    seg = _seg("_clear_parent_phase_paid_stamp")
    assert '== "paid"' in seg
    # Any phase other than advance is what pay_approval stamps as balance.
    assert '"advance" if' in seg and 'else "balance"' in seg


def test_both_bill_sendback_paths_clear_the_stamp():
    seg = _seg("send_material_back_to_approvals")
    assert seg.count("await _clear_parent_phase_paid_stamp(") == 2
    # the payment-row branch passes the bill its row points at
    assert "await _clear_parent_phase_paid_stamp(parent_id)" in seg


def test_sendback_keeps_the_bill_phase():
    seg = _seg("send_material_back_to_approvals")
    assert 'bill_unset_fields = {k: v for k, v in unset_fields.items() if k != "payment_phase"}' in seg
    elif_branch = seg.split('elif coll_name == "material_expenses":', 1)[1].split("elif coll_name", 1)[0]
    assert '"$unset": bill_unset_fields' in elif_branch
    assert '"$unset": unset_fields' not in elif_branch.split("_cleanup_mirrors_for_parent")[0]


def test_advance_repaid_after_collection_does_not_reopen_transit():
    seg = _seg("pay_approval")
    advance = seg.split('if phase == "advance":', 1)[1].split("else:", 1)[0]
    guard = 'if not (parent.get("received_at") or parent.get("collected_at")):'
    assert guard in advance
    assert advance.index(guard) < advance.index('"status": "in_transit"')
    assert advance.index(guard) < advance.index("notify_se_msg =")
    # the stamp itself is written either way
    assert advance.index('"advance_paid_amount": round(settled_this_phase') < advance.index(guard)
