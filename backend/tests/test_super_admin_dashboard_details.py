"""Super Admin Dashboard detail popups (Oct 6 2026).

Every figure on the Dashboard opens the rows behind it. Three summary
endpoints gained those rows; each test here runs the real endpoint body
against an in-memory stand-in for Mongo and checks that the rows add back
up to the card's own figures, and that the figures themselves are unchanged.
"""
import ast
import asyncio
import io
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, Optional

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# --------------------------------------------------------------------------
# A tiny in-memory Mongo: equality plus the operators these endpoints use
# --------------------------------------------------------------------------

def _match(doc, q):
    for k, cond in (q or {}).items():
        val = doc.get(k)
        if isinstance(cond, dict):
            for op, arg in cond.items():
                if op == "$in" and val not in arg:
                    return False
                if op == "$nin" and val in arg:
                    return False
                if op == "$ne" and val == arg:
                    return False
                if op == "$gte" and (val is None or val < arg):
                    return False
                if op == "$lte" and (val is None or val > arg):
                    return False
        elif val != cond:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_a, **_k):
        return self

    async def to_list(self, _n):
        return [dict(d) for d in self.docs]


class _Coll:
    def __init__(self, docs):
        self.docs = docs

    def find(self, q=None, _proj=None):
        return _Cursor([d for d in self.docs if _match(d, q)])


def _load(path, name, extra_nodes=(), **db_docs):
    """Exec one endpoint out of its module, decorators stripped."""
    src = io.open(os.path.join(BACKEND, "routes", path), encoding="utf8").read()
    tree = ast.parse(src)
    wanted = {name, *extra_nodes}
    nodes = []
    for node in tree.body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name in wanted:
            node.decorator_list = []
            nodes.append(node)
    assert {n.name for n in nodes} == wanted, f"missing {wanted - {n.name for n in nodes}}"
    ns = {
        "db": SimpleNamespace(**{k: _Coll(v) for k, v in db_docs.items()}),
        "UserRole": SimpleNamespace(SUPER_ADMIN="super_admin", ACCOUNTANT="accountant"),
        "HTTPException": type("HTTPException", (Exception,), {"__init__": lambda self, **kw: None}),
        "Depends": lambda *_a: None, "get_current_user": None, "User": object,
        "Optional": Optional, "Dict": Dict, "Any": Any,
        "datetime": datetime, "timezone": timezone,
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), path, "exec"), ns)
    return ns[name]


ADMIN = SimpleNamespace(role="super_admin")


# --------------------------------------------------------------------------
# Labour
# --------------------------------------------------------------------------

DLRS = [
    {"project_id": "p1", "contractor_name": "Raju", "date": "2026-10-06",
     "entries": [{"type": "Mason", "count": 3, "total_cost": 2400},
                 {"type": "Helper", "count": 2, "total_cost": 1000}]},
    {"project_id": "p1", "contractor_name": "Raju", "date": "2026-10-07",
     "entries": [{"type": "Mason", "count": 1, "total_cost": 800}]},
    {"project_id": "p2", "contractor_name": "Mani", "date": "2026-10-06",
     "entries": [{"type": "Semi Skilled", "count": 4, "total_cost": 2000}]},
    {"project_id": "p2", "contractor_name": "Mani", "date": "2026-09-30",  # outside the range
     "entries": [{"type": "Mason", "count": 9, "total_cost": 9000}]},
]
PROJECTS = [{"project_id": "p1", "name": "Alpha"}, {"project_id": "p2", "name": "Beta"}]


def _labour(start="2026-10-01", end="2026-10-31"):
    fn = _load("financial.py", "get_dashboard_labour_summary", ["_labour_skill_bucket"],
               daily_labour_reports=DLRS, projects=PROJECTS)
    return asyncio.run(fn(start_date=start, end_date=end, user=ADMIN))


