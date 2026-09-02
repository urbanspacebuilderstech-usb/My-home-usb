"""Regression tests: Suspense A/c tiles must classify modes canonically.

Suspense A/c > Materials showed CASH 1,78,923 against CHEQUE -31,664 on a pool
that is almost entirely cheque-funded. The audit proved the totals were right
(1,47,260.79) and only the SPLIT was wrong, for two reasons:

  1. The page's own classifier guessed by keyword and disagreed with the
     backend's canonical `_PAYMENT_MODE_MAP`. `cash_dt` is direct_transfer but
     contains no "transfer", so it fell through to Cash — the Cash DT tile
     could never populate. `upi` is current_account and also fell to Cash.

  2. Cash was the FALL-THROUGH, so a null mode was indistinguishable from real
     cash. 1,97,886 of cheque-funded restorations (se_2499341b08 +17,516 and
     se_a11fbf9873 +1,80,370, neither carrying a linked expense to join back
     to) sat in the CASH tile.

Unknown must now land in an explicit "unattributed" bucket, never Cash.

    python -m pytest tests/test_suspense_mode_classification.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.financial import (  # noqa: E402
    classify_payment_mode,
    classify_suspense_bucket,
    suspense_bucket_reason,
)


# ------------------------------------------------- the modes named in the fix

def test_cheque_modes():
    for m in ("cheque", "CHEQUE", " Cheque ", "check"):
        assert classify_suspense_bucket(m) == "cheque", m


def test_cash_modes():
    assert classify_suspense_bucket("cash") == "cash"
    assert classify_suspense_bucket("cash_deposit") == "cash"


def test_current_account_modes():
    for m in ("hdfc_current", "current_account", "bank_transfer", "neft", "rtgs", "imps"):
        assert classify_suspense_bucket(m) == "current_account", m


def test_savings_modes():
    for m in ("hdfc_savings", "savings", "savings_account"):
        assert classify_suspense_bucket(m) == "savings_account", m


def test_cash_dt_is_direct_transfer_not_cash():
    """The defect that made the Cash DT tile permanently read 0."""
    for m in ("cash_dt", "CASH_DT", "dt", "direct_transfer"):
        assert classify_suspense_bucket(m) == "direct_transfer", m


def test_upi_follows_the_backend_map_not_the_old_keyword_guess():
    """upi matched no keyword before, so it fell through to Cash."""
    assert classify_payment_mode("upi") == "current_account"
    assert classify_suspense_bucket("upi") == "current_account"


# ------------------------------------------------- unknown never becomes cash

def test_null_and_blank_are_unattributed_not_cash():
    for m in (None, "", "   "):
        assert classify_suspense_bucket(m) == "unattributed", repr(m)


def test_unrecognised_mode_is_unattributed_not_cash():
    for m in ("dd", "online", "something_new", "???"):
        assert classify_suspense_bucket(m) == "unattributed", m


def test_a_real_mode_with_no_tile_is_unattributed_not_silently_cash():
    """petty_cash / miscellaneous / suspense / multi classify fine but have no
    tile on this page; they must not be folded into Cash."""
    for m in ("petty_cash", "miscellaneous", "suspense_account", "multi"):
        assert classify_payment_mode(m) not in ("cash",), m
        assert classify_suspense_bucket(m) == "unattributed", m


def test_backend_classify_payment_mode_still_answers_cash_for_null():
    """Unchanged on purpose — for a PAYMENT a null still means cash. Only the
    suspense wrapper treats null as unknown."""
    assert classify_payment_mode(None) == "cash"


def test_reason_explains_each_outcome():
    assert "no payment mode recorded" in suspense_bucket_reason(None)
    assert "no tile" in suspense_bucket_reason("multi")
    assert "cheque" in suspense_bucket_reason("cheque")


# ------------------------------------------------- fuzzy aliases still land

def test_alias_variants_land_correctly():
    assert classify_suspense_bucket("sbi_current") == "current_account"
    assert classify_suspense_bucket("hdfc savings a/c") == "savings_account"
    assert classify_suspense_bucket("Cheque No 001684") == "cheque"


# ------------------------------------------------- the production correction

REAL_ENTRIES = [
    ("se_2499341b08", 17516.0, None),      # USB-MR034 restoration, no mode
    ("se_a11fbf9873", 180370.0, None),     # seed-credit restoration, no mode
    ("se_60a2648fa9", 21500.0, "cheque"),
    ("se_06d339a841", -20700.0, "cheque"),
]


def _tiles(rows, override=None):
    out = {}
    for eid, amt, mode in rows:
        m = override.get(eid, mode) if override else mode
        b = classify_suspense_bucket(m)
        out[b] = round(out.get(b, 0.0) + amt, 2)
    return out


def test_the_two_restorations_currently_land_in_unattributed_not_cash():
    """Before the backfill they have no mode — they must show as Unattributed,
    which is the honest answer, rather than inflating Cash."""
    t = _tiles(REAL_ENTRIES)
    assert t["unattributed"] == 197886.0
    assert "cash" not in t


def test_backfilling_the_two_entries_moves_exactly_197886_to_cheque():
    before = _tiles(REAL_ENTRIES)
    after = _tiles(REAL_ENTRIES, {"se_2499341b08": "cheque", "se_a11fbf9873": "cheque"})
    assert before["unattributed"] == 197886.0
    assert "unattributed" not in after
    assert round(after["cheque"] - before["cheque"], 2) == 197886.0
    assert round(sum(before.values()), 2) == round(sum(after.values()), 2)


# ------------------------------------------------- backfill apply guards

def backfill_allowed(targets_existing_modes, payment_mode, moved, expect_moved,
                     dest_after, expect_dest_after, tolerance=0.5):
    """Mirrors the apply endpoint's pre-write refusals, in order."""
    if classify_suspense_bucket(payment_mode) == "unattributed":
        return "refused: mode resolves to nothing"
    if any((m or "").strip() for m in targets_existing_modes):
        return "refused: entry already has a payment_mode"
    if abs(moved - expect_moved) > tolerance:
        return "refused: amount differs from what was approved"
    if abs(dest_after - expect_dest_after) > tolerance:
        return "refused: destination total differs from what was approved"
    return "allowed"


