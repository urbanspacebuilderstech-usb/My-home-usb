"""
Test Suite for AccountsBoard Feature - Construction Accounting CRM
Testing the refactored accountant module with 3 tabs: Dashboard, Cashbook, Cheque Management
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Shared requests session with cookies"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

@pytest.fixture(scope="module")
def accountant_auth(session):
    """Login as accountant and return session"""
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "accountant@constructionos.com",
        "password": "Demo@1234"
    })
    if login_resp.status_code != 200:
        pytest.skip("Accountant login failed - check credentials")
    user_data = login_resp.json()
    # API returns user directly, not nested in "user" key
    role = user_data.get("role") or user_data.get("user", {}).get("role")
    assert role == "accountant", f"User is not accountant role, got: {role}"
    return session

@pytest.fixture(scope="module")
def project_id(accountant_auth):
    """Get first project_id for testing"""
    resp = accountant_auth.get(f"{BASE_URL}/api/projects")
    if resp.status_code == 200:
        projects = resp.json()
        if isinstance(projects, dict) and "projects" in projects:
            projects = projects["projects"]
        if projects and len(projects) > 0:
            return projects[0].get("project_id")
    pytest.skip("No projects available for testing")


class TestAccountantAuth:
    """Test accountant authentication and redirect"""
    
    def test_accountant_login_success(self, session):
        """Login as accountant and verify redirect to /accounts-board"""
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        # API returns user data directly at root level
        role = data.get("role")
        name = data.get("name")
        assert role == "accountant", f"User role is not accountant, got: {role}"
        print(f"✓ Accountant login successful: {name}")


class TestDashboardTab:
    """Test Dashboard tab endpoints"""
    
    def test_cashbook_overview_for_dashboard(self, accountant_auth):
        """GET /api/accountant/cashbook-filtered - returns summary for dashboard"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/cashbook-filtered")
        assert resp.status_code == 200, f"Failed: {resp.status_code} - {resp.text}"
        data = resp.json()
        
        # Verify summary exists
        assert "summary" in data, "Response missing summary"
        summary = data["summary"]
        assert "total_income" in summary, "Summary missing total_income"
        assert "total_expense" in summary, "Summary missing total_expense"
        assert "net_balance" in summary, "Summary missing net_balance"
        
        # Verify income and expense entries
        assert "income_entries" in data, "Response missing income_entries"
        assert "expense_entries" in data, "Response missing expense_entries"
        
        print(f"✓ Dashboard Overview - Income: {summary['total_income']}, Expense: {summary['total_expense']}, Balance: {summary['net_balance']}")


