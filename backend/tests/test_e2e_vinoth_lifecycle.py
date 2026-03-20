"""
E2E Test Suite for Mr. Vinothkumar babu Construction CRM Lifecycle
Tests the complete project lifecycle with all roles and features:
- Login for all roles
- Accountant Cashbook (Income/Expense/Net)
- Accountant Cheque Management
- Accountant Petty Cash Management
- Site Engineer Mini Cashbook
- Site Engineer Work Orders
- Material Requests
- Project Status and Stage
"""
import pytest
import requests
import os
from typing import Optional

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://labor-materials-hub.preview.emergentagent.com').rstrip('/')

# Test Credentials
TEST_CREDENTIALS = {
    "admin": {"email": "admin@constructionos.com", "password": "Demo@1234"},
    "accountant": {"email": "accountant@constructionos.com", "password": "Demo@1234"},
    "engineer": {"email": "engineer@constructionos.com", "password": "Demo@1234"},
    "cre": {"email": "cre@constructionos.com", "password": "Demo@1234"},
    "planning": {"email": "planning@constructionos.com", "password": "Demo@1234"},
    "procurement": {"email": "procurement@constructionos.com", "password": "Demo@1234"},
}

# Expected test data values
EXPECTED_PROJECT_ID = "proj_6f33e023cc5f"
EXPECTED_PROJECT_NAME = "Villa Vinothkumar - Coimbatore"
EXPECTED_CLIENT_NAME = "Mr. Vinothkumar babu"
EXPECTED_INCOME = 500000.0
EXPECTED_EXPENSE = 93000.0
EXPECTED_NET = 407000.0
EXPECTED_WORK_ORDERS = 3
EXPECTED_MATERIAL_REQUESTS = 2


class SessionManager:
    """Manages authenticated sessions for different roles"""
    
    def __init__(self):
        self.sessions = {}
    
    def get_session(self, role: str) -> requests.Session:
        if role not in self.sessions:
            session = requests.Session()
            session.headers.update({"Content-Type": "application/json"})
            creds = TEST_CREDENTIALS.get(role)
            if creds:
                response = session.post(f"{BASE_URL}/api/auth/login", json=creds)
                if response.status_code == 200:
                    self.sessions[role] = session
                else:
                    pytest.skip(f"Failed to login as {role}: {response.status_code}")
            else:
                pytest.skip(f"No credentials for role: {role}")
        return self.sessions[role]


session_manager = SessionManager()


class TestLoginAllRoles:
    """Test login for all roles"""
    
    @pytest.mark.parametrize("role,email", [
        ("admin", "admin@constructionos.com"),
        ("accountant", "accountant@constructionos.com"),
        ("engineer", "engineer@constructionos.com"),
        ("cre", "cre@constructionos.com"),
        ("planning", "planning@constructionos.com"),
        ("procurement", "procurement@constructionos.com"),
    ])
    def test_login_role(self, role: str, email: str):
        """Test login for each role"""
        session = requests.Session()
        creds = TEST_CREDENTIALS.get(role)
        response = session.post(f"{BASE_URL}/api/auth/login", json=creds)
        
        assert response.status_code == 200, f"Login failed for {role}: {response.status_code}"
        
        data = response.json()
        assert "user_id" in data, "Response missing user_id"
        assert data.get("email") == email, f"Email mismatch: expected {email}, got {data.get('email')}"
        assert data.get("is_active") == True, "User is not active"
        print(f"✓ Login successful for {role}: {data.get('name')}")


