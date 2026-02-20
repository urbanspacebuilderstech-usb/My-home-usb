"""
CRO Board Backend Tests
Tests for:
- CRO Dashboard metrics (Draft, In Review, Awaiting, Approved counts)
- Total Ongoing Projects and Total Project Value
- Project Stages with counts
- Create Project dialog with all fields
- Auto-generated project_code
- Submit project for planning review
- Filtered project listing
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestCRODashboard:
    """Test CRO Dashboard metrics and data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRO session"""
        self.session = requests.Session()
        # Login as CRO
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200, f"CRO login failed: {response.text}"
        self.user = response.json()
        assert self.user["role"] == "cro", "User is not CRO role"
        
    def test_cro_dashboard_returns_200(self):
        """Test CRO dashboard endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200, f"Dashboard returned {response.status_code}: {response.text}"
        print("✓ CRO dashboard endpoint returns 200")
        
    def test_cro_dashboard_has_required_metrics(self):
        """Test dashboard has all required metric counts"""
        response = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check all required metric fields exist
        required_fields = [
            "draft_count",
            "planning_review_count",
            "awaiting_approval_count",
            "approved_count",
            "total_ongoing",
            "total_project_value"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            assert isinstance(data[field], (int, float)), f"{field} should be numeric"
        
        print(f"✓ Dashboard metrics: Draft={data['draft_count']}, Review={data['planning_review_count']}, "
              f"Awaiting={data['awaiting_approval_count']}, Approved={data['approved_count']}")
        print(f"✓ Total Ongoing={data['total_ongoing']}, Total Value=₹{data['total_project_value']:,.0f}")
        
    def test_cro_dashboard_has_project_stages(self):
        """Test dashboard returns project stages with counts"""
        response = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check project_stages exists
        assert "project_stages" in data, "Missing project_stages"
        stages = data["project_stages"]
        assert len(stages) == 8, f"Expected 8 project stages, got {len(stages)}"
        
        # Verify expected stages
        stage_ids = [s["id"] for s in stages]
        expected_stages = ["drawing", "yet_to_start", "foundation", "basement", 
                          "brick_work", "plastering", "finishing", "handover"]
        for stage_id in expected_stages:
            assert stage_id in stage_ids, f"Missing stage: {stage_id}"
        
        # Check stage_counts exists
        assert "stage_counts" in data, "Missing stage_counts"
        stage_counts = data["stage_counts"]
        assert isinstance(stage_counts, dict), "stage_counts should be a dict"
        
        print(f"✓ 8 project stages returned: {stage_ids}")
        print(f"✓ Stage counts: {stage_counts}")
        
    def test_cro_dashboard_has_packages(self):
        """Test dashboard returns active packages"""
        response = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        assert "packages" in data, "Missing packages in dashboard"
        packages = data["packages"]
        assert isinstance(packages, list), "packages should be a list"
        
        if len(packages) > 0:
            pkg = packages[0]
            assert "package_id" in pkg, "Package missing package_id"
            assert "name" in pkg, "Package missing name"
            assert "code" in pkg, "Package missing code"
            print(f"✓ {len(packages)} packages available: {[p['name'] for p in packages]}")
        else:
            print("⚠ No active packages found")
            
    def test_cro_dashboard_has_recent_projects(self):
        """Test dashboard returns recent projects"""
        response = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        assert "recent_projects" in data, "Missing recent_projects"
        projects = data["recent_projects"]
        assert isinstance(projects, list), "recent_projects should be a list"
        
        if len(projects) > 0:
            proj = projects[0]
            assert "project_id" in proj, "Project missing project_id"
            assert "name" in proj, "Project missing name"
            assert "status" in proj, "Project missing status"
            print(f"✓ {len(projects)} recent projects returned")
        else:
            print("✓ No recent projects (empty list)")


class TestCROProjectCreation:
    """Test CRO project creation with all fields and auto-generated project_code"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRO session"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200
        self.user = response.json()
        
        # Get available packages
        dash_res = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        self.packages = dash_res.json().get("packages", [])
        
    def test_create_project_with_all_fields(self):
        """Test creating project with all CRO fields"""
        if not self.packages:
            pytest.skip("No packages available for testing")
        
        package_id = self.packages[0]["package_id"]
        unique_id = uuid.uuid4().hex[:6]
        
        project_data = {
            "name": f"TEST_CRO Project {unique_id}",
            "client_name": f"TEST Client {unique_id}",
            "client_phone": "+91 9876543210",
            "client_email": f"test{unique_id}@example.com",
            "location": "Chennai Test Location",
            "sqft": 2500,
            "building_type": "villa",
            "expected_start_date": "2026-06-01",
            "package_id": package_id,
            "advance_date": "2026-02-01",
            "advance_amount": 500000,
            "advance_payment_mode": "bank_transfer",
            "rough_estimate_url": "https://example.com/estimate.pdf"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 200, f"Create project failed: {response.text}"
        
        result = response.json()
        assert "project_id" in result, "Response missing project_id"
        assert "total_value" in result, "Response missing total_value"
        
        self.created_project_id = result["project_id"]
        print(f"✓ Project created: {result['project_id']}, Value=₹{result['total_value']:,.0f}")
        
        # Verify project details via GET
        get_response = self.session.get(f"{BASE_URL}/api/projects/{result['project_id']}")
        assert get_response.status_code == 200, f"Get project failed: {get_response.text}"
        
        project = get_response.json()
        
        # Verify all fields were saved
        assert project["name"] == project_data["name"], "Name mismatch"
        assert project["client_name"] == project_data["client_name"], "Client name mismatch"
        assert project["client_phone"] == project_data["client_phone"], "Phone mismatch"
        assert project["client_email"] == project_data["client_email"], "Email mismatch"
        assert project["location"] == project_data["location"], "Location mismatch"
        assert project["sqft"] == project_data["sqft"], "Sqft mismatch"
        assert project["building_type"] == project_data["building_type"], "Building type mismatch"
        assert project["advance_amount"] == project_data["advance_amount"], "Advance amount mismatch"
        assert project["advance_payment_mode"] == project_data["advance_payment_mode"], "Payment mode mismatch"
        assert project["status"] == "draft", "New project should be in draft status"
        
        print(f"✓ All project fields verified")
        
    def test_project_code_auto_generated(self):
        """Test that project_code is auto-generated in USB format"""
        if not self.packages:
            pytest.skip("No packages available")
        
        package_id = self.packages[0]["package_id"]
        unique_id = uuid.uuid4().hex[:6]
        
        project_data = {
            "name": f"TEST_ProjectCode {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test Location",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": package_id
        }
        
        response = self.session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 200
        
        project_id = response.json()["project_id"]
        
        # Get project to verify project_code
        get_response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert get_response.status_code == 200
        
        project = get_response.json()
        project_code = project.get("project_code")
        
        assert project_code is not None, "project_code should be auto-generated"
        assert project_code.startswith("USB"), f"project_code should start with USB, got: {project_code}"
        assert len(project_code) >= 8, f"project_code should be at least 8 chars, got: {project_code}"
        
        print(f"✓ Auto-generated project_code: {project_code}")
        
    def test_create_project_requires_package(self):
        """Test that project creation requires a valid package"""
        project_data = {
            "name": "TEST_NoPackage",
            "client_name": "Test Client",
            "location": "Test Location",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": "invalid_package_id"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 404, "Should return 404 for invalid package"
        print("✓ Invalid package correctly returns 404")
        
    def test_project_value_calculated_from_sqft_and_rate(self):
        """Test project value is calculated from sqft × base_rate_per_sqft"""
        if not self.packages:
            pytest.skip("No packages available")
        
        # Find a package with base_rate_per_sqft
        pkg_with_rate = None
        for pkg in self.packages:
            if pkg.get("base_rate_per_sqft", 0) > 0:
                pkg_with_rate = pkg
                break
        
        if not pkg_with_rate:
            pytest.skip("No package with base_rate_per_sqft found")
        
        sqft = 2000
        expected_value = sqft * pkg_with_rate["base_rate_per_sqft"]
        
        unique_id = uuid.uuid4().hex[:6]
        project_data = {
            "name": f"TEST_ValueCalc {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test",
            "sqft": sqft,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": pkg_with_rate["package_id"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result["total_value"] == expected_value, \
            f"Expected value ₹{expected_value:,.0f}, got ₹{result['total_value']:,.0f}"
        
        print(f"✓ Project value correctly calculated: {sqft} sqft × ₹{pkg_with_rate['base_rate_per_sqft']:,.0f} = ₹{result['total_value']:,.0f}")


class TestCROSubmitProject:
    """Test CRO submit project for planning review"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRO session and create a draft project"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200
        
        # Get packages
        dash_res = self.session.get(f"{BASE_URL}/api/cro/dashboard")
        packages = dash_res.json().get("packages", [])
        
        if packages:
            unique_id = uuid.uuid4().hex[:6]
            project_data = {
                "name": f"TEST_Submit {unique_id}",
                "client_name": f"Client {unique_id}",
                "location": "Test Location",
                "sqft": 1500,
                "building_type": "residential",
                "expected_start_date": "2026-08-01",
                "package_id": packages[0]["package_id"]
            }
            
            create_res = self.session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
            if create_res.status_code == 200:
                self.test_project_id = create_res.json()["project_id"]
            else:
                self.test_project_id = None
        else:
            self.test_project_id = None
            
    def test_submit_draft_project(self):
        """Test submitting draft project for planning review"""
        if not self.test_project_id:
            pytest.skip("No test project created")
        
        response = self.session.patch(f"{BASE_URL}/api/cro/projects/{self.test_project_id}/submit")
        assert response.status_code == 200, f"Submit failed: {response.text}"
        
        result = response.json()
        assert "message" in result
        print(f"✓ Project submitted: {result['message']}")
        
        # Verify status changed
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}")
        assert get_response.status_code == 200
        
        project = get_response.json()
        assert project["status"] == "planning_review", f"Expected planning_review, got {project['status']}"
        print(f"✓ Project status changed to planning_review")
        
    def test_cannot_submit_non_draft_project(self):
        """Test that non-draft projects cannot be submitted"""
        if not self.test_project_id:
            pytest.skip("No test project created")
        
        # First submit the project
        self.session.patch(f"{BASE_URL}/api/cro/projects/{self.test_project_id}/submit")
        
        # Try to submit again
        response = self.session.patch(f"{BASE_URL}/api/cro/projects/{self.test_project_id}/submit")
        assert response.status_code == 400, "Should return 400 for non-draft project"
        print("✓ Cannot submit non-draft project (returns 400)")


