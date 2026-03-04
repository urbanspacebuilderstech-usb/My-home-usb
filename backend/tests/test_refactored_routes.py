"""
Test suite for the refactored server.py -> modular routes structure
Tests all critical endpoints after 16,000+ lines were split into 7 modular route files

Features tested:
- Auth (demo-login, auth/me, logout)
- Projects CRUD
- CRM (pre-sales/leads)
- Procurement dashboard
- Work Orders
- Admin dashboard
- IDOR fixes for Site Engineer
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@constructionos.com"
GM_EMAIL = "gm@constructionos.com"
ENGINEER_EMAIL = "engineer@constructionos.com"
PM_EMAIL = "pm@constructionos.com"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"


@pytest.fixture(scope="module")
def admin_session():
    """Create admin session and return cookies"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ADMIN_EMAIL})
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return session


@pytest.fixture(scope="module")
def gm_session():
    """Create GM session and return cookies"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": GM_EMAIL})
    assert response.status_code == 200, f"GM login failed: {response.text}"
    return session


@pytest.fixture(scope="module")
def engineer_session():
    """Create Site Engineer session and return cookies"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ENGINEER_EMAIL})
    assert response.status_code == 200, f"Engineer login failed: {response.text}"
    return session


class TestAuthRoutes:
    """Test auth endpoints from routes/auth.py (10 routes)"""
    
    def test_super_admin_login(self, admin_session):
        """Test Super Admin can login via demo-login"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "super_admin"
        print(f"✓ Super Admin login verified: {data['name']}, role={data['role']}")
    
    def test_gm_login(self, gm_session):
        """Test GM can login via demo-login"""
        response = gm_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == GM_EMAIL
        assert data["role"] == "general_manager"
        print(f"✓ GM login verified: {data['name']}, role={data['role']}")
    
    def test_site_engineer_login(self, engineer_session):
        """Test Site Engineer can login"""
        response = engineer_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ENGINEER_EMAIL
        assert data["role"] == "site_engineer"
        print(f"✓ Site Engineer login verified: {data['name']}, role={data['role']}")


class TestProjectRoutes:
    """Test project endpoints from routes/projects.py (100 routes)"""
    
    def test_admin_get_all_projects(self, admin_session):
        """Admin should see all 13 projects"""
        response = admin_session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        assert isinstance(projects, list)
        assert len(projects) >= 10, f"Expected at least 10 projects, got {len(projects)}"
        print(f"✓ Admin sees {len(projects)} projects")
    
    def test_admin_get_single_project(self, admin_session):
        """Admin can fetch a single project by ID"""
        # First get project list
        response = admin_session.get(f"{BASE_URL}/api/projects")
        projects = response.json()
        if projects:
            project_id = projects[0]["project_id"]
            response = admin_session.get(f"{BASE_URL}/api/projects/{project_id}")
            assert response.status_code == 200
            project = response.json()
            assert project["project_id"] == project_id
            print(f"✓ Admin can fetch project: {project['name']}")
    
    def test_admin_dashboard_summary(self, admin_session):
        """Test /api/admin/dashboard-summary returns totals and projects"""
        response = admin_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 200
        data = response.json()
        assert "totals" in data
        assert "projects" in data
        assert "total_projects" in data["totals"]
        print(f"✓ Admin dashboard summary: {data['totals']['total_projects']} projects, total value: {data['totals'].get('project_value_total', 0)}")


class TestSiteEngineerIDOR:
    """Test IDOR fix - Site Engineer should NOT access financial data"""
    
    def test_engineer_blocked_from_income(self, engineer_session):
        """Site Engineer should NOT access /api/income"""
        response = engineer_session.get(f"{BASE_URL}/api/income")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ IDOR Fix: Site Engineer blocked from /api/income")
    
    def test_engineer_blocked_from_vendor_master(self, engineer_session):
        """Site Engineer should NOT access /api/vendor-master"""
        response = engineer_session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ IDOR Fix: Site Engineer blocked from /api/vendor-master")
    
    def test_admin_can_access_income(self, admin_session):
        """Admin should have full access to /api/income"""
        response = admin_session.get(f"{BASE_URL}/api/income")
        assert response.status_code == 200
        print("✓ Admin can access /api/income")
    
    def test_admin_can_access_vendor_master(self, admin_session):
        """Admin should have full access to /api/vendor-master"""
        response = admin_session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200
        print("✓ Admin can access /api/vendor-master")


class TestCRMRoutes:
    """Test CRM endpoints from routes/crm.py (48 routes)"""
    
    def test_admin_get_presales_leads(self, admin_session):
        """Test GET /api/crm/pre-sales/leads returns leads for admin"""
        response = admin_session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"✓ CRM Pre-sales leads: {len(leads)} leads found")
    
    def test_admin_get_sales_leads(self, admin_session):
        """Test GET /api/crm/sales/leads returns leads"""
        response = admin_session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"✓ CRM Sales leads: {len(leads)} leads found")


class TestProcurementRoutes:
    """Test procurement endpoints from routes/procurement.py (41 routes)"""
    
    def test_admin_get_procurement_dashboard(self, admin_session):
        """Test GET /api/procurement/dashboard returns data"""
        response = admin_session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "pending_requests" in data or "total_in_pricing" in data
        print(f"✓ Procurement dashboard loaded: {data}")


class TestWorkOrderRoutes:
    """Test work order endpoints from routes/projects.py"""
    
    def test_admin_get_work_orders(self, admin_session):
        """Test GET /api/work-orders returns data for admin"""
        response = admin_session.get(f"{BASE_URL}/api/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        assert isinstance(work_orders, list)
        print(f"✓ Work orders: {len(work_orders)} found")


class TestGMDashboard:
    """Test GM-specific endpoints"""
    
    def test_gm_get_projects(self, gm_session):
        """GM should see all projects"""
        response = gm_session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        assert isinstance(projects, list)
        print(f"✓ GM can see {len(projects)} projects")
    
    def test_gm_get_approval_projects(self, gm_session):
        """GM can access approvals endpoint"""
        response = gm_session.get(f"{BASE_URL}/api/approvals/projects")
        assert response.status_code == 200
        print("✓ GM can access /api/approvals/projects")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
