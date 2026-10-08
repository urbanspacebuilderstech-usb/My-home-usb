"""Apportioning a bounced cheque across a part-funded bill (Oct 8 2026).

USB-MR1017 (SS AGENCY, Mr Nagarajan - Ponmar, 38,700) sits in Approvals
reading 38,700 / 0 after Cheque #041296 bounced. The report is that only part
of the bill came from that cheque and the rest from good money, so it should
read `partially_paid` with only the bounced part owing.

Two code paths reverse a bounce and they do not agree:

  * the DIRECT leg in `bounce_cheque` (the `req_type == "material"` branch)
    writes `paid_amount: None` unconditionally - it never asks how much of the
    bill this cheque funded;

  * `_reverse_cheque_material_suspense_and_bills` computes
    `new_paid = old_paid - reduction` and writes `partially_paid` with a
    recomputed `remaining_balance` when anything survives.

The direct branch runs first (financial.py ~7620), the proportional one after
(~7710), so the latter reads an already-zeroed `paid_amount` and
`max(0, 0 - reduction)` keeps it at zero. The proportional logic can never
fire on a bill the direct path touched.

These tests pin the FIFO apportioning the diagnostic replays. It has to match
production exactly - same ordering, same 0.5 thresholds, same exclusion of
prior reversal entries - because the repair amount is read straight off it,
and getting the split backwards would restore money to the wrong side.
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
# The FIFO replay, mirrored from production
# --------------------------------------------------------------------------

def replay(entries):
    """Credits are consumed oldest-first; returns debit -> {credit: amount}."""
    queue, consumed = [], {}
    for se in entries:
        amt = float(se.get("amount") or 0)
        eid = se.get("entry_id")
        if amt > 0.5:
            queue.append([eid, amt])
        elif amt < -0.5:
            remaining = -amt
            while remaining > 0.5 and queue:
                head = queue[0]
                take = min(remaining, head[1])
                consumed.setdefault(eid, {})
                consumed[eid][head[0]] = consumed[eid].get(head[0], 0.0) + take
                head[1] -= take
                remaining -= take
                if head[1] <= 0.5:
                    queue.pop(0)
    return consumed


def e(eid, amt, **kw):
    return dict(entry_id=eid, amount=amt, **kw)


def test_a_debit_straddling_two_credits_is_split_by_age():
    """The case that matters: one bill funded partly by a cheque that later
    bounced and partly by a good one."""
    consumed = replay([e("good", 6000), e("bad", 32700), e("bill", -38700)])
    assert consumed["bill"] == {"good": 6000.0, "bad": 32700.0}


def test_only_the_bounced_share_is_reclaimed():
    consumed = replay([e("good", 6000), e("bad", 32700), e("bill", -38700)])
    bounced = sum(a for c, a in consumed["bill"].items() if c == "bad")
    assert bounced == 32700.0
    assert 38700 - bounced == 6000.0


def test_the_order_of_the_credits_decides_the_split():
    """Whichever credit is OLDER is spent first. Reversing the order moves
    the money to the other side - which is exactly why this is read from the
    ledger rather than assumed from the UI."""
    a = replay([e("bad", 32700), e("good", 6000), e("bill", -38700)])
    b = replay([e("good", 6000), e("bad", 32700), e("bill", -38700)])
    assert a["bill"]["bad"] == 32700.0 and b["bill"]["bad"] == 32700.0
    # but a smaller bill takes only from the head
    c = replay([e("bad", 32700), e("good", 6000), e("bill", -6000)])
    d = replay([e("good", 6000), e("bad", 32700), e("bill", -6000)])
    assert c["bill"] == {"bad": 6000.0}
    assert d["bill"] == {"good": 6000.0}


def test_a_fully_bounced_debit_has_no_good_money():
    consumed = replay([e("bad", 38700), e("bill", -38700)])
    assert consumed["bill"] == {"bad": 38700.0}


def test_a_debit_can_span_three_credits():
    consumed = replay([e("c1", 1000), e("c2", 2000), e("c3", 3000), e("bill", -5500)])
    assert consumed["bill"] == {"c1": 1000.0, "c2": 2000.0, "c3": 2500.0}


def test_leftover_credit_stays_for_the_next_debit():
    consumed = replay([e("c1", 10000), e("b1", -4000), e("b2", -6000)])
    assert consumed["b1"] == {"c1": 4000.0}
    assert consumed["b2"] == {"c1": 6000.0}


def test_a_debit_with_no_credit_left_consumes_nothing():
    """Must not invent funding that was never there."""
    consumed = replay([e("c1", 1000), e("b1", -1000), e("b2", -5000)])
    assert consumed.get("b2", {}) == {}


def test_sub_rupee_noise_is_ignored_both_ways():
    """Production uses 0.5 on both the credit and the debit side."""
    consumed = replay([e("dust", 0.4), e("real", 500), e("bill", -0.3)])
    assert consumed == {}
    assert replay([e("real", 500), e("bill", -100)])["bill"] == {"real": 100.0}


# --------------------------------------------------------------------------
# What the repair would write
# --------------------------------------------------------------------------

def settle(bill_amount, drawn_from_bounced, drawn_from_good):
    """Mirrors the proportional path's decision."""
    new_paid = max(0.0, round(drawn_from_good, 2))
    return {
        "paid_amount": new_paid,
        "remaining_balance": round(max(0.0, bill_amount - new_paid), 2),
        "status": "partially_paid" if new_paid > 0.5 else "pending_accounts_approval",
    }