class TestCashbookTab:
    """Test Cashbook tab endpoints with date range filters"""
    
    def test_cashbook_filtered_no_filters(self, accountant_auth):
        """GET /api/accountant/cashbook-filtered - returns all data without filters"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/cashbook-filtered")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        assert "income_entries" in data
        assert "expense_entries" in data
        assert "summary" in data
        assert "projects" in data
        
        print(f"✓ Cashbook data: {len(data['income_entries'])} income, {len(data['expense_entries'])} expense entries")
    
    def test_cashbook_filtered_with_date_range(self, accountant_auth):
        """GET /api/accountant/cashbook-filtered with date range"""
        today = datetime.now().strftime("%Y-%m-%d")
        last_month = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        resp = accountant_auth.get(
            f"{BASE_URL}/api/accountant/cashbook-filtered",
            params={"start_date": last_month, "end_date": today}
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        assert "summary" in data
        print(f"✓ Cashbook with date range: {data['summary']['income_count']} income, {data['summary']['expense_count']} expense entries")
    
    def test_cashbook_filtered_with_project(self, accountant_auth, project_id):
        """GET /api/accountant/cashbook-filtered with project filter"""
        resp = accountant_auth.get(
            f"{BASE_URL}/api/accountant/cashbook-filtered",
            params={"project_id": project_id}
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        assert "summary" in data
        print(f"✓ Cashbook for project {project_id}: {data['summary']['total_income']} income, {data['summary']['total_expense']} expense")
    
    def test_record_expense(self, accountant_auth, project_id):
        """POST /api/accountant/record-expense - Add new expense"""
        expense_data = {
            "project_id": project_id,
            "category": "material",
            "description": "TEST_Expense from pytest",
            "amount": 5000,
            "payment_method": "cash",
            "vendor_name": "TEST_Vendor",
        }
        resp = accountant_auth.post(f"{BASE_URL}/api/accountant/record-expense", json=expense_data)
        assert resp.status_code in [200, 201], f"Failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "expense_id" in data or "message" in data, "Response missing expense_id or message"
        print(f"✓ Expense recorded: {data}")


class TestChequeManagementTab:
    """Test Cheque Management tab endpoints"""
    
    def test_get_all_cheques(self, accountant_auth):
        """GET /api/accountant/cheques - List all cheques"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/cheques")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        cheques = resp.json()
        assert isinstance(cheques, list), "Response should be a list"
        print(f"✓ Retrieved {len(cheques)} cheques")
    
    def test_get_cheques_with_status_filter(self, accountant_auth):
        """GET /api/accountant/cheques with status filter"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/cheques", params={"status": "issued"})
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        cheques = resp.json()
        print(f"✓ Retrieved {len(cheques)} issued cheques")
    
    def test_get_cheque_reminders(self, accountant_auth):
        """GET /api/accountant/cheques/reminders - Post-dated cheque reminders"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/cheques/reminders")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        reminders = resp.json()
        assert isinstance(reminders, list), "Response should be a list"
        print(f"✓ Retrieved {len(reminders)} cheque reminders")
    
    def test_add_outgoing_cheque(self, accountant_auth, project_id):
        """POST /api/accountant/cheques - Add new outgoing cheque"""
        cheque_data = {
            "cheque_number": f"TEST_CHQ_{datetime.now().strftime('%H%M%S')}",
            "bank_name": "HDFC Bank",
            "branch_name": "Main Branch",
            "amount": 50000,
            "cheque_date": datetime.now().isoformat(),
            "cheque_type": "outgoing",
            "party_name": "TEST_Vendor",
            "party_type": "vendor",
            "project_id": project_id,
            "is_post_dated": False,
            "remarks": "Test cheque from pytest"
        }
        resp = accountant_auth.post(f"{BASE_URL}/api/accountant/cheques", json=cheque_data)
        assert resp.status_code in [200, 201], f"Failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "cheque_id" in data, "Response missing cheque_id"
        print(f"✓ Outgoing cheque created: {data['cheque_number']}")
        return data["cheque_id"]
    
    def test_add_incoming_cheque(self, accountant_auth, project_id):
        """POST /api/accountant/cheques - Add new incoming cheque"""
        cheque_data = {
            "cheque_number": f"TEST_CHQ_IN_{datetime.now().strftime('%H%M%S')}",
            "bank_name": "SBI",
            "branch_name": "City Branch",
            "amount": 100000,
            "cheque_date": datetime.now().isoformat(),
            "cheque_type": "incoming",
            "party_name": "TEST_Client",
            "party_type": "client",
            "project_id": project_id,
            "is_post_dated": False,
            "remarks": "Test incoming cheque from pytest"
        }
        resp = accountant_auth.post(f"{BASE_URL}/api/accountant/cheques", json=cheque_data)
        assert resp.status_code in [200, 201], f"Failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "cheque_id" in data, "Response missing cheque_id"
        print(f"✓ Incoming cheque created: {data['cheque_number']}")
        return data["cheque_id"]
    
    def test_update_cheque_status(self, accountant_auth, project_id):
        """PATCH /api/accountant/cheques/{cheque_id}/status - Update cheque status"""
        # First create a cheque
        cheque_data = {
            "cheque_number": f"TEST_STATUS_{datetime.now().strftime('%H%M%S')}",
            "bank_name": "ICICI Bank",
            "amount": 25000,
            "cheque_date": datetime.now().isoformat(),
            "cheque_type": "outgoing",
            "party_name": "TEST_StatusVendor",
            "party_type": "vendor",
            "project_id": project_id,
            "is_post_dated": False,
        }
        create_resp = accountant_auth.post(f"{BASE_URL}/api/accountant/cheques", json=cheque_data)
        assert create_resp.status_code in [200, 201], f"Create failed: {create_resp.text}"
        cheque_id = create_resp.json()["cheque_id"]
        
        # Update status from issued to deposited
        update_data = {
            "status": "deposited",
            "deposit_date": datetime.now().isoformat(),
            "remarks": "Deposited via pytest"
        }
        resp = accountant_auth.patch(f"{BASE_URL}/api/accountant/cheques/{cheque_id}/status", json=update_data)
        assert resp.status_code == 200, f"Update failed: {resp.status_code} - {resp.text}"
        
        print(f"✓ Cheque status updated to 'deposited': {cheque_id}")


