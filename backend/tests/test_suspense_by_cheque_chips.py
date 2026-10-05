"""The "Suspense by cheque" chips (Oct 5 2026).

Accounts > Suspense A/c > Materials > View, SATHISKUMAR AGENCY. Three rounds,
each number kept here so the progression stays legible:

    v1   Cheque 1,78,923 + #825413 25,698  = 2,04,621   vs a 41,767 balance
    v2   Cheque   16,069 + #825413 25,698  =   41,767   balance right, split wrong
    v3   #001684 3,862.40 + #000015 12,206.60 + #825413 25,698 = 41,767

v1 DISCARDED any debit arriving while the credit queue was empty - the
`while remaining > 0.5 and _queue` loop simply exited and the unfunded
remainder went nowhere, losing 1,62,854 of real spending. That happened
because nine debits drew on cheque #001684 in Jul-Aug while #001684's credit
was not written until 1 Sep, by a repair script ("Restore 180,370 missing seed
credit - cheque #001684 tendered 200,000 against a 19,630 bill").

v2 carried those debits forward so the chips summed correctly, but still
replayed oldest-credit-against-oldest-debit, which lets one cheque's debits
eat another cheque's credit. #001684 showed 16,069 when its own arithmetic is

    200000 face - 19630 paid straight to a bill by swipe = 180370 excess
    180370 - 176507.60 of debits tagged to it            =   3862.40

and the Expense list agrees: 2,00,000 - 1,96,138 = 3,862. The extra 12,206.60
was #000015's own remainder folded in.

v3 nets per cheque. Every entry already names one - credits through
linked_cheque_ids or their description, debits through the recorded_expense
they point at. A bucket with no cheque behind it can go negative (here an
18,963 debit against a 17,516 restore credit); that deficit settles against
the other buckets oldest-CREDIT-first.
"""
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")


def _src():
    return io.open(PROCUREMENT, encoding="utf8").read()


# --------------------------------------------------------------------------
# The attribution, mirrored from the endpoint
# --------------------------------------------------------------------------

def chips(entries):
    """entries: [(amount, cheque_label, created_at)] -> {label: balance}"""
    bucket, first_credit = {}, {}
    for amt, lab, ts in entries:
        bucket[lab] = round(bucket.get(lab, 0.0) + amt, 2)
        if amt > 0.5 and lab not in first_credit:
            first_credit[lab] = ts
    deficit = round(sum(v for v in bucket.values() if v < -0.5), 2)
    if deficit < -0.5:
        for lab in sorted([l for l, v in bucket.items() if v > 0.5],
                          key=lambda l: first_credit.get(l, "")):
            if deficit >= -0.5:
                break
            take = min(bucket[lab], -deficit)
            bucket[lab] = round(bucket[lab] - take, 2)
            deficit = round(deficit + take, 2)
    return {l: v for l, v in bucket.items() if v > 0.5}


def total(c):
    return round(sum(c.values()), 2)


# The real SATHISKUMAR AGENCY ledger.
SATHISKUMAR = [
    (-16308.00, "#001684", "2026-07-03T12:35"), (-17516.00, "#001684", "2026-07-03T12:36:02"),
    (-19630.00, "#001684", "2026-07-03T12:36:24"), (-19630.00, "#001684", "2026-07-03T12:36:35"),
    (-17516.00, "#001684", "2026-07-03T12:36:47"), (-17516.00, "#001684", "2026-07-07T09:44"),
    (-19630.00, "#001684", "2026-07-07T09:45"), (-16855.80, "#001684", "2026-08-11T06:25"),
    (-15049.80, "#001684", "2026-08-11T06:34"),
    (+80435.20, "#000015", "2026-08-11T14:13"),
    (-16856.00, "#001684", "2026-08-11T14:14"), (-19564.80, "#000015", "2026-08-11T14:16"),
    (-18442.87, "#000015", "2026-08-11T14:18:07"), (-16519.80, "#000015", "2026-08-11T14:18:57"),
    (-12254.13, "#000015", "2026-08-12T14:26"),
    (+17516.00, "Cheque", "2026-08-18T11:09"),
    (+180370.00, "#001684", "2026-09-01T12:50"),
    (-18963.00, "Cheque", "2026-09-01T13:44"),
    (+25698.00, "#825413", "2026-09-18T13:03"),
]
TRUE_BALANCE = 41767.00


def test_the_ledger_balances_to_the_header_figure():
    assert round(sum(a for a, _, _ in SATHISKUMAR), 2) == TRUE_BALANCE


def test_cheque_001684_shows_its_own_remainder():
    """The reported case. 2,00,000 - 1,96,138 = 3,862 on the Expense list."""
    assert chips(SATHISKUMAR)["#001684"] == 3862.40


def test_the_other_cheques_are_right_too():
    c = chips(SATHISKUMAR)
    assert c["#000015"] == 12206.60
    assert c["#825413"] == 25698.00


def test_the_chips_still_sum_to_the_balance():
    assert total(chips(SATHISKUMAR)) == TRUE_BALANCE


def test_the_v2_number_was_two_cheques_conflated():
    """16,069 was #001684's 3,862.40 plus #000015's 12,206.60."""
    assert round(3862.40 + 12206.60, 2) == 16069.00


def test_001684_arithmetic_matches_the_expense_list():
    face, swipe = 200000.00, 19630.00
    debits = round(sum(-a for a, l, _ in SATHISKUMAR if l == "#001684" and a < 0), 2)
    assert debits == 176507.60
    assert round(face - swipe - debits, 2) == 3862.40
    assert round(swipe + debits, 2) == 196137.60      # the 1,96,138 on screen


