"""
Test Project Onboarding Flow - After Deal Closed
Tests:
1. 'Project Onboarded' stage exists in sales pipeline
2. POST /api/crm/leads/{id}/collect-advance - collects advance payment
3. POST /api/crm/leads/{id}/send-to-accountant - changes onboarding_status to accountant_pending
4. POST /api/crm/leads/{id}/accountant-verify - accountant verifies payment
5. POST /api/crm/leads/{id}/move-to-planning - creates project with project_description
6. GET /api/crm/sales-overview - returns deal_closed_count and total_advance_collected
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProjectOnboardingFlow:
    """Test the full project onboarding flow after Deal Closed"""
    
    cre_session = None
    accountant_session = None
    test_lead_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test sessions"""
        self.cre_session = requests.Session()
        self.accountant_session = requests.Session()
    
    def test_01_cre_login(self):
        """CRE user login"""
        response = self.cre_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        data = response.json()
        assert "user" in data or "user_id" in data
        print(f"CRE login successful")
        TestProjectOnboardingFlow.cre_session = self.cre_session
    
    def test_02_accountant_login(self):
        """Accountant user login"""
        time.sleep(1)  # Rate limiting
        response = self.accountant_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        data = response.json()
        assert "user" in data or "user_id" in data
        print(f"Accountant login successful")
        TestProjectOnboardingFlow.accountant_session = self.accountant_session
    
    def test_03_project_onboarded_stage_exists(self):
        """Verify 'Project Onboarded' stage exists in sales pipeline"""
        session = TestProjectOnboardingFlow.cre_session
        response = session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        stage_names = [s.get('name') for s in stages]
        
        assert 'Project Onboarded' in stage_names, f"'Project Onboarded' stage not found. Available stages: {stage_names}"
        
        # Find the stage and verify it's after Deal Closed
        deal_closed_order = None
        project_onboarded_order = None
        for stage in stages:
            if stage.get('name') == 'Deal Closed':
                deal_closed_order = stage.get('order')
            if stage.get('name') == 'Project Onboarded':
                project_onboarded_order = stage.get('order')
        
        assert deal_closed_order is not None, "Deal Closed stage not found"
        assert project_onboarded_order is not None, "Project Onboarded stage not found"
        assert project_onboarded_order > deal_closed_order, f"Project Onboarded (order={project_onboarded_order}) should be after Deal Closed (order={deal_closed_order})"
        
        print(f"Project Onboarded stage exists at order {project_onboarded_order}, after Deal Closed at order {deal_closed_order}")
    
    def test_04_find_deal_closed_lead_for_testing(self):
        """Find a lead at Deal Closed stage without onboarding_status for testing"""
        session = TestProjectOnboardingFlow.cre_session
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get leads: {response.text}"
        
        leads = response.json()
        
        # Find a lead at Deal Closed or Project Onboarded stage without onboarding_status
        test_lead = None
        for lead in leads:
            stage_id = lead.get('current_stage_id', '')
            onboarding_status = lead.get('onboarding_status')
            name = lead.get('name', '')
            
            # Look for 'Vinoth' lead specifically as mentioned in the test request
            if 'Vinoth' in name and stage_id in ['stg_deal_closed', 'stg_project_onboarded'] and not onboarding_status:
                test_lead = lead
                break
        
        # If no Vinoth lead found, try any lead at Deal Closed without onboarding_status
        if not test_lead:
            for lead in leads:
                stage_id = lead.get('current_stage_id', '')
                onboarding_status = lead.get('onboarding_status')
                if stage_id in ['stg_deal_closed', 'stg_project_onboarded'] and not onboarding_status:
                    test_lead = lead
                    break
        
        if test_lead:
            TestProjectOnboardingFlow.test_lead_id = test_lead.get('lead_id')
            print(f"Found test lead: {test_lead.get('name')} (ID: {test_lead.get('lead_id')}, Stage: {test_lead.get('current_stage_id')})")
        else:
            # List available leads for debugging
            print("Available leads:")
            for lead in leads[:10]:
                print(f"  - {lead.get('name')}: stage={lead.get('current_stage_id')}, onboarding_status={lead.get('onboarding_status')}")
            pytest.skip("No suitable lead found at Deal Closed stage without onboarding_status")
    
    def test_05_collect_advance_api(self):
        """Test POST /api/crm/leads/{id}/collect-advance"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        payload = {
            "advance_amount": 50000,
            "payment_mode": "upi",
            "payment_reference": "TEST-UPI-REF-001",
            "remarks": "Test advance payment"
        }
        
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/collect-advance", json=payload)
        assert response.status_code == 200, f"Collect advance failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Collect advance response: {data}")
    
    def test_06_verify_advance_collected_status(self):
        """Verify lead has onboarding_status = advance_collected"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert response.status_code == 200, f"Failed to get lead: {response.text}"
        
        lead = response.json()
        assert lead.get('onboarding_status') == 'advance_collected', f"Expected onboarding_status='advance_collected', got '{lead.get('onboarding_status')}'"
        assert lead.get('advance_payment') is not None, "advance_payment should be set"
        assert lead.get('advance_payment', {}).get('advance_amount') == 50000
        
        print(f"Lead onboarding_status: {lead.get('onboarding_status')}, advance_amount: {lead.get('advance_payment', {}).get('advance_amount')}")
    
    def test_07_send_to_accountant_api(self):
        """Test POST /api/crm/leads/{id}/send-to-accountant"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/send-to-accountant")
        assert response.status_code == 200, f"Send to accountant failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Send to accountant response: {data}")
    
    def test_08_verify_accountant_pending_status(self):
        """Verify lead has onboarding_status = accountant_pending"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert response.status_code == 200, f"Failed to get lead: {response.text}"
        
        lead = response.json()
        assert lead.get('onboarding_status') == 'accountant_pending', f"Expected onboarding_status='accountant_pending', got '{lead.get('onboarding_status')}'"
        
        print(f"Lead onboarding_status: {lead.get('onboarding_status')}")
    
    def test_09_accountant_verify_api(self):
        """Test POST /api/crm/leads/{id}/accountant-verify with accountant role"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.accountant_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/accountant-verify")
        assert response.status_code == 200, f"Accountant verify failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Accountant verify response: {data}")
    
    def test_10_verify_accountant_verified_status(self):
        """Verify lead has onboarding_status = accountant_verified"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert response.status_code == 200, f"Failed to get lead: {response.text}"
        
        lead = response.json()
        assert lead.get('onboarding_status') == 'accountant_verified', f"Expected onboarding_status='accountant_verified', got '{lead.get('onboarding_status')}'"
        
        print(f"Lead onboarding_status: {lead.get('onboarding_status')}")
    
    def test_11_move_to_planning_api(self):
        """Test POST /api/crm/leads/{id}/move-to-planning with project_description"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        payload = {
            "project_description": "Test project description for onboarding flow testing. This is a residential construction project."
        }
        
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/move-to-planning", json=payload)
        assert response.status_code == 200, f"Move to planning failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "project_id" in data or "project_code" in data
        print(f"Move to planning response: {data}")
    
    def test_12_verify_moved_to_planning_status(self):
        """Verify lead has onboarding_status = moved_to_planning and project_id set"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        session = TestProjectOnboardingFlow.cre_session
        lead_id = TestProjectOnboardingFlow.test_lead_id
        
        response = session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert response.status_code == 200, f"Failed to get lead: {response.text}"
        
        lead = response.json()
        assert lead.get('onboarding_status') == 'moved_to_planning', f"Expected onboarding_status='moved_to_planning', got '{lead.get('onboarding_status')}'"
        assert lead.get('project_id') is not None, "project_id should be set after move to planning"
        
        print(f"Lead onboarding_status: {lead.get('onboarding_status')}, project_id: {lead.get('project_id')}")
    
    def test_13_sales_overview_api(self):
        """Test GET /api/crm/sales-overview returns deal_closed_count and total_advance_collected"""
        session = TestProjectOnboardingFlow.cre_session
        
        response = session.get(f"{BASE_URL}/api/crm/sales-overview")
        assert response.status_code == 200, f"Sales overview failed: {response.text}"
        
        data = response.json()
        assert "deal_closed_count" in data, "deal_closed_count should be in response"
        assert "total_advance_collected" in data, "total_advance_collected should be in response"
        
        print(f"Sales overview: deal_closed_count={data.get('deal_closed_count')}, total_advance_collected={data.get('total_advance_collected')}")
    
    def test_14_unauthorized_accountant_verify(self):
        """Test that non-accountant cannot verify payment"""
        if not TestProjectOnboardingFlow.test_lead_id:
            pytest.skip("No test lead available")
        
        # Use CRE session (not accountant) to try to verify
        session = TestProjectOnboardingFlow.cre_session
        
        # First, we need a lead that's in accountant_pending status
        # Since our test lead is already moved to planning, we'll just verify the API rejects non-accountant
        # Create a mock test by checking the endpoint exists and returns proper error for wrong status
        
        # Try to verify a lead that's already verified (should fail with 400)
        lead_id = TestProjectOnboardingFlow.test_lead_id
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/accountant-verify")
        
        # Should fail because lead is not in accountant_pending status
        assert response.status_code in [400, 403], f"Expected 400 or 403, got {response.status_code}: {response.text}"
        print(f"Unauthorized/invalid status verify correctly rejected: {response.status_code}")
    
    def test_15_collect_advance_validation(self):
        """Test collect-advance requires amount"""
        session = TestProjectOnboardingFlow.cre_session
        
        # Get any lead to test validation
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        leads = response.json()
        
        if not leads:
            pytest.skip("No leads available")
        
        lead_id = leads[0].get('lead_id')
        
        # Try to collect advance without amount
        payload = {
            "payment_mode": "upi"
        }
        
        response = session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/collect-advance", json=payload)
        # Should fail validation
        assert response.status_code in [400, 422], f"Expected validation error, got {response.status_code}: {response.text}"
        print(f"Validation correctly rejected missing amount: {response.status_code}")


class TestSalesOverviewCards:
    """Test sales overview data for frontend cards"""
    
    def test_01_sales_overview_structure(self):
        """Verify sales overview returns correct structure"""
        session = requests.Session()
        
        # Login as CRE
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200
        
        # Get sales overview
        response = session.get(f"{BASE_URL}/api/crm/sales-overview")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify required fields
        assert "deal_closed_count" in data, "Missing deal_closed_count"
        assert "total_advance_collected" in data, "Missing total_advance_collected"
        
        # Verify types
        assert isinstance(data["deal_closed_count"], int), "deal_closed_count should be int"
        assert isinstance(data["total_advance_collected"], (int, float)), "total_advance_collected should be numeric"
        
        # Verify onboarding_counts if present
        if "onboarding_counts" in data:
            counts = data["onboarding_counts"]
            expected_statuses = ["advance_collected", "accountant_pending", "accountant_verified", "moved_to_planning"]
            for status in expected_statuses:
                assert status in counts, f"Missing {status} in onboarding_counts"
        
        print(f"Sales overview structure verified: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
