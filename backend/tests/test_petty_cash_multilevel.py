"""
Test Petty Cash Multi-Level Approval Flow
==========================================
Tests the complete petty cash workflow:
- SE creates request → PM approves → Accountant processes payment → SE acknowledges
- Direct expense recording (no approval)
- Expense categories management
- Summary and history endpoints
"""

import pytest
import requests
import os
from datetime import datetime
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SE_EMAIL = "engineer@constructionos.com"
PM_EMAIL = "pm@constructionos.com"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"
TEST_PROJECT_ID = "proj_12f23331b542"  # Known test project

# Global storage for test data across test classes
test_data = {
    "created_petty_cash_id": None
}


def login_user(session, email):
    """Login and return True if successful (uses cookies)"""
    time.sleep(0.5)  # Small delay to avoid rate limiting
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
    if response.status_code == 200:
        # Cookies are automatically stored in session
        return True
    elif response.status_code == 429:
        # Rate limited - wait and retry
        print(f"Rate limited, waiting 60s...")
        time.sleep(60)
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        return response.status_code == 200
    print(f"Login failed for {email}: {response.status_code} - {response.text[:200]}")
    return False


class TestPettyCashMultiLevelApproval:
    """Test the complete petty cash multi-level approval flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ============ SE PETTY CASH REQUEST ============
    
    def test_01_se_create_petty_cash_request(self):
        """SE creates a new petty cash request with status 'requested'"""
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        payload = {
            "project_id": TEST_PROJECT_ID,
            "amount": 5000,
            "purpose": "TEST_Site materials purchase",
            "remarks": "Urgent requirement for cement and sand"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/petty-cash/request", json=payload)
        print(f"Create petty cash response: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "petty_cash_id" in data, "Missing petty_cash_id"
        assert data["status"] == "requested", f"Expected status 'requested', got {data['status']}"
        assert data["amount_requested"] == 5000, "Amount mismatch"
        assert "TEST_Site materials" in data["purpose"], "Purpose mismatch"
        
        # Store for later tests
        test_data["created_petty_cash_id"] = data["petty_cash_id"]
        print(f"Created petty cash: {test_data['created_petty_cash_id']}")
    
    def test_02_se_get_petty_cash_list(self):
        """SE can view their petty cash requests"""
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        response = self.session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        print(f"SE petty cash list: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # Should contain our created request
        if test_data["created_petty_cash_id"]:
            found = any(pc["petty_cash_id"] == test_data["created_petty_cash_id"] for pc in data)
            assert found, "Created petty cash not found in SE list"
    
    def test_03_se_get_petty_cash_summary(self):
        """SE can view petty cash summary"""
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        response = self.session.get(f"{BASE_URL}/api/site-engineer/petty-cash/summary")
        print(f"SE summary: {response.status_code} - {response.text[:300]}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify summary structure
        assert "total_cash_in_hand" in data, "Missing total_cash_in_hand"
        assert "total_expenses" in data, "Missing total_expenses"
        assert "pending_requests" in data, "Missing pending_requests"
        assert "waiting_approval" in data, "Missing waiting_approval"
    
    # ============ PM APPROVAL ============
    
    def test_04_pm_get_petty_cash_requests(self):
        """PM can view pending petty cash requests"""
        assert login_user(self.session, PM_EMAIL), "PM login failed"
        
        response = self.session.get(f"{BASE_URL}/api/pm/petty-cash-requests")
        print(f"PM petty cash requests: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # Should contain our created request with status 'requested'
        if test_data["created_petty_cash_id"]:
            found = any(pc["petty_cash_id"] == test_data["created_petty_cash_id"] for pc in data)
            print(f"Found created request in PM list: {found}")
    
    def test_05_pm_approve_petty_cash(self):
        """PM approves petty cash - moves status to 'pm_approved'"""
        if not test_data["created_petty_cash_id"]:
            pytest.skip("No petty cash created to approve")
        
        assert login_user(self.session, PM_EMAIL), "PM login failed"
        
        response = self.session.patch(
            f"{BASE_URL}/api/pm/petty-cash/{test_data['created_petty_cash_id']}/approve",
            json={"remarks": "Approved for site work"}
        )
        print(f"PM approve: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "pm_approved" or "Approved" in data.get("message", "")
    
    def test_06_pm_reject_petty_cash_flow(self):
        """Test PM reject flow (create new request and reject)"""
        # First create a new request as SE
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        payload = {
            "project_id": TEST_PROJECT_ID,
            "amount": 1000,
            "purpose": "TEST_Reject test request",
            "remarks": "This will be rejected"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/site-engineer/petty-cash/request", json=payload)
        if create_response.status_code != 200:
            pytest.skip("Could not create test request for rejection")
        
        reject_pc_id = create_response.json()["petty_cash_id"]
        
        # Now login as PM and reject
        assert login_user(self.session, PM_EMAIL), "PM login failed"
        
        response = self.session.patch(
            f"{BASE_URL}/api/pm/petty-cash/{reject_pc_id}/reject",
            json={"reason": "Budget constraints"}
        )
        print(f"PM reject: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        assert "Rejected" in response.json().get("message", "")
    
    # ============ ACCOUNTANT PAYMENT PROCESSING ============
    
    def test_07_accountant_get_petty_cash(self):
        """Accountant can view PM-approved petty cash requests"""
        assert login_user(self.session, ACCOUNTANT_EMAIL), "Accountant login failed"
        
        response = self.session.get(f"{BASE_URL}/api/accountant/petty-cash")
        print(f"Accountant petty cash: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # Should contain our PM-approved request
        if test_data["created_petty_cash_id"]:
            found = any(pc["petty_cash_id"] == test_data["created_petty_cash_id"] for pc in data)
            print(f"Found PM-approved request in Accountant list: {found}")
    
    def test_08_accountant_process_payment(self):
        """Accountant processes payment with bank details"""
        if not test_data["created_petty_cash_id"]:
            pytest.skip("No petty cash to process")
        
        assert login_user(self.session, ACCOUNTANT_EMAIL), "Accountant login failed"
        
        payment_payload = {
            "payment_mode": "bank_transfer",
            "bank_name": "HDFC Bank",
            "reference_number": "TXN123456789",
            "amount_paid": 5000,
            "remarks": "Payment processed via NEFT",
            "payment_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = self.session.patch(
            f"{BASE_URL}/api/accountant/petty-cash/{test_data['created_petty_cash_id']}/process-payment",
            json=payment_payload
        )
        print(f"Process payment: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "payment_done" or "processed" in data.get("message", "").lower()
    
    # ============ SE ACKNOWLEDGE ============
    
    def test_09_se_acknowledge_receipt(self):
        """SE acknowledges receipt of petty cash"""
        if not test_data["created_petty_cash_id"]:
            pytest.skip("No petty cash to acknowledge")
        
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        response = self.session.patch(
            f"{BASE_URL}/api/site-engineer/petty-cash/{test_data['created_petty_cash_id']}/acknowledge"
        )
        print(f"SE acknowledge: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "acknowledged" or "Acknowledged" in data.get("message", "")
    
    # ============ INCOME HISTORY ============
    
    def test_10_se_income_history(self):
        """SE can view income history (acknowledged/issued amounts)"""
        assert login_user(self.session, SE_EMAIL), "SE login failed"
        
        response = self.session.get(f"{BASE_URL}/api/site-engineer/petty-cash/income-history")
        print(f"Income history: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"


class TestExpenseCategories:
    """Test expense categories management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_expense_categories(self):
        """Get all expense categories (defaults + custom)"""
        assert login_user(self.session, SE_EMAIL), "Login failed"
        
        response = self.session.get(f"{BASE_URL}/api/expense-categories")
        print(f"Expense categories: {response.status_code} - {response.text[:300]}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        
        # Verify default categories exist
        default_cats = ["Electrical", "Plumbing", "Painting", "Civil", "Wooden", "Miscellaneous"]
        for cat in default_cats:
            assert cat in data, f"Default category '{cat}' missing"
    
    def test_create_custom_category(self):
        """Create a new custom expense category"""
        assert login_user(self.session, SE_EMAIL), "Login failed"
        
        unique_name = f"TEST_Category_{datetime.now().strftime('%H%M%S')}"
        
        response = self.session.post(
            f"{BASE_URL}/api/expense-categories",
            json={"name": unique_name}
        )
        print(f"Create category: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("name") == unique_name
        assert "category_id" in data


class TestDirectExpense:
    """Test direct expense recording (no approval needed)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_record_direct_expense(self):
        """Record direct expense with multiple line items"""
        assert login_user(self.session, SE_EMAIL), "Login failed"
        
        payload = {
            "project_id": TEST_PROJECT_ID,
            "items": [
                {
                    "category": "Electrical",
                    "expense_name": "TEST_Wire purchase",
                    "amount": 1500
                },
                {
                    "category": "Plumbing",
                    "expense_name": "TEST_Pipe fittings",
                    "amount": 800
                },
                {
                    "category": "Miscellaneous",
                    "expense_name": "TEST_Transport",
                    "amount": 200
                }
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/direct-expense", json=payload)
        print(f"Direct expense: {response.status_code} - {response.text[:500]}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response
        assert "expense_id" in data, "Missing expense_id"
        assert data["total_amount"] == 2500, f"Expected total 2500, got {data.get('total_amount')}"
        assert len(data.get("items", [])) == 3, "Expected 3 items"
    
    def test_get_direct_expenses(self):
        """Get direct expense history"""
        assert login_user(self.session, SE_EMAIL), "Login failed"
        
        response = self.session.get(f"{BASE_URL}/api/site-engineer/direct-expenses")
        print(f"Direct expenses list: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Expected list response"
    
    def test_get_direct_expenses_with_filters(self):
        """Get direct expenses with project and date filters"""
        assert login_user(self.session, SE_EMAIL), "Login failed"
        
        # Test with project filter
        response = self.session.get(
            f"{BASE_URL}/api/site-engineer/direct-expenses",
            params={"project_id": TEST_PROJECT_ID}
        )
        print(f"Filtered expenses: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # All returned should be for the specified project
        for exp in data:
            assert exp.get("project_id") == TEST_PROJECT_ID or exp.get("project_id") is None


class TestAccountantPettyCashManagement:
    """Test accountant petty cash management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_accountant_petty_cash_management(self):
        """Accountant can view petty cash management overview"""
        assert login_user(self.session, ACCOUNTANT_EMAIL), "Accountant login failed"
        
        response = self.session.get(f"{BASE_URL}/api/accountant/petty-cash-management")
        print(f"Petty cash management: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "site_engineers" in data or "summary" in data, "Missing expected fields"


# Cleanup test data
class TestCleanup:
    """Cleanup test-created data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_cleanup_note(self):
        """Note: Test data prefixed with TEST_ should be cleaned up periodically"""
        print("Test data created with TEST_ prefix for easy identification")
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
