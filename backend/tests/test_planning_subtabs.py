"""
Test Planning Board Sub-tabs Feature
Tests the new planning lifecycle sub-tabs: New Projects, Current Projects, Delivered Projects
And the date filter functionality
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level session to avoid rate limiting
_session = None
_cookies = None

def get_planning_session():
    """Get or create a planning session"""
    global _session, _cookies
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        
        # Login as Planning user via demo-login
        login_response = _session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        if login_response.status_code == 429:
            time.sleep(60)  # Wait for rate limit to reset
            login_response = _session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "planning@constructionos.com"
            })
        assert login_response.status_code == 200, f"Demo login failed: {login_response.text}"
        _cookies = login_response.cookies
    return _session, _cookies


class TestPlanningSubtabs:
    """Test Planning Board sub-tabs and status transitions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with Planning user authentication"""
        self.session, self.cookies = get_planning_session()
        
    def test_get_projects_filtered_new(self):
        """Test GET /api/planning/projects-filtered?planning_status=new returns projects"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to get new projects: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} new projects")
        
        # Verify all returned projects have planning_status = 'new' or no planning_status (default)
        for project in data:
            status = project.get("planning_status")
            assert status == "new" or status is None, f"Project {project.get('project_id')} has wrong status: {status}"
    
    def test_get_projects_filtered_active(self):
        """Test GET /api/planning/projects-filtered?planning_status=active returns projects"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "active"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to get active projects: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} active projects")
        
        # Verify all returned projects have planning_status = 'active'
        for project in data:
            assert project.get("planning_status") == "active", f"Project {project.get('project_id')} has wrong status"
    
    def test_get_projects_filtered_delivered(self):
        """Test GET /api/planning/projects-filtered?planning_status=delivered returns projects (may be 0)"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "delivered"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to get delivered projects: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} delivered projects")
        
        # Verify all returned projects have planning_status = 'delivered'
        for project in data:
            assert project.get("planning_status") == "delivered", f"Project {project.get('project_id')} has wrong status"
    
    def test_update_planning_status_to_active(self):
        """Test PATCH /api/planning/projects/{project_id}/planning-status with {planning_status:'active'}"""
        # First get a new project to move
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new"},
            cookies=self.cookies
        )
        assert response.status_code == 200
        new_projects = response.json()
        
        if len(new_projects) == 0:
            pytest.skip("No new projects available to test status change")
        
        # Pick the first new project
        project = new_projects[0]
        project_id = project.get("project_id")
        print(f"Moving project {project_id} from 'new' to 'active'")
        
        # Update status to active
        patch_response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "active"},
            cookies=self.cookies
        )
        assert patch_response.status_code == 200, f"Failed to update status: {patch_response.text}"
        
        result = patch_response.json()
        assert "message" in result, "Response should contain message"
        print(f"Status update response: {result}")
        
        # Verify the project is now in active list
        active_response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "active"},
            cookies=self.cookies
        )
        assert active_response.status_code == 200
        active_projects = active_response.json()
        
        active_ids = [p.get("project_id") for p in active_projects]
        assert project_id in active_ids, f"Project {project_id} should be in active list"
        
        # Store for cleanup - move back to new
        self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "new"},
            cookies=self.cookies
        )
    
    def test_update_planning_status_to_delivered(self):
        """Test PATCH /api/planning/projects/{project_id}/planning-status with {planning_status:'delivered'}"""
        # First get an active project to move
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "active"},
            cookies=self.cookies
        )
        assert response.status_code == 200
        active_projects = response.json()
        
        if len(active_projects) == 0:
            pytest.skip("No active projects available to test status change")
        
        # Pick the first active project
        project = active_projects[0]
        project_id = project.get("project_id")
        print(f"Moving project {project_id} from 'active' to 'delivered'")
        
        # Update status to delivered
        patch_response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "delivered"},
            cookies=self.cookies
        )
        assert patch_response.status_code == 200, f"Failed to update status: {patch_response.text}"
        
        result = patch_response.json()
        assert "message" in result, "Response should contain message"
        print(f"Status update response: {result}")
        
        # Verify the project is now in delivered list
        delivered_response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "delivered"},
            cookies=self.cookies
        )
        assert delivered_response.status_code == 200
        delivered_projects = delivered_response.json()
        
        delivered_ids = [p.get("project_id") for p in delivered_projects]
        assert project_id in delivered_ids, f"Project {project_id} should be in delivered list"
        
        # Cleanup - move back to active
        self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "active"},
            cookies=self.cookies
        )
    
    def test_date_filter_by_year(self):
        """Test date filter with year parameter"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new", "year": 2025},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed with year filter: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} projects for year 2025")
    
    def test_date_filter_by_month_year(self):
        """Test date filter with month and year parameters"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new", "month": 1, "year": 2026},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed with month/year filter: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} projects for Jan 2026")
    
    def test_date_filter_by_date_range(self):
        """Test date filter with date_from and date_to parameters"""
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={
                "planning_status": "new",
                "date_from": "2025-01-01",
                "date_to": "2026-12-31"
            },
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed with date range filter: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} projects in date range")
    
    def test_invalid_planning_status(self):
        """Test that invalid planning_status returns error"""
        response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/invalid_id/planning-status",
            json={"planning_status": "invalid_status"},
            cookies=self.cookies
        )
        # Should return 400 for invalid status
        assert response.status_code == 400, f"Expected 400 for invalid status, got {response.status_code}"
    
    def test_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        # Create a new session without auth
        unauth_session = requests.Session()
        response = unauth_session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new"}
        )
        assert response.status_code == 401, f"Expected 401 for unauthorized, got {response.status_code}"


