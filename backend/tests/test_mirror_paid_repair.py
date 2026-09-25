"""The one-row repair for an under-recorded suspense-funded bill (Sep 25 2026).

pay_approval used to write the mirror's paid_amount from the CASH-ONLY figure.
USB-MR1181 (Inner Primer / SAI VISHNU PAINTS, Mr Sudharsan) had 610 of a 6,360
bill settled from vendor suspense and therefore stored paid_amount 0. The fix
in test_suspense_partial_collected.py corrects the LOGIC; it does not rewrite
history, so the stored row still reads 0 and the board still shows "6,360 / 0"
in Pending.

/admin/mirror-paid-repair-{preview,apply} repairs that one stored row. These
tests pin the arithmetic it rests on and the guards that keep it narrow.

Why the repair is restricted to mirrors whose status is `partially_paid`: the
accountant queue computes

    collected = parent.advance_paid_amount + parent.balance_paid_amount
                + (mirror.paid_amount if mirror.status == "partially_paid")

Only for that one status does the mirror carry the figure. For any other
status the PARENT stamps carry it, so writing the mirror would either do
nothing visible or, if the parent were repaired too, double-count.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
    "find_one_and_replace", "bulk_write", "drop",
}


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _func(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found in financial.py")


def _writes(name):
    node, _ = _func(name)
    out = []
    for c in ast.walk(node):
        if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) \
                and c.func.attr in WRITE_METHODS:
            out.append(ast.unparse(c.func.value) + "." + c.func.attr)
    return out


# --------------------------------------------------------------------------
# The queue arithmetic, reproduced from procurement.py
# --------------------------------------------------------------------------

def queue_view(bill, adv_stamp, bal_stamp, mirror_paid, mirror_status, parent_status):
    """What /procurement-simple/accountant/queue would show."""
    collected = adv_stamp + bal_stamp + (mirror_paid if mirror_status == "partially_paid" else 0.0)
    balance = max(0.0, bill - collected)
    partial = collected > 0.01 and balance > 0.01 and parent_status in (
        "pending_accounts_approval", "in_transit", "procurement_verifying",
        "pending_balance_payment", "partially_paid", "pending_advance_payment")
    return {"collected": round(collected, 2), "balance_due": round(balance, 2),
            "tab": "Partially Collected" if partial else "Pending"}


MR1181 = dict(bill=6360.0, adv_stamp=0.0, bal_stamp=0.0,
              mirror_status="partially_paid", parent_status="pending_accounts_approval")


def test_the_board_today_shows_the_full_amount_due():
    """The reported symptom: 6,360 / 0, sitting in Pending."""
    v = queue_view(mirror_paid=0.0, **MR1181)
    assert v == {"collected": 0.0, "balance_due": 6360.0, "tab": "Pending"}


def test_the_repair_moves_it_to_partially_collected():
    v = queue_view(mirror_paid=610.0, **MR1181)
    assert v == {"collected": 610.0, "balance_due": 5750.0, "tab": "Partially Collected"}


def test_repairing_the_parent_as_well_would_double_count():
    """Why the repair writes the mirror ONLY."""
    both = queue_view(bill=6360.0, adv_stamp=610.0, bal_stamp=0.0, mirror_paid=610.0,
                      mirror_status="partially_paid",
                      parent_status="pending_accounts_approval")
    assert both["collected"] == 1220.0, "parent + mirror would both be counted"
    assert both["balance_due"] == 5140.0, "the vendor would appear owed 610 too little"


def test_a_non_partially_paid_mirror_is_invisible_to_the_queue():
    """So repairing its paid_amount changes nothing on the board - which is
    why those rows are refused rather than silently written."""
    for status in ("paid", "pending_accounts_approval", "accountant_rejected"):
        v = queue_view(mirror_paid=610.0, **{**MR1181, "mirror_status": status})
        assert v["collected"] == 0.0, f"{status} mirror must not feed the queue"


@pytest.mark.parametrize("bill,settled", [
    (6360.0, 610.0), (1000.0, 999.5), (50.0, 25.0), (100000.0, 1.0),
])
def test_remaining_balance_is_the_bill_less_what_was_settled(bill, settled):
    assert round(max(0.0, bill - settled), 2) == pytest.approx(round(bill - settled, 2))


def test_full_settlement_leaves_no_balance_and_no_partial_tab():
    v = queue_view(mirror_paid=6360.0, **MR1181)
    assert v["balance_due"] == 0.0
    assert v["tab"] == "Pending", "no balance left, so it is not partially collected"


# --------------------------------------------------------------------------
# Structural guards on the real source
# --------------------------------------------------------------------------

def test_preview_and_context_write_nothing():
    assert _writes("mirror_paid_repair_preview") == []
    assert _writes("_mirror_repair_context") == []


def test_apply_performs_exactly_one_write_to_one_collection():
    assert _writes("mirror_paid_repair_apply") == ["db.material_expenses.update_one"]


def test_apply_never_touches_status_or_the_parent():
    node, src = _func("mirror_paid_repair_apply")
    seg = ast.get_source_segment(src, node) or ""
    assert "db.material_requests.update" not in seg
    assert "db.recorded_expenses.update" not in seg
    assert "db.vendor_suspense" not in seg
    # the $set block must not carry a status
    set_block = seg.split("{\"$set\": {", 1)[1].split("}}", 1)[0]
    assert "\"status\"" not in set_block, "status must be left alone"
    assert "\"paid_amount\": new_paid_amount," in set_block
    assert "\"remaining_balance\":" in set_block


def test_apply_is_idempotent_on_the_measured_value():
    """The update filter pins the value we measured, so a concurrent change
    or a second click matches nothing instead of writing again."""
    node, src = _func("mirror_paid_repair_apply")
    seg = ast.get_source_segment(src, node) or ""
    assert '{"expense_id": mexp_id, "paid_amount": mirror.get("paid_amount")}' in seg
    assert "if res.matched_count == 0:" in seg


def test_apply_rederives_the_figure_instead_of_trusting_the_caller():
    node, src = _func("mirror_paid_repair_apply")
    seg = ast.get_source_segment(src, node) or ""
    assert "await _mirror_repair_context(" in seg
    assert 'numbers["proposed_paid_amount"] - new_paid_amount' in seg
    assert 'numbers["paid_amount_stored"] - expected_current' in seg


def test_apply_requires_a_matching_confirm_token_and_a_reason():
    node, src = _func("mirror_paid_repair_apply")
    seg = ast.get_source_segment(src, node) or ""
    assert "if confirm != expect_token:" in seg
    assert "len(reason.strip()) < 5" in seg
    assert "user.role != UserRole.SUPER_ADMIN" in seg


def test_context_refuses_anything_but_a_partially_paid_mirror():
    node, src = _func("_mirror_repair_context")
    seg = ast.get_source_segment(src, node) or ""
    assert 'mirror.get("status") != "partially_paid"' in seg


def test_context_refuses_when_the_two_leg_queries_disagree():
    """`_reconciled_already_paid` matches legs more broadly than the scan did.
    If the two totals differ the evidence is ambiguous and we must not guess."""
    node, src = _func("_mirror_repair_context")
    seg = ast.get_source_segment(src, node) or ""
    assert "abs(broad_settled - settled) >= 0.5" in seg


def test_context_refuses_when_legs_exceed_the_bill():
    node, src = _func("_mirror_repair_context")
    seg = ast.get_source_segment(src, node) or ""
    assert "proposed > bill + 0.5" in seg


def test_context_requires_suspense_credit_on_the_legs():
    """This repair is only for the cash-only bug. A shortfall with no credit
    behind it is a different problem and stays out of scope."""
    node, src = _func("_mirror_repair_context")
    seg = ast.get_source_segment(src, node) or ""
    assert "credit <= 0.5" in seg


def test_excluded_leg_statuses_match_the_engine():
    """Rejected and bounced legs must not count as evidence of payment."""
    node, src = _func("_mirror_repair_context")
    seg = ast.get_source_segment(src, node) or ""
    assert "_PAID_LEG_EXCLUDED_STATUS" in seg


def test_queue_rule_this_repair_depends_on_still_exists():
    """If procurement.py stops reading the mirror's paid_amount for
    partially_paid rows, this repair stops reaching the board."""
    src = io.open(PROCUREMENT, encoding="utf8").read()
    assert 'if m.get("status") == "partially_paid":' in src
    assert 'mirror_partial += float(m.get("paid_amount") or 0)' in src
    assert 'r["partially_collected"] = True' in src
