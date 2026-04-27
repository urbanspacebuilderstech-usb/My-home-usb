"""
Tests for public Rough-Estimate share-link (quote_links) routes.
Covers: generate, get status, public view, expired book-appointment, regenerate-re, timeline.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-onboard-flow.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@constructionos.com"
ADMIN_PASSWORD = "Demo@1234"

# Pre-existing GM-approved RE fixtures from the review request
LEAD_A = "lead_73896054d131"
RE_A_APPROVED = "re_2b9ca650e828"
LEAD_B = "lead_d08bc1f28f16"
RE_B_APPROVED = "re_036b7016e31c"


@pytest.fixture(scope="module", autouse=True)
def _reset_leads_to_approved_re():
    """
    Earlier test runs / smoke-tests may have regenerated RE on these leads, pointing
    lead.re_project_id to a fresh in-progress RE. Reset them to the known-approved
    RE so generate-quote-link works deterministically.
    """
    import os as _os
    from pathlib import Path
    # Load backend .env for MONGO_URL / DB_NAME when running pytest from /app
    env_path = Path("/app/backend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                _os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    from pymongo import MongoClient
    c = MongoClient(_os.environ["MONGO_URL"])
    db = c[_os.environ["DB_NAME"]]
    db.leads.update_one({"lead_id": LEAD_A}, {"$set": {"re_project_id": RE_A_APPROVED}})
    db.leads.update_one({"lead_id": LEAD_B}, {"$set": {"re_project_id": RE_B_APPROVED}})
    # Ensure the approved RE itself is still re_approved (may have changed)
    db.re_projects.update_one({"re_project_id": RE_A_APPROVED}, {"$set": {"status": "re_approved"}})
    db.re_projects.update_one({"re_project_id": RE_B_APPROVED}, {"$set": {"status": "re_approved"}})
    yield


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def public_client():
    return requests.Session()


# ---------- generate-quote-link ----------

class TestGenerateQuoteLink:
    def test_generate_for_lead_a(self, admin_client):
        r = admin_client.post(f"{API}/leads/{LEAD_A}/generate-quote-link", json={"re_project_id": RE_A_APPROVED})
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "token" in data and data["token"].count(".") == 1
        assert data["lead_id"] == LEAD_A
        assert data.get("is_revoked") is False
        assert "expires_at" in data
        # persist for downstream tests
        pytest.token_a = data["token"]
        pytest.quote_id_a = data["quote_id"]

    def test_invalid_lead_404(self, admin_client):
        r = admin_client.post(f"{API}/leads/lead_does_not_exist/generate-quote-link", json={})
        assert r.status_code == 404

    def test_get_active_link_returns_live(self, admin_client):
        r = admin_client.get(f"{API}/leads/{LEAD_A}/quote-link")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "live"
        assert data["link"]["token"] == pytest.token_a

    def test_generate_revokes_prior(self, admin_client):
        # Generate again — previous should be revoked, new one active
        r = admin_client.post(f"{API}/leads/{LEAD_A}/generate-quote-link", json={"re_project_id": RE_A_APPROVED})
        assert r.status_code == 200
        new_token = r.json()["token"]
        assert new_token != pytest.token_a
        # Old token should now be revoked → 410
        r2 = requests.get(f"{API}/public/quote/{pytest.token_a}")
        assert r2.status_code == 410, r2.text[:200]
        pytest.token_a = new_token  # update


# ---------- public quote ----------

class TestPublicQuote:
    def test_public_get_live(self, public_client):
        r = public_client.get(f"{API}/public/quote/{pytest.token_a}")
        assert r.status_code == 200
        data = r.json()
        assert data.get("expired") is False
        assert "re_project" in data and data["re_project"]
        assert "sales_person" in data
        assert "expires_at" in data

    def test_public_invalid_token_404(self, public_client):
        r = public_client.get(f"{API}/public/quote/invalid.deadbeef")
        assert r.status_code == 404

    def test_public_malformed_token_404(self, public_client):
        r = public_client.get(f"{API}/public/quote/not-a-token")
        assert r.status_code == 404

    def test_public_no_auth_required(self):
        # Brand-new session with no cookies/headers → must still work
        s = requests.Session()
        r = s.get(f"{API}/public/quote/{pytest.token_a}")
        assert r.status_code == 200


# ---------- book appointment (expired link path; endpoint itself works regardless of expiry) ----------

class TestBookAppointment:
    def test_book_invalid_token(self, public_client):
        r = public_client.post(
            f"{API}/public/quote/invalid.xx/book-appointment",
            json={"appointment_date": "2026-02-10", "appointment_time": "10:00"},
        )
        assert r.status_code == 404

    def test_book_requires_date_time(self, public_client):
        r = public_client.post(
            f"{API}/public/quote/{pytest.token_a}/book-appointment",
            json={"appointment_date": "", "appointment_time": ""},
        )
        # pydantic may 422, handler may 400 — either is acceptable validation
        assert r.status_code in (400, 422)

    def test_book_success_creates_lead(self, public_client, admin_client):
        r = public_client.post(
            f"{API}/public/quote/{pytest.token_a}/book-appointment",
            json={
                "name": "TEST_Returning Prospect",
                "phone": "9999999999",
                "appointment_date": "2026-02-15",
                "appointment_time": "11:30",
                "notes": "TEST — appointment from quote link",
            },
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("lead_id", "").startswith("lead_")
        new_lead_id = data["lead_id"]

        # Verify new lead persisted & tagged correctly
        g = admin_client.get(f"{API}/crm/leads/{new_lead_id}")
        assert g.status_code == 200, g.text[:200]
        nl = g.json()
        tags = nl.get("tags") or []
        assert "client_appointment" in tags
        assert nl.get("appointment", {}).get("appointment_date") == "2026-02-15"
        assert nl.get("previous_lead_id") == LEAD_A


# ---------- regenerate RE ----------

class TestRegenerateRe:
    def test_regenerate_requires_remarks(self, admin_client):
        r = admin_client.post(f"{API}/leads/{LEAD_B}/regenerate-re", json={"remarks": "   "})
        assert r.status_code == 400

    def test_regenerate_success(self, admin_client):
        # capture current revision before regen
        g0 = admin_client.get(f"{API}/crm/leads/{LEAD_B}")
        prev_re = g0.json().get("re_project_id")
        r = admin_client.post(
            f"{API}/leads/{LEAD_B}/regenerate-re",
            json={"remarks": "TEST — please rework the plumbing scope"},
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data.get("re_project_id", "").startswith("re_")
        assert data.get("re_project_id") != prev_re
        assert int(data.get("revision", 0)) >= 1

        # Lead should be moved back to stg_re_request and point to new RE
        g = admin_client.get(f"{API}/crm/leads/{LEAD_B}")
        assert g.status_code == 200
        assert g.json().get("current_stage_id") == "stg_re_request"
        assert g.json().get("re_project_id") == data["re_project_id"]


# ---------- timeline ----------

class TestTimeline:
    def test_timeline_returns_events(self, admin_client):
        r = admin_client.get(f"{API}/leads/{LEAD_A}/timeline")
        assert r.status_code == 200
        data = r.json()
        assert data["lead_id"] == LEAD_A
        events = data.get("events", [])
        assert isinstance(events, list) and len(events) > 0
        types = {e.get("type") for e in events}
        # Quote link generated earlier in test run → must be present
        assert "quote_link" in types, f"quote_link missing in timeline events: {types}"
        # Sorted newest first (string ISO compare works)
        ats = [e.get("at") or "" for e in events]
        assert ats == sorted(ats, reverse=True)

    def test_timeline_invalid_lead_404(self, admin_client):
        r = admin_client.get(f"{API}/leads/lead_xxxxx/timeline")
        assert r.status_code == 404
