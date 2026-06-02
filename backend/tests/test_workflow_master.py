"""
Workflow Master (Super Admin) – per-role main menu visibility + order.
Endpoints:
  GET  /api/admin/workflow-master/roles
  GET  /api/admin/workflow-master/me
  PUT  /api/admin/workflow-master/roles/{role}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-onboard-flow.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@constructionos.com", "Demo@1234")
CRE = ("cre@constructionos.com", "Demo@1234")
PLANNING = ("planning@constructionos.com", "Demo@1234")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    return s, r


# ------------- Authentication smoke -------------
def test_admin_login_success():
    s, r = _login(*ADMIN)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"


def test_cre_login_success():
    s, r = _login(*CRE)
    if r.status_code != 200:
        pytest.skip(f"cre user not present in this env: {r.status_code} {r.text[:120]}")


def test_planning_login_success():
    s, r = _login(*PLANNING)
    if r.status_code != 200:
        pytest.skip(f"planning user not present in this env: {r.status_code} {r.text[:120]}")


# ------------- /roles (super admin) -------------
@pytest.fixture(scope="module")
def admin_session():
    s, r = _login(*ADMIN)
    assert r.status_code == 200
    return s


def test_list_roles_returns_12(admin_session):
    r = admin_session.get(f"{API}/admin/workflow-master/roles", timeout=30)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert "roles" in data
    roles = data["roles"]
    # Catalog has 12 entries
    assert len(roles) == 12, f"expected 12 roles, got {len(roles)} -> {[x['role'] for x in roles]}"
    # Each role has a non-empty menu list with key/label/enabled
    for role in roles:
        assert role.get("menus"), f"role {role.get('role')} has empty menus"
        for m in role["menus"]:
            assert {"key", "label", "enabled"}.issubset(m.keys())


def test_list_roles_forbidden_for_non_super(admin_session):
    # Try with CRE (lower priv)
    s, r = _login(*CRE)
    if r.status_code != 200:
        pytest.skip("CRE user not available")
    rr = s.get(f"{API}/admin/workflow-master/roles", timeout=30)
    assert rr.status_code in (401, 403), f"expected 401/403 got {rr.status_code}"


# ------------- /me -------------
def test_me_for_super_admin(admin_session):
    r = admin_session.get(f"{API}/admin/workflow-master/me", timeout=30)
    # super_admin role is not in catalog -> server returns {"menus": []}
    assert r.status_code == 200
    data = r.json()
    assert "menus" in data


def test_me_for_cre_returns_cre_menus():
    s, r = _login(*CRE)
    if r.status_code != 200:
        pytest.skip("CRE user not available")
    rr = s.get(f"{API}/admin/workflow-master/me", timeout=30)
    assert rr.status_code == 200, rr.text[:200]
    data = rr.json()
    assert data.get("role") == "cre"
    keys = [m["key"] for m in data["menus"]]
    assert "payment_schedule" in keys


# ------------- PUT save: reorder + toggle, wrong password, /me reflects change, restore -------------

CRE_ORIGINAL_ORDER = [
    "payment_schedule", "final_estimate", "pre_construction", "cheques",
    "dt_requests", "additional_costs", "all_projects", "income",
]
PLANNING_ORIGINAL_ORDER = [
    "dashboard", "approvals", "projects", "contractors", "vendors", "materials",
]


def test_put_cre_wrong_password_401(admin_session):
    payload = {
        "password": "WRONG_PW",
        "menus": [{"key": k, "enabled": True} for k in CRE_ORIGINAL_ORDER],
    }
    r = admin_session.put(f"{API}/admin/workflow-master/roles/cre", json=payload, timeout=30)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"


def test_put_cre_reorder_and_toggle_then_me_reflects(admin_session):
    # Move payment_schedule to the END, toggle cheques OFF
    new_order = [k for k in CRE_ORIGINAL_ORDER if k != "payment_schedule"] + ["payment_schedule"]
    menus = []
    for k in new_order:
        menus.append({"key": k, "enabled": (k != "cheques")})

    r = admin_session.put(
        f"{API}/admin/workflow-master/roles/cre",
        json={"password": ADMIN[1], "menus": menus},
        timeout=30,
    )
    assert r.status_code == 200, f"save failed: {r.status_code} {r.text[:200]}"
    saved = r.json()
    assert [m["key"] for m in saved["menus"]] == new_order

    # Verify via super-admin list endpoint
    rr = admin_session.get(f"{API}/admin/workflow-master/roles", timeout=30)
    cre_cfg = next(x for x in rr.json()["roles"] if x["role"] == "cre")
    assert [m["key"] for m in cre_cfg["menus"]] == new_order
    cheques = next(m for m in cre_cfg["menus"] if m["key"] == "cheques")
    assert cheques["enabled"] is False

    # Login as CRE and verify /me returns new order + cheques disabled
    s, login_r = _login(*CRE)
    if login_r.status_code != 200:
        pytest.skip("CRE user not available for /me verification")
    me_r = s.get(f"{API}/admin/workflow-master/me", timeout=30)
    assert me_r.status_code == 200
    me_menus = me_r.json()["menus"]
    assert [m["key"] for m in me_menus] == new_order, f"order mismatch: {[m['key'] for m in me_menus]}"
    assert next(m for m in me_menus if m["key"] == "cheques")["enabled"] is False
    assert next(m for m in me_menus if m["key"] == "payment_schedule")["enabled"] is True


def test_put_planning_reorder_and_me_reflects(admin_session):
    new_order = [k for k in PLANNING_ORIGINAL_ORDER if k != "dashboard"] + ["dashboard"]
    menus = [{"key": k, "enabled": True} for k in new_order]
    r = admin_session.put(
        f"{API}/admin/workflow-master/roles/planning",
        json={"password": ADMIN[1], "menus": menus},
        timeout=30,
    )
    assert r.status_code == 200, r.text[:200]

    s, login_r = _login(*PLANNING)
    if login_r.status_code != 200:
        pytest.skip("planning user not available")
    me_r = s.get(f"{API}/admin/workflow-master/me", timeout=30)
    assert me_r.status_code == 200
    me_menus = me_r.json()["menus"]
    assert [m["key"] for m in me_menus] == new_order


def test_put_unknown_role_404(admin_session):
    r = admin_session.put(
        f"{API}/admin/workflow-master/roles/__bogus__",
        json={"password": ADMIN[1], "menus": []},
        timeout=30,
    )
    assert r.status_code == 404


def test_zz_restore_original_orders(admin_session):
    """Restore CRE + Planning to seeded order with all enabled."""
    for role, original in [("cre", CRE_ORIGINAL_ORDER), ("planning", PLANNING_ORIGINAL_ORDER)]:
        menus = [{"key": k, "enabled": True} for k in original]
        r = admin_session.put(
            f"{API}/admin/workflow-master/roles/{role}",
            json={"password": ADMIN[1], "menus": menus},
            timeout=30,
        )
        assert r.status_code == 200, f"restore {role} failed: {r.status_code} {r.text[:200]}"
        got = [m["key"] for m in r.json()["menus"]]
        assert got == original
