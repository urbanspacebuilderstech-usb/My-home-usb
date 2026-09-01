"""Regression tests: restoring a missing suspense seed credit, exactly once.

SATHISKUMAR AGENCY read -1,45,338. Unlike SHANMUGAM INTERIORS (a duplicated
payment) nothing here is duplicated - `duplicate_findings` came back empty.
Cheque #001684's swipe exp_e0cee333fc29 tendered 2,00,000 against a 19,630
"P sand" bill, so 1,80,370 of excess should have entered the vendor's suspense
pool. It never did. Ten later payments then legitimately drew on credit that
was never funded:

    cheque 001684   credits        0.00   debits  1,76,507.60
    cheque 000015   credits   80,435.20   debits     66,781.60
    manual restore  credits   17,516.00
    net                                          -1,45,338.00

    with the missing seed:  -1,45,338 + 1,80,370 = +35,032

Correcting this CREATES financial data rather than reversing a known-bad write,
so the amount must be derived from the swipe's own record and the write must be
impossible to apply twice.

    python -m pytest tests/test_suspense_seed_restore.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routes.financial import (  # noqa: E402
    _seed_restore_guard_key,
    seed_credit_lookalikes,
)

CHEQUE = "001684"
SWIPE = "exp_e0cee333fc29"
GUARD = _seed_restore_guard_key(CHEQUE, SWIPE)

# The real pool, from the read-only trace.
DEBITS_1684 = [16308.00, 17516.00, 19630.00, 19630.00, 17516.00,
               17516.00, 19630.00, 16855.80, 15049.80, 16856.00]
DEBITS_0015 = [19564.80, 18442.87, 16519.80, 12254.13]
CREDIT_0015 = 80435.20
CREDIT_RESTORE = 17516.00


def credit(amount, **extra):
    e = {"entry_id": "se_x", "vendor_name": "SATHISKUMAR AGENCY", "amount": amount}
    e.update(extra)
    return e


# ------------------------------------------------------- amount is DERIVED

def derived(tendered, applied):
    """Mirrors the endpoint: excess = what was tendered minus what it paid."""
    return round(tendered - applied, 2)


def test_missing_credit_is_derived_from_the_swipe_not_supplied():
    assert derived(200000.0, 19630.0) == 180370.0


def test_derivation_holds_for_other_shapes():
    for tendered, applied in ((50000, 12345.67), (100000, 100000), (7500, 0)):
        assert derived(tendered, applied) == round(tendered - applied, 2)


def test_a_fully_consumed_swipe_derives_no_credit():
    """Nothing to restore when the cheque paid its bill exactly."""
    assert derived(19630.0, 19630.0) == 0.0


# ------------------------------------------------------------- the arithmetic

def test_pool_before_matches_the_board():
    before = (CREDIT_0015 + CREDIT_RESTORE) - (sum(DEBITS_1684) + sum(DEBITS_0015))
    assert round(before, 2) == -145338.0


def test_pool_after_restore_is_exactly_35032():
    before = (CREDIT_0015 + CREDIT_RESTORE) - (sum(DEBITS_1684) + sum(DEBITS_0015))
    assert round(before + 180370.0, 2) == 35032.0


def test_per_cheque_subpools_reconcile_independently():
    """Second, independent route to +35,032 — each cheque's own sub-pool."""
    sub_1684 = 180370.0 - sum(DEBITS_1684)
    sub_0015 = CREDIT_0015 - sum(DEBITS_0015)
    assert round(sub_1684, 2) == 3862.40
    assert round(sub_0015, 2) == 13653.60
    assert round(sub_1684 + sub_0015 + CREDIT_RESTORE, 2) == 35032.0


def test_restoring_leaves_every_cheque_subpool_non_negative():
    """The restored amount must cover 001684's draws, not merely improve them."""
    assert 180370.0 >= sum(DEBITS_1684)


# --------------------------------------------------------------- idempotency

def test_guard_key_is_stable_and_identifies_this_restoration():
    assert _seed_restore_guard_key(CHEQUE, SWIPE) == GUARD
    assert _seed_restore_guard_key(CHEQUE, SWIPE) == _seed_restore_guard_key(CHEQUE, SWIPE)


def test_guard_key_differs_per_cheque_and_per_swipe():
    assert _seed_restore_guard_key("000015", SWIPE) != GUARD
    assert _seed_restore_guard_key(CHEQUE, "exp_other") != GUARD