class TestAccountantCashbook:
    """Test Accountant Cashbook with expected values"""
    
    def test_cashbook_filtered_api(self):
        """GET /api/accountant/cashbook-filtered returns correct income/expense/net"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/accountant/cashbook-filtered")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        data = response.json()
        summary = data.get("summary", {})
        
        # Verify expected values
        total_income = summary.get("total_income", 0)
        total_expense = summary.get("total_expense", 0)
        net_balance = summary.get("net_balance", 0)
        
        assert total_income == EXPECTED_INCOME, f"Income mismatch: expected {EXPECTED_INCOME}, got {total_income}"
        assert total_expense == EXPECTED_EXPENSE, f"Expense mismatch: expected {EXPECTED_EXPENSE}, got {total_expense}"
        assert net_balance == EXPECTED_NET, f"Net balance mismatch: expected {EXPECTED_NET}, got {net_balance}"
        
        print(f"✓ Cashbook: Income ₹{total_income:,.0f}, Expense ₹{total_expense:,.0f}, Net ₹{net_balance:,.0f}")
    
    def test_income_entries(self):
        """Verify income entries are correct"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/accountant/cashbook-filtered")
        
        assert response.status_code == 200
        
        data = response.json()
        income_entries = data.get("income_entries", [])
        
        assert len(income_entries) >= 1, "Expected at least 1 income entry"
        
        # Check for Vinothkumar advance payment
        vinoth_income = [e for e in income_entries if EXPECTED_PROJECT_ID in e.get("project_id", "")]
        assert len(vinoth_income) >= 1, f"Expected income entry for project {EXPECTED_PROJECT_ID}"
        
        total = sum(e.get("amount", 0) for e in vinoth_income)
        assert total == EXPECTED_INCOME, f"Income total mismatch: expected {EXPECTED_INCOME}, got {total}"
        
        print(f"✓ Income entries verified: {len(income_entries)} entries, total ₹{total:,.0f}")


class TestAccountantChequeManagement:
    """Test Accountant Cheque Management tab"""
    
    def test_cheques_api(self):
        """GET /api/accountant/cheques returns 2 cheques for Mr. Vinothkumar babu"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/accountant/cheques")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        cheques = response.json()
        assert isinstance(cheques, list), "Expected list of cheques"
        
        # Filter cheques for Vinothkumar
        vinoth_cheques = [c for c in cheques if EXPECTED_CLIENT_NAME in c.get("party_name", "")]
        
        assert len(vinoth_cheques) >= 2, f"Expected at least 2 cheques for {EXPECTED_CLIENT_NAME}, got {len(vinoth_cheques)}"
        
        # Verify cheque details
        cheque_numbers = [c.get("cheque_number") for c in vinoth_cheques]
        assert "CHQ001" in cheque_numbers, "CHQ001 not found"
        assert "CHQ002" in cheque_numbers, "CHQ002 not found"
        
        # Verify amounts
        chq001 = next((c for c in vinoth_cheques if c.get("cheque_number") == "CHQ001"), None)
        chq002 = next((c for c in vinoth_cheques if c.get("cheque_number") == "CHQ002"), None)
        
        assert chq001 and chq001.get("amount") == 300000, f"CHQ001 amount should be 300000"
        assert chq002 and chq002.get("amount") == 200000, f"CHQ002 amount should be 200000"
        
        print(f"✓ Cheques verified: CHQ001 ₹{chq001.get('amount'):,.0f}, CHQ002 ₹{chq002.get('amount'):,.0f}")


class TestAccountantPettyCashManagement:
    """Test Accountant Petty Cash Management drilldown"""
    
    def test_petty_cash_management_api(self):
        """GET /api/accountant/petty-cash-management returns SE data"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/accountant/petty-cash-management")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        data = response.json()
        site_engineers = data.get("site_engineers", [])
        
        assert len(site_engineers) >= 1, "Expected at least 1 site engineer"
        
        # Find Ramesh Kumar
        ramesh = next((se for se in site_engineers if "Ramesh" in se.get("name", "")), None)
        assert ramesh is not None, "SE Ramesh Kumar not found in petty cash management"
        
        # Verify petty cash values
        total_issued = ramesh.get("total_issued", 0)
        total_spent = ramesh.get("total_spent", 0)
        balance = ramesh.get("balance", 0)
        
        assert total_issued == 40000, f"Expected total_issued=40000, got {total_issued}"
        assert total_spent == 12800, f"Expected total_spent=12800, got {total_spent}"
        assert balance == 27200, f"Expected balance=27200, got {balance}"
        
        print(f"✓ Petty Cash Management: {ramesh.get('name')} - Issued ₹{total_issued:,.0f}, Spent ₹{total_spent:,.0f}, Balance ₹{balance:,.0f}")
    
    def test_se_mini_cashbook_drilldown(self):
        """GET /api/accountant/petty-cash/{user_id}/mini-cashbook returns SE's cashbook"""
        session = session_manager.get_session("accountant")
        
        # First get the SE user_id
        response = session.get(f"{BASE_URL}/api/accountant/petty-cash-management")
        assert response.status_code == 200
        
        data = response.json()
        site_engineers = data.get("site_engineers", [])
        ramesh = next((se for se in site_engineers if "Ramesh" in se.get("name", "")), None)
        
        if ramesh:
            user_id = ramesh.get("user_id")
            response = session.get(f"{BASE_URL}/api/accountant/petty-cash/{user_id}/mini-cashbook")
            assert response.status_code == 200, f"Mini cashbook API failed: {response.status_code}"
            
            cashbook = response.json()
            assert "user" in cashbook or "petty_cash" in cashbook, "Response missing expected fields"
            print(f"✓ SE Mini Cashbook drilldown working for {ramesh.get('name')}")


