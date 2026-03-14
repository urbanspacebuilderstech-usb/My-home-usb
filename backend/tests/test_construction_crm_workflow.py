"""
Construction CRM Workflow Tests - Testing end-to-end workflow:
Site Engineer requests material/labour → PM verifies → Procurement selects vendor → Accountant pays

Tests:
1. PM Dashboard and Team Assignment
2. Site Engineer Material Request (with free-text material_name)
3. Site Engineer Labour Request (labour_expenses collection)
4. PM Labour Request Verify → pending_accounts_approval
5. Accountant Labour Approval
6. Procurement Credit Ledger with overdue tracking
7. Procurement Request Payment functionality
"""
import pytest
import requests
import os
from datetime import datetime
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from seed data
CREDENTIALS = {
    "site_engineer": {"email": "engineer@constructionos.com", "password": "Demo@1234"},
    "project_manager": {"email": "pm@constructionos.com", "password": "Demo@1234"},
    "procurement": {"email": "procurement@constructionos.com", "password": "Demo@1234"},
    "accountant": {"email": "accountant@constructionos.com", "password": "Demo@1234"},
    "super_admin": {"email": "admin@constructionos.com", "password": "Demo@1234"}
}

TEST_PROJECT_ID = "proj_murugan_001"  # Villa Murugan - Vadapalani


class TestAuthentication:
    """Test login functionality for all roles"""
    
    def test_pm_login(self):
        """PM can login successfully"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["project_manager"])
        assert response.status_code == 200, f"PM login failed: {response.text}"
        data = response.json()
        assert data.get("role") in ["project_manager", "super_admin"]
        print(f"✓ PM login success: {data.get('name')} - {data.get('role')}")
        return session
    
    def test_se_login(self):
        """Site Engineer can login successfully"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["site_engineer"])
        assert response.status_code == 200, f"SE login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "site_engineer"
        print(f"✓ SE login success: {data.get('name')} - {data.get('role')}")
        return session
    
    def test_procurement_login(self):
        """Procurement can login successfully"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["procurement"])
        assert response.status_code == 200, f"Procurement login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "procurement"
        print(f"✓ Procurement login success: {data.get('name')} - {data.get('role')}")
        return session
    
    def test_accountant_login(self):
        """Accountant can login successfully"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["accountant"])
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "accountant"
        print(f"✓ Accountant login success: {data.get('name')} - {data.get('role')}")
        return session


