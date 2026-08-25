"""Regression tests: addition income must be matched by STAGE ID, not by name.

Mr Rajesh puzhal, section "Difference of cost - wirecut brick vs Flyash brick":
rows total 31,200 and the two collections against it total 31,200, but the
section reported Received 58,400 / Balance -27,200. The auto-heal grouped
approved income by the stage's free-text LABEL, so a second addition sharing
that name had its collections folded in.

These mirror the resolution rule in projects.py's auto-heal.

    python -m pytest tests/test_addition_income_matching.py -q
"""
import pytest


def resolve(stages, incomes):
    """Mirrors _approved_for_stage: a stage's own linked collections, plus any
    unlinked legacy row bearing its label."""
    by_id, by_label_legacy = {}, {}
    for r in incomes:
        amt = float(r.get("amount") or 0)
        sid = r.get("payment_stage_id") or r.get("stage_id")
        if sid:
            by_id[sid] = by_id.get(sid, 0.0) + amt
        else:
            lbl = r.get("stage") or ""
            by_label_legacy[lbl] = by_label_legacy.get(lbl, 0.0) + amt
    out = {}
    for st in stages:
        sid = st.get("stage_id")
        label = st.get("stage_label") or st.get("stage_name") or ""
        out[sid] = (by_id.get(sid, 0.0) if sid else 0.0) + by_label_legacy.get(label, 0.0)
    return out


LABEL = "Difference of cost - wirecut brick vs Flyash brick"
STAGE_A = {"stage_id": "ps_a", "stage_label": LABEL}
STAGE_B = {"stage_id": "ps_b", "stage_label": LABEL}   # same name, different addition


def test_same_named_stages_do_not_cross_credit():
    """The reported case: 31,200 belongs to A, 27,200 to a same-named B.
    A must read 31,200 — not the combined 58,400."""
    incomes = [
        {"amount": 28474.0, "payment_stage_id": "ps_a", "stage": LABEL},
        {"amount": 2726.0, "payment_stage_id": "ps_a", "stage": LABEL},
        {"amount": 27200.0, "payment_stage_id": "ps_b", "stage": LABEL},
    ]
    got = resolve([STAGE_A, STAGE_B], incomes)
    assert got["ps_a"] == 31200.0, f"expected 31,200 for A, got {got['ps_a']}"
    assert got["ps_b"] == 27200.0
    assert got["ps_a"] + got["ps_b"] == 58400.0  # the old total, now split correctly


def test_balance_is_no_longer_negative():
    """31,200 of rows against 31,200 received leaves zero, not -27,200."""
    incomes = [
        {"amount": 28474.0, "payment_stage_id": "ps_a", "stage": LABEL},
        {"amount": 2726.0, "payment_stage_id": "ps_a", "stage": LABEL},
        {"amount": 27200.0, "payment_stage_id": "ps_b", "stage": LABEL},
    ]
    rows_total = 31200.0
    assert rows_total - resolve([STAGE_A, STAGE_B], incomes)["ps_a"] == 0.0


def test_legacy_income_without_a_stage_link_still_counts_by_label():
    """Rows collected before the stage link existed must not vanish."""
    incomes = [{"amount": 5000.0, "stage": LABEL}]  # no payment_stage_id
    assert resolve([STAGE_A], incomes)["ps_a"] == 5000.0


def test_legacy_and_linked_income_add_together():
    incomes = [
        {"amount": 5000.0, "stage": LABEL},                       # legacy
        {"amount": 1200.0, "payment_stage_id": "ps_a", "stage": LABEL},
    ]
    assert resolve([STAGE_A], incomes)["ps_a"] == 6200.0


def test_income_linked_elsewhere_is_never_pulled_in_by_name():
    """A collection linked to another stage must not reach this one even when
    the labels match exactly — that is the whole defect."""
    incomes = [{"amount": 9999.0, "payment_stage_id": "ps_b", "stage": LABEL}]
    assert resolve([STAGE_A], incomes)["ps_a"] == 0.0


def test_stage_with_no_income_reads_zero():
    assert resolve([STAGE_A], [])["ps_a"] == 0.0


def test_pro_rata_share_across_section_rows_sums_to_the_total():
    """Section rows split the stage total in proportion to their value."""
    approved = 31200.0
    rows = {"c1": 20000.0, "c2": 7200.0, "c3": 4000.0}
    grand = sum(rows.values())
    shares = {c: (a / grand) * approved for c, a in rows.items()}
    assert grand == 31200.0
    assert round(sum(shares.values()), 2) == approved
    assert round(shares["c1"], 2) == 20000.0


# --- pro-rata must never exceed a row's own value (Aug 25 2026) ---------------
# Mr Rajesh puzhal, "Difference of cost - wirecut brick vs Flyash brick":
# the stage links only the 4,000 Sump tank row, but the section also holds
# 20,000 + 7,200. The pro-rata handed that one row the entire 31,200
# collection, and the section footer (which sums income_received across ALL
# its rows) read 58,400 against a 31,200 total => balance -27,200.

def share_for(row_total, grand, approved_total):
    """Mirrors the heal's per-row share, including the cap."""
    share = (row_total / grand) * approved_total if grand else 0
    return min(share, row_total)


def test_row_never_receives_more_than_it_is_worth():
    """The reported case: a 4,000 row must not absorb a 31,200 collection."""
    assert share_for(4000.0, 4000.0, 31200.0) == 4000.0


def test_section_footer_totals_correctly_after_the_cap():
    """Section rows 20,000 + 7,200 (already fully received) + the capped
    4,000 sum to 31,200, matching the section total, so balance is zero."""
    capped_sump = share_for(4000.0, 4000.0, 31200.0)
    received = 20000.0 + 7200.0 + capped_sump
    rows_total = 20000.0 + 7200.0 + 4000.0
    assert received == 31200.0
    assert rows_total - received == 0.0


def test_normal_pro_rata_split_is_unchanged():
    """When the stage links the whole section, the split is untouched."""
    grand = 31200.0
    # round: (4000/31200)*31200 lands on 3999.9999999999995 in binary float.
    # Production compares with a 0.5 tolerance, so this is presentation only.
    assert round(share_for(20000.0, grand, 31200.0), 2) == 20000.0
    assert round(share_for(7200.0, grand, 31200.0), 2) == 7200.0
    assert round(share_for(4000.0, grand, 31200.0), 2) == 4000.0


def test_partial_collection_still_splits_pro_rata():
    """A part-paid section is below the cap, so proportions still apply."""
    grand = 31200.0
    half = 15600.0
    assert round(share_for(20000.0, grand, half), 2) == 10000.0
    assert round(share_for(7200.0, grand, half), 2) == 3600.0
    assert round(share_for(4000.0, grand, half), 2) == 2000.0
    assert round(sum(share_for(a, grand, half) for a in (20000.0, 7200.0, 4000.0)), 2) == half


def test_zero_grand_does_not_divide_by_zero():
    assert share_for(4000.0, 0.0, 31200.0) == 0
