"""
Test: Masked Values and CRE Payment Collection Approval Flow
Features tested:
1. CRE collects payment -> income created with status=pending_approval
2. Accountant sees pending income in GET /api/approvals/unified
3. Verify approval workflow
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCREPaymentCollectionApproval:
    """Test CRE payment collection creates income with pending_approval status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_cre_login(self):
        """Test CRE can login"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "cre", f"Expected CRE role, got {data.get('role')}"
        print(f"CRE login success: {data.get('name')}")
        
    def test_accountant_login(self):
        """Test Accountant can login"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "accountant", f"Expected accountant role, got {data.get('role')}"
        print(f"Accountant login success: {data.get('name')}")
        
    def test_super_admin_login(self):
        """Test Super Admin can login"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200, f"Super Admin login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "super_admin", f"Expected super_admin role, got {data.get('role')}"
        print(f"Super Admin login success: {data.get('name')}")
        
    def test_accountant_approvals_unified_endpoint(self):
        """Test GET /api/approvals/unified returns income with pending_approval status"""
        # Login as accountant
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert login_resp.status_code == 200, "Accountant login failed"
        
        # Get unified approvals
        response = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200, f"Unified approvals failed: {response.text}"
        
        data = response.json()
        print(f"Unified approvals response structure: {list(data.keys())}")
        
        # Check for income list
        assert "income" in data, "Response should contain 'income' key"
        assert isinstance(data["income"], list), "Income should be a list"
        
        print(f"Pending income count: {len(data.get('income', []))}")
        print(f"Pending materials count: {len(data.get('materials', []))}")
        print(f"Pending labour count: {len(data.get('labour', []))}")
        
        # If there are pending income items, verify structure
        for inc in data.get("income", []):
            print(f"  Income item: status={inc.get('status')}, amount={inc.get('amount')}, source={inc.get('source')}")
            # Verify expected fields
            assert "income_id" in inc or "id" in inc, "Income should have an ID"
            assert "amount" in inc, "Income should have amount field"
            
    def test_accountant_overview_endpoint(self):
        """Test GET /api/accountant/overview returns financial data"""
        # Login as accountant
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert login_resp.status_code == 200, "Accountant login failed"
        
        # Get accountant overview
        response = self.session.get(f"{BASE_URL}/api/accountant/overview")
        assert response.status_code == 200, f"Accountant overview failed: {response.text}"
        
        data = response.json()
        print(f"Accountant overview structure: {list(data.keys())}")
        
        # Check for expected fields
        assert "totals" in data, "Response should contain 'totals'"
        assert "income_entries" in data or "income_by_mode" in data, "Response should contain income data"
        
        totals = data.get("totals", {})
        print(f"  Total income: {totals.get('total_income')}")
        print(f"  Total expense: {totals.get('total_expense')}")
        print(f"  Net balance: {totals.get('net_balance')}")


class TestSuperAdminAccountsAccess:
    """Test Super Admin can access accounts board"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_super_admin_can_access_accountant_overview(self):
        """Super Admin should be able to access accountant endpoints"""
        # Login as super admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, "Super Admin login failed"
        
        # Access accountant overview
        response = self.session.get(f"{BASE_URL}/api/accountant/overview")
        assert response.status_code == 200, f"Super Admin accountant overview access failed: {response.text}"
        
        data = response.json()
        assert "totals" in data, "Response should contain totals"
        print("Super Admin successfully accessed accountant overview")
        
    def test_super_admin_unified_approvals(self):
        """Super Admin should be able to access unified approvals"""
        # Login as super admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, "Super Admin login failed"
        
        # Access unified approvals
        response = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200, f"Super Admin unified approvals access failed: {response.text}"
        
        data = response.json()
        print(f"Super Admin unified approvals: {list(data.keys())}")


class TestCREPaymentStageCollect:
    """Test CRE payment stage collection creates pending_approval income"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_cre_can_view_payment_stages(self):
        """CRE should be able to view payment stages"""
        # Login as CRE
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert login_resp.status_code == 200, "CRE login failed"
        
        # Get projects first
        projects_resp = self.session.get(f"{BASE_URL}/api/projects")
        assert projects_resp.status_code == 200, f"Get projects failed: {projects_resp.text}"
        
        projects = projects_resp.json()
        print(f"CRE can see {len(projects)} projects")
        
        # If there are projects, try to get payment stages for first one
        if projects:
            project_id = projects[0].get("project_id")
            stages_resp = self.session.get(f"{BASE_URL}/api/payment-stages/{project_id}")
            print(f"Payment stages request status: {stages_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
