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

UNALLOCATED = "Not yet spent on a project"


def allocate(rows):
    """Mirror of allocatePettyCash() (Oct 6 2026): split each request across
    the projects it was spent on; the unspent remainder stays on the
    request's own project, or on the not-on-a-project row."""
    pieces = []
    for pc in rows:
        issued = pc.get("amount_issued") or 0
        approved = (pc.get("amount_requested") or 0) if pc.get("status") and pc["status"] != "requested" else 0
        spent = pc.get("amount_spent") or 0
        for sp in pc.get("spent_by_project") or []:
            s = min(sp.get("amount") or 0, spent)
            if not sp.get("project_id") or s <= 0:
                continue
            i, a = min(s, issued), min(s, approved)
            pieces.append({"name": sp.get("project_name") or "Unknown",
                           "issued": i, "approved": a, "spent": s})
            issued, approved, spent = issued - i, approved - a, spent - s
        if pc.get("project_id") or issued or approved or spent:
            pieces.append({"name": (pc.get("project_name") or "Unknown") if pc.get("project_id") else UNALLOCATED,
                           "issued": issued, "approved": approved, "spent": spent})
    return pieces


def by_project(rows):
    out = {}
    for p in allocate(rows):
        r = out.setdefault(p["name"], {"issued": 0, "approved": 0, "spent": 0})
        for k in ("issued", "approved", "spent"):
            r[k] += p[k]
    for r in out.values():
        r["balance"] = r["issued"] - r["spent"]
    return out


def tiles(rows, search=""):
    issued = approved = spent = 0.0
    for p in allocate(rows):
        if search and search.lower() not in p["name"].lower():
            continue
        issued += p["issued"]
        approved += p["approved"]
        spent += p["spent"]
    return {"issued": issued, "approved": approved, "spent": spent,
            "balance": issued - spent}


ROWS = [
    {"project_id": "p_gopi", "project_name": "Mr Gopinath", "status": "settled",
     "amount_requested": 5000, "amount_issued": 5000, "amount_spent": 4200},
    {"project_id": "p_gopi", "project_name": "Mr Gopinath", "status": "issued",
     "amount_requested": 3000, "amount_issued": 3000, "amount_spent": 0},
    {"project_id": "p_lav", "project_name": "Mrs Lavanya", "status": "requested",
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
# Splitting requests across the projects they were spent on (Oct 6 2026)
# --------------------------------------------------------------------------

GENERAL = {"project_id": "", "project_name": "", "status": "issued",
           "amount_requested": 15000, "amount_issued": 15000, "amount_spent": 0}


def test_unspent_general_request_still_gets_a_row():
    """The bug: General requests have no project, so the table dropped them
    and read 'No petty cash entries' while the tiles showed 15,000."""
    rows = by_project([GENERAL])
    assert rows == {UNALLOCATED: {"issued": 15000, "approved": 15000,
                                  "spent": 0, "balance": 15000}}


def test_general_request_moves_onto_the_projects_it_was_spent_on():
    pc = dict(GENERAL, amount_spent=7000, spent_by_project=[
        {"project_id": "p_a", "project_name": "Project A", "amount": 5000},
        {"project_id": "p_b", "project_name": "Project B", "amount": 2000},
    ])
    rows = by_project([pc])
    assert rows["Project A"] == {"issued": 5000, "approved": 5000, "spent": 5000, "balance": 0}
    assert rows["Project B"] == {"issued": 2000, "approved": 2000, "spent": 2000, "balance": 0}
    assert rows[UNALLOCATED] == {"issued": 8000, "approved": 8000, "spent": 0, "balance": 8000}, (
        "cash still with the SE stays off the projects until it is spent")


def test_columns_still_add_up_to_the_raw_request_totals():
    pc = dict(GENERAL, amount_spent=7000, spent_by_project=[
        {"project_id": "p_a", "project_name": "Project A", "amount": 5000},
        {"project_id": "p_b", "project_name": "Project B", "amount": 2000},
    ])
    rows = by_project([pc] + ROWS)
    for k in ("issued", "approved", "spent"):
        assert sum(r[k] for r in rows.values()) == tiles([pc] + ROWS)[k]
    assert tiles([pc] + ROWS)["issued"] == 15000 + 8000


def test_project_request_spent_elsewhere_keeps_its_remainder():
    pc = {"project_id": "p_gopi", "project_name": "Mr Gopinath", "status": "issued",
          "amount_requested": 5000, "amount_issued": 5000, "amount_spent": 1500,
          "spent_by_project": [{"project_id": "p_lav", "project_name": "Mrs Lavanya", "amount": 1500}]}
    rows = by_project([pc])
    assert rows["Mrs Lavanya"]["spent"] == 1500
    assert rows["Mr Gopinath"] == {"issued": 3500, "approved": 3500, "spent": 0, "balance": 3500}


def test_spends_beyond_the_requests_own_spent_figure_are_capped():
    """amount_spent is what the request itself says was spent; the per-
    project split can never claim more than that."""
    pc = dict(GENERAL, amount_spent=3000, spent_by_project=[
        {"project_id": "p_a", "project_name": "Project A", "amount": 4000}])
    rows = by_project([pc])
    assert rows["Project A"]["spent"] == 3000
    assert tiles([pc])["spent"] == 3000


def test_overspent_request_shows_the_overspend_on_the_project():
    pc = dict(GENERAL, amount_issued=1000, amount_requested=1000, amount_spent=1200,
              spent_by_project=[{"project_id": "p_a", "project_name": "Project A", "amount": 1200}])
    rows = by_project([pc])
    assert rows["Project A"] == {"issued": 1000, "approved": 1000, "spent": 1200, "balance": -200}
    assert UNALLOCATED not in rows


def test_search_narrows_tiles_to_the_matching_project_rows():
    pc = dict(GENERAL, amount_spent=5000, spent_by_project=[
        {"project_id": "p_a", "project_name": "Project A", "amount": 5000}])
    assert tiles([pc], search="project a") == {"issued": 5000, "approved": 5000,
                                               "spent": 5000, "balance": 0}


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
    assert "let issued = Number(pc.amount_issued) || 0;" in ui
    assert "allocatePettyCash(sePettyCashRows)" in ui
    assert "balance: t.issued - t.spent" in ui


def test_endpoint_ships_spend_per_project_for_each_request():
    node, src = _func("get_cashbook_filtered")
    seg = ast.get_source_segment(src, node) or ""
    head = seg.split("asyncio.gather(", 1)[1].split("\n    )", 1)[0]
    assert "db.recorded_expenses.aggregate(" in head, "fetched in the same gather, no extra round trip"
    assert '"linked_petty_cash_id"' in head
    assert '"status": "approved"' in head, (
        "approved is when an SE expense is added to the request's amount_spent")
    assert '"spent_by_project": pc_spent_by_project.get(' in seg
    assert '"requested_by": 1' in head, "the Site Engineer filter keys on requested_by"


def test_all_four_tiles_are_rendered():
    ui = _src(BOARD)
    for key, label in [("issued", "Issued"), ("approved", "A/C Approved"),
                       ("spent", "Spent"), ("balance", "Balance")]:
        assert f"key: '{key}'" in ui
        assert f"label: '{label}'" in ui
    assert 'data-testid="pw-pettycash-tiles"' in ui


def test_tiles_respect_the_search_box():
    ui = _src(BOARD)
    seg = ui.split("const pcTotals", 1)[1].split("}, [pcPieces, search]);", 1)[0]
    assert "if (search &&" in seg, "tiles must match the rows shown in the table"
