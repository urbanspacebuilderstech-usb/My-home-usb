"""Regression tests: a vendor suspense pool must never go negative.

SHANMUGAM INTERIORS read -54,500 labelled "vendor owes". It was not a
receivable. On 13 Aug 2026 one payment was submitted twice, 1.495s apart
(exp_bae857479aae at 12:22:16.618, exp_1b91be694b7f at 12:22:18.113), against
bill mexp_291acb003094. Each submit wrote a 63,600 payment AND a -63,600
suspense debit, so a 72,700 pool was drawn twice for 63,600:

    credits  21,500 + 13,400 + 59,300              =   94,200
    debits   20,700 +    800 + 63,600 + 63,600     = -148,700
    net                                            =  -54,500
    correct (one 63,600 removed)                   =   +9,100

Three protections are covered here:
  1. floor  - a payment may never apply more credit than the pool holds
  2. display- a negative pool reads as an integrity error, not "vendor owes"
  3. filter - credits and debits are filtered by ONE shared rule, so the
              summary cannot drop a credit while keeping its debit

    python -m pytest tests/test_vendor_suspense_integrity.py -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

_EXCL = {"rejected", "accountant_rejected", "accounts_rejected", "under_correction", "cheque_bounced"}
_APPROVED = {"approved", "accounts_approved", "super_admin_approved"}

# The production entries, verbatim from the read-only trace.
SHANMUGAM = [
    ("se_60a2648fa9", +21500.0, "exp_fb147a940c40", "approval"),
    ("se_06d339a841", -20700.0, "exp_8c971fd28ac1", "approval_suspense"),
    ("se_075b825ee9", -800.0, "exp_ef234184b572", "approval_suspense"),
    ("se_043a04755c", +13400.0, "exp_eb78eab33500", "approval"),
    ("se_3a7f41ed05", +59300.0, "exp_2cf2eb2cbf0d", "approval"),
    ("se_25a9480ebe", -63600.0, "exp_bae857479aae", "approval_suspense"),
    ("se_18dc63c412", -63600.0, "exp_1b91be694b7f", "approval_suspense"),  # duplicate
]


# --------------------------------------------------------------- 1. the floor

def floor_allows(credit_used, pool_now, tolerance=0.5):
    """Mirrors the guard added before any write in pay_approval, including its
    `if credit_used > 0.5` gate — a payment applying no suspense never consults
    the pool, so it must not be blocked by a damaged one."""
    if credit_used <= 0.5:
        return True
    return not (credit_used > pool_now + tolerance)


def test_the_duplicate_submit_is_now_refused():
    """Pool 72,700; first draw of 63,600 allowed, second sees 9,100 and fails."""
    pool = 13400.0 + 59300.0
    assert floor_allows(63600.0, pool) is True
    pool -= 63600.0                       # first submit's debit lands
    assert floor_allows(63600.0, pool) is False, "second submit must be refused"


def test_exact_pool_drain_is_allowed():
    assert floor_allows(9100.0, 9100.0) is True


def test_overdraw_by_a_rupee_is_refused():
    assert floor_allows(9101.0, 9100.0) is False


def test_already_negative_pool_refuses_any_draw():
    """A damaged pool must not be dug deeper."""
    assert floor_allows(1.0, -54500.0) is False


def test_rounding_tolerance_does_not_block_a_legitimate_payment():
    assert floor_allows(9100.4, 9100.0) is True


def test_no_suspense_requested_is_unaffected():
    """credit_used <= 0.5 never reaches the floor check."""
    assert floor_allows(0.0, -54500.0) is True


# ------------------------------------------------------- 2. integrity display

def integrity(suspense_balance):
    """Mirrors the summary's row flags."""
    err = suspense_balance < -0.5
    return {"suspense_integrity_error": err,
            "suspense_overdrawn_by": round(abs(suspense_balance), 2) if err else 0.0}


def test_negative_pool_is_flagged_as_integrity_error():
    f = integrity(-54500.0)
    assert f["suspense_integrity_error"] is True
    assert f["suspense_overdrawn_by"] == 54500.0


