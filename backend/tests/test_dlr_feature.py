"""
Daily Labour Report (DLR) Feature Tests
Tests for DLR CRUD operations, auto cost calculation, and duplicate date check
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SITE_ENGINEER_EMAIL = "engineer@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"
PLANNING_EMAIL = "planning@constructionos.com"

# Known test data
TEST_PROJECT_ID = "proj_12f23331b542"
TEST_WORK_ORDER_ID = "wo_31d466c8"


class TestDLRBackend:
    """Test DLR backend API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_dlr_ids = []  # Track created DLRs for cleanup
        yield
        # Cleanup: Delete any DLRs created during tests
        self._cleanup_test_dlrs()
    
    def _cleanup_test_dlrs(self):
        """Clean up test DLRs after tests"""
        if not self.created_dlr_ids:
            return
        # Login as admin for cleanup
        self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ADMIN_EMAIL})
        for dlr_id, project_id, wo_id in self.created_dlr_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/projects/{project_id}/work-orders/{wo_id}/dlr/{dlr_id}")
            except:
                pass
    
    def _login_as(self, email):
        """Helper to login as a specific user"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        return response
    
    def _get_unique_date(self):
        """Generate a unique date for testing to avoid duplicate conflicts"""
        # Use a date far in the future to avoid conflicts with existing data
        base_date = datetime(2030, 1, 1)
        random_days = int(uuid.uuid4().hex[:4], 16) % 365
        test_date = base_date + timedelta(days=random_days)
        return test_date.strftime("%Y-%m-%d")
    
    # ==================== AUTH TESTS ====================
    
    def test_demo_login_site_engineer(self):
        """Test demo login as site engineer"""
        response = self._login_as(SITE_ENGINEER_EMAIL)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_id" in data or "email" in data
        print(f"✓ Site Engineer login successful: {data.get('email', data.get('name', 'OK'))}")
    
    def test_demo_login_admin(self):
        """Test demo login as admin"""
        response = self._login_as(ADMIN_EMAIL)
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_id" in data or "email" in data
        print(f"✓ Admin login successful: {data.get('email', data.get('name', 'OK'))}")
    
    # ==================== DLR CREATE TESTS ====================
    
    def test_create_dlr_success(self):
        """Test creating a DLR with valid data - auto cost calculation"""
        # Login as site engineer
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200, "Site engineer login failed"
        
        # First, get work orders for the project to find a valid one
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available for testing")
        
        work_orders = wo_resp.json()
        test_wo_id = work_orders[0].get("work_order_id", TEST_WORK_ORDER_ID)
        
        test_date = self._get_unique_date()
        
        # Create DLR with entries
        dlr_payload = {
            "date": test_date,
            "entries": [
                {"type": "skilled", "count": 5, "day_value": 1.0, "rate_per_day": 800},
                {"type": "semi_skilled", "count": 3, "day_value": 0.5, "rate_per_day": 600},
                {"type": "unskilled", "count": 10, "day_value": 1.5, "rate_per_day": 400}
            ],
            "notes": "Test DLR entry"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 200, f"Create DLR failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "dlr_id" in data, "DLR ID not returned"
        assert data["project_id"] == TEST_PROJECT_ID
        assert data["work_order_id"] == test_wo_id
        assert data["date"] == test_date
        
        # Verify auto cost calculation
        # skilled: 5 * 1.0 * 800 = 4000
        # semi_skilled: 3 * 0.5 * 600 = 900
        # unskilled: 10 * 1.5 * 400 = 6000
        # Total: 10900
        expected_total_cost = 4000 + 900 + 6000
        assert data["total_cost"] == expected_total_cost, f"Cost calculation wrong: expected {expected_total_cost}, got {data['total_cost']}"
        
        # Verify total workers
        expected_workers = 5 + 3 + 10
        assert data["total_workers"] == expected_workers, f"Worker count wrong: expected {expected_workers}, got {data['total_workers']}"
        
        # Verify total day units
        # skilled: 5 * 1.0 = 5
        # semi_skilled: 3 * 0.5 = 1.5
        # unskilled: 10 * 1.5 = 15
        # Total: 21.5
        expected_day_units = 5 + 1.5 + 15
        assert data["total_day_units"] == expected_day_units, f"Day units wrong: expected {expected_day_units}, got {data['total_day_units']}"
        
        # Track for cleanup
        self.created_dlr_ids.append((data["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        
        print(f"✓ DLR created successfully: {data['dlr_id']}")
        print(f"  - Total workers: {data['total_workers']}")
        print(f"  - Total day units: {data['total_day_units']}")
        print(f"  - Total cost: ₹{data['total_cost']}")
    
    def test_create_dlr_half_day(self):
        """Test DLR with half day (0.5) value"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        dlr_payload = {
            "date": test_date,
            "entries": [
                {"type": "skilled", "count": 4, "day_value": 0.5, "rate_per_day": 1000}
            ],
            "notes": "Half day test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 200, f"Create DLR failed: {response.text}"
        data = response.json()
        
        # 4 workers * 0.5 day * 1000 rate = 2000
        assert data["total_cost"] == 2000, f"Half day cost wrong: expected 2000, got {data['total_cost']}"
        assert data["total_day_units"] == 2.0, f"Day units wrong: expected 2.0, got {data['total_day_units']}"
        
        self.created_dlr_ids.append((data["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        print(f"✓ Half day DLR created: cost=₹{data['total_cost']}, day_units={data['total_day_units']}")
    
    def test_create_dlr_one_and_half_day(self):
        """Test DLR with 1.5 day value (overtime)"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        dlr_payload = {
            "date": test_date,
            "entries": [
                {"type": "unskilled", "count": 6, "day_value": 1.5, "rate_per_day": 500}
            ],
            "notes": "Overtime test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 200, f"Create DLR failed: {response.text}"
        data = response.json()
        
        # 6 workers * 1.5 day * 500 rate = 4500
        assert data["total_cost"] == 4500, f"1.5 day cost wrong: expected 4500, got {data['total_cost']}"
        assert data["total_day_units"] == 9.0, f"Day units wrong: expected 9.0, got {data['total_day_units']}"
        
        self.created_dlr_ids.append((data["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        print(f"✓ 1.5 day DLR created: cost=₹{data['total_cost']}, day_units={data['total_day_units']}")
    
    # ==================== DLR DUPLICATE DATE CHECK ====================
    
    def test_create_dlr_duplicate_date_rejected(self):
        """Test that duplicate DLR for same date is rejected"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        # Create first DLR
        dlr_payload = {
            "date": test_date,
            "entries": [{"type": "skilled", "count": 2, "day_value": 1.0, "rate_per_day": 700}],
            "notes": "First entry"
        }
        
        response1 = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        assert response1.status_code == 200, f"First DLR creation failed: {response1.text}"
        first_dlr = response1.json()
        self.created_dlr_ids.append((first_dlr["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        
        # Try to create second DLR for same date - should fail
        dlr_payload2 = {
            "date": test_date,  # Same date
            "entries": [{"type": "unskilled", "count": 5, "day_value": 1.0, "rate_per_day": 400}],
            "notes": "Duplicate entry"
        }
        
        response2 = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload2
        )
        
        assert response2.status_code == 400, f"Duplicate DLR should be rejected, got {response2.status_code}"
        error_data = response2.json()
        assert "already recorded" in error_data.get("detail", "").lower() or "duplicate" in error_data.get("detail", "").lower(), \
            f"Error message should mention duplicate: {error_data}"
        
        print(f"✓ Duplicate date DLR correctly rejected: {error_data.get('detail', 'Error')}")
    
    # ==================== DLR GET TESTS ====================
    
    def test_get_dlr_list(self):
        """Test getting DLR list for a work order"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        
        # Get DLR list
        response = self.session.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr"
        )
        
        assert response.status_code == 200, f"Get DLR list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ DLR list retrieved: {len(data)} entries")
        if data:
            print(f"  - Latest entry date: {data[0].get('date', 'N/A')}")
    
    def test_get_dlr_with_date_filter(self):
        """Test getting DLR with date filter"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        # Create a DLR first
        dlr_payload = {
            "date": test_date,
            "entries": [{"type": "skilled", "count": 3, "day_value": 1.0, "rate_per_day": 600}],
            "notes": "Filter test"
        }
        
        create_resp = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        if create_resp.status_code == 200:
            self.created_dlr_ids.append((create_resp.json()["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        
        # Get DLR with date filter
        response = self.session.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr?date={test_date}"
        )
        
        assert response.status_code == 200, f"Get DLR with filter failed: {response.text}"
        data = response.json()
        
        # All returned entries should match the filter date
        for entry in data:
            assert entry.get("date") == test_date, f"Date filter not working: got {entry.get('date')}"
        
        print(f"✓ DLR date filter working: {len(data)} entries for {test_date}")
    
    # ==================== DLR DELETE TESTS ====================
    
    def test_delete_dlr_success(self):
        """Test deleting a DLR entry"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        # Create a DLR to delete
        dlr_payload = {
            "date": test_date,
            "entries": [{"type": "skilled", "count": 2, "day_value": 1.0, "rate_per_day": 500}],
            "notes": "To be deleted"
        }
        
        create_resp = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        assert create_resp.status_code == 200, f"Create DLR failed: {create_resp.text}"
        dlr_id = create_resp.json()["dlr_id"]
        
        # Delete the DLR
        delete_resp = self.session.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr/{dlr_id}"
        )
        
        assert delete_resp.status_code == 200, f"Delete DLR failed: {delete_resp.text}"
        
        # Verify deletion - try to get the DLR list and check it's not there
        get_resp = self.session.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr?date={test_date}"
        )
        assert get_resp.status_code == 200
        dlr_list = get_resp.json()
        dlr_ids = [d.get("dlr_id") for d in dlr_list]
        assert dlr_id not in dlr_ids, "DLR should be deleted"
        
        print(f"✓ DLR deleted successfully: {dlr_id}")
    
    def test_delete_dlr_not_found(self):
        """Test deleting non-existent DLR returns 404"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        
        # Try to delete non-existent DLR
        fake_dlr_id = f"dlr_{uuid.uuid4().hex[:8]}"
        response = self.session.delete(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr/{fake_dlr_id}"
        )
        
        assert response.status_code == 404, f"Should return 404 for non-existent DLR, got {response.status_code}"
        print(f"✓ Non-existent DLR delete correctly returns 404")
    
    # ==================== DLR PROJECT SUMMARY TESTS ====================
    
    def test_get_project_dlr_summary(self):
        """Test getting project-wide DLR summary"""
        login_resp = self._login_as(PLANNING_EMAIL)
        assert login_resp.status_code == 200
        
        response = self.session.get(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/dlr/summary"
        )
        
        assert response.status_code == 200, f"Get DLR summary failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "project_id" in data
        assert "total_entries" in data
        assert "total_workers" in data
        assert "total_cost" in data
        assert "total_day_units" in data
        assert "by_contractor" in data
        assert "entries" in data
        
        print(f"✓ Project DLR summary retrieved:")
        print(f"  - Total entries: {data['total_entries']}")
        print(f"  - Total workers: {data['total_workers']}")
        print(f"  - Total cost: ₹{data['total_cost']}")
        print(f"  - Contractors: {list(data['by_contractor'].keys())}")
    
    # ==================== PERMISSION TESTS ====================
    
    def test_create_dlr_permission_denied_for_planning(self):
        """Test that planning role cannot create DLR"""
        login_resp = self._login_as(PLANNING_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        dlr_payload = {
            "date": test_date,
            "entries": [{"type": "skilled", "count": 2, "day_value": 1.0, "rate_per_day": 500}],
            "notes": "Should fail"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 403, f"Planning should not be able to create DLR, got {response.status_code}"
        print(f"✓ Planning role correctly denied DLR creation")
    
    def test_admin_can_create_dlr(self):
        """Test that admin can create DLR"""
        login_resp = self._login_as(ADMIN_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        dlr_payload = {
            "date": test_date,
            "entries": [{"type": "skilled", "count": 1, "day_value": 1.0, "rate_per_day": 500}],
            "notes": "Admin test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 200, f"Admin should be able to create DLR: {response.text}"
        data = response.json()
        self.created_dlr_ids.append((data["dlr_id"], TEST_PROJECT_ID, test_wo_id))
        print(f"✓ Admin can create DLR: {data['dlr_id']}")
    
    # ==================== VALIDATION TESTS ====================
    
    def test_create_dlr_empty_entries_rejected(self):
        """Test that DLR with no valid entries is rejected"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        # Try with empty entries
        dlr_payload = {
            "date": test_date,
            "entries": [],
            "notes": "Empty test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 400, f"Empty entries should be rejected, got {response.status_code}"
        print(f"✓ Empty entries correctly rejected")
    
    def test_create_dlr_zero_count_entries_rejected(self):
        """Test that DLR with all zero count entries is rejected"""
        login_resp = self._login_as(SITE_ENGINEER_EMAIL)
        assert login_resp.status_code == 200
        
        wo_resp = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        if wo_resp.status_code != 200 or not wo_resp.json():
            pytest.skip("No work orders available")
        
        test_wo_id = wo_resp.json()[0].get("work_order_id", TEST_WORK_ORDER_ID)
        test_date = self._get_unique_date()
        
        # Try with zero count entries
        dlr_payload = {
            "date": test_date,
            "entries": [
                {"type": "skilled", "count": 0, "day_value": 1.0, "rate_per_day": 500}
            ],
            "notes": "Zero count test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{test_wo_id}/dlr",
            json=dlr_payload
        )
        
        assert response.status_code == 400, f"Zero count entries should be rejected, got {response.status_code}"
        print(f"✓ Zero count entries correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
