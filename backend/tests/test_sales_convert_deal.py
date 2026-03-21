"""
Test Suite: Sales Convert Deal Feature
Tests that Sales role can access /api/cre/convert-deal and /api/cre/convert-re-project endpoints
Previously these were CRE-only, now Sales is allowed too.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSalesConvertDealAccess:
    """Test Sales role access to convert-deal endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Sales login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Sales user via demo-login
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert login_response.status_code == 200, f"Sales login failed: {login_response.text}"
        self.sales_user = login_response.json()
        print(f"Logged in as Sales: {self.sales_user.get('name', 'Unknown')}")
        yield
        # Logout
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def test_01_sales_can_access_crm_sales_leads(self):
        """GET /api/crm/sales/leads - Sales can access their leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get sales leads: {response.text}"
        leads = response.json()
        print(f"Sales has {len(leads)} leads")
        assert isinstance(leads, list)
    
    def test_02_sales_can_access_stages(self):
        """GET /api/crm/stages?stage_type=sales - Sales can access stages"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        stages = response.json()
        print(f"Found {len(stages)} sales stages")
        # Check for Project Onboarded stage
        project_onboarded = next((s for s in stages if s.get('name') == 'Project Onboarded'), None)
        assert project_onboarded is not None, "Project Onboarded stage not found"
        print(f"Project Onboarded stage ID: {project_onboarded.get('stage_id')}")
    
    def test_03_sales_convert_deal_endpoint_access(self):
        """POST /api/cre/convert-deal/{lead_id} - Sales should have access (not 403)"""
        # First get a lead that can be converted
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        # Find a lead that hasn't been converted yet (no project_created flag)
        test_lead = None
        for lead in leads:
            if not lead.get('project_created'):
                test_lead = lead
                break
        
        if not test_lead:
            pytest.skip("No unconverted leads available for testing")
        
        lead_id = test_lead.get('lead_id')
        print(f"Testing convert-deal access with lead: {test_lead.get('name')} ({lead_id})")
        
        # Try to access the endpoint - we expect it to NOT return 403 (access denied)
        # It may return 400/422 for validation errors, but NOT 403
        response = self.session.post(f"{BASE_URL}/api/cre/convert-deal/{lead_id}", json={
            "project_name": "TEST_SalesConvert",
            "client_name": test_lead.get('name', 'Test Client'),
            "location": test_lead.get('city', 'Test City'),
            "advance_amount": 10000,
            "payment_mode": "cash",
            "accountant_confirmed": True
        })
        
        # Key assertion: Sales should NOT get 403 Forbidden
        assert response.status_code != 403, f"Sales got 403 Forbidden - endpoint not accessible to Sales role"
        print(f"Convert-deal response status: {response.status_code}")
        
        # If we get 200/201, the conversion worked
        if response.status_code in [200, 201]:
            print("SUCCESS: Sales can convert deals!")
            data = response.json()
            print(f"Created project: {data.get('project_code', 'N/A')}")
        else:
            # Other errors (400, 422) are acceptable - they mean Sales has access but validation failed
            print(f"Sales has access but got validation error: {response.text[:200]}")
    
    def test_04_sales_convert_re_project_endpoint_access(self):
        """POST /api/cre/convert-re-project/{re_project_id} - Sales should have access"""
        # First get leads with RE projects
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        # Find a lead with an RE project
        lead_with_re = None
        for lead in leads:
            if lead.get('re_project_id') and not lead.get('project_created'):
                lead_with_re = lead
                break
        
        if not lead_with_re:
            pytest.skip("No leads with RE projects available for testing")
        
        re_project_id = lead_with_re.get('re_project_id')
        print(f"Testing convert-re-project access with RE: {re_project_id}")
        
        # Try to access the endpoint
        response = self.session.post(f"{BASE_URL}/api/cre/convert-re-project/{re_project_id}", json={
            "project_name": "TEST_SalesConvertRE",
            "client_name": lead_with_re.get('name', 'Test Client'),
            "location": lead_with_re.get('city', 'Test City'),
            "advance_amount": 10000,
            "payment_mode": "cash",
            "accountant_confirmed": True
        })
        
        # Key assertion: Sales should NOT get 403 Forbidden
        assert response.status_code != 403, f"Sales got 403 Forbidden on convert-re-project"
        print(f"Convert-re-project response status: {response.status_code}")
    
    def test_05_find_test_leads_for_ui_testing(self):
        """Find leads suitable for UI testing - Harini or similar"""
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        print("\n=== Available Leads for UI Testing ===")
        for lead in leads[:10]:  # Show first 10
            stage_id = lead.get('current_stage_id', 'unknown')
            has_re = "Yes" if lead.get('re_project_id') else "No"
            converted = "Yes" if lead.get('project_created') else "No"
            print(f"  - {lead.get('name')} | Stage: {stage_id} | RE: {has_re} | Converted: {converted} | ID: {lead.get('lead_id')}")
        
        # Look for Harini specifically
        harini = next((l for l in leads if 'Harini' in (l.get('name') or '')), None)
        if harini:
            print(f"\nFound Harini: {harini.get('lead_id')} at stage {harini.get('current_stage_id')}")
        
        # Look for Vinoth
        vinoth = next((l for l in leads if 'Vinoth' in (l.get('name') or '')), None)
        if vinoth:
            print(f"Found Vinoth: {vinoth.get('lead_id')} at stage {vinoth.get('current_stage_id')}")


class TestCREConvertDealAccess:
    """Verify CRE still has access (regression test)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with CRE login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as CRE user via demo-login
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert login_response.status_code == 200, f"CRE login failed: {login_response.text}"
        self.cre_user = login_response.json()
        print(f"Logged in as CRE: {self.cre_user.get('name', 'Unknown')}")
        yield
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def test_06_cre_still_has_convert_deal_access(self):
        """POST /api/cre/convert-deal - CRE should still have access"""
        # Get CRE new deals
        response = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        if response.status_code == 200:
            deals = response.json()
            print(f"CRE has {len(deals)} new deals")
            if deals:
                deal = deals[0]
                lead_id = deal.get('lead_id')
                # Test access
                test_response = self.session.post(f"{BASE_URL}/api/cre/convert-deal/{lead_id}", json={
                    "project_name": "TEST_CREConvert",
                    "client_name": deal.get('name', 'Test'),
                    "location": "Test",
                    "advance_amount": 5000,
                    "payment_mode": "cash",
                    "accountant_confirmed": True
                })
                assert test_response.status_code != 403, "CRE lost access to convert-deal!"
                print(f"CRE convert-deal status: {test_response.status_code}")
        else:
            print(f"Could not get CRE deals: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
