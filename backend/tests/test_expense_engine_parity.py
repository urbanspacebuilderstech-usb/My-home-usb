"""Regression tests for the canonical expense engine (services/expense_engine.py).

Aug 25 2026 — Project > Financial Performance and Finance Board > Project Wise
must return the SAME Total Expense for the same project. They used to run two
(really three) different formulas; Mr Sridhar read ₹95,18,529.24 on the project
page against ₹93,31,389.24 on Project Wise.

These tests are PURE — no database, no server — so they run in CI and catch a
reintroduced local formula immediately. The live end-to-end parity check lives
in test_project_expense_parity.py.

Runnable two ways:
    pytest backend/tests/test_expense_engine_parity.py
    python  backend/tests/test_expense_engine_parity.py
"""
import os
import sys
import types

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# The engine imports `core.database` for its async helpers. The pure functions
# under test never touch it, so stub the module out rather than requiring a
# Mongo connection (and motor) just to import.
if "core.database" not in sys.modules:
    _stub = types.ModuleType("core.database")
    _stub.db = None
    _stub.fs = None
    sys.modules.setdefault("core", types.ModuleType("core"))
    sys.modules["core.database"] = _stub

from services.expense_engine import (  # noqa: E402
    build_expense_rows,
    build_expense_rows_by_source,
    carry_forward_expense,
    carry_forward_income,
    sum_expense_rows,
)

PID = "proj_test_0001"
OTHER_PID = "proj_test_0002"


def _sources():
    """One fixture covering every inclusion / exclusion / de-dup rule.

    Included (real money):     10,000 + 2,500 + 40,000 + 15,000 +  7,500 = 75,000
    Excluded (not yet money / already counted elsewhere):
        pending, pulled-back, SE-direct awaiting approval, rejected labour,
        post-release material request, mirrored + already-paid legacy POs.
    """
    recorded = [
        # ✅ plain accountant-approved spend
        {"expense_id": "exp_1", "project_id": PID, "amount": 10000, "status": "accounts_approved", "category": "other"},
        # ✅ legacy row with no status field at all
        {"expense_id": "exp_2", "project_id": PID, "amount": 2500, "category": "other"},
        # ❌ still in the approvals queue — this is the class of row the old
        #    project-page blacklist counted as spent money
        {"expense_id": "exp_3", "project_id": PID, "amount": 90000, "status": "pending", "category": "other"},
        # ❌ pulled back to Approvals
        {"expense_id": "exp_4", "project_id": PID, "amount": 5000, "status": "accounts_approved",
         "pulled_back_from_cashbook": True, "category": "other"},
        # ❌ site-engineer-direct, accountant has not cleared it yet
        {"expense_id": "exp_5", "project_id": PID, "amount": 3000, "status": "pm_approved",
         "source": "site_engineer_direct", "category": "other"},
        # ✅ site-engineer-direct once cleared
        {"expense_id": "exp_6", "project_id": PID, "amount": 40000, "status": "approved",
         "source": "site_engineer_direct", "category": "other"},
        # ✅ the payment mirror of legacy material PO mexp_dupe (see below)
        {"expense_id": "exp_7", "project_id": PID, "amount": 15000, "status": "accounts_approved",
         "category": "material", "request_id": "mexp_dupe"},
        # another project entirely — must never leak into PID's total
        {"expense_id": "exp_8", "project_id": OTHER_PID, "amount": 999999, "status": "accounts_approved", "category": "other"},
    ]
    labour = [
        # ✅ approved labour release
        {"labour_expense_id": "lab_1", "project_id": PID, "total_amount": 7500, "status": "accounts_approved"},
    ]
    material_reqs = [
        # ❌ post-release: counted through its recorded_expenses mirror
        {"request_id": "mr_1", "project_id": PID, "estimated_price": 20000, "status": "paid"},
        # ❌ already has a mirror row
        {"request_id": "mr_2", "project_id": PID, "estimated_price": 12000, "status": "accounts_approved",
         "last_expense_id": "exp_x"},
    ]
    material_legacy = [
        # ❌ mirrored by exp_7 via request_id
        {"material_expense_id": "mexp_dupe", "project_id": PID, "final_amount": 15000, "status": "settled"},
        # ❌ settled through a recorded payment row — the guard the old
        #    _cashbook_parity_expense copy was missing, which double-counted
        #    these on the project header only
        {"material_expense_id": "mexp_paid", "project_id": PID, "final_amount": 187140, "status": "paid",
         "paid_via_expense_id": "exp_9"},
    ]
    return recorded, labour, material_reqs, material_legacy