class TestPMDashboard:
    """PM Dashboard and Team Management Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["project_manager"])
        assert response.status_code == 200
    
    def test_pm_dashboard_loads(self):
        """GET /api/pm/dashboard returns dashboard stats"""
        response = self.session.get(f"{BASE_URL}/api/pm/dashboard")
        assert response.status_code == 200, f"PM dashboard failed: {response.text}"
        data = response.json()
        # Check required fields
        assert "total_projects" in data
        assert "active_projects" in data
        assert "pending_material_requests" in data
        assert "pending_labour_requests" in data
        assert "team_members" in data
        print(f"✓ PM Dashboard: {data['total_projects']} projects, {data['team_members']} team members")
    
    def test_pm_projects_list(self):
        """GET /api/pm/projects returns project list with team"""
        response = self.session.get(f"{BASE_URL}/api/pm/projects")
        assert response.status_code == 200, f"PM projects failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        if data:
            proj = data[0]
            assert "project_id" in proj
            assert "name" in proj
            print(f"✓ PM Projects: Found {len(data)} projects")
    
    def test_pm_team_members(self):
        """GET /api/pm/team-members returns team members"""
        response = self.session.get(f"{BASE_URL}/api/pm/team-members")
        assert response.status_code == 200, f"PM team members failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        for member in data:
            assert "user_id" in member
            assert "name" in member
            assert "role" in member
            assert member["role"] in ["associate_pm", "sr_site_engineer", "site_engineer"]
        print(f"✓ PM Team Members: Found {len(data)} members")
    
    def test_pm_material_requests(self):
        """GET /api/pm/material-requests returns requests with requester name"""
        response = self.session.get(f"{BASE_URL}/api/pm/material-requests")
        assert response.status_code == 200, f"PM material requests failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ PM Material Requests: Found {len(data)} pending requests")
    
    def test_pm_labour_requests(self):
        """GET /api/pm/labour-requests returns requests"""
        response = self.session.get(f"{BASE_URL}/api/pm/labour-requests")
        assert response.status_code == 200, f"PM labour requests failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ PM Labour Requests: Found {len(data)} pending requests")


class TestSiteEngineerMaterialRequest:
    """Site Engineer material request with free-text material_name"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["site_engineer"])
        assert response.status_code == 200
    
    def test_se_my_projects(self):
        """GET /api/site-engineer/my-projects returns assigned projects"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 200, f"SE my-projects failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ SE My Projects: Found {len(data)} assigned projects")
    
    def test_se_project_detail(self):
        """GET /api/site-engineer/project/{project_id} returns project detail"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/project/{TEST_PROJECT_ID}")
        # SE might not be assigned to this project, that's okay
        if response.status_code == 200:
            data = response.json()
            assert "project" in data
            assert "material_requests" in data
            assert "labour_requests" in data
            print(f"✓ SE Project Detail: {data['project'].get('name')}")
        else:
            print(f"⚠ SE not assigned to {TEST_PROJECT_ID} - that's expected")
    
    def test_create_material_request_with_free_text_name(self):
        """POST /api/site-engineer/material-requests with material_name (no material_id required)"""
        # First check if SE has any assigned projects
        projects_res = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert projects_res.status_code == 200
        projects = projects_res.json()
        
        if not projects:
            pytest.skip("SE has no assigned projects")
        
        project_id = projects[0]["project_id"]
        test_material_name = f"TEST_Cement_OPC_53_{uuid.uuid4().hex[:6]}"
        
        payload = {
            "project_id": project_id,
            "material_name": test_material_name,
            "quantity": 50.0,
            "unit": "bags",
            "remarks": "Test material request with free-text name"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 200, f"Create material request failed: {response.text}"
        data = response.json()
        
        assert data["material_name"] == test_material_name
        assert data["quantity"] == 50.0
        assert data["status"] == "requested"
        assert "request_id" in data
        print(f"✓ Created material request: {data['request_id']} - {test_material_name}")
        return data["request_id"]


class TestSiteEngineerLabourRequest:
    """Site Engineer labour request (uses labour_expenses collection)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["site_engineer"])
        assert response.status_code == 200
    
    def test_create_labour_request(self):
        """POST /api/site-engineer/labour-requests creates in labour_expenses collection"""
        # Get SE projects
        projects_res = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert projects_res.status_code == 200
        projects = projects_res.json()
        
        if not projects:
            pytest.skip("SE has no assigned projects")
        
        project_id = projects[0]["project_id"]
        
        payload = {
            "project_id": project_id,
            "labour_type": "mason",
            "num_workers": 5,
            "num_days": 3,
            "rate_per_day": 800.0,
            "remarks": "TEST labour request for masonry work"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/labour-requests", json=payload)
        assert response.status_code == 200, f"Create labour request failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "labour_expense_id" in data
        assert data["labour_type"] == "mason"
        assert data["num_workers"] == 5
        assert data["num_days"] == 3
        assert data["rate_per_day"] == 800.0
        assert data["total_amount"] == 5 * 3 * 800.0  # 12000
        assert data["status"] == "requested"
        print(f"✓ Created labour request: {data['labour_expense_id']} - ₹{data['total_amount']}")
        return data["labour_expense_id"]


class TestPMVerifyLabourRequest:
    """PM verifies labour request → status becomes pending_accounts_approval"""
    
    def test_pm_verify_approve(self):
        """PATCH /api/pm/labour-requests/{id}/verify?action=approve sets status to pending_accounts_approval"""
        # First create a labour request as SE
        se_session = requests.Session()
        se_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["site_engineer"])
        
        projects_res = se_session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        if projects_res.status_code != 200 or not projects_res.json():
            pytest.skip("SE has no assigned projects")
        
        project_id = projects_res.json()[0]["project_id"]
        
        payload = {
            "project_id": project_id,
            "labour_type": "helper",
            "num_workers": 2,
            "num_days": 2,
            "rate_per_day": 600.0,
            "remarks": "TEST for PM verify"
        }
        
        create_res = se_session.post(f"{BASE_URL}/api/site-engineer/labour-requests", json=payload)
        if create_res.status_code != 200:
            pytest.skip(f"Failed to create labour request: {create_res.text}")
        
        labour_id = create_res.json()["labour_expense_id"]
        
        # Now PM verifies
        pm_session = requests.Session()
        pm_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["project_manager"])
        
        verify_res = pm_session.patch(
            f"{BASE_URL}/api/pm/labour-requests/{labour_id}/verify",
            params={"action": "approve"}
        )
        assert verify_res.status_code == 200, f"PM verify failed: {verify_res.text}"
        data = verify_res.json()
        assert "pending_accounts_approval" in data.get("message", "").lower() or "verified" in data.get("message", "").lower()
        print(f"✓ PM verified labour request {labour_id} → pending_accounts_approval")
        return labour_id


class TestAccountantLabourApproval:
    """Accountant approves labour request from pending_accounts_approval status"""
    
    def test_accountant_approve_labour(self):
        """PATCH /api/site-engineer/labour-requests/{id}/approve?action=accountant_approve works"""
        # Create labour request as SE
        se_session = requests.Session()
        se_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["site_engineer"])
        
        projects_res = se_session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        if projects_res.status_code != 200 or not projects_res.json():
            pytest.skip("SE has no assigned projects")
        
        project_id = projects_res.json()[0]["project_id"]
        
        payload = {
            "project_id": project_id,
            "labour_type": "electrician",
            "num_workers": 1,
            "num_days": 1,
            "rate_per_day": 1000.0,
            "remarks": "TEST for accountant approval"
        }
        
        create_res = se_session.post(f"{BASE_URL}/api/site-engineer/labour-requests", json=payload)
        if create_res.status_code != 200:
            pytest.skip(f"Failed to create labour request: {create_res.text}")
        
        labour_id = create_res.json()["labour_expense_id"]
        
        # PM verifies
        pm_session = requests.Session()
        pm_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["project_manager"])
        pm_session.patch(
            f"{BASE_URL}/api/pm/labour-requests/{labour_id}/verify",
            params={"action": "approve"}
        )
        
        # Accountant approves
        acc_session = requests.Session()
        acc_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["accountant"])
        
        approve_res = acc_session.patch(
            f"{BASE_URL}/api/site-engineer/labour-requests/{labour_id}/approve",
            params={"action": "accountant_approve"}
        )
        assert approve_res.status_code == 200, f"Accountant approve failed: {approve_res.text}"
        data = approve_res.json()
        assert data.get("status") == "accounts_approved"
        print(f"✓ Accountant approved labour request {labour_id} → accounts_approved")


class TestProcurementCreditLedger:
    """Procurement credit ledger with overdue tracking and request payment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["procurement"])
        assert response.status_code == 200
    
    def test_credit_ledger_returns_overdue_fields(self):
        """GET /api/procurement/credit-ledger returns overdue_count and overdue_amount fields"""
        response = self.session.get(f"{BASE_URL}/api/procurement/credit-ledger")
        assert response.status_code == 200, f"Credit ledger failed: {response.text}"
        data = response.json()
        
        # Check required fields
        assert "entries" in data
        assert "total_outstanding" in data
        assert "overdue_count" in data
        assert "overdue_amount" in data
        
        print(f"✓ Credit Ledger: {len(data['entries'])} entries, ₹{data['total_outstanding']} outstanding")
        print(f"  Overdue: {data['overdue_count']} entries, ₹{data['overdue_amount']}")
        
        # Check entry structure
        for entry in data["entries"]:
            assert "vendor_name" in entry
            assert "credit_amount" in entry
            assert "balance_amount" in entry
            # Check enhanced fields
            if entry.get("payment_due_date"):
                assert "is_overdue" in entry
    
    def test_request_payment_endpoint(self):
        """POST /api/procurement/credit-ledger/{id}/request-payment works for procurement role"""
        # Get credit entries
        ledger_res = self.session.get(f"{BASE_URL}/api/procurement/credit-ledger")
        assert ledger_res.status_code == 200
        entries = ledger_res.json().get("entries", [])
        
        # Find an entry that hasn't been paid and hasn't requested payment
        unpaid_entry = None
        for entry in entries:
            if entry.get("status") != "paid" and not entry.get("payment_requested"):
                unpaid_entry = entry
                break
        
        if not unpaid_entry:
            print("⚠ No unpaid credit entries without payment request found")
            pytest.skip("No suitable credit entry for request-payment test")
        
        entry_id = unpaid_entry["entry_id"]
        response = self.session.post(f"{BASE_URL}/api/procurement/credit-ledger/{entry_id}/request-payment")
        assert response.status_code == 200, f"Request payment failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ Request payment for {entry_id}: {data['message']}")


