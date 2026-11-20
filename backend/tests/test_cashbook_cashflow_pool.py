"""Cashbook > Expense > Cashflow column (Nov 20 2026).

Every expense row is stamped Direct / Indirect by the same rule the Cashflow
Engine's /recompute uses, so the column covers existing and new expenses.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.cashflow import expense_cashflow_pool, tag_cashflow_pool  # noqa: E402


def test_project_costs_are_direct():
    assert expense_cashflow_pool({"category": "material", "expense_type": "material"}) == "direct"
    assert expense_cashflow_pool({"category": "labour"}) == "direct"
    assert expense_cashflow_pool({"expense_type": "labour"}) == "direct"   # labour rows with no category


def test_overheads_are_indirect():
    for cat in ("salary", "office", "marketing", "petrol_allowance", "statutory", "overhead", "admin", "misc"):
        assert expense_cashflow_pool({"category": cat}) == "indirect", cat


def test_indirect_cost_mirror_is_indirect_despite_category_other():
    assert expense_cashflow_pool({"category": "other", "expense_type": "indirect_cost"}) == "indirect"
    assert expense_cashflow_pool({"category": "other", "source": "indirect_cost"}) == "indirect"


def test_unknown_category_defaults_to_direct_like_the_engine():
    assert expense_cashflow_pool({"category": "other"}) == "direct"
    assert expense_cashflow_pool({}) == "direct"


def test_tag_stamps_every_row():
    rows = tag_cashflow_pool([{"category": "material"}, {"category": "salary"}])
    assert [r["cashflow_pool"] for r in rows] == ["direct", "indirect"]
