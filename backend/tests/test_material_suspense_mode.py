"""A cheque-funded material suspense entry must not read as Unattributed
(Oct 7 2026).

Accounts > Suspense A/c > Materials showed UNATTRIBUTED -18,963 while the
Expense list showed the very same money as a cheque payment:

    row 21  1/9/2026  "P sand (via Cheque #001684 suspense)"
            Mr Gopinath - nanmangalam  ·  Cheque #1684  ·  USB-MR511  ·  18,963

Same event: suspense entry se_c8729f5736, created 2026-09-01T13:44, linked to
expense exp_137eef0a9ccf. The description names the cheque outright.

Two causes, both on the material path:

  1. the suspense overview loaded material expenses with a projection that
     never fetched cheque_number / cheque_no / cheque_id / cheque_ids, so
     src.get("cheque_number") was ALWAYS None regardless of the database;

  2. the mode expression never looked for a cheque anyway -

         se.get("payment_mode") or src.get("payment_method")

     while the LABOUR path has always had one. Material and labour were
     inconsistent and material was the weaker.

Worth recording: an earlier trace of mine reported "cheque_number": null for
this entry and I read it as evidence. It was not - that field read through the
same projection, so it reported an absence it had created itself.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _src():
    return io.open(FINANCIAL, encoding="utf8").read()


def _load():
    for n in ast.parse(_src()).body:
        if isinstance(n, ast.FunctionDef) and n.name == "_material_suspense_mode":
            ns = {"Dict": dict, "Any": object}
            exec(compile(ast.Module(body=[n], type_ignores=[]), "<m>", "exec"), ns)
            return ns["_material_suspense_mode"]
    raise AssertionError("_material_suspense_mode not found")


mode = _load()


# --------------------------------------------------------------------------
# The reported case
# --------------------------------------------------------------------------

def test_the_reported_entry_is_now_cheque():
    """se_c8729f5736 / exp_137eef0a9ccf - 18,963, 'via Cheque #001684'."""
    assert mode({}, {"cheque_number": "001684", "payment_method": None}) == "cheque"


def test_the_old_expression_called_it_unattributed():
    """Proof this was the cause. With no payment_mode and no cheque lookup,
    the only thing left was the expense's payment_method - which was empty."""
    se, src = {}, {"cheque_number": "001684", "payment_method": None}
    old = se.get("payment_mode") or src.get("payment_method")
    assert old is None


def test_a_cheque_on_the_entry_itself_counts():
    assert mode({"cheque_number": "001684"}, {}) == "cheque"


def test_a_raw_chq_id_still_means_cheque():
    """_resolve_cheque_numbers documents that cheque_no sometimes holds a raw
    internal id instead of the printed number. Either way it is a cheque."""
    assert mode({"cheque_no": "chq_abc123"}, {}) == "cheque"


def test_linked_cheque_ids_count():
    assert mode({"linked_cheque_ids": ["chq_x"]}, {}) == "cheque"


def test_cheque_ids_on_the_expense_count():
    assert mode({}, {"cheque_ids": ["chq_y"]}) == "cheque"


# --------------------------------------------------------------------------
# What must not change
# --------------------------------------------------------------------------

def test_an_explicit_mode_on_the_entry_wins():
    """The entry's own payment_mode is the most direct statement there is; a
    cheque elsewhere must not override it."""
    assert mode({"payment_mode": "hdfc_savings"}, {"cheque_number": "001684"}) == "hdfc_savings"


def test_genuine_cash_stays_cash():
    assert mode({}, {"payment_method": "cash"}) == "cash"


@pytest.mark.parametrize("method", ["hdfc_current", "hdfc_savings", "direct_transfer", "upi"])
def test_other_modes_pass_through_untouched(method):
    assert mode({}, {"payment_method": method}) == method


def test_nothing_anywhere_is_still_unattributed():
    """A genuinely mode-less entry must stay visible as unattributed rather
    than being guessed into a tile."""
    assert mode({}, {}) is None


def test_empty_strings_are_not_mistaken_for_a_cheque():
    assert mode({"cheque_no": "", "cheque_number": ""}, {"payment_method": "cash"}) == "cash"


def test_an_empty_cheque_ids_list_is_not_a_cheque():
    assert mode({"cheque_ids": []}, {"payment_method": "cash"}) == "cash"


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_the_projection_fetches_the_cheque_fields():
    """Without these the resolver can never see a cheque on the expense, and
    the bug returns silently."""
    src = _src()
    block = src[src.index('{"category": "material"},'):]
    block = block[:block.index(").to_list(5000)")]
    for f in ("cheque_number", "cheque_no", "cheque_id", "cheque_ids"):
        assert '"%s": 1' % f in block, f


def test_the_overview_uses_the_resolver():
    src = _src()
    assert '"mode": _material_suspense_mode(se, src),' in src
    assert '"mode": se.get("payment_mode") or src.get("payment_method"),' not in src


def test_material_and_labour_both_consult_a_cheque():
    """The two paths disagreed for weeks - labour had a cheque fallback,
    material had none. Neither may lose it again."""
    src = _src()
    assert 'or ("cheque" if row.get("cheque_no") else None)' in src   # labour
    assert "def _material_suspense_mode" in src                       # material


def test_the_case_is_documented():
    src = _src()
    assert "se_c8729f5736" in src
    assert "exp_137eef0a9ccf" in src