class TestProcurementDashboard:
    """Procurement dashboard and vendor master"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["procurement"])
        assert response.status_code == 200
    
    def test_procurement_dashboard(self):
        """GET /api/procurement/dashboard returns metrics"""
        response = self.session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Procurement dashboard failed: {response.text}"
        data = response.json()
        
        assert "pending_requests" in data
        assert "pricing_in_progress" in data
        assert "waiting_accounts" in data
        print(f"✓ Procurement Dashboard: {data['pending_requests']} pending")
    
    def test_vendor_master(self):
        """GET /api/vendor-master returns vendors list"""
        response = self.session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200, f"Vendor master failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Vendor Master: {len(data)} vendors")


class TestPMAssignTeam:
    """PM assign team to project - tests ObjectId bug fix"""
    
    def test_assign_team_objectid_fix(self):
        """POST /api/pm/assign-team should work without ObjectId error"""
        pm_session = requests.Session()
        pm_session.post(f"{BASE_URL}/api/auth/login", json=CREDENTIALS["project_manager"])
        
        # Get team members
        team_res = pm_session.get(f"{BASE_URL}/api/pm/team-members")
        assert team_res.status_code == 200
        team_members = team_res.json()
        
        if not team_members:
            pytest.skip("No team members found")
        
        # Get projects
        projects_res = pm_session.get(f"{BASE_URL}/api/pm/projects")
        assert projects_res.status_code == 200
        projects = projects_res.json()
        
        if not projects:
            pytest.skip("No projects found")
        
        # Find an unassigned combination
        se_member = None
        target_project = None
        
        for member in team_members:
            if member["role"] == "site_engineer":
                for proj in projects:
                    # Check if not already assigned
                    team_ids = [t.get("user_id") for t in proj.get("team", [])]
                    if member["user_id"] not in team_ids:
                        se_member = member
                        target_project = proj
                        break
                if se_member:
                    break
        
        if not se_member or not target_project:
            # All SEs are assigned to all projects - just test with any combo
            # It will return 400 "already assigned" which is valid
            se_member = team_members[0]
            target_project = projects[0]
        
        payload = {
            "project_id": target_project["project_id"],
            "user_id": se_member["user_id"]
        }
        
        response = pm_session.post(f"{BASE_URL}/api/pm/assign-team", json=payload)
        # 200 = success, 400 = already assigned (both valid)
        assert response.status_code in [200, 400], f"Assign team failed with unexpected error: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"✓ Assigned {se_member['name']} to {target_project['name']}")
        else:
            print(f"⚠ {response.json().get('detail', 'Already assigned')} - that's valid")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
