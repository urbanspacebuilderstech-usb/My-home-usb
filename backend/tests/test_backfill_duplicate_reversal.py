"""Reversing a duplicate backfill allocation (Sep 30 2026).

The excess-to-suspense bulk backfill recorded each cheque's unallocated
leftover as an allocation plus a matching vendor suspense credit. On NINE of
the ten cheques it touched, the genuine allocations summed to less than the
face value and the backfill amount was exactly the remainder:

    607983   face 2,00,000 = genuine 1,05,300.00 + backfill   94,700.00
    157662   face 1,86,359 = genuine 1,27,477.60 + backfill   58,881.40
    141794   face 2,00,000 = genuine 1,71,599.90 + backfill   28,400.10
    825413   face   60,000 = genuine   34,302.00 + backfill   25,698.00
    000036   face 2,00,000 = genuine 1,76,008.00 + backfill   23,992.00
    000002   face 1,00,000 = genuine   82,081.55 + backfill   17,918.45
    242436   face 2,00,000 = genuine 1,96,000.00 + backfill    4,000.00
    141792   face 3,00,000 = genuine 2,96,230.00 + backfill    3,770.00

Those are correct and must be left alone.

On cheque #105862 the genuine allocation already covered the entire 2,00,000
for one expense - the bill consumed 1,09,699.70 and the 90,300.30 excess had
already been routed to suspense - so the backfill's further 2,00,000 was money
that never existed:

    105862   face 2,00,000 = genuine 2,00,000.00 + backfill 2,00,000.00
                           = 4,00,000, exceeding the cheque by 2,00,000

The guard is arithmetic, not wording: active allocations must EXCEED the face
value, and by exactly the backfill amount. A first pass at this scan flagged
all ten because it only looked for the "bulk backfill" note, which overstated
the exposure by 2,65,359.95 and invented an 'already spent' figure that was
not real. The tests below pin the arithmetic so that cannot recur.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
    "bulk_write", "drop",
}


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _seg(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def _writes(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return [ast.unparse(c.func) for c in ast.walk(node)
                    if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)
                    and c.func.attr in WRITE_METHODS]
    raise AssertionError(f"{name} not found")


# --------------------------------------------------------------------------
# The guard, as arithmetic
# --------------------------------------------------------------------------

def is_duplicate(face, genuine_total, backfill_total):
    """Mirrors _backfill_reversal_context's refusal rules."""
    active = round(genuine_total + backfill_total, 2)
    overage = round(active - face, 2)
    if overage <= 0.5:
        return False                      # reconciles: a real leftover
    return abs(overage - backfill_total) <= 0.5


LEGITIMATE = [
    ("607983", 200000.0, 105300.00, 94700.00),
    ("157662", 186359.0, 127477.60, 58881.40),
    ("141794", 200000.0, 171599.90, 28400.10),
    ("825413",  60000.0,  34302.00, 25698.00),
    ("000036", 200000.0, 176008.00, 23992.00),
    ("000002", 100000.0,  82081.55, 17918.45),
    ("242436", 200000.0, 196000.00,  4000.00),
    ("141792", 300000.0, 296230.00,  3770.00),
]


@pytest.mark.parametrize("num,face,gen,bf", LEGITIMATE)
def test_a_cheque_that_reconciles_is_refused(num, face, gen, bf):
    """These backfills record REAL leftover money. Reversing one would take
    credit the vendor is genuinely owed."""
    assert round(gen + bf, 2) == face, f"{num} should reconcile exactly"
    assert not is_duplicate(face, gen, bf), num


def test_cheque_105862_is_accepted():
    assert is_duplicate(200000.0, 200000.0, 200000.0)


def test_the_overage_must_equal_the_backfill_amount():
    """If allocations exceed the face value by some OTHER amount, the cause is
    not this backfill row and removing it would not fix the cheque."""
    assert not is_duplicate(face=200000.0, genuine_total=250000.0, backfill_total=20000.0)


def test_a_cheque_under_allocated_is_refused():
    assert not is_duplicate(face=200000.0, genuine_total=50000.0, backfill_total=20000.0)


def test_fifty_paise_of_slack_either_way():
    assert not is_duplicate(200000.0, 105300.0, 94700.4)
    assert is_duplicate(200000.0, 200000.0, 200000.3)


# --------------------------------------------------------------------------
# What the repair does
# --------------------------------------------------------------------------

