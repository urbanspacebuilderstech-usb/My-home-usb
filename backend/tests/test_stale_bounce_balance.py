"""A bounce must reset the bill's balance, not just its paid amount
(Oct 20 2026).

USB-MR1156 (OM MURUGA EARTH / Mr Shiva, 16,445) showed "Balance 2,890" on the
Approvals card while Pay & Settle offered the full 16,445. Both figures came
from the same bill; at most one could be right.

Both of its cheques bounced, 8 seconds apart:

    8 Oct 06:31      paid 16,445 in two legs      remaining 0
   20 Oct 06:38:48   #521267 bounces -> PROPORTIONAL path
                     paid 16,445 - 2,890.37 = 13,554.63
                     remaining_balance = 16,445 - 13,554.63 = 2,890.37
   20 Oct 06:38:56   #521268 bounces -> DIRECT path
                     paid_amount -> None
                     remaining_balance -> NOT WRITTEN, still 2,890.37

`_reverse_cheque_material_suspense_and_bills` always writes
`remaining_balance` next to `paid_amount`. The direct path wrote the paid
fields and left the balance behind, so whichever path ran LAST decided what
the card showed - and the forgetful one ran last. The 2,890.37 is a fossil of
those 8 seconds.

Worth recording what this was NOT. I first read the 2,890.37 as good money
from a cheque that had not bounced, and told the user not to release payment
because it would overpay. That was wrong: I had checked #521267 only through
a trace scoped to #521268, where `is_the_bounced_cheque: false` means "not
#521268" and says nothing about whether it bounced on its own. #521267 is
bounced. The user said so before the data did.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _fn(name):
    for node in ast.walk(ast.parse(_src())):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError("%s not found" % name)


# --------------------------------------------------------------------------
# The reported arithmetic
# --------------------------------------------------------------------------

def after_partial_bounce(bill, paid, bounced):
    new_paid = max(0.0, round(paid - bounced, 2))
    return {"paid_amount": new_paid,
            "remaining_balance": round(max(0.0, bill - new_paid), 2),
            "status": "partially_paid" if new_paid > 0.5 else "pending_accounts_approval"}


def test_the_first_bounce_leaves_the_fossil():
    """#521267 takes 2,890.37 off a fully paid 16,445 bill."""
    assert after_partial_bounce(16445, 16445, 2890.37) == {
        "paid_amount": 13554.63, "remaining_balance": 2890.37,
        "status": "partially_paid"}


def test_the_second_bounce_must_reset_the_balance_too():
    """#521268 unpays the rest. Both fields have to move."""
    assert after_partial_bounce(16445, 13554.63, 13554.63) == {
        "paid_amount": 0.0, "remaining_balance": 16445.0,
        "status": "pending_accounts_approval"}


def test_the_old_direct_path_left_the_balance_behind():
    """Proof of the defect: paid is wiped, balance keeps the old figure."""
    bill = {"paid_amount": 13554.63, "remaining_balance": 2890.37}
    bill.update({"paid_amount": None, "status": "pending_accounts_approval"})
    assert bill["remaining_balance"] == 2890.37       # ← what the card showed
    assert float(bill["paid_amount"] or 0) == 0.0


def test_nothing_paid_means_the_whole_bill_is_owing():
    assert after_partial_bounce(16445, 16445, 16445)["remaining_balance"] == 16445.0


# --------------------------------------------------------------------------
# The code fix
# --------------------------------------------------------------------------

def test_both_direct_paths_now_reset_the_balance():
    """Two separate sites had the same omission - the bounce endpoint and the
    cheque-delete reversal. Neither may lose it again."""
    src = _src()
    assert src.count('_full = await _material_bill_full_amount(req_id)') == 2
    assert src.count('_reset["remaining_balance"] = _full') == 2


def test_the_reset_amount_uses_the_same_fallback_chain():
    """A different chain would disagree with the proportional path about what
    the whole bill is."""
    body = ast.get_source_segment(_src(), _fn("_material_bill_full_amount"))
    for f in ("final_amount", "estimated_cost", "estimated_price", "final_price"):
        assert f in body


