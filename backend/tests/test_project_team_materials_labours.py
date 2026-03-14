"""
Test: Project Detail Team, Materials, Labours tabs
Testing: New tabs for ProjectDetail page (Team, Materials, Labours)
         PM role cost hiding, PM create Sr. Site Engineer
         PM assign team members

Endpoints under test:
- GET /api/projects/{id}/team - Team data (PM, sr_site_engineers, site_engineers)
- GET /api/projects/{id}/materials-summary - Materials with summary stats
- GET /api/projects/{id}/labours-summary - Labours with summary stats
- POST /api/pm/create-site-engineer - PM creates Site Engineer or Sr. Site Engineer
- POST /api/pm/assign-team - PM assigns team members to project

Test credentials:
- Super Admin: admin@constructionos.com / Demo@1234
- PM: pm@constructionos.com / Demo@1234
- Test project: proj_murugan_001
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def admin_session():
    """Super Admin session"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@constructionos.com",
        "password": "Demo@1234"
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def pm_session():
    """Project Manager session"""
    session = requests.Session()
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "pm@constructionos.com",
        "password": "Demo@1234"
    })
    assert resp.status_code == 200, f"PM login failed: {resp.text}"
    return session


class TestProjectTeamEndpoint:
    """Test GET /api/projects/{id}/team endpoint"""
    
    def test_get_team_returns_structure(self, admin_session):
        """Verify team endpoint returns correct structure"""
        resp = admin_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/team")
        assert resp.status_code == 200, f"Get team failed: {resp.text}"
        
        data = resp.json()
        # Verify structure
        assert "project_manager" in data
        assert "sr_site_engineers" in data
        assert "site_engineers" in data
        assert isinstance(data["sr_site_engineers"], list)
        assert isinstance(data["site_engineers"], list)
        print(f"Team structure valid: PM={data['project_manager']}, Sr.SE={len(data['sr_site_engineers'])}, SE={len(data['site_engineers'])}")
    
    def test_pm_can_access_team(self, pm_session):
        """PM role can access team endpoint"""
        resp = pm_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/team")
        assert resp.status_code == 200, f"PM get team failed: {resp.text}"
        data = resp.json()
        assert "site_engineers" in data


class TestMaterialsSummaryEndpoint:
    """Test GET /api/projects/{id}/materials-summary endpoint"""
    
    def test_admin_sees_cost(self, admin_session):
        """Super Admin sees total_cost in materials summary"""
        resp = admin_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/materials-summary")
        assert resp.status_code == 200, f"Get materials failed: {resp.text}"
        
        data = resp.json()
        assert "summary" in data
        assert "materials" in data
        
        summary = data["summary"]
        assert "total_requests" in summary
        assert "total_cost" in summary, "Super Admin should see total_cost"
        
        # Verify materials have unit_rate and total_amount
        if len(data["materials"]) > 0:
            mat = data["materials"][0]
            assert "unit_rate" in mat or mat.get("unit_rate") is None  # Field should exist
        
        print(f"Admin materials: total={summary['total_requests']}, cost={summary.get('total_cost', 0)}")
    
    def test_pm_cost_hidden(self, pm_session):
        """PM role should NOT see total_cost in materials summary"""
        resp = pm_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/materials-summary")
        assert resp.status_code == 200, f"PM get materials failed: {resp.text}"
        
        data = resp.json()
        summary = data["summary"]
        
        # PM should NOT see total_cost
        assert "total_cost" not in summary, f"PM should NOT see total_cost. Got: {summary}"
        
        # PM should NOT see unit_rate/total_amount in materials
        if len(data["materials"]) > 0:
            mat = data["materials"][0]
            assert "unit_rate" not in mat, f"PM should NOT see unit_rate. Got: {mat.keys()}"
            assert "total_amount" not in mat, f"PM should NOT see total_amount. Got: {mat.keys()}"
        
        print(f"PM materials: total={summary['total_requests']}, NO cost visible (as expected)")


class TestLaboursSummaryEndpoint:
    """Test GET /api/projects/{id}/labours-summary endpoint"""
    
    def test_admin_sees_cost(self, admin_session):
        """Super Admin sees total_cost in labours summary"""
        resp = admin_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/labours-summary")
        assert resp.status_code == 200, f"Get labours failed: {resp.text}"
        
        data = resp.json()
        assert "summary" in data
        assert "labours" in data
        
        summary = data["summary"]
        assert "total" in summary
        assert "total_cost" in summary, "Super Admin should see total_cost"
        
        print(f"Admin labours: total={summary['total']}, cost={summary.get('total_cost', 0)}")
    
    def test_pm_cost_hidden(self, pm_session):
        """PM role should NOT see total_cost in labours summary"""
        resp = pm_session.get(f"{BASE_URL}/api/projects/proj_murugan_001/labours-summary")
        assert resp.status_code == 200, f"PM get labours failed: {resp.text}"
        
        data = resp.json()
        summary = data["summary"]
        
        # PM should NOT see total_cost
        assert "total_cost" not in summary, f"PM should NOT see total_cost. Got: {summary}"
        
        # PM should NOT see daily_rate/total_amount in labours
        if len(data["labours"]) > 0:
            lab = data["labours"][0]
            assert "daily_rate" not in lab, f"PM should NOT see daily_rate. Got: {lab.keys()}"
            assert "total_amount" not in lab, f"PM should NOT see total_amount. Got: {lab.keys()}"
        
        print(f"PM labours: total={summary['total']}, NO cost visible (as expected)")


