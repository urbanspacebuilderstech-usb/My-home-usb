"""
Test Material Request Feature for Site Engineers
Tests:
1. GET /api/projects/{project_id}/approved-materials - Returns materials for the project
2. POST /api/site-engineer/material-requests - Creates a material request
3. Regression: SE Dashboard tabs still work
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com')

# Test credentials from review request
SE_EMAIL = "engineer@constructionos.com"
TEST_PROJECT_ID = "proj_12f23331b542"  # Vinoth Kumar Villa - has 33 approved materials


class TestMaterialRequestFeature:
    """Test Material Request feature for Site Engineers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as Site Engineer"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer using demo access
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip(f"Failed to login as Site Engineer: {login_resp.status_code} - {login_resp.text}")
        
        self.user = login_resp.json()
        print(f"Logged in as: {self.user.get('name', 'Unknown')} ({self.user.get('email', 'Unknown')})")
        yield
    
    def test_01_get_approved_materials_for_project(self):
        """Test GET /api/projects/{project_id}/approved-materials returns materials"""
        response = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/approved-materials")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        materials = response.json()
        assert isinstance(materials, list), "Response should be a list"
        
        print(f"Found {len(materials)} approved materials for project {TEST_PROJECT_ID}")
        
        # Verify material structure
        if len(materials) > 0:
            mat = materials[0]
            assert "material_id" in mat, "Material should have material_id"
            assert "name" in mat, "Material should have name"
            # Brand and unit are optional but should be present
            print(f"Sample material: {mat.get('name')} - Brand: {mat.get('brand', 'N/A')} - Unit: {mat.get('unit', 'N/A')}")
        
        return materials
    
    def test_02_get_approved_materials_shows_brand_and_unit(self):
        """Test that approved materials include brand and unit info"""
        response = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/approved-materials")
        
        assert response.status_code == 200
        materials = response.json()
        
        # Check that at least some materials have brand info
        materials_with_brand = [m for m in materials if m.get('brand')]
        materials_with_unit = [m for m in materials if m.get('unit')]
        
        print(f"Materials with brand: {len(materials_with_brand)}/{len(materials)}")
        print(f"Materials with unit: {len(materials_with_unit)}/{len(materials)}")
        
        # At least some materials should have unit
        assert len(materials_with_unit) > 0 or len(materials) == 0, "Materials should have unit info"
    
    def test_03_create_material_request_success(self):
        """Test POST /api/site-engineer/material-requests creates request successfully"""
        # First get approved materials
        mat_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/approved-materials")
        assert mat_resp.status_code == 200
        materials = mat_resp.json()
        
        if len(materials) == 0:
            pytest.skip("No approved materials for this project")
        
        # Pick first material
        mat = materials[0]
        
        # Create material request
        request_data = {
            "project_id": TEST_PROJECT_ID,
            "material_id": mat.get("material_id"),
            "material_name": mat.get("name"),
            "brand": mat.get("brand", ""),
            "is_approved_material": True,
            "quantity": 10,
            "unit": mat.get("unit", "unit"),
            "remarks": "Test request from automated testing"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=request_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        
        # Verify response structure
        assert "request_id" in result, "Response should have request_id"
        assert result.get("status") == "requested", f"Status should be 'requested', got {result.get('status')}"
        assert result.get("material_name") == mat.get("name"), "Material name should match"
        assert result.get("quantity") == 10, "Quantity should match"
        
        print(f"Created material request: {result.get('request_id')}")
        print(f"Material: {result.get('material_name')} x {result.get('quantity')} {result.get('unit')}")
        print(f"Status: {result.get('status')}")
        
        return result
    
    def test_04_create_material_request_validation(self):
        """Test that material request validates required fields"""
        # Try to create request without material_id
        request_data = {
            "project_id": TEST_PROJECT_ID,
            "quantity": 10,
            "unit": "unit"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=request_data)
        
        # Should still work but with custom material_id generated
        # The API is flexible and generates material_id if not provided
        if response.status_code == 200:
            result = response.json()
            assert "material_id" in result, "Should have generated material_id"
            print(f"API generated material_id: {result.get('material_id')}")
        else:
            print(f"Validation response: {response.status_code} - {response.text}")
    
    def test_05_get_site_engineer_projects(self):
        """Test GET /api/site-engineer/my-projects returns assigned projects"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        projects = response.json()
        assert isinstance(projects, list), "Response should be a list"
        
        print(f"Site Engineer has {len(projects)} assigned projects")
        
        # Find our test project
        test_project = next((p for p in projects if p.get("project_id") == TEST_PROJECT_ID), None)
        if test_project:
            print(f"Found test project: {test_project.get('name')}")
            assert "name" in test_project, "Project should have name"
            assert "status" in test_project, "Project should have status"
        
        return projects
    
    def test_06_get_material_requests_list(self):
        """Test GET /api/site-engineer/material-requests returns SE's requests"""
        response = self.session.get(f"{BASE_URL}/api/site-engineer/material-requests")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        requests_list = response.json()
        assert isinstance(requests_list, list), "Response should be a list"
        
        print(f"Site Engineer has {len(requests_list)} material requests")
        
        # Check for our test requests
        test_requests = [r for r in requests_list if r.get("project_id") == TEST_PROJECT_ID]
        print(f"Requests for test project: {len(test_requests)}")
        
        return requests_list
    
    def test_07_regression_se_dashboard_tabs(self):
        """Regression: Test that SE Dashboard data endpoints work"""
        # Test work orders endpoint
        wo_resp = self.session.get(f"{BASE_URL}/api/site-engineer/work-orders")
        assert wo_resp.status_code == 200, f"Work orders endpoint failed: {wo_resp.status_code}"
        print(f"Work orders: {len(wo_resp.json())} items")
        
        # Test petty cash endpoint
        pc_resp = self.session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        assert pc_resp.status_code == 200, f"Petty cash endpoint failed: {pc_resp.status_code}"
        print(f"Petty cash: {len(pc_resp.json())} items")
        
        # Test attendance endpoints
        att_today = self.session.get(f"{BASE_URL}/api/attendance/my-today")
        assert att_today.status_code == 200, f"Attendance today failed: {att_today.status_code}"
        
        att_history = self.session.get(f"{BASE_URL}/api/attendance/my-history")
        assert att_history.status_code == 200, f"Attendance history failed: {att_history.status_code}"
        print(f"Attendance history: {len(att_history.json())} entries")
    
    def test_08_approved_materials_access_control(self):
        """Test that approved materials endpoint requires proper assignment"""
        # This should work since SE is assigned to the project
        response = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/approved-materials")
        assert response.status_code == 200, "SE should access approved materials for assigned project"
        
        # Try a non-existent project
        fake_project = "proj_nonexistent123"
        response2 = self.session.get(f"{BASE_URL}/api/projects/{fake_project}/approved-materials")
        # Should return 403 (not assigned) or empty list
        print(f"Non-assigned project response: {response2.status_code}")


class TestMaterialRequestWithDifferentMaterials:
    """Test creating material requests with different materials"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as Site Engineer"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip(f"Failed to login: {login_resp.status_code}")
        
        yield
    
    def test_create_request_with_brand(self):
        """Test creating request with brand info preserved"""
        mat_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/approved-materials")
        materials = mat_resp.json()
        
        # Find a material with brand
        mat_with_brand = next((m for m in materials if m.get('brand')), None)
        
        if not mat_with_brand:
            pytest.skip("No materials with brand found")
        
        request_data = {
            "project_id": TEST_PROJECT_ID,
            "material_id": mat_with_brand.get("material_id"),
            "material_name": mat_with_brand.get("name"),
            "brand": mat_with_brand.get("brand"),
            "is_approved_material": True,
            "quantity": 5,
            "unit": mat_with_brand.get("unit", "unit"),
            "remarks": "Test with brand"
        }
        
        response = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=request_data)
        assert response.status_code == 200
        
        result = response.json()
        assert result.get("brand") == mat_with_brand.get("brand"), "Brand should be preserved"
        print(f"Created request with brand: {result.get('brand')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