def test_a_missing_bill_does_not_blank_the_balance():
    """If the bill cannot be read, leave the field alone rather than writing
    a zero that would read as 'nothing owing'."""
    body = ast.get_source_segment(_src(), _fn("_material_bill_full_amount"))
    assert "return None" in body
    src = _src()
    assert src.count("if _full is not None:") == 2


def test_the_proportional_path_still_writes_the_balance():
    """It always did. This is the behaviour the direct path now matches."""
    assert '"remaining_balance": bill_amount,' in _src()


def test_every_bounce_records_its_cheque_number():
    """The scalar keeps only the last bounce, so a bill hit by two cheques
    could never name both. USB-MR1156 shows #521268 and hides #521267."""
    src = _src()
    assert src.count('"bounced_from_cheque_numbers"') >= 3
    assert '"$addToSet"' in src


def test_the_scalar_is_still_written():
    """Additive only - existing readers must not break."""
    assert '"bounced_from_cheque_number": cheque.get("cheque_number"),' in _src()


# --------------------------------------------------------------------------
# The repair's safety conditions
# --------------------------------------------------------------------------

def _is_candidate(bill_amount, paid, remaining, status, bounced=True):
    """Mirrors _stale_balance_candidates."""
    if not bounced:
        return False
    if status != "pending_accounts_approval":
        return False
    if paid > 0.5:
        return False
    if bill_amount <= 0.5:
        return False
    return abs(remaining - bill_amount) > 0.5


def test_the_reported_bill_qualifies():
    assert _is_candidate(16445, 0, 2890.37, "pending_accounts_approval")


def test_a_part_paid_bill_is_never_touched():
    """The condition that matters most: a bill with surviving good money must
    not have its balance overwritten."""
    assert not _is_candidate(38700, 24600, 14100, "partially_paid")
    assert not _is_candidate(16445, 2890.37, 13554.63, "pending_accounts_approval")


def test_a_correct_bill_is_left_alone():
    assert not _is_candidate(16445, 0, 16445, "pending_accounts_approval")


def test_a_bill_that_never_bounced_is_out_of_scope():
    assert not _is_candidate(16445, 0, 2890.37, "pending_accounts_approval", bounced=False)


def test_sub_rupee_drift_is_not_a_repair():
    assert not _is_candidate(16445, 0, 16444.7, "pending_accounts_approval")


def test_a_zero_amount_bill_is_skipped():
    assert not _is_candidate(0, 0, 500, "pending_accounts_approval")


# --------------------------------------------------------------------------
# The apply endpoint
# --------------------------------------------------------------------------

def test_apply_requires_a_confirm_token():
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert 'payload.confirm != "REPAIR-STALE-BALANCE"' in body


def test_apply_requires_explicit_ids():
    """No blanket 'repair everything' - the caller names each bill."""
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert "if not payload.expense_ids:" in body


def test_apply_rechecks_eligibility_before_writing():
    """A row that changed since the preview is skipped, not overwritten."""
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert "eligible = {c[\"expense_id\"]: c for c in await _stale_balance_candidates()}" in body
    assert "no longer matches the stale-balance conditions" in body


def test_apply_never_touches_paid_amount_or_status():
    """It corrects a display field. The money must not move."""
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    set_block = body[body.index("set_fields: Dict[str, Any] = {"):]
    set_block = set_block[:set_block.index("}")]
    assert "paid_amount" not in set_block
    assert "status" not in set_block
    for forbidden in ("suspense_entries", "recorded_expenses", "cheques"):
        assert "db.%s.update" % forbidden not in body
        assert "db.%s.delete" % forbidden not in body


def test_apply_verifies_each_write():
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert '"verified":' in body
    assert '"all_verified"' in body


def test_apply_records_what_it_overwrote():
    """The old value has to survive the repair, or it cannot be undone."""
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert '"stale_balance_repaired_from": c["remaining_balance_now"],' in body


def test_apply_is_super_admin_only():
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert "user.role != UserRole.SUPER_ADMIN" in body


