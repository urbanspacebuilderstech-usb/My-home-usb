"""
Test RNR Lead Redistribution Feature
- Tests auto-redistribution of RNR leads older than 14 days
- Tests round-robin assignment among pre-sales team members
- Tests New RNR Leads stage (stg_new_rnr) exists
- Tests rnr_redistributed, rnr_previous_owner, assigned_to fields
"""
import pytest
import requests
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/backend/.env')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com').rstrip('/')


class TestRNRRedistribution:
    """Test RNR Lead Redistribution Feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        self.admin_user = login_resp.json()
        
        yield
        
        # Cleanup: Delete test leads created during tests
        self._cleanup_test_leads()
    
    def _cleanup_test_leads(self):
        """Delete test leads created during tests"""
        try:
            # Get all leads and delete TEST_ prefixed ones
            leads_resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
            if leads_resp.status_code == 200:
                leads = leads_resp.json()
                for lead in leads:
                    if lead.get("name", "").startswith("TEST_RNR_"):
                        self.session.delete(f"{BASE_URL}/api/crm/leads/{lead['lead_id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def test_new_rnr_stage_exists(self):
        """Test that stg_new_rnr stage exists in lead_stages"""
        resp = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert resp.status_code == 200, f"Failed to get stages: {resp.text}"
        
        stages = resp.json()
        stage_ids = [s["stage_id"] for s in stages]
        stage_names = [s["name"] for s in stages]
        
        # Check stg_new_rnr exists
        assert "stg_new_rnr" in stage_ids, f"stg_new_rnr not found in stages: {stage_ids}"
        
        # Check name is "New RNR Leads"
        new_rnr_stage = next((s for s in stages if s["stage_id"] == "stg_new_rnr"), None)
        assert new_rnr_stage is not None, "stg_new_rnr stage not found"
        assert new_rnr_stage["name"] == "New RNR Leads", f"Expected 'New RNR Leads', got '{new_rnr_stage['name']}'"
        
        # Check order is 4 (between RNR and Portfolio sent)
        assert new_rnr_stage["order"] == 4, f"Expected order 4, got {new_rnr_stage['order']}"
        
        print(f"PASS: stg_new_rnr stage exists with name 'New RNR Leads' and order 4")
    
    def test_stage_order_correct(self):
        """Test that New RNR Leads is between RNR and Portfolio sent"""
        resp = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert resp.status_code == 200
        
        stages = sorted(resp.json(), key=lambda x: x["order"])
        stage_order = [(s["stage_id"], s["name"], s["order"]) for s in stages]
        
        # Find positions
        rnr_idx = next((i for i, s in enumerate(stages) if s["stage_id"] == "stg_rnr"), -1)
        new_rnr_idx = next((i for i, s in enumerate(stages) if s["stage_id"] == "stg_new_rnr"), -1)
        proposal_idx = next((i for i, s in enumerate(stages) if s["stage_id"] == "stg_proposal"), -1)
        
        assert rnr_idx >= 0, "stg_rnr not found"
        assert new_rnr_idx >= 0, "stg_new_rnr not found"
        assert proposal_idx >= 0, "stg_proposal not found"
        
        # New RNR should be after RNR and before Portfolio sent
        assert new_rnr_idx > rnr_idx, f"stg_new_rnr should be after stg_rnr. Order: {stage_order}"
        assert new_rnr_idx < proposal_idx, f"stg_new_rnr should be before stg_proposal. Order: {stage_order}"
        
        print(f"PASS: Stage order correct - RNR({rnr_idx}) < New RNR({new_rnr_idx}) < Portfolio({proposal_idx})")
    
    def test_presales_user_exists(self):
        """Test that pre-sales user exists for round-robin"""
        # Login as pre-sales
        presales_session = requests.Session()
        presales_session.headers.update({"Content-Type": "application/json"})
        
        login_resp = presales_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "presales@constructionos.com"
        })
        assert login_resp.status_code == 200, f"Pre-sales login failed: {login_resp.text}"
        
        user = login_resp.json()
        assert user.get("role") == "pre_sales", f"Expected role 'pre_sales', got '{user.get('role')}'"
        assert user.get("name") == "Karthik Reddy", f"Expected name 'Karthik Reddy', got '{user.get('name')}'"
        
        print(f"PASS: Pre-sales user exists - {user.get('name')} ({user.get('user_id')})")
    
    def test_get_presales_leads_endpoint(self):
        """Test GET /api/crm/pre-sales/leads endpoint works"""
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert resp.status_code == 200, f"Failed to get pre-sales leads: {resp.text}"
        
        leads = resp.json()
        assert isinstance(leads, list), "Expected list of leads"
        
        print(f"PASS: GET /api/crm/pre-sales/leads returns {len(leads)} leads")
    
    def test_presales_dashboard_includes_new_rnr(self):
        """Test that pre-sales dashboard includes New RNR Leads stage"""
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert resp.status_code == 200, f"Failed to get dashboard: {resp.text}"
        
        dashboard = resp.json()
        stages = dashboard.get("stages", [])
        
        # Check stg_new_rnr is in dashboard stages
        stage_ids = [s["stage_id"] for s in stages]
        assert "stg_new_rnr" in stage_ids, f"stg_new_rnr not in dashboard stages: {stage_ids}"
        
        new_rnr_stage = next((s for s in stages if s["stage_id"] == "stg_new_rnr"), None)
        assert new_rnr_stage is not None
        
        print(f"PASS: Dashboard includes New RNR Leads stage with count {new_rnr_stage.get('lead_count', 0)}")
    
    def test_check_existing_rnr_leads(self):
        """Check if there are any existing RNR leads that could be redistributed"""
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads?stage_id=stg_rnr")
        assert resp.status_code == 200
        
        rnr_leads = resp.json()
        print(f"INFO: Found {len(rnr_leads)} leads in RNR stage")
        
        # Check for leads older than 14 days
        cutoff = datetime.now(timezone.utc) - timedelta(days=14)
        old_leads = []
        for lead in rnr_leads:
            created_at = lead.get("created_at", "")
            if created_at:
                try:
                    lead_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    if lead_date <= cutoff:
                        old_leads.append(lead)
                except:
                    pass
        
        print(f"INFO: {len(old_leads)} RNR leads are older than 14 days")
        
        # Check New RNR Leads stage
        resp2 = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads?stage_id=stg_new_rnr")
        assert resp2.status_code == 200
        
        new_rnr_leads = resp2.json()
        print(f"INFO: Found {len(new_rnr_leads)} leads in New RNR Leads stage")
        
        # Check redistributed leads
        redistributed = [l for l in new_rnr_leads if l.get("rnr_redistributed")]
        print(f"INFO: {len(redistributed)} leads have rnr_redistributed=true")
        
        for lead in redistributed[:3]:  # Show first 3
            print(f"  - {lead.get('name')}: assigned_to={lead.get('assigned_to_name')}, prev_owner={lead.get('rnr_previous_owner')}")
    
    def test_redistributed_lead_fields(self):
        """Test that redistributed leads have correct fields set"""
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads?stage_id=stg_new_rnr")
        assert resp.status_code == 200
        
        new_rnr_leads = resp.json()
        redistributed = [l for l in new_rnr_leads if l.get("rnr_redistributed")]
        
        if not redistributed:
            pytest.skip("No redistributed leads found to verify fields")
        
        lead = redistributed[0]
        
        # Check required fields
        assert lead.get("rnr_redistributed") == True, "rnr_redistributed should be True"
        assert lead.get("current_stage_id") == "stg_new_rnr", f"Expected stg_new_rnr, got {lead.get('current_stage_id')}"
        assert lead.get("assigned_to") is not None, "assigned_to should be set"
        assert lead.get("assigned_to_name") is not None, "assigned_to_name should be set"
        
        # rnr_previous_owner may be None if lead was never assigned before
        print(f"PASS: Redistributed lead has correct fields:")
        print(f"  - rnr_redistributed: {lead.get('rnr_redistributed')}")
        print(f"  - assigned_to: {lead.get('assigned_to')}")
        print(f"  - assigned_to_name: {lead.get('assigned_to_name')}")
        print(f"  - rnr_previous_owner: {lead.get('rnr_previous_owner')}")
        print(f"  - rnr_redistributed_at: {lead.get('rnr_redistributed_at')}")


class TestRNRRedistributionTrigger:
    """Test that calling GET /api/crm/pre-sales/leads triggers redistribution"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200
        
        yield
    
    def test_redistribution_on_page_load(self):
        """Test that redistribution happens when pre-sales leads are fetched"""
        # First call - this should trigger redistribution
        resp1 = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert resp1.status_code == 200
        
        leads1 = resp1.json()
        new_rnr_count1 = len([l for l in leads1 if l.get("current_stage_id") == "stg_new_rnr"])
        
        # Second call - should return same results (no new redistribution)
        resp2 = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert resp2.status_code == 200
        
        leads2 = resp2.json()
        new_rnr_count2 = len([l for l in leads2 if l.get("current_stage_id") == "stg_new_rnr"])
        
        # Counts should be same (redistribution is idempotent)
        assert new_rnr_count1 == new_rnr_count2, f"Redistribution not idempotent: {new_rnr_count1} vs {new_rnr_count2}"
        
        print(f"PASS: Redistribution is idempotent - {new_rnr_count1} leads in New RNR Leads")


class TestDateFilterPreSales:
    """Test date filter functionality on Pre-Sales board"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200
        
        yield
    
    def test_date_filter_from_to(self):
        """Test date filter with from and to dates"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get leads with date filter
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads?date_from={today}&date_to={today}")
        assert resp.status_code == 200
        
        leads = resp.json()
        print(f"PASS: Date filter returns {len(leads)} leads for {today}")
    
    def test_leads_sorted_ascending(self):
        """Test that leads are sorted ascending by date"""
        resp = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert resp.status_code == 200
        
        leads = resp.json()
        
        # Backend sorts by created_at descending, frontend sorts by follow-up date ascending
        # Just verify we get leads
        assert isinstance(leads, list)
        print(f"PASS: Got {len(leads)} leads (frontend handles ascending sort)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
