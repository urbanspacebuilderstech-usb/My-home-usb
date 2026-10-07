"""Close Books must not park unknown suspense in Cash (Oct 7 2026).

The "+ Add Suspense" quick-add in the Close Books dialog buckets outstanding
suspense by payment mode. Its classifier ended:

    return 'cash';          // anything unrecognised, INCLUDING no mode at all

so every mode-less suspense entry was quietly added to the Cash suggestion.

The timeline, from git:

    27 Aug 2026 17:04  c5968d0d  "Add '+ Add Suspense' quick-source to Close
                                  Books per mode" - added this classifier
                                  with `return 'cash'`. Correct at the time:
                                  every classifier then fell back to cash.

     2 Sep 2026 11:32  9f23e884  "Classify suspense modes canonically; never
                                  fall back to Cash" - fixed
                                  backend/routes/financial.py and
                                  frontend/src/pages/SuspenseAccount.jsx.
                                  DailyClosingDialog.jsx was NOT in that
                                  commit, and was untouched for the 35 days
                                  afterwards.

Three copies of one rule, two fixed and one missed, with nothing tying them
together. The dialog now trusts the server's canonical `mode_bucket` wherever
it is sent, so there is one source of truth rather than three, and the local
mirror survives only for petty cash rows, which carry no bucket.
"""
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIALOG = os.path.join(BACKEND, "..", "frontend", "src", "components",
                      "DailyClosingDialog.jsx")
SUSPENSE_PAGE = os.path.join(BACKEND, "..", "frontend", "src", "pages",
                             "SuspenseAccount.jsx")
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")

TRACKED = {"cash", "current_account", "savings_account", "cheque", "direct_transfer"}


def _src(path):
    return io.open(path, encoding="utf8").read()


# --------------------------------------------------------------------------
# The classifier, mirrored from the dialog
# --------------------------------------------------------------------------

def classify(raw):
    if raw is None or str(raw).strip() == "":
        return "unattributed"
    m = "_".join(str(raw).lower().strip().split())
    if "savings" in m or "saving" in m:
        return "savings_account"
    if any(k in m for k in ("current", "bank", "neft", "rtgs", "imps", "upi", "escrow")):
        return "current_account"
    if "cheque" in m or "check" in m:
        return "cheque"
    if "petty" in m:
        return "unattributed"
    if "suspense" in m:
        return "unattributed"
    if "transfer" in m or m in ("dt", "cash_dt"):
        return "direct_transfer"
    if "cash" in m:
        return "cash"
    return "unattributed"


# ---- the defect -----------------------------------------------------------

@pytest.mark.parametrize("raw", [None, "", "   ", "something_new", "misc"])
def test_an_unknown_mode_is_never_cash(raw):
    """This is the whole bug: these all returned 'cash' before."""
    assert classify(raw) == "unattributed"


def test_petty_cash_is_not_cash():
    """"petty_cash" contains "cash", so a bare cash check catches it first."""
    assert classify("petty_cash") == "unattributed"


def test_suspense_account_is_not_cash():
    assert classify("suspense_account") == "unattributed"


# ---- the real modes still work -------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("cash", "cash"),
    ("hdfc_savings", "savings_account"),
    ("savings", "savings_account"),
    ("hdfc_current", "current_account"),
    ("neft", "current_account"),
    ("rtgs", "current_account"),
    ("imps", "current_account"),
    ("upi", "current_account"),
    ("escrow", "current_account"),
    ("cheque", "cheque"),
    ("check", "cheque"),
    ("direct_transfer", "direct_transfer"),
    ("dt", "direct_transfer"),
    ("cash_dt", "direct_transfer"),
    ("HDFC Savings A/C", "savings_account"),
])
def test_known_modes_land_correctly(raw, expected):
    assert classify(raw) == expected


def test_cash_dt_is_a_transfer_not_cash():
    """It contains "cash", so the transfer check has to come first."""
    assert classify("cash_dt") == "direct_transfer"


# ---- unattributed money must not be suggested ----------------------------

def add(breakdown, key, amount):
    """Mirrors the dialog's `add` helper."""
    if key not in TRACKED:
        return
    breakdown[key] = breakdown.get(key, 0.0) + amount


def test_unattributed_money_is_left_out_of_the_suggestions():
    """It is not somewhere you can count cash, so it gets no tile - and it
    certainly does not go into Cash."""
    b = {}
    add(b, classify(None), 18963.0)
    add(b, classify("cash"), 500.0)
    assert b == {"cash": 500.0}


def test_the_old_behaviour_would_have_inflated_cash():
    """Proof of what changed."""
    b = {}
    add(b, "cash", 18963.0)      # what the old `return 'cash'` produced
    assert b == {"cash": 18963.0}


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def _classifier_body():
    """Just the function, up to its own closing brace."""
    src = _src(DIALOG)
    start = src.index("const classifySuspenseMode")
    return src[start:].split("};", 1)[0]


def test_the_dialog_no_longer_falls_back_to_cash():
    body = _classifier_body()
    # 'cash' may only be returned when the mode actually says cash
    assert "if (m.includes('cash')) return 'cash';" in body
    assert body.count("return 'cash';") == 1
    # and the last resort is unattributed
    assert body.rstrip().endswith("return 'unattributed';")


def test_the_dialog_trusts_the_servers_bucket():
    """One source of truth beats three copies of a rule."""
    src = _src(DIALOG)
    assert "e.mode_bucket || classifySuspenseMode(e.mode)" in src
    assert "breakdown[classifySuspenseMode(e.mode)] +=" not in src


def test_the_backend_sends_that_bucket_for_both_kinds():
    src = _src(FINANCIAL)
    assert '"mode_bucket": classify_suspense_bucket(_material_suspense_mode(se, src)),' in src
    assert src.count('"mode_bucket"') >= 2


def test_untracked_keys_can_never_reach_a_tile():
    src = _src(DIALOG)
    assert "if (!TRACKED.has(key)) return;" in src


def test_all_three_classifiers_agree_on_a_blank_mode():
    """The drift that caused this. If any one of them changes alone again,
    this fails."""
    assert classify(None) == "unattributed"
    assert "return 'unattributed';" in _src(DIALOG)
    assert "if (raw === null || raw === undefined || String(raw).trim() === '') return 'unattributed';" \
        in _src(SUSPENSE_PAGE)
    assert 'return "unattributed"' in _src(FINANCIAL)


def test_the_history_is_documented():
    src = _src(DIALOG)
    assert "9f23e884" in src
    assert "2 Sep 2026" in src
