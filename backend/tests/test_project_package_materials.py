"""
Test Project Package Materials CRUD
- GET /api/projects/{project_id}/package-materials
- PUT /api/projects/{project_id}/package-materials
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProjectPackageMaterials:
    """Test package materials endpoints for projects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with Planning role login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as Planning role
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.project_id = "proj_2d500929fbe9"  # Test project with package_id
        yield
        # Cleanup: restore original materials
        self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={
            "materials": [{"name": "Cement", "brand": "UltraTech"}, {"name": "Steel", "brand": "TATA"}]
        })
    
    def test_get_package_materials_returns_saved_list(self):
        """GET /api/projects/{project_id}/package-materials returns saved materials"""
        res = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/package-materials")
        assert res.status_code == 200, f"GET failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        # Project has pre-saved materials
        assert len(data) >= 2, "Should have at least 2 materials"
        # Verify structure
        for mat in data:
            assert "name" in mat, "Material should have 'name' field"
            assert "brand" in mat, "Material should have 'brand' field"
    
    def test_put_package_materials_saves_list(self):
        """PUT /api/projects/{project_id}/package-materials saves materials"""
        new_materials = [
            {"name": "Cement", "brand": "UltraTech"},
            {"name": "Steel", "brand": "TATA"},
            {"name": "TEST_Bricks", "brand": "TEST_RedBricks"}
        ]
        res = self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={"materials": new_materials})
        assert res.status_code == 200, f"PUT failed: {res.text}"
        data = res.json()
        assert data.get("message") == "Materials saved", "Should return success message"
        assert data.get("count") == 3, "Should return count of 3"
        
        # Verify persistence with GET
        get_res = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/package-materials")
        assert get_res.status_code == 200
        saved = get_res.json()
        assert len(saved) == 3, "Should have 3 materials after save"
        assert any(m["name"] == "TEST_Bricks" for m in saved), "New material should be saved"
    
    def test_put_allows_planning_role(self):
        """PUT allows Planning role to update materials"""
        # Already logged in as Planning
        res = self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={
            "materials": [{"name": "Cement", "brand": "UltraTech"}]
        })
        assert res.status_code == 200, f"Planning should be able to update: {res.text}"
    
    def test_put_updates_existing_materials(self):
        """PUT updates existing material values"""
        # Update brand of existing material
        updated_materials = [
            {"name": "Cement", "brand": "ACC"},  # Changed brand
            {"name": "Steel", "brand": "JSW"}   # Changed brand
        ]
        res = self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={"materials": updated_materials})
        assert res.status_code == 200
        
        # Verify update
        get_res = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/package-materials")
        saved = get_res.json()
        cement = next((m for m in saved if m["name"] == "Cement"), None)
        assert cement is not None, "Cement should exist"
        assert cement["brand"] == "ACC", "Brand should be updated to ACC"
    
    def test_put_removes_materials(self):
        """PUT with fewer materials removes extras"""
        # First add 3 materials
        self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={
            "materials": [
                {"name": "Cement", "brand": "UltraTech"},
                {"name": "Steel", "brand": "TATA"},
                {"name": "TEST_Extra", "brand": "TEST_Brand"}
            ]
        })
        
        # Now save only 2
        res = self.session.put(f"{BASE_URL}/api/projects/{self.project_id}/package-materials", json={
            "materials": [
                {"name": "Cement", "brand": "UltraTech"},
                {"name": "Steel", "brand": "TATA"}
            ]
        })
        assert res.status_code == 200
        
        # Verify only 2 remain
        get_res = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/package-materials")
        saved = get_res.json()
        assert len(saved) == 2, "Should have only 2 materials after removal"
        assert not any(m["name"] == "TEST_Extra" for m in saved), "TEST_Extra should be removed"
    
    def test_get_nonexistent_project_returns_404(self):
        """GET for non-existent project returns 404"""
        res = self.session.get(f"{BASE_URL}/api/projects/nonexistent_project_id/package-materials")
        assert res.status_code == 404, "Should return 404 for non-existent project"


class TestProjectPackageMaterialsPermissions:
    """Test permissions for package materials endpoints"""
    
    def test_cre_can_update_materials(self):
        """CRE role can update package materials"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        # Login as CRE (cre@constructionos.com has role 'cre')
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200, f"CRE login failed: {login_res.text}"
        
        project_id = "proj_2d500929fbe9"
        res = session.put(f"{BASE_URL}/api/projects/{project_id}/package-materials", json={
            "materials": [{"name": "Cement", "brand": "UltraTech"}, {"name": "Steel", "brand": "TATA"}]
        })
        assert res.status_code == 200, f"CRE should be able to update: {res.text}"
    
    def test_project_manager_can_update_materials(self):
        """Project Manager role can update package materials"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        # Login as PM
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "pm@constructionos.com"})
        assert login_res.status_code == 200, f"PM login failed: {login_res.text}"
        
        project_id = "proj_2d500929fbe9"
        res = session.put(f"{BASE_URL}/api/projects/{project_id}/package-materials", json={
            "materials": [{"name": "Cement", "brand": "UltraTech"}, {"name": "Steel", "brand": "TATA"}]
        })
        assert res.status_code == 200, f"PM should be able to update: {res.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
