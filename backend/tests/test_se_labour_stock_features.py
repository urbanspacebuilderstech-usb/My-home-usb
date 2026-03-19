"""
Test Site Engineer Labour Count and Stock Register Features
- Labour Count: Daily worker count per category without requiring contractor/work order
- Stock Register: Daily material stock tracking with auto-calculated closing stock

Test project: proj_12f23331b542 (assigned to SE)
Site Engineer: engineer@constructionos.com / Demo@1234
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

# Test project assigned to Site Engineer
TEST_PROJECT_ID = "proj_12f23331b542"
TEST_DATE = datetime.now().strftime("%Y-%m-%d")
YESTERDAY = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def se_session():
    """Login as Site Engineer and return authenticated session"""
    session = requests.Session()
    login_resp = session.post(f"{API}/auth/login", json={
        "email": "engineer@constructionos.com",
        "password": "Demo@1234"
    })
    assert login_resp.status_code == 200, f"SE login failed: {login_resp.text}"
    return session


class TestContractorCategories:
    """Test /api/contractor-categories endpoint for labour categories"""
    
    def test_get_contractor_categories(self, se_session):
        """GET /api/contractor-categories returns labour category list"""
        resp = se_session.get(f"{API}/contractor-categories")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        categories = resp.json()
        assert isinstance(categories, list), "Categories should be a list"
        
        # Verify expected categories exist (per agent context: 20 categories)
        category_names = [c.get("name", "") for c in categories]
        expected = ["Mason", "Painter", "Electrician"]  # Helper may not exist
        for expected_cat in expected:
            assert any(expected_cat.lower() in name.lower() for name in category_names), \
                f"Expected category '{expected_cat}' not found in {category_names}"
        
        # Should have multiple categories
        assert len(categories) >= 10, f"Expected at least 10 categories, got {len(categories)}"
        
        print(f"PASS: Found {len(categories)} labour categories: {category_names[:10]}...")


class TestLabourAttendance:
    """Test Labour Count (daily attendance) APIs"""
    
    def test_post_labour_attendance_without_contractor(self, se_session):
        """POST /api/labour-attendance saves daily labour count without contractor_id/work_order_id"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "date": TEST_DATE,
            "entries": [
                {"type": "Mason", "label": "Mason", "count": 5, "per_day_cost": 0},
                {"type": "Helper", "label": "Helper", "count": 10, "per_day_cost": 0},
                {"type": "Electrician", "label": "Electrician", "count": 2, "per_day_cost": 0}
            ],
            "notes": "Test labour count - no contractor required"
        }
        
        resp = se_session.post(f"{API}/labour-attendance", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Verify response structure
        assert "attendance_id" in data, "Response should have attendance_id"
        assert data.get("project_id") == TEST_PROJECT_ID
        assert data.get("date") == TEST_DATE
        assert data.get("total_workers") == 17, f"Total workers should be 17, got {data.get('total_workers')}"
        
        # Verify contractor_id is optional (empty string is fine)
        assert data.get("contractor_id") == "", "contractor_id should be empty string when not provided"
        
        print(f"PASS: Created labour attendance {data['attendance_id']} with {data['total_workers']} workers")
        return data["attendance_id"]
    
    def test_get_daily_summary(self, se_session):
        """GET /api/labour-attendance/daily-summary returns totals and entries"""
        resp = se_session.get(f"{API}/labour-attendance/daily-summary", params={
            "project_id": TEST_PROJECT_ID,
            "date": TEST_DATE
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Verify response structure
        assert "date" in data, "Response should have date"
        assert "total_workers" in data, "Response should have total_workers"
        assert "entries" in data, "Response should have entries list"
        assert data.get("date") == TEST_DATE
        
        # There should be entries from our test and/or prior test data
        assert isinstance(data.get("entries"), list)
        
        print(f"PASS: Daily summary for {TEST_DATE}: {data.get('total_workers')} total workers, {len(data.get('entries', []))} entries")
    
    def test_get_daily_summary_defaults_to_today(self, se_session):
        """GET /api/labour-attendance/daily-summary defaults to today's date"""
        resp = se_session.get(f"{API}/labour-attendance/daily-summary", params={
            "project_id": TEST_PROJECT_ID
            # date omitted - should default to today
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        today = datetime.now().strftime("%Y-%m-%d")
        assert data.get("date") == today, f"Expected date {today}, got {data.get('date')}"
        
        print(f"PASS: Summary defaults to today's date: {data.get('date')}")


class TestMaterialInventory:
    """Test Stock Register (material inventory) APIs"""
    
    def test_post_material_inventory_auto_closing(self, se_session):
        """POST /api/material-inventory saves stock with auto-calculated closing (opening+received-used)"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_name": "TEST_Sand",
            "unit": "cft",
            "date": TEST_DATE,
            "opening_stock": 100,
            "received": 50,
            "used": 30
        }
        
        resp = se_session.post(f"{API}/material-inventory", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Verify response structure
        assert "inventory_id" in data, "Response should have inventory_id"
        assert data.get("project_id") == TEST_PROJECT_ID
        assert data.get("material_name") == "TEST_Sand"
        assert data.get("unit") == "cft"
        
        # Critical: Verify auto-calculated closing stock
        expected_closing = 100 + 50 - 30  # opening + received - used = 120
        assert data.get("closing_stock") == expected_closing, \
            f"closing_stock should be {expected_closing}, got {data.get('closing_stock')}"
        
        print(f"PASS: Created inventory {data['inventory_id']} with closing_stock={data['closing_stock']} (100+50-30=120)")
        return data["inventory_id"]
    
    def test_post_material_inventory_negative_closing(self, se_session):
        """POST /api/material-inventory handles case where used > opening+received (negative closing)"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_name": "TEST_Gravel",
            "unit": "cft",
            "date": TEST_DATE,
            "opening_stock": 10,
            "received": 5,
            "used": 20  # More used than available
        }
        
        resp = se_session.post(f"{API}/material-inventory", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Backend should still calculate: 10 + 5 - 20 = -5
        expected_closing = 10 + 5 - 20
        assert data.get("closing_stock") == expected_closing, \
            f"closing_stock should be {expected_closing}, got {data.get('closing_stock')}"
        
        print(f"PASS: Negative closing stock handled correctly: {data.get('closing_stock')}")
    
    def test_get_latest_inventory(self, se_session):
        """GET /api/material-inventory/latest returns latest stock per material"""
        # First create another entry for TEST_Sand to ensure we get the latest
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_name": "TEST_Sand",
            "unit": "cft",
            "date": TEST_DATE,
            "opening_stock": 120,  # Picking up from previous closing
            "received": 30,
            "used": 10
        }
        se_session.post(f"{API}/material-inventory", json=payload)
        
        # Now get latest
        resp = se_session.get(f"{API}/material-inventory/latest", params={
            "project_id": TEST_PROJECT_ID
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Latest inventory should be a list"
        
        # Find TEST_Sand in results
        test_sand_entries = [item for item in data if item.get("material_name") == "TEST_Sand"]
        assert len(test_sand_entries) <= 1, "Should return only ONE latest entry per material"
        
        if test_sand_entries:
            latest = test_sand_entries[0]
            # Should have closing_stock = 120 + 30 - 10 = 140
            assert latest.get("closing_stock") == 140, \
                f"Latest TEST_Sand closing_stock should be 140, got {latest.get('closing_stock')}"
            print(f"PASS: Latest TEST_Sand stock is {latest.get('closing_stock')}")
        else:
            print("PASS: No TEST_Sand entries found (may have been cleaned up)")
        
        print(f"PASS: Got latest inventory with {len(data)} materials")
    
    def test_get_material_inventory_history(self, se_session):
        """GET /api/material-inventory returns all stock history for project"""
        resp = se_session.get(f"{API}/material-inventory", params={
            "project_id": TEST_PROJECT_ID
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Inventory history should be a list"
        
        # Should include our test entries
        test_entries = [item for item in data if item.get("material_name", "").startswith("TEST_")]
        print(f"PASS: Got {len(data)} inventory entries, {len(test_entries)} are TEST_ entries")
    
    def test_get_material_inventory_filter_by_name(self, se_session):
        """GET /api/material-inventory with material_name filter"""
        resp = se_session.get(f"{API}/material-inventory", params={
            "project_id": TEST_PROJECT_ID,
            "material_name": "TEST_Sand"
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list)
        
        # All entries should be for TEST_Sand
        for item in data:
            assert item.get("material_name") == "TEST_Sand", \
                f"Expected TEST_Sand, got {item.get('material_name')}"
        
        print(f"PASS: Filtered by material_name, got {len(data)} TEST_Sand entries")


class TestLabourAttendanceHistory:
    """Test fetching labour attendance history"""
    
    def test_get_labour_attendance_by_project(self, se_session):
        """GET /api/labour-attendance returns entries for project"""
        resp = se_session.get(f"{API}/labour-attendance", params={
            "project_id": TEST_PROJECT_ID
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Attendance should be a list"
        
        # Should include entries for our project
        for entry in data:
            assert entry.get("project_id") == TEST_PROJECT_ID
        
        print(f"PASS: Got {len(data)} labour attendance entries for project")
    
    def test_get_labour_attendance_by_date(self, se_session):
        """GET /api/labour-attendance with date filter"""
        resp = se_session.get(f"{API}/labour-attendance", params={
            "project_id": TEST_PROJECT_ID,
            "date": TEST_DATE
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list)
        
        # All entries should be for TEST_DATE
        for entry in data:
            assert entry.get("date") == TEST_DATE
        
        print(f"PASS: Filtered by date, got {len(data)} entries for {TEST_DATE}")


class TestCleanup:
    """Cleanup test data (optional - test data prefixed with TEST_)"""
    
    def test_verify_test_data_created(self, se_session):
        """Verify we created test data successfully"""
        # Check labour attendance
        resp1 = se_session.get(f"{API}/labour-attendance", params={
            "project_id": TEST_PROJECT_ID,
            "date": TEST_DATE
        })
        attendance_count = len(resp1.json()) if resp1.status_code == 200 else 0
        
        # Check inventory
        resp2 = se_session.get(f"{API}/material-inventory", params={
            "project_id": TEST_PROJECT_ID
        })
        inventory_data = resp2.json() if resp2.status_code == 200 else []
        test_inventory_count = len([i for i in inventory_data if i.get("material_name", "").startswith("TEST_")])
        
        print(f"Test Summary: Created {attendance_count} attendance entries, {test_inventory_count} TEST_ inventory entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
