"""Live end-to-end parity: Project page Expense == Finance Board Project Wise Expense.

Aug 25 2026 — Regression guard for the defect Sai Karthick reported on Mr
Sridhar (project page ₹95,18,529.24 vs Project Wise ₹93,31,389.24). The check
is GENERIC: it walks every project the Project Wise table returns and asserts
all three surfaces agree, so no project can drift again.

Surfaces compared, per project:
  • Finance Board > Project Wise      → /accountant/cashbook-filtered → project_wise[].expense
  • Project header Financial Perf.    → /projects/{id}/full-details   → summary.total_expense
  • Project > Cashflow strip          → /projects/{id}/payment-summary → total_expense

Read-only: every request is a GET. Nothing here writes to the database.

Run against an environment:
    REACT_APP_BACKEND_URL=https://myhomeusb.com \
    PARITY_EMAIL=... PARITY_PASSWORD=... \
    pytest backend/tests/test_project_expense_parity.py -v

Optional:
    PARITY_PROJECT_LIMIT=10   # projects to sample (default 25, 0 = all)
    PARITY_PROJECT_NAME=Sridhar
"""
import os

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://myhomeusb.com').rstrip('/')
API = f"{BASE_URL}/api"

EMAIL = os.environ.get("PARITY_EMAIL", "admin@constructionos.com")
PASSWORD = os.environ.get("PARITY_PASSWORD", "Demo@1234")
PROJECT_LIMIT = int(os.environ.get("PARITY_PROJECT_LIMIT", "25"))
PROJECT_NAME = os.environ.get("PARITY_PROJECT_NAME", "")

# Money is compared to the paise. Both sides round to 2 decimals, so anything
# above half a paisa is a genuine formula difference, not float noise.
TOLERANCE = 0.01


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def project_wise(session):
    """The Finance Board > Project Wise table — the canonical figures."""
    r = session.get(f"{API}/accountant/cashbook-filtered", timeout=120)
    assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
    rows = r.json().get("project_wise") or []
    assert rows, "Project Wise returned no projects"
    return rows


def _sample(rows):
    """Projects with money on them first — they are the ones that can drift."""
    ranked = sorted(rows, key=lambda p: -(abs(p.get("expense") or 0) + abs(p.get("income") or 0)))
    if PROJECT_NAME:
        named = [p for p in ranked if PROJECT_NAME.lower() in (p.get("project_name") or "").lower()]
        if named:
            return named
    return ranked if PROJECT_LIMIT == 0 else ranked[:PROJECT_LIMIT]


def _project_page_expense(session, pid):
    """What the project page's Financial Performance card renders."""
    r = session.get(f"{API}/projects/{pid}/full-details", timeout=120)
    assert r.status_code == 200, f"full-details {pid}: {r.status_code} {r.text[:300]}"
    summary = r.json().get("summary") or {}
    return summary.get("total_expense"), summary.get("income_total")


def _payment_summary_expense(session, pid):
    r = session.get(f"{API}/projects/{pid}/payment-summary", timeout=120)
    assert r.status_code == 200, f"payment-summary {pid}: {r.status_code} {r.text[:300]}"
    return r.json().get("total_expense")


def test_project_page_expense_matches_project_wise(session, project_wise):
    """THE requirement: Project Financial Performance Expense == Project Wise Expense."""
    mismatches = []
    for row in _sample(project_wise):
        pid, name = row["project_id"], row.get("project_name")
        canonical = round(float(row.get("expense") or 0), 2)
        header_expense, _ = _project_page_expense(session, pid)
        if header_expense is None or abs(round(float(header_expense), 2) - canonical) > TOLERANCE:
            mismatches.append(f"{name} ({pid}): Project Wise {canonical} vs project page {header_expense}")
    assert not mismatches, "Expense mismatch:\n  " + "\n  ".join(mismatches)


def test_payment_summary_expense_matches_project_wise(session, project_wise):
    """The Cashflow-tab strip reads /payment-summary — same number, same rules."""
    mismatches = []
    for row in _sample(project_wise):
        pid, name = row["project_id"], row.get("project_name")
        canonical = round(float(row.get("expense") or 0), 2)
        ps_expense = _payment_summary_expense(session, pid)
        if ps_expense is None or abs(round(float(ps_expense), 2) - canonical) > TOLERANCE:
            mismatches.append(f"{name} ({pid}): Project Wise {canonical} vs payment-summary {ps_expense}")
    assert not mismatches, "Expense mismatch:\n  " + "\n  ".join(mismatches)


def test_balance_matches_project_wise(session, project_wise):
    """Balance = Income − Expense must agree on both screens too."""
    mismatches = []
    for row in _sample(project_wise):
        pid, name = row["project_id"], row.get("project_name")
        canonical_balance = round(float(row.get("balance") or 0), 2)
        header_expense, header_income = _project_page_expense(session, pid)
        if header_expense is None or header_income is None:
            mismatches.append(f"{name} ({pid}): project page returned no totals")
            continue
        page_balance = round(float(header_income) - float(header_expense), 2)
        if abs(page_balance - canonical_balance) > TOLERANCE:
            mismatches.append(
                f"{name} ({pid}): Project Wise balance {canonical_balance} vs project page {page_balance} "
                f"(income {header_income}, expense {header_expense})"
            )
    assert not mismatches, "Balance mismatch:\n  " + "\n  ".join(mismatches)


def test_no_endpoint_reintroduces_a_local_formula(session, project_wise):
    """All three surfaces on ONE project must be byte-for-byte equal.

    Cheap canary that fails loudly if someone adds a local expense sum back to
    any of the endpoints.
    """
    row = _sample(project_wise)[0]
    pid = row["project_id"]
    canonical = round(float(row.get("expense") or 0), 2)
    header_expense, _ = _project_page_expense(session, pid)
    ps_expense = _payment_summary_expense(session, pid)
    assert round(float(header_expense), 2) == canonical == round(float(ps_expense), 2), (
        f"{row.get('project_name')}: project_wise={canonical} "
        f"full-details={header_expense} payment-summary={ps_expense}"
    )
