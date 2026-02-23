"""
Test Accountant Module - Comprehensive Testing
Tests: Material Requests, Labour Requests, Petty Cash, Record Expense, Suspense Account
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAccountantModule:
    """Accountant Module endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with accountant login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as accountant
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        self.accountant_token = response.cookies.get("session")
        print(f"Accountant login successful")
        
    def test_get_material_requests(self):
        """Test GET /api/accountant/material-requests - view pending material requests"""
        response = self.session.get(f"{BASE_URL}/api/accountant/material-requests")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of material requests"
        print(f"✓ GET material-requests: Found {len(data)} requests")
        
    def test_get_labour_requests(self):
        """Test GET /api/accountant/labour-requests - view pending labour requests"""
        response = self.session.get(f"{BASE_URL}/api/accountant/labour-requests")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of labour requests"
        print(f"✓ GET labour-requests: Found {len(data)} requests")
        
    def test_get_petty_cash_requests(self):
        """Test GET /api/accountant/petty-cash - view pending petty cash requests"""
        response = self.session.get(f"{BASE_URL}/api/accountant/petty-cash")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of petty cash requests"
        print(f"✓ GET petty-cash: Found {len(data)} requests")
        
    def test_get_recorded_expenses(self):
        """Test GET /api/accountant/recorded-expenses - view recorded expenses"""
        response = self.session.get(f"{BASE_URL}/api/accountant/recorded-expenses")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of recorded expenses"
        print(f"✓ GET recorded-expenses: Found {len(data)} expenses")
        
    def test_get_income_entries(self):
        """Test GET /api/income - view income entries (view only)"""
        response = self.session.get(f"{BASE_URL}/api/income")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of income entries"
        print(f"✓ GET income: Found {len(data)} income entries")
        
    def test_get_income_summary(self):
        """Test GET /api/income/summary - view income summary"""
        response = self.session.get(f"{BASE_URL}/api/income/summary")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        print(f"✓ GET income/summary: {data}")
        
    def test_get_suspense_entries(self):
        """Test GET /api/financial/suspense - view suspense entries"""
        response = self.session.get(f"{BASE_URL}/api/financial/suspense")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of suspense entries"
        print(f"✓ GET suspense: Found {len(data)} suspense entries")
        
    def test_get_pending_advance_payments(self):
        """Test GET /api/accounts/pending-advance-payments - view CRE advance payments"""
        response = self.session.get(f"{BASE_URL}/api/accounts/pending-advance-payments")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of pending advance payments"
        print(f"✓ GET pending-advance-payments: Found {len(data)} requests")
        
    def test_get_projects(self):
        """Test GET /api/projects - view projects list"""
        response = self.session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of projects"
        print(f"✓ GET projects: Found {len(data)} projects")

    def test_record_expense_with_all_categories(self):
        """Test POST /api/accountant/record-expense - record new expense with each category"""
        categories = ['salary', 'material', 'labour', 'transport', 'utility', 
                      'rent', 'marketing', 'office', 'maintenance', 'other']
        
        for category in categories:
            payload = {
                "category": category,
                "description": f"TEST_{category}_expense",
                "amount": 1000.0,
                "payment_method": "bank_transfer",
                "vendor_name": f"TEST_Vendor_{category}",
                "remarks": f"Test expense for category {category}"
            }
            response = self.session.post(f"{BASE_URL}/api/accountant/record-expense", json=payload)
            assert response.status_code == 200, f"Failed to record {category} expense: {response.status_code} - {response.text}"
            data = response.json()
            assert data.get("category") == category, f"Expected category {category}"
            assert data.get("expense_id") is not None, "Expected expense_id in response"
            print(f"✓ Record expense ({category}): expense_id={data.get('expense_id')}")
        
    def test_record_expense_invalid_category(self):
        """Test POST /api/accountant/record-expense - invalid category should fail"""
        payload = {
            "category": "invalid_category",
            "description": "TEST_invalid_category_expense",
            "amount": 500.0,
            "payment_method": "cash"
        }
        response = self.session.post(f"{BASE_URL}/api/accountant/record-expense", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid category, got {response.status_code}"
        print(f"✓ Invalid category correctly rejected with 400")
        
    def test_add_suspense_entry(self):
        """Test POST /api/financial/suspense - add new suspense entry"""
        payload = {
            "transaction_type": "expense",
            "amount": 2500.0,
            "description": "TEST_Suspense_Entry_PettyCash_Excess",
            "source": "petty_cash: TEST_PC_001",
            "remarks": "Testing suspense account addition"
        }
        response = self.session.post(f"{BASE_URL}/api/financial/suspense", json=payload)
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("suspense_id") is not None, "Expected suspense_id in response"
        print(f"✓ Add suspense entry: suspense_id={data.get('suspense_id')}")
        
    def test_get_comprehensive_dashboard(self):
        """Test GET /api/accountant/comprehensive-dashboard - view dashboard summary"""
        response = self.session.get(f"{BASE_URL}/api/accountant/comprehensive-dashboard")
        assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "summary" in data, "Expected summary in dashboard"
        print(f"✓ GET comprehensive-dashboard: income={data.get('summary', {}).get('total_income', 0)}")


class TestAccountantAccessControl:
    """Test that non-accountant users cannot access accountant endpoints"""
    
    def test_cre_cannot_access_material_requests(self):
        """CRE user should not access accountant material requests"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as CRE
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200, "CRE login failed"
        
        # Try to access accountant endpoint
        response = session.get(f"{BASE_URL}/api/accountant/material-requests")
        assert response.status_code == 403, f"Expected 403 for CRE accessing accountant endpoint, got {response.status_code}"
        print("✓ CRE correctly denied access to accountant/material-requests")
        
    def test_site_engineer_cannot_record_expense(self):
        """Site Engineer should not be able to record expenses"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        assert response.status_code == 200, "Site Engineer login failed"
        
        # Try to record expense
        payload = {
            "category": "salary",
            "description": "TEST_Unauthorized_Expense",
            "amount": 1000.0
        }
        response = session.post(f"{BASE_URL}/api/accountant/record-expense", json=payload)
        assert response.status_code == 403, f"Expected 403 for SE recording expense, got {response.status_code}"
        print("✓ Site Engineer correctly denied from recording expenses")


class TestAccountantVerifyWorkflows:
    """Test verification workflows for material, labour, and petty cash"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as accountant
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        
    def test_material_request_verification_flow(self):
        """Test that accountant can view material requests pending verification"""
        # Get material requests
        response = self.session.get(f"{BASE_URL}/api/accountant/material-requests")
        assert response.status_code == 200
        data = response.json()
        
        # Check if there are any pending accounts approval
        pending = [r for r in data if r.get("status") == "pending_accounts_approval"]
        print(f"✓ Found {len(pending)} material requests pending accounts approval")
        
        # If we have pending requests, verify the structure
        if pending:
            req = pending[0]
            assert "request_id" in req, "Expected request_id in material request"
            assert "material_name" in req, "Expected material_name in material request"
            assert "project_name" in req, "Expected project_name in material request"
            print(f"✓ Material request structure verified: {req.get('material_name')} for {req.get('project_name')}")
            
    def test_labour_request_verification_flow(self):
        """Test that accountant can view labour requests pending verification"""
        response = self.session.get(f"{BASE_URL}/api/accountant/labour-requests")
        assert response.status_code == 200
        data = response.json()
        
        pending = [r for r in data if r.get("status") == "pending_accounts_approval"]
        print(f"✓ Found {len(pending)} labour requests pending accounts approval")
        
        if pending:
            req = pending[0]
            assert "labour_expense_id" in req, "Expected labour_expense_id"
            assert "project_name" in req, "Expected project_name"
            print(f"✓ Labour request structure verified: {req.get('labour_type')} for {req.get('project_name')}")


# Cleanup function to remove TEST_ prefixed data
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests complete"""
    yield
    # Note: Cleanup would be done here if needed
    # For now, TEST_ prefixed data is left for manual inspection
    print("\n--- Test cleanup: TEST_ prefixed data created during testing ---")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
