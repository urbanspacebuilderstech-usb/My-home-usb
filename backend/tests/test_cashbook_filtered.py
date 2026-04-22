"""Backend tests for Cashbook filtered endpoint (Direct Expense feature)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@constructionos.com"
ADMIN_PASSWORD = "Demo@1234"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    if "session_token" not in s.cookies.get_dict():
        pytest.skip("No session_token cookie returned from login")
    return s


def test_cashbook_filtered_apr_2026(session):
    r = session.get(
        f"{API}/accountant/cashbook-filtered",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30"},
        timeout=30,
    )
    assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
    data = r.json()
    assert "income_entries" in data, f"keys={list(data.keys())}"
    assert "expense_entries" in data, f"keys={list(data.keys())}"
    assert isinstance(data["income_entries"], list)
    assert isinstance(data["expense_entries"], list)

    if data["expense_entries"]:
        e = data["expense_entries"][0]
        # Required fields for UI rendering
        for f in ("amount", "expense_type", "created_at"):
            assert f in e, f"Missing field '{f}' in expense entry. keys={list(e.keys())}"
        assert "project_id" in e or "project_name" in e
        assert "_id" not in e, "MongoDB _id leaked in response"
        # payment_method OR payment_type should be present (approved-material-requests use payment_type)
        assert ("payment_method" in e) or ("payment_type" in e), \
            f"Neither payment_method nor payment_type present. keys={list(e.keys())}"


def test_cashbook_filtered_has_material_apr_2026(session):
    """Per seed data spec: 5 material expenses on Swathi 60LG+2 in April 2026."""
    r = session.get(
        f"{API}/accountant/cashbook-filtered",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30"},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    materials = [e for e in data.get("expense_entries", []) if e.get("expense_type") == "material"]
    total = len(data.get("expense_entries", []))
    print(f"\n[APR 2026] total expenses={total}, material={len(materials)}")
    for m in materials[:10]:
        print(f"  - project={m.get('project_name')} amount={m.get('amount')} method={m.get('payment_method')}")
    assert len(materials) >= 1, f"Expected >=1 material expenses for Apr 2026, got {len(materials)} (total={total})"


def test_cashbook_filtered_with_project_filter(session):
    r = session.get(
        f"{API}/accountant/cashbook-filtered",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30"},
        timeout=30,
    )
    assert r.status_code == 200
    entries = r.json().get("expense_entries", [])
    if not entries:
        pytest.skip("No expenses in Apr 2026 to derive project_id")
    pid = entries[0].get("project_id")
    if not pid:
        pytest.skip("No project_id on expense entry")

    r2 = session.get(
        f"{API}/accountant/cashbook-filtered",
        params={"start_date": "2026-04-01", "end_date": "2026-04-30", "project_id": pid},
        timeout=30,
    )
    assert r2.status_code == 200
    for e in r2.json().get("expense_entries", []):
        if e.get("project_id"):
            assert e["project_id"] == pid, f"Project filter leaked: {e['project_id']} != {pid}"


def test_cashbook_filtered_empty_range(session):
    r = session.get(
        f"{API}/accountant/cashbook-filtered",
        params={"start_date": "2099-01-01", "end_date": "2099-01-31"},
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("income_entries", []) == []
    assert data.get("expense_entries", []) == []


def test_accountant_overview(session):
    r = session.get(f"{API}/accountant/overview", timeout=30)
    assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
    data = r.json()
    for k in ("income_by_mode", "expense_by_mode"):
        assert k in data, f"Missing key {k}; got keys={list(data.keys())}"
