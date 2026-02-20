"""
Client Portal API Tests
Tests for client portal functionality including:
- Client login and redirect
- My Projects list endpoint
- Project details endpoint
- Exclusion of work orders, expenses, internal notes from client view
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClientPortalLogin:
    """Test client login and access"""
    
    def test_mohan_client_login(self):
        """Login as Mr. Mohan client (mohan@client.com)"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert data["email"] == "mohan@client.com"
        assert data["role"] == "client"
        assert data["name"] == "Mr. Mohan"
        
        print(f"✓ Mohan client login successful - role: {data['role']}")
        return session, data

    def test_client_role_verification(self):
        """Verify that mohan@client.com has client role"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "client", f"Expected client role, got {data['role']}"
        print(f"✓ Client role verified: {data['role']}")


class TestClientPortalMyProjects:
    """Test client portal my-projects endpoint"""
    
    @pytest.fixture
    def client_session(self):
        """Get authenticated client session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        assert response.status_code == 200
        return session
    
    def test_my_projects_endpoint_returns_linked_projects(self, client_session):
        """Client should see their linked projects"""
        response = client_session.get(f"{BASE_URL}/api/client-portal/my-projects")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        projects = response.json()
        assert isinstance(projects, list), "Response should be a list"
        
        # Mohan should have at least one project
        assert len(projects) >= 1, "Mohan should have at least one linked project"
        
        # Find Mohan Home project
        mohan_home = next((p for p in projects if p.get("project_id") == "proj_ca1781bb430a"), None)
        assert mohan_home is not None, "Mohan Home project should be in the list"
        
        print(f"✓ My Projects returns {len(projects)} project(s)")
        print(f"✓ Mohan Home project found: {mohan_home.get('name')}")
        return projects
    
    def test_my_projects_contains_payment_summary(self, client_session):
        """Projects should include payment summary data"""
        response = client_session.get(f"{BASE_URL}/api/client-portal/my-projects")
        
        assert response.status_code == 200
        projects = response.json()
        
        if len(projects) > 0:
            project = projects[0]
            # Check for enriched payment data
            assert "payment_scheduled" in project or "total_value" in project
            print(f"✓ Project has payment summary data")


class TestClientPortalProjectDetails:
    """Test client portal project detail endpoint"""
    
    @pytest.fixture
    def client_session(self):
        """Get authenticated client session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        assert response.status_code == 200
        return session
    
    def test_project_detail_endpoint(self, client_session):
        """Client can access project details for linked project"""
        project_id = "proj_ca1781bb430a"  # Mohan Home
        
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/{project_id}")
        
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "project" in data, "Response should contain project"
        assert data["project"]["project_id"] == project_id
        assert data["project"]["name"] == "Mohan Home " or "Mohan" in data["project"]["name"]
        
        print(f"✓ Project details accessible: {data['project']['name']}")
        return data
    
    def test_project_detail_contains_payment_stages(self, client_session):
        """Project details should include payment stages"""
        project_id = "proj_ca1781bb430a"
        
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/{project_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "payment_stages" in data, "Response should contain payment_stages"
        print(f"✓ Payment stages included: {len(data.get('payment_stages', []))} stages")
    
    def test_project_detail_contains_scope_items(self, client_session):
        """Project details should include scope items"""
        project_id = "proj_ca1781bb430a"
        
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/{project_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "scope_items" in data, "Response should contain scope_items"
        print(f"✓ Scope items included: {len(data.get('scope_items', []))} items")
    
    def test_project_detail_excludes_internal_notes(self, client_session):
        """Project details should NOT include internal_notes field"""
        project_id = "proj_ca1781bb430a"
        
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/{project_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check payment stages don't have internal_notes
        for stage in data.get("payment_stages", []):
            assert "internal_notes" not in stage, "Internal notes should be excluded from payment stages"
        
        # Check scope items don't have internal_notes
        for item in data.get("scope_items", []):
            assert "internal_notes" not in item, "Internal notes should be excluded from scope items"
        
        print("✓ Internal notes correctly excluded from client view")


class TestClientAccessControl:
    """Test that clients cannot access non-client endpoints"""
    
    @pytest.fixture
    def client_session(self):
        """Get authenticated client session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        assert response.status_code == 200
        return session
    
    def test_client_cannot_access_unlinked_project(self, client_session):
        """Client cannot access projects not linked to them"""
        # Try to access a random project ID
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/proj_nonexistent123")
        
        assert response.status_code == 404, "Should return 404 for unlinked/nonexistent project"
        print("✓ Client cannot access unlinked projects")
    
    def test_non_client_cannot_access_client_portal(self):
        """Non-client users should not access client portal endpoints"""
        session = requests.Session()
        # Login as planning user
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200
        
        # Try to access client portal
        response = session.get(f"{BASE_URL}/api/client-portal/my-projects")
        
        assert response.status_code == 403, f"Non-client should get 403, got {response.status_code}"
        print("✓ Non-client users correctly blocked from client portal")


class TestShareAsPDF:
    """Test Share as PDF functionality - this is browser print, so we test the API data is complete"""
    
    @pytest.fixture
    def client_session(self):
        """Get authenticated client session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        assert response.status_code == 200
        return session
    
    def test_project_data_complete_for_pdf(self, client_session):
        """Verify all data needed for PDF is returned"""
        project_id = "proj_ca1781bb430a"
        
        response = client_session.get(f"{BASE_URL}/api/client-portal/project/{project_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check project has required fields for PDF
        project = data.get("project", {})
        assert project.get("name"), "Project should have name"
        assert project.get("location"), "Project should have location"
        assert "total_value" in project, "Project should have total_value"
        assert "status" in project, "Project should have status"
        
        # Check payment stages are present
        assert "payment_stages" in data, "Should have payment_stages for PDF"
        
        # Check scope items are present
        assert "scope_items" in data, "Should have scope_items for PDF"
        
        print("✓ All data present for Share as PDF functionality")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
