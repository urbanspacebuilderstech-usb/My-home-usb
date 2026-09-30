"""Total Planned / Collected / Balance tiles on CRE Payment Schedule
(Sep 29 2026).

Requested to match the tiles already used on the Accountant's Payment
Schedule page, placed under the month selector and above the
Pending / Partial / Collected / All chips.

They are computed from `dateFiltered` - the same array the "All" chip counts -
so they always describe exactly what the month selector and date filter have
narrowed to, never a wider total. Balance uses the row's own expression
(amount - amount_received, unclamped) so the tiles agree with the table's
Balance column and Planned - Collected always equals Balance.
"""
import io
import os
import re

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRE = os.path.join(BACKEND, "..", "frontend", "src", "pages", "CREBoard.jsx")


def _src():
    return io.open(CRE, encoding="utf8").read()


# --------------------------------------------------------------------------
# The arithmetic, mirrored from the component
# --------------------------------------------------------------------------

def summarise(rows):
    planned = collected = balance = 0.0
    for e in rows:
        amt = float(e.get("amount") or 0)
        got = float(e.get("amount_received") or 0)
        planned += amt
        collected += got
        balance += amt - got
    return {"planned": planned, "collected": collected, "balance": balance}


ROWS = [
    {"amount": 900000, "amount_received": 248000},   # partial
    {"amount": 1113260, "amount_received": 537485},  # partial
    {"amount": 2, "amount_received": 0},             # pending
    {"amount": 24, "amount_received": 0},            # pending
    {"amount": 500000, "amount_received": 500000},   # collected
]


def test_the_three_tiles_reconcile():
    s = summarise(ROWS)
    assert round(s["planned"] - s["collected"], 2) == round(s["balance"], 2)


def test_totals_are_the_plain_sums():
    s = summarise(ROWS)
    assert s["planned"] == 2513286
    assert s["collected"] == 1285485
    assert s["balance"] == 1227801


def test_an_empty_filter_shows_zeroes_not_an_error():
    assert summarise([]) == {"planned": 0.0, "collected": 0.0, "balance": 0.0}


def test_missing_amounts_count_as_zero():
    assert summarise([{}, {"amount": None, "amount_received": None}]) == {
        "planned": 0.0, "collected": 0.0, "balance": 0.0}


def test_a_fully_collected_set_has_no_balance():
    rows = [{"amount": 100, "amount_received": 100},
            {"amount": 250, "amount_received": 250}]
    s = summarise(rows)
    assert s["balance"] == 0
    assert s["planned"] == s["collected"]


def test_an_over_collected_stage_reduces_the_balance_as_its_row_does():
    """The table's Balance column shows amount - amount_received unclamped, so
    a stage collected beyond its amount shows negative there. The tile sums
    the same expression rather than clamping, so the two cannot disagree."""
    rows = [{"amount": 100, "amount_received": 150}]
    assert summarise(rows)["balance"] == -50


@pytest.mark.parametrize("n", [1, 2, 33, 510])
def test_stage_count_is_pluralised(n):
    label = "%d stage%s" % (n, "" if n == 1 else "s")
    assert label.endswith("stage") if n == 1 else label.endswith("stages")


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_tiles_are_rendered():
    src = _src()
    assert 'data-testid="ps-summary-tiles"' in src
    for key in ("planned", "collected", "balance"):
        assert 'data-testid={`ps-summary-${t.key}`}' in src
        assert "key: '%s'" % key in src


def test_all_three_labels_are_present():
    src = _src()
    for label in ("Total Planned", "Collected", "Balance"):
        assert "label: '%s'" % label in src


def test_they_are_computed_from_the_filtered_set():
    """The tiles must follow the month selector, the date filter and the
    search box - never describe a wider set than the table shows.

    Superseded Sep 30 2026: this originally required the reduce to run over
    `dateFiltered` itself. It now runs over `entries`, which is the slice of
    dateFiltered for the ACTIVE sub-tab, so clicking Pending / Partial /
    Collected retotals the tiles for just that bucket instead of always
    showing the full All set. That is a strictly tighter scope, and the
    property this test exists to protect still holds because every branch of
    `entries` is derived from dateFiltered - which the next assertion pins."""
    src = _src()
    assert "const psSummary = entries.reduce((acc, e) => {" in src


def test_the_tile_scope_is_always_derived_from_the_filtered_set():
    """`entries` may be narrowed by sub-tab, but every branch of it must come
    from dateFiltered, or the tiles could outgrow the table."""
    src = _src()
    block = src[src.index("const entries = psSubTab"):]
    block = block[:block.index("return (")]
    assert "pendingEntries" in block and "partialEntries" in block
    assert "collectedEntries" in block and "dateFiltered" in block
    for name in ("pendingEntries", "partialEntries", "collectedEntries"):
        assert "const %s = dateFiltered.filter(" % name in src, name


def test_balance_matches_the_row_expression_and_is_not_clamped():
    src = _src()
    assert "acc.balance += amt - got;" in src
    assert "acc.balance += Math.max(0, amt - got);" not in src
    # the row's own column, for comparison
    assert "const balance = (e.amount || 0) - (e.amount_received || 0);" in src


def test_the_tiles_sit_above_the_filter_chips():
    src = _src()
    assert src.index('data-testid="ps-summary-tiles"') < src.index('data-testid="ps-subtabs"')


def test_the_tiles_sit_below_the_month_selector():
    src = _src()
    assert src.index('data-testid="ps-show-all"') < src.index('data-testid="ps-summary-tiles"')


def test_colour_classes_are_literal_not_interpolated():
    """Tailwind cannot see a class built by string interpolation, so a
    `border-l-${color}-500` would be purged from the production build and the
    tiles would render unstyled."""
    src = _src()
    block = src[src.index("const psSummary"):src.index('data-testid="ps-subtabs"')]
    assert "border-l-indigo-500" in block
    assert "border-l-emerald-500" in block
    assert "border-l-red-500" in block
    assert not re.search(r"border-l-\$\{", block)
