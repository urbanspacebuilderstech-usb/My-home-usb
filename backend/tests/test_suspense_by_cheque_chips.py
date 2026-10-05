"""The "Suspense by cheque" chips must sum to the Suspense figure (Oct 5 2026).

Accounts > Suspense A/c > Materials > View, SATHISKUMAR AGENCY:

    header   Suspense 41,767
    chips    Cheque 1,78,923  +  #825413 25,698   =  2,04,621

The header was right. The chips come from a separate FIFO replay in the vendor
ledger endpoint, and that replay DISCARDED any debit arriving while the credit
queue was empty - the `while remaining > 0.5 and _queue` loop just exited and
the unfunded remainder went nowhere. Credit already spent therefore kept
showing as available.

Why the queue was empty: nine debits in Jul-Aug all drew on cheque #001684,
but the credit for that cheque was not written until 1 Sep, as a repair entry
("Restore 180,370 missing seed credit - cheque #001684 tendered 200,000
against a 19,630 bill; the excess was never written to the pool"). Replaying
by created_at meets those debits before their funding exists.

A first guess was that the summary and the ledger applied different filters
and the ledger was dropping debits. The live trace disproved it: all 19
entries came back counted_by_summary=true AND shown_in_ledger=true, with
credits_dropped_by_summary=0. The ordering, not the filtering, was the fault.
"""
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")


def _src():
    return io.open(PROCUREMENT, encoding="utf8").read()


# --------------------------------------------------------------------------
# The replay, mirrored from the endpoint
# --------------------------------------------------------------------------

def replay(entries, carry_unmatched=True):
    """entries: [(amount, label)] in created_at order. Returns the chips."""
    queue, unfunded = [], 0.0
    for amt, label in entries:
        if amt > 0.5:
            rem = amt
            if carry_unmatched and unfunded > 0.5:
                take = min(rem, unfunded)
                rem -= take
                unfunded -= take
            if rem > 0.5:
                queue.append([label, rem])
        elif amt < -0.5:
            remaining = -amt
            while remaining > 0.5 and queue:
                take = min(remaining, queue[0][1])
                queue[0][1] -= take
                remaining -= take
                if queue[0][1] <= 0.5:
                    queue.pop(0)
            if carry_unmatched:
                unfunded += remaining
    return queue


def chips_total(queue):
    return round(sum(r for _, r in queue), 2)


# The real SATHISKUMAR AGENCY ledger, in created_at order.
SATHISKUMAR = [
    (-16308.00, "001684"), (-17516.00, "001684"), (-19630.00, "001684"),
    (-19630.00, "001684"), (-17516.00, "001684"), (-17516.00, "001684"),
    (-19630.00, "001684"), (-16855.80, "001684"), (-15049.80, "001684"),
    (+80435.20, "Cheque"),
    (-16856.00, "001684"), (-19564.80, "000015"), (-18442.87, "000015"),
    (-16519.80, "000015"), (-12254.13, "000015"),
    (+17516.00, "Cheque"), (+180370.00, "Cheque"),
    (-18963.00, "(none)"),
    (+25698.00, "#825413"),
]
TRUE_BALANCE = 41767.00


def test_the_real_ledger_balances_to_the_header_figure():
    assert round(sum(a for a, _ in SATHISKUMAR), 2) == TRUE_BALANCE


def test_the_chips_now_sum_to_that_balance():
    assert chips_total(replay(SATHISKUMAR)) == TRUE_BALANCE


def test_the_old_behaviour_reproduced_the_reported_number():
    """Proof this was the cause and not something upstream."""
    assert chips_total(replay(SATHISKUMAR, carry_unmatched=False)) == 204621.00


def test_the_overstatement_was_exactly_the_discarded_debits():
    old = chips_total(replay(SATHISKUMAR, carry_unmatched=False))
    new = chips_total(replay(SATHISKUMAR))
    assert round(old - new, 2) == 162854.00


def test_the_chip_labels_are_unchanged_apart_from_the_amount():
    q = replay(SATHISKUMAR)
    assert [l for l, _ in q] == ["Cheque", "#825413"]
    assert [round(r, 2) for _, r in q] == [16069.00, 25698.00]


# --------------------------------------------------------------------------
# General properties
# --------------------------------------------------------------------------

@pytest.mark.parametrize("entries", [
    [(+1000.0, "a"), (-400.0, "x")],
    [(-400.0, "x"), (+1000.0, "a")],          # debit first
    [(-400.0, "x"), (-100.0, "y"), (+1000.0, "a")],
    [(+500.0, "a"), (-900.0, "x"), (+1000.0, "b")],
])
def test_chips_always_sum_to_credits_minus_debits(entries):
    assert chips_total(replay(entries)) == round(sum(a for a, _ in entries), 2)


