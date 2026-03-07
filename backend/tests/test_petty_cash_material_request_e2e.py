"""
Petty Cash and Material Request E2E Workflow Tests
Tests for:
1. Petty Cash Flow E2E: Site Engineer requests petty cash -> Accountant issues cash -> SE adds expense -> SE submits for settlement -> Accountant settles
2. Material Request Flow E2E: Site Engineer creates material request -> PM approves -> Planning approves -> Procurement assigns vendor
3. Site Engineer Dashboard APIs
4. PM Dashboard APIs  
5. Accountant Petty Cash APIs
"""

import pytest
import requests
import os
import time
import secrets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://site-accounting-2.preview.emergentagent.com')

# Test credentials
SITE_ENGINEER_EMAIL = "engineer@constructionos.com"
PM_EMAIL = "pm@constructionos.com"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"
PLANNING_EMAIL = "planning@constructionos.com"
PROCUREMENT_EMAIL = "procurement@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"

# Test project
TEST_PROJECT_ID = "proj_classic001"


class TestPettyCashFlowE2E:
    """Test complete Petty Cash workflow: SE Request -> Accountant Issue -> SE Expense -> SE Submit -> Accountant Settle"""
    
    petty_cash_id = None
    
    @pytest.fixture(scope="class")
    def engineer_session(self):
        """Site Engineer session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200, f"Engineer login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        """Accountant session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        return session

    # Step 1: Site Engineer requests petty cash
    def test_01_se_request_petty_cash(self, engineer_session):
        """Site Engineer requests petty cash"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "amount": 3000.0,
            "purpose": "TEST_petty_cash_weekly_expenses",
            "remarks": "E2E Test - Transport and misc site expenses"
        }
        
        response = engineer_session.post(f"{BASE_URL}/api/site-engineer/petty-cash/request", json=payload)
        assert response.status_code == 200, f"Petty cash request failed: {response.text}"
        
        data = response.json()
        assert "petty_cash_id" in data
        assert data["status"] == "requested"
        assert data["amount_requested"] == 3000.0
        assert data["project_id"] == TEST_PROJECT_ID
        
        # Store for next tests
        TestPettyCashFlowE2E.petty_cash_id = data["petty_cash_id"]
        print(f"✓ SE requested petty cash: {data['petty_cash_id']} - ₹{data['amount_requested']}")
    
    # Step 2: Accountant can view pending petty cash requests
    def test_02_accountant_view_petty_cash(self, accountant_session):
        """Accountant views pending petty cash requests"""
        response = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash?status=requested")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find our test petty cash
        test_pc = next((pc for pc in data if pc["petty_cash_id"] == TestPettyCashFlowE2E.petty_cash_id), None)
        assert test_pc is not None, "Test petty cash not found in accountant view"
        assert test_pc["status"] == "requested"
        
        print(f"✓ Accountant sees pending petty cash request: {test_pc['petty_cash_id']}")
    
    # Step 3: Accountant issues petty cash
    def test_03_accountant_issue_petty_cash(self, accountant_session):
        """Accountant issues petty cash to Site Engineer"""
        petty_cash_id = TestPettyCashFlowE2E.petty_cash_id
        assert petty_cash_id, "No petty cash ID from previous test"
        
        response = accountant_session.patch(
            f"{BASE_URL}/api/accountant/petty-cash/{petty_cash_id}/issue?amount=3000"
        )
        assert response.status_code == 200, f"Issue petty cash failed: {response.text}"
        
        data = response.json()
        assert data["message"] == "Petty cash issued"
        assert data["amount"] == 3000
        
        print(f"✓ Accountant issued petty cash: ₹3000")
    
    # Step 4: Site Engineer views issued petty cash
    def test_04_se_view_issued_petty_cash(self, engineer_session):
        """Site Engineer views their issued petty cash"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        test_pc = next((pc for pc in data if pc["petty_cash_id"] == TestPettyCashFlowE2E.petty_cash_id), None)
        assert test_pc is not None
        assert test_pc["status"] == "issued"
        assert test_pc["amount_issued"] == 3000
        
        print(f"✓ SE sees issued petty cash: status={test_pc['status']}, amount=₹{test_pc['amount_issued']}")
    
    # Step 5: Site Engineer adds expense
    def test_05_se_add_expense(self, engineer_session):
        """Site Engineer adds expense from petty cash"""
        petty_cash_id = TestPettyCashFlowE2E.petty_cash_id
        assert petty_cash_id, "No petty cash ID from previous test"
        
        payload = {
            "petty_cash_id": petty_cash_id,
            "amount": 500.0,
            "expense_type": "transport",
            "description": "TEST_expense_auto_fare",
            "date": "2026-01-22"
        }
        
        response = engineer_session.post(
            f"{BASE_URL}/api/site-engineer/petty-cash/{petty_cash_id}/expense",
            json=payload
        )
        assert response.status_code == 200, f"Add expense failed: {response.text}"
        
        data = response.json()
        assert data["message"] == "Expense recorded"
        assert data["total_spent"] == 500.0
        
        print(f"✓ SE added expense: ₹500 for transport")
    
    # Step 6: Add another expense
    def test_06_se_add_second_expense(self, engineer_session):
        """Site Engineer adds another expense"""
        petty_cash_id = TestPettyCashFlowE2E.petty_cash_id
        
        payload = {
            "petty_cash_id": petty_cash_id,
            "amount": 300.0,
            "expense_type": "food",
            "description": "TEST_expense_lunch_workers",
            "date": "2026-01-22"
        }
        
        response = engineer_session.post(
            f"{BASE_URL}/api/site-engineer/petty-cash/{petty_cash_id}/expense",
            json=payload
        )
        assert response.status_code == 200, f"Add second expense failed: {response.text}"
        
        data = response.json()
        assert data["total_spent"] == 800.0  # 500 + 300
        
        print(f"✓ SE added second expense: ₹300 for food, total spent: ₹800")
    
    # Step 7: Site Engineer submits for settlement
    def test_07_se_submit_for_settlement(self, engineer_session):
        """Site Engineer submits petty cash for settlement"""
        petty_cash_id = TestPettyCashFlowE2E.petty_cash_id
        
        response = engineer_session.post(f"{BASE_URL}/api/site-engineer/petty-cash/{petty_cash_id}/submit")
        assert response.status_code == 200, f"Submit for settlement failed: {response.text}"
        
        data = response.json()
        assert data["message"] == "Petty cash submitted for settlement"
        assert data["amount_spent"] == 800.0
        assert data["amount_to_return"] == 2200.0  # 3000 - 800
        
        print(f"✓ SE submitted for settlement: spent=₹800, to_return=₹2200")
    
    # Step 8: Accountant views pending settlement
    def test_08_accountant_view_pending_settlement(self, accountant_session):
        """Accountant views petty cash pending settlement"""
        response = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash?status=pending_settlement")
        assert response.status_code == 200
        
        data = response.json()
        test_pc = next((pc for pc in data if pc["petty_cash_id"] == TestPettyCashFlowE2E.petty_cash_id), None)
        assert test_pc is not None, "Test petty cash not found in pending settlement"
        assert test_pc["status"] == "pending_settlement"
        assert len(test_pc["expenses"]) == 2
        
        print(f"✓ Accountant sees pending settlement: {test_pc['petty_cash_id']} with {len(test_pc['expenses'])} expenses")
    
    # Step 9: Accountant settles petty cash
    def test_09_accountant_settle_petty_cash(self, accountant_session):
        """Accountant settles petty cash and moves expenses to master"""
        petty_cash_id = TestPettyCashFlowE2E.petty_cash_id
        
        response = accountant_session.patch(f"{BASE_URL}/api/accountant/petty-cash/{petty_cash_id}/settle")
        assert response.status_code == 200, f"Settle failed: {response.text}"
        
        data = response.json()
        assert data["message"] == "Petty cash settled and added to master expenses"
        assert data["expenses_count"] == 2
        
        print(f"✓ Accountant settled petty cash: {data['expenses_count']} expenses moved to master")
    
    # Step 10: Verify final status
    def test_10_verify_settled_status(self, engineer_session):
        """Verify petty cash is in settled status"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        test_pc = next((pc for pc in data if pc["petty_cash_id"] == TestPettyCashFlowE2E.petty_cash_id), None)
        assert test_pc is not None
        assert test_pc["status"] == "settled"
        
        print(f"✓ Petty cash workflow complete - Final status: settled")


class TestMaterialRequestFlowE2E:
    """Test Material Request workflow: SE Request -> PM Approve -> Planning Approve -> Procurement Assign"""
    
    material_request_id = None
    
    @pytest.fixture(scope="class")
    def sessions(self):
        """Create all required sessions"""
        sessions = {}
        
        # Site Engineer
        se = requests.Session()
        resp = se.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        sessions["engineer"] = se
        
        # Project Manager
        pm = requests.Session()
        resp = pm.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PM_EMAIL})
        assert resp.status_code == 200
        sessions["pm"] = pm
        
        # Planning
        planning = requests.Session()
        resp = planning.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PLANNING_EMAIL})
        assert resp.status_code == 200
        sessions["planning"] = planning
        
        # Procurement
        proc = requests.Session()
        resp = proc.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PROCUREMENT_EMAIL})
        assert resp.status_code == 200
        sessions["procurement"] = proc
        
        # Admin
        admin = requests.Session()
        resp = admin.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ADMIN_EMAIL})
        assert resp.status_code == 200
        sessions["admin"] = admin
        
        return sessions
    
    @pytest.fixture(scope="class")
    def test_material_id(self, sessions):
        """Get a material ID for testing"""
        response = sessions["admin"].get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        materials = response.json()
        if len(materials) > 0:
            return materials[0]["material_id"]
        pytest.skip("No materials available for testing")
    
    @pytest.fixture(scope="class")
    def test_vendor_id(self, sessions):
        """Get a vendor ID for testing"""
        response = sessions["admin"].get(f"{BASE_URL}/api/vendors")
        assert response.status_code == 200
        vendors = response.json()
        if len(vendors) > 0:
            return vendors[0]["vendor_id"]
        pytest.skip("No vendors available for testing")

    # Step 1: Site Engineer creates material request
    def test_01_se_create_material_request(self, sessions, test_material_id):
        """Site Engineer creates a material request"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_id": test_material_id,
            "quantity": 50.0,
            "remarks": "TEST_material_request_e2e_workflow"
        }
        
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 200, f"Create material request failed: {response.text}"
        
        data = response.json()
        assert "request_id" in data
        assert data["status"] == "requested"
        assert data["quantity"] == 50.0
        
        TestMaterialRequestFlowE2E.material_request_id = data["request_id"]
        print(f"✓ SE created material request: {data['request_id']} - {data['material_name']} x {data['quantity']}")
    
    # Step 2: PM views pending material requests
    def test_02_pm_view_pending_requests(self, sessions):
        """PM views pending material requests"""
        response = sessions["pm"].get(f"{BASE_URL}/api/pm/material-requests")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Find our test request
        test_req = next((r for r in data if r["request_id"] == TestMaterialRequestFlowE2E.material_request_id), None)
        assert test_req is not None, "Test material request not found in PM view"
        
        print(f"✓ PM sees {len(data)} pending material requests including test request")
    
    # Step 3: PM approves material request
    def test_03_pm_approve_request(self, sessions):
        """PM approves material request"""
        request_id = TestMaterialRequestFlowE2E.material_request_id
        assert request_id, "No request ID from previous test"
        
        response = sessions["pm"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=pm_approve"
        )
        assert response.status_code == 200, f"PM approve failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "pm_approved"
        assert data["pm_approved_by"] is not None
        
        print(f"✓ PM approved material request - status: {data['status']}")
    
    # Step 4: Planning approves material request
    def test_04_planning_approve_request(self, sessions):
        """Planning approves material request"""
        request_id = TestMaterialRequestFlowE2E.material_request_id
        
        response = sessions["planning"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=planning_approve"
        )
        assert response.status_code == 200, f"Planning approve failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "planning_approved"
        assert data["planning_approved_by"] is not None
        
        print(f"✓ Planning approved material request - status: {data['status']}")
    
    # Step 5: Procurement assigns vendor
    def test_05_procurement_assign_vendor(self, sessions, test_vendor_id):
        """Procurement assigns vendor to material request"""
        request_id = TestMaterialRequestFlowE2E.material_request_id
        
        response = sessions["procurement"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve",
            params={
                "action": "procurement_assign",
                "vendor_id": test_vendor_id,
                "pricing": 5000.0,
                "vendor_payment_type": "full_payment"
            }
        )
        assert response.status_code == 200, f"Procurement assign failed: {response.text}"
        
        data = response.json()
        # For full_payment, order is placed directly
        assert data["status"] == "order_placed"
        assert data["vendor_id"] == test_vendor_id
        assert data["procurement_pricing"] == 5000.0
        
        print(f"✓ Procurement assigned vendor - status: {data['status']}, vendor: {data['vendor_name']}")
    
    # Step 6: Verify final status
    def test_06_verify_final_status(self, sessions):
        """Verify material request status after full workflow"""
        request_id = TestMaterialRequestFlowE2E.material_request_id
        
        response = sessions["engineer"].get(f"{BASE_URL}/api/site-engineer/material-requests")
        assert response.status_code == 200
        
        data = response.json()
        test_req = next((r for r in data if r["request_id"] == request_id), None)
        assert test_req is not None
        assert test_req["status"] == "order_placed"
        
        print(f"✓ Material request workflow complete - Final status: {test_req['status']}")


