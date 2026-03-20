"""
Backend API Tests for Planning Board Redesign
Tests: Materials, Labour Contractors, Vendors endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://labor-materials-hub.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

# Demo user emails from seed data
PLANNING_EMAIL = "planning@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"


class TestPlanningBoardAPIs:
    """Test Planning Board backend APIs"""
    
    session = None
    
    @classmethod
    def setup_class(cls):
        """Login as Planning user"""
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        
        # Login via demo-login endpoint with email
        try:
            resp = cls.session.post(f"{API}/auth/demo-login", json={"email": PLANNING_EMAIL})
            print(f"Planning login response: {resp.status_code}")
            if resp.status_code == 200:
                print(f"  Login successful")
        except Exception as e:
            print(f"Planning login failed: {e}")
    
    # === MATERIALS TESTS ===
    
    def test_get_materials_all(self):
        """GET /api/materials?active_only=false returns list"""
        resp = self.session.get(f"{API}/materials?active_only=false")
        print(f"GET /materials?active_only=false: {resp.status_code}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"  Materials count: {len(data)}")
    
    def test_get_materials_active_only(self):
        """GET /api/materials?active_only=true returns active materials"""
        resp = self.session.get(f"{API}/materials?active_only=true")
        print(f"GET /materials?active_only=true: {resp.status_code}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_create_material(self):
        """POST /api/materials creates material"""
        payload = {
            "name": f"TEST_Material_{int(time.time())}",
            "category": "steel",
            "unit": "kg",
            "description": "Test material",
            "hsn_code": "7208"
        }
        resp = self.session.post(f"{API}/materials", json=payload)
        print(f"POST /materials: {resp.status_code}")
        
        # Planning role should be able to create materials
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "material_id" in data or "name" in data
        print(f"  Created material: {data.get('name') or data.get('material_id')}")
    
    def test_get_material_categories(self):
        """GET /api/materials/categories returns categories list"""
        resp = self.session.get(f"{API}/materials/categories")
        print(f"GET /materials/categories: {resp.status_code}")
        assert resp.status_code == 200
    
    # === LABOUR CONTRACTORS TESTS ===
    
    def test_get_labour_contractors(self):
        """GET /api/labour-contractors returns list"""
        resp = self.session.get(f"{API}/labour-contractors")
        print(f"GET /labour-contractors: {resp.status_code}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"  Contractors count: {len(data)}")
    
    def test_create_labour_contractor(self):
        """POST /api/labour-contractors creates contractor"""
        payload = {
            "name": f"TEST_Contractor_{int(time.time())}",
            "work_types": ["Masonry", "Plumbing"],
            "phone": "+91987654321",
            "address": "Test Address"
        }
        resp = self.session.post(f"{API}/labour-contractors", json=payload)
        print(f"POST /labour-contractors: {resp.status_code}")
        
        # Planning role should be able to create contractors
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "contractor_id" in data or "name" in data
        print(f"  Created contractor: {data.get('name') or data.get('contractor_id')}")
    
    # === VENDOR MASTER TESTS ===
    
    def test_get_vendor_master_all(self):
        """GET /api/vendor-master?active_only=false returns list"""
        resp = self.session.get(f"{API}/vendor-master?active_only=false")
        print(f"GET /vendor-master?active_only=false: {resp.status_code}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Expected list response"
        print(f"  Vendors count: {len(data)}")
    
    def test_get_vendor_master_active(self):
        """GET /api/vendor-master returns active vendors"""
        resp = self.session.get(f"{API}/vendor-master")
        print(f"GET /vendor-master: {resp.status_code}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
    
    def test_create_vendor_master_planning_role(self):
        """POST /api/vendor-master with Planning role
        Note: This may return 403 as vendor creation is Procurement-only
        """
        payload = {
            "name": f"TEST_Vendor_{int(time.time())}",
            "contact_person": "Test Contact",
            "phone": "+91987654322",
            "address": "Test Vendor Address",
            "payment_terms": "full"
        }
        resp = self.session.post(f"{API}/vendor-master", json=payload)
        print(f"POST /vendor-master (Planning role): {resp.status_code}")
        
        # Planning role currently gets 403 - this is expected current behavior
        if resp.status_code == 403:
            print("  EXPECTED: Vendor creation is Procurement-only (Planning gets 403)")
            pytest.skip("Vendor creation is Procurement-only, Planning role gets 403")
        else:
            assert resp.status_code in [200, 201]
    
    # === PLANNING DASHBOARD TESTS ===
    
    def test_planning_stage_dashboard(self):
        """GET /api/planning/stage-dashboard returns dashboard data"""
        resp = self.session.get(f"{API}/planning/stage-dashboard")
        print(f"GET /planning/stage-dashboard: {resp.status_code}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        # Check for expected fields
        assert "stages" in data or "stage_counts" in data
        print(f"  Dashboard data keys: {list(data.keys())}")
    
    def test_planning_projects_by_stage(self):
        """GET /api/planning/projects-by-stage returns projects"""
        resp = self.session.get(f"{API}/planning/projects-by-stage")
        print(f"GET /planning/projects-by-stage: {resp.status_code}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"  Projects count: {len(data)}")


# Cleanup test data
class TestCleanup:
    """Cleanup TEST_ prefixed data"""
    
    @classmethod
    def setup_class(cls):
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        # Login as admin for cleanup
        try:
            resp = cls.session.post(f"{API}/auth/demo-login", json={"email": ADMIN_EMAIL})
            print(f"Admin login for cleanup: {resp.status_code}")
        except Exception:
            pass
    
    def test_cleanup_test_materials(self):
        """Cleanup TEST_ prefixed materials"""
        resp = self.session.get(f"{API}/materials?active_only=false")
        if resp.status_code == 200:
            materials = resp.json()
            for m in materials:
                if m.get("name", "").startswith("TEST_"):
                    del_resp = self.session.delete(f"{API}/materials/{m['material_id']}")
                    print(f"  Deleted material: {m['name']} - {del_resp.status_code}")
    
    def test_cleanup_test_contractors(self):
        """Cleanup TEST_ prefixed contractors"""
        resp = self.session.get(f"{API}/labour-contractors")
        if resp.status_code == 200:
            contractors = resp.json()
            for c in contractors:
                if c.get("name", "").startswith("TEST_"):
                    del_resp = self.session.delete(f"{API}/labour-contractors/{c['contractor_id']}")
                    print(f"  Deleted contractor: {c['name']} - {del_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