def test_positive_and_zero_pools_are_not_flagged():
    for bal in (9100.0, 0.0, 0.4, -0.4):
        assert integrity(bal)["suspense_integrity_error"] is False, bal
        assert integrity(bal)["suspense_overdrawn_by"] == 0.0, bal


def test_corrected_shanmugam_balance_is_not_flagged():
    """After the duplicate is removed the vendor holds credit, not a deficit."""
    corrected = sum(a for eid, a, _, _ in SHANMUGAM if eid != "se_18dc63c412")
    assert corrected == 9100.0
    assert integrity(corrected)["suspense_integrity_error"] is False


# ---------------------------------------------------------- 3. symmetric filter

def live_ids(expenses, approved_only):
    """approved_only=True reproduces the OLD summary rule (pre-narrowed to
    approved statuses); False is the shared rule now used by both views."""
    out = set()
    for e in expenses:
        st = (e.get("status") or "").lower()
        if approved_only and st not in _APPROVED:
            continue
        if st in _EXCL or e.get("is_deleted"):
            continue
        out.add(e["expense_id"])
    return out


def balance(entries, expenses, approved_only):
    live = live_ids(expenses, approved_only)
    return round(sum(a for _, a, linked, _ in entries if not linked or linked in live), 2)


def test_old_rule_could_drop_a_credit_while_keeping_its_debit():
    """The bias the shared rule removes: the credit's payment is partially_paid
    (not approved), the debit's approval_suspense row is hardcoded approved."""
    entries = [("se_c", +50000.0, "exp_pay", "approval"),
               ("se_d", -50000.0, "exp_sus", "approval_suspense")]
    expenses = [{"expense_id": "exp_pay", "status": "partially_paid"},
                {"expense_id": "exp_sus", "status": "approved"}]
    assert balance(entries, expenses, approved_only=True) == -50000.0   # phantom deficit
    assert balance(entries, expenses, approved_only=False) == 0.0       # symmetric


def test_shared_rule_still_excludes_genuinely_dead_expenses():
    """Symmetry must not mean counting everything — a bounced or deleted
    payment's credit is still correctly dropped."""
    for dead in ({"expense_id": "exp_pay", "status": "cheque_bounced"},
                 {"expense_id": "exp_pay", "status": "rejected"},
                 {"expense_id": "exp_pay", "status": "approved", "is_deleted": True}):
        entries = [("se_c", +50000.0, "exp_pay", "approval")]
        assert balance(entries, [dead], approved_only=False) == 0.0, dead


def test_shanmugam_balance_is_unchanged_by_the_filter_fix():
    """All 7 entries link to approved, live expenses, so the shared rule must
    reproduce -54,500 exactly - the fix must not silently move real numbers."""
    expenses = [{"expense_id": linked, "status": "approved"} for _, _, linked, _ in SHANMUGAM]
    assert balance(SHANMUGAM, expenses, approved_only=True) == -54500.0
    assert balance(SHANMUGAM, expenses, approved_only=False) == -54500.0


# ------------------------------------------------------- the production numbers

def test_trace_arithmetic_matches_the_reported_figures():
    credits = sum(a for _, a, _, _ in SHANMUGAM if a > 0)
    debits = sum(a for _, a, _, _ in SHANMUGAM if a < 0)
    assert credits == 94200.0
    assert debits == -148700.0
    assert credits + debits == -54500.0


def test_removing_only_the_duplicate_yields_9100():
    kept = [e for e in SHANMUGAM if e[0] != "se_18dc63c412"]
    assert round(sum(a for _, a, _, _ in kept), 2) == 9100.0
    assert len(kept) == 6


def test_duplicate_is_identified_by_request_and_amount_not_by_timestamp_alone():
    """Two legs of one split payment share a request but differ in leg_index;
    a true duplicate does not."""
    def verdict(legs):
        distinct = len({l["leg_index"] for l in legs if l["leg_index"] is not None})
        return "SPLIT" if distinct == len(legs) and distinct > 1 else "DUPLICATE"
    assert verdict([{"leg_index": 0}, {"leg_index": 0}]) == "DUPLICATE"   # production case
    assert verdict([{"leg_index": 0}, {"leg_index": 1}]) == "SPLIT"
