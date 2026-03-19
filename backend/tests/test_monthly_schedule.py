"""
Monthly Payment Schedule API Tests
Tests for Planning Monthly Schedule CRUD operations including:
- GET /api/planning/monthly-schedule - fetch schedule with entries/summary
- GET /api/planning/monthly-schedule/available-stages - stages not yet scheduled
- POST /api/planning/monthly-schedule/add-stages - add stages to schedule
- DELETE /api/planning/monthly-schedule/{entry_id} - remove entry
- PATCH /api/planning/monthly-schedule/{entry_id}/request-payment - request payment
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"


class TestMonthlyScheduleAPIs:
    """Monthly Payment Schedule endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        # Login as planning user via demo-login
        r = self.session.post(f"{API}/auth/demo-login", json={"email": "planning@constructionos.com"})
        if r.status_code != 200:
            # fallback to super admin
            r = self.session.post(f"{API}/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert r.status_code == 200, f"Demo login failed: {r.text}"
        self.user = r.json()
        
    def test_01_get_monthly_schedule_structure(self):
        """GET /api/planning/monthly-schedule returns correct structure with entries[] and summary{}"""
        r = self.session.get(f"{API}/planning/monthly-schedule", params={"month": 3, "year": 2026})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        
        data = r.json()
        # Check structure
        assert "entries" in data, "Response must have 'entries' array"
        assert "summary" in data, "Response must have 'summary' object"
        assert isinstance(data["entries"], list), "entries must be a list"
        assert isinstance(data["summary"], dict), "summary must be a dict"
        
        # Check summary fields
        summary = data["summary"]
        assert "total_entries" in summary
        assert "total_planned" in summary
        assert "total_received" in summary
        assert "total_balance" in summary
        assert "carryover_count" in summary
        assert "requested_count" in summary
        assert "collected_count" in summary
        print(f"GET monthly-schedule: {len(data['entries'])} entries, total_planned={summary.get('total_planned')}")
        
    def test_02_get_available_stages_structure(self):
        """GET /api/planning/monthly-schedule/available-stages returns stages not yet scheduled"""
        r = self.session.get(f"{API}/planning/monthly-schedule/available-stages", params={"month": 3, "year": 2026})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        
        data = r.json()
        assert isinstance(data, list), "Response must be a list of stages"
        print(f"Available stages: {len(data)}")
        
        # If there are stages, check structure
        if data:
            stage = data[0]
            assert "stage_id" in stage, "Stage must have stage_id"
            assert "project_id" in stage, "Stage must have project_id"
            assert "project_name" in stage, "Stage must have project_name"
            assert "stage_name" in stage or "stage_label" in stage
            assert "amount" in stage
            print(f"Sample stage: {stage.get('stage_name')} - {stage.get('amount')}")
    
    def test_03_add_stages_validation(self):
        """POST /api/planning/monthly-schedule/add-stages validates required fields"""
        # Missing month/year/stage_ids should fail
        r = self.session.post(f"{API}/planning/monthly-schedule/add-stages", json={})
        assert r.status_code == 400, f"Expected 400 for empty body, got {r.status_code}"
        
        r = self.session.post(f"{API}/planning/monthly-schedule/add-stages", json={"month": 3, "year": 2026})
        assert r.status_code == 400, f"Expected 400 for missing stage_ids, got {r.status_code}"
        print("Add stages validation: PASS")
        
    def test_04_add_stages_empty_list(self):
        """POST /api/planning/monthly-schedule/add-stages with empty stage_ids"""
        r = self.session.post(f"{API}/planning/monthly-schedule/add-stages", json={
            "month": 3, "year": 2026, "stage_ids": []
        })
        # Empty list should either return 400 or return added=0
        if r.status_code == 200:
            data = r.json()
            assert data.get("added") == 0, "Added count should be 0 for empty list"
        else:
            assert r.status_code == 400
        print("Add stages empty list: PASS")
        
    def test_05_delete_nonexistent_entry(self):
        """DELETE /api/planning/monthly-schedule/{entry_id} returns 404 for nonexistent"""
        r = self.session.delete(f"{API}/planning/monthly-schedule/nonexistent_entry_12345")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        print("Delete nonexistent entry: PASS")
        
    def test_06_request_payment_nonexistent(self):
        """PATCH /api/planning/monthly-schedule/{entry_id}/request-payment returns 404 for nonexistent"""
        r = self.session.patch(f"{API}/planning/monthly-schedule/nonexistent_entry/request-payment")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        print("Request payment nonexistent: PASS")
        
    def test_07_get_months_list(self):
        """GET /api/planning/monthly-schedule/months-list returns list of months with entries"""
        r = self.session.get(f"{API}/planning/monthly-schedule/months-list")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert "month" in data[0]
            assert "year" in data[0]
            assert "count" in data[0]
        print(f"Months with entries: {len(data)}")


class TestMonthlyScheduleCREAccess:
    """Test that CRE can also access monthly schedule (read-only)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        r = self.session.post(f"{API}/auth/demo-login", json={"email": "cre@constructionos.com"})
        if r.status_code != 200:
            pytest.skip("CRE demo login failed")
        self.user = r.json()
        
    def test_cre_can_read_schedule(self):
        """CRE user can GET monthly schedule"""
        r = self.session.get(f"{API}/planning/monthly-schedule", params={"month": 3, "year": 2026})
        assert r.status_code == 200, f"CRE should be able to read schedule, got {r.status_code}"
        print("CRE read access: PASS")
        
    def test_cre_cannot_add_stages(self):
        """CRE user cannot POST to add stages"""
        r = self.session.post(f"{API}/planning/monthly-schedule/add-stages", json={
            "month": 3, "year": 2026, "stage_ids": ["fake_stage"]
        })
        assert r.status_code == 403, f"CRE should not add stages, got {r.status_code}"
        print("CRE add stages blocked: PASS")


class TestMonthlyScheduleSuperAdmin:
    """Test super_admin access to monthly schedule"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        r = self.session.post(f"{API}/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert r.status_code == 200, f"Admin demo login failed: {r.text}"
        self.user = r.json()
        
    def test_admin_full_access(self):
        """Super Admin can access all monthly schedule endpoints"""
        # Read schedule
        r = self.session.get(f"{API}/planning/monthly-schedule", params={"month": 3, "year": 2026})
        assert r.status_code == 200, f"Admin read failed: {r.status_code}"
        
        # Read available stages
        r = self.session.get(f"{API}/planning/monthly-schedule/available-stages", params={"month": 3, "year": 2026})
        assert r.status_code == 200, f"Admin available-stages failed: {r.status_code}"
        print("Super Admin full access: PASS")


class TestPaymentScheduleOverview:
    """Test payment-schedule-overview endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        r = self.session.post(f"{API}/auth/demo-login", json={"email": "planning@constructionos.com"})
        if r.status_code != 200:
            r = self.session.post(f"{API}/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert r.status_code == 200
        
    def test_payment_schedule_overview(self):
        """GET /api/planning/payment-schedule-overview returns all stages"""
        r = self.session.get(f"{API}/planning/payment-schedule-overview")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "stages" in data
        assert "summary" in data
        print(f"Payment schedule overview: {len(data.get('stages', []))} stages")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
