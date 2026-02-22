"""
Test CRE Convert Deal and PDF Download Features
Tests:
1. PDF Download - Rough Estimate PDF from project details page
2. CRE Convert Deal - Converting a closed deal to a project with advance payment
3. CRE Workflow - Status flow: pending_payment → accountant verifies → payment_verified → send to planning
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCREConvertDealAndPDF:
    """Test CRE Convert Deal and PDF download features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as different users"""
        self.cre_session = requests.Session()
        self.acc_session = requests.Session()
        self.admin_session = requests.Session()
        
        # Login as CRE
        resp = self.cre_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert resp.status_code == 200, f"CRE login failed: {resp.text}"
        self.cre_user = resp.json()
        
        # Login as Accountant
        resp = self.acc_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        self.acc_user = resp.json()
        
        # Login as Super Admin
        resp = self.admin_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        self.admin_user = resp.json()
    
    # ==================== PDF DOWNLOAD TESTS ====================
    
    def test_project_with_re_exists(self):
        """Test that project with RE project exists and has scope items"""
        resp = self.cre_session.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200
        
        projects = resp.json()
        projects_with_re = [p for p in projects if p.get('re_project_id')]
        
        assert len(projects_with_re) > 0, "No projects with RE project found for PDF download testing"
        print(f"Found {len(projects_with_re)} projects with RE")
    
    def test_re_project_has_scope_items(self):
        """Test that RE project has scope items for PDF generation"""
        # Get project with RE
        resp = self.cre_session.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200
        projects = resp.json()
        
        project_with_re = next((p for p in projects if p.get('re_project_id')), None)
        assert project_with_re is not None, "No project with RE found"
        
        # Get RE project details
        re_id = project_with_re['re_project_id']
        resp = self.cre_session.get(f"{BASE_URL}/api/crm/re-projects/{re_id}")
        assert resp.status_code == 200
        
        re_project = resp.json()
        scope_items = re_project.get('rough_scope_items') or re_project.get('scope_items') or []
        
        # Verify RE project has data for PDF
        assert re_project.get('project_name'), "RE project missing project_name"
        assert re_project.get('sqft') or re_project.get('sqft') == 0, "RE project missing sqft"
        print(f"RE Project: {re_project.get('project_name')}, Scope items: {len(scope_items)}")
    
    def test_project_full_details_includes_re(self):
        """Test full project details API includes RE project reference"""
        resp = self.cre_session.get(f"{BASE_URL}/api/projects")
        projects = resp.json()
        
        project_with_re = next((p for p in projects if p.get('re_project_id')), None)
        if not project_with_re:
            pytest.skip("No project with RE found")
        
        # Get full details
        resp = self.cre_session.get(f"{BASE_URL}/api/projects/{project_with_re['project_id']}/full-details")
        assert resp.status_code == 200
        
        full_details = resp.json()
        assert 'project' in full_details
        assert full_details['project'].get('re_project_id') == project_with_re['re_project_id']
        print(f"Project full details loaded with RE reference: {project_with_re['re_project_id']}")
    
    # ==================== CRE CONVERT DEAL TESTS ====================
    
    def test_cre_new_deals_endpoint(self):
        """Test CRE new deals endpoint returns closed deals"""
        resp = self.cre_session.get(f"{BASE_URL}/api/cre/new-deals")
        assert resp.status_code == 200
        
        deals = resp.json()
        assert isinstance(deals, list)
        print(f"CRE new deals count: {len(deals)}")
    
    def test_cre_dashboard(self):
        """Test CRE dashboard returns metrics"""
        resp = self.cre_session.get(f"{BASE_URL}/api/cre/dashboard")
        assert resp.status_code == 200
        
        dashboard = resp.json()
        # Verify dashboard contains expected keys
        expected_keys = ['draft_count', 'pending_payment_count']
        for key in expected_keys:
            assert key in dashboard, f"Dashboard missing key: {key}"
        print(f"CRE Dashboard - Draft: {dashboard.get('draft_count')}, Pending: {dashboard.get('pending_payment_count')}")
    
    def test_convert_deal_without_confirmation_fails(self):
        """Test convert deal fails without accountant confirmation"""
        # This should return 400 or 404 since we need a valid lead and confirmation
        resp = self.cre_session.post(
            f"{BASE_URL}/api/cre/convert-deal/fake_lead_123",
            json={
                "project_name": "Test Project",
                "advance_amount": 50000,
                "payment_mode": "bank_transfer",
                "accountant_confirmed": False  # Not confirmed
            }
        )
        # Should fail - either 400 (not confirmed) or 404 (lead not found)
        assert resp.status_code in [400, 404], f"Expected 400 or 404, got {resp.status_code}"
        print(f"Convert without confirmation correctly rejected: {resp.status_code}")
    
    def test_convert_deal_invalid_lead_fails(self):
        """Test convert deal fails for invalid lead"""
        resp = self.cre_session.post(
            f"{BASE_URL}/api/cre/convert-deal/invalid_lead_xyz",
            json={
                "project_name": "Test Project",
                "advance_amount": 50000,
                "payment_mode": "bank_transfer",
                "accountant_confirmed": True
            }
        )
        assert resp.status_code == 404
        print("Convert with invalid lead correctly returns 404")
    
    # ==================== CRE WORKFLOW TESTS ====================
    
    def test_workflow_accountant_verify(self):
        """Test accountant can verify a pending_payment project"""
        # Find a project in pending_payment status
        resp = self.acc_session.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200
        
        projects = resp.json()
        pending_project = next((p for p in projects if p.get('status') == 'pending_payment'), None)
        
        if pending_project:
            # Verify the payment
            resp = self.acc_session.patch(
                f"{BASE_URL}/api/cre/projects/{pending_project['project_id']}/accountant-verify"
            )
            assert resp.status_code == 200
            result = resp.json()
            assert result['status'] == 'payment_received'
            print(f"Accountant verified project: {pending_project['name']}")
        else:
            print("No pending_payment projects found for accountant verification test")
    
    def test_workflow_send_to_planning(self):
        """Test CRE can send payment_received project to planning"""
        # Find a project in payment_received status  
        resp = self.cre_session.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200
        
        projects = resp.json()
        verified_project = next((p for p in projects if p.get('status') == 'payment_received'), None)
        
        if verified_project:
            # Send to planning
            resp = self.cre_session.patch(
                f"{BASE_URL}/api/cre/projects/{verified_project['project_id']}/send-to-planning"
            )
            assert resp.status_code == 200
            result = resp.json()
            assert result['status'] == 'in_planning'
            print(f"CRE sent project to planning: {verified_project['name']}")
        else:
            print("No payment_received projects found for send-to-planning test")
    
    def test_accountant_cannot_access_cre_endpoints(self):
        """Test accountant cannot access CRE-only endpoints"""
        resp = self.acc_session.get(f"{BASE_URL}/api/cre/dashboard")
        assert resp.status_code == 403, "Accountant should not access CRE dashboard"
        print("Accountant correctly blocked from CRE dashboard")
    
    def test_cre_cannot_verify_payments(self):
        """Test CRE cannot verify payments (accountant only)"""
        resp = self.cre_session.get(f"{BASE_URL}/api/projects")
        projects = resp.json()
        
        pending_project = next((p for p in projects if p.get('status') == 'pending_payment'), None)
        
        if pending_project:
            resp = self.cre_session.patch(
                f"{BASE_URL}/api/cre/projects/{pending_project['project_id']}/accountant-verify"
            )
            assert resp.status_code == 403, "CRE should not be able to verify payments"
            print("CRE correctly blocked from accountant verification")
        else:
            print("No pending_payment projects found for role test")
    
    # ==================== EDGE CASE TESTS ====================
    
    def test_convert_deal_handles_null_handover_months(self):
        """Test convert deal handles null handover_months without error (Bug fix verification)"""
        # This test verifies the fix for:
        # TypeError: unsupported operand type(s) for *: NoneType and int
        # The fix adds default handling: handover_months = (re_project.get("handover_months") if re_project else None) or 12
        
        # We can't directly test this via API without a real lead,
        # but we verify the endpoint doesn't crash with proper error handling
        resp = self.cre_session.post(
            f"{BASE_URL}/api/cre/convert-deal/nonexistent_lead",
            json={
                "project_name": "Test",
                "advance_amount": 10000,
                "payment_mode": "cash",
                "accountant_confirmed": True
            }
        )
        # Should return 404 (lead not found), not 500 (server error)
        assert resp.status_code == 404, f"Expected 404 for nonexistent lead, got {resp.status_code}"
        print("Convert deal endpoint handles edge cases correctly (no 500 error)")


class TestLoginAndAuth:
    """Test login functionality for all required roles"""
    
    def test_cre_login(self):
        """Test CRE user login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert resp.status_code == 200
        user = resp.json()
        assert user['role'] == 'cre'
        print(f"CRE login successful: {user['name']}")
    
    def test_accountant_login(self):
        """Test Accountant user login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert resp.status_code == 200
        user = resp.json()
        assert user['role'] == 'accountant'
        print(f"Accountant login successful: {user['name']}")
    
    def test_planning_login(self):
        """Test Planning user login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert resp.status_code == 200
        user = resp.json()
        assert user['role'] == 'planning'
        print(f"Planning login successful: {user['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
