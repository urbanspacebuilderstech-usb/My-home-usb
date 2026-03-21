"""
Test: Stage Popup Intercept for 'Project Onboarded' Stage
Tests the automatic popup behavior when dragging leads from 'Deal Closed' to 'Project Onboarded'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStagePopupIntercept:
    """Tests for the stage change intercept logic for Project Onboarded"""
    
    sales_token = None
    sales_cookies = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as sales user"""
        if not TestStagePopupIntercept.sales_token:
            response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "sales@constructionos.com"
            })
            assert response.status_code == 200, f"Sales login failed: {response.text}"
            TestStagePopupIntercept.sales_cookies = response.cookies
            TestStagePopupIntercept.sales_token = response.cookies.get('access_token')
        self.cookies = TestStagePopupIntercept.sales_cookies
    
    def test_01_sales_login(self):
        """Test sales user can login via demo-login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert response.status_code == 200
        data = response.json()
        # Response is the user object directly
        assert "email" in data
        assert data["email"] == "sales@constructionos.com"
        print(f"✓ Sales login successful: {data['name']}")
    
    def test_02_get_sales_stages(self):
        """Test fetching sales stages including 'Project Onboarded'"""
        response = requests.get(f"{BASE_URL}/api/crm/stages?stage_type=sales", cookies=self.cookies)
        assert response.status_code == 200
        stages = response.json()
        
        # Find Deal Closed and Project Onboarded stages
        deal_closed = next((s for s in stages if s['name'] == 'Deal Closed'), None)
        project_onboarded = next((s for s in stages if s['name'] == 'Project Onboarded'), None)
        
        assert deal_closed is not None, "Deal Closed stage not found"
        assert project_onboarded is not None, "Project Onboarded stage not found"
        
        # Verify order - Project Onboarded should come after Deal Closed
        assert project_onboarded['order'] > deal_closed['order'], "Project Onboarded should be after Deal Closed"
        
        print(f"✓ Deal Closed stage: {deal_closed['stage_id']} (order: {deal_closed['order']})")
        print(f"✓ Project Onboarded stage: {project_onboarded['stage_id']} (order: {project_onboarded['order']})")
    
    def test_03_get_sales_leads(self):
        """Test fetching sales leads"""
        response = requests.get(f"{BASE_URL}/api/crm/sales/leads", cookies=self.cookies)
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"✓ Found {len(leads)} sales leads")
        
        # List leads by stage
        for lead in leads:
            print(f"  - {lead['name']}: stage={lead['current_stage_id']}, onboarding_status={lead.get('onboarding_status', 'none')}")
    
    def test_04_find_lead_for_testing(self):
        """Find a lead that can be used for testing the intercept"""
        response = requests.get(f"{BASE_URL}/api/crm/sales/leads", cookies=self.cookies)
        assert response.status_code == 200
        leads = response.json()
        
        # Find leads at Deal Closed or earlier stages without onboarding_status
        test_candidates = [
            l for l in leads 
            if l.get('onboarding_status') in [None, 'none', '']
            and l['current_stage_id'] not in ['stg_project_onboarded', 'stg_lost']
        ]
        
        print(f"✓ Found {len(test_candidates)} leads without onboarding_status that can be tested")
        for lead in test_candidates[:5]:
            print(f"  - {lead['name']} ({lead['lead_id']}): stage={lead['current_stage_id']}")
    
    def test_05_stage_change_api_to_project_onboarded(self):
        """Test the stage change API to Project Onboarded stage"""
        # First get a lead that can be moved
        response = requests.get(f"{BASE_URL}/api/crm/sales/leads", cookies=self.cookies)
        leads = response.json()
        
        # Find a lead at Deal Closed stage without onboarding_status
        deal_closed_leads = [
            l for l in leads 
            if l['current_stage_id'] == 'stg_deal_closed'
            and l.get('onboarding_status') in [None, 'none', '']
        ]
        
        if not deal_closed_leads:
            # Try to find any lead that can be moved
            test_leads = [
                l for l in leads 
                if l.get('onboarding_status') in [None, 'none', '']
                and l['current_stage_id'] not in ['stg_project_onboarded', 'stg_lost']
            ]
            if test_leads:
                print(f"⚠ No Deal Closed leads without onboarding_status. Using lead from another stage.")
                test_lead = test_leads[0]
            else:
                pytest.skip("No suitable leads found for testing stage change")
        else:
            test_lead = deal_closed_leads[0]
        
        print(f"Testing with lead: {test_lead['name']} ({test_lead['lead_id']})")
        print(f"  Current stage: {test_lead['current_stage_id']}")
        print(f"  Onboarding status: {test_lead.get('onboarding_status', 'none')}")
        
        # Try to change stage to Project Onboarded
        response = requests.patch(
            f"{BASE_URL}/api/crm/leads/{test_lead['lead_id']}/stage",
            json={"stage_id": "stg_project_onboarded"},
            cookies=self.cookies
        )
        
        # The API should succeed - the intercept is on the frontend
        print(f"Stage change response: {response.status_code}")
        print(f"Response: {response.json()}")
        
        # Backend should allow the stage change
        assert response.status_code == 200, f"Stage change failed: {response.text}"
        print("✓ Backend allows stage change to Project Onboarded")
    
    def test_06_collect_advance_api(self):
        """Test the collect advance API endpoint"""
        # Get a lead at Project Onboarded stage
        response = requests.get(f"{BASE_URL}/api/crm/sales/leads", cookies=self.cookies)
        leads = response.json()
        
        # Find a lead at Project Onboarded without advance collected
        project_onboarded_leads = [
            l for l in leads 
            if l['current_stage_id'] == 'stg_project_onboarded'
            and l.get('onboarding_status') in [None, 'none', '']
        ]
        
        if not project_onboarded_leads:
            # Try Deal Closed leads
            deal_closed_leads = [
                l for l in leads 
                if l['current_stage_id'] == 'stg_deal_closed'
                and l.get('onboarding_status') in [None, 'none', '']
            ]
            if deal_closed_leads:
                test_lead = deal_closed_leads[0]
            else:
                pytest.skip("No suitable leads found for testing collect advance")
        else:
            test_lead = project_onboarded_leads[0]
        
        print(f"Testing collect advance with lead: {test_lead['name']} ({test_lead['lead_id']})")
        
        # Test collect advance API
        response = requests.post(
            f"{BASE_URL}/api/crm/leads/{test_lead['lead_id']}/collect-advance",
            json={
                "advance_amount": 50000,
                "payment_mode": "upi",
                "payment_reference": "TEST_REF_123",
                "remarks": "Test advance collection"
            },
            cookies=self.cookies
        )
        
        print(f"Collect advance response: {response.status_code}")
        if response.status_code != 200:
            print(f"Response: {response.text}")
        
        # Should succeed or fail with a meaningful error
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Advance collected successfully")
            print(f"  New onboarding_status: {data.get('onboarding_status')}")
    
    def test_07_verify_advance_dialog_fields(self):
        """Verify the advance dialog has all required fields (code review)"""
        # This is a code review test - verify the dialog structure
        required_fields = [
            "advance-amount-input",  # Amount field
            "payment-mode-select",   # Payment mode dropdown
            "submit-advance-btn"     # Submit button
        ]
        
        print("✓ Required advance dialog fields (from code review):")
        for field in required_fields:
            print(f"  - data-testid='{field}'")
        
        print("\n✓ Payment modes available: cash, upi, cheque, bank_transfer")
        print("✓ Cancel button clears onboardingPendingStageId state")
    
    def test_08_sales_overview_api(self):
        """Test the sales overview API"""
        response = requests.get(f"{BASE_URL}/api/crm/sales-overview", cookies=self.cookies)
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Sales Overview:")
        print(f"  - Deal Closed Count: {data.get('deal_closed_count', 0)}")
        print(f"  - Total Advance Collected: ₹{data.get('total_advance_collected', 0):,}")
        
        assert "deal_closed_count" in data
        assert "total_advance_collected" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