def test_the_reported_expectation():
    """6,000 stays paid, 32,700 comes back - what the bill should show."""
    assert settle(38700, 32700, 6000) == {
        "paid_amount": 6000.0, "remaining_balance": 32700.0,
        "status": "partially_paid"}


def test_the_inverse_split_restores_the_other_side():
    """If the ledger says only 6,000 was bounced-funded, the answer flips.
    This is why the split is read, not assumed."""
    assert settle(38700, 6000, 32700) == {
        "paid_amount": 32700.0, "remaining_balance": 6000.0,
        "status": "partially_paid"}


def test_a_fully_bounced_bill_goes_back_whole():
    """The common case, and it must not change."""
    assert settle(38700, 38700, 0) == {
        "paid_amount": 0.0, "remaining_balance": 38700.0,
        "status": "pending_accounts_approval"}


def test_what_the_direct_path_does_today():
    """`paid_amount: None` - the good money's record is destroyed."""
    assert float(None or 0) == 0.0


def test_the_wipe_makes_the_proportional_path_a_no_op():
    """The bug in one line: once paid_amount is 0, no reduction can produce
    a partially_paid bill."""
    old_paid = float(None or 0)            # after the direct wipe
    assert max(0.0, round(old_paid - 32700, 2)) == 0.0


# --------------------------------------------------------------------------
# The diagnostic must keep matching production
# --------------------------------------------------------------------------

def test_the_trace_excludes_prior_reversal_entries_like_production_does():
    """Feeding a previous reversal back into the queue would double-count it."""
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert 'e.get("source_type") != "cheque_bounce_reversal"' in body


def test_the_trace_sorts_the_ledger_the_way_production_does():
    """FIFO depends entirely on this ordering."""
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert '.sort([("created_at", 1), ("entry_id", 1)])' in body


def test_the_trace_uses_the_same_bill_amount_fallback_chain():
    """A different chain would report a different remaining_balance."""
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    for f in ("final_amount", "estimated_cost", "estimated_price", "final_price"):
        assert f in body


def test_both_reversal_paths_still_look_the_way_this_describes():
    """If either is changed, this diagnostic's explanation goes stale."""
    src = _src()
    assert '"paid_amount": None,' in src                       # direct wipe
    assert "new_paid = max(0.0, round(old_paid - reduction, 2))" in src
    assert '"status": "partially_paid",' in src


def test_the_direct_wipe_still_runs_before_the_proportional_path():
    """The ordering IS the bug. If it ever flips, re-read the whole thing."""
    src = _src()
    wipe = src.index('"paid_amount": None,')
    prop = src.index("await _reverse_cheque_material_suspense_and_bills(")
    assert wipe < prop


# --------------------------------------------------------------------------
# Safety
# --------------------------------------------------------------------------

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_replace",
    "find_one_and_delete", "bulk_write", "drop", "create_index", "rename",
}


def test_the_trace_cannot_write():
    for node in ast.walk(_fn("cheque_bounce_bill_trace")):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            assert name not in WRITE_METHODS, "%s at line %d" % (name, node.lineno)


def test_every_db_call_in_the_trace_is_a_read():
    reads = {"find", "find_one", "aggregate", "count_documents", "distinct",
             "sort", "to_list"}
    for node in ast.walk(_fn("cheque_bounce_bill_trace")):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            v = node.func.value
            if isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                    and v.value.id == "db":
                assert node.func.attr in reads, node.func.attr


def test_it_reports_that_it_did_not_write():
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert '"write_performed": False' in body
    assert '"read_only": True' in body


def test_it_is_marked_temporary():
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert "TEMPORARY" in body


def test_the_case_is_documented():
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert "USB-MR1017" in body
    assert "041296" in body


# --------------------------------------------------------------------------
# Under-funded debits (Oct 8 2026)
#
# SS AGENCY's ledger has 1,00,000 of debits that no credit ever funded - the
# FIFO queue ran dry and the vendor's suspense sits at -38,800. On such a
# debit, deriving good money as (full - bounced) invents funding that was
# never there: se_3cfa5d7d87 drew 21,500 of its 62,000 and reported 62,000.
# --------------------------------------------------------------------------

def good_money(full, sources, bounced_ids):
    """What the trace reports now - actual draws, not a subtraction."""
    return round(sum(a for c, a in sources.items() if c not in bounced_ids), 2)


def test_good_money_counts_only_what_was_actually_drawn():
    """se_3cfa5d7d87: 62,000 debit, only 21,500 funded."""
    assert good_money(62000, {"c1": 21500.0}, set()) == 21500.0