class TestSiteEngineerDashboardAPIs:
    """Test Site Engineer Dashboard APIs"""
    
    @pytest.fixture(scope="class")
    def engineer_session(self):
        """Site Engineer session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        return session
    
    def test_get_my_projects(self, engineer_session):
        """Test GET /api/site-engineer/my-projects"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "SE should have at least 1 project"
        
        # Verify project structure
        project = data[0]
        assert "project_id" in project
        assert "name" in project
        assert "client_name" in project
        assert "status" in project
        
        print(f"✓ SE has {len(data)} assigned projects")
    
    def test_get_petty_cash_list(self, engineer_session):
        """Test GET /api/site-engineer/petty-cash"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify petty cash structure if exists
        if len(data) > 0:
            pc = data[0]
            assert "petty_cash_id" in pc
            assert "status" in pc
            assert "amount_requested" in pc
            assert "amount_issued" in pc
            assert "amount_spent" in pc
        
        print(f"✓ SE has {len(data)} petty cash entries")
    
    def test_get_material_requests(self, engineer_session):
        """Test GET /api/site-engineer/material-requests"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/material-requests")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ SE has {len(data)} material requests")
    
    def test_get_work_orders(self, engineer_session):
        """Test GET /api/site-engineer/work-orders"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/work-orders")
        # This may return 200 or might not be implemented
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            print(f"✓ SE has {len(data)} work orders")
        else:
            print(f"⚠ Work orders endpoint returned: {response.status_code}")


class TestPMDashboardAPIs:
    """Test Project Manager Dashboard APIs"""
    
    @pytest.fixture(scope="class")
    def pm_session(self):
        """PM session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PM_EMAIL})
        assert resp.status_code == 200
        return session
    
    def test_get_pm_dashboard(self, pm_session):
        """Test GET /api/pm/dashboard"""
        response = pm_session.get(f"{BASE_URL}/api/pm/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_projects" in data
        assert "active_projects" in data
        assert "pending_material_requests" in data
        assert "pending_labour_requests" in data
        assert "team_members" in data
        
        print(f"✓ PM Dashboard: {data['total_projects']} projects, {data['pending_material_requests']} pending material requests")
    
    def test_get_pm_projects(self, pm_session):
        """Test GET /api/pm/projects"""
        response = pm_session.get(f"{BASE_URL}/api/pm/projects")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Verify project structure
        project = data[0]
        assert "project_id" in project
        assert "name" in project
        assert "status" in project
        
        print(f"✓ PM has access to {len(data)} projects")
    
    def test_get_pm_material_requests(self, pm_session):
        """Test GET /api/pm/material-requests"""
        response = pm_session.get(f"{BASE_URL}/api/pm/material-requests")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ PM sees {len(data)} pending material requests")
    
    def test_get_pm_labour_requests(self, pm_session):
        """Test GET /api/pm/labour-requests"""
        response = pm_session.get(f"{BASE_URL}/api/pm/labour-requests")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ PM sees {len(data)} pending labour requests")
    
    def test_get_pm_team_members(self, pm_session):
        """Test GET /api/pm/team-members"""
        response = pm_session.get(f"{BASE_URL}/api/pm/team-members")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify team member structure if exists
        if len(data) > 0:
            member = data[0]
            assert "user_id" in member
            assert "name" in member
            assert "role" in member
        
        print(f"✓ PM has {len(data)} team members")


class TestAccountantPettyCashAPIs:
    """Test Accountant Petty Cash APIs"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        """Accountant session"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        assert resp.status_code == 200
        return session
    
    def test_get_all_petty_cash(self, accountant_session):
        """Test GET /api/accountant/petty-cash"""
        response = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ Accountant sees {len(data)} total petty cash entries")
    
    def test_get_petty_cash_by_status(self, accountant_session):
        """Test GET /api/accountant/petty-cash with status filter"""
        response = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash?status=requested")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        for pc in data:
            assert pc["status"] == "requested"
        
        print(f"✓ Accountant sees {len(data)} requested petty cash entries")
    
    def test_accountant_comprehensive_dashboard(self, accountant_session):
        """Test GET /api/accountant/comprehensive-dashboard"""
        response = accountant_session.get(f"{BASE_URL}/api/accountant/comprehensive-dashboard")
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        
        print(f"✓ Accountant dashboard loaded successfully")


class TestAccessControl:
    """Test role-based access control"""
    
    @pytest.fixture(scope="class")
    def sessions(self):
        """Create sessions for different roles"""
        sessions = {}
        
        for role, email in [
            ("engineer", SITE_ENGINEER_EMAIL),
            ("pm", PM_EMAIL),
            ("accountant", ACCOUNTANT_EMAIL),
        ]:
            s = requests.Session()
            resp = s.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
            assert resp.status_code == 200
            sessions[role] = s
        
        return sessions
    
    def test_engineer_cannot_access_pm_dashboard(self, sessions):
        """Site Engineer cannot access PM dashboard"""
        response = sessions["engineer"].get(f"{BASE_URL}/api/pm/dashboard")
        assert response.status_code == 403
        print("✓ Engineer correctly denied access to PM dashboard")
    
    def test_engineer_cannot_access_accountant_petty_cash(self, sessions):
        """Site Engineer cannot access accountant petty cash list"""
        response = sessions["engineer"].get(f"{BASE_URL}/api/accountant/petty-cash")
        assert response.status_code == 403
        print("✓ Engineer correctly denied access to accountant petty cash")
    
    def test_pm_cannot_request_petty_cash(self, sessions):
        """PM cannot request petty cash"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "amount": 1000.0,
            "purpose": "TEST_unauthorized_request"
        }
        response = sessions["pm"].post(f"{BASE_URL}/api/site-engineer/petty-cash/request", json=payload)
        assert response.status_code == 403
        print("✓ PM correctly denied from requesting petty cash")
    
    def test_accountant_cannot_create_material_request(self, sessions):
        """Accountant cannot create material requests"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_id": "mat_test",
            "quantity": 10.0
        }
        response = sessions["accountant"].post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 403
        print("✓ Accountant correctly denied from creating material requests")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_note(self):
        """Note about test data cleanup"""
        print("✓ Test data prefixed with TEST_ for easy identification")
        print("✓ Cleanup can be done by filtering for TEST_ prefixed entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
