"""
Stage 2 — 4-step Additional Cost Approval Chain
Tests: PP → PH → GM → Client + section batch endpoints + new /api/cre/additional-costs.
Uses session cookies (login returns user JSON, sets cookie). Super Admin can act for all roles.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-onboard-flow.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str = "Demo@1234") -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@constructionos.com")


@pytest.fixture(scope="module")
def planning():
    return _login("planning@constructionos.com")


@pytest.fixture(scope="module")
def project_id(admin):
    """Pick a project that is NOT globally locked by client-approved items so we can create test additions."""
    r = admin.get(f"{API}/projects?limit=30", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    items = data if isinstance(data, list) else data.get("projects", data.get("items", []))
    assert items, "No projects available for testing"
    for p in items:
        pid = p.get("project_id") or p.get("id")
        probe = {"project_id": pid, "name": f"PROBE_{int(time.time()*1000)}", "description": "lock probe",
                 "estimated_amount": 1, "qty": 1, "unit": "nos", "unit_rate": 1}
        rr = admin.post(f"{API}/additional-costs", json=probe, timeout=15)
        if rr.status_code in (200, 201):
            return pid
    pytest.skip("No unlocked project available for testing")


def _create_addition(s: requests.Session, project_id: str, name="TEST_AC_4step"):
    body = {
        "project_id": project_id,
        "name": f"{name}_{int(time.time()*1000)}",
        "description": "Created by automated 4-step approval chain test",
        "estimated_amount": 5000,
        "qty": 1,
        "unit": "nos",
        "unit_rate": 5000,
    }
    r = s.post(f"{API}/additional-costs", json=body, timeout=20)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:300]}"
    j = r.json()
    cid = j.get("cost_id") or j.get("id") or (j.get("data") or {}).get("cost_id")
    assert cid, f"cost_id missing in response: {j}"
    return cid


def _get_addition(s: requests.Session, project_id: str, cost_id: str):
    r = s.get(f"{API}/projects/{project_id}/additional-costs", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    rows = data if isinstance(data, list) else (data.get("rows") or data.get("items") or [])
    for it in rows:
        if it.get("cost_id") == cost_id:
            return it
    return None


# ---------------- Single-item happy path ----------------
class TestApprovalChain:
    def test_happy_path_pp_ph_gm_client(self, admin, project_id):
        cid = _create_addition(admin, project_id)

        r = admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("approval_status") == "ph_review"

        item = _get_addition(admin, project_id, cid)
        assert item and item.get("approval_status") == "ph_review"

        r = admin.post(f"{API}/additional-costs/{cid}/ph-approve", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("approval_status") == "gm_review"

        r = admin.post(f"{API}/additional-costs/{cid}/gm-approve", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("approval_status") == "awaiting_client"

        item = _get_addition(admin, project_id, cid)
        assert item and item.get("approval_status") == "awaiting_client"
        # GM approve must AUTO-set client_approval_status
        assert item.get("client_approval_status") == "pending_client", f"client_approval_status not auto-set: {item.get('client_approval_status')}"

    def test_ph_reject_marks_planning_head_step(self, admin, project_id):
        cid = _create_addition(admin, project_id)
        admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)

        # reject without reason → 400
        r = admin.post(f"{API}/additional-costs/{cid}/ph-reject", json={}, timeout=20)
        assert r.status_code == 400

        r = admin.post(f"{API}/additional-costs/{cid}/ph-reject", json={"reason": "needs cheaper material"}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        item = _get_addition(admin, project_id, cid)
        assert item.get("approval_status") == "rejected"
        assert item.get("rejected_at_step") == "planning_head"
        assert item.get("rejection_reason") == "needs cheaper material"

        # resubmit should work after rejection
        r = admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)
        assert r.status_code == 200
        assert r.json().get("approval_status") == "ph_review"

    def test_gm_reject_marks_general_manager_step(self, admin, project_id):
        cid = _create_addition(admin, project_id)
        admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)
        admin.post(f"{API}/additional-costs/{cid}/ph-approve", timeout=20)

        r = admin.post(f"{API}/additional-costs/{cid}/gm-reject", json={"reason": "over-budget"}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        item = _get_addition(admin, project_id, cid)
        assert item.get("approval_status") == "rejected"
        assert item.get("rejected_at_step") == "general_manager"

    def test_ph_approve_only_from_ph_review(self, admin, project_id):
        cid = _create_addition(admin, project_id)
        # Skip submit → ph-approve should fail
        r = admin.post(f"{API}/additional-costs/{cid}/ph-approve", timeout=20)
        assert r.status_code == 400, f"expected 400 from invalid transition, got {r.status_code}"

    def test_gm_approve_only_from_gm_review(self, admin, project_id):
        cid = _create_addition(admin, project_id)
        admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)
        # Skipping PH approve, GM should fail
        r = admin.post(f"{API}/additional-costs/{cid}/gm-approve", timeout=20)
        assert r.status_code == 400


# ---------------- Section batch ----------------
class TestSectionBatch:
    def test_section_batch_submit_ph_gm(self, admin, project_id):
        section_id = f"sec_test_{int(time.time())}"
        cids = []
        for i in range(2):
            body = {
                "project_id": project_id,
                "section_id": section_id,
                "name": f"TEST_SEC_{i}_{int(time.time()*1000)}",
                "description": "section batch test",
                "estimated_amount": 1000,
                "qty": 1, "unit": "nos", "unit_rate": 1000,
            }
            r = admin.post(f"{API}/additional-costs", json=body, timeout=20)
            assert r.status_code in (200, 201), r.text[:200]
            cids.append(r.json().get("cost_id"))

        r = admin.post(f"{API}/projects/{project_id}/addition-sections/{section_id}/submit-for-review", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("count") == 2

        r = admin.post(f"{API}/projects/{project_id}/addition-sections/{section_id}/ph-approve", timeout=20)
        assert r.status_code == 200
        assert r.json().get("count") == 2

        r = admin.post(f"{API}/projects/{project_id}/addition-sections/{section_id}/gm-approve", timeout=20)
        assert r.status_code == 200
        assert r.json().get("count") == 2

        # Verify final state
        for cid in cids:
            item = _get_addition(admin, project_id, cid)
            assert item and item.get("approval_status") == "awaiting_client"
            assert item.get("client_approval_status") == "pending_client"


# ---------------- /api/cre/additional-costs ----------------
class TestCREAdditionalCostsEndpoint:
    def test_endpoint_returns_rows_shape_for_admin(self, admin):
        r = admin.get(f"{API}/cre/additional-costs", timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert "rows" in body and isinstance(body["rows"], list), f"shape wrong: {list(body.keys())}"
        # If any rows, they must carry project metadata fields used by CRE Board UI
        for row in body["rows"][:5]:
            assert "project_id" in row
            assert "project_name" in row
            assert "approval_status" in row or "client_approval_status" in row

    def test_endpoint_returns_403_for_non_cre(self, planning):
        r = planning.get(f"{API}/cre/additional-costs", timeout=20)
        assert r.status_code == 403, f"expected 403 for planning role, got {r.status_code} body={r.text[:200]}"

    def test_gm_approved_row_appears_in_cre_queue(self, admin, project_id):
        cid = _create_addition(admin, project_id, name="TEST_CRE_QUEUE")
        admin.post(f"{API}/additional-costs/{cid}/submit-for-review", timeout=20)
        admin.post(f"{API}/additional-costs/{cid}/ph-approve", timeout=20)
        admin.post(f"{API}/additional-costs/{cid}/gm-approve", timeout=20)

        r = admin.get(f"{API}/cre/additional-costs", timeout=30)
        assert r.status_code == 200
        cost_ids = [row.get("cost_id") for row in r.json().get("rows", [])]
        assert cid in cost_ids, f"GM-approved cost {cid} not visible in /cre/additional-costs queue"
