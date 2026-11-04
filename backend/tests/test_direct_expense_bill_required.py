"""Record Expense (SE petty cash) — the bill is mandatory on every item.

Runs the real `record_direct_expense` from routes/site_ops.py with stubbed
globals: an item without `bill_file_id` is refused with a 400 before
anything is written; with every bill present it gets past the check.
"""
import ast
import asyncio
import enum
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = (ROOT / "routes" / "site_ops.py").read_text(encoding="utf-8")


class HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class UserRole(str, enum.Enum):
    SITE_ENGINEER = "site_engineer"
    SR_SITE_ENGINEER = "sr_site_engineer"
    ASSOCIATE_PM = "associate_pm"
    SUPER_ADMIN = "super_admin"


class PastTheCheck(Exception):
    """Raised by the stub db once the handler moves on to the project lookup."""


class _Projects:
    async def find_one(self, *a, **k):
        raise PastTheCheck()


class _Db:
    projects = _Projects()


class _Request:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


class _User:
    user_id = "u1"
    name = "Prabu"
    role = UserRole.SR_SITE_ENGINEER


def _handler():
    tree = ast.parse(SRC)
    fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "record_direct_expense")
    fn.decorator_list = []
    ns = {"HTTPException": HTTPException, "UserRole": UserRole, "db": _Db(),
          "Request": object, "User": object, "Depends": lambda *a, **k: None, "get_current_user": None}
    exec(compile(ast.Module(body=[fn], type_ignores=[]), "site_ops.py", "exec"), ns)
    return ns["record_direct_expense"]


def _call(items):
    body = {"project_id": "p1", "items": items}
    return asyncio.run(_handler()(_Request(body), _User()))


def test_an_item_without_a_bill_is_refused():
    with pytest.raises(HTTPException) as e:
        _call([
            {"expense_name": "Cement", "amount": 500, "bill_file_id": "f1", "bill_filename": "a.jpg"},
            {"expense_name": "Transport", "amount": 200},
        ])
    assert e.value.status_code == 400
    assert e.value.detail == "Upload the bill for: Transport"


def test_a_filename_without_the_file_is_not_a_bill():
    with pytest.raises(HTTPException) as e:
        _call([{"expense_name": "Sand", "amount": 300, "bill_filename": "old.jpg"}])
    assert e.value.status_code == 400


def test_every_item_with_a_bill_passes_the_check():
    with pytest.raises(PastTheCheck):
        _call([
            {"expense_name": "Cement", "amount": 500, "bill_file_id": "f1", "bill_filename": "a.jpg"},
            {"expense_name": "Transport", "amount": 200, "bill_file_id": "f2", "bill_filename": "b.pdf"},
        ])


def test_the_form_blocks_a_missing_bill_too():
    jsx = (ROOT.parent / "frontend" / "src" / "pages" / "SiteEngineerDashboard.jsx").read_text(encoding="utf-8")
    assert "const noBill = validItems.find(i => !i.bill_file_id);" in jsx