def test_labour_card_figures_are_unchanged():
    r = _labour()
    assert r["total"] == {"count": 10, "amount": 6200}
    assert r["skilled"] == {"count": 4, "amount": 3200}
    assert r["semi_skilled"] == {"count": 4, "amount": 2000}
    assert r["unskilled"] == {"count": 2, "amount": 1000}


def test_labour_rows_add_back_up_to_each_bucket():
    r = _labour()
    for b in ("skilled", "semi_skilled", "unskilled", "total"):
        assert sum(x[b]["count"] for x in r["rows"]) == r[b]["count"]
        assert sum(x[b]["amount"] for x in r["rows"]) == r[b]["amount"]


def test_labour_rows_are_per_project_and_contractor():
    rows = {(x["project_name"], x["contractor_name"]): x for x in _labour()["rows"]}
    assert set(rows) == {("Alpha", "Raju"), ("Beta", "Mani")}
    assert rows[("Alpha", "Raju")]["days"] == 2, "two report dates in range"
    assert rows[("Beta", "Mani")]["days"] == 1, "the September report is outside the range"
    assert _labour()["rows"][0]["project_name"] == "Alpha", "largest amount first"


# --------------------------------------------------------------------------
# Projects overview
# --------------------------------------------------------------------------

def test_projects_overview_lists_the_projects_it_counts():
    docs = [
        {"project_id": "a", "name": "A", "planning_status": "new"},
        {"project_id": "b", "name": "B", "planning_status": "active"},
        {"project_id": "c", "name": "C", "planning_status": "active"},
        {"project_id": "d", "name": "D", "planning_status": "delivered"},
        {"project_id": "e", "name": "E", "planning_status": "active", "is_deleted": True},
        {"project_id": "f", "name": "F", "planning_status": "draft"},
    ]
    fn = _load("projects.py", "get_dashboard_projects_overview", projects=docs)
    r = asyncio.run(fn(user=ADMIN))
    assert (r["total"], r["new"], r["ongoing"], r["completed"]) == (4, 1, 2, 1)
    assert sorted(p["project_id"] for p in r["projects"]) == ["a", "b", "c", "d"], (
        "deleted and non-live projects are neither counted nor listed")


# --------------------------------------------------------------------------
# HR
# --------------------------------------------------------------------------

def test_hr_summary_lists_each_employee_with_their_attendance():
    staff = [
        {"staff_id": "s1", "name": "Asha", "status": "active"},
        {"staff_id": "s2", "name": "Bala", "status": "active"},
        {"staff_id": "s3", "name": "Chitra", "status": "active"},
        {"staff_id": "s4", "name": "Dev", "status": "terminated"},
    ]
    attendance = [
        {"staff_id": "s1", "date": "2026-10-06", "status": "present", "check_in": "2026-10-06T03:30:00Z", "is_late": True},
        {"staff_id": "s2", "date": "2026-10-06", "status": "wfh"},
        {"staff_id": "s3", "date": "2026-10-05", "status": "present"},   # a different day
        {"staff_id": "s4", "date": "2026-10-06", "status": "present"},   # not an active employee
    ]
    fn = _load("hr.py", "get_dashboard_hr_summary", staff=staff, attendance=attendance)
    r = asyncio.run(fn(date="2026-10-06", user=ADMIN))
    assert (r["total_staff"], r["present"], r["absent"], r["wfh"]) == (3, 2, 1, 1)
    by_id = {s["staff_id"]: s for s in r["staff"]}
    assert set(by_id) == {"s1", "s2", "s3"}
    assert by_id["s1"]["is_present"] and by_id["s1"]["is_late"]
    assert by_id["s2"]["attendance_status"] == "wfh" and by_id["s2"]["is_present"]
    assert by_id["s3"]["attendance_status"] == "absent" and not by_id["s3"]["is_present"]
    assert sum(s["is_present"] for s in r["staff"]) == r["present"], "the list and the count agree"