class TestSmartPaymentFeature:
    """Test Smart Payment feature for cheque-based vendor payments"""
    
    def test_get_uncleared_cheques(self, accountant_auth):
        """GET /api/accountant/uncleared-cheques - Available cheques for payment"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/uncleared-cheques")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        cheques = resp.json()
        assert isinstance(cheques, list), "Response should be a list"
        print(f"✓ Retrieved {len(cheques)} uncleared cheques available for payment")
    
    def test_get_all_vendor_suspense(self, accountant_auth):
        """GET /api/accountant/all-vendor-suspense - All vendor suspense balances"""
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/all-vendor-suspense")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Retrieved suspense data for {len(data)} vendors")
    
    def test_get_vendor_suspense_balance(self, accountant_auth):
        """GET /api/accountant/vendor-suspense/{vendor_name} - Specific vendor suspense"""
        vendor_name = "TEST_Vendor"
        resp = accountant_auth.get(f"{BASE_URL}/api/accountant/vendor-suspense/{vendor_name}")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        assert "vendor_name" in data, "Response missing vendor_name"
        assert "suspense_balance" in data, "Response missing suspense_balance"
        print(f"✓ Vendor {vendor_name} suspense balance: {data['suspense_balance']}")
    
    def test_smart_cheque_payment_with_excess(self, accountant_auth, project_id):
        """POST /api/accountant/cheque-payment - Smart payment with excess to suspense"""
        # First create a cheque for payment
        cheque_data = {
            "cheque_number": f"TEST_SMARTPAY_{datetime.now().strftime('%H%M%S')}",
            "bank_name": "Axis Bank",
            "amount": 50000,  # Cheque amount
            "cheque_date": datetime.now().isoformat(),
            "cheque_type": "outgoing",
            "party_name": "TEST_SmartPayVendor",
            "party_type": "vendor",
            "project_id": project_id,
            "is_post_dated": False,
        }
        create_resp = accountant_auth.post(f"{BASE_URL}/api/accountant/cheques", json=cheque_data)
        if create_resp.status_code not in [200, 201]:
            pytest.skip(f"Could not create cheque: {create_resp.text}")
        
        cheque_id = create_resp.json()["cheque_id"]
        
        # Process payment with less amount than cheque (excess should go to suspense)
        payment_data = {
            "cheque_id": cheque_id,
            "expense_project_id": project_id,
            "expense_category": "material",
            "expense_description": "TEST Smart Payment for material",
            "expense_amount": 30000,  # Less than cheque amount
            "vendor_name": "TEST_SmartPayVendor",
            "use_suspense": False,
            "suspense_amount_to_use": 0,
            "remarks": "Smart payment test from pytest"
        }
        
        resp = accountant_auth.post(f"{BASE_URL}/api/accountant/cheque-payment", json=payment_data)
        assert resp.status_code == 200, f"Payment failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "payment_id" in data, "Response missing payment_id"
        assert "excess_to_suspense" in data, "Response missing excess_to_suspense"
        
        # Verify excess went to suspense (50000 - 30000 = 20000)
        expected_excess = 50000 - 30000
        assert data["excess_to_suspense"] == expected_excess, f"Expected excess {expected_excess}, got {data['excess_to_suspense']}"
        
        print(f"✓ Smart Payment successful - Cheque: 50000, Expense: 30000, Excess to Suspense: {data['excess_to_suspense']}")
        print(f"  New vendor suspense balance: {data['new_suspense_balance']}")


class TestNavigationEndpoints:
    """Test navigation and role-based access"""
    
    def test_projects_endpoint_accessible(self, accountant_auth):
        """GET /api/projects - Accountant can access projects"""
        resp = accountant_auth.get(f"{BASE_URL}/api/projects")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        
        data = resp.json()
        # Response might be list or dict with projects key
        if isinstance(data, dict) and "projects" in data:
            projects = data["projects"]
        else:
            projects = data
        
        assert isinstance(projects, list), "Projects should be a list"
        print(f"✓ Retrieved {len(projects)} projects")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
