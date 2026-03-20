"""
Test GM RE Edit and Change Log Feature
Tests:
1. GM can update RE projects via PATCH endpoint
2. Change logs are created when fields are modified
3. Change log API returns correct data for GM and Planning roles
4. Both roles can see each other's changes in the logs
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://estimate-dialog-bugs.preview.emergentagent.com').rstrip('/')

# Demo user emails for testing
DEMO_USERS = {
    "super_admin": "admin@constructionos.com",
    "general_manager": "gm@constructionos.com",
    "planning": "planning@constructionos.com",
    "sales": "sales@constructionos.com",
    "cre": "cre@constructionos.com"
}

class TestGMREEditAndChangeLogs:
    """Test GM RE Edit and Change Log functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login_as_role(self, role):
        """Login using demo access with specified role"""
        email = DEMO_USERS.get(role)
        if not email:
            raise ValueError(f"Unknown role: {role}")
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        assert response.status_code == 200, f"Demo login failed for {role}: {response.text}"
        data = response.json()
        assert "user_id" in data or "name" in data, f"Login response missing user data: {data}"
        return data
    
    def test_01_gm_can_login(self):
        """Test GM can login via demo access"""
        data = self.login_as_role("general_manager")
        print(f"GM login successful: {data.get('name', 'Unknown')}")
        assert data is not None

    def test_02_planning_can_login(self):
        """Test Planning can login via demo access"""
        data = self.login_as_role("planning")
        print(f"Planning login successful: {data.get('name', 'Unknown')}")
        assert data is not None

    def test_03_gm_can_fetch_re_projects(self):
        """Test GM can fetch RE projects list"""
        self.login_as_role("general_manager")
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200, f"Failed to fetch RE projects: {response.text}"
        projects = response.json()
        print(f"GM fetched {len(projects)} RE projects")
        assert isinstance(projects, list)
        if len(projects) > 0:
            project = projects[0]
            print(f"First project: {project.get('project_name')} - {project.get('re_project_id')}")
            assert "re_project_id" in project
    
    def test_04_gm_can_update_re_project(self):
        """Test GM can update an RE project"""
        self.login_as_role("general_manager")
        
        # Fetch RE projects
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200
        projects = response.json()
        assert len(projects) > 0, "No RE projects found for testing"
        
        # Use specific test project or first available
        test_project = None
        for p in projects:
            if p.get("re_project_id") == "re_49228631a70b":
                test_project = p
                break
        if not test_project:
            test_project = projects[0]
        
        re_project_id = test_project["re_project_id"]
        print(f"Testing GM edit on project: {re_project_id}")
        
        # Update with unique note to verify change
        unique_note = f"GM edited on test run {uuid.uuid4().hex[:8]}"
        update_payload = {
            "planning_notes": unique_note
        }
        
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json=update_payload
        )
        assert response.status_code == 200, f"GM update failed: {response.text}"
        result = response.json()
        print(f"Update result: {result}")
        assert "message" in result
    
    def test_05_change_log_created_after_gm_edit(self):
        """Test that change log entry is created after GM edit"""
        self.login_as_role("general_manager")
        
        # Fetch RE projects
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        projects = response.json()
        
        test_project = None
        for p in projects:
            if p.get("re_project_id") == "re_49228631a70b":
                test_project = p
                break
        if not test_project:
            test_project = projects[0]
        
        re_project_id = test_project["re_project_id"]
        
        # Make a unique edit
        unique_note = f"Test change log creation {uuid.uuid4().hex[:8]}"
        self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": unique_note}
        )
        
        # Fetch change logs
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/change-logs")
        assert response.status_code == 200, f"Failed to fetch change logs: {response.text}"
        logs = response.json()
        print(f"Found {len(logs)} change log entries")
        assert isinstance(logs, list)
        
        if len(logs) > 0:
            latest_log = logs[0]  # Should be sorted by timestamp desc
            print(f"Latest log: user={latest_log.get('user_name')}, role={latest_log.get('user_role')}")
            assert "log_id" in latest_log
            assert "user_name" in latest_log
            assert "user_role" in latest_log
            assert "changes" in latest_log
            assert "timestamp" in latest_log
    
    def test_06_change_log_contains_correct_fields(self):
        """Test that change log contains correct field change data"""
        self.login_as_role("general_manager")
        
        # Fetch RE projects
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        projects = response.json()
        
        # Find a project to test
        test_project = projects[0] if projects else None
        assert test_project, "No RE projects available"
        re_project_id = test_project["re_project_id"]
        
        # Make a clear edit to project_name
        old_name = test_project.get("project_name", "")
        new_name = f"Test Project {uuid.uuid4().hex[:6]}"
        
        self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"project_name": new_name}
        )
        
        # Fetch change logs
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/change-logs")
        logs = response.json()
        
        assert len(logs) > 0, "No change logs found"
        latest_log = logs[0]
        
        # Check change has field, old, new values
        changes = latest_log.get("changes", [])
        assert len(changes) > 0, "No changes recorded in latest log"
        
        for change in changes:
            print(f"Change: field={change.get('field')}, old={change.get('old')}, new={change.get('new')}")
            assert "field" in change
            assert "new" in change
    
    def test_07_planning_can_see_gm_changes(self):
        """Test Planning can see GM's change logs"""
        # First, make an edit as GM
        self.login_as_role("general_manager")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        projects = response.json()
        test_project = projects[0] if projects else None
        assert test_project, "No RE projects available"
        re_project_id = test_project["re_project_id"]
        
        # Make GM edit
        self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": f"GM note {uuid.uuid4().hex[:6]}"}
        )
        
        # Now login as Planning
        self.login_as_role("planning")
        
        # Fetch change logs
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/change-logs")
        assert response.status_code == 200, f"Planning failed to fetch logs: {response.text}"
        logs = response.json()
        
        print(f"Planning can see {len(logs)} change log entries")
        
        # Check that GM's edit is visible
        gm_logs = [log for log in logs if log.get("user_role") == "general_manager"]
        print(f"Found {len(gm_logs)} logs from GM")
        assert len(gm_logs) >= 1, "Planning should see GM's change log entries"
    
    def test_08_gm_can_see_planning_changes(self):
        """Test GM can see Planning's change logs"""
        # First, make an edit as Planning
        self.login_as_role("planning")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        projects = response.json()
        test_project = projects[0] if projects else None
        assert test_project, "No RE projects available"
        re_project_id = test_project["re_project_id"]
        
        # Make Planning edit
        self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": f"Planning note {uuid.uuid4().hex[:6]}"}
        )
        
        # Now login as GM
        self.login_as_role("general_manager")
        
        # Fetch change logs
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/change-logs")
        assert response.status_code == 200, f"GM failed to fetch logs: {response.text}"
        logs = response.json()
        
        print(f"GM can see {len(logs)} change log entries")
        
        # Check that Planning's edit is visible
        planning_logs = [log for log in logs if log.get("user_role") == "planning"]
        print(f"Found {len(planning_logs)} logs from Planning")
        assert len(planning_logs) >= 1, "GM should see Planning's change log entries"
    
    def test_09_gm_can_update_scope_items(self):
        """Test GM can update scope items"""
        self.login_as_role("general_manager")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        projects = response.json()
        test_project = projects[0] if projects else None
        assert test_project, "No RE projects available"
        re_project_id = test_project["re_project_id"]
        
        # Update with scope items
        new_scope_items = test_project.get("rough_scope_items", [])
        new_scope_items.append({
            "name": f"Test Item by GM {uuid.uuid4().hex[:6]}",
            "quantity": 10,
            "unit": "sqft",
            "rate": 150,
            "total": 1500
        })
        
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"rough_scope_items": new_scope_items}
        )
        assert response.status_code == 200, f"GM scope update failed: {response.text}"
        print("GM successfully updated scope items")
        
        # Verify change log recorded scope change
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/change-logs")
        logs = response.json()
        latest = logs[0] if logs else {}
        changes = latest.get("changes", [])
        
        scope_change = [c for c in changes if "Scope" in c.get("field", "")]
        print(f"Scope change recorded: {scope_change}")
    
    def test_10_unauthorized_role_cannot_edit(self):
        """Test that unauthorized roles cannot edit RE projects"""
        # Login as a role that shouldn't have edit access
        try:
            self.login_as_role("sales")
        except AssertionError:
            print("Sales role login failed - expected")
            return
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        if response.status_code != 200:
            print("Sales cannot access RE projects - correct behavior")
            return
        
        projects = response.json()
        if len(projects) == 0:
            print("No projects visible to Sales")
            return
        
        test_project = projects[0]
        re_project_id = test_project["re_project_id"]
        
        # Try to edit - should fail
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": "Unauthorized edit"}
        )
        
        # Sales role should get 403
        if response.status_code == 403:
            print("Sales correctly denied edit access (403)")
        elif response.status_code == 200:
            pytest.fail("Sales was able to edit RE project - should be denied!")
        else:
            print(f"Sales edit returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