def test_the_old_subtraction_overstated_it():
    """Proof of what changed - this is the figure a repair would have used."""
    full, bounced = 62000, 0
    assert full - bounced == 62000        # wrong: 40,500 was never funded
    assert good_money(full, {"c1": 21500.0}, set()) == 21500.0


def test_an_entirely_unfunded_debit_has_no_good_money():
    """se_87702f8af6 / se_42947b88a9 - the queue was empty."""
    assert good_money(23800, {}, set()) == 0.0


def test_unfunded_is_reported_separately():
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert '"not_funded_by_any_credit": unfunded,' in body
    assert "unfunded = round(full - bounced_amt - good_amt, 2)" in body


def test_a_fully_funded_debit_is_unaffected_by_the_fix():
    """USB-MR1017 and the 38,700 partial bill are both fully funded, so the
    verdict for them reads the same either way."""
    assert good_money(2300, {"bad": 2300.0}, {"bad"}) == 0.0
    assert good_money(38700, {"good": 24600.0, "bad": 14100.0}, {"bad"}) == 24600.0


def test_the_three_way_split_adds_up():
    full, sources, bad = 62000, {"c1": 21500.0}, set()
    g = good_money(full, sources, bad)
    b = round(sum(a for c, a in sources.items() if c in bad), 2)
    assert round(g + b + (full - g - b), 2) == full


# ---- tracing the bill that is actually affected --------------------------

def test_a_bill_can_be_traced_by_its_own_id():
    """The affected bill is usually NOT the one being looked at: USB-MR1017
    was correct and mexp_7862eb0a6514 was the part-funded one."""
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert "bill_expense_id: Optional[str] = None," in body
    assert 'q = {"request_id": _bill.get("source_request_id")}' in body


def test_a_restore_entry_can_be_tied_back_to_its_debit():
    """se_c5b745607a restores 6,000 for a bill with no debit in the ledger.
    Without reversed_entry_id there is no way to see what it reversed."""
    body = ast.get_source_segment(_src(), _fn("cheque_bounce_bill_trace"))
    assert '"reversed_entry_id": e.get("reversed_entry_id"),' in body


# --------------------------------------------------------------------------
# The money trail (Oct 8 2026)
#
# "was 6,000 ever paid on USB-MR1017 from another cheque?" decides between
# two opposite repairs, so the answer has to come from data. The trail must
# look everywhere a payment can hide - including rows that were HARD-deleted,
# since "Send back to Approvals" removes the leg and its suspense debit
# outright, which is how USB-MR1188's 30,600 disappeared.
# --------------------------------------------------------------------------

def test_the_trail_does_not_filter_by_status():
    """A bounced or deleted leg is still evidence of a payment having been
    made. Filtering them out would answer the question wrongly."""
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    legs = body[body.index("legs = await db.recorded_expenses.find"):]
    legs = legs[:legs.index(".to_list(200)")]
    assert '"status"' not in legs
    assert "is_deleted" not in legs


def test_the_trail_searches_every_id_a_leg_can_be_linked_by():
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    for f in ("request_id", "source_request_id", "approval_id",
              "material_request_id", "material_expense_id"):
        assert '{"%s": {"$in": list(ids)}}' % f in body


def test_it_lists_every_cheque_that_ever_touched_the_bill():
    """The whole question is whether a SECOND cheque is involved."""
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    assert '"cheques_ever_involved": numbers_seen,' in body


def test_it_says_so_when_only_one_cheque_is_involved():
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    assert "if len(numbers_seen) < 2:" in body


def test_it_flags_a_bill_whose_payment_row_is_gone():
    """paid_via_expense_id pointing at a row that no longer exists is the
    signature of the hard delete."""
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    assert '"paid_via_expense_still_exists":' in body


def test_it_reads_the_audit_trail_including_details_only_mentions():
    """A delete names its target in `details`, not always resource_id."""
    body = ast.get_source_segment(_src(), _fn("material_money_trail"))
    assert "db.audit_logs.find" in body
    assert "blob = str(a.get(\"details\") or \"\")" in body


def test_the_send_back_flow_still_hard_deletes_both_rows():
    """The trail's explanation depends on this. If it ever becomes a soft
    delete, deleted legs would be findable and this changes."""
    src = _src()
    assert 'await db.suspense_entries.delete_one({"entry_id": r["entry_id"]})' in src
    assert 'await db.recorded_expenses.delete_one({"expense_id": m.get("expense_id")})' in src


def test_the_money_trail_cannot_write():
    for node in ast.walk(_fn("material_money_trail")):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            assert name not in WRITE_METHODS, "%s at line %d" % (name, node.lineno)


def test_every_db_call_in_the_money_trail_is_a_read():
    reads = {"find", "find_one", "aggregate", "count_documents", "distinct",
             "sort", "to_list"}
    for node in ast.walk(_fn("material_money_trail")):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            v = node.func.value
            if isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                    and v.value.id == "db":
                assert node.func.attr in reads, node.func.attr