def test_the_approved_backfill_is_allowed():
    assert backfill_allowed([None, None], "cheque", 197886.0, 197886.0,
                            166221.41, 166221.41) == "allowed"


def test_backfilling_a_mode_that_resolves_to_nothing_is_refused():
    """Stamping 'multi' or junk would move money into Unattributed — pointless
    and misleading, so it is blocked outright."""
    for bad in ("multi", "petty_cash", "???", ""):
        assert backfill_allowed([None, None], bad, 1.0, 1.0, 1.0, 1.0) == \
            "refused: mode resolves to nothing", bad


def test_entry_with_an_existing_mode_is_never_overwritten():
    assert backfill_allowed([None, "cash"], "cheque", 197886.0, 197886.0,
                            166221.41, 166221.41) == "refused: entry already has a payment_mode"


def test_amount_drift_since_the_dryrun_is_refused():
    assert backfill_allowed([None, None], "cheque", 200000.0, 197886.0,
                            166221.41, 166221.41) == "refused: amount differs from what was approved"


def test_destination_drift_since_the_dryrun_is_refused():
    assert backfill_allowed([None, None], "cheque", 197886.0, 197886.0,
                            170000.0, 166221.41) == \
        "refused: destination total differs from what was approved"


def test_rerun_is_a_noop_because_the_filter_requires_an_unset_mode():
    """After the first run both entries carry 'cheque', so the update filter
    (payment_mode absent/null/blank) matches nothing."""
    def matches(mode):
        return mode is None or mode == "" or "payment_mode_absent" == mode
    assert matches(None) is True
    assert matches("cheque") is False
    # and the guard above refuses a second attempt anyway
    assert backfill_allowed(["cheque", "cheque"], "cheque", 197886.0, 197886.0,
                            166221.41, 166221.41) == "refused: entry already has a payment_mode"


def test_total_is_invariant_under_reclassification():
    """Reclassifying can only move money between tiles, never create or destroy
    it — the property that makes this correction safe."""
    for mode in ("cheque", "cash", "hdfc_current", "cash_dt", None):
        after = _tiles(REAL_ENTRIES, {"se_a11fbf9873": mode})
        assert round(sum(after.values()), 2) == round(sum(_tiles(REAL_ENTRIES).values()), 2)
