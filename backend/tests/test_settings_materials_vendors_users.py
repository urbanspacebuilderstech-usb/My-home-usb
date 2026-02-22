"""
Test Suite for Construction CRM Settings, Materials, Vendors, and Users APIs
Tests the three foundational system modules:
1) Company Settings
2) Material Management
3) Vendor Master Management
4) Enhanced User Management
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://build-accounting-1.preview.emergentagent.com"

# Test data prefix for cleanup
TEST_PREFIX = "TEST_"


class TestAuth:
    """Authentication tests for demo login"""
    
    def test_demo_login_super_admin(self):
        """Test demo login as super admin"""
        response = requests.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_id" in data
        assert data["role"] == "super_admin"
        assert data["email"] == "admin@constructionos.com"
    
    def test_demo_login_invalid_user(self):
        """Test demo login with invalid email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "nonexistent@example.com"}
        )
        assert response.status_code == 404


@pytest.fixture(scope="class")
def admin_session():
    """Create authenticated session for super admin"""
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/demo-login",
        json={"email": "admin@constructionos.com"}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return session


@pytest.fixture(scope="class")
def pm_session():
    """Create authenticated session for project manager (non-admin)"""
    session = requests.Session()
    response = session.post(
        f"{BASE_URL}/api/auth/demo-login",
        json={"email": "pm@constructionos.com"}
    )
    assert response.status_code == 200, f"PM login failed: {response.text}"
    return session