def test_order_no_longer_changes_the_total():
    """The whole defect was that it did."""
    forward = chips_total(replay([(+1000.0, "a"), (-400.0, "x")]))
    reversed_ = chips_total(replay([(-400.0, "x"), (+1000.0, "a")]))
    assert forward == reversed_ == 600.0


def test_a_fully_spent_pool_shows_no_chips():
    assert replay([(+500.0, "a"), (-500.0, "x")]) == []


def test_debits_beyond_every_credit_do_not_produce_negative_chips():
    """An over-drawn pool shows nothing rather than a negative chip."""
    q = replay([(+100.0, "a"), (-500.0, "x")])
    assert q == []


def test_a_later_credit_absorbs_an_earlier_overdraw():
    q = replay([(-500.0, "x"), (+800.0, "a")])
    assert chips_total(q) == 300.0


def test_sub_rupee_noise_is_ignored_as_before():
    q = replay([(+1000.0, "a"), (-0.4, "x"), (+0.3, "b")])
    assert chips_total(q) == 1000.0


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_endpoint_carries_unmatched_debits():
    src = _src()
    assert "_unfunded_debit = 0.0" in src
    assert "_unfunded_debit += remaining" in src
    assert "take = min(rem, _unfunded_debit)" in src


def test_a_credit_is_only_queued_after_settling_the_backlog():
    src = _src()
    block = src[src.index("_unfunded_debit = 0.0"):]
    block = block[:block.index("_cheque_ids_needed")]
    assert block.index("_unfunded_debit -= take") < block.index("_queue.append([se, rem])")


def test_the_case_is_documented():
    src = _src()
    assert "SATHISKUMAR AGENCY" in src
    assert "001684" in src


# --------------------------------------------------------------------------
# Labelling a chip whose entry has no linked cheque
# --------------------------------------------------------------------------

def _label_regex():
    """The real pattern, read out of the module source."""
    import re as _re
    m = _re.search(r'_CHEQUE_IN_DESCRIPTION = re\.compile\((r"[^"]+"), re\.I\)', _src())
    assert m, "_CHEQUE_IN_DESCRIPTION not found"
    return _re.compile(eval(m.group(1)), _re.I)


def label_for(description):
    """Mirrors the fallback: a number only when the text names exactly one."""
    found = sorted(set(_label_regex().findall(description or "")))
    return f"#{found[0]}" if len(found) == 1 else None


@pytest.mark.parametrize("description,expected", [
    ("Excess from cheque(s) 000015 on material bill (mexp_dc5bd18cf621)", "#000015"),
    ("Excess from cheque #825413 - bulk backfilled after the excess-to-suspense flow was restored", "#825413"),
])
def test_a_cheque_named_in_the_description_is_used(description, expected):
    assert label_for(description) == expected


def test_the_reported_entry_now_names_its_cheque():
    """se_a11fbf9873 - the 16,069 chip that rendered as a bare "Cheque"."""
    d = ("Restore 180,370 missing seed credit - cheque #001684 tendered 200,000 "
         "against a 19,630 bill (swipe exp_e0cee333fc29); the excess was never "
         "written to the pool.")
    assert label_for(d) == "#001684"


def test_amounts_in_the_same_sentence_are_not_mistaken_for_cheques():
    """200,000 and 19,630 sit beside the cheque number in that very text."""
    d = "cheque #001684 tendered 200,000 against a 19,630 bill"
    assert label_for(d) == "#001684"


def test_no_cheque_named_means_no_guess():
    d = ("Restore 17,516 to suspense - USB-MR034 was funded from this pool "
         "(audit 11 Aug: credit_used=17,516, leg_count=0)")
    assert label_for(d) is None


def test_two_cheques_named_means_no_guess():
    """Ambiguous text keeps the honest mode label rather than picking one."""
    assert label_for("Excess from cheque 1111 and cheque 2222") is None


def test_a_short_number_is_not_treated_as_a_cheque():
    assert label_for("cheque 12 something") is None


def test_the_fallback_only_runs_when_there_is_no_real_link():
    """A linked cheque must always win - the description is weaker evidence."""
    src = _src()
    block = src[src.index("if cids:"):]
    block = block[:block.index("_suspense_by_cheque[label]")]
    assert block.index('" + ".join(f"#{_cheque_num_by_id') < block.index("_CHEQUE_IN_DESCRIPTION.findall")


def test_the_fallback_creates_no_data():
    """It labels a chip; it must not write a link back onto the entry."""
    src = _src()
    block = src[src.index("_CHEQUE_IN_DESCRIPTION.findall"):]
    block = block[:block.index("_suspense_by_cheque[label]")]
    for w in ("update_one", "insert_one", "update_many", "bulk_write"):
        assert w not in block