EXPECTED_PID_TOTAL = 10000 + 2500 + 40000 + 15000 + 7500  # 75,000


def test_canonical_total_applies_every_rule():
    rows = build_expense_rows(*_sources())
    assert sum_expense_rows(rows, project_id=PID) == EXPECTED_PID_TOTAL


def test_pending_rows_are_not_money():
    """The old project-page blacklist counted anything not explicitly rejected."""
    rows = build_expense_rows(*_sources())
    ids = {r.get("expense_id") for r in rows}
    assert "exp_3" not in ids, "pending approval-queue row leaked into the expense total"
    assert "exp_4" not in ids, "pulled-back row leaked into the expense total"
    assert "exp_5" not in ids, "unapproved site-engineer-direct row leaked into the expense total"


def test_legacy_material_paid_via_expense_is_not_double_counted():
    """The exact defect behind the Sridhar gap.

    `mexp_paid` is already represented by its recorded_expenses payment row, so
    the legacy PO must not be added again. Every consumer of the engine gets
    this guard because there is only one implementation of it.
    """
    rows = build_expense_rows(*_sources())
    ids = {r.get("expense_id") for r in rows}
    assert "mexp_paid" not in ids
    assert "mexp_dupe" not in ids


def test_project_wise_and_project_page_agree():
    """Project Wise aggregates the shared row list; the project page sums the
    same rows for one project. Both must land on the identical figure."""
    recorded, labour, mreqs, mlegacy = _sources()
    rows = build_expense_rows(recorded, labour, mreqs, mlegacy)

    # Finance Board > Project Wise: one pass over all rows, bucketed by project.
    project_wise = {}
    for r in rows:
        pid = r.get("project_id")
        project_wise[pid] = project_wise.get(pid, 0) + (r.get("amount", 0) or 0)

    # Project > Financial Performance: the same engine, scoped to one project.
    project_page = sum_expense_rows(rows, project_id=PID)

    assert round(project_wise[PID], 2) == round(project_page, 2)


def test_buckets_reconcile_with_flat_total():
    """`_cashbook_parity_expense` (Carry Forward / project header) reads the
    per-bucket split; it must always add up to the flat list total."""
    recorded, labour, mreqs, mlegacy = _sources()
    by_source = build_expense_rows_by_source(recorded, labour, mreqs, mlegacy)
    flat = build_expense_rows(recorded, labour, mreqs, mlegacy)

    bucket_total = sum(
        sum_expense_rows(by_source[k], project_id=PID)
        for k in ("recorded", "labour", "material_requests", "material_legacy")
    )
    assert bucket_total == sum_expense_rows(flat, project_id=PID) == EXPECTED_PID_TOTAL


def test_row_order_is_the_cashbook_append_order():
    """Downstream code (drilldowns, PDF exports) relies on the historic order:
    recorded → labour → material requests → legacy material."""
    rows = build_expense_rows(*_sources())
    types_in_order = [r.get("expense_type") for r in rows]
    assert types_in_order[:2] == ["other", "other"]
    assert "labour" in types_in_order
    assert types_in_order.index("labour") > types_in_order.index("material") or "material" not in types_in_order[:6]


def test_carry_forward_expense_rules():
    # per-bucket fields win
    assert carry_forward_expense({
        "material_carry_forward": 100, "labour_carry_forward": 50,
        "petty_cash_carry_forward": 25, "indirect_carry_forward": 25,
        "expense_carry_forward": 9999,
    }) == 200
    # legacy rolled-up fallback when the buckets are all zero/absent
    assert carry_forward_expense({"expense_carry_forward": 700, "expense_adjustment": 50}) == 750
    # no CF document at all
    assert carry_forward_expense(None) == 0.0
    assert carry_forward_expense({}) == 0.0


def test_carry_forward_income_rules():
    assert carry_forward_income({"income_carry_forward": 400, "income_adjustment": 100}) == 500
    assert carry_forward_income(None) == 0.0


def test_empty_inputs_are_zero_not_error():
    rows = build_expense_rows([], [], [], [])
    assert rows == []
    assert sum_expense_rows(rows) == 0
    assert sum_expense_rows(rows, project_id=PID) == 0


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL  {name}: {exc}")
    print(f"\n{'ALL PASS' if not failures else str(failures) + ' FAILED'}")
    sys.exit(1 if failures else 0)