def test_apply_writes_an_audit_log():
    body = ast.get_source_segment(_src(), _fn("stale_bounce_balance_repair_apply"))
    assert "create_audit_log" in body


# --------------------------------------------------------------------------
# The scan writes nothing
# --------------------------------------------------------------------------

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_replace",
    "find_one_and_delete", "bulk_write", "drop", "create_index", "rename",
}


@pytest.mark.parametrize("fn", ["stale_bounce_balance_scan",
                                "_stale_balance_candidates",
                                "_bounced_cheque_numbers_for_bill",
                                "_material_bill_full_amount"])
def test_the_read_paths_cannot_write(fn):
    for node in ast.walk(_fn(fn)):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            assert name not in WRITE_METHODS, "%s in %s" % (name, fn)


def test_only_bounced_cheques_are_listed_on_the_badge():
    """A good cheque on the same bill must never appear as bounced."""
    body = ast.get_source_segment(_src(), _fn("_bounced_cheque_numbers_for_bill"))
    assert '"status": "bounced"' in body


def test_the_case_is_documented():
    src = _src()
    assert "USB-MR1156" in src
    assert "521267" in src and "521268" in src


# --------------------------------------------------------------------------
# The Approvals badge must name every bounced cheque
# --------------------------------------------------------------------------

CARD = os.path.join(BACKEND, "..", "frontend", "src", "components",
                    "AccountantMaterialPayments.jsx")


def _card():
    return io.open(CARD, encoding="utf8").read()


def numbers(row):
    """Mirrors bouncedChequeNumbers in the card."""
    many = row.get("bounced_from_cheque_numbers")
    many = [str(x) for x in many if x] if isinstance(many, list) else []
    if many:
        seen, out = set(), []
        for n in many:
            if n not in seen:
                seen.add(n)
                out.append(n)
        return out
    one = row.get("bounced_from_cheque_number")
    return [str(one)] if one else []


def test_both_cheques_are_named_for_the_reported_bill():
    assert numbers({"bounced_from_cheque_numbers": ["521267", "521268"],
                    "bounced_from_cheque_number": "521268"}) == ["521267", "521268"]


def test_the_old_badge_named_only_the_last_one():
    """What the user saw: #521268, with no hint that #521267 bounced too."""
    assert numbers({"bounced_from_cheque_number": "521268"}) == ["521268"]


def test_rows_written_before_the_list_existed_still_render():
    """Backwards compatible - the scalar is the fallback."""
    assert numbers({"bounced_from_cheque_number": "041296"}) == ["041296"]
    assert numbers({"bounced_from_cheque_numbers": [], "bounced_from_cheque_number": "1"}) == ["1"]


def test_a_bill_with_no_cheque_shows_nothing():
    assert numbers({}) == []


def test_duplicates_are_collapsed():
    assert numbers({"bounced_from_cheque_numbers": ["5", "5", "6"]}) == ["5", "6"]


def test_the_amount_is_only_shown_for_a_single_cheque():
    """The stored amount belongs to the LAST cheque, so printing it beside
    several numbers would attribute one cheque's value to all of them."""
    src = _card()
    assert "nums.length === 1 ? `${joined} · ${fmtFn(r?.bounced_from_cheque_amount)}` : joined" in src


def test_both_cards_use_the_shared_helper():
    """Live and Legacy cards had the same hard-coded scalar - neither may
    drift back."""
    src = _card()
    assert src.count("bouncedChequeLabel(") == 2        # the two call sites
    assert "const bouncedChequeLabel = (r, fmtFn) =>" in src
    assert "#{req.bounced_from_cheque_number}" not in src
    assert "#{exp.bounced_from_cheque_number}" not in src


def test_the_label_pluralises():
    src = _card()
    assert "⚠ Cheque{bouncedChequeNumbers(req).length > 1 ? 's' : ''} Bounced:" in src
    assert "⚠ Cheque{bouncedChequeNumbers(exp).length > 1 ? 's' : ''} Bounced:" in src


def test_the_card_documents_the_case():
    src = _card()
    assert "USB-MR1156" in src
    assert "521267" in src