# --------------------------------------------------------------------------
# Properties
# --------------------------------------------------------------------------

@pytest.mark.parametrize("entries", [
    [(+1000.0, "#1", "a"), (-400.0, "#1", "b")],
    [(-400.0, "#1", "a"), (+1000.0, "#1", "b")],
    [(+1000.0, "#1", "a"), (-400.0, "#2", "b"), (+500.0, "#2", "c")],
    [(+600.0, "#1", "a"), (+400.0, "#2", "b"), (-900.0, "#1", "c")],
])
def test_chips_always_sum_to_credits_minus_debits(entries):
    assert total(chips(entries)) == round(sum(a for a, _, _ in entries), 2)


def test_one_cheque_cannot_eat_another_cheques_credit():
    """The whole v2 defect. #2 spent nothing, so it keeps all 500."""
    c = chips([(+500.0, "#1", "a"), (+500.0, "#2", "b"), (-500.0, "#1", "c")])
    assert c == {"#2": 500.0}


def test_order_does_not_change_the_split():
    forward = chips([(+500.0, "#1", "a"), (-200.0, "#1", "b"), (+300.0, "#2", "c")])
    shuffled = chips([(+300.0, "#2", "c"), (-200.0, "#1", "b"), (+500.0, "#1", "a")])
    assert forward == shuffled


def test_a_deficit_settles_against_the_oldest_credit():
    """Not the oldest ENTRY - the oldest funding. #1's credit is older, so it
    absorbs the unattributed overspend and #2 keeps its own."""
    c = chips([(+1000.0, "#1", "2026-01-01"), (+1000.0, "#2", "2026-02-01"),
               (-300.0, "Cheque", "2026-03-01")])
    assert c == {"#1": 700.0, "#2": 1000.0}


def test_a_fully_spent_cheque_shows_no_chip():
    assert chips([(+500.0, "#1", "a"), (-500.0, "#1", "b")]) == {}


def test_no_negative_chip_is_ever_shown():
    c = chips([(+1000.0, "#1", "a"), (-200.0, "Cheque", "b")])
    assert all(v > 0 for v in c.values())
    assert total(c) == 800.0


def test_sub_rupee_noise_is_ignored():
    c = chips([(+1000.0, "#1", "a"), (-0.4, "#1", "b")])
    assert total(c) == 999.60


# --------------------------------------------------------------------------
# Labelling
# --------------------------------------------------------------------------

def _label_regex():
    import re as _re
    m = _re.search(r'_CHEQUE_IN_DESCRIPTION = re\.compile\((r"[^"]+"), re\.I\)', _src())
    assert m, "_CHEQUE_IN_DESCRIPTION not found"
    return _re.compile(eval(m.group(1)), _re.I)


def label_from_description(description):
    found = sorted(set(_label_regex().findall(description or "")))
    return f"#{found[0]}" if len(found) == 1 else None


@pytest.mark.parametrize("description,expected", [
    ("Excess from cheque(s) 000015 on material bill (mexp_dc5bd18cf621)", "#000015"),
    ("Excess from cheque #825413 - bulk backfilled", "#825413"),
])
def test_a_cheque_named_in_the_description_is_used(description, expected):
    assert label_from_description(description) == expected


def test_the_restore_entry_names_its_cheque():
    d = ("Restore 180,370 missing seed credit - cheque #001684 tendered 200,000 "
         "against a 19,630 bill (swipe exp_e0cee333fc29)")
    assert label_from_description(d) == "#001684"


def test_amounts_in_the_same_sentence_are_not_mistaken_for_cheques():
    assert label_from_description(
        "cheque #001684 tendered 200,000 against a 19,630 bill") == "#001684"


def test_ambiguous_or_absent_text_is_not_guessed():
    assert label_from_description("Restore 17,516 - USB-MR034 funded from this pool") is None
    assert label_from_description("Excess from cheque 1111 and cheque 2222") is None
    assert label_from_description("cheque 12 something") is None


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_endpoint_nets_per_cheque():
    src = _src()
    assert "_bucket[lab] = round(_bucket.get(lab, 0.0) + amt, 2)" in src
    assert "_suspense_by_cheque = {l: v for l, v in _bucket.items() if v > 0.5}" in src


def test_the_old_date_fifo_is_gone():
    """A queue replay by date is what conflated the two cheques."""
    src = _src()
    assert "_unfunded_debit" not in src
    assert "_queue.append([se, rem])" not in src


def test_a_real_link_outranks_the_description():
    src = _src()
    block = src[src.index("def _label_for(se):"):]
    block = block[:block.index("_bucket: Dict[str, float] = {}")]
    assert block.index("linked_cheque_ids") < block.index("_CHEQUE_IN_DESCRIPTION")
    assert block.index("_CHEQUE_IN_DESCRIPTION") < block.index("_expense_by_id_l")


def test_the_deficit_settles_by_first_credit_not_first_entry():
    src = _src()
    assert '_first_credit[lab] = se.get("created_at")' in src
    assert 'key=lambda l: _first_credit.get(l, "")' in src


def test_the_labelling_writes_nothing():
    src = _src()
    block = src[src.index("def _label_for(se):"):]
    block = block[:block.index("suspense_by_cheque = sorted(")]
    for w in ("update_one", "insert_one", "update_many", "bulk_write", "delete_one"):
        assert w not in block


def test_the_case_is_documented():
    src = _src()
    assert "SATHISKUMAR AGENCY" in src
    assert "001684" in src
    assert "3,862.40" in src