class TestCompanySettings:
    """Company Settings API tests"""
    
    def test_get_company_settings(self, admin_session):
        """GET /api/settings/company - Get company settings"""
        response = admin_session.get(f"{BASE_URL}/api/settings/company")
        assert response.status_code == 200
        data = response.json()
        # Should have default or existing settings
        assert "company_name" in data
        assert "default_currency" in data
        assert "financial_year_start" in data
    
    def test_create_or_update_company_settings(self, admin_session):
        """POST /api/settings/company - Create/update company settings"""
        settings_data = {
            "company_name": f"{TEST_PREFIX}Construction Corp",
            "email": "test@construction.com",
            "contact_number": "+91 9876543210",
            "gst_number": "22AAAAA0000A1Z5",
            "address": "123 Test Street, Test City",
            "default_currency": "INR",
            "financial_year_start": "April"
        }
        response = admin_session.post(
            f"{BASE_URL}/api/settings/company",
            json=settings_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["company_name"] == settings_data["company_name"]
        assert data["email"] == settings_data["email"]
        assert data["gst_number"] == settings_data["gst_number"]
    
    def test_patch_company_settings(self, admin_session):
        """PATCH /api/settings/company - Partial update"""
        # First ensure settings exist
        admin_session.post(
            f"{BASE_URL}/api/settings/company",
            json={"company_name": "Test Company", "default_currency": "INR", "financial_year_start": "April"}
        )
        
        # Now patch
        patch_data = {"contact_number": "+91 1234567890"}
        response = admin_session.patch(
            f"{BASE_URL}/api/settings/company",
            json=patch_data
        )
        assert response.status_code == 200
        data = response.json()
        assert data["contact_number"] == patch_data["contact_number"]
    
    def test_company_settings_permission_denied(self, pm_session):
        """POST /api/settings/company - Non-admin should be denied"""
        response = pm_session.post(
            f"{BASE_URL}/api/settings/company",
            json={"company_name": "Test", "default_currency": "INR", "financial_year_start": "April"}
        )
        assert response.status_code == 403


class TestMaterialManagement:
    """Material Management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup_cleanup(self, admin_session):
        """Cleanup test materials after tests"""
        yield
        # Cleanup: Delete test materials
        response = admin_session.get(f"{BASE_URL}/api/materials?active_only=false")
        if response.status_code == 200:
            materials = response.json()
            for mat in materials:
                if mat.get("name", "").startswith(TEST_PREFIX):
                    admin_session.delete(f"{BASE_URL}/api/materials/{mat['material_id']}")
    
    def test_get_materials_categories(self, admin_session):
        """GET /api/materials/categories - Get all categories"""
        response = admin_session.get(f"{BASE_URL}/api/materials/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Check expected categories exist
        category_values = [c["value"] for c in data]
        assert "cement" in category_values
        assert "steel" in category_values
        assert "sand" in category_values
    
    def test_get_materials_list(self, admin_session):
        """GET /api/materials - Get all materials"""
        response = admin_session.get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_material(self, admin_session):
        """POST /api/materials - Create new material"""
        material_data = {
            "name": f"{TEST_PREFIX}OPC Cement 53 Grade",
            "category": "cement",
            "unit": "Bag",
            "description": "Test cement material",
            "hsn_code": "2523"
        }
        response = admin_session.post(
            f"{BASE_URL}/api/materials",
            json=material_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == material_data["name"]
        assert data["category"] == material_data["category"]
        assert data["unit"] == material_data["unit"]
        assert data["is_active"] == True
        assert "material_id" in data
        
        # Verify persistence with GET
        get_response = admin_session.get(f"{BASE_URL}/api/materials/{data['material_id']}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == material_data["name"]
    
    def test_create_duplicate_material_fails(self, admin_session):
        """POST /api/materials - Duplicate name should fail"""
        material_data = {
            "name": f"{TEST_PREFIX}Duplicate Material",
            "category": "cement",
            "unit": "Bag"
        }
        # Create first
        response1 = admin_session.post(f"{BASE_URL}/api/materials", json=material_data)
        assert response1.status_code == 200
        
        # Try to create duplicate
        response2 = admin_session.post(f"{BASE_URL}/api/materials", json=material_data)
        assert response2.status_code == 400
    
    def test_update_material(self, admin_session):
        """PATCH /api/materials/{id} - Update material"""
        # Create material first
        create_response = admin_session.post(
            f"{BASE_URL}/api/materials",
            json={"name": f"{TEST_PREFIX}Update Test Material", "category": "steel", "unit": "Ton"}
        )
        assert create_response.status_code == 200
        material_id = create_response.json()["material_id"]
        
        # Update
        update_data = {"description": "Updated description", "hsn_code": "7308"}
        update_response = admin_session.patch(
            f"{BASE_URL}/api/materials/{material_id}",
            json=update_data
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["description"] == update_data["description"]
        assert updated["hsn_code"] == update_data["hsn_code"]
        
        # Verify persistence
        get_response = admin_session.get(f"{BASE_URL}/api/materials/{material_id}")
        assert get_response.json()["description"] == update_data["description"]
    
    def test_delete_material_soft_delete(self, admin_session):
        """DELETE /api/materials/{id} - Soft delete (sets is_active=false)"""
        # Create material
        create_response = admin_session.post(
            f"{BASE_URL}/api/materials",
            json={"name": f"{TEST_PREFIX}Delete Test Material", "category": "bricks", "unit": "Nos"}
        )
        assert create_response.status_code == 200
        material_id = create_response.json()["material_id"]
        
        # Delete
        delete_response = admin_session.delete(f"{BASE_URL}/api/materials/{material_id}")
        assert delete_response.status_code == 200
        
        # Verify soft delete - material should still exist but inactive
        get_response = admin_session.get(f"{BASE_URL}/api/materials/{material_id}")
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] == False
    
    def test_material_permission_denied_for_client(self, pm_session):
        """POST /api/materials - PM should be denied (only super_admin, planning, procurement)"""
        response = pm_session.post(
            f"{BASE_URL}/api/materials",
            json={"name": "Test", "category": "cement", "unit": "Bag"}
        )
        assert response.status_code == 403


class TestVendorMasterManagement:
    """Vendor Master Management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup_cleanup(self, admin_session):
        """Cleanup test vendors after tests"""
        yield
        # Cleanup: Delete test vendors
        response = admin_session.get(f"{BASE_URL}/api/vendor-master?active_only=false")
        if response.status_code == 200:
            vendors = response.json()
            for v in vendors:
                if v.get("name", "").startswith(TEST_PREFIX):
                    admin_session.delete(f"{BASE_URL}/api/vendor-master/{v['vendor_id']}")
    
    def test_get_vendor_master_list(self, admin_session):
        """GET /api/vendor-master - Get all vendors"""
        response = admin_session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_vendor(self, admin_session):
        """POST /api/vendor-master - Create new vendor"""
        vendor_data = {
            "name": f"{TEST_PREFIX}ABC Suppliers",
            "contact_person": "John Doe",
            "phone": "+91 9876543210",
            "email": "abc@suppliers.com",
            "address": "123 Vendor Street",
            "gst_number": "22BBBBB0000B1Z5",
            "payment_terms": "credit",
            "credit_limit": 100000,
            "credit_days": 30
        }
        response = admin_session.post(
            f"{BASE_URL}/api/vendor-master",
            json=vendor_data
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["name"] == vendor_data["name"]
        assert data["contact_person"] == vendor_data["contact_person"]
        assert data["payment_terms"] == vendor_data["payment_terms"]
        assert data["credit_limit"] == vendor_data["credit_limit"]
        assert data["is_active"] == True
        assert "vendor_id" in data
        
        # Verify persistence
        get_response = admin_session.get(f"{BASE_URL}/api/vendor-master/{data['vendor_id']}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["name"] == vendor_data["name"]
    
    def test_update_vendor(self, admin_session):
        """PATCH /api/vendor-master/{id} - Update vendor"""
        # Create vendor first
        create_response = admin_session.post(
            f"{BASE_URL}/api/vendor-master",
            json={"name": f"{TEST_PREFIX}Update Test Vendor", "payment_terms": "full"}
        )
        assert create_response.status_code == 200
        vendor_id = create_response.json()["vendor_id"]
        
        # Update
        update_data = {
            "contact_person": "Jane Smith",
            "phone": "+91 1234567890",
            "payment_terms": "credit",
            "credit_limit": 50000,
            "credit_days": 15
        }
        update_response = admin_session.patch(
            f"{BASE_URL}/api/vendor-master/{vendor_id}",
            json=update_data
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["contact_person"] == update_data["contact_person"]
        assert updated["payment_terms"] == update_data["payment_terms"]
        assert updated["credit_limit"] == update_data["credit_limit"]
        
        # Verify persistence
        get_response = admin_session.get(f"{BASE_URL}/api/vendor-master/{vendor_id}")
        assert get_response.json()["contact_person"] == update_data["contact_person"]
    
    def test_delete_vendor_soft_delete(self, admin_session):
        """DELETE /api/vendor-master/{id} - Soft delete"""
        # Create vendor
        create_response = admin_session.post(
            f"{BASE_URL}/api/vendor-master",
            json={"name": f"{TEST_PREFIX}Delete Test Vendor", "payment_terms": "full"}
        )
        assert create_response.status_code == 200
        vendor_id = create_response.json()["vendor_id"]
        
        # Delete
        delete_response = admin_session.delete(f"{BASE_URL}/api/vendor-master/{vendor_id}")
        assert delete_response.status_code == 200
        
        # Verify soft delete
        get_response = admin_session.get(f"{BASE_URL}/api/vendor-master/{vendor_id}")
        assert get_response.status_code == 200
        assert get_response.json()["is_active"] == False
    
    def test_vendor_permission_denied(self, pm_session):
        """POST /api/vendor-master - PM should be denied"""
        response = pm_session.post(
            f"{BASE_URL}/api/vendor-master",
            json={"name": "Test Vendor", "payment_terms": "full"}
        )
        assert response.status_code == 403


class TestUserManagement:
    """Enhanced User Management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup_cleanup(self, admin_session):
        """Cleanup test users after tests"""
        yield
        # Cleanup: Delete test users
        response = admin_session.get(f"{BASE_URL}/api/users")
        if response.status_code == 200:
            users = response.json()
            for u in users:
                if u.get("name", "").startswith(TEST_PREFIX) or u.get("email", "").startswith("test_"):
                    try:
                        admin_session.delete(f"{BASE_URL}/api/users/{u['user_id']}")
                    except:
                        pass
    
    def test_get_users_list(self, admin_session):
        """GET /api/users - Get all users (super admin only)"""
        response = admin_session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Check user structure
        user = data[0]
        assert "user_id" in user
        assert "email" in user
        assert "role" in user
    
    def test_get_users_permission_denied(self, pm_session):
        """GET /api/users - Non-admin should be denied"""
        response = pm_session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 403
    
    def test_update_user(self, admin_session):
        """PATCH /api/users/{id} - Update user"""
        # Get existing users
        users_response = admin_session.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        # Find a non-admin user to update
        target_user = None
        for u in users:
            if u["role"] != "super_admin":
                target_user = u
                break
        
        if target_user:
            update_data = {
                "name": f"{TEST_PREFIX}Updated Name",
                "phone": "+91 9999999999",
                "department": "Engineering"
            }
            response = admin_session.patch(
                f"{BASE_URL}/api/users/{target_user['user_id']}",
                json=update_data
            )
            assert response.status_code == 200
            updated = response.json()
            assert updated["name"] == update_data["name"]
            assert updated["phone"] == update_data["phone"]
            
            # Verify persistence
            get_response = admin_session.get(f"{BASE_URL}/api/users/{target_user['user_id']}")
            assert get_response.json()["name"] == update_data["name"]
            
            # Restore original name
            admin_session.patch(
                f"{BASE_URL}/api/users/{target_user['user_id']}",
                json={"name": target_user["name"], "phone": target_user.get("phone")}
            )
    
    def test_update_user_role(self, admin_session):
        """PATCH /api/users/{id} - Update user role"""
        # Get existing users
        users_response = admin_session.get(f"{BASE_URL}/api/users")
        users = users_response.json()
        
        # Find a client user to update role
        target_user = None
        for u in users:
            if u["role"] == "client":
                target_user = u
                break
        
        if target_user:
            original_role = target_user["role"]
            update_data = {"role": "vendor"}
            response = admin_session.patch(
                f"{BASE_URL}/api/users/{target_user['user_id']}",
                json=update_data
            )
            assert response.status_code == 200
            assert response.json()["role"] == "vendor"
            
            # Restore original role
            admin_session.patch(
                f"{BASE_URL}/api/users/{target_user['user_id']}",
                json={"role": original_role}
            )
    
    def test_delete_user(self, admin_session):
        """DELETE /api/users/{id} - Delete user"""
        # First create a test user via the existing endpoint
        test_user_data = {
            "user_id": f"test_user_{uuid.uuid4().hex[:8]}",
            "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
            "name": f"{TEST_PREFIX}Delete Test User",
            "role": "client",
            "created_at": "2024-01-01T00:00:00Z"
        }
        create_response = admin_session.post(
            f"{BASE_URL}/api/users",
            json=test_user_data
        )
        
        if create_response.status_code == 200:
            user_id = create_response.json()["user_id"]
            
            # Delete
            delete_response = admin_session.delete(f"{BASE_URL}/api/users/{user_id}")
            assert delete_response.status_code == 200
            
            # Verify deletion
            get_response = admin_session.get(f"{BASE_URL}/api/users/{user_id}")
            assert get_response.status_code == 404
    
    def test_cannot_delete_self(self, admin_session):
        """DELETE /api/users/{id} - Cannot delete yourself"""
        # Get current user
        me_response = admin_session.get(f"{BASE_URL}/api/auth/me")
        current_user_id = me_response.json()["user_id"]
        
        # Try to delete self
        response = admin_session.delete(f"{BASE_URL}/api/users/{current_user_id}")
        assert response.status_code == 400


class TestSettingsSummary:
    """Settings Summary API tests"""
    
    def test_get_settings_summary(self, admin_session):
        """GET /api/settings/summary - Get summary counts"""
        response = admin_session.get(f"{BASE_URL}/api/settings/summary")
        assert response.status_code == 200
        data = response.json()
        assert "users_count" in data
        assert "materials_count" in data
        assert "vendors_count" in data
        assert "company_name" in data
        assert isinstance(data["users_count"], int)
        assert isinstance(data["materials_count"], int)
        assert isinstance(data["vendors_count"], int)
    
    def test_settings_summary_permission_denied(self, pm_session):
        """GET /api/settings/summary - Non-admin should be denied"""
        response = pm_session.get(f"{BASE_URL}/api/settings/summary")
        assert response.status_code == 403


class TestRoles:
    """Roles API tests"""
    
    def test_get_all_roles(self, admin_session):
        """GET /api/roles - Get all available roles"""
        response = admin_session.get(f"{BASE_URL}/api/roles")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        role_values = [r["value"] for r in data]
        assert "super_admin" in role_values
        assert "accountant" in role_values
        assert "project_manager" in role_values
        assert "planning" in role_values
        assert "procurement" in role_values
        assert "site_engineer" in role_values
        assert "vendor" in role_values
        assert "client" in role_values


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
