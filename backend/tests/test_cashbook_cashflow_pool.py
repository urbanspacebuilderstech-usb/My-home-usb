"""Cashbook > Expense > Cashflow column (Nov 20 2026).

Every expense row is stamped Direct / Indirect by the same rule the Cashflow
Engine's /recompute uses, so the column covers existing and new expenses.
"""
import ast
import io
import os

CASHFLOW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "routes", "cashflow.py")
CONSTANTS = ("DIRECT_EXPENSE_CATEGORIES", "INDIRECT_EXPENSE_CATEGORIES")
PURE = ("_classify_expense_pool", "expense_cashflow_pool", "tag_cashflow_pool")


def _load():
    """The pure helpers from the real source. Importing routes.cashflow would
    pull in core.*, which other tests replace with stand-ins."""
    src = io.open(CASHFLOW, encoding="utf8").read()
    ns = {}
    exec("from typing import Any, Dict, List, Optional", ns)
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) in CONSTANTS for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
        if isinstance(node, ast.FunctionDef) and node.name in PURE:
            exec(ast.get_source_segment(src, node), ns)
    return ns


_NS = _load()
expense_cashflow_pool = _NS["expense_cashflow_pool"]
tag_cashflow_pool = _NS["tag_cashflow_pool"]


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
