"""
Test Package Management Feature
- Material Names CRUD
- Brands CRUD with category filter
- Packages CRUD with scope_items and material_items
- Planning role access
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level session to avoid rate limiting
_session = None
_cookies = None

def get_authenticated_session():
    """Get or create authenticated session"""
    global _session, _cookies
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        
        # Login as planning user via demo-login
        login_resp = _session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        if login_resp.status_code == 429:
            print("Rate limited, waiting 60 seconds...")
            time.sleep(60)
            login_resp = _session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        
        assert login_resp.status_code == 200, f"Demo login failed: {login_resp.text}"
        _cookies = login_resp.cookies
        
        # Verify auth
        me_resp = _session.get(f"{BASE_URL}/api/auth/me", cookies=_cookies)
        assert me_resp.status_code == 200, f"Auth verification failed: {me_resp.text}"
        user_data = me_resp.json()
        assert user_data.get("role") == "planning", f"Expected planning role, got {user_data.get('role')}"
        print(f"✓ Authenticated as planning user: {user_data.get('email')}")
    
    return _session, _cookies


class TestPackagesFeature:
    """Test Package Management Feature for Planning Board"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user authentication"""
        self.session, self.cookies = get_authenticated_session()
        yield
    
    # ==================== MATERIAL NAMES TESTS ====================
    
    def test_01_get_material_names(self):
        """GET /api/material-names returns all material names"""
        resp = self.session.get(f"{BASE_URL}/api/material-names", cookies=self.cookies)
        assert resp.status_code == 200, f"Failed to get material names: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of material names"
        print(f"✓ GET /api/material-names returned {len(data)} material names")
        
        # Check for expected seed data
        names = [m.get("name", "").lower() for m in data]
        if "cement" in names:
            print("  - Found 'Cement' in material names (seed data)")
        if "steel" in names:
            print("  - Found 'Steel' in material names (seed data)")
        if "sand" in names:
            print("  - Found 'Sand' in material names (seed data)")
    
    def test_02_create_material_name(self):
        """POST /api/material-names creates a new material name"""
        unique_name = f"TEST_Material_{uuid.uuid4().hex[:6]}"
        resp = self.session.post(
            f"{BASE_URL}/api/material-names",
            json={"name": unique_name},
            cookies=self.cookies
        )
        assert resp.status_code == 200, f"Failed to create material name: {resp.text}"
        data = resp.json()
        assert data.get("name") == unique_name, f"Name mismatch: expected {unique_name}, got {data.get('name')}"
        assert "material_name_id" in data, "Missing material_name_id in response"
        print(f"✓ POST /api/material-names created: {unique_name}")
        
        # Verify it appears in GET
        get_resp = self.session.get(f"{BASE_URL}/api/material-names", cookies=self.cookies)
        assert get_resp.status_code == 200
        names = [m.get("name") for m in get_resp.json()]
        assert unique_name in names, f"Created material name not found in list"
        print(f"  - Verified material name appears in GET list")
    
    def test_03_create_duplicate_material_name(self):
        """POST /api/material-names with existing name returns existing entry"""
        # First create
        unique_name = f"TEST_DupMat_{uuid.uuid4().hex[:6]}"
        resp1 = self.session.post(
            f"{BASE_URL}/api/material-names",
            json={"name": unique_name},
            cookies=self.cookies
        )
        assert resp1.status_code == 200
        first_id = resp1.json().get("material_name_id")
        
        # Try to create duplicate
        resp2 = self.session.post(
            f"{BASE_URL}/api/material-names",
            json={"name": unique_name},
            cookies=self.cookies
        )
        assert resp2.status_code == 200
        data = resp2.json()
        assert data.get("exists") == True, "Expected 'exists: true' for duplicate"
        print(f"✓ Duplicate material name returns existing entry with exists=true")
    
    # ==================== BRANDS TESTS ====================
    
    def test_04_get_brands_all(self):
        """GET /api/brands returns all brands"""
        resp = self.session.get(f"{BASE_URL}/api/brands", cookies=self.cookies)
        assert resp.status_code == 200, f"Failed to get brands: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of brands"
        print(f"✓ GET /api/brands returned {len(data)} brands")
        
        # Check for UltraTech linked to Cement (seed data)
        for brand in data:
            if brand.get("name", "").lower() == "ultratech":
                print(f"  - Found 'UltraTech' brand, category: {brand.get('category')}")
    
    def test_05_get_brands_filtered_by_category(self):
        """GET /api/brands?category=Cement returns only cement brands"""
        resp = self.session.get(f"{BASE_URL}/api/brands?category=Cement", cookies=self.cookies)
        assert resp.status_code == 200, f"Failed to get filtered brands: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of brands"
        print(f"✓ GET /api/brands?category=Cement returned {len(data)} brands")
        
        # All returned brands should have category=Cement (case insensitive)
        for brand in data:
            cat = brand.get("category", "").lower()
            assert cat == "cement", f"Brand {brand.get('name')} has category {cat}, expected cement"
        print(f"  - All {len(data)} brands have category=Cement")
    
    def test_06_create_brand_with_category(self):
        """POST /api/brands with category creates a brand linked to a material"""
        unique_brand = f"TEST_Brand_{uuid.uuid4().hex[:6]}"
        resp = self.session.post(
            f"{BASE_URL}/api/brands",
            json={"name": unique_brand, "category": "Cement"},
            cookies=self.cookies
        )
        assert resp.status_code == 200, f"Failed to create brand: {resp.text}"
        data = resp.json()
        assert data.get("name") == unique_brand, f"Name mismatch"
        assert data.get("category") == "Cement", f"Category mismatch"
        assert "brand_id" in data, "Missing brand_id"
        print(f"✓ POST /api/brands created: {unique_brand} (category: Cement)")
        
        # Verify it appears in filtered GET
        get_resp = self.session.get(f"{BASE_URL}/api/brands?category=Cement", cookies=self.cookies)
        assert get_resp.status_code == 200
        brand_names = [b.get("name") for b in get_resp.json()]
        assert unique_brand in brand_names, "Created brand not found in filtered list"
        print(f"  - Verified brand appears in GET ?category=Cement")
    
    def test_07_create_duplicate_brand(self):
        """POST /api/brands with existing name+category returns existing entry"""
        unique_brand = f"TEST_DupBrand_{uuid.uuid4().hex[:6]}"
        
        # First create
        resp1 = self.session.post(
            f"{BASE_URL}/api/brands",
            json={"name": unique_brand, "category": "Steel"},
            cookies=self.cookies
        )
        assert resp1.status_code == 200
        
        # Try duplicate
        resp2 = self.session.post(
            f"{BASE_URL}/api/brands",
            json={"name": unique_brand, "category": "Steel"},
            cookies=self.cookies
        )
        assert resp2.status_code == 200
        data = resp2.json()
        assert data.get("exists") == True, "Expected 'exists: true' for duplicate"
        print(f"✓ Duplicate brand returns existing entry with exists=true")
    
    # ==================== PACKAGES TESTS ====================
    
    def test_08_get_packages(self):
        """GET /api/packages returns all packages"""
        resp = self.session.get(f"{BASE_URL}/api/packages", cookies=self.cookies)
        assert resp.status_code == 200, f"Failed to get packages: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of packages"
        print(f"✓ GET /api/packages returned {len(data)} packages")
    
    def test_09_create_package_with_scope_and_materials(self):
        """POST /api/packages creates a package with scope_items and material_items"""
        unique_name = f"TEST_Package_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "description": "Test package with scope and materials",
            "base_rate_per_sqft": 1500,
            "scope_items": [
                {"name": "Foundation Work", "unit": "sqft", "unit_rate": 100, "quantity": 1},
                {"name": "Plastering", "unit": "sqft", "unit_rate": 50, "quantity": 1}
            ],
            "material_items": [
                {"name": "Cement", "brand": "UltraTech"},
                {"name": "Steel", "brand": ""}
            ]
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/packages",
            json=payload,
            cookies=self.cookies
        )
        assert resp.status_code == 200, f"Failed to create package: {resp.text}"
        data = resp.json()
        assert "package_id" in data, "Missing package_id in response"
        package_id = data.get("package_id")
        print(f"✓ POST /api/packages created: {unique_name} (ID: {package_id})")
        
        # Verify via GET
        get_resp = self.session.get(f"{BASE_URL}/api/packages/{package_id}", cookies=self.cookies)
        assert get_resp.status_code == 200, f"Failed to get created package: {get_resp.text}"
        pkg = get_resp.json()
        assert pkg.get("name") == unique_name, "Name mismatch"
        assert pkg.get("base_rate_per_sqft") == 1500, "Rate mismatch"
        assert len(pkg.get("scope_items", [])) == 2, f"Expected 2 scope items, got {len(pkg.get('scope_items', []))}"
        assert len(pkg.get("material_items", [])) == 2, f"Expected 2 material items, got {len(pkg.get('material_items', []))}"
        print(f"  - Verified package has 2 scope items and 2 material items")
        
        # Store for later tests
        self.__class__.created_package_id = package_id
        self.__class__.created_package_name = unique_name
    
    def test_10_update_package(self):
        """PATCH /api/packages/{package_id} updates a package"""
        package_id = getattr(self.__class__, 'created_package_id', None)
        if not package_id:
            pytest.skip("No package created in previous test")
        
        updated_name = f"TEST_Updated_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": updated_name,
            "description": "Updated description",
            "base_rate_per_sqft": 2000,
            "scope_items": [
                {"name": "Foundation Work", "unit": "sqft", "unit_rate": 120, "quantity": 1},
                {"name": "Plastering", "unit": "sqft", "unit_rate": 60, "quantity": 1},
                {"name": "Painting", "unit": "sqft", "unit_rate": 30, "quantity": 1}
            ],
            "material_items": [
                {"name": "Cement", "brand": "UltraTech"},
                {"name": "Steel", "brand": "TATA"},
                {"name": "Sand", "brand": ""}
            ]
        }
        
        resp = self.session.patch(
            f"{BASE_URL}/api/packages/{package_id}",
            json=payload,
            cookies=self.cookies
        )
        assert resp.status_code == 200, f"Failed to update package: {resp.text}"
        print(f"✓ PATCH /api/packages/{package_id} succeeded")
        
        # Verify update via GET
        get_resp = self.session.get(f"{BASE_URL}/api/packages/{package_id}", cookies=self.cookies)
        assert get_resp.status_code == 200
        pkg = get_resp.json()
        assert pkg.get("name") == updated_name, f"Name not updated: {pkg.get('name')}"
        assert pkg.get("base_rate_per_sqft") == 2000, "Rate not updated"
        assert len(pkg.get("scope_items", [])) == 3, "Scope items not updated"
        assert len(pkg.get("material_items", [])) == 3, "Material items not updated"
        print(f"  - Verified package updated: name={updated_name}, rate=2000, 3 scope items, 3 materials")
    
    def test_11_delete_package(self):
        """DELETE /api/packages/{package_id} soft deletes a package"""
        # Create a new package to delete
        unique_name = f"TEST_ToDelete_{uuid.uuid4().hex[:6]}"
        create_resp = self.session.post(
            f"{BASE_URL}/api/packages",
            json={"name": unique_name, "base_rate_per_sqft": 1000, "scope_items": [], "material_items": []},
            cookies=self.cookies
        )
        assert create_resp.status_code == 200
        package_id = create_resp.json().get("package_id")
        print(f"  - Created package to delete: {package_id}")
        
        # Delete it
        del_resp = self.session.delete(f"{BASE_URL}/api/packages/{package_id}", cookies=self.cookies)
        assert del_resp.status_code == 200, f"Failed to delete package: {del_resp.text}"
        print(f"✓ DELETE /api/packages/{package_id} succeeded")
        
        # Verify it's not in active packages list
        list_resp = self.session.get(f"{BASE_URL}/api/packages", cookies=self.cookies)
        assert list_resp.status_code == 200
        pkg_ids = [p.get("package_id") for p in list_resp.json()]
        assert package_id not in pkg_ids, "Deleted package still appears in list"
        print(f"  - Verified package no longer in active list")
    
    # ==================== PERMISSION TESTS ====================
    
    def test_12_unauthenticated_access_denied(self):
        """Unauthenticated requests return 401"""
        # Create a new session without auth
        unauth_session = requests.Session()
        
        resp = unauth_session.get(f"{BASE_URL}/api/packages")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print(f"✓ Unauthenticated GET /api/packages returns 401")
        
        resp = unauth_session.get(f"{BASE_URL}/api/material-names")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print(f"✓ Unauthenticated GET /api/material-names returns 401")
        
        resp = unauth_session.get(f"{BASE_URL}/api/brands")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print(f"✓ Unauthenticated GET /api/brands returns 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
