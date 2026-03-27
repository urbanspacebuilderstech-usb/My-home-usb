"""
Package Management, Brands, and Rough Estimates API Tests
Tests for:
- GET/POST/PATCH/DELETE /api/packages
- POST /api/packages/{id}/lock
- POST /api/packages/{id}/duplicate
- GET/POST /api/brands
- POST /api/rough-estimates
- GET /api/packages/{id}/rough-estimates
- PATCH/DELETE /api/rough-estimates/{id}
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create authenticated session via demo login"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Demo login as super_admin using existing admin email
    login_resp = s.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
    if login_resp.status_code != 200:
        print(f"Demo login failed: {login_resp.status_code} - {login_resp.text}")
        pytest.skip("Demo login failed - cannot proceed with tests")
    # Extract session cookie
    print(f"Login successful, cookies: {s.cookies.get_dict()}")
    return s


class TestBrandsAPI:
    """Brand management API tests"""
    
    def test_get_brands(self, session):
        """GET /api/brands returns brand list"""
        resp = session.get(f"{BASE_URL}/api/brands")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of brands"
        print(f"✓ GET /api/brands returned {len(data)} brands")
    
    def test_create_brand(self, session):
        """POST /api/brands creates new brand"""
        brand_name = f"TestBrand_{uuid.uuid4().hex[:6]}"
        resp = session.post(f"{BASE_URL}/api/brands", json={
            "name": brand_name,
            "category": "cement"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "brand_id" in data, "Response should contain brand_id"
        assert data["name"] == brand_name, f"Expected name {brand_name}, got {data.get('name')}"
        print(f"✓ POST /api/brands created brand: {brand_name}")
        return data["brand_id"]
    
    def test_create_duplicate_brand_returns_existing(self, session):
        """POST /api/brands with existing name returns existing brand"""
        # First create a brand
        brand_name = f"DupTest_{uuid.uuid4().hex[:6]}"
        resp1 = session.post(f"{BASE_URL}/api/brands", json={"name": brand_name})
        assert resp1.status_code == 200
        
        # Try to create same brand again
        resp2 = session.post(f"{BASE_URL}/api/brands", json={"name": brand_name})
        assert resp2.status_code == 200
        data = resp2.json()
        assert data.get("exists") == True or "brand_id" in data, "Should return existing brand"
        print(f"✓ Duplicate brand creation handled correctly")


class TestPackagesAPI:
    """Package CRUD API tests"""
    
    @pytest.fixture(scope="class")
    def created_package_id(self, session):
        """Create a test package for subsequent tests"""
        pkg_code = f"T{uuid.uuid4().hex[:3].upper()}"
        resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"Test Package {pkg_code}",
            "code": pkg_code,
            "tag": "1899",
            "base_rate_per_sqft": 1899,
            "description": "Test package for automated testing",
            "building_types": ["residential"],
            "material_items": [],
            "scope_items": [],
            "labour_items": []
        })
        assert resp.status_code in [200, 201], f"Failed to create package: {resp.text}"
        data = resp.json()
        assert "package_id" in data, "Response should contain package_id"
        print(f"✓ Created test package: {data['package_id']}")
        return data["package_id"]
    
    def test_get_packages(self, session):
        """GET /api/packages returns package list"""
        resp = session.get(f"{BASE_URL}/api/packages")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of packages"
        print(f"✓ GET /api/packages returned {len(data)} packages")
    
    def test_create_package(self, session):
        """POST /api/packages creates a new package"""
        pkg_code = f"P{uuid.uuid4().hex[:3].upper()}"
        resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"Package {pkg_code}",
            "code": pkg_code,
            "tag": "2199",
            "base_rate_per_sqft": 2199,
            "description": "Premium package"
        })
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "package_id" in data, "Response should contain package_id"
        print(f"✓ POST /api/packages created package: {data['package_id']}")
    
    def test_update_package(self, session, created_package_id):
        """PATCH /api/packages/{id} updates package"""
        # First get the package to get required fields
        get_resp = session.get(f"{BASE_URL}/api/packages")
        packages = get_resp.json()
        pkg = next((p for p in packages if p.get("package_id") == created_package_id), None)
        if not pkg:
            pytest.skip("Package not found for update test")
        
        # Update with all required fields
        resp = session.patch(f"{BASE_URL}/api/packages/{created_package_id}", json={
            "name": pkg.get("name", "Test Package"),
            "code": pkg.get("code", "TST"),
            "description": "Updated description for testing",
            "base_rate_per_sqft": 2099
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"✓ PATCH /api/packages/{created_package_id} updated successfully")
        
        # Verify update persisted
        get_resp2 = session.get(f"{BASE_URL}/api/packages")
        assert get_resp2.status_code == 200
        packages2 = get_resp2.json()
        updated_pkg = next((p for p in packages2 if p.get("package_id") == created_package_id), None)
        if updated_pkg:
            assert updated_pkg.get("base_rate_per_sqft") == 2099, "Rate should be updated"
            print(f"✓ Verified package update persisted")
    
    def test_lock_package(self, session):
        """POST /api/packages/{id}/lock locks a package"""
        # Create a new package to lock
        pkg_code = f"L{uuid.uuid4().hex[:3].upper()}"
        create_resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"Lock Test {pkg_code}",
            "code": pkg_code,
            "tag": "1599"
        })
        assert create_resp.status_code in [200, 201]
        pkg_id = create_resp.json()["package_id"]
        
        # Lock the package
        lock_resp = session.post(f"{BASE_URL}/api/packages/{pkg_id}/lock")
        assert lock_resp.status_code == 200, f"Expected 200, got {lock_resp.status_code}: {lock_resp.text}"
        data = lock_resp.json()
        assert data.get("status") == "locked", f"Expected status 'locked', got {data}"
        print(f"✓ POST /api/packages/{pkg_id}/lock - package locked")
        return pkg_id
    
    def test_duplicate_package(self, session):
        """POST /api/packages/{id}/duplicate creates an editable copy"""
        # Create and lock a package first
        pkg_code = f"D{uuid.uuid4().hex[:3].upper()}"
        create_resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"Dup Source {pkg_code}",
            "code": pkg_code,
            "tag": "1799",
            "base_rate_per_sqft": 1799
        })
        assert create_resp.status_code in [200, 201]
        pkg_id = create_resp.json()["package_id"]
        
        # Lock it
        session.post(f"{BASE_URL}/api/packages/{pkg_id}/lock")
        
        # Duplicate it
        dup_resp = session.post(f"{BASE_URL}/api/packages/{pkg_id}/duplicate", json={
            "new_name": f"Dup Copy {pkg_code}",
            "new_tag": "1899"
        })
        assert dup_resp.status_code == 200, f"Expected 200, got {dup_resp.status_code}: {dup_resp.text}"
        data = dup_resp.json()
        assert "package_id" in data, "Response should contain new package_id"
        assert data["package_id"] != pkg_id, "Duplicated package should have different ID"
        print(f"✓ POST /api/packages/{pkg_id}/duplicate - created copy: {data['package_id']}")


class TestRoughEstimatesAPI:
    """Rough Estimates API tests"""
    
    @pytest.fixture(scope="class")
    def test_package_id(self, session):
        """Create a package for rough estimate tests"""
        pkg_code = f"RE{uuid.uuid4().hex[:3].upper()}"
        resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"RE Test Package {pkg_code}",
            "code": pkg_code,
            "tag": "2499"
        })
        assert resp.status_code in [200, 201]
        return resp.json()["package_id"]
    
    def test_create_rough_estimate(self, session, test_package_id):
        """POST /api/rough-estimates creates rough estimate under a package"""
        resp = session.post(f"{BASE_URL}/api/rough-estimates", json={
            "package_id": test_package_id,
            "name": "G+1 Basic Estimate",
            "floor_config": "G+1",
            "items": [
                {"name": "Foundation", "unit": "cft", "amount": 500, "qty": 100, "remarks": "RCC foundation"},
                {"name": "Brickwork", "unit": "sqft", "amount": 50, "qty": 2000, "remarks": "9 inch wall"},
                {"name": "Plastering", "unit": "sqft", "amount": 25, "qty": 3000, "remarks": "Internal + External"}
            ]
        })
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "estimate_id" in data, "Response should contain estimate_id"
        assert data.get("floor_config") == "G+1", "Floor config should be G+1"
        assert len(data.get("items", [])) == 3, "Should have 3 items"
        # Verify total calculation
        expected_total = (500*100) + (50*2000) + (25*3000)  # 50000 + 100000 + 75000 = 225000
        assert data.get("total_value") == expected_total, f"Expected total {expected_total}, got {data.get('total_value')}"
        print(f"✓ POST /api/rough-estimates created estimate: {data['estimate_id']} with total {data.get('total_value')}")
        return data["estimate_id"]
    
    def test_get_rough_estimates_for_package(self, session, test_package_id):
        """GET /api/packages/{id}/rough-estimates returns estimates for a package"""
        # First create an estimate
        session.post(f"{BASE_URL}/api/rough-estimates", json={
            "package_id": test_package_id,
            "name": "G+2 Premium Estimate",
            "floor_config": "G+2",
            "items": [{"name": "Steel", "unit": "kg", "amount": 80, "qty": 5000}]
        })
        
        # Get estimates
        resp = session.get(f"{BASE_URL}/api/packages/{test_package_id}/rough-estimates")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list of estimates"
        assert len(data) >= 1, "Should have at least 1 estimate"
        print(f"✓ GET /api/packages/{test_package_id}/rough-estimates returned {len(data)} estimates")
    
    def test_update_rough_estimate(self, session, test_package_id):
        """PATCH /api/rough-estimates/{id} updates estimate items"""
        # Create an estimate
        create_resp = session.post(f"{BASE_URL}/api/rough-estimates", json={
            "package_id": test_package_id,
            "name": "Update Test Estimate",
            "floor_config": "G+3",
            "items": [{"name": "Cement", "unit": "bag", "amount": 400, "qty": 100}]
        })
        assert create_resp.status_code in [200, 201]
        est_id = create_resp.json()["estimate_id"]
        
        # Update the estimate
        update_resp = session.patch(f"{BASE_URL}/api/rough-estimates/{est_id}", json={
            "name": "Updated Estimate Name",
            "items": [
                {"name": "Cement", "unit": "bag", "amount": 450, "qty": 120},
                {"name": "Sand", "unit": "cft", "amount": 50, "qty": 200}
            ]
        })
        assert update_resp.status_code == 200, f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        print(f"✓ PATCH /api/rough-estimates/{est_id} updated successfully")
        
        # Verify update
        get_resp = session.get(f"{BASE_URL}/api/rough-estimates/{est_id}")
        if get_resp.status_code == 200:
            data = get_resp.json()
            assert data.get("name") == "Updated Estimate Name", "Name should be updated"
            assert len(data.get("items", [])) == 2, "Should have 2 items after update"
            print(f"✓ Verified estimate update persisted")
    
    def test_delete_rough_estimate(self, session, test_package_id):
        """DELETE /api/rough-estimates/{id} soft-deletes an estimate"""
        # Create an estimate to delete
        create_resp = session.post(f"{BASE_URL}/api/rough-estimates", json={
            "package_id": test_package_id,
            "name": "Delete Test Estimate",
            "floor_config": "G+1",
            "items": [{"name": "Test Item", "unit": "nos", "amount": 100, "qty": 10}]
        })
        assert create_resp.status_code in [200, 201]
        est_id = create_resp.json()["estimate_id"]
        
        # Delete the estimate
        del_resp = session.delete(f"{BASE_URL}/api/rough-estimates/{est_id}")
        assert del_resp.status_code == 200, f"Expected 200, got {del_resp.status_code}: {del_resp.text}"
        data = del_resp.json()
        assert data.get("status") == "deleted", f"Expected status 'deleted', got {data}"
        print(f"✓ DELETE /api/rough-estimates/{est_id} - soft deleted")
        
        # Verify it's no longer in active list
        list_resp = session.get(f"{BASE_URL}/api/packages/{test_package_id}/rough-estimates")
        assert list_resp.status_code == 200
        estimates = list_resp.json()
        deleted_est = next((e for e in estimates if e.get("estimate_id") == est_id), None)
        assert deleted_est is None, "Deleted estimate should not appear in active list"
        print(f"✓ Verified estimate no longer in active list")


class TestPackageWithMaterials:
    """Test package creation with materials and brand selection"""
    
    def test_create_package_with_materials(self, session):
        """Create package with material items including brand"""
        # Get existing brands
        brands_resp = session.get(f"{BASE_URL}/api/brands")
        brands = brands_resp.json() if brands_resp.status_code == 200 else []
        brand_name = brands[0]["name"] if brands else "Zuari"
        
        pkg_code = f"M{uuid.uuid4().hex[:3].upper()}"
        resp = session.post(f"{BASE_URL}/api/packages", json={
            "name": f"Materials Package {pkg_code}",
            "code": pkg_code,
            "tag": "2299",
            "base_rate_per_sqft": 2299,
            "material_items": [
                {
                    "item_id": f"pmi_{uuid.uuid4().hex[:8]}",
                    "name": "Cement",
                    "brand": brand_name,
                    "specification": "OPC 53 Grade",
                    "quantity": 100,
                    "unit": "bag",
                    "estimated_rate": 400
                },
                {
                    "item_id": f"pmi_{uuid.uuid4().hex[:8]}",
                    "name": "Steel",
                    "brand": "Tata Tiscon",
                    "specification": "Fe500D",
                    "quantity": 5000,
                    "unit": "kg",
                    "estimated_rate": 75
                }
            ]
        })
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "package_id" in data, "Response should contain package_id"
        print(f"✓ Created package with materials: {data['package_id']}")
        
        # Verify materials are saved
        get_resp = session.get(f"{BASE_URL}/api/packages")
        packages = get_resp.json()
        created_pkg = next((p for p in packages if p.get("package_id") == data["package_id"]), None)
        if created_pkg:
            materials = created_pkg.get("material_items", [])
            assert len(materials) == 2, f"Expected 2 materials, got {len(materials)}"
            print(f"✓ Verified package has {len(materials)} material items")


class TestEdgeCases:
    """Edge case and error handling tests"""
    
    def test_lock_nonexistent_package(self, session):
        """POST /api/packages/{invalid_id}/lock returns 404"""
        resp = session.post(f"{BASE_URL}/api/packages/pkg_nonexistent123/lock")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print(f"✓ Lock nonexistent package returns 404")
    
    def test_duplicate_nonexistent_package(self, session):
        """POST /api/packages/{invalid_id}/duplicate returns 404"""
        resp = session.post(f"{BASE_URL}/api/packages/pkg_nonexistent123/duplicate", json={
            "new_name": "Copy",
            "new_tag": "test"
        })
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print(f"✓ Duplicate nonexistent package returns 404")
    
    def test_create_estimate_for_nonexistent_package(self, session):
        """POST /api/rough-estimates with invalid package_id returns 404"""
        resp = session.post(f"{BASE_URL}/api/rough-estimates", json={
            "package_id": "pkg_nonexistent123",
            "name": "Test",
            "floor_config": "G+1",
            "items": []
        })
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print(f"✓ Create estimate for nonexistent package returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
