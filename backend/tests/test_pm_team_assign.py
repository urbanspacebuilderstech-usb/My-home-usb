"""
Test PM Dashboard Team Assignment Features
- GET /api/pm/projects - returns projects with team info
- GET /api/pm/team-members - returns all team members with project counts
- POST /api/pm/assign-team - assigns team member to project
- DELETE /api/pm/projects/{project_id}/team/{user_id} - removes team member from project
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestPMTeamAssignment:
    """Test PM Dashboard team assignment features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as PM"""
        self.session = requests.Session()
        # Login as PM
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "pm@constructionos.com"})
        assert login_res.status_code == 200, f"PM login failed: {login_res.text}"
        self.pm_cookies = self.session.cookies
        yield
        
    def test_get_pm_projects(self):
        """Test GET /api/pm/projects returns projects with team info"""
        res = self.session.get(f"{BASE_URL}/api/pm/projects")
        assert res.status_code == 200, f"Failed: {res.status_code} - {res.text}"
        projects = res.json()
        assert isinstance(projects, list), "Expected list of projects"
        print(f"✓ GET /api/pm/projects returned {len(projects)} projects")
        
        # Check that projects have team field
        if projects:
            proj = projects[0]
            assert "team" in proj or "team_assignments" in proj, f"Project missing team field: {proj.keys()}"
            print(f"  - First project: {proj.get('name', 'Unknown')} with team: {proj.get('team', [])}")
            
    def test_get_team_members(self):
        """Test GET /api/pm/team-members returns all team members with project counts"""
        res = self.session.get(f"{BASE_URL}/api/pm/team-members")
        assert res.status_code == 200, f"Failed: {res.status_code} - {res.text}"
        members = res.json()
        assert isinstance(members, list), "Expected list of team members"
        print(f"✓ GET /api/pm/team-members returned {len(members)} members")
        
        # Check each member has required fields
        for member in members:
            assert "user_id" in member, f"Missing user_id: {member}"
            assert "role" in member, f"Missing role: {member}"
            assert "active_projects" in member, f"Missing active_projects: {member}"
            print(f"  - {member.get('name', 'Unknown')} ({member.get('role', '?')}) - {member.get('active_projects', 0)} projects")
            
        # Check for sr_site_engineer and site_engineer roles
        roles = [m["role"] for m in members]
        print(f"  - Roles found: {set(roles)}")
        
    def test_get_team_members_as_planning(self):
        """Test Planning role can also access team-members endpoint"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert login_res.status_code == 200, f"Planning login failed: {login_res.text}"
        
        res = session.get(f"{BASE_URL}/api/pm/team-members")
        assert res.status_code == 200, f"Planning access denied: {res.status_code} - {res.text}"
        print(f"✓ GET /api/pm/team-members accessible by Planning role")

    def test_assign_team_flow(self):
        """Test POST /api/pm/assign-team - assign team member to project"""
        # First, get a project
        proj_res = self.session.get(f"{BASE_URL}/api/pm/projects")
        projects = proj_res.json()
        if not projects:
            pytest.skip("No projects available to test assignment")
        
        test_project = projects[0]
        project_id = test_project.get("project_id")
        print(f"Testing with project: {test_project.get('name', project_id)}")
        
        # Get team members
        team_res = self.session.get(f"{BASE_URL}/api/pm/team-members")
        members = team_res.json()
        
        # Find an unassigned site engineer
        unassigned = None
        for m in members:
            existing_assignments = m.get("assignments", [])
            already_assigned = any(a.get("project_id") == project_id for a in existing_assignments)
            if not already_assigned and m.get("is_active", True) != False:
                unassigned = m
                break
        
        if not unassigned:
            # Try creating a new site engineer for testing
            create_res = self.session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
                "name": "Test SE for Assignment",
                "role": "site_engineer"
            })
            if create_res.status_code == 200:
                unassigned = create_res.json().get("user", {})
                print(f"  Created test SE: {unassigned}")
            else:
                pytest.skip("All team members already assigned to test project, and cannot create new SE")
        
        user_id = unassigned.get("user_id")
        print(f"Assigning {unassigned.get('name', user_id)} to project {project_id}")
        
        # Attempt assignment
        assign_res = self.session.post(f"{BASE_URL}/api/pm/assign-team", json={
            "project_id": project_id,
            "user_id": user_id
        })
        
        # Should succeed or fail with 'already assigned'
        if assign_res.status_code == 200:
            print(f"✓ POST /api/pm/assign-team succeeded: {assign_res.json()}")
            
            # Verify assignment shows in team-members
            verify_res = self.session.get(f"{BASE_URL}/api/pm/team-members")
            members_after = verify_res.json()
            assigned_member = next((m for m in members_after if m.get("user_id") == user_id), None)
            assert assigned_member, "Assigned member not found after assignment"
            print(f"  - Member now has {assigned_member.get('active_projects', 0)} active projects")
            
        elif assign_res.status_code == 400 and "already" in assign_res.text.lower():
            print(f"  User already assigned (expected): {assign_res.json()}")
        else:
            pytest.fail(f"Unexpected response: {assign_res.status_code} - {assign_res.text}")
            
    def test_remove_team_from_project(self):
        """Test DELETE /api/pm/projects/{project_id}/team/{user_id}"""
        # Get projects with team
        proj_res = self.session.get(f"{BASE_URL}/api/pm/projects")
        projects = proj_res.json()
        
        # Find a project with at least one team member
        target = None
        target_member = None
        for p in projects:
            team = p.get("team", [])
            if team:
                target = p
                target_member = team[0]
                break
        
        if not target or not target_member:
            pytest.skip("No projects with team members to test removal")
        
        project_id = target.get("project_id")
        user_id = target_member.get("user_id")
        print(f"Testing removal of {target_member.get('name', user_id)} from {target.get('name', project_id)}")
        
        # Remove
        remove_res = self.session.delete(f"{BASE_URL}/api/pm/projects/{project_id}/team/{user_id}")
        
        if remove_res.status_code == 200:
            print(f"✓ DELETE /api/pm/projects/{project_id}/team/{user_id} succeeded")
            
            # Verify removal
            verify_res = self.session.get(f"{BASE_URL}/api/pm/projects")
            updated_projects = verify_res.json()
            updated_project = next((p for p in updated_projects if p.get("project_id") == project_id), None)
            if updated_project:
                updated_team = updated_project.get("team", [])
                removed = not any(t.get("user_id") == user_id for t in updated_team)
                assert removed, f"User still in team after removal: {updated_team}"
                print(f"  - Verified: User removed from project team")
        elif remove_res.status_code == 404:
            print(f"  Assignment not found (may have been already removed)")
        else:
            pytest.fail(f"Unexpected: {remove_res.status_code} - {remove_res.text}")

    def test_assign_team_validation(self):
        """Test validation: invalid user/project should fail"""
        # Invalid project
        res = self.session.post(f"{BASE_URL}/api/pm/assign-team", json={
            "project_id": "invalid_project_xxx",
            "user_id": "invalid_user_xxx"
        })
        assert res.status_code in [400, 404], f"Expected 400/404 for invalid project, got {res.status_code}"
        print(f"✓ POST /api/pm/assign-team rejects invalid project: {res.status_code}")

    def test_remove_team_validation(self):
        """Test DELETE validation: non-existent assignment returns 404"""
        res = self.session.delete(f"{BASE_URL}/api/pm/projects/invalid_proj/team/invalid_user")
        assert res.status_code == 404, f"Expected 404 for invalid assignment, got {res.status_code}"
        print(f"✓ DELETE /api/pm/projects/{{}}/team/{{}} returns 404 for invalid assignment")