def test_the_preview_writes_nothing():
    assert _writes("backfill_reversal_preview") == []
    assert _writes("_backfill_reversal_context") == []


def test_the_apply_performs_exactly_two_writes():
    assert sorted(_writes("backfill_reversal_apply")) == [
        "db.cheque_allocations.update_one", "db.suspense_entries.insert_one"]


def test_nothing_is_deleted():
    """The original credit stays on the ledger with its reversal beside it."""
    seg = _seg("backfill_reversal_apply")
    assert "delete_one" not in seg and "delete_many" not in seg
    assert '"status": "reversed_duplicate"' in seg


def test_the_reversing_entry_is_negative_and_traceable():
    seg = _seg("backfill_reversal_apply")
    assert '"amount": -amount,' in seg
    assert '"reverses_entry_id": entry_id,' in seg
    assert '"source_type": "backfill_duplicate_reversal",' in seg


def test_the_reversing_entry_has_no_linked_expense():
    """_live_vendor_suspense_balance drops a row whose linked expense has
    died. A reversal must never be droppable, or the phantom credit would
    silently return."""
    seg = _seg("backfill_reversal_apply")
    block = seg.split("db.suspense_entries.insert_one({", 1)[1].split("})", 1)[0]
    assert "linked_expense_id" not in block


def test_the_allocation_update_is_idempotent():
    seg = _seg("backfill_reversal_apply")
    assert '{"allocation_id": allocation_id, "status": "active"}' in seg
    assert "if res.matched_count == 0:" in seg


def test_an_already_reversed_entry_is_refused():
    seg = _seg("_backfill_reversal_context")
    assert 'e.get("reverses_entry_id") == dup_credit.get("entry_id")' in seg


def test_it_refuses_when_the_credit_has_already_been_spent():
    """If reversing would drive the balance negative, some of the phantom
    money has already funded a real bill and a ledger reversal alone is the
    wrong repair."""
    seg = _seg("_backfill_reversal_context")
    assert 'balance - _f(dup_credit.get("amount")) < -0.5' in seg


def test_apply_requires_a_token_a_reason_and_super_admin():
    seg = _seg("backfill_reversal_apply")
    assert "if confirm != expect:" in seg
    assert "len(reason.strip()) < 5" in seg
    assert "user.role != UserRole.SUPER_ADMIN" in seg


def test_apply_rederives_rather_than_trusting_the_caller():
    seg = _seg("backfill_reversal_apply")
    assert "await _backfill_reversal_context(" in seg
    assert 'allocation_id does not match the one found live' in seg
    assert 'entry_id does not match the one found live' in seg


def test_it_verifies_the_cheque_reconciles_afterwards():
    seg = _seg("backfill_reversal_apply")
    assert '"cheque_now_reconciles"' in seg
    assert '"vendor_suspense_is_correct"' in seg


def test_the_two_cases_are_documented():
    """The block above the helper has to explain why nine cheques are left
    alone and one is not, or the next reader will "fix" the other nine."""
    src = _src()
    block = src[src.index("# Sep 30 2026 - reverse a bulk-backfill allocation"):]
    block = block[:block.index("async def _backfill_reversal_context")]
    assert "105862" in block
    assert "nine" in block.lower()
    assert "1,09,699.70" in block or "109699.70" in block


def test_the_post_write_balance_is_read_directly():
    """The verification must not go back through _backfill_reversal_context.

    That helper derives the vendor from the backfill allocation, which the
    write has just moved out of `active` - so a second call finds no
    allocation, never sets `vendor`, fetches no suspense rows and reports a
    balance of 0. On the #105862 repair it announced vendor_suspense_after 0
    against an expected 0.70 and flagged the repair incorrect, when the ledger
    was exactly right. A verification that measures nothing and calls it zero
    is worse than none.
    """
    seg = _seg("backfill_reversal_apply")
    assert "after_balance = round(sum(" in seg
    assert '"vendor_suspense_after": after_balance,' in seg
    assert '"vendor_suspense_after": after["vendor_suspense_balance_now"],' not in seg


def test_the_direct_read_filters_by_the_vendor_captured_before_the_write():
    seg = _seg("backfill_reversal_apply")
    block = seg.split("after_balance = round(sum(", 1)[1].split("alloc_now", 1)[0]
    assert '(vendor or "").lower()' in block, "must reuse the pre-write vendor name"
