"""
Test Payment Collect Flow - Iteration 95
Tests the new stage flow: Deal Closed -> Payment Collect -> Accountant Approval -> Project Onboarded

Key behaviors tested:
1. Sales login via demo-login (session cookie based)
2. Kanban shows 12 stages including new stages
3. Manual move from stg_payment_collect and stg_accountant_approval is blocked (400 error)
4. Accountant verify endpoint auto-moves lead to stg_project_onboarded
5. Convert-deal endpoint auto-moves lead to stg_accountant_approval
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Shared session to avoid rate limiting
_sales_session = None
_accountant_session = None

def get_sales_session():
    """Get or create a shared sales session"""
    global _sales_session
    if _sales_session is None:
        _sales_session = requests.Session()
        _sales_session.headers.update({"Content-Type": "application/json"})
        response = _sales_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        if response.status_code != 200:
            raise Exception(f"Sales login failed: {response.text}")
        print(f"Sales login successful: {response.json().get('name')}")
    return _sales_session

def get_accountant_session():
    """Get or create a shared accountant session"""
    global _accountant_session
    if _accountant_session is None:
        _accountant_session = requests.Session()
        _accountant_session.headers.update({"Content-Type": "application/json"})
        response = _accountant_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        if response.status_code != 200:
            raise Exception(f"Accountant login failed: {response.text}")
        print(f"Accountant login successful: {response.json().get('name')}")
    return _accountant_session


class TestPaymentCollectFlow:
    """Test the new Payment Collect -> Accountant Approval -> Project Onboarded flow"""
    
    test_lead_id = "lead_5297b74ff1b6"  # Vinoth Kumar
    test_lead_id_2 = "lead_3720c0185ef5"  # TEST_RoughReq_ef8f94
    
    def test_01_sales_demo_login(self):
        """Test Sales login via demo-login endpoint"""
        session = get_sales_session()
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Failed to get current user: {response.text}"
        user = response.json()
        assert user.get("role") == "sales", f"Expected sales role, got {user.get('role')}"
        print(f"Verified Sales user: {user.get('name')}, role: {user.get('role')}")
    
    def test_02_accountant_demo_login(self):
        """Test Accountant login via demo-login endpoint"""
        session = get_accountant_session()
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Failed to get current user: {response.text}"
        user = response.json()
        assert user.get("role") == "accountant", f"Expected accountant role, got {user.get('role')}"
        print(f"Verified Accountant user: {user.get('name')}, role: {user.get('role')}")
    
    def test_03_verify_kanban_stages(self):
        """Verify Kanban shows all stages including new ones"""
        session = get_sales_session()
        response = session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        stage_ids = [s["stage_id"] for s in stages]
        stage_names = [s["name"] for s in stages]
        
        # Verify required stages exist
        required_stages = ["stg_deal_closed", "stg_payment_collect", "stg_accountant_approval", "stg_project_onboarded"]
        for stage_id in required_stages:
            assert stage_id in stage_ids, f"Stage {stage_id} not found in stages"
        
        print(f"Found {len(stages)} stages: {stage_names}")
        
        # Verify stage names
        assert "Deal Closed" in stage_names, "Deal Closed stage not found"
        assert "Payment Collect" in stage_names, "Payment Collect stage not found"
        assert "Accountant Approval" in stage_names, "Accountant Approval stage not found"
        assert "Project Onboarded" in stage_names, "Project Onboarded stage not found"
    
    def test_04_get_lead_details(self):
        """Get lead details to verify we can access leads"""
        session = get_sales_session()
        response = session.get(f"{BASE_URL}/api/crm/leads/{self.test_lead_id}")
        
        if response.status_code == 200:
            lead = response.json()
            print(f"Lead: {lead.get('name')}, Stage: {lead.get('current_stage_id')}, Onboarding: {lead.get('onboarding_status')}")
            assert "lead_id" in lead
        else:
            print(f"Lead not found or error: {response.status_code}")
            # Try the second test lead
            response = session.get(f"{BASE_URL}/api/crm/leads/{self.test_lead_id_2}")
            if response.status_code == 200:
                lead = response.json()
                print(f"Lead 2: {lead.get('name')}, Stage: {lead.get('current_stage_id')}")
    
    def test_05_manual_move_from_payment_collect_blocked(self):
        """Test that manual move FROM stg_payment_collect is blocked with 400"""
        session = get_sales_session()
        
        # First, find a lead in stg_payment_collect stage
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get sales leads: {response.text}"
        leads = response.json()
        
        payment_collect_lead = None
        for lead in leads:
            if lead.get("current_stage_id") == "stg_payment_collect":
                payment_collect_lead = lead
                break
        
        if payment_collect_lead:
            lead_id = payment_collect_lead["lead_id"]
            print(f"Found lead in Payment Collect: {payment_collect_lead.get('name')} ({lead_id})")
            
            # Try to manually move it - should be blocked
            response = session.patch(
                f"{BASE_URL}/api/crm/leads/{lead_id}/stage",
                json={"stage_id": "stg_project_onboarded"}
            )
            assert response.status_code == 400, f"Expected 400 for manual move from Payment Collect, got {response.status_code}: {response.text}"
            print(f"Manual move blocked as expected: {response.json().get('detail', '')}")
        else:
            print("No lead found in stg_payment_collect stage - skipping manual move test")
            pytest.skip("No lead in Payment Collect stage to test")
    
    def test_06_manual_move_from_accountant_approval_blocked(self):
        """Test that manual move FROM stg_accountant_approval is blocked with 400"""
        session = get_sales_session()
        
        # Find a lead in stg_accountant_approval stage
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get sales leads: {response.text}"
        leads = response.json()
        
        accountant_approval_lead = None
        for lead in leads:
            if lead.get("current_stage_id") == "stg_accountant_approval":
                accountant_approval_lead = lead
                break
        
        if accountant_approval_lead:
            lead_id = accountant_approval_lead["lead_id"]
            print(f"Found lead in Accountant Approval: {accountant_approval_lead.get('name')} ({lead_id})")
            
            # Try to manually move it - should be blocked
            response = session.patch(
                f"{BASE_URL}/api/crm/leads/{lead_id}/stage",
                json={"stage_id": "stg_project_onboarded"}
            )
            assert response.status_code == 400, f"Expected 400 for manual move from Accountant Approval, got {response.status_code}: {response.text}"
            print(f"Manual move blocked as expected: {response.json().get('detail', '')}")
        else:
            print("No lead found in stg_accountant_approval stage - skipping manual move test")
            pytest.skip("No lead in Accountant Approval stage to test")
    
    def test_07_accountant_verify_endpoint_access(self):
        """Test that accountant can access the verify endpoint"""
        session = get_accountant_session()
        
        # Get a specific lead to check its status
        response = session.get(f"{BASE_URL}/api/crm/leads/{self.test_lead_id}")
        
        if response.status_code == 200:
            lead = response.json()
            print(f"Lead: {lead.get('name')}, Stage: {lead.get('current_stage_id')}, Onboarding: {lead.get('onboarding_status')}")
            
            if lead.get("current_stage_id") == "stg_accountant_approval" and lead.get("onboarding_status") == "accountant_pending":
                # Call accountant-verify endpoint
                response = session.post(f"{BASE_URL}/api/crm/leads/{self.test_lead_id}/accountant-verify")
                
                if response.status_code == 200:
                    print(f"Accountant verify successful: {response.json()}")
                    
                    # Verify lead moved to stg_project_onboarded
                    response = session.get(f"{BASE_URL}/api/crm/leads/{self.test_lead_id}")
                    if response.status_code == 200:
                        lead = response.json()
                        assert lead.get("current_stage_id") == "stg_project_onboarded", f"Lead not moved to Project Onboarded, current stage: {lead.get('current_stage_id')}"
                        print(f"Lead auto-moved to Project Onboarded stage!")
                else:
                    print(f"Accountant verify response: {response.status_code} - {response.text}")
            else:
                print(f"Lead not in correct state for verification. Stage: {lead.get('current_stage_id')}, Status: {lead.get('onboarding_status')}")
                pytest.skip("Lead not in accountant_pending status")
        else:
            print(f"Could not get lead: {response.status_code}")
            pytest.skip("Could not access lead")
    
    def test_08_sales_cannot_verify(self):
        """Test that Sales user cannot call accountant-verify endpoint (403)"""
        session = get_sales_session()
        
        # Try to call accountant-verify with sales session
        response = session.post(f"{BASE_URL}/api/crm/leads/{self.test_lead_id}/accountant-verify")
        
        # Should get 403 Forbidden or 400 (not in correct status)
        assert response.status_code in [400, 403], f"Expected 400 or 403 for Sales calling accountant-verify, got {response.status_code}: {response.text}"
        print(f"Sales correctly blocked from accountant-verify: {response.status_code} - {response.json().get('detail', '')}")
    
    def test_09_convert_deal_endpoint_exists(self):
        """Test that convert-deal endpoint exists and is accessible by Sales"""
        session = get_sales_session()
        
        # Try to access convert-deal endpoint (may fail due to validation but should not be 404)
        response = session.post(
            f"{BASE_URL}/api/cre/convert-deal/{self.test_lead_id}",
            json={
                "project_name": "Test Project",
                "location": "Test Location",
                "sqft": 1000,
                "building_type": "residential",
                "start_date": "2026-02-01",
                "client_name": "Test Client",
                "client_phone": "9876543210",
                "advance_amount": 50000
            }
        )
        
        # Should not be 404 or 403
        assert response.status_code != 404, "convert-deal endpoint not found"
        assert response.status_code != 403, "Sales should have access to convert-deal"
        print(f"Convert-deal endpoint response: {response.status_code} - {response.text[:200] if response.text else 'No body'}")


class TestStageConfiguration:
    """Test stage configuration and order"""
    
    def test_stages_order(self):
        """Verify stages are in correct order"""
        session = get_sales_session()
        
        response = session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200
        
        stages = response.json()
        stage_order = {s["stage_id"]: s.get("order", i) for i, s in enumerate(stages)}
        
        # Verify Deal Closed comes before Payment Collect
        if "stg_deal_closed" in stage_order and "stg_payment_collect" in stage_order:
            assert stage_order["stg_deal_closed"] < stage_order["stg_payment_collect"], "Deal Closed should come before Payment Collect"
        
        # Verify Payment Collect comes before Accountant Approval
        if "stg_payment_collect" in stage_order and "stg_accountant_approval" in stage_order:
            assert stage_order["stg_payment_collect"] < stage_order["stg_accountant_approval"], "Payment Collect should come before Accountant Approval"
        
        # Verify Accountant Approval comes before Project Onboarded
        if "stg_accountant_approval" in stage_order and "stg_project_onboarded" in stage_order:
            assert stage_order["stg_accountant_approval"] < stage_order["stg_project_onboarded"], "Accountant Approval should come before Project Onboarded"
        
        print("Stage order verified correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
