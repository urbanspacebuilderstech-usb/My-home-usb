"""
Test Sales Board 16 Stages, Stage Intercepts, Phone Masking, and Auto-Blocks
Tests for:
1. GET /api/crm/sales/stages returns 16 stages in correct order
2. PATCH /api/crm/leads/{id}/stage with remark field for Discussion/Deal Closed/RE-To Client
3. PATCH /api/crm/leads/{id}/stage with lost_reason for Lost stage
4. PATCH /api/crm/leads/{id}/stage blocks for Project Onboarded and RE-From Planning
5. Phone masking - sales user sees full phone, accountant sees masked
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSalesBoardStages:
    """Test Sales Board 16 stages configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with sales user login"""
        self.session = requests.Session()
        # Login as sales user
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert login_res.status_code == 200, f"Sales login failed: {login_res.text}"
        self.sales_user = login_res.json()
        print(f"Logged in as Sales: {self.sales_user.get('name', 'Unknown')}")
        yield
        # Logout
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def test_sales_stages_returns_16_stages(self):
        """Verify GET /api/crm/sales/stages returns exactly 16 stages"""
        res = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "sales"})
        assert res.status_code == 200, f"Failed to get stages: {res.text}"
        
        stages = res.json()
        assert len(stages) == 16, f"Expected 16 stages, got {len(stages)}"
        print(f"PASS: Got {len(stages)} sales stages")
        
        # Verify stage names in order
        expected_stages = [
            "New Appointment", "Follow-up", "Discussion", "Site Visit",
            "Site Visit (Client Land)", "Site Visit (Our Projects)", "Site Visit Done",
            "Rough Estimate Requested", "RE - From Planning", "RE - To Client",
            "Negotiation", "Deal Closed", "Payment Collect", "Accountant Approval",
            "Project Onboarded", "Lost"
        ]
        
        actual_names = [s["name"] for s in stages]
        for i, expected_name in enumerate(expected_stages):
            assert actual_names[i] == expected_name, f"Stage {i+1}: expected '{expected_name}', got '{actual_names[i]}'"
        
        print(f"PASS: All 16 stages in correct order: {actual_names}")
    
    def test_sales_stages_order_values(self):
        """Verify stages have correct order values 1-16"""
        res = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "sales"})
        assert res.status_code == 200
        
        stages = res.json()
        orders = [s["order"] for s in stages]
        expected_orders = list(range(1, 17))
        
        assert orders == expected_orders, f"Expected orders {expected_orders}, got {orders}"
        print(f"PASS: Stage orders are correct: {orders}")
    
    def test_sales_stages_final_flags(self):
        """Verify Project Onboarded and Lost are marked as final stages"""
        res = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "sales"})
        assert res.status_code == 200
        
        stages = res.json()
        final_stages = [s["name"] for s in stages if s.get("is_final")]
        
        assert "Project Onboarded" in final_stages, "Project Onboarded should be final"
        assert "Lost" in final_stages, "Lost should be final"
        print(f"PASS: Final stages: {final_stages}")


class TestStageIntercepts:
    """Test stage move intercepts for Discussion, Deal Closed, Lost, RE-To Client"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with sales user login"""
        self.session = requests.Session()
        # Login as sales user
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert login_res.status_code == 200, f"Sales login failed: {login_res.text}"
        yield
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def get_test_lead(self):
        """Get a test lead from Follow-up stage"""
        res = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert res.status_code == 200
        leads = res.json()
        
        # Find a lead in Follow-up stage
        followup_leads = [l for l in leads if l.get("current_stage_id") == "stg_sales_followup"]
        if followup_leads:
            return followup_leads[0]
        
        # Fallback: any lead not in final stages
        non_final = [l for l in leads if l.get("current_stage_id") not in ["stg_project_onboarded", "stg_lost"]]
        if non_final:
            return non_final[0]
        
        pytest.skip("No suitable test lead found")
    
    def test_move_to_discussion_with_remark(self):
        """Test moving lead to Discussion stage with remark"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        original_stage = lead["current_stage_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {original_stage})")
        
        # Move to Discussion with remark
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_discussion",
            "remark": "TEST_REMARK: Initial discussion about project requirements"
        })
        
        assert res.status_code == 200, f"Failed to move to Discussion: {res.text}"
        print(f"PASS: Lead moved to Discussion with remark")
        
        # Verify remark was stored
        lead_res = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_res.status_code == 200
        updated_lead = lead_res.json()
        
        assert updated_lead.get("current_stage_id") == "stg_discussion", "Lead not in Discussion stage"
        remarks = updated_lead.get("remarks", [])
        assert len(remarks) > 0, "No remarks stored on lead"
        
        latest_remark = remarks[-1]
        assert "TEST_REMARK" in latest_remark.get("text", ""), f"Remark not stored correctly: {latest_remark}"
        print(f"PASS: Remark stored on lead: {latest_remark['text'][:50]}...")
        
        # Move back to Follow-up for cleanup
        self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": original_stage
        })
    
    def test_move_to_lost_requires_reason(self):
        """Test moving lead to Lost stage requires lost_reason"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        original_stage = lead["current_stage_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {original_stage})")
        
        # Move to Lost with lost_reason
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_lost",
            "lost_reason": "TEST_LOST: Budget constraints - client cannot proceed"
        })
        
        assert res.status_code == 200, f"Failed to move to Lost: {res.text}"
        print(f"PASS: Lead moved to Lost with reason")
        
        # Verify lost_reason was stored
        lead_res = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_res.status_code == 200
        updated_lead = lead_res.json()
        
        assert updated_lead.get("current_stage_id") == "stg_lost", "Lead not in Lost stage"
        assert "TEST_LOST" in updated_lead.get("lost_reason", ""), f"Lost reason not stored: {updated_lead.get('lost_reason')}"
        print(f"PASS: Lost reason stored: {updated_lead.get('lost_reason')}")
        
        # Move back for cleanup
        self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": original_stage
        })
    
    def test_move_to_deal_closed_with_remark(self):
        """Test moving lead to Deal Closed stage with remark"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        original_stage = lead["current_stage_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {original_stage})")
        
        # Move to Deal Closed with remark
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_deal_closed",
            "remark": "TEST_DEAL_CLOSED: Client agreed to terms, ready for payment"
        })
        
        assert res.status_code == 200, f"Failed to move to Deal Closed: {res.text}"
        print(f"PASS: Lead moved to Deal Closed with remark")
        
        # Verify remark was stored
        lead_res = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_res.status_code == 200
        updated_lead = lead_res.json()
        
        assert updated_lead.get("current_stage_id") == "stg_deal_closed", "Lead not in Deal Closed stage"
        remarks = updated_lead.get("remarks", [])
        deal_remarks = [r for r in remarks if "TEST_DEAL_CLOSED" in r.get("text", "")]
        assert len(deal_remarks) > 0, "Deal Closed remark not stored"
        print(f"PASS: Deal Closed remark stored")
        
        # Move back for cleanup
        self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": original_stage
        })
    
    def test_move_to_re_to_client_with_remark(self):
        """Test moving lead to RE-To Client stage with remark"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        original_stage = lead["current_stage_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {original_stage})")
        
        # Move to RE-To Client with remark
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_re_to_client",
            "remark": "TEST_RE_TO_CLIENT: Sent RE document via email"
        })
        
        assert res.status_code == 200, f"Failed to move to RE-To Client: {res.text}"
        print(f"PASS: Lead moved to RE-To Client with remark")
        
        # Verify remark was stored
        lead_res = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_res.status_code == 200
        updated_lead = lead_res.json()
        
        assert updated_lead.get("current_stage_id") == "stg_re_to_client", "Lead not in RE-To Client stage"
        remarks = updated_lead.get("remarks", [])
        re_remarks = [r for r in remarks if "TEST_RE_TO_CLIENT" in r.get("text", "")]
        assert len(re_remarks) > 0, "RE-To Client remark not stored"
        print(f"PASS: RE-To Client remark stored")
        
        # Move back for cleanup
        self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": original_stage
        })


