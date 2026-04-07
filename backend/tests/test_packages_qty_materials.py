"""
Test Package Scope Items with Qty/Total and Materials Tab Package Filter
Tests:
1. POST /api/packages with scope_items containing quantity field
2. GET /api/packages returns scope_items with quantity and total fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def session():
    """Create a session and login as planning user"""
    s = requests.Session()
    login_resp = s.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    print(f"Logged in as: {login_resp.json().get('name')}")
    return s


def test_get_packages_list(session):
    """Test GET /api/packages returns list of packages"""
    resp = session.get(f"{BASE_URL}/api/packages")
    assert resp.status_code == 200, f"Failed to get packages: {resp.text}"
    packages = resp.json()
    assert isinstance(packages, list), "Expected list of packages"
    print(f"Found {len(packages)} packages")


def test_create_package_with_qty_scope_items(session):
    """Test POST /api/packages with scope_items containing quantity"""
    payload = {
        "name": "TEST_Qty_Package_v2",
        "description": "Test package with qty scope items",
        "base_rate_per_sqft": 1500,
        "scope_items": [
            {"name": "Foundation Work", "unit": "sqft", "quantity": 500, "unit_rate": 100},
            {"name": "Plastering", "unit": "sqft", "quantity": 1000, "unit_rate": 50}
        ],
        "material_items": [
            {"name": "Cement", "brand": "UltraTech"},
            {"name": "Steel", "brand": "TATA"}
        ]
    }
    
    resp = session.post(f"{BASE_URL}/api/packages", json=payload)
    assert resp.status_code == 200, f"Failed to create package: {resp.text}"
    result = resp.json()
    assert "package_id" in result, "Response should contain package_id"
    print(f"Created package: {result.get('package_id')}")
    
    # Verify the package was created with correct data
    pkg_id = result.get('package_id')
    get_resp = session.get(f"{BASE_URL}/api/packages/{pkg_id}")
    assert get_resp.status_code == 200, f"Failed to get created package: {get_resp.text}"
    
    pkg = get_resp.json()
    assert pkg.get('name') == "TEST_Qty_Package_v2"
    
    # Verify scope items have quantity and total
    scope_items = pkg.get('scope_items', [])
    assert len(scope_items) == 2, f"Expected 2 scope items, got {len(scope_items)}"
    
    foundation = next((s for s in scope_items if 'Foundation' in s.get('name', '')), None)
    assert foundation is not None, "Foundation scope item not found"
    assert foundation.get('quantity') == 500, f"Expected qty 500, got {foundation.get('quantity')}"
    assert foundation.get('unit_rate') == 100, f"Expected rate 100, got {foundation.get('unit_rate')}"
    assert foundation.get('total') == 50000, f"Expected total 50000, got {foundation.get('total')}"
    
    print(f"Scope items verified with qty and total fields")
    
    # Cleanup
    session.delete(f"{BASE_URL}/api/packages/{pkg_id}")


def test_scope_items_total_calculation(session):
    """Test that Total = Qty × Rate is auto-calculated"""
    payload = {
        "name": "TEST_Total_Calc_Package",
        "base_rate_per_sqft": 1000,
        "scope_items": [
            {"name": "Test Item", "unit": "nos", "quantity": 10, "unit_rate": 500}
        ],
        "material_items": []
    }
    
    resp = session.post(f"{BASE_URL}/api/packages", json=payload)
    assert resp.status_code == 200
    pkg_id = resp.json().get('package_id')
    
    # Verify total calculation
    get_resp = session.get(f"{BASE_URL}/api/packages/{pkg_id}")
    pkg = get_resp.json()
    scope_item = pkg.get('scope_items', [])[0]
    
    expected_total = 10 * 500  # qty × rate
    assert scope_item.get('total') == expected_total, f"Expected total {expected_total}, got {scope_item.get('total')}"
    print(f"Total calculation verified: {scope_item.get('quantity')} × {scope_item.get('unit_rate')} = {scope_item.get('total')}")
    
    # Cleanup
    session.delete(f"{BASE_URL}/api/packages/{pkg_id}")


def test_packages_for_materials_filter(session):
    """Test GET /api/packages returns packages for dropdown filter"""
    resp = session.get(f"{BASE_URL}/api/packages")
    assert resp.status_code == 200
    packages = resp.json()
    
    print(f"Packages available for filter dropdown: {len(packages)}")
    for pkg in packages:
        mat_count = len(pkg.get('material_items', []))
        print(f"  - {pkg.get('name')}: {mat_count} materials")


def test_package_materials_structure(session):
    """Test GET /api/packages/{id} returns material_items with name and brand"""
    resp = session.get(f"{BASE_URL}/api/packages")
    assert resp.status_code == 200
    packages = resp.json()
    
    # Find a package with materials
    pkg_with_mats = next((p for p in packages if len(p.get('material_items', [])) > 0), None)
    if not pkg_with_mats:
        pytest.skip("No packages with materials found")
    
    pkg_id = pkg_with_mats.get('package_id')
    detail_resp = session.get(f"{BASE_URL}/api/packages/{pkg_id}")
    assert detail_resp.status_code == 200
    
    pkg = detail_resp.json()
    material_items = pkg.get('material_items', [])
    
    print(f"Package: {pkg.get('name')}")
    print(f"Materials ({len(material_items)}):")
    for mat in material_items:
        assert 'name' in mat, "Material should have 'name' field"
        print(f"  - Material Name: {mat.get('name')}, Brand: {mat.get('brand', '-')}")


def test_cleanup_test_packages(session):
    """Cleanup test packages"""
    resp = session.get(f"{BASE_URL}/api/packages")
    if resp.status_code == 200:
        packages = resp.json()
        for pkg in packages:
            if pkg.get('name', '').startswith('TEST_'):
                del_resp = session.delete(f"{BASE_URL}/api/packages/{pkg.get('package_id')}")
                if del_resp.status_code == 200:
                    print(f"Deleted test package: {pkg.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
