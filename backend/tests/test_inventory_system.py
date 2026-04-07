"""
Test Suite for Enhanced Daily Inventory Management System
Tests: POST /api/material-inventory, GET /api/material-inventory/latest, 
       GET /api/material-inventory/dashboard, PATCH /api/material-inventory/threshold
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PROJECT_ID = "proj_12f23331b542"  # Known test project with inventory data

# Module-level session to avoid rate limiting
_session = None

def get_authenticated_session():
    """Get or create authenticated session"""
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        login_response = _session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        if login_response.status_code != 200:
            raise Exception(f"Login failed: {login_response.text}")
    return _session


class TestInventorySystem:
    """Test suite for the Enhanced Daily Inventory Management System"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication using demo-login"""
        self.session = get_authenticated_session()
        yield

    # ==================== POST /api/material-inventory ====================
    def test_create_inventory_entry_basic(self):
        """Test creating a basic inventory entry"""
        test_material = f"TEST_Material_{uuid.uuid4().hex[:6]}"
        payload = {
            "project_id": PROJECT_ID,
            "material_name": test_material,
            "unit": "bags",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "opening_stock": 100,
            "received": 50,
            "used": 30,
            "min_threshold": 25,
            "notes": "Test inventory entry"
        }
        
        response = self.session.post(f"{BASE_URL}/api/material-inventory", json=payload)
        assert response.status_code == 200, f"Create inventory failed: {response.text}"
        
        data = response.json()
        assert "inventory_id" in data, "Response should contain inventory_id"
        assert data["material_name"] == test_material
        assert data["opening_stock"] == 100
        assert data["received"] == 50
        assert data["used"] == 30
        # Closing stock should be auto-calculated: 100 + 50 - 30 = 120
        assert data["closing_stock"] == 120, f"Expected closing_stock=120, got {data['closing_stock']}"
        assert data["min_threshold"] == 25, "min_threshold should be stored"
        print(f"PASS: Created inventory entry with id={data['inventory_id']}, closing_stock={data['closing_stock']}")

    def test_create_inventory_entry_with_min_threshold(self):
        """Test that min_threshold field is properly stored"""
        test_material = f"TEST_Threshold_{uuid.uuid4().hex[:6]}"
        payload = {
            "project_id": PROJECT_ID,
            "material_name": test_material,
            "unit": "kg",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "opening_stock": 50,
            "received": 0,
            "used": 10,
            "min_threshold": 100  # Threshold higher than closing stock (40)
        }
        
        response = self.session.post(f"{BASE_URL}/api/material-inventory", json=payload)
        assert response.status_code == 200, f"Create inventory failed: {response.text}"
        
        data = response.json()
        assert data["min_threshold"] == 100, "min_threshold should be 100"
        assert data["closing_stock"] == 40, "closing_stock should be 40"
        print(f"PASS: Created inventory with min_threshold={data['min_threshold']}, closing={data['closing_stock']}")

    # ==================== GET /api/material-inventory/latest ====================
    def test_get_latest_inventory(self):
        """Test getting latest stock per material"""
        response = self.session.get(f"{BASE_URL}/api/material-inventory/latest?project_id={PROJECT_ID}")
        assert response.status_code == 200, f"Get latest inventory failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            # Check structure of first item
            item = data[0]
            assert "material_name" in item, "Should have material_name"
            assert "closing_stock" in item, "Should have closing_stock"
            print(f"PASS: Got {len(data)} latest inventory items")
            for m in data[:3]:  # Print first 3
                print(f"  - {m.get('material_name')}: closing={m.get('closing_stock')}, threshold={m.get('min_threshold', 0)}")
        else:
            print("PASS: Latest inventory returned empty list (no data yet)")

    # ==================== GET /api/material-inventory/dashboard ====================
    def test_get_inventory_dashboard(self):
        """Test getting comprehensive inventory dashboard"""
        response = self.session.get(f"{BASE_URL}/api/material-inventory/dashboard?project_id={PROJECT_ID}")
        assert response.status_code == 200, f"Get dashboard failed: {response.text}"
        
        data = response.json()
        assert "project_id" in data, "Should have project_id"
        assert "total_materials" in data, "Should have total_materials count"
        assert "low_stock_count" in data, "Should have low_stock_count"
        assert "materials" in data, "Should have materials list"
        
        print(f"PASS: Dashboard - total_materials={data['total_materials']}, low_stock_count={data['low_stock_count']}")
        
        # Check materials structure
        if len(data["materials"]) > 0:
            mat = data["materials"][0]
            required_fields = ["material_name", "unit", "current_stock", "total_received", "total_used", "min_threshold", "is_low_stock"]
            for field in required_fields:
                assert field in mat, f"Material should have {field}"
            print(f"  Materials structure verified with all required fields")

    def test_dashboard_low_stock_detection(self):
        """Test that low stock detection works correctly"""
        response = self.session.get(f"{BASE_URL}/api/material-inventory/dashboard?project_id={PROJECT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        materials = data.get("materials", [])
        
        low_stock_materials = [m for m in materials if m.get("is_low_stock")]
        reported_low_count = data.get("low_stock_count", 0)
        
        # Verify low_stock_count matches actual low stock materials
        assert len(low_stock_materials) == reported_low_count, \
            f"low_stock_count ({reported_low_count}) should match actual low stock materials ({len(low_stock_materials)})"
        
        # Verify low stock logic: current_stock <= min_threshold when threshold > 0
        for mat in low_stock_materials:
            threshold = mat.get("min_threshold", 0)
            current = mat.get("current_stock", 0)
            assert threshold > 0, f"{mat['material_name']}: Low stock should only be flagged when threshold > 0"
            assert current <= threshold, f"{mat['material_name']}: current_stock ({current}) should be <= threshold ({threshold})"
            print(f"  LOW: {mat['material_name']} - current={current}, threshold={threshold}")
        
        print(f"PASS: Low stock detection verified - {reported_low_count} materials below threshold")

    # ==================== PATCH /api/material-inventory/threshold ====================
    def test_update_threshold(self):
        """Test updating min threshold for a material"""
        # First create an inventory entry
        test_material = f"TEST_ThresholdUpdate_{uuid.uuid4().hex[:6]}"
        create_payload = {
            "project_id": PROJECT_ID,
            "material_name": test_material,
            "unit": "bags",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "opening_stock": 100,
            "received": 0,
            "used": 0,
            "min_threshold": 10
        }
        create_response = self.session.post(f"{BASE_URL}/api/material-inventory", json=create_payload)
        assert create_response.status_code == 200
        
        # Update threshold
        update_payload = {
            "project_id": PROJECT_ID,
            "material_name": test_material,
            "min_threshold": 50
        }
        response = self.session.patch(f"{BASE_URL}/api/material-inventory/threshold", json=update_payload)
        assert response.status_code == 200, f"Update threshold failed: {response.text}"
        
        data = response.json()
        assert data.get("min_threshold") == 50, f"Expected min_threshold=50, got {data.get('min_threshold')}"
        assert data.get("material_name") == test_material
        print(f"PASS: Updated threshold for {test_material} to 50")

    def test_update_threshold_missing_params(self):
        """Test that update threshold fails without required params"""
        # Missing material_name
        response = self.session.patch(f"{BASE_URL}/api/material-inventory/threshold", json={
            "project_id": PROJECT_ID,
            "min_threshold": 50
        })
        assert response.status_code == 400, "Should fail without material_name"
        
        # Missing project_id
        response = self.session.patch(f"{BASE_URL}/api/material-inventory/threshold", json={
            "material_name": "Test",
            "min_threshold": 50
        })
        assert response.status_code == 400, "Should fail without project_id"
        print("PASS: Threshold update correctly validates required params")

    # ==================== Integration Tests ====================
    def test_inventory_flow_create_and_verify_dashboard(self):
        """Test full flow: create inventory -> verify in dashboard"""
        test_material = f"TEST_Flow_{uuid.uuid4().hex[:6]}"
        
        # Create inventory with low stock scenario
        create_payload = {
            "project_id": PROJECT_ID,
            "material_name": test_material,
            "unit": "pieces",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "opening_stock": 20,
            "received": 5,
            "used": 10,
            "min_threshold": 50  # Threshold > closing (15)
        }
        create_response = self.session.post(f"{BASE_URL}/api/material-inventory", json=create_payload)
        assert create_response.status_code == 200
        created = create_response.json()
        assert created["closing_stock"] == 15  # 20 + 5 - 10
        
        # Verify in dashboard
        dashboard_response = self.session.get(f"{BASE_URL}/api/material-inventory/dashboard?project_id={PROJECT_ID}")
        assert dashboard_response.status_code == 200
        dashboard = dashboard_response.json()
        
        # Find our test material
        test_mat_in_dashboard = next((m for m in dashboard["materials"] if m["material_name"] == test_material), None)
        assert test_mat_in_dashboard is not None, f"Test material {test_material} should be in dashboard"
        assert test_mat_in_dashboard["current_stock"] == 15
        assert test_mat_in_dashboard["min_threshold"] == 50
        assert test_mat_in_dashboard["is_low_stock"] == True, "Should be flagged as low stock (15 <= 50)"
        
        print(f"PASS: Full flow verified - {test_material} correctly shows as LOW in dashboard")

    def test_existing_project_inventory_data(self):
        """Test that existing inventory data for proj_12f23331b542 is accessible"""
        # Get dashboard for known project
        response = self.session.get(f"{BASE_URL}/api/material-inventory/dashboard?project_id={PROJECT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Project {PROJECT_ID} inventory status:")
        print(f"  Total materials: {data.get('total_materials', 0)}")
        print(f"  Low stock count: {data.get('low_stock_count', 0)}")
        
        # Check for expected materials (Cement, Steel, Sand based on context)
        materials = data.get("materials", [])
        material_names = [m["material_name"] for m in materials]
        print(f"  Materials: {material_names}")
        
        for mat in materials:
            status = "LOW" if mat.get("is_low_stock") else "OK"
            print(f"    - {mat['material_name']}: stock={mat['current_stock']}, threshold={mat.get('min_threshold', 0)}, status={status}")
        
        print("PASS: Existing inventory data accessible")


class TestInventoryAPIValidation:
    """Test API validation and edge cases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with authentication using demo-login"""
        self.session = get_authenticated_session()
        yield

    def test_get_inventory_without_project_id(self):
        """Test that endpoints require project_id"""
        # Latest endpoint
        response = self.session.get(f"{BASE_URL}/api/material-inventory/latest")
        # Should either return 422 (validation error) or empty result
        assert response.status_code in [200, 422], f"Unexpected status: {response.status_code}"
        
        # Dashboard endpoint
        response = self.session.get(f"{BASE_URL}/api/material-inventory/dashboard")
        assert response.status_code in [200, 422], f"Unexpected status: {response.status_code}"
        print("PASS: API handles missing project_id appropriately")

    def test_inventory_closing_stock_calculation(self):
        """Test that closing stock is correctly calculated"""
        test_cases = [
            {"opening": 100, "received": 50, "used": 30, "expected_closing": 120},
            {"opening": 0, "received": 100, "used": 0, "expected_closing": 100},
            {"opening": 50, "received": 0, "used": 50, "expected_closing": 0},
            {"opening": 200, "received": 100, "used": 150, "expected_closing": 150},
        ]
        
        for i, tc in enumerate(test_cases):
            test_material = f"TEST_Calc_{uuid.uuid4().hex[:6]}"
            payload = {
                "project_id": PROJECT_ID,
                "material_name": test_material,
                "unit": "units",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "opening_stock": tc["opening"],
                "received": tc["received"],
                "used": tc["used"]
            }
            response = self.session.post(f"{BASE_URL}/api/material-inventory", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["closing_stock"] == tc["expected_closing"], \
                f"Case {i+1}: Expected closing={tc['expected_closing']}, got {data['closing_stock']}"
        
        print(f"PASS: All {len(test_cases)} closing stock calculations verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