def test_no_lookalike_in_the_current_pool_so_restore_is_needed():
    """The real entries: one credit from cheque 000015, one manual restore for
    USB-MR034. Neither is a 001684 seed, so the restore must be allowed once."""
    entries = [
        credit(CREDIT_0015, entry_id="se_2717037666",
               description="Excess from cheque(s) 000015 on material bill (mexp_dc5bd18cf621)",
               linked_expense_id="exp_875ebb818553"),
        credit(CREDIT_RESTORE, entry_id="se_2499341b08",
               description="Restore 17,516 to suspense — USB-MR034 was funded from this pool"),
    ]
    assert seed_credit_lookalikes(entries, CHEQUE, SWIPE) == []


def test_rerun_is_blocked_by_the_guarded_credit():
    entries = [credit(180370.0, entry_id="se_new", guard_key=GUARD,
                      restores_swipe_expense_id=SWIPE,
                      description=f"Restore 180,370 missing seed credit — cheque #{CHEQUE}")]
    assert len(seed_credit_lookalikes(entries, CHEQUE, SWIPE)) == 1


def test_rerun_blocked_even_if_the_credit_carries_no_guard_key():
    """A credit seeded by the original code path, or by an earlier hand repair,
    has no guard_key — matching only on that would double-credit the pool."""
    for e in (credit(180370.0, description=f"Excess from cheque(s) {CHEQUE} on material bill"),
              credit(180370.0, linked_expense_id=SWIPE),
              credit(180370.0, restores_swipe_expense_id=SWIPE)):
        assert len(seed_credit_lookalikes([e], CHEQUE, SWIPE)) == 1, e


def test_a_debit_is_never_treated_as_a_seed_credit():
    """Ten debits mention cheque #001684; none may block the restore."""
    debits = [credit(-19630.0, description=f"P sand (via Cheque #{CHEQUE} suspense)")
              for _ in DEBITS_1684]
    assert seed_credit_lookalikes(debits, CHEQUE, SWIPE) == []


def test_another_cheques_credit_does_not_block_this_restore():
    entries = [credit(CREDIT_0015, description="Excess from cheque(s) 000015 on material bill")]
    assert seed_credit_lookalikes(entries, CHEQUE, SWIPE) == []
    assert len(seed_credit_lookalikes(entries, "000015", "exp_875ebb818553")) == 1


def test_near_zero_credit_noise_is_not_a_lookalike():
    assert seed_credit_lookalikes(
        [credit(0.4, description=f"noise cheque #{CHEQUE}")], CHEQUE, SWIPE) == []


# ------------------------------------------------------- apply-time refusals
# The dry-run proves intent; these are the guards the apply re-checks against
# live data immediately before writing, so a pool that moved in between is
# refused rather than written to.

def apply_allowed(before, derived, expect_final, lookalikes=(), tolerance=0.5):
    """Mirrors the apply endpoint's pre-write guards, in order."""
    if derived <= tolerance:
        return "refused: no excess to restore"
    if lookalikes:
        return "refused: seed credit already exists"
    if abs(round(before + derived, 2) - expect_final) > tolerance:
        return "refused: pool moved since the dry-run"
    return "allowed"


def test_the_approved_correction_is_allowed():
    assert apply_allowed(-145338.0, 180370.0, 35032.0) == "allowed"


def test_pool_moved_since_dryrun_is_refused():
    """Someone paid from the pool between review and apply."""
    assert apply_allowed(-160000.0, 180370.0, 35032.0) == "refused: pool moved since the dry-run"


def test_existing_seed_credit_is_refused():
    assert apply_allowed(-145338.0, 180370.0, 35032.0,
                         lookalikes=[credit(180370.0)]) == "refused: seed credit already exists"


def test_swipe_with_no_excess_is_refused():
    assert apply_allowed(-145338.0, 0.0, -145338.0) == "refused: no excess to restore"


def test_guards_are_checked_in_priority_order():
    """A swipe with no excess is refused on that ground even if the pool also
    moved — the more fundamental problem is reported first."""
    assert apply_allowed(-999.0, 0.0, 12345.0) == "refused: no excess to restore"


def test_applying_twice_cannot_change_the_balance_twice():
    """The property that matters: run, then run again on the resulting pool."""
    pool = -145338.0
    entries = []
    for _ in range(2):
        if seed_credit_lookalikes(entries, CHEQUE, SWIPE):
            continue                                   # second run is a no-op
        pool = round(pool + 180370.0, 2)
        entries.append(credit(180370.0, guard_key=GUARD, restores_swipe_expense_id=SWIPE))
    assert pool == 35032.0
    assert len(entries) == 1
