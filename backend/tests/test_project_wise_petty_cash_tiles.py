"""Issued / A/C Approved / Spent / Balance tiles on Project Wise > Petty Cash
(Sep 26 2026).

The tab summed `recorded_expenses` legs, which carry a single `amount` - the
cash that left the account. That one number cannot say what the accountant
sanctioned, what was handed over, and what came back as spent, so the four
tiles read db.petty_cash instead, shipped as `petty_cash_rows` on
/accountant/cashbook-filtered.

Balance is Issued - Spent, the same formula DailyClosingDialog already uses
for cash still sitting with Site Engineers.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "AccountsBoard.jsx")


def _src(path=FINANCIAL):
    return io.open(path, encoding="utf8").read()


def _func(name):
    src = _src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found")


# --------------------------------------------------------------------------
# The query helper, executed for real
# --------------------------------------------------------------------------

def _load_query_helper():
    """Exec just _petty_cash_query out of the module - it has no imports."""
    node, src = _func("_petty_cash_query")
    ns = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), "<q>", "exec"), ns)
    return ns["_petty_cash_query"]


EXCLUDED = ["under_correction", "rejected", "accountant_rejected",
            "accounts_rejected", "cheque_bounced"]


def test_rejected_rows_are_excluded():
    q = _load_query_helper()(None, None, None)
    assert q["status"]["$nin"] == EXCLUDED, (
        "tiles must ignore rejected/under-correction petty cash so they agree "
        "with every other petty cash total in the app")


def test_no_project_or_date_means_no_extra_filter():
    q = _load_query_helper()(None, None, None)
    assert set(q) == {"status"}


def test_project_scope_is_applied():
    q = _load_query_helper()("proj_1", None, None)
    assert q["project_id"] == "proj_1"


def test_date_window_is_inclusive_of_the_end_day():
    q = _load_query_helper()(None, "2026-09-01", "2026-09-30")
    assert q["created_at"]["$gte"] == "2026-09-01"
    assert q["created_at"]["$lte"] == "2026-09-30T23:59:59", (
        "an end date without the time suffix would drop everything recorded "
        "on the last day of the window")


def test_each_bound_can_stand_alone():
    only_start = _load_query_helper()(None, "2026-09-01", None)
    only_end = _load_query_helper()(None, None, "2026-09-30")
    assert only_start["created_at"] == {"$gte": "2026-09-01"}
    assert only_end["created_at"] == {"$lte": "2026-09-30T23:59:59"}


# --------------------------------------------------------------------------
# The tile arithmetic, mirrored from the component
# --------------------------------------------------------------------------

def tiles(rows, search=""):
    issued = approved = spent = 0.0
    for pc in rows:
        if search and search.lower() not in (pc.get("project_name") or "").lower():
            continue
        issued += pc.get("amount_issued") or 0
        spent += pc.get("amount_spent") or 0
        if pc.get("status") and pc["status"] != "requested":
            approved += pc.get("amount_requested") or 0
    return {"issued": issued, "approved": approved, "spent": spent,
            "balance": issued - spent}


ROWS = [
    {"project_name": "Mr Gopinath", "status": "settled",
     "amount_requested": 5000, "amount_issued": 5000, "amount_spent": 4200},
    {"project_name": "Mr Gopinath", "status": "issued",
     "amount_requested": 3000, "amount_issued": 3000, "amount_spent": 0},
    {"project_name": "Mrs Lavanya", "status": "requested",
     "amount_requested": 2000, "amount_issued": 0, "amount_spent": 0},
]


def test_balance_is_issued_minus_spent():
    t = tiles(ROWS)
    assert t["issued"] == 8000
    assert t["spent"] == 4200
    assert t["balance"] == 3800, "cash still sitting with the Site Engineers"


def test_a_request_not_yet_acted_on_is_not_counted_as_approved():
    t = tiles(ROWS)
    assert t["approved"] == 8000, "the 2,000 still at `requested` is excluded"


def test_issued_ignores_a_request_that_was_never_paid_out():
    assert tiles([ROWS[2]])["issued"] == 0


def test_tiles_follow_the_project_search_box():
    t = tiles(ROWS, search="lavanya")
    assert t == {"issued": 0, "approved": 0, "spent": 0, "balance": 0}


def test_fully_spent_advance_leaves_no_balance():
    t = tiles([{"project_name": "X", "status": "settled",
                "amount_requested": 1000, "amount_issued": 1000,
                "amount_spent": 1000}])
    assert t["balance"] == 0


def test_overspend_shows_a_negative_balance_rather_than_being_hidden():
    """If an SE spends more than was issued the tile must say so."""
    t = tiles([{"project_name": "X", "status": "settled",
                "amount_requested": 1000, "amount_issued": 1000,
                "amount_spent": 1200}])
    assert t["balance"] == -200


@pytest.mark.parametrize("missing", ["amount_issued", "amount_spent", "amount_requested"])
def test_absent_amounts_are_treated_as_zero(missing):
    row = {"project_name": "X", "status": "settled", "amount_requested": 100,
           "amount_issued": 100, "amount_spent": 100}
    row.pop(missing)
    tiles([row])  # must not raise


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_endpoint_ships_the_rows():
    src = _src()
    assert '"petty_cash_rows": [' in src
    assert "petty_cash_docs" in src
    node, _ = _func("get_cashbook_filtered")
    seg = ast.get_source_segment(_src(), node) or ""
    assert "_petty_cash_query(project_id, start_date, end_date)" in seg


def test_rows_are_fetched_inside_the_existing_gather():
    """A separate await would add a round trip to a page already tuned for
    speed; it belongs in the gather with the other sources."""
    node, src = _func("get_cashbook_filtered")
    seg = ast.get_source_segment(src, node) or ""
    head = seg.split("asyncio.gather(", 1)[1].split("\n    )", 1)[0]
    assert "db.petty_cash.find(" in head


def test_component_reads_the_rows_not_the_expense_legs():
    ui = _src(BOARD)
    assert "pettyCashRows={filteredData?.petty_cash_rows || []}" in ui
    assert "function ProjectWisePettyCashTab({ expenseEntries, pettyCashRows," in ui
    # the tiles must not be derived from the recorded_expenses totals
    assert "t.issued += Number(pc.amount_issued) || 0;" in ui
    assert "balance: t.issued - t.spent" in ui


def test_all_four_tiles_are_rendered():
    ui = _src(BOARD)
    for key, label in [("issued", "Issued"), ("approved", "A/C Approved"),
                       ("spent", "Spent"), ("balance", "Balance")]:
        assert f"key: '{key}'" in ui
        assert f"label: '{label}'" in ui
    assert 'data-testid="pw-pettycash-tiles"' in ui


def test_tiles_respect_the_search_box():
    ui = _src(BOARD)
    seg = ui.split("const pcTotals", 1)[1].split("}, [pettyCashRows, search]);", 1)[0]
    assert "if (search &&" in seg, "tiles must match the rows shown in the table"