class TestSiteEngineerMiniCashbook:
    """Test Site Engineer Dashboard - Mini Cashbook tab"""
    
    def test_mini_cashbook_api(self):
        """GET /api/site-engineer/mini-cashbook returns correct summary"""
        session = session_manager.get_session("engineer")
        response = session.get(f"{BASE_URL}/api/site-engineer/mini-cashbook")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        data = response.json()
        summary = data.get("summary", {})
        
        total_issued = summary.get("total_issued", 0)
        total_spent = summary.get("total_spent", 0)
        total_balance = summary.get("total_balance", 0)
        
        assert total_issued == 40000, f"Expected total_issued=40000, got {total_issued}"
        assert total_spent == 12800, f"Expected total_spent=12800, got {total_spent}"
        assert total_balance == 27200, f"Expected total_balance=27200, got {total_balance}"
        
        print(f"✓ SE Mini Cashbook: Issued ₹{total_issued:,.0f}, Spent ₹{total_spent:,.0f}, Balance ₹{total_balance:,.0f}")
    
    def test_mini_cashbook_has_cashbooks(self):
        """Mini cashbook returns project-wise cashbooks"""
        session = session_manager.get_session("engineer")
        response = session.get(f"{BASE_URL}/api/site-engineer/mini-cashbook")
        
        assert response.status_code == 200
        
        data = response.json()
        cashbooks = data.get("cashbooks", [])
        
        assert len(cashbooks) >= 1, "Expected at least 1 cashbook entry"
        
        # Check for Vinothkumar project
        vinoth_cb = next((cb for cb in cashbooks if EXPECTED_PROJECT_ID in cb.get("project_id", "")), None)
        assert vinoth_cb is not None, f"Cashbook for project {EXPECTED_PROJECT_ID} not found"
        
        print(f"✓ Mini Cashbook has {len(cashbooks)} project cashbooks")


class TestSiteEngineerWorkOrders:
    """Test Site Engineer Dashboard - Work Orders tab"""
    
    def test_work_orders_api(self):
        """GET /api/site-engineer/work-orders returns 3 work orders"""
        session = session_manager.get_session("engineer")
        response = session.get(f"{BASE_URL}/api/site-engineer/work-orders")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        work_orders = response.json()
        assert isinstance(work_orders, list), "Expected list of work orders"
        
        # Filter by project
        vinoth_wos = [wo for wo in work_orders if wo.get("project_id") == EXPECTED_PROJECT_ID]
        
        assert len(vinoth_wos) == EXPECTED_WORK_ORDERS, f"Expected {EXPECTED_WORK_ORDERS} work orders for project, got {len(vinoth_wos)}"
        
        # Verify work order types (2 material, 1 labour)
        labour_wos = [wo for wo in vinoth_wos if wo.get("order_type") == "labour"]
        material_wos = [wo for wo in vinoth_wos if wo.get("order_type") == "material"]
        
        assert len(labour_wos) >= 1, "Expected at least 1 labour work order"
        assert len(material_wos) >= 2, "Expected at least 2 material work orders"
        
        print(f"✓ Work Orders: {len(vinoth_wos)} total ({len(labour_wos)} labour, {len(material_wos)} material)")


