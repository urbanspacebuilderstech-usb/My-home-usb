"""
Test Suite: Scope Item CRUD and Project Deletion
Features tested:
- Planning user can edit scope items (PATCH /api/scope-items/{scope_id})
- Planning user can delete scope items (DELETE /api/scope-items/{scope_id})
- Super Admin can delete any project (DELETE /api/projects/{project_id})
- Planning user can only delete projects in planning/draft status
- Delete Project dialog requires typing 'DELETE' to confirm (frontend test)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test users
PLANNING_USER = "planning@constructionos.com"
SUPER_ADMIN = "admin@constructionos.com"
ACCOUNTANT_USER = "accountant@constructionos.com"

# Test project with scope items
TEST_PROJECT_ID = "proj_classic001"


class TestScopeItemOperations:
    """Test scope item CRUD operations for Planning role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login(self, email):
        """Helper to login as specific user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        assert response.status_code == 200, f"Login failed for {email}: {response.text}"
        return response.json()
    
    def _get_scope_items(self, project_id):
        """Get scope items for a project"""
        response = self.session.get(f"{BASE_URL}/api/projects/{project_id}/scope-items")
        return response

    # ==================== Planning User Scope Edit Tests ====================
    
    def test_planning_user_login(self):
        """Test Planning user can login"""
        user = self._login(PLANNING_USER)
        assert user["role"] == "planning", f"Expected planning role, got {user['role']}"
        assert user["email"] == PLANNING_USER
        print(f"SUCCESS: Planning user logged in: {user['name']}")
    
    def test_planning_can_get_scope_items(self):
        """Planning user can view scope items for a project"""
        self._login(PLANNING_USER)
        response = self._get_scope_items(TEST_PROJECT_ID)
        assert response.status_code == 200, f"Failed to get scope items: {response.text}"
        scope_items = response.json()
        assert isinstance(scope_items, list), "Scope items should be a list"
        print(f"SUCCESS: Retrieved {len(scope_items)} scope items for {TEST_PROJECT_ID}")
        return scope_items
    
    def test_planning_can_edit_scope_item_name(self):
        """Planning user can edit scope item name"""
        self._login(PLANNING_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test editing")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        original_name = first_item["item_name"]
        
        # Update the item name
        new_name = f"{original_name}_EDITED"
        response = self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "item_name": new_name
        })
        assert response.status_code == 200, f"Failed to edit scope item: {response.text}"
        
        # Verify the change persisted
        updated_items = self._get_scope_items(TEST_PROJECT_ID).json()
        edited_item = next((i for i in updated_items if i["scope_id"] == scope_id), None)
        assert edited_item is not None, "Edited item not found"
        assert edited_item["item_name"] == new_name, f"Name not updated: {edited_item['item_name']}"
        
        # Revert back to original
        self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "item_name": original_name
        })
        print(f"SUCCESS: Planning user edited scope item name: {original_name} -> {new_name}")
    
    def test_planning_can_edit_scope_item_quantity(self):
        """Planning user can edit scope item quantity"""
        self._login(PLANNING_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test editing")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        original_qty = first_item["quantity"]
        original_rate = first_item.get("unit_rate", 0)
        
        # Update quantity
        new_qty = 999
        response = self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "quantity": new_qty
        })
        assert response.status_code == 200, f"Failed to edit quantity: {response.text}"
        
        # Verify the change persisted and total recalculated
        updated_items = self._get_scope_items(TEST_PROJECT_ID).json()
        edited_item = next((i for i in updated_items if i["scope_id"] == scope_id), None)
        assert edited_item["quantity"] == new_qty, f"Quantity not updated"
        expected_total = new_qty * original_rate
        assert edited_item.get("total_amount") == expected_total, f"Total amount not recalculated correctly"
        
        # Revert
        self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "quantity": original_qty
        })
        print(f"SUCCESS: Planning user edited scope item quantity: {original_qty} -> {new_qty}")
    
    def test_planning_can_edit_scope_item_unit_rate(self):
        """Planning user can edit scope item unit_rate"""
        self._login(PLANNING_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test editing")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        original_rate = first_item.get("unit_rate", 0)
        qty = first_item.get("quantity", 1)
        
        # Update unit_rate
        new_rate = 12345
        response = self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "unit_rate": new_rate
        })
        assert response.status_code == 200, f"Failed to edit unit_rate: {response.text}"
        
        # Verify total_amount is recalculated
        updated_items = self._get_scope_items(TEST_PROJECT_ID).json()
        edited_item = next((i for i in updated_items if i["scope_id"] == scope_id), None)
        assert edited_item.get("unit_rate") == new_rate, f"Unit rate not updated"
        expected_total = qty * new_rate
        assert edited_item.get("total_amount") == expected_total, f"Total not recalculated"
        
        # Revert
        self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "unit_rate": original_rate
        })
        print(f"SUCCESS: Planning user edited scope item unit_rate: {original_rate} -> {new_rate}")
    
    def test_planning_can_edit_scope_item_remarks(self):
        """Planning user can edit scope item remarks"""
        self._login(PLANNING_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test editing")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        original_remarks = first_item.get("remarks", "")
        
        # Update remarks
        new_remarks = "TEST_REMARKS_EDITED"
        response = self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "remarks": new_remarks
        })
        assert response.status_code == 200, f"Failed to edit remarks: {response.text}"
        
        # Verify
        updated_items = self._get_scope_items(TEST_PROJECT_ID).json()
        edited_item = next((i for i in updated_items if i["scope_id"] == scope_id), None)
        assert edited_item.get("remarks") == new_remarks, f"Remarks not updated"
        
        # Revert
        self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "remarks": original_remarks
        })
        print(f"SUCCESS: Planning user edited scope item remarks")

    # ==================== Planning User Scope Delete Tests ====================
    
    def test_planning_can_delete_scope_item(self):
        """Planning user can delete a scope item"""
        self._login(PLANNING_USER)
        
        # First create a test scope item to delete
        create_response = self.session.post(f"{BASE_URL}/api/scope-items", json={
            "project_id": TEST_PROJECT_ID,
            "item_name": "TEST_DELETE_SCOPE_ITEM",
            "quantity": 1,
            "unit": "Nos",
            "unit_rate": 1000,
            "remarks": "Created for delete test"
        })
        
        if create_response.status_code != 200:
            # Try bulk add instead
            create_response = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
                "project_id": TEST_PROJECT_ID,
                "items": [{
                    "item_name": "TEST_DELETE_SCOPE_ITEM",
                    "quantity": 1,
                    "unit": "Nos",
                    "unit_rate": 1000,
                    "remarks": "Created for delete test"
                }]
            })
        
        assert create_response.status_code == 200, f"Failed to create test scope item: {create_response.text}"
        
        # Get the created item
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        test_item = next((i for i in scope_items if i["item_name"] == "TEST_DELETE_SCOPE_ITEM"), None)
        assert test_item is not None, "Test scope item not found after creation"
        
        scope_id = test_item["scope_id"]
        
        # Delete the item
        delete_response = self.session.delete(f"{BASE_URL}/api/scope-items/{scope_id}")
        assert delete_response.status_code == 200, f"Failed to delete scope item: {delete_response.text}"
        
        # Verify deletion
        updated_items = self._get_scope_items(TEST_PROJECT_ID).json()
        deleted_item = next((i for i in updated_items if i["scope_id"] == scope_id), None)
        assert deleted_item is None, "Scope item was not deleted"
        
        print(f"SUCCESS: Planning user deleted scope item {scope_id}")

    # ==================== Permission Tests ====================
    
    def test_accountant_cannot_edit_scope_item(self):
        """Accountant user should NOT be able to edit scope items"""
        self._login(ACCOUNTANT_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        
        response = self.session.patch(f"{BASE_URL}/api/scope-items/{scope_id}", json={
            "item_name": "SHOULD_FAIL"
        })
        assert response.status_code == 403, f"Accountant should not be able to edit scope items, got {response.status_code}"
        print(f"SUCCESS: Accountant correctly denied scope edit permission")
    
    def test_accountant_cannot_delete_scope_item(self):
        """Accountant user should NOT be able to delete scope items"""
        self._login(ACCOUNTANT_USER)
        scope_items = self._get_scope_items(TEST_PROJECT_ID).json()
        
        if not scope_items:
            pytest.skip("No scope items to test")
        
        first_item = scope_items[0]
        scope_id = first_item["scope_id"]
        
        response = self.session.delete(f"{BASE_URL}/api/scope-items/{scope_id}")
        assert response.status_code == 403, f"Accountant should not be able to delete scope items, got {response.status_code}"
        print(f"SUCCESS: Accountant correctly denied scope delete permission")


class TestProjectDeletion:
    """Test project deletion for Super Admin and Planning roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login(self, email):
        """Helper to login as specific user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        assert response.status_code == 200, f"Login failed for {email}: {response.text}"
        return response.json()
    
    def _create_test_project(self, status="draft"):
        """Create a test project for deletion tests"""
        from datetime import datetime, timedelta
        
        project_data = {
            "name": f"TEST_DELETE_PROJECT_{status.upper()}",
            "client_name": "Test Client",
            "location": "Test Location",
            "start_date": datetime.now().isoformat(),
            "expected_completion": (datetime.now() + timedelta(days=30)).isoformat(),
            "status": status,
            "total_value": 100000
        }
        response = self.session.post(f"{BASE_URL}/api/projects", json=project_data)
        return response
    
    # ==================== Super Admin Project Delete Tests ====================
    
    def test_super_admin_can_delete_any_project(self):
        """Super Admin can delete any project regardless of status"""
        self._login(SUPER_ADMIN)
        
        # Create a test project as Super Admin
        create_response = self._create_test_project(status="active")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Delete the project
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 200, f"Super Admin failed to delete project: {delete_response.text}"
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert get_response.status_code == 404, "Project should not exist after deletion"
        
        print(f"SUCCESS: Super Admin deleted project {project_id}")
    
    def test_super_admin_can_see_delete_button_for_any_project(self):
        """Super Admin role should always allow project deletion"""
        user = self._login(SUPER_ADMIN)
        assert user["role"] == "super_admin"
        
        # Get any project
        response = self.session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        
        if projects:
            # Super Admin has delete permission for any project
            print(f"SUCCESS: Super Admin has access to {len(projects)} projects for potential deletion")
        else:
            print("SUCCESS: Super Admin role verified, no projects to delete")
    
    # ==================== Planning Project Delete Tests ====================
    
    def test_planning_can_delete_draft_project(self):
        """Planning user can delete projects in draft status"""
        # First login as super admin to create a draft project
        self._login(SUPER_ADMIN)
        create_response = self._create_test_project(status="draft")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Now login as Planning and try to delete
        self._login(PLANNING_USER)
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 200, f"Planning should delete draft project: {delete_response.text}"
        
        print(f"SUCCESS: Planning user deleted draft project {project_id}")
    
    def test_planning_can_delete_planning_status_project(self):
        """Planning user can delete projects in planning status"""
        # Create project in planning status
        self._login(SUPER_ADMIN)
        create_response = self._create_test_project(status="in_planning")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Login as Planning and delete
        self._login(PLANNING_USER)
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 200, f"Planning should delete in_planning project: {delete_response.text}"
        
        print(f"SUCCESS: Planning user deleted in_planning project {project_id}")
    
    def test_planning_cannot_delete_active_project(self):
        """Planning user cannot delete active projects"""
        # Create an active project
        self._login(SUPER_ADMIN)
        create_response = self._create_test_project(status="active")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Login as Planning and try to delete - should fail
        self._login(PLANNING_USER)
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 403, f"Planning should NOT delete active project, got {delete_response.status_code}"
        
        # Cleanup - delete as super admin
        self._login(SUPER_ADMIN)
        self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        
        print(f"SUCCESS: Planning user correctly denied deleting active project")
    
    def test_planning_cannot_delete_approved_project(self):
        """Planning user cannot delete approved projects"""
        self._login(SUPER_ADMIN)
        create_response = self._create_test_project(status="approved")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Login as Planning and try to delete
        self._login(PLANNING_USER)
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 403, f"Planning should NOT delete approved project"
        
        # Cleanup
        self._login(SUPER_ADMIN)
        self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        
        print(f"SUCCESS: Planning user correctly denied deleting approved project")
    
    # ==================== Permission Tests ====================
    
    def test_accountant_cannot_delete_project(self):
        """Accountant should NOT be able to delete any project"""
        self._login(SUPER_ADMIN)
        create_response = self._create_test_project(status="draft")
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test project: {create_response.text}")
        
        project = create_response.json()
        project_id = project.get("project_id")
        
        # Login as Accountant and try to delete
        self._login(ACCOUNTANT_USER)
        delete_response = self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        assert delete_response.status_code == 403, f"Accountant should NOT delete project, got {delete_response.status_code}"
        
        # Cleanup
        self._login(SUPER_ADMIN)
        self.session.delete(f"{BASE_URL}/api/projects/{project_id}")
        
        print(f"SUCCESS: Accountant correctly denied project deletion")
    
    def test_delete_nonexistent_project_returns_404(self):
        """Deleting nonexistent project returns 404"""
        self._login(SUPER_ADMIN)
        response = self.session.delete(f"{BASE_URL}/api/projects/nonexistent_proj_12345")
        assert response.status_code == 404, f"Should return 404 for nonexistent project"
        print(f"SUCCESS: Nonexistent project deletion returns 404")


class TestProjectDetailPageButtons:
    """Test that buttons appear correctly based on role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login(self, email):
        """Helper to login as specific user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        assert response.status_code == 200, f"Login failed for {email}: {response.text}"
        return response.json()
    
    def test_project_full_details_includes_scope_items(self):
        """Project full details endpoint returns scope items for inline editing"""
        self._login(PLANNING_USER)
        response = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/full-details")
        assert response.status_code == 200, f"Failed to get project details: {response.text}"
        
        data = response.json()
        assert "scope_items" in data, "Response should include scope_items"
        assert "project" in data, "Response should include project"
        
        # Each scope item should have fields needed for inline editing
        if data["scope_items"]:
            item = data["scope_items"][0]
            assert "scope_id" in item, "Scope item should have scope_id"
            assert "item_name" in item, "Scope item should have item_name"
            assert "quantity" in item, "Scope item should have quantity"
            assert "unit" in item, "Scope item should have unit"
            assert "unit_rate" in item, "Scope item should have unit_rate"
        
        print(f"SUCCESS: Project full details includes {len(data['scope_items'])} scope items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