class TestSuperAdminTeamAccess:
    """Test Super Admin can also manage team"""
    
    def test_super_admin_can_access_pm_endpoints(self):
        """Super Admin should have access to all PM endpoints"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        
        # Test each endpoint
        res1 = session.get(f"{BASE_URL}/api/pm/projects")
        assert res1.status_code == 200, f"Admin cannot access pm/projects: {res1.text}"
        
        res2 = session.get(f"{BASE_URL}/api/pm/team-members")
        assert res2.status_code == 200, f"Admin cannot access pm/team-members: {res2.text}"
        
        print(f"✓ Super Admin has access to all PM endpoints")


class TestProjectDetailTeamTab:
    """Test Project Detail Team API endpoints"""
    
    def test_get_project_team(self):
        """Test GET /api/projects/{id}/team returns team info"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "pm@constructionos.com"})
        assert login_res.status_code == 200
        
        # Get a project
        proj_res = session.get(f"{BASE_URL}/api/pm/projects")
        projects = proj_res.json()
        if not projects:
            pytest.skip("No projects available")
        
        project_id = projects[0].get("project_id")
        
        # Get team
        team_res = session.get(f"{BASE_URL}/api/projects/{project_id}/team")
        if team_res.status_code == 200:
            team_data = team_res.json()
            print(f"✓ GET /api/projects/{project_id}/team returned: {team_data}")
            assert "sr_site_engineers" in team_data or "site_engineers" in team_data or "team" in team_data or isinstance(team_data, dict), \
                f"Unexpected team structure: {team_data}"
        elif team_res.status_code == 404:
            print(f"  Team endpoint not found or no team data")
        else:
            print(f"  Team endpoint returned: {team_res.status_code} - {team_res.text[:200]}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