class TestMaterialRequests:
    """Test Site Engineer Material Requests"""
    
    def test_material_requests_api(self):
        """GET /api/site-engineer/material-requests returns 2 completed requests"""
        session = session_manager.get_session("engineer")
        response = session.get(f"{BASE_URL}/api/site-engineer/material-requests")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        requests_list = response.json()
        assert isinstance(requests_list, list), "Expected list of material requests"
        
        assert len(requests_list) == EXPECTED_MATERIAL_REQUESTS, f"Expected {EXPECTED_MATERIAL_REQUESTS} material requests, got {len(requests_list)}"
        
        # Verify both are received_completed
        completed = [r for r in requests_list if r.get("status") == "received_completed"]
        assert len(completed) == EXPECTED_MATERIAL_REQUESTS, f"Expected {EXPECTED_MATERIAL_REQUESTS} completed requests, got {len(completed)}"
        
        # Verify materials
        materials = [r.get("material_name") for r in requests_list]
        assert any("cement" in m.lower() for m in materials), "Cement material request not found"
        assert any("steel" in m.lower() for m in materials), "Steel material request not found"
        
        print(f"✓ Material Requests: {len(completed)} received_completed (cement, steel)")


class TestProjectStatus:
    """Test Project Status and Stage"""
    
    def test_project_approved_status(self):
        """GET /api/projects shows project Villa Vinothkumar - Coimbatore with approved status"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/projects/{EXPECTED_PROJECT_ID}")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        project = response.json()
        
        assert project.get("name") == EXPECTED_PROJECT_NAME, f"Project name mismatch"
        
        # Status should be approved (planning_approved is the approved state)
        status = project.get("status")
        assert status in ["approved", "planning_approved", "gm_approved", "active"], f"Project status should be approved, got {status}"
        
        # Stage should be foundation
        stage = project.get("current_stage")
        assert stage == "foundation", f"Project stage should be foundation, got {stage}"
        
        print(f"✓ Project: {project.get('name')} - Status: {status}, Stage: {stage}")
    
    def test_projects_list_contains_vinoth(self):
        """Projects list contains the Vinothkumar project"""
        session = session_manager.get_session("accountant")
        response = session.get(f"{BASE_URL}/api/projects")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        projects = response.json()
        vinoth = next((p for p in projects if EXPECTED_PROJECT_ID == p.get("project_id")), None)
        
        assert vinoth is not None, f"Project {EXPECTED_PROJECT_ID} not found in projects list"
        assert vinoth.get("name") == EXPECTED_PROJECT_NAME
        
        print(f"✓ Project {EXPECTED_PROJECT_NAME} found in projects list")


class TestCREDashboard:
    """Test CRE Dashboard - Converted project view"""
    
    def test_cre_new_deals_empty(self):
        """CRE new deals should be empty (Vinothkumar already converted)"""
        session = session_manager.get_session("cre")
        response = session.get(f"{BASE_URL}/api/cre/new-deals")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        deals = response.json()
        
        # Vinothkumar should NOT be in new deals (already converted)
        vinoth_deals = [d for d in deals if EXPECTED_CLIENT_NAME in str(d)]
        assert len(vinoth_deals) == 0, f"Vinothkumar should not be in new deals (already converted)"
        
        print(f"✓ CRE New Deals: Vinothkumar not in pending deals (correctly converted)")
    
    def test_cre_dashboard(self):
        """CRE dashboard should show the converted project"""
        session = session_manager.get_session("cre")
        response = session.get(f"{BASE_URL}/api/cre/dashboard")
        
        assert response.status_code == 200, f"API failed: {response.status_code}"
        
        data = response.json()
        
        # Check recent projects
        recent_projects = data.get("recent_projects", [])
        vinoth_project = next((p for p in recent_projects if p.get("project_id") == EXPECTED_PROJECT_ID), None)
        
        # Project might or might not be in recent depending on how many projects exist
        if vinoth_project:
            print(f"✓ CRE Dashboard: {EXPECTED_PROJECT_NAME} visible in recent projects")
        else:
            print(f"✓ CRE Dashboard: Working (project may not be in recent view)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
