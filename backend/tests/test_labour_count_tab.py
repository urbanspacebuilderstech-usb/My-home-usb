"""
Test: Site Engineer Labour Count Tab - Redesigned
Tests for:
- GET /api/projects/{project_id}/assigned-contractors (returns contractors with labour_rates and work_orders)
- POST /api/contractors (accepts labour_rates field with type/label/rate objects)
- POST /api/labour-attendance (saves attendance with contractor_id and auto-calculates cost from rate*count)
- PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment (SE raises payment)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLabourCountAPI:
    """Test assigned contractors, labour attendance, and stage payment request APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as Site Engineer"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        assert response.status_code == 200, f"SE login failed: {response.text}"
        self.se_user = response.json()
        self.project_id = "proj_12f23331b542"
        yield
    
    def test_01_get_assigned_contractors_returns_data(self):
        """Test GET /api/projects/{project_id}/assigned-contractors returns contractors list"""
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        assert response.status_code == 200, f"API failed: {response.text}"
        
        contractors = response.json()
        assert isinstance(contractors, list), "Response should be a list"
        assert len(contractors) >= 2, f"Expected at least 2 contractors, got {len(contractors)}"
        print(f"PASS: Got {len(contractors)} assigned contractors")
    
    def test_02_assigned_contractors_have_labour_rates(self):
        """Test that contractors have labour_rates field with type/label/rate objects"""
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        assert response.status_code == 200
        
        contractors = response.json()
        contractors_with_rates = [c for c in contractors if c.get('labour_rates')]
        assert len(contractors_with_rates) >= 2, "Expected at least 2 contractors with labour_rates"
        
        # Validate structure of labour_rates
        for c in contractors_with_rates:
            for rate in c['labour_rates']:
                assert 'rate' in rate, f"Labour rate missing 'rate' field: {rate}"
                assert 'type' in rate or 'label' in rate, f"Labour rate missing type/label: {rate}"
                assert isinstance(rate['rate'], (int, float)), f"Rate should be numeric: {rate}"
        
        print(f"PASS: {len(contractors_with_rates)} contractors have valid labour_rates")
    
    def test_03_assigned_contractors_have_work_orders(self):
        """Test that contractors have work_orders with payment_stages"""
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        assert response.status_code == 200
        
        contractors = response.json()
        contractors_with_wos = [c for c in contractors if c.get('work_orders')]
        assert len(contractors_with_wos) >= 2, "Expected at least 2 contractors with work_orders"
        
        # Validate work order structure
        for c in contractors_with_wos:
            for wo in c['work_orders']:
                assert 'work_order_id' in wo, f"WO missing work_order_id"
                assert 'payment_stages' in wo, f"WO missing payment_stages"
                for stage in wo['payment_stages']:
                    assert 'stage_id' in stage, f"Stage missing stage_id"
                    assert 'status' in stage, f"Stage missing status"
                    assert 'amount' in stage, f"Stage missing amount"
        
        print(f"PASS: {len(contractors_with_wos)} contractors have valid work_orders with stages")
    
    def test_04_create_labour_attendance_calculates_cost(self):
        """Test POST /api/labour-attendance with contractor_id and auto-cost calculation"""
        test_date = datetime.now().strftime("%Y-%m-%d")
        
        # Create attendance entry
        payload = {
            "project_id": self.project_id,
            "contractor_id": "cont_5c2c2712",  # Raju Painters
            "contractor_name": "Raju Painters",
            "date": test_date,
            "entries": [
                {"type": "skilled", "label": "Skilled", "count": 3, "per_day_cost": 600},
                {"type": "unskilled", "label": "Unskilled", "count": 2, "per_day_cost": 400}
            ],
            "notes": "TEST attendance entry"
        }
        
        response = self.session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        assert response.status_code == 200, f"Create attendance failed: {response.text}"
        
        result = response.json()
        assert result.get('attendance_id'), "Missing attendance_id"
        assert result.get('contractor_id') == "cont_5c2c2712", "contractor_id not saved"
        
        # Verify auto-calculated total_cost (3*600 + 2*400 = 1800 + 800 = 2600)
        expected_cost = 3 * 600 + 2 * 400
        assert result.get('total_cost') == expected_cost, f"Expected total_cost {expected_cost}, got {result.get('total_cost')}"
        
        # Verify entries have 'total' field
        for entry in result.get('entries', []):
            assert 'total' in entry, f"Entry missing 'total' field: {entry}"
        
        print(f"PASS: Attendance created with auto-calculated cost ₹{result['total_cost']}")
    
    def test_05_get_labour_attendance_by_contractor(self):
        """Test GET /api/labour-attendance filtered by contractor_id"""
        response = self.session.get(
            f"{BASE_URL}/api/labour-attendance",
            params={"project_id": self.project_id, "contractor_id": "cont_5c2c2712"}
        )
        assert response.status_code == 200, f"GET attendance failed: {response.text}"
        
        entries = response.json()
        assert isinstance(entries, list), "Response should be a list"
        
        # All entries should be for this contractor
        for entry in entries:
            assert entry.get('contractor_id') == "cont_5c2c2712", f"Entry has wrong contractor_id: {entry}"
        
        print(f"PASS: Got {len(entries)} attendance entries for contractor")
    
    def test_06_request_stage_payment(self):
        """Test PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment"""
        # First get contractors to find a pending stage
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        assert response.status_code == 200
        
        contractors = response.json()
        test_wo_id = None
        test_stage_id = None
        test_amount = 0
        
        for c in contractors:
            for wo in c.get('work_orders', []):
                for stage in wo.get('payment_stages', []):
                    if stage['status'] == 'pending':
                        test_wo_id = wo['work_order_id']
                        test_stage_id = stage['stage_id']
                        test_amount = stage['amount']
                        break
                if test_wo_id:
                    break
            if test_wo_id:
                break
        
        if not test_wo_id:
            pytest.skip("No pending stage found to test payment request")
        
        # Request payment
        response = self.session.patch(
            f"{BASE_URL}/api/labour-work-orders/{test_wo_id}/stages/{test_stage_id}/request-payment",
            json={"requested_amount": test_amount, "notes": "TEST payment request"}
        )
        assert response.status_code == 200, f"Request payment failed: {response.text}"
        
        result = response.json()
        assert 'message' in result, f"Expected message in response: {result}"
        
        # Verify the stage status changed
        response2 = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        contractors2 = response2.json()
        
        found_stage = None
        for c in contractors2:
            for wo in c.get('work_orders', []):
                if wo['work_order_id'] == test_wo_id:
                    for stage in wo.get('payment_stages', []):
                        if stage['stage_id'] == test_stage_id:
                            found_stage = stage
                            break
        
        assert found_stage, f"Stage {test_stage_id} not found after payment request"
        assert found_stage['status'] == 'requested', f"Expected status 'requested', got {found_stage['status']}"
        
        print(f"PASS: Payment requested for stage {test_stage_id}, status changed to 'requested'")
    
    def test_07_request_payment_on_already_requested_fails(self):
        """Test that requesting payment on already-requested stage returns 400"""
        # Get contractors to find a requested stage
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/assigned-contractors")
        contractors = response.json()
        
        test_wo_id = None
        test_stage_id = None
        
        for c in contractors:
            for wo in c.get('work_orders', []):
                for stage in wo.get('payment_stages', []):
                    if stage['status'] == 'requested':
                        test_wo_id = wo['work_order_id']
                        test_stage_id = stage['stage_id']
                        break
                if test_wo_id:
                    break
            if test_wo_id:
                break
        
        if not test_wo_id:
            pytest.skip("No requested stage found")
        
        # Try to request payment again - should fail
        response = self.session.patch(
            f"{BASE_URL}/api/labour-work-orders/{test_wo_id}/stages/{test_stage_id}/request-payment",
            json={"requested_amount": 50000}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"PASS: Correctly blocked duplicate payment request")


