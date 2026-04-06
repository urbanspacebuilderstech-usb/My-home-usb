"""
RE Templates API Tests
Tests CRUD operations for RE Templates feature in Planning Board
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com')

class TestRETemplatesAPI:
    """RE Templates CRUD API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Planning user authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Planning user via demo access
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        if login_response.status_code == 200:
            data = login_response.json()
            if data.get("token"):
                self.session.headers.update({"Authorization": f"Bearer {data['token']}"})
            self.user = data.get("user", {})
            print(f"Logged in as: {self.user.get('name', 'Unknown')} ({self.user.get('role', 'Unknown')})")
        else:
            pytest.skip(f"Failed to login as Planning user: {login_response.status_code}")
        
        yield
        
        # Cleanup: Delete test templates created during tests
        try:
            templates = self.session.get(f"{BASE_URL}/api/crm/re-templates").json()
            for t in templates:
                if t.get("name", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/crm/re-templates/{t['template_id']}")
        except:
            pass
    
    def test_01_get_templates_list(self):
        """Test GET /api/crm/re-templates - List all templates"""
        response = self.session.get(f"{BASE_URL}/api/crm/re-templates")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} existing templates")
        
        # If templates exist, verify structure
        if data:
            template = data[0]
            assert "template_id" in template, "Template should have template_id"
            assert "name" in template, "Template should have name"
            assert "sqft" in template, "Template should have sqft"
            assert "scope_items" in template, "Template should have scope_items"
            assert "estimated_total" in template, "Template should have estimated_total"
            print(f"First template: {template.get('name')} - {template.get('sqft')} sqft - {len(template.get('scope_items', []))} items")
    
    def test_02_create_template_basic(self):
        """Test POST /api/crm/re-templates - Create template with basic info"""
        payload = {
            "name": "TEST_Basic Template",
            "sqft": 1500,
            "scope_items": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("name") == "TEST_Basic Template", f"Name mismatch: {data.get('name')}"
        assert data.get("sqft") == 1500, f"Sqft mismatch: {data.get('sqft')}"
        assert data.get("template_id"), "Should have template_id"
        assert data.get("estimated_total") == 0, "Empty template should have 0 total"
        
        print(f"Created template: {data.get('template_id')}")
        self.created_template_id = data.get("template_id")
    
    def test_03_create_template_with_scope_items(self):
        """Test POST /api/crm/re-templates - Create template with scope items"""
        payload = {
            "name": "TEST_Villa Premium",
            "sqft": 2500,
            "scope_items": [
                {"name": "Foundation Work", "quantity": 1, "unit": "lot", "rate": 500000, "total": 500000},
                {"name": "Structural Steel", "quantity": 5000, "unit": "kg", "rate": 85, "total": 425000},
                {"name": "Flooring Tiles", "quantity": 2500, "unit": "sqft", "rate": 120, "total": 300000}
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("name") == "TEST_Villa Premium", f"Name mismatch: {data.get('name')}"
        assert data.get("sqft") == 2500, f"Sqft mismatch: {data.get('sqft')}"
        assert len(data.get("scope_items", [])) == 3, f"Should have 3 scope items, got {len(data.get('scope_items', []))}"
        
        # Verify estimated total is calculated correctly
        expected_total = 500000 + 425000 + 300000
        assert data.get("estimated_total") == expected_total, f"Expected total {expected_total}, got {data.get('estimated_total')}"
        
        print(f"Created template with scope items: {data.get('template_id')}, Total: {data.get('estimated_total')}")
        self.villa_template_id = data.get("template_id")
    
    def test_04_create_template_validation_empty_name(self):
        """Test POST /api/crm/re-templates - Validation: empty name should fail"""
        payload = {
            "name": "",
            "sqft": 1000,
            "scope_items": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=payload)
        
        assert response.status_code == 400, f"Expected 400 for empty name, got {response.status_code}"
        print("Empty name validation works correctly")
    
    def test_05_get_single_template(self):
        """Test GET /api/crm/re-templates/{template_id} - Get single template"""
        # First create a template
        create_payload = {
            "name": "TEST_Single Fetch",
            "sqft": 1800,
            "scope_items": [{"name": "Test Item", "quantity": 10, "unit": "nos", "rate": 100, "total": 1000}]
        }
        create_response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=create_payload)
        assert create_response.status_code == 200
        template_id = create_response.json().get("template_id")
        
        # Now fetch it
        response = self.session.get(f"{BASE_URL}/api/crm/re-templates/{template_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("template_id") == template_id, "Template ID mismatch"
        assert data.get("name") == "TEST_Single Fetch", "Name mismatch"
        assert data.get("sqft") == 1800, "Sqft mismatch"
        assert len(data.get("scope_items", [])) == 1, "Should have 1 scope item"
        
        print(f"Fetched template: {data.get('name')}")
    
    def test_06_get_nonexistent_template(self):
        """Test GET /api/crm/re-templates/{template_id} - 404 for non-existent"""
        fake_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/crm/re-templates/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Non-existent template returns 404 correctly")
    
    def test_07_update_template_name(self):
        """Test PATCH /api/crm/re-templates/{template_id} - Update name"""
        # First create a template
        create_payload = {"name": "TEST_Update Name", "sqft": 2000, "scope_items": []}
        create_response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=create_payload)
        assert create_response.status_code == 200
        template_id = create_response.json().get("template_id")
        
        # Update the name
        update_payload = {"name": "TEST_Updated Name"}
        response = self.session.patch(f"{BASE_URL}/api/crm/re-templates/{template_id}", json=update_payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("name") == "TEST_Updated Name", f"Name not updated: {data.get('name')}"
        assert data.get("sqft") == 2000, "Sqft should remain unchanged"
        
        # Verify persistence with GET
        get_response = self.session.get(f"{BASE_URL}/api/crm/re-templates/{template_id}")
        assert get_response.status_code == 200
        assert get_response.json().get("name") == "TEST_Updated Name", "Name not persisted"
        
        print(f"Updated template name successfully")
    
    def test_08_update_template_scope_items(self):
        """Test PATCH /api/crm/re-templates/{template_id} - Update scope items"""
        # First create a template
        create_payload = {
            "name": "TEST_Update Scope",
            "sqft": 2200,
            "scope_items": [{"name": "Original Item", "quantity": 1, "unit": "nos", "rate": 1000, "total": 1000}]
        }
        create_response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=create_payload)
        assert create_response.status_code == 200
        template_id = create_response.json().get("template_id")
        
        # Update scope items
        update_payload = {
            "scope_items": [
                {"name": "New Item 1", "quantity": 5, "unit": "nos", "rate": 200, "total": 1000},
                {"name": "New Item 2", "quantity": 10, "unit": "kg", "rate": 50, "total": 500}
            ]
        }
        response = self.session.patch(f"{BASE_URL}/api/crm/re-templates/{template_id}", json=update_payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert len(data.get("scope_items", [])) == 2, f"Should have 2 scope items, got {len(data.get('scope_items', []))}"
        assert data.get("estimated_total") == 1500, f"Expected total 1500, got {data.get('estimated_total')}"
        
        print(f"Updated scope items, new total: {data.get('estimated_total')}")
    
    def test_09_update_template_validation_empty_name(self):
        """Test PATCH /api/crm/re-templates/{template_id} - Validation: empty name should fail"""
        # First create a template
        create_payload = {"name": "TEST_Validation", "sqft": 1000, "scope_items": []}
        create_response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=create_payload)
        assert create_response.status_code == 200
        template_id = create_response.json().get("template_id")
        
        # Try to update with empty name
        update_payload = {"name": "   "}
        response = self.session.patch(f"{BASE_URL}/api/crm/re-templates/{template_id}", json=update_payload)
        
        assert response.status_code == 400, f"Expected 400 for empty name, got {response.status_code}"
        print("Empty name validation on update works correctly")
    
    def test_10_delete_template(self):
        """Test DELETE /api/crm/re-templates/{template_id} - Delete template"""
        # First create a template
        create_payload = {"name": "TEST_Delete Me", "sqft": 1000, "scope_items": []}
        create_response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=create_payload)
        assert create_response.status_code == 200
        template_id = create_response.json().get("template_id")
        
        # Delete it
        response = self.session.delete(f"{BASE_URL}/api/crm/re-templates/{template_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it's gone
        get_response = self.session.get(f"{BASE_URL}/api/crm/re-templates/{template_id}")
        assert get_response.status_code == 404, "Deleted template should return 404"
        
        print("Template deleted successfully")
    
    def test_11_delete_nonexistent_template(self):
        """Test DELETE /api/crm/re-templates/{template_id} - 404 for non-existent"""
        fake_id = str(uuid.uuid4())
        response = self.session.delete(f"{BASE_URL}/api/crm/re-templates/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Delete non-existent template returns 404 correctly")
    
    def test_12_scope_item_total_auto_calculation(self):
        """Test that scope item totals are auto-calculated from quantity * rate"""
        payload = {
            "name": "TEST_Auto Calc",
            "sqft": 3000,
            "scope_items": [
                {"name": "Item 1", "quantity": 100, "unit": "nos", "rate": 50, "total": 0},  # total should be recalculated
                {"name": "Item 2", "quantity": 25.5, "unit": "kg", "rate": 200, "total": 999}  # total should be recalculated
            ]
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/re-templates", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        scope_items = data.get("scope_items", [])
        assert len(scope_items) == 2
        
        # Item 1: 100 * 50 = 5000
        assert scope_items[0].get("total") == 5000, f"Item 1 total should be 5000, got {scope_items[0].get('total')}"
        
        # Item 2: 25.5 * 200 = 5100
        assert scope_items[1].get("total") == 5100, f"Item 2 total should be 5100, got {scope_items[1].get('total')}"
        
        # Estimated total: 5000 + 5100 = 10100
        assert data.get("estimated_total") == 10100, f"Estimated total should be 10100, got {data.get('estimated_total')}"
        
        print(f"Auto-calculation verified: {data.get('estimated_total')}")


class TestRETemplatesAccessControl:
    """Test access control for RE Templates API"""
    
    def test_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.get(f"{BASE_URL}/api/crm/re-templates")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Unauthenticated access correctly rejected")
    
    def test_site_engineer_cannot_create(self):
        """Test that Site Engineer cannot create templates"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer
        login_response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "site@constructionos.com"})
        if login_response.status_code != 200:
            pytest.skip("Could not login as site_engineer")
        
        data = login_response.json()
        if data.get("token"):
            session.headers.update({"Authorization": f"Bearer {data['token']}"})
        
        # Try to create template
        payload = {"name": "TEST_Unauthorized", "sqft": 1000, "scope_items": []}
        response = session.post(f"{BASE_URL}/api/crm/re-templates", json=payload)
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Site Engineer correctly denied template creation")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