class TestAutoBlocks:
    """Test auto-blocked stages: Project Onboarded and RE-From Planning"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with sales user login"""
        self.session = requests.Session()
        # Login as sales user
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert login_res.status_code == 200, f"Sales login failed: {login_res.text}"
        yield
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def get_test_lead(self):
        """Get a test lead not in final stages"""
        res = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert res.status_code == 200
        leads = res.json()
        
        non_final = [l for l in leads if l.get("current_stage_id") not in ["stg_project_onboarded", "stg_lost", "stg_payment_collect", "stg_accountant_approval"]]
        if non_final:
            return non_final[0]
        
        pytest.skip("No suitable test lead found")
    
    def test_block_manual_move_to_project_onboarded(self):
        """Test that manual move to Project Onboarded is blocked"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {lead['current_stage_id']})")
        
        # Try to move to Project Onboarded
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_project_onboarded"
        })
        
        assert res.status_code == 400, f"Expected 400 error, got {res.status_code}: {res.text}"
        error_detail = res.json().get("detail", "")
        assert "auto-moved" in error_detail.lower() or "accountant" in error_detail.lower(), f"Unexpected error: {error_detail}"
        print(f"PASS: Manual move to Project Onboarded blocked: {error_detail}")
    
    def test_block_manual_move_to_re_from_planning(self):
        """Test that manual move to RE-From Planning is blocked"""
        lead = self.get_test_lead()
        lead_id = lead["lead_id"]
        
        print(f"Testing lead: {lead['name']} (current stage: {lead['current_stage_id']})")
        
        # Try to move to RE-From Planning
        res = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_re_from_planning"
        })
        
        assert res.status_code == 400, f"Expected 400 error, got {res.status_code}: {res.text}"
        error_detail = res.json().get("detail", "")
        assert "auto" in error_detail.lower() or "gm" in error_detail.lower(), f"Unexpected error: {error_detail}"
        print(f"PASS: Manual move to RE-From Planning blocked: {error_detail}")


class TestPhoneMasking:
    """Test phone number masking based on user role"""
    
    def test_sales_user_sees_full_phone(self):
        """Sales user should see full phone numbers"""
        session = requests.Session()
        
        # Login as sales user
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert login_res.status_code == 200, f"Sales login failed: {login_res.text}"
        
        # Get leads
        res = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert res.status_code == 200
        leads = res.json()
        
        # Find a lead with phone number
        leads_with_phone = [l for l in leads if l.get("phone") and len(l.get("phone", "")) > 4]
        if not leads_with_phone:
            pytest.skip("No leads with phone numbers found")
        
        lead = leads_with_phone[0]
        phone = lead.get("phone", "")
        
        # Sales user should see full phone (no asterisks in middle)
        # Full phone should not have asterisks pattern like "91****23"
        has_asterisks = "*" in phone[2:-2] if len(phone) > 4 else False
        assert not has_asterisks, f"Sales user sees masked phone: {phone}"
        print(f"PASS: Sales user sees full phone: {phone}")
        
        session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_accountant_sees_masked_phone(self):
        """Accountant user should see masked phone numbers"""
        session = requests.Session()
        
        # Login as accountant user
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        if login_res.status_code != 200:
            pytest.skip("Accountant user not available for testing")
        
        # Get leads - accountant may not have access to sales leads
        # Try CRE board or other endpoint
        res = session.get(f"{BASE_URL}/api/cre/leads")
        
        if res.status_code == 403:
            # Accountant doesn't have access to CRE leads, try another endpoint
            res = session.get(f"{BASE_URL}/api/crm/sales/leads")
        
        if res.status_code != 200:
            session.post(f"{BASE_URL}/api/auth/logout")
            pytest.skip("Accountant cannot access leads endpoint")
        
        leads = res.json()
        leads_with_phone = [l for l in leads if l.get("phone") and len(l.get("phone", "")) > 4]
        
        if not leads_with_phone:
            session.post(f"{BASE_URL}/api/auth/logout")
            pytest.skip("No leads with phone numbers found")
        
        lead = leads_with_phone[0]
        phone = lead.get("phone", "")
        
        # Accountant should see masked phone (asterisks in middle)
        has_asterisks = "*" in phone
        assert has_asterisks, f"Accountant sees unmasked phone: {phone}"
        print(f"PASS: Accountant sees masked phone: {phone}")
        
        session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_pre_sales_user_sees_full_phone(self):
        """Pre-Sales user should see full phone numbers"""
        session = requests.Session()
        
        # Login as pre-sales user
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "presales@constructionos.com"
        })
        assert login_res.status_code == 200, f"Pre-Sales login failed: {login_res.text}"
        
        # Get pre-sales leads
        res = session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert res.status_code == 200
        leads = res.json()
        
        leads_with_phone = [l for l in leads if l.get("phone") and len(l.get("phone", "")) > 4]
        if not leads_with_phone:
            session.post(f"{BASE_URL}/api/auth/logout")
            pytest.skip("No leads with phone numbers found")
        
        lead = leads_with_phone[0]
        phone = lead.get("phone", "")
        
        # Pre-Sales user should see full phone
        has_asterisks = "*" in phone[2:-2] if len(phone) > 4 else False
        assert not has_asterisks, f"Pre-Sales user sees masked phone: {phone}"
        print(f"PASS: Pre-Sales user sees full phone: {phone}")
        
        session.post(f"{BASE_URL}/api/auth/logout")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
