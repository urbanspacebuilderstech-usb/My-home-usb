"""
Test suite for new roles (CRO, GM) and Package Management features
Tests: Package CRUD, CRO Board, Planning Board, Accounts Board APIs
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDemoUsers:
    """Test that new demo users exist and can login"""
    
    def test_cro_user_login(self):
        """CRO user can login via demo-login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "cro"
        assert data["email"] == "cro@constructionos.com"
        assert "Anita" in data["name"]
        print(f"PASS: CRO user login - {data['name']}")
    
    def test_gm_user_login(self):
        """GM user can login via demo-login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "gm@constructionos.com"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "general_manager"
        assert data["email"] == "gm@constructionos.com"
        assert "Suresh" in data["name"]
        print(f"PASS: GM user login - {data['name']}")


class TestPackageManagement:
    """Test Package CRUD operations"""
    
    @pytest.fixture
    def admin_session(self):
        """Get admin session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return session
    
    def test_get_packages(self, admin_session):
        """GET /api/packages returns list of packages"""
        response = admin_session.get(f"{BASE_URL}/api/packages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/packages - {len(data)} packages found")
    
    def test_create_package(self, admin_session):
        """POST /api/packages creates a new package"""
        package_data = {
            "name": "TEST_Package B - Premium",
            "code": "B",
            "description": "Premium construction package for testing",
            "building_types": ["residential", "commercial"],
            "base_rate_per_sqft": 2500,
            "scope_items": [
                {"name": "Foundation Work", "quantity": 1, "unit": "sqft", "unit_rate": 800, "total": 800},
                {"name": "Structural Work", "quantity": 1, "unit": "sqft", "unit_rate": 1000, "total": 1000},
                {"name": "Electrical Premium", "quantity": 1, "unit": "point", "unit_rate": 400, "total": 400}
            ],
            "material_items": [
                {"name": "Premium Cement", "quantity": 150, "unit": "bags", "estimated_rate": 400}
            ],
            "labour_items": [
                {"work_type": "masonry", "description": "Premium mason work", "estimated_days": 45, "daily_rate": 1000, "workers_count": 6}
            ]
        }
        response = admin_session.post(f"{BASE_URL}/api/packages", json=package_data)
        assert response.status_code == 200
        data = response.json()
        assert "package_id" in data
        assert data["message"] == "Package created"
        assert data["total_scope_value"] == 2200  # 800 + 1000 + 400
        print(f"PASS: POST /api/packages - Package created: {data['package_id']}")
        return data["package_id"]
    
    def test_get_single_package(self, admin_session):
        """GET /api/packages/{package_id} returns package details"""
        # First get list to find a package
        list_response = admin_session.get(f"{BASE_URL}/api/packages")
        packages = list_response.json()
        if len(packages) > 0:
            package_id = packages[0]["package_id"]
            response = admin_session.get(f"{BASE_URL}/api/packages/{package_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["package_id"] == package_id
            print(f"PASS: GET /api/packages/{package_id} - Package found: {data['name']}")
        else:
            pytest.skip("No packages to test")


class TestCROBoard:
    """Test CRO Board endpoints"""
    
    @pytest.fixture
    def cro_session(self):
        """Get CRO session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200
        return session
    
    @pytest.fixture
    def admin_session(self):
        """Get admin session for package creation"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return session
    
    def test_cro_dashboard(self, cro_session):
        """GET /api/cro/dashboard returns CRO metrics"""
        response = cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "draft_count" in data
        assert "planning_review_count" in data
        assert "awaiting_approval_count" in data
        assert "approved_count" in data
        assert "recent_projects" in data
        assert "packages" in data
        print(f"PASS: GET /api/cro/dashboard - Metrics: draft={data['draft_count']}, planning_review={data['planning_review_count']}")
    
    def test_cro_create_project(self, cro_session, admin_session):
        """POST /api/cro/projects creates a project with package selection"""
        # First ensure we have a package
        packages_response = admin_session.get(f"{BASE_URL}/api/packages")
        packages = packages_response.json()
        
        if len(packages) == 0:
            # Create a package first
            package_data = {
                "name": "TEST_Package for CRO",
                "code": "T",
                "description": "Test package",
                "building_types": ["residential"],
                "base_rate_per_sqft": 1800,
                "scope_items": [{"name": "Basic Work", "quantity": 1, "unit": "sqft", "unit_rate": 1800, "total": 1800}],
                "material_items": [],
                "labour_items": []
            }
            pkg_response = admin_session.post(f"{BASE_URL}/api/packages", json=package_data)
            package_id = pkg_response.json()["package_id"]
        else:
            package_id = packages[0]["package_id"]
        
        # Create project
        project_data = {
            "name": "TEST_CRO Project",
            "client_name": "Test Client",
            "location": "Mumbai",
            "sqft": 1500,
            "building_type": "residential",
            "package_id": package_id,
            "expected_start_date": "2026-04-01"
        }
        response = cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 200
        data = response.json()
        assert "project_id" in data
        assert "total_value" in data
        assert data["total_value"] > 0  # Should be calculated from package
        print(f"PASS: POST /api/cro/projects - Project created: {data['project_id']}, Value: {data['total_value']}")
    
    def test_cro_dashboard_permission_denied(self):
        """Non-CRO users cannot access CRO dashboard"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"  # Site Engineer
        })
        response = session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 403
        print("PASS: CRO dashboard permission check - Site Engineer denied")


class TestPlanningBoard:
    """Test Planning Board endpoints"""
    
    @pytest.fixture
    def planning_session(self):
        """Get Planning session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200
        return session
    
    def test_planning_dashboard(self, planning_session):
        """GET /api/planning/dashboard returns planning metrics"""
        response = planning_session.get(f"{BASE_URL}/api/planning/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "new_projects" in data
        assert "awaiting_approval" in data
        assert "working_projects" in data
        assert "completed_projects" in data
        assert "pending_material_requests" in data
        assert "pending_labour_requests" in data
        print(f"PASS: GET /api/planning/dashboard - Metrics: new={data['new_projects']}, working={data['working_projects']}, pending_material={data['pending_material_requests']}")
    
    def test_planning_projects(self, planning_session):
        """GET /api/planning/projects returns projects for planning"""
        response = planning_session.get(f"{BASE_URL}/api/planning/projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/planning/projects - {len(data)} projects found")
    
    def test_planning_dashboard_permission_denied(self):
        """Non-Planning users cannot access planning dashboard"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "raj@client.com"  # Client
        })
        response = session.get(f"{BASE_URL}/api/planning/dashboard")
        assert response.status_code == 403
        print("PASS: Planning dashboard permission check - Client denied")


class TestAccountsBoard:
    """Test Accounts Board endpoints"""
    
    @pytest.fixture
    def accounts_session(self):
        """Get Accountant session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200
        return session
    
    def test_accounts_dashboard(self, accounts_session):
        """GET /api/accounts/dashboard returns accounts metrics"""
        response = accounts_session.get(f"{BASE_URL}/api/accounts/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "pending_material" in data
        assert "pending_labour" in data
        assert "pending_procurement" in data
        assert "material_total" in data
        assert "labour_total" in data
        assert "procurement_total" in data
        assert "total_pending" in data
        print(f"PASS: GET /api/accounts/dashboard - Pending: material={data['pending_material']}, labour={data['pending_labour']}, procurement={data['pending_procurement']}")
    
    def test_accounts_pending_payments(self, accounts_session):
        """GET /api/accounts/pending-payments returns pending payments"""
        response = accounts_session.get(f"{BASE_URL}/api/accounts/pending-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/accounts/pending-payments - {len(data)} pending payments")
    
    def test_accounts_process_payment_invalid(self, accounts_session):
        """PATCH /api/accounts/process-payment returns 404 for invalid ID"""
        response = accounts_session.patch(
            f"{BASE_URL}/api/accounts/process-payment/material/invalid_id",
            json={"payment_type": "full"}
        )
        assert response.status_code == 404
        print("PASS: Process payment returns 404 for invalid ID")
    
    def test_accounts_dashboard_permission_denied(self):
        """Non-Accountant users cannot access accounts dashboard"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"  # Site Engineer
        })
        response = session.get(f"{BASE_URL}/api/accounts/dashboard")
        assert response.status_code == 403
        print("PASS: Accounts dashboard permission check - Site Engineer denied")


class TestRoleBasedAccess:
    """Test role-based access control"""
    
    def test_super_admin_can_access_all(self):
        """Super Admin can access all dashboards"""
        session = requests.Session()
        session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        # CRO dashboard
        response = session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        print("PASS: Super Admin can access CRO dashboard")
        
        # Planning dashboard
        response = session.get(f"{BASE_URL}/api/planning/dashboard")
        assert response.status_code == 200
        print("PASS: Super Admin can access Planning dashboard")
        
        # Accounts dashboard
        response = session.get(f"{BASE_URL}/api/accounts/dashboard")
        assert response.status_code == 200
        print("PASS: Super Admin can access Accounts dashboard")
        
        # Packages
        response = session.get(f"{BASE_URL}/api/packages")
        assert response.status_code == 200
        print("PASS: Super Admin can access Packages")


class TestE2EWorkflow:
    """Test end-to-end workflow: Package -> CRO Project -> Planning"""
    
    def test_complete_workflow(self):
        """Test complete workflow from package creation to project submission"""
        # 1. Admin creates package
        admin_session = requests.Session()
        admin_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        package_data = {
            "name": "TEST_E2E Package",
            "code": "E2E",
            "description": "End-to-end test package",
            "building_types": ["villa"],
            "base_rate_per_sqft": 2000,
            "scope_items": [
                {"name": "E2E Foundation", "quantity": 1, "unit": "sqft", "unit_rate": 2000, "total": 2000}
            ],
            "material_items": [],
            "labour_items": []
        }
        pkg_response = admin_session.post(f"{BASE_URL}/api/packages", json=package_data)
        assert pkg_response.status_code == 200
        package_id = pkg_response.json()["package_id"]
        print(f"Step 1 PASS: Package created - {package_id}")
        
        # 2. CRO creates project with package
        cro_session = requests.Session()
        cro_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        
        project_data = {
            "name": "TEST_E2E Villa Project",
            "client_name": "E2E Test Client",
            "location": "Chennai",
            "sqft": 2500,
            "building_type": "villa",
            "package_id": package_id,
            "expected_start_date": "2026-05-01"
        }
        proj_response = cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert proj_response.status_code == 200
        project_id = proj_response.json()["project_id"]
        total_value = proj_response.json()["total_value"]
        assert total_value == 5000000  # 2500 sqft * 2000 rate
        print(f"Step 2 PASS: Project created - {project_id}, Value: {total_value}")
        
        # 3. Verify CRO dashboard shows draft project
        dashboard_response = cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        assert dashboard_response.status_code == 200
        dashboard = dashboard_response.json()
        assert dashboard["draft_count"] >= 1
        print(f"Step 3 PASS: CRO dashboard shows draft count: {dashboard['draft_count']}")
        
        # 4. CRO submits project for planning review
        submit_response = cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        assert submit_response.status_code == 200
        print(f"Step 4 PASS: Project submitted for planning review")
        
        # 5. Verify Planning dashboard shows new project
        planning_session = requests.Session()
        planning_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        
        planning_dashboard = planning_session.get(f"{BASE_URL}/api/planning/dashboard")
        assert planning_dashboard.status_code == 200
        print(f"Step 5 PASS: Planning dashboard accessible")
        
        print("E2E WORKFLOW COMPLETE: Package -> CRO Project -> Planning Review")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
