"""
DLR Redesign Tests - Testing the new 3 fixed rows (Skilled, Semi-Skilled, Unskilled) 
with pre-filled rates from work order's labour_rates field
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestWorkOrderLabourRates:
    """Test work order labour_rates field storage and retrieval"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        # Login as planning user
        resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        self.project_id = "proj_12f23331b542"
        self.work_order_id = "wo_31d466c8"
    
    def test_get_work_order_returns_labour_rates(self):
        """GET work-orders should return labour_rates in response"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}")
        assert resp.status_code == 200, f"Failed to get work order: {resp.text}"
        
        data = resp.json()
        assert "labour_rates" in data, "labour_rates field missing from work order response"
        
        labour_rates = data["labour_rates"]
        assert labour_rates is not None, "labour_rates should not be None"
        assert "skilled" in labour_rates, "skilled rate missing"
        assert "semi_skilled" in labour_rates, "semi_skilled rate missing"
        assert "unskilled" in labour_rates, "unskilled rate missing"
        
        # Verify the expected values for wo_31d466c8
        assert labour_rates["skilled"] == 900.0, f"Expected skilled=900, got {labour_rates['skilled']}"
        assert labour_rates["semi_skilled"] == 650.0, f"Expected semi_skilled=650, got {labour_rates['semi_skilled']}"
        assert labour_rates["unskilled"] == 450.0, f"Expected unskilled=450, got {labour_rates['unskilled']}"
        print(f"✓ Work order labour_rates: {labour_rates}")
    
    def test_get_all_work_orders_returns_labour_rates(self):
        """GET all work orders should include labour_rates for each"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders")
        assert resp.status_code == 200, f"Failed to get work orders: {resp.text}"
        
        data = resp.json()
        assert len(data) > 0, "No work orders found"
        
        # Check that at least one work order has labour_rates
        wo_with_rates = [wo for wo in data if wo.get("labour_rates") and wo["labour_rates"].get("skilled", 0) > 0]
        assert len(wo_with_rates) > 0, "No work orders with labour_rates found"
        print(f"✓ Found {len(wo_with_rates)} work orders with labour_rates set")


