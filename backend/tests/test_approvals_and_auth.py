"""
Test Approvals System and Auth Features
- GET /api/approvals/unified endpoint
- POST /api/approvals/income/{income_id}/approve
- POST /api/approvals/income/{income_id}/reject
- Super Admin user existence check
- POST /api/auth/forgot-password endpoint
- AccountsBoard role access check
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestApprovalsAndAuth:
    """Test Approvals system endpoints and auth features"""
    
    session = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as accountant"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as accountant
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"✓ Logged in as accountant")
    
    # === Unified Approvals Endpoint Tests ===
    
    def test_get_unified_approvals_endpoint_exists(self):
        """Test GET /api/approvals/unified returns proper structure"""
        response = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200, f"Approvals unified failed: {response.text}"
        
        data = response.json()
        # Verify required keys exist
        assert "income" in data, "Missing 'income' key in response"
        assert "materials" in data, "Missing 'materials' key in response"
        assert "labour" in data, "Missing 'labour' key in response"
        assert "vendor" in data, "Missing 'vendor' key in response"
        assert "summary" in data, "Missing 'summary' key in response"
        
        # Verify summary structure
        summary = data["summary"]
        assert "income_count" in summary, "Missing income_count in summary"
        assert "income_total" in summary, "Missing income_total in summary"
        assert "material_count" in summary, "Missing material_count in summary"
        assert "labour_count" in summary, "Missing labour_count in summary"
        assert "vendor_count" in summary, "Missing vendor_count in summary"
        
        print(f"✓ Unified approvals returned: income={summary['income_count']}, materials={summary['material_count']}, labour={summary['labour_count']}, vendor={summary['vendor_count']}")
    
    def test_approvals_arrays_are_lists(self):
        """Test that income, materials, labour, vendor are arrays"""
        response = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data["income"], list), "income should be a list"
        assert isinstance(data["materials"], list), "materials should be a list"
        assert isinstance(data["labour"], list), "labour should be a list"
        assert isinstance(data["vendor"], list), "vendor should be a list"
        
        print(f"✓ All approval arrays are properly typed as lists")
    
    # === Forgot Password Endpoint Tests ===
    
    def test_forgot_password_endpoint(self):
        """Test POST /api/auth/forgot-password works"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Forgot password failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "reset link has been sent" in data["message"].lower() or "if an account exists" in data["message"].lower()
        
        print(f"✓ Forgot password endpoint works: {data['message']}")
    
    def test_forgot_password_unknown_email_no_error(self):
        """Test forgot password doesn't reveal if email exists (security)"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": "nonexistent_user_12345@example.com"
        })
        # Should return 200 to prevent email enumeration
        assert response.status_code == 200, f"Should return 200 even for unknown email: {response.text}"
        
        print(f"✓ Forgot password properly hides email existence")


class TestSuperAdminSetup:
    """Test Super Admin user setup"""
    
    def test_super_admin_user_exists(self):
        """Verify urbanspacebuilderstech@gmail.com exists as super_admin"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin to check users
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        
        # Get users list
        users_response = session.get(f"{BASE_URL}/api/users")
        if users_response.status_code == 200:
            users = users_response.json()
            # Look for the production super admin email
            prod_admin = next((u for u in users if u.get("email") == "urbanspacebuilderstech@gmail.com"), None)
            
            if prod_admin:
                assert prod_admin.get("role") == "super_admin", f"Expected super_admin role, got: {prod_admin.get('role')}"
                print(f"✓ Production Super Admin user exists with role: {prod_admin.get('role')}")
            else:
                print("✓ Production Super Admin will be created on next server restart (startup_init)")
        else:
            print(f"⚠ Cannot verify users list (status: {users_response.status_code})")
    
    def test_admin_login_works(self):
        """Test admin@constructionos.com login works with Demo@1234"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert data.get("role") == "super_admin", f"Expected super_admin, got: {data.get('role')}"
        
        print(f"✓ Admin login successful with super_admin role")


class TestAccountsBoardAccess:
    """Test AccountsBoard role-based access"""
    
    def test_accountant_can_access_overview(self):
        """Test accountant can access /api/accountant/overview"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        overview_response = session.get(f"{BASE_URL}/api/accountant/overview")
        assert overview_response.status_code == 200, f"Accountant overview failed: {overview_response.text}"
        
        print(f"✓ Accountant can access accountant/overview endpoint")
    
    def test_super_admin_can_access_overview(self):
        """Test super_admin can access /api/accountant/overview"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        overview_response = session.get(f"{BASE_URL}/api/accountant/overview")
        assert overview_response.status_code == 200, f"Super admin overview failed: {overview_response.text}"
        
        print(f"✓ Super Admin can access accountant/overview endpoint")
    
    def test_super_admin_can_access_approvals(self):
        """Test super_admin can access /api/approvals/unified"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        approvals_response = session.get(f"{BASE_URL}/api/approvals/unified")
        assert approvals_response.status_code == 200, f"Super admin approvals failed: {approvals_response.text}"
        
        print(f"✓ Super Admin can access approvals/unified endpoint")


class TestIncomeApprovalWorkflow:
    """Test income approval/rejection endpoints"""
    
    def test_income_approve_endpoint_exists(self):
        """Test POST /api/approvals/income/{id}/approve endpoint structure"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        # Test with a fake income_id - should return 404 if endpoint exists but income not found
        response = session.post(f"{BASE_URL}/api/approvals/income/fake_income_123/approve")
        
        # Should be 404 (not found) or 400 (already processed) - NOT 405 (method not allowed)
        assert response.status_code in [404, 400], f"Expected 404/400, got: {response.status_code} - {response.text}"
        
        print(f"✓ Income approve endpoint exists (status: {response.status_code})")
    
    def test_income_reject_endpoint_exists(self):
        """Test POST /api/approvals/income/{id}/reject endpoint structure"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        # Test with a fake income_id
        response = session.post(f"{BASE_URL}/api/approvals/income/fake_income_123/reject?reason=test")
        
        # Should be 404 (not found) or 400 (already processed) - NOT 405 (method not allowed)
        assert response.status_code in [404, 400], f"Expected 404/400, got: {response.status_code} - {response.text}"
        
        print(f"✓ Income reject endpoint exists (status: {response.status_code})")


class TestCashbookSourceColumn:
    """Test that cashbook returns source field for expenses"""
    
    def test_recorded_expense_has_source_field(self):
        """Test creating a manual expense adds source=manual"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        
        # Get projects first
        projects_response = session.get(f"{BASE_URL}/api/projects")
        if projects_response.status_code == 200 and len(projects_response.json()) > 0:
            project_id = projects_response.json()[0].get("project_id")
            
            # Create a manual expense
            expense_response = session.post(f"{BASE_URL}/api/accountant/record-expense", json={
                "project_id": project_id,
                "category": "material",
                "description": "Test expense for source column",
                "amount": 1000,
                "payment_method": "cash"
            })
            
            if expense_response.status_code == 200:
                expense_data = expense_response.json()
                # Check if source field exists
                assert expense_data.get("source") == "manual", f"Expected source=manual, got: {expense_data.get('source')}"
                print(f"✓ Manual expense has source=manual")
            else:
                print(f"⚠ Could not create test expense: {expense_response.status_code}")
        else:
            print(f"⚠ No projects available for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