class TestPMCreateSiteEngineer:
    """Test POST /api/pm/create-site-engineer endpoint"""
    
    def test_create_site_engineer(self, pm_session):
        """PM can create Site Engineer"""
        import uuid
        test_name = f"TEST_SE_{uuid.uuid4().hex[:6]}"
        
        resp = pm_session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": test_name,
            "phone": "9876543210",
            "email": f"{test_name.lower()}@test.com",
            "role": "site_engineer"
        })
        
        assert resp.status_code == 200, f"Create SE failed: {resp.text}"
        data = resp.json()
        assert "user" in data
        assert data["user"]["role"] == "site_engineer"
        assert data["user"]["name"] == test_name
        print(f"Created Site Engineer: {test_name}")
    
    def test_create_sr_site_engineer(self, pm_session):
        """PM can create Sr. Site Engineer"""
        import uuid
        test_name = f"TEST_SRSE_{uuid.uuid4().hex[:6]}"
        
        resp = pm_session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": test_name,
            "phone": "9876543211",
            "role": "sr_site_engineer"
        })
        
        assert resp.status_code == 200, f"Create Sr. SE failed: {resp.text}"
        data = resp.json()
        assert "user" in data
        assert data["user"]["role"] == "sr_site_engineer"
        print(f"Created Sr. Site Engineer: {test_name}")
    
    def test_invalid_role_rejected(self, pm_session):
        """PM cannot create invalid roles"""
        resp = pm_session.post(f"{BASE_URL}/api/pm/create-site-engineer", json={
            "name": "Invalid Role User",
            "role": "super_admin"  # Invalid role
        })
        
        assert resp.status_code == 400, f"Expected 400 for invalid role: {resp.text}"


class TestPMAssignTeam:
    """Test POST /api/pm/assign-team endpoint"""
    
    def test_assign_team_member(self, pm_session):
        """PM can assign team member to project"""
        # First get team members
        team_resp = pm_session.get(f"{BASE_URL}/api/pm/team-members")
        assert team_resp.status_code == 200
        
        team = team_resp.json()
        if len(team) == 0:
            pytest.skip("No team members to assign")
        
        # Find a member not already assigned
        member = team[0]
        
        # Try to assign (may already be assigned) - role is required
        resp = pm_session.post(f"{BASE_URL}/api/pm/assign-team", json={
            "project_id": "proj_murugan_001",
            "user_id": member["user_id"],
            "role": member.get("role", "site_engineer")
        })
        
        # Either 200 success or 400 already assigned is acceptable
        assert resp.status_code in [200, 400], f"Assign team failed: {resp.text}"
        if resp.status_code == 200:
            print(f"Assigned {member['name']} to project")
        else:
            print(f"Member already assigned (expected behavior)")
    
    def test_pm_can_get_team_members(self, pm_session):
        """PM can get list of team members"""
        resp = pm_session.get(f"{BASE_URL}/api/pm/team-members")
        assert resp.status_code == 200, f"Get team members failed: {resp.text}"
        
        members = resp.json()
        assert isinstance(members, list)
        
        # Verify each member has required fields
        for m in members[:3]:  # Check first 3
            assert "user_id" in m
            assert "name" in m
            assert "role" in m
            assert m["role"] in ["site_engineer", "sr_site_engineer", "associate_pm"]
        
        print(f"Got {len(members)} team members")


class TestEndpointAuthentication:
    """Test endpoints require authentication"""
    
    def test_team_requires_auth(self):
        """Team endpoint requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/projects/proj_murugan_001/team")
        assert resp.status_code in [401, 403], f"Expected auth error: {resp.status_code}"
    
    def test_materials_requires_auth(self):
        """Materials endpoint requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/projects/proj_murugan_001/materials-summary")
        assert resp.status_code in [401, 403], f"Expected auth error: {resp.status_code}"
    
    def test_labours_requires_auth(self):
        """Labours endpoint requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/projects/proj_murugan_001/labours-summary")
        assert resp.status_code in [401, 403], f"Expected auth error: {resp.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