class TestDLRCRUD:
    """Test DLR create/list/delete operations with the new 3 fixed rows format"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        # Login as site engineer (can record DLR)
        resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        self.project_id = "proj_12f23331b542"
        self.work_order_id = "wo_31d466c8"
        self.test_dlr_id = None
    
    def test_list_dlr_entries(self):
        """GET DLR entries for a work order"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr")
        assert resp.status_code == 200, f"Failed to list DLR: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "DLR response should be a list"
        print(f"✓ Found {len(data)} DLR entries")
        
        if len(data) > 0:
            entry = data[0]
            assert "dlr_id" in entry, "dlr_id missing"
            assert "date" in entry, "date missing"
            assert "entries" in entry, "entries missing"
            assert "total_workers" in entry, "total_workers missing"
            assert "total_cost" in entry, "total_cost missing"
            print(f"✓ DLR entry structure valid: {entry.get('dlr_id')}")
    
    def test_create_dlr_with_fixed_rows(self):
        """Create DLR with the new 3 fixed rows format (skilled, semi_skilled, unskilled)"""
        # Use a unique date to avoid duplicate error
        test_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        payload = {
            "date": test_date,
            "entries": [
                {"type": "skilled", "count": 5, "day_value": 1.0, "rate_per_day": 900},
                {"type": "semi_skilled", "count": 3, "day_value": 0.5, "rate_per_day": 650},
                {"type": "unskilled", "count": 10, "day_value": 1.5, "rate_per_day": 450}
            ],
            "notes": "Test DLR entry for redesign testing"
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr",
            json=payload
        )
        
        # If duplicate date, try another date
        if resp.status_code == 400 and "already recorded" in resp.text:
            test_date = (datetime.now() + timedelta(days=31)).strftime("%Y-%m-%d")
            payload["date"] = test_date
            resp = self.session.post(
                f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr",
                json=payload
            )
        
        assert resp.status_code == 200, f"Failed to create DLR: {resp.text}"
        
        data = resp.json()
        assert "dlr_id" in data, "dlr_id missing from response"
        self.test_dlr_id = data["dlr_id"]
        
        # Verify calculations
        # skilled: 5 × 1.0 × 900 = 4500
        # semi_skilled: 3 × 0.5 × 650 = 975
        # unskilled: 10 × 1.5 × 450 = 6750
        # Total: 12225
        expected_total = 4500 + 975 + 6750
        assert data.get("total_cost") == expected_total, f"Expected total_cost={expected_total}, got {data.get('total_cost')}"
        assert data.get("total_workers") == 18, f"Expected total_workers=18, got {data.get('total_workers')}"
        
        print(f"✓ Created DLR {self.test_dlr_id} with total_cost={data.get('total_cost')}")
        
        # Cleanup - delete the test entry
        if self.test_dlr_id:
            del_resp = self.session.delete(
                f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr/{self.test_dlr_id}"
            )
            assert del_resp.status_code == 200, f"Failed to delete test DLR: {del_resp.text}"
            print(f"✓ Cleaned up test DLR {self.test_dlr_id}")
    
    def test_dlr_entry_types_validation(self):
        """Verify DLR entries have correct types (skilled, semi_skilled, unskilled)"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr")
        assert resp.status_code == 200
        
        data = resp.json()
        if len(data) > 0:
            entry = data[0]
            entries = entry.get("entries", [])
            
            valid_types = {"skilled", "semi_skilled", "unskilled"}
            for e in entries:
                assert e.get("type") in valid_types, f"Invalid entry type: {e.get('type')}"
                assert "count" in e, "count missing from entry"
                assert "day_value" in e, "day_value missing from entry"
                assert "rate_per_day" in e, "rate_per_day missing from entry"
                assert "total_cost" in e, "total_cost missing from entry"
            
            print(f"✓ DLR entry types valid: {[e.get('type') for e in entries]}")
    
    def test_dlr_date_filter(self):
        """Test DLR date filter parameter"""
        # Get existing DLR to find a valid date
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr")
        assert resp.status_code == 200
        
        data = resp.json()
        if len(data) > 0:
            test_date = data[0].get("date")
            
            # Filter by that date
            resp_filtered = self.session.get(
                f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr?date={test_date}"
            )
            assert resp_filtered.status_code == 200
            
            filtered_data = resp_filtered.json()
            assert len(filtered_data) >= 1, "Date filter should return at least 1 entry"
            assert all(e.get("date") == test_date for e in filtered_data), "All entries should match filter date"
            print(f"✓ Date filter working for {test_date}")


class TestDLRCalculations:
    """Test DLR cost calculations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert resp.status_code == 200
        self.project_id = "proj_12f23331b542"
        self.work_order_id = "wo_31d466c8"
    
    def test_row_total_calculation(self):
        """Verify row total = count × day_value × rate_per_day"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr")
        assert resp.status_code == 200
        
        data = resp.json()
        if len(data) > 0:
            entry = data[0]
            for e in entry.get("entries", []):
                expected_total = e.get("count", 0) * e.get("day_value", 1) * e.get("rate_per_day", 0)
                actual_total = e.get("total_cost", 0)
                assert abs(actual_total - expected_total) < 0.01, f"Row total mismatch: expected {expected_total}, got {actual_total}"
            print("✓ Row total calculations correct")
    
    def test_grand_total_calculation(self):
        """Verify grand total = sum of all row totals"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/work-orders/{self.work_order_id}/dlr")
        assert resp.status_code == 200
        
        data = resp.json()
        if len(data) > 0:
            entry = data[0]
            entries = entry.get("entries", [])
            
            calculated_total = sum(e.get("total_cost", 0) for e in entries)
            reported_total = entry.get("total_cost", 0)
            
            assert abs(calculated_total - reported_total) < 0.01, f"Grand total mismatch: calculated {calculated_total}, reported {reported_total}"
            print(f"✓ Grand total calculation correct: {reported_total}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
