"""
Tests for Contractor Dialog Overhaul feature (Iteration 153)
- GET/POST/PATCH /api/labour-contractors with new fields
- Partial PATCH support (is_locked alone)
- GET /api/labour-contractors/{id}/payment-summary aggregation
- GET /api/contractor-types/{type_id}/contractors filtering
"""
import os
import pytest
import requests
import uuid
from datetime import datetime, timezone

def _load_frontend_env():
    """Read REACT_APP_BACKEND_URL from /app/frontend/.env if not in os.environ."""
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not available")


BASE_URL = _load_frontend_env().rstrip("/")
ADMIN_EMAIL = "admin@constructionos.com"
ADMIN_PASSWORD = "Demo@1234"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=60,
    )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_contractor(admin_client):
    """Create a fresh contractor once for all module tests (yield id)."""
    payload = {
        "name": f"TEST_Contractor_{uuid.uuid4().hex[:6]}",
        "work_types": ["TEST_Masonry"],
        "phone": "9999900000",
        "email": "testc@example.com",
        "address": "TEST address",
        "bank_name": "TEST Bank",
        "account_number": "1234567890",
        "ifsc_code": "TEST0001234",
        "daily_rate_skilled": 800,
        "daily_rate_semi_skilled": 600,
        "daily_rate_unskilled": 400,
        "is_locked": False,
    }
    r = admin_client.post(f"{BASE_URL}/api/labour-contractors", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    cid = r.json().get("contractor_id")
    assert cid, f"Missing contractor_id in response: {r.json()}"
    yield {"id": cid, "payload": payload}

    # cleanup
    try:
        admin_client.delete(f"{BASE_URL}/api/labour-contractors/{cid}", timeout=10)
    except Exception:
        pass


# ---------- GET list ----------

class TestLabourContractorsList:
    def test_list_returns_array(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/labour-contractors", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/api/labour-contractors", timeout=10)
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# ---------- POST ----------

class TestCreateContractor:
    def test_create_persists_new_fields(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        r = admin_client.get(f"{BASE_URL}/api/labour-contractors", timeout=15)
        assert r.status_code == 200
        lst = r.json()
        match = [c for c in lst if c.get("contractor_id") == cid]
        assert match, f"Created contractor not present in list (id={cid})"
        c = match[0]
        assert c["daily_rate_skilled"] == 800
        assert c["daily_rate_semi_skilled"] == 600
        assert c["daily_rate_unskilled"] == 400
        assert c["is_locked"] is False
        assert "_id" not in c  # mongo _id stripped
        assert c["bank_name"] == "TEST Bank"
        assert c["ifsc_code"] == "TEST0001234"

    def test_create_without_name_returns_400(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/labour-contractors",
            json={"work_types": ["X"]},
            timeout=10,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_create_empty_name_string_returns_400(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/labour-contractors",
            json={"name": "   "},
            timeout=10,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


# ---------- PATCH partial updates ----------

class TestPatchContractor:
    def test_partial_patch_is_locked_only(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        # Set locked=True via a payload containing ONLY is_locked
        r = admin_client.patch(
            f"{BASE_URL}/api/labour-contractors/{cid}",
            json={"is_locked": True},
            timeout=10,
        )
        assert r.status_code == 200, f"Partial PATCH failed: {r.status_code} {r.text}"

        # verify other fields still intact
        lst = admin_client.get(f"{BASE_URL}/api/labour-contractors", timeout=15).json()
        c = next((x for x in lst if x.get("contractor_id") == cid), None)
        assert c is not None
        assert c["is_locked"] is True
        # original fields preserved
        assert c["daily_rate_skilled"] == 800
        assert c["bank_name"] == "TEST Bank"
        assert c["name"] == created_contractor["payload"]["name"]

    def test_partial_patch_single_rate(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        r = admin_client.patch(
            f"{BASE_URL}/api/labour-contractors/{cid}",
            json={"daily_rate_skilled": 1000},
            timeout=10,
        )
        assert r.status_code == 200
        lst = admin_client.get(f"{BASE_URL}/api/labour-contractors", timeout=15).json()
        c = next((x for x in lst if x.get("contractor_id") == cid), None)
        assert c["daily_rate_skilled"] == 1000
        assert c["daily_rate_semi_skilled"] == 600  # unchanged
        assert c["daily_rate_unskilled"] == 400

    def test_patch_empty_name_rejected(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        r = admin_client.patch(
            f"{BASE_URL}/api/labour-contractors/{cid}",
            json={"name": "   "},
            timeout=10,
        )
        assert r.status_code == 400

    def test_patch_unlocks(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        r = admin_client.patch(
            f"{BASE_URL}/api/labour-contractors/{cid}",
            json={"is_locked": False},
            timeout=10,
        )
        assert r.status_code == 200

    def test_patch_nonexistent_returns_404(self, admin_client):
        r = admin_client.patch(
            f"{BASE_URL}/api/labour-contractors/does-not-exist-xyz",
            json={"is_locked": True},
            timeout=10,
        )
        assert r.status_code == 404


# ---------- Payment Summary ----------

class TestPaymentSummary:
    def test_summary_empty_contractor(self, admin_client, created_contractor):
        cid = created_contractor["id"]
        r = admin_client.get(
            f"{BASE_URL}/api/labour-contractors/{cid}/payment-summary",
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # shape
        assert set(["work_orders", "payment_requests", "projects"]).issubset(data.keys())
        wo = data["work_orders"]
        for k in ("count", "total_amount", "paid_amount", "pending_amount"):
            assert k in wo
        assert wo["count"] == 0
        assert wo["total_amount"] == 0
        assert wo["paid_amount"] == 0
        assert wo["pending_amount"] == 0

        pr = data["payment_requests"]
        for k in ("raised_count", "raised_amount", "collected_count", "collected_amount", "pending_count", "pending_amount"):
            assert k in pr
        assert pr["raised_count"] == 0
        assert pr["collected_amount"] == 0

        assert isinstance(data["projects"], list)
        assert data["projects"] == []

    def test_summary_aggregates_with_injected_wo(self, admin_client, created_contractor):
        """Insert fake work_order doc, verify aggregation, then clean up."""
        cid = created_contractor["id"]
        # Insert directly via MongoDB client
        try:
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo unavailable")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "construction_crm")
        if not mongo_url:
            # try backend/.env
            try:
                with open("/app/backend/.env", "r") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("MONGO_URL="):
                            mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        elif line.startswith("DB_NAME="):
                            db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
            except FileNotFoundError:
                pass
        if not mongo_url:
            pytest.skip("MONGO_URL not set")
        client = MongoClient(mongo_url)
        db = client[db_name]

        wo_id = f"TEST_WO_{uuid.uuid4().hex[:6]}"
        fake_wo = {
            "work_order_id": wo_id,
            "contractor_id": cid,
            "project_id": "TEST_PROJ",
            "project_name": "TEST Project Alpha",
            "total_amount": 10000,
            "stages": [
                {"stage_id": "s1", "amount": 3000, "status": "paid"},
                {"stage_id": "s2", "amount": 2500, "status": "payment_requested"},
                {"stage_id": "s3", "amount": 1500, "status": "payment_approved"},
                {"stage_id": "s4", "amount": 3000, "status": "pending"},
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True,
        }
        db.work_orders.insert_one(fake_wo)

        try:
            r = admin_client.get(
                f"{BASE_URL}/api/labour-contractors/{cid}/payment-summary",
                timeout=15,
            )
            assert r.status_code == 200, r.text
            d = r.json()

            wo = d["work_orders"]
            assert wo["count"] == 1
            assert wo["total_amount"] == 10000
            # paid = stages with status 'paid'
            assert wo["paid_amount"] == 3000
            assert wo["pending_amount"] == 7000

            pr = d["payment_requests"]
            # raised = requested + approved + paid  -> 3 stages
            assert pr["raised_count"] == 3
            assert pr["raised_amount"] == 3000 + 2500 + 1500  # 7000
            # collected = paid only -> 1 stage, 3000
            assert pr["collected_count"] == 1
            assert pr["collected_amount"] == 3000
            # pending = requested + approved -> 2 stages
            assert pr["pending_count"] == 2
            assert pr["pending_amount"] == 2500 + 1500  # 4000

            # project bucket
            assert len(d["projects"]) == 1
            proj = d["projects"][0]
            assert proj["project_id"] == "TEST_PROJ"
            assert proj["project_name"] == "TEST Project Alpha"
            assert proj["wo_count"] == 1
            assert proj["total_amount"] == 10000
            assert proj["paid_amount"] == 3000
            assert proj["pending_amount"] == 7000
        finally:
            db.work_orders.delete_one({"work_order_id": wo_id})
            client.close()

    def test_summary_404_for_unknown_contractor(self, admin_client):
        r = admin_client.get(
            f"{BASE_URL}/api/labour-contractors/bogus-id-zzz/payment-summary",
            timeout=10,
        )
        assert r.status_code == 404


# ---------- Contractor Types: list contractors by type ----------

class TestContractorTypesView:
    @pytest.fixture(scope="class")
    def test_type(self, admin_client):
        """Create a contractor type for testing."""
        name = f"TEST_Type_{uuid.uuid4().hex[:6]}"
        r = admin_client.post(
            f"{BASE_URL}/api/contractor-types",
            json={"name": name, "description": "TEST type"},
            timeout=10,
        )
        assert r.status_code in (200, 201), f"Create type failed: {r.status_code} {r.text}"
        tid = r.json().get("type_id") or r.json().get("id")
        assert tid, r.json()
        yield {"id": tid, "name": name}
        try:
            admin_client.delete(f"{BASE_URL}/api/contractor-types/{tid}", timeout=10)
        except Exception:
            pass

    def test_list_by_type_empty(self, admin_client, test_type):
        r = admin_client.get(
            f"{BASE_URL}/api/contractor-types/{test_type['id']}/contractors",
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "type" in data
        assert "contractors" in data
        assert isinstance(data["contractors"], list)
        assert data["type"]["name"] == test_type["name"]
        # should be empty initially
        assert len(data["contractors"]) == 0

    def test_list_by_type_with_matching_contractor(self, admin_client, test_type):
        # Create a contractor with work_types containing this type's name
        name = f"TEST_C_{uuid.uuid4().hex[:6]}"
        cr = admin_client.post(
            f"{BASE_URL}/api/labour-contractors",
            json={
                "name": name,
                "work_types": [test_type["name"], "OtherType"],
            },
            timeout=10,
        )
        assert cr.status_code in (200, 201)
        cid = cr.json()["contractor_id"]

        try:
            r = admin_client.get(
                f"{BASE_URL}/api/contractor-types/{test_type['id']}/contractors",
                timeout=15,
            )
            assert r.status_code == 200
            data = r.json()
            names = [c["name"] for c in data["contractors"]]
            assert name in names
        finally:
            admin_client.delete(f"{BASE_URL}/api/labour-contractors/{cid}", timeout=10)

    def test_list_by_type_404_unknown(self, admin_client):
        r = admin_client.get(
            f"{BASE_URL}/api/contractor-types/unknown-type-xyz/contractors",
            timeout=10,
        )
        assert r.status_code == 404
