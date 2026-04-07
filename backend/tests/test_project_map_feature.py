"""
Test Project Map Feature - GPS coordinates and set-location endpoint
Tests:
1. PATCH /api/projects/{id}/set-location endpoint
2. GET /api/site-engineer/my-projects returns projects with GPS coordinates
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProjectMapFeature:
    """Test project GPS location features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with SE login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        assert login_response.status_code == 200, f"SE login failed: {login_response.text}"
        self.se_user = login_response.json()
        print(f"Logged in as SE: {self.se_user.get('name', 'Unknown')}")
        
    def test_01_get_se_projects_with_gps(self):
        """Test that SE can get their projects with GPS coordinates"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 200, f"Failed to get SE projects: {response.text}"
        
        projects = response.json()
        assert isinstance(projects, list), "Expected list of projects"
        print(f"SE has {len(projects)} assigned projects")
        
        # Check for projects with GPS coordinates
        gps_projects = [p for p in projects if p.get('latitude') and p.get('longitude')]
        print(f"Projects with GPS: {len(gps_projects)}")
        
        for p in gps_projects:
            print(f"  - {p['name']}: ({p['latitude']}, {p['longitude']})")
            assert isinstance(p['latitude'], (int, float)), "latitude should be numeric"
            assert isinstance(p['longitude'], (int, float)), "longitude should be numeric"
        
        # Store a project ID for later tests
        if projects:
            self.test_project_id = projects[0].get('project_id')
            print(f"Test project ID: {self.test_project_id}")
        
        return projects
    
    def test_02_set_project_location_endpoint(self):
        """Test PATCH /api/projects/{id}/set-location endpoint"""
        # First get a project
        projects_response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert projects_response.status_code == 200
        projects = projects_response.json()
        
        if not projects:
            pytest.skip("No projects available for testing")
        
        project_id = projects[0].get('project_id')
        
        # Test setting location
        test_lat = 13.0827
        test_lng = 80.2707
        
        response = self.session.patch(
            f"{BASE_URL}/api/projects/{project_id}/set-location",
            json={"latitude": test_lat, "longitude": test_lng}
        )
        
        assert response.status_code == 200, f"Failed to set location: {response.text}"
        data = response.json()
        assert data.get('message') == "Project location updated"
        assert data.get('latitude') == test_lat
        assert data.get('longitude') == test_lng
        print(f"Successfully set location for project {project_id}: ({test_lat}, {test_lng})")
    
    def test_03_set_location_missing_params(self):
        """Test set-location endpoint with missing parameters"""
        projects_response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        projects = projects_response.json()
        
        if not projects:
            pytest.skip("No projects available for testing")
        
        project_id = projects[0].get('project_id')
        
        # Test with missing latitude
        response = self.session.patch(
            f"{BASE_URL}/api/projects/{project_id}/set-location",
            json={"longitude": 80.2707}
        )
        assert response.status_code == 400, "Should fail with missing latitude"
        
        # Test with missing longitude
        response = self.session.patch(
            f"{BASE_URL}/api/projects/{project_id}/set-location",
            json={"latitude": 13.0827}
        )
        assert response.status_code == 400, "Should fail with missing longitude"
        
        print("Validation for missing params works correctly")
    
    def test_04_verify_gps_projects_data_structure(self):
        """Verify that projects with GPS have correct data structure for map rendering"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 200
        
        projects = response.json()
        gps_projects = [p for p in projects if p.get('latitude') and p.get('longitude')]
        
        for p in gps_projects:
            # Verify required fields for map popup
            assert 'name' in p, f"Project missing 'name' field"
            assert 'location' in p or p.get('location') is None, "Project should have location field"
            assert 'client_name' in p, f"Project missing 'client_name' field"
            assert 'latitude' in p, f"Project missing 'latitude' field"
            assert 'longitude' in p, f"Project missing 'longitude' field"
            
            # Verify coordinates are valid
            lat = p['latitude']
            lng = p['longitude']
            assert -90 <= lat <= 90, f"Invalid latitude: {lat}"
            assert -180 <= lng <= 180, f"Invalid longitude: {lng}"
            
            print(f"Project '{p['name']}' has valid GPS data: ({lat}, {lng})")
        
        print(f"All {len(gps_projects)} GPS projects have valid data structure")


class TestProjectMapAsAdmin:
    """Test project GPS features as admin"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Admin login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_response.status_code == 200, f"Admin login failed: {login_response.text}"
        self.admin_user = login_response.json()
        print(f"Logged in as Admin: {self.admin_user.get('name', 'Unknown')}")
    
    def test_01_admin_can_set_project_location(self):
        """Test that admin can set project location"""
        # Get all projects
        response = self.session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200, f"Failed to get projects: {response.text}"
        
        projects = response.json()
        if not projects:
            pytest.skip("No projects available")
        
        # Find a project to test
        project_id = projects[0].get('project_id')
        
        # Set location
        response = self.session.patch(
            f"{BASE_URL}/api/projects/{project_id}/set-location",
            json={"latitude": 13.0500, "longitude": 80.2500}
        )
        
        assert response.status_code == 200, f"Admin failed to set location: {response.text}"
        print(f"Admin successfully set location for project {project_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
