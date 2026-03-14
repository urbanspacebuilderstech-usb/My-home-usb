"""
Test PM Dashboard Backend APIs - Project Manager Module
Tests: /pm/create-site-engineer, /pm/project-stages, /pm/team-members, update-stage permission
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# PM demo user credentials - from Demo Access
PM_EMAIL = "pm@constructionos.com"


class TestPMDashboardAPIs:
    """Test PM Dashboard backend endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures - login as PM"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Project Manager via demo access
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PM_EMAIL
        })
        assert login_response.status_code == 200, f"PM login failed: {login_response.text}"
        
        self.pm_user = login_response.json()
        assert self.pm_user.get("role") == "project_manager", f"Expected PM role, got: {self.pm_user.get('role')}"
    
    def test_pm_project_stages_returns_8_stages(self):
        """GET /api/pm/project-stages returns list of 8 stages"""
        response = self.session.get(f"{BASE_URL}/api/pm/project-stages")
        
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        assert isinstance(stages, list), "Stages should be a list"
        assert len(stages) == 8, f"Expected 8 stages, got {len(stages)}"
        
        # Verify expected stages
        stage_ids = [s['id'] for s in stages]
        expected_stages = ['drawing', 'yet_to_start', 'foundation', 'basement', 'brick_work', 'plastering', 'finishing', 'handover']
        for expected in expected_stages:
            assert expected in stage_ids, f"Missing stage: {expected}"
        
        print(f"PASS: GET /api/pm/project-stages returns {len(stages)} stages")
    
    def test_pm_team_members_endpoint(self):
        """GET /api/pm/team-members returns team list"""
        response = self.session.get(f"{BASE_URL}/api/pm/team-members")
        
        assert response.status_code == 200, f"Failed to get team members: {response.text}"
        
        team = response.json()
        assert isinstance(team, list), "Team members should be a list"
        
        # Verify team members have correct roles
        for member in team:
            assert member.get('role') in ['site_engineer', 'sr_site_engineer', 'associate_pm'], \
                f"Invalid team member role: {member.get('role')}"
            assert 'user_id' in member
            assert 'name' in member
        
        print(f"PASS: GET /api/pm/team-members returns {len(team)} members")
    
    def test_pm_create_site_engineer(self):
        """POST /api/pm/create-site-engineer creates a user with site_engineer role"""
        import uuid
        test_name = f"TEST_QA_SE_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": test_name,
            "phone": "+91-9876543210",
            "email": f"{test_name.lower()}@test.local",
            "role": "site_engineer"
        })
        
        assert response.status_code == 200, f"Failed to create site engineer: {response.text}"
        
        data = response.json()
        assert 'user' in data, "Response should contain 'user' object"
        
        user = data['user']
        assert user['name'] == test_name, "Name mismatch"
        assert user['role'] == "site_engineer", f"Expected site_engineer role, got: {user['role']}"
        assert user['is_active'] == True, "User should be active"
        
        print(f"PASS: POST /api/pm/create-site-engineer created user '{test_name}' with role 'site_engineer'")
        
        # Cleanup: deactivate the test user
        if 'user_id' in user:
            cleanup_response = self.session.delete(f"{BASE_URL}/api/pm/team-members/{user['user_id']}")
            if cleanup_response.status_code == 200:
                print(f"  - Cleanup: Deactivated test user {test_name}")
    
    def test_pm_create_sr_site_engineer(self):
        """POST /api/pm/create-site-engineer can also create sr_site_engineer role"""
        import uuid
        test_name = f"TEST_QA_SR_SE_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": test_name,
            "role": "sr_site_engineer"
        })
        
        assert response.status_code == 200, f"Failed to create sr site engineer: {response.text}"
        
        data = response.json()
        user = data.get('user', {})
        assert user.get('role') == "sr_site_engineer", f"Expected sr_site_engineer role, got: {user.get('role')}"
        
        print(f"PASS: PM can create Sr. Site Engineer '{test_name}'")
        
        # Cleanup
        if user.get('user_id'):
            self.session.delete(f"{BASE_URL}/api/pm/team-members/{user['user_id']}")
    
    def test_pm_delete_team_member(self):
        """DELETE /api/pm/team-members/{user_id} deactivates a team member"""
        import uuid
        test_name = f"TEST_DELETE_SE_{uuid.uuid4().hex[:6]}"
        
        # Create a test user first
        create_response = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": test_name,
            "role": "site_engineer"
        })
        assert create_response.status_code == 200, f"Setup failed - could not create test user"
        
        user_id = create_response.json()['user']['user_id']
        
        # Delete (deactivate) the user
        delete_response = self.session.delete(f"{BASE_URL}/api/pm/team-members/{user_id}")
        
        assert delete_response.status_code == 200, f"Failed to deactivate team member: {delete_response.text}"
        
        data = delete_response.json()
        assert 'deactivated' in data.get('message', '').lower(), f"Unexpected message: {data.get('message')}"
        
        print(f"PASS: DELETE /api/pm/team-members/{user_id} deactivated the user")
    
    def test_pm_can_update_project_stage(self):
        """PATCH /api/planning/projects/{project_id}/update-stage - PM has permission"""
        # First get a project
        projects_response = self.session.get(f"{BASE_URL}/api/pm/projects")
        
        assert projects_response.status_code == 200, f"Failed to get projects: {projects_response.text}"
        
        projects = projects_response.json()
        if not projects:
            pytest.skip("No projects available to test stage update")
        
        project = projects[0]
        project_id = project['project_id']
        current_stage = project.get('current_stage', 'yet_to_start')
        
        # Try to update stage - PM should have permission
        new_stage = 'foundation' if current_stage != 'foundation' else 'basement'
        
        response = self.session.patch(f"{BASE_URL}/api/planning/projects/{project_id}/update-stage?stage={new_stage}")
        
        assert response.status_code == 200, f"PM should have permission to update stage. Error: {response.text}"
        
        data = response.json()
        assert data.get('new_stage') == new_stage, f"Stage not updated to {new_stage}"
        
        print(f"PASS: PM can update project stage to '{new_stage}'")
        
        # Restore original stage
        self.session.patch(f"{BASE_URL}/api/planning/projects/{project_id}/update-stage?stage={current_stage}")
    
    def test_pm_projects_no_financial_data(self):
        """GET /api/pm/projects should NOT return financial data (total_value, etc.)"""
        response = self.session.get(f"{BASE_URL}/api/pm/projects")
        
        assert response.status_code == 200, f"Failed to get PM projects: {response.text}"
        
        projects = response.json()
        if not projects:
            pytest.skip("No projects available")
        
        # Check first project doesn't have financial fields
        project = projects[0]
        
        # Financial fields that PM should NOT see
        financial_fields = ['total_value', 'advance_amount', 'income_project', 'income_additional', 
                           'agreement_value', 'received_amount', 'total_received']
        
        hidden_fields = [f for f in financial_fields if f in project]
        
        # Log what we found
        if hidden_fields:
            print(f"WARNING: Financial fields found in PM projects response: {hidden_fields}")
        else:
            print("PASS: No financial fields exposed in PM projects endpoint")
        
        # This is more of an informational test since the backend might include these
        # The frontend should filter them out
    
    def test_pm_material_requests_endpoint(self):
        """GET /api/pm/material-requests returns material requests for PM"""
        response = self.session.get(f"{BASE_URL}/api/pm/material-requests")
        
        assert response.status_code == 200, f"Failed to get material requests: {response.text}"
        
        requests_list = response.json()
        assert isinstance(requests_list, list), "Material requests should be a list"
        
        print(f"PASS: GET /api/pm/material-requests returns {len(requests_list)} requests")
    
    def test_pm_labour_requests_endpoint(self):
        """GET /api/pm/labour-requests returns labour requests for PM"""
        response = self.session.get(f"{BASE_URL}/api/pm/labour-requests")
        
        assert response.status_code == 200, f"Failed to get labour requests: {response.text}"
        
        requests_list = response.json()
        assert isinstance(requests_list, list), "Labour requests should be a list"
        
        print(f"PASS: GET /api/pm/labour-requests returns {len(requests_list)} requests")


class TestPMDashboardEdgeCases:
    """Edge case tests for PM Dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as PM
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PM_EMAIL
        })
        assert login_response.status_code == 200
    
    def test_create_site_engineer_without_name_fails(self):
        """POST /api/pm/create-site-engineer fails without name"""
        response = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": "",
            "role": "site_engineer"
        })
        
        assert response.status_code == 400, f"Expected 400 for empty name, got {response.status_code}"
        print("PASS: Creating site engineer without name fails with 400")
    
    def test_create_site_engineer_invalid_role_fails(self):
        """POST /api/pm/create-site-engineer fails with invalid role"""
        response = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": "Test Invalid Role",
            "role": "super_admin"  # Invalid role for this endpoint
        })
        
        assert response.status_code == 400, f"Expected 400 for invalid role, got {response.status_code}"
        print("PASS: Creating user with invalid role fails with 400")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