class TestPlanningStatusWorkflow:
    """Test the complete workflow: new -> active -> delivered"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with Planning user authentication"""
        self.session, self.cookies = get_planning_session()
    
    def test_full_lifecycle_workflow(self):
        """Test moving a project through the full lifecycle: new -> active -> delivered -> back to new"""
        # Get a new project
        response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new"},
            cookies=self.cookies
        )
        assert response.status_code == 200
        new_projects = response.json()
        
        if len(new_projects) == 0:
            pytest.skip("No new projects available for lifecycle test")
        
        project = new_projects[0]
        project_id = project.get("project_id")
        project_name = project.get("name", "Unknown")
        print(f"Testing lifecycle for project: {project_name} ({project_id})")
        
        # Step 1: Move to active (Ready to Construction)
        response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "active"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to move to active: {response.text}"
        print("Step 1: Moved to active (Ready to Construction)")
        
        # Verify in active list
        active_response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "active"},
            cookies=self.cookies
        )
        active_ids = [p.get("project_id") for p in active_response.json()]
        assert project_id in active_ids, "Project should be in active list"
        
        # Step 2: Move to delivered (Mark as Delivered)
        response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "delivered"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to move to delivered: {response.text}"
        print("Step 2: Moved to delivered (Mark as Delivered)")
        
        # Verify in delivered list
        delivered_response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "delivered"},
            cookies=self.cookies
        )
        delivered_ids = [p.get("project_id") for p in delivered_response.json()]
        assert project_id in delivered_ids, "Project should be in delivered list"
        
        # Step 3: Cleanup - move back to new
        response = self.session.patch(
            f"{BASE_URL}/api/planning/projects/{project_id}/planning-status",
            json={"planning_status": "new"},
            cookies=self.cookies
        )
        assert response.status_code == 200, f"Failed to move back to new: {response.text}"
        print("Step 3: Moved back to new (cleanup)")
        
        # Verify back in new list
        new_response = self.session.get(
            f"{BASE_URL}/api/planning/projects-filtered",
            params={"planning_status": "new"},
            cookies=self.cookies
        )
        new_ids = [p.get("project_id") for p in new_response.json()]
        assert project_id in new_ids, "Project should be back in new list"
        
        print("Full lifecycle test PASSED!")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