class TestContractorLabourRates:
    """Test contractor creation with labour_rates field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as Planning user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Planning
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "planning@constructionos.com",
            "password": "Demo@1234"
        })
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        yield
    
    def test_create_contractor_with_labour_rates(self):
        """Test POST /api/contractors accepts labour_rates field"""
        unique_id = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_Contractor_LR_{unique_id}",
            "contractor_type": "Mason",
            "phone": "9999000111",
            "labour_rates": [
                {"type": "skilled", "label": "Skilled Mason", "rate": 850},
                {"type": "helper", "label": "Helper", "rate": 500}
            ],
            "categories": ["Mason"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/contractors", json=payload)
        assert response.status_code == 200, f"Create contractor failed: {response.text}"
        
        result = response.json()
        assert result.get('contractor_id'), "Missing contractor_id"
        assert result.get('labour_rates'), "Missing labour_rates"
        assert len(result['labour_rates']) == 2, f"Expected 2 labour_rates, got {len(result['labour_rates'])}"
        
        # Verify each rate
        for rate in result['labour_rates']:
            assert rate.get('type'), "Missing type in labour_rate"
            assert rate.get('label'), "Missing label in labour_rate"
            assert rate.get('rate'), "Missing rate in labour_rate"
        
        print(f"PASS: Created contractor {result['contractor_id']} with labour_rates")
        
        # Cleanup: Deactivate test contractor
        self.session.delete(f"{BASE_URL}/api/contractors/{result['contractor_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