class TestCROFilteredProjectListing:
    """Test CRO filtered project listing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRO session"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200
        
    def test_get_all_projects_without_filters(self):
        """Test getting all projects without filters"""
        response = self.session.get(f"{BASE_URL}/api/cro/projects/all")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        projects = response.json()
        assert isinstance(projects, list), "Should return a list"
        print(f"✓ Retrieved {len(projects)} projects without filters")
        
    def test_filter_projects_by_status(self):
        """Test filtering projects by status"""
        response = self.session.get(f"{BASE_URL}/api/cro/projects/all?status=draft")
        assert response.status_code == 200
        
        projects = response.json()
        for proj in projects:
            assert proj["status"] == "draft", f"Expected draft status, got {proj['status']}"
        
        print(f"✓ Filter by status=draft returned {len(projects)} projects")
        
    def test_filter_projects_by_stage(self):
        """Test filtering projects by current stage"""
        response = self.session.get(f"{BASE_URL}/api/cro/projects/all?stage=yet_to_start")
        assert response.status_code == 200
        
        projects = response.json()
        for proj in projects:
            assert proj.get("current_stage") == "yet_to_start", f"Expected yet_to_start stage"
        
        print(f"✓ Filter by stage=yet_to_start returned {len(projects)} projects")
        
    def test_filter_projects_by_date_range(self):
        """Test filtering projects by date range"""
        response = self.session.get(
            f"{BASE_URL}/api/cro/projects/all?date_from=2026-01-01&date_to=2026-12-31"
        )
        assert response.status_code == 200
        
        projects = response.json()
        print(f"✓ Filter by date range returned {len(projects)} projects")
        
    def test_filter_projects_by_multiple_statuses(self):
        """Test filtering by multiple comma-separated statuses"""
        response = self.session.get(f"{BASE_URL}/api/cro/projects/all?status=planning_approved,active")
        assert response.status_code == 200
        
        projects = response.json()
        for proj in projects:
            assert proj["status"] in ["planning_approved", "active"], f"Unexpected status: {proj['status']}"
        
        print(f"✓ Filter by multiple statuses returned {len(projects)} projects")


class TestCROAccessControl:
    """Test CRO access control"""
    
    def test_non_cro_cannot_access_dashboard(self):
        """Test that non-CRO users cannot access CRO dashboard"""
        session = requests.Session()
        
        # Login as accountant
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200
        
        # Try to access CRO dashboard
        response = session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-CRO user correctly denied access to CRO dashboard")
        
    def test_super_admin_can_access_cro_dashboard(self):
        """Test that super admin can access CRO dashboard"""
        session = requests.Session()
        
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        
        response = session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200, f"Super admin should access CRO dashboard"
        print("✓ Super admin can access CRO dashboard")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
