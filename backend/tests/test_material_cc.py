"""Project Wise > Material CC: planned against actual quantity (Nov 23 2026)."""
import ast
import io
import os

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "routes", "material_cc.py")
CONSTANTS = ("_VERIFIED_STATUSES", "_AWAITING_STATUSES", "_CLOSED_DELIVERED", "_UNIT_ALIASES")
PURE = ("_f", "norm_name", "norm_unit", "_group", "_rate", "compare_items", "request_quantities")
WRITE_METHODS = {"insert_one", "update_one", "update_many", "replace_one", "delete_one", "delete_many",
                 "find_one_and_update", "bulk_write"}


def _load():
    src = io.open(SRC, encoding="utf8").read()
    ns = {}
    exec("import re\nfrom typing import Any, Dict, List, Optional", ns)
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) in CONSTANTS for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
        if isinstance(node, ast.FunctionDef) and node.name in PURE:
            exec(ast.get_source_segment(src, node), ns)
    return ns


NS = _load()
compare, quantities = NS["compare_items"], NS["request_quantities"]


def row(result, name):
    return next(r for r in result["items"] if r["name"] == name)


def item(name, unit, qty, rate=0, awaiting=0):
    return {"name": name, "unit": unit, "qty": qty, "rate": rate, "awaiting": awaiting}


# ---- comparing -------------------------------------------------------------

def test_difference_is_purchase_over_theoretical():
    r = compare([item("Cement", "bag", 1000, 400)], [item("Cement", "bag", 1080, 420)])
    assert row(r, "Cement")["diff_pct"] == 8.0
    r = compare([item("Steel", "kg", 4500, 60)], [item("Steel", "kg", 4410, 60)])
    assert row(r, "Steel")["diff_pct"] == -2.0


def test_several_orders_of_one_material_add_up_whatever_the_spelling():
    r = compare([item("M-Sand", "cft", 2000, 50)],
                [item("M-Sand", "CFT", 1200, 50), item(" m-sand ", "c.f.t", 800, 50)])
    assert r["count"] == 1
    assert row(r, "M-Sand")["purchase"] == 2000
    assert row(r, "M-Sand")["diff_pct"] == 0.0


def test_project_figure_is_weighted_by_rate_not_by_adding_units():
    r = compare([item("Cement", "bag", 100, 400), item("Nails", "kg", 100, 4)],
                [item("Cement", "bag", 110, 400), item("Nails", "kg", 200, 4)])
    # (44,000 + 800) against (40,000 + 400); adding quantities would say +55%.
    assert r["diff_pct"] == 10.89


def test_bought_without_a_plan_has_no_difference_and_is_left_out():
    r = compare([item("Cement", "bag", 100, 400)], [item("Cement", "bag", 100, 400), item("Tiles", "sqft", 500, 60)])
    assert row(r, "Tiles")["note"] == "no_plan" and row(r, "Tiles")["diff_pct"] is None
    assert r["diff_pct"] == 0.0 and r["compared"] == 1


def test_different_units_are_flagged_not_compared():
    r = compare([item("Cement", "bag", 100, 400)], [item("Cement", "kg", 5000, 8)])
    assert row(r, "Cement")["note"] == "unit_mismatch"
    assert row(r, "Cement")["diff_pct"] is None and r["diff_pct"] is None


def test_blank_unit_is_missing_data_not_a_mismatch():
    r = compare([item("Cement", "", 100, 400)], [item("Cement", "bag", 90, 400)])
    assert row(r, "Cement")["diff_pct"] == -10.0


def test_planned_but_not_bought_yet():
    assert row(compare([item("Tiles", "sqft", 500, 60)], []), "Tiles")["diff_pct"] == -100.0


def test_labour_without_a_planned_rate_uses_the_work_order_rate():
    r = compare([item("Plastering", "sqft", 1000)], [item("Plastering", "sqft", 1100, 30)])
    assert r["diff_pct"] == 10.0


def test_nothing_planned_gives_no_project_figure():
    assert compare([], [item("Cement", "bag", 10, 400)])["diff_pct"] is None
    assert compare([], [])["diff_pct"] is None


# ---- what counts as received ----------------------------------------------

def test_verified_quantity_counts_unverified_is_awaiting():
    # USB-MR1306: Accounts sent it back, so it is being verified again.
    assert quantities({"status": "procurement_verifying", "received_quantity": 154.01}, 0) == {"qty": 0.0, "awaiting": 154.01}
    assert quantities({"status": "pending_balance_payment", "received_quantity": 308.02}, 0) == {"qty": 308.02, "awaiting": 0.0}


def test_rejected_delivery_transit_and_dead_orders_count_nothing():
    for s in ("procurement_verify_rejected", "in_transit", "rejected", "cancelled", "procurement_revision", None):
        assert quantities({"status": s, "received_quantity": 50, "quantity": 50}, 50) == {"qty": 0.0, "awaiting": 0.0}, s


def test_prepaid_bill_before_delivery_counts_nothing():
    assert quantities({"status": "pending_accounts_approval", "approved_quantity": 80, "quantity": 80}, 0)["qty"] == 0


def test_older_orders_fall_back_to_receipts_then_to_the_closed_order():
    assert quantities({"status": "paid", "quantity": 80}, 75)["qty"] == 75
    assert quantities({"status": "delivered", "approved_quantity": 80, "quantity": 100}, 0)["qty"] == 80


# ---- writes ----------------------------------------------------------------

def test_report_writes_nothing():
    tree = ast.parse(io.open(SRC, encoding="utf8").read())
    for fn in ast.walk(tree):
        if isinstance(fn, ast.AsyncFunctionDef) and fn.name in ("get_material_cc", "get_labour_theoretical"):
            calls = [c.func.attr for c in ast.walk(fn) if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)]
            assert not WRITE_METHODS & set(calls), fn.name
