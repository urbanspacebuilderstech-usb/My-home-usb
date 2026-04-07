"""
Test Team Role Assignment Feature
Tests for:
- GET /api/users/by-role/{role} - returns users filtered by role
- GET /api/projects/{project_id}/team - returns team data for a project
- PATCH /api/projects/{project_id}/team - updates team assignments
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestTeamRoleAssignment:
    """Test team role assignment endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as planning user (cookie-based auth)
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"✓ Logged in as planning user")
        
        # Get a project to test with
        projects_response = self.session.get(f"{BASE_URL}/api/planning/projects")
        assert projects_response.status_code == 200, f"Failed to get projects: {projects_response.text}"
        projects = projects_response.json()
        
        # Find an active project
        active_projects = [p for p in projects if p.get('status') in ['active', 'in_progress', 'planning']]
        if active_projects:
            self.project_id = active_projects[0].get('project_id')
        elif projects:
            self.project_id = projects[0].get('project_id')
        else:
            pytest.skip("No projects available for testing")
        
        print(f"✓ Using project: {self.project_id}")
    
    # ==================== GET /api/users/by-role/{role} Tests ====================
    
    def test_get_users_by_role_architect(self):
        """Test GET /api/users/by-role/architect returns only architect users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/architect")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} architect users")
        
        # Verify all returned users have architect role
        for user in users:
            assert user.get('role') == 'architect', f"User {user.get('name')} has role {user.get('role')}, expected architect"
        
        # Verify no password_hash in response
        for user in users:
            assert 'password_hash' not in user, "password_hash should not be in response"
        
        print(f"✓ All {len(users)} users have architect role")
    
    def test_get_users_by_role_project_manager(self):
        """Test GET /api/users/by-role/project_manager returns only project_manager users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/project_manager")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} project_manager users")
        
        for user in users:
            assert user.get('role') == 'project_manager', f"User {user.get('name')} has role {user.get('role')}, expected project_manager"
        
        print(f"✓ All {len(users)} users have project_manager role")
    
    def test_get_users_by_role_sr_site_engineer(self):
        """Test GET /api/users/by-role/sr_site_engineer returns only sr_site_engineer users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/sr_site_engineer")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} sr_site_engineer users")
        
        for user in users:
            assert user.get('role') == 'sr_site_engineer', f"User {user.get('name')} has role {user.get('role')}, expected sr_site_engineer"
        
        print(f"✓ All {len(users)} users have sr_site_engineer role")
    
    def test_get_users_by_role_site_engineer(self):
        """Test GET /api/users/by-role/site_engineer returns only site_engineer users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/site_engineer")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} site_engineer users")
        
        for user in users:
            assert user.get('role') == 'site_engineer', f"User {user.get('name')} has role {user.get('role')}, expected site_engineer"
        
        print(f"✓ All {len(users)} users have site_engineer role")
    
    def test_get_users_by_role_cre(self):
        """Test GET /api/users/by-role/cre returns only cre users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/cre")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} cre users")
        
        for user in users:
            assert user.get('role') == 'cre', f"User {user.get('name')} has role {user.get('role')}, expected cre"
        
        print(f"✓ All {len(users)} users have cre role")
    
    def test_get_users_by_role_qc(self):
        """Test GET /api/users/by-role/qc returns only qc users (may be empty)"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/qc")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} qc users (may be 0 as noted)")
        
        for user in users:
            assert user.get('role') == 'qc', f"User {user.get('name')} has role {user.get('role')}, expected qc"
        
        print(f"✓ All {len(users)} users have qc role")
    
    def test_get_users_by_role_procurement(self):
        """Test GET /api/users/by-role/procurement returns only procurement users"""
        response = self.session.get(f"{BASE_URL}/api/users/by-role/procurement")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        users = response.json()
        print(f"✓ Found {len(users)} procurement users")
        
        for user in users:
            assert user.get('role') == 'procurement', f"User {user.get('name')} has role {user.get('role')}, expected procurement"
        
        print(f"✓ All {len(users)} users have procurement role")
    
    # ==================== GET /api/projects/{project_id}/team Tests ====================
    
    def test_get_project_team(self):
        """Test GET /api/projects/{project_id}/team returns team data with 7 roles"""
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/team")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        team = response.json()
        print(f"✓ Got team data: {team}")
        
        # Verify all 7 roles are present in response
        expected_roles = ['architect', 'project_manager', 'sr_site_engineer', 'site_engineer', 'cre', 'qc', 'procurement']
        for role in expected_roles:
            assert role in team, f"Role {role} missing from team response"
        
        print(f"✓ All 7 roles present in team response")
        
        # Verify structure of assigned members (if any)
        for role, member in team.items():
            if member is not None:
                assert 'user_id' in member, f"user_id missing for {role}"
                assert 'name' in member, f"name missing for {role}"
                print(f"  - {role}: {member.get('name')}")
            else:
                print(f"  - {role}: Not assigned")
    
    def test_get_project_team_not_found(self):
        """Test GET /api/projects/{project_id}/team returns 404 for invalid project"""
        response = self.session.get(f"{BASE_URL}/api/projects/invalid_project_id_xyz/team")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Returns 404 for invalid project")
    
    # ==================== PATCH /api/projects/{project_id}/team Tests ====================
    
    def test_update_project_team(self):
        """Test PATCH /api/projects/{project_id}/team updates team assignments"""
        # First get available users for each role
        architect_users = self.session.get(f"{BASE_URL}/api/users/by-role/architect").json()
        site_engineer_users = self.session.get(f"{BASE_URL}/api/users/by-role/site_engineer").json()
        
        # Build payload with available users
        payload = {}
        if architect_users:
            payload['architect'] = architect_users[0]['user_id']
            print(f"✓ Will assign architect: {architect_users[0].get('name')}")
        
        if site_engineer_users:
            payload['site_engineer'] = site_engineer_users[0]['user_id']
            print(f"✓ Will assign site_engineer: {site_engineer_users[0].get('name')}")
        
        if not payload:
            pytest.skip("No users available to assign")
        
        # Update team
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.project_id}/team", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'message' in data, "Response should contain message"
        print(f"✓ Team update response: {data}")
        
        # Verify the update persisted
        team_response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/team")
        assert team_response.status_code == 200
        team = team_response.json()
        
        if 'architect' in payload:
            assert team['architect'] is not None, "Architect should be assigned"
            assert team['architect']['user_id'] == payload['architect'], "Architect user_id mismatch"
            print(f"✓ Verified architect assignment persisted")
        
        if 'site_engineer' in payload:
            assert team['site_engineer'] is not None, "Site engineer should be assigned"
            assert team['site_engineer']['user_id'] == payload['site_engineer'], "Site engineer user_id mismatch"
            print(f"✓ Verified site_engineer assignment persisted")
    
    def test_update_project_team_clear_assignment(self):
        """Test PATCH /api/projects/{project_id}/team can clear assignments with null"""
        # Clear the qc role (set to null)
        payload = {'qc': None}
        
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.project_id}/team", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Cleared qc assignment")
        
        # Verify the update persisted
        team_response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/team")
        assert team_response.status_code == 200
        team = team_response.json()
        
        assert team['qc'] is None, "QC should be null after clearing"
        print(f"✓ Verified qc is null after clearing")
    
    def test_update_project_team_invalid_project(self):
        """Test PATCH /api/projects/{project_id}/team returns 404 for invalid project"""
        response = self.session.patch(f"{BASE_URL}/api/projects/invalid_project_id_xyz/team", json={'architect': None})
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Returns 404 for invalid project")
    
    # ==================== Permission Tests ====================
    
    def test_users_by_role_requires_auth(self):
        """Test GET /api/users/by-role/{role} requires authentication"""
        # Create new session without auth
        unauth_session = requests.Session()
        response = unauth_session.get(f"{BASE_URL}/api/users/by-role/architect")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Unauthenticated request returns {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
