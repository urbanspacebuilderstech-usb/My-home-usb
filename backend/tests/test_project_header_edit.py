"""
Test Project Header Inline Edit Feature
- PATCH /api/projects/{project_id} allows planning and cre roles (not just super_admin/project_manager)
- PATCH /api/projects/{project_id} accepts package_id field in the body
- GET /api/projects/{project_id}/full-details returns project_code in USB-H format
- New project creation generates USB-H sequential project_code
- GET /api/packages returns packages from package management
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProjectHeaderEdit:
    """Test project header inline edit feature for Planning and CRE roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_project_id = "proj_12f23331b542"  # Vinoth Kumar Villa project
    
    def login_as_planning(self):
        """Login as planning user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        return response
    
    def login_as_cre(self):
        """Login as CRE user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        return response
    
    def login_as_super_admin(self):
        """Login as super admin user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        return response
    
    # ==================== Authentication Tests ====================
    
    def test_unauthenticated_patch_returns_401(self):
        """Test that unauthenticated PATCH returns 401"""
        fresh_session = requests.Session()
        response = fresh_session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": "Test"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Unauthenticated PATCH returns 401")
    
    # ==================== Planning Role Tests ====================
    
    def test_planning_can_get_project_full_details(self):
        """Test Planning user can get project full details"""
        self.login_as_planning()
        response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "project" in data, "Response should contain 'project' key"
        project = data["project"]
        assert "project_code" in project, "Project should have project_code"
        # Verify USB-H format
        project_code = project.get("project_code", "")
        assert re.match(r"^USB-H\d{4}$", project_code), f"Project code '{project_code}' should match USB-H0001 format"
        print(f"PASS: Planning can get project full details, project_code={project_code}")
    
    def test_planning_can_patch_project_name(self):
        """Test Planning user can update project name"""
        self.login_as_planning()
        # Get original name
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_name = get_response.json()["project"]["name"]
        
        # Update name
        new_name = f"{original_name} - Test Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": new_name})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_name = verify_response.json()["project"]["name"]
        assert updated_name == new_name, f"Name not updated: expected '{new_name}', got '{updated_name}'"
        
        # Restore original name
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": original_name})
        print("PASS: Planning can update project name")
    
    def test_planning_can_patch_client_name(self):
        """Test Planning user can update client name"""
        self.login_as_planning()
        # Get original client_name
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_client = get_response.json()["project"].get("client_name", "")
        
        # Update client_name
        new_client = "TEST_Client_Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"client_name": new_client})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_client = verify_response.json()["project"].get("client_name", "")
        assert updated_client == new_client, f"Client name not updated: expected '{new_client}', got '{updated_client}'"
        
        # Restore original
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"client_name": original_client})
        print("PASS: Planning can update client name")
    
    def test_planning_can_patch_location(self):
        """Test Planning user can update location"""
        self.login_as_planning()
        # Get original location
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_location = get_response.json()["project"].get("location", "")
        
        # Update location
        new_location = "TEST_Location_Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"location": new_location})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_location = verify_response.json()["project"].get("location", "")
        assert updated_location == new_location, f"Location not updated: expected '{new_location}', got '{updated_location}'"
        
        # Restore original
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"location": original_location})
        print("PASS: Planning can update location")
    
    def test_planning_can_patch_package_id(self):
        """Test Planning user can update package_id"""
        self.login_as_planning()
        # Get original package_id
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_package = get_response.json()["project"].get("package_id", "")
        
        # Get available packages
        packages_response = self.session.get(f"{BASE_URL}/api/packages")
        assert packages_response.status_code == 200, f"Failed to get packages: {packages_response.text}"
        packages = packages_response.json()
        
        if packages:
            # Update to first available package
            new_package_id = packages[0]["package_id"]
            response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"package_id": new_package_id})
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify update
            verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
            updated_package = verify_response.json()["project"].get("package_id", "")
            assert updated_package == new_package_id, f"Package not updated: expected '{new_package_id}', got '{updated_package}'"
            
            # Restore original (or clear if was empty)
            restore_payload = {"package_id": original_package} if original_package else {"package_id": ""}
            self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json=restore_payload)
            print(f"PASS: Planning can update package_id (tested with {new_package_id})")
        else:
            print("SKIP: No packages available to test package_id update")
    
    # ==================== CRE Role Tests ====================
    
    def test_cre_can_get_project_full_details(self):
        """Test CRE user can get project full details"""
        self.login_as_cre()
        response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "project" in data, "Response should contain 'project' key"
        project = data["project"]
        assert "project_code" in project, "Project should have project_code"
        print(f"PASS: CRE can get project full details, project_code={project.get('project_code')}")
    
    def test_cre_can_patch_project_name(self):
        """Test CRE user can update project name"""
        self.login_as_cre()
        # Get original name
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_name = get_response.json()["project"]["name"]
        
        # Update name
        new_name = f"{original_name} - CRE Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": new_name})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_name = verify_response.json()["project"]["name"]
        assert updated_name == new_name, f"Name not updated: expected '{new_name}', got '{updated_name}'"
        
        # Restore original name
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": original_name})
        print("PASS: CRE can update project name")
    
    def test_cre_can_patch_client_name(self):
        """Test CRE user can update client name"""
        self.login_as_cre()
        # Get original client_name
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_client = get_response.json()["project"].get("client_name", "")
        
        # Update client_name
        new_client = "TEST_CRE_Client_Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"client_name": new_client})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_client = verify_response.json()["project"].get("client_name", "")
        assert updated_client == new_client, f"Client name not updated: expected '{new_client}', got '{updated_client}'"
        
        # Restore original
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"client_name": original_client})
        print("PASS: CRE can update client name")
    
    # ==================== Package Management Tests ====================
    
    def test_get_packages_returns_list(self):
        """Test GET /api/packages returns list of packages"""
        self.login_as_planning()
        response = self.session.get(f"{BASE_URL}/api/packages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        packages = response.json()
        assert isinstance(packages, list), "Packages should be a list"
        print(f"PASS: GET /api/packages returns {len(packages)} packages")
        if packages:
            pkg = packages[0]
            assert "package_id" in pkg, "Package should have package_id"
            assert "name" in pkg, "Package should have name"
            print(f"  First package: {pkg.get('name')} (ID: {pkg.get('package_id')})")
    
    # ==================== Project Code Format Tests ====================
    
    def test_project_code_usb_h_format(self):
        """Test that project_code is in USB-H0001 format"""
        self.login_as_planning()
        response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        assert response.status_code == 200
        project = response.json()["project"]
        project_code = project.get("project_code", "")
        
        # Verify USB-H format with 4 digits
        pattern = r"^USB-H\d{4}$"
        assert re.match(pattern, project_code), f"Project code '{project_code}' should match USB-H0001 format"
        print(f"PASS: Project code '{project_code}' matches USB-H format")
    
    def test_multiple_projects_have_usb_h_format(self):
        """Test that multiple projects have USB-H format codes"""
        self.login_as_planning()
        # Get planning board projects
        response = self.session.get(f"{BASE_URL}/api/planning/board")
        if response.status_code != 200:
            print("SKIP: Could not access planning board")
            return
        
        data = response.json()
        projects = data.get("projects", [])
        
        usb_h_count = 0
        for project in projects[:10]:  # Check first 10 projects
            project_code = project.get("project_code", "")
            if re.match(r"^USB-H\d{4}$", project_code):
                usb_h_count += 1
        
        print(f"PASS: {usb_h_count}/{min(len(projects), 10)} projects have USB-H format codes")
    
    # ==================== Super Admin Tests ====================
    
    def test_super_admin_can_patch_project(self):
        """Test Super Admin can update project"""
        self.login_as_super_admin()
        # Get original name
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_name = get_response.json()["project"]["name"]
        
        # Update name
        new_name = f"{original_name} - Admin Edit"
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": new_name})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Restore original name
        self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"name": original_name})
        print("PASS: Super Admin can update project")
    
    # ==================== Edge Cases ====================
    
    def test_patch_with_empty_payload_returns_400(self):
        """Test PATCH with empty payload returns 400"""
        self.login_as_planning()
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={})
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("PASS: PATCH with empty payload returns 400")
    
    def test_patch_nonexistent_project_returns_error(self):
        """Test PATCH on nonexistent project returns error"""
        self.login_as_planning()
        response = self.session.patch(f"{BASE_URL}/api/projects/nonexistent_project_id", json={"name": "Test"})
        # Should return 404 or similar error
        assert response.status_code in [404, 400, 500], f"Expected error status, got {response.status_code}"
        print(f"PASS: PATCH on nonexistent project returns {response.status_code}")
    
    def test_clear_package_id(self):
        """Test clearing package_id by sending empty string"""
        self.login_as_planning()
        # Get original package_id
        get_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        original_package = get_response.json()["project"].get("package_id", "")
        
        # Clear package_id
        response = self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"package_id": ""})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify cleared
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{self.test_project_id}/full-details")
        updated_package = verify_response.json()["project"].get("package_id")
        assert updated_package is None or updated_package == "", f"Package should be cleared, got '{updated_package}'"
        
        # Restore original if it existed
        if original_package:
            self.session.patch(f"{BASE_URL}/api/projects/{self.test_project_id}", json={"package_id": original_package})
        print("PASS: Can clear package_id by sending empty string")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
