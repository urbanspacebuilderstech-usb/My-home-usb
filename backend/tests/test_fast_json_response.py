"""Guards the orjson fast-path added Sep 16 2026 for the heavy list endpoints.

The whole point of `core.fastjson` is that it is a SPEED change and not a
payload change. These tests pin that: whatever `fast_json()` puts on the wire
must decode to exactly what FastAPI's own `json.dumps(jsonable_encoder(x))`
would have produced, for every value type this ERP actually returns.

They also pin the structural preconditions that make the swap legal -- no
wrapped route may declare a `response_model`, because returning a Response
bypasses it and would silently change the payload shape.
"""
import ast
import datetime
import decimal
import importlib.util
import io
import json
import os
import uuid

import pytest
from fastapi.encoders import jsonable_encoder

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_fastjson():
    """Import core/fastjson.py directly - core/__init__ pulls in heavy deps."""
    path = os.path.join(BACKEND, "core", "fastjson.py")
    spec = importlib.util.spec_from_file_location("_fastjson", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fastjson = _load_fastjson()
fast_json = fastjson.fast_json


def current_fastapi_output(payload):
    """Exactly what FastAPI does today for a route with no response_model."""
    return json.dumps(jsonable_encoder(payload))


IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

EQUIVALENCE_CASES = {
    "naive_datetime": datetime.datetime(2026, 9, 16, 14, 30, 5, 123456),
    "datetime_no_micro": datetime.datetime(2026, 9, 16, 14, 30, 5),
    "utc_datetime": datetime.datetime(2026, 9, 16, 14, 30, 5, tzinfo=datetime.timezone.utc),
    "ist_datetime": datetime.datetime(2026, 9, 16, 14, 30, 5, tzinfo=IST),
    "date": datetime.date(2026, 9, 16),
    "time": datetime.time(14, 30, 5),
    "uuid": uuid.UUID("12345678-1234-5678-1234-567812345678"),
    "decimal_money": decimal.Decimal("18660.50"),
    "set": {1, 2, 3},
    "tuple": (1, "a"),
    "none_bool": [None, True, False],
    "empty": {"x": [], "y": {}},
    "nested": {"a": [{"b": {"c": [1, 2, {"d": datetime.date(2026, 1, 1)}]}}]},
    "rupee_and_tamil": "SHANMUGAM ₹ INTERIORS – ஸ்ரீ",
    "negative_money": -54500.0,
    "big_int": 10 ** 15,
    "float_repr": 0.1 + 0.2,
    "extremes": [1e308, -0.0, 1.5e-07],
}


@pytest.mark.parametrize("name", sorted(EQUIVALENCE_CASES))
def test_decodes_identically_to_fastapi(name):
    payload = {"v": EQUIVALENCE_CASES[name]}
    assert json.loads(fast_json(payload).body) == json.loads(current_fastapi_output(payload))


def test_money_floats_survive_exactly():
    """Finance totals must not drift by a single ULP."""
    amounts = [1865.0, 186600.0, 72774000.0, -54500.0, 1453.38, 180370.0,
               0.1, 1 / 3, 35032.0, 1e-9]
    got = json.loads(fast_json({"a": amounts}).body)["a"]
    assert got == amounts
    assert all(isinstance(x, float) for x in got)


def test_realistic_expense_row_matches():
    row = {
        "expense_id": "exp_1b91be694b7f", "project_id": "proj_7", "amount": 18660.5,
        "created_at": datetime.datetime(2026, 9, 16, 14, 30, 5), "date": "2026-09-16",
        "category": "material", "expense_type": "material", "status": "approved",
        "payment_method": "cheque", "cheque_number": "123456",
        "vendor_name": "SATHISKUMAR AGENCY", "request_number": "USB-MR566",
        "unit_price": 4784.61, "quantity": 39, "suspense_applied": None,
        "item_bills": [{"label": "Bill", "bill_file_id": "f_1", "bill_filename": "b.pdf"}],
    }
    payload = {"expense_entries": [row] * 50, "income_entries": [],
               "totals": {"total_income": 0, "total_expense": 933025.0,
                          "net_balance": -933025.0}}
    assert json.loads(fast_json(payload).body) == json.loads(current_fastapi_output(payload))


def test_response_metadata():
    r = fast_json({"ok": True})
    assert r.status_code == 200
    assert r.media_type == "application/json"
    assert r.headers["content-type"].startswith("application/json")


def test_status_code_passthrough():
    assert fast_json({"detail": "denied"}, status_code=403).status_code == 403


def test_empty_and_large_payloads():
    assert json.loads(fast_json({}).body) == {}
    assert json.loads(fast_json([]).body) == []
    big = [{"i": i, "v": float(i) / 7} for i in range(5000)]
    assert json.loads(fast_json(big).body) == json.loads(current_fastapi_output(big))


# --------------------------------------------------------------------------
# Structural guards: these are what make the swap legal.
# --------------------------------------------------------------------------

WRAPPED = {
    "routes/financial.py": ["get_accountant_overview", "get_cashbook_filtered",
                            "get_suspense_overview"],
    "routes/site_ops.py": ["get_site_engineer_projects",
                           "get_site_engineer_inventory_summary",
                           "get_pm_inventory_summary", "get_planning_inventory_summary"],
    "routes/projects.py": ["get_projects", "get_admin_dashboard_summary"],
    "routes/crm.py": ["get_sales_masterview_rows", "get_sales_masterview_summary"],
    "routes/procurement.py": ["material_vendor_payments_summary"],
    "routes/operations.py": ["get_monthly_schedule"],
}
ALL_WRAPPED = [(f, n) for f, names in WRAPPED.items() for n in names]


def _func(rel_path, name):
    src = io.open(os.path.join(BACKEND, rel_path), encoding="utf8").read()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found in {rel_path}")


@pytest.mark.parametrize("rel_path,name", ALL_WRAPPED)
def test_wrapped_route_has_no_response_model(rel_path, name):
    """A response_model would be bypassed by returning a Response -> payload change."""
    node, _ = _func(rel_path, name)
    for dec in node.decorator_list:
        if isinstance(dec, ast.Call):
            for kw in dec.keywords:
                assert kw.arg not in ("response_model", "response_class"), \
                    f"{name} declares {kw.arg}; the fast path would change its payload"


@pytest.mark.parametrize("rel_path,name", ALL_WRAPPED)
def test_wrapped_route_actually_uses_fast_path(rel_path, name):
    node, src = _func(rel_path, name)
    seg = ast.get_source_segment(src, node) or ""
    assert "fast_json(" in seg or "ORJSONResponse(" in seg, f"{name} lost its fast path"
    assert "fast_json(fast_json(" not in seg


@pytest.mark.parametrize("rel_path", sorted(WRAPPED))
def test_fast_path_is_imported(rel_path):
    src = io.open(os.path.join(BACKEND, rel_path), encoding="utf8").read()
    if "fast_json(" in src:
        assert "from core.fastjson import fast_json" in src
    if "ORJSONResponse(" in src:
        assert "from core.fastjson import ORJSONResponse" in src


def test_monthly_schedule_keeps_no_cache_headers():
    """That endpoint deliberately returns no-store headers - don't lose them."""
    node, src = _func("routes/operations.py", "get_monthly_schedule")
    seg = ast.get_source_segment(src, node) or ""
    assert "no-store" in seg and "Cache-Control" in seg


def test_gzip_uses_cheap_compression_level():
    src = io.open(os.path.join(BACKEND, "server.py"), encoding="utf8").read()
    assert "GZipMiddleware, minimum_size=1000, compresslevel=1" in src


def test_orjson_is_pinned():
    req = io.open(os.path.join(BACKEND, "requirements.txt"), encoding="utf8").read()
    assert any(line.startswith("orjson==") for line in req.split("\n"))


def test_falls_back_to_stdlib_when_orjson_missing(monkeypatch):
    """The deploy uses `pip install ... || true`; a failed wheel must not 500
    every heavy endpoint. Without orjson the output must still be correct."""
    payload = {"d": datetime.datetime(2026, 9, 16, 14, 30, 5),
               "v": "SHANMUGAM \u20b9", "n": -54500.0,
               "rows": [{"a": decimal.Decimal("18660.50")}]}
    with_orjson = json.loads(fast_json(payload).body)
    monkeypatch.setattr(fastjson, "orjson", None)
    without_orjson = json.loads(fast_json(payload).body)
    assert without_orjson == with_orjson == json.loads(current_fastapi_output(payload))


def test_module_imports_without_orjson():
    """Import must not raise when orjson is absent."""
    src = io.open(os.path.join(BACKEND, "core", "fastjson.py"), encoding="utf8").read()
    tree = ast.parse(src)
    guarded = [n for n in ast.walk(tree)
               if isinstance(n, ast.Try)
               and any("orjson" in (ast.get_source_segment(src, b) or "") for b in n.body)]
    assert guarded, "orjson import must be wrapped in try/except ImportError"
