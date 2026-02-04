"""
Test Super Admin Dashboard - Summary Cards, Expense Bar, Project List, Create Project
Tests the new Super Admin Dashboard with 3 summary sections, expense bar, and project list
"""
import pytest
import requests
import os
from pathlib import Path

# Load from frontend .env file
env_path = Path('/app/frontend/.env')
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith('#') and '=' in line:
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sitehub-38.preview.emergentagent.com').rstrip('/')


class TestSuperAdminAuth:
    """Test authentication for super admin"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session for super admin"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return s
    
    def test_super_admin_login(self, session):
        """Test super admin can login"""
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@constructionos.com"
        assert data["role"] == "super_admin"
        print(f"Super admin logged in: {data['name']}")


class TestDashboardSummaryEndpoint:
    """Test /api/admin/dashboard-summary endpoint"""
    
    @pytest.fixture(scope="class")
    def super_admin_session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    @pytest.fixture(scope="class")
    def pm_session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_dashboard_summary_returns_totals(self, super_admin_session):
        """Test dashboard-summary returns totals section"""
        response = super_admin_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "totals" in data
        
        totals = data["totals"]
        # Project Value section
        assert "project_total_value" in totals
        assert "project_addition_cost" in totals
        assert "project_value_total" in totals
        
        # Income section
        assert "income_project" in totals
        assert "income_additional" in totals
        assert "income_total" in totals
        
        # Balance section
        assert "balance_project" in totals
        assert "balance_additional" in totals
        assert "balance_grand_total" in totals
        
        # Expense section
        assert "total_expense" in totals
        assert "cash_in_book" in totals
        
        print(f"Totals: Project Value={totals['project_value_total']}, Income={totals['income_total']}, Balance={totals['balance_grand_total']}")
    
    def test_dashboard_summary_returns_projects(self, super_admin_session):
        """Test dashboard-summary returns projects list"""
        response = super_admin_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert "projects" in data
        assert isinstance(data["projects"], list)
        
        if len(data["projects"]) > 0:
            project = data["projects"][0]
            # Verify project structure
            assert "project_id" in project
            assert "name" in project
            assert "client_name" in project
            assert "status" in project
            assert "project_value" in project
            assert "income_received" in project
            assert "balance" in project
            
        print(f"Found {len(data['projects'])} projects in dashboard")
    
    def test_dashboard_summary_denied_for_non_super_admin(self, pm_session):
        """Test dashboard-summary returns 403 for non-super-admin"""
        response = pm_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 403
        assert "Super Admin only" in response.json().get("detail", "")
        print("Non-super-admin correctly denied access")


class TestProjectCreation:
    """Test project creation from dashboard"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_create_project_with_all_fields(self, session):
        """Test creating project with all required fields"""
        payload = {
            "name": "TEST_Super_Admin_Project",
            "client_name": "TEST_Client_Name",
            "location": "TEST_Location",
            "total_value": 2500000,
            "start_date": "2026-02-01",
            "expected_completion": "2027-02-01",
            "status": "planning"
        }
        
        response = session.post(f"{BASE_URL}/api/projects", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "TEST_Super_Admin_Project"
        assert data["client_name"] == "TEST_Client_Name"
        assert data["location"] == "TEST_Location"
        assert data["total_value"] == 2500000
        assert data["status"] == "planning"
        assert "project_id" in data
        assert "start_date" in data
        assert "expected_completion" in data
        
        self.__class__.created_project_id = data["project_id"]
        print(f"Created project: {data['project_id']}")
    
    def test_dashboard_updates_after_project_creation(self, session):
        """Test dashboard totals update after project creation"""
        if not hasattr(self.__class__, 'created_project_id'):
            pytest.skip("No project created")
        
        response = session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 200
        
        data = response.json()
        project_ids = [p["project_id"] for p in data["projects"]]
        
        assert self.__class__.created_project_id in project_ids
        print(f"New project appears in dashboard: {self.__class__.created_project_id}")
    
    def test_cleanup_created_project(self, session):
        """Cleanup: Delete test project"""
        if not hasattr(self.__class__, 'created_project_id'):
            pytest.skip("No project to delete")
        
        response = session.delete(f"{BASE_URL}/api/projects/{self.__class__.created_project_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        data = response.json()
        project_ids = [p["project_id"] for p in data["projects"]]
        assert self.__class__.created_project_id not in project_ids
        print(f"Deleted test project: {self.__class__.created_project_id}")


class TestProjectCreationValidation:
    """Test project creation validation"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_create_project_missing_name(self, session):
        """Test project creation fails without name"""
        payload = {
            "client_name": "TEST_Client",
            "location": "TEST_Location",
            "total_value": 1000000,
            "start_date": "2026-02-01",
            "expected_completion": "2027-02-01"
        }
        
        response = session.post(f"{BASE_URL}/api/projects", json=payload)
        # Should fail with 422 validation error
        assert response.status_code == 422
        print("Correctly rejected project without name")
    
    def test_create_project_missing_client_name(self, session):
        """Test project creation fails without client_name"""
        payload = {
            "name": "TEST_Project",
            "location": "TEST_Location",
            "total_value": 1000000,
            "start_date": "2026-02-01",
            "expected_completion": "2027-02-01"
        }
        
        response = session.post(f"{BASE_URL}/api/projects", json=payload)
        assert response.status_code == 422
        print("Correctly rejected project without client_name")


class TestNonSuperAdminDashboard:
    """Test that non-super-admin users see basic dashboard"""
    
    @pytest.fixture(scope="class")
    def pm_session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_pm_can_access_projects(self, pm_session):
        """Test PM can access projects list"""
        response = pm_session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PM can see {len(data)} projects")
    
    def test_pm_cannot_access_admin_dashboard(self, pm_session):
        """Test PM cannot access admin dashboard summary"""
        response = pm_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 403
        print("PM correctly denied admin dashboard access")


class TestProjectListNavigation:
    """Test project list and navigation"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_all_projects(self, session):
        """Test GET /projects returns all projects"""
        response = session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} projects")
    
    def test_get_single_project(self, session):
        """Test GET /projects/{id} returns project details"""
        # First get a project ID
        response = session.get(f"{BASE_URL}/api/projects")
        projects = response.json()
        
        if len(projects) == 0:
            pytest.skip("No projects to test")
        
        project_id = projects[0]["project_id"]
        response = session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["project_id"] == project_id
        print(f"Retrieved project: {data['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
