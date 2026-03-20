"""
Test suite for Comprehensive Project View feature
Tests: Payment Stages CRUD, Additional Costs CRUD, Comprehensive View endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://labor-materials-hub.preview.emergentagent.com')
PROJECT_ID = "proj_classic001"
DEMO_EMAIL = "admin@constructionos.com"


class TestComprehensiveProjectView:
    """Test comprehensive project view endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with demo login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Demo login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": DEMO_EMAIL}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        print(f"Logged in as: {self.user['name']} ({self.user['role']})")
    
    def test_01_comprehensive_view_endpoint(self):
        """Test GET /projects/{project_id}/comprehensive returns all data"""
        response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "project" in data, "Missing project data"
        assert "boq_items" in data, "Missing boq_items"
        assert "payment_stages" in data, "Missing payment_stages"
        assert "additional_costs" in data, "Missing additional_costs"
        assert "summary" in data, "Missing summary"
        
        # Verify project data
        assert data["project"]["project_id"] == PROJECT_ID
        assert data["project"]["name"] == "Classic Condo"
        
        # Verify summary structure
        summary = data["summary"]
        assert "project_value" in summary
        assert "boq_total" in summary
        assert "payment_schedule_total" in summary
        assert "payment_schedule_received" in summary
        assert "additional_estimated" in summary
        assert "total_payments" in summary
        assert "total_expenses" in summary
        assert "cash_in_book" in summary
        
        print(f"✓ Comprehensive view loaded - Project: {data['project']['name']}")
        print(f"  - BOQ Items: {len(data['boq_items'])}")
        print(f"  - Payment Stages: {len(data['payment_stages'])}")
        print(f"  - Additional Costs: {len(data['additional_costs'])}")
        print(f"  - Project Value: ₹{summary['project_value']:,.0f}")
    
    def test_02_create_payment_stage(self):
        """Test POST /payment-stages creates a new payment stage"""
        stage_data = {
            "project_id": PROJECT_ID,
            "stage_name": f"TEST_Stage_{uuid.uuid4().hex[:6]}",
            "percentage": 10.0,
            "amount": 600000,
            "due_date": "2025-03-15"
        }
        
        response = self.session.post(f"{BASE_URL}/api/payment-stages", json=stage_data)
        assert response.status_code == 200, f"Failed to create payment stage: {response.text}"
        
        created = response.json()
        assert "stage_id" in created
        assert created["stage_name"] == stage_data["stage_name"]
        assert created["percentage"] == stage_data["percentage"]
        assert created["amount"] == stage_data["amount"]
        
        # Store for cleanup
        self.__class__.created_stage_id = created["stage_id"]
        print(f"✓ Created payment stage: {created['stage_id']}")
        
        # Verify in comprehensive view
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        assert verify_response.status_code == 200
        stages = verify_response.json()["payment_stages"]
        stage_ids = [s["stage_id"] for s in stages]
        assert created["stage_id"] in stage_ids, "Created stage not found in comprehensive view"
        print(f"✓ Verified stage appears in comprehensive view")
    
    def test_03_update_payment_stage_amount_received(self):
        """Test PATCH /payment-stages/{stage_id} updates amount_received"""
        stage_id = getattr(self.__class__, 'created_stage_id', None)
        if not stage_id:
            pytest.skip("No stage created in previous test")
        
        update_data = {"amount_received": 300000}
        response = self.session.patch(f"{BASE_URL}/api/payment-stages/{stage_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        stages = verify_response.json()["payment_stages"]
        updated_stage = next((s for s in stages if s["stage_id"] == stage_id), None)
        assert updated_stage is not None
        assert updated_stage["amount_received"] == 300000
        print(f"✓ Updated amount_received to ₹300,000")
    
    def test_04_delete_payment_stage(self):
        """Test DELETE /payment-stages/{stage_id} removes the stage"""
        stage_id = getattr(self.__class__, 'created_stage_id', None)
        if not stage_id:
            pytest.skip("No stage created in previous test")
        
        response = self.session.delete(f"{BASE_URL}/api/payment-stages/{stage_id}")
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        
        # Verify deletion
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        stages = verify_response.json()["payment_stages"]
        stage_ids = [s["stage_id"] for s in stages]
        assert stage_id not in stage_ids, "Stage still exists after deletion"
        print(f"✓ Deleted payment stage: {stage_id}")
    
    def test_05_create_additional_cost(self):
        """Test POST /additional-costs creates a new cost item"""
        cost_data = {
            "project_id": PROJECT_ID,
            "description": f"TEST_Extra_Work_{uuid.uuid4().hex[:6]}",
            "estimated_amount": 150000
        }
        
        response = self.session.post(f"{BASE_URL}/api/additional-costs", json=cost_data)
        assert response.status_code == 200, f"Failed to create additional cost: {response.text}"
        
        created = response.json()
        assert "cost_id" in created
        assert created["description"] == cost_data["description"]
        assert created["estimated_amount"] == cost_data["estimated_amount"]
        
        # Store for cleanup
        self.__class__.created_cost_id = created["cost_id"]
        print(f"✓ Created additional cost: {created['cost_id']}")
        
        # Verify in comprehensive view
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        costs = verify_response.json()["additional_costs"]
        cost_ids = [c["cost_id"] for c in costs]
        assert created["cost_id"] in cost_ids, "Created cost not found in comprehensive view"
        print(f"✓ Verified cost appears in comprehensive view")
    
    def test_06_update_additional_cost_actual_amount(self):
        """Test PATCH /additional-costs/{cost_id} updates actual_amount"""
        cost_id = getattr(self.__class__, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost created in previous test")
        
        update_data = {"actual_amount": 120000}
        response = self.session.patch(f"{BASE_URL}/api/additional-costs/{cost_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        costs = verify_response.json()["additional_costs"]
        updated_cost = next((c for c in costs if c["cost_id"] == cost_id), None)
        assert updated_cost is not None
        assert updated_cost["actual_amount"] == 120000
        print(f"✓ Updated actual_amount to ₹120,000")
    
    def test_07_update_additional_cost_income_received(self):
        """Test PATCH /additional-costs/{cost_id} updates income_received"""
        cost_id = getattr(self.__class__, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost created in previous test")
        
        update_data = {"income_received": 100000}
        response = self.session.patch(f"{BASE_URL}/api/additional-costs/{cost_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        costs = verify_response.json()["additional_costs"]
        updated_cost = next((c for c in costs if c["cost_id"] == cost_id), None)
        assert updated_cost is not None
        assert updated_cost["income_received"] == 100000
        print(f"✓ Updated income_received to ₹100,000")
    
    def test_08_delete_additional_cost(self):
        """Test DELETE /additional-costs/{cost_id} removes the cost item"""
        cost_id = getattr(self.__class__, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost created in previous test")
        
        response = self.session.delete(f"{BASE_URL}/api/additional-costs/{cost_id}")
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        
        # Verify deletion
        verify_response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        costs = verify_response.json()["additional_costs"]
        cost_ids = [c["cost_id"] for c in costs]
        assert cost_id not in cost_ids, "Cost still exists after deletion"
        print(f"✓ Deleted additional cost: {cost_id}")
    
    def test_09_summary_calculations(self):
        """Test that summary calculations are correct"""
        response = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        # Verify project value matches
        assert summary["project_value"] == data["project"]["total_value"]
        
        # Verify BOQ total calculation
        calculated_boq_total = sum(item.get("total_cost", 0) for item in data["boq_items"])
        assert summary["boq_total"] == calculated_boq_total
        
        # Verify payment schedule calculations
        calculated_ps_total = sum(s.get("amount", 0) for s in data["payment_stages"])
        calculated_ps_received = sum(s.get("amount_received", 0) for s in data["payment_stages"])
        assert summary["payment_schedule_total"] == calculated_ps_total
        assert summary["payment_schedule_received"] == calculated_ps_received
        assert summary["payment_schedule_balance"] == calculated_ps_total - calculated_ps_received
        
        # Verify additional cost calculations
        calculated_ac_estimated = sum(c.get("estimated_amount", 0) for c in data["additional_costs"])
        calculated_ac_actual = sum(c.get("actual_amount", 0) for c in data["additional_costs"])
        calculated_ac_income = sum(c.get("income_received", 0) for c in data["additional_costs"])
        assert summary["additional_estimated"] == calculated_ac_estimated
        assert summary["additional_actual"] == calculated_ac_actual
        assert summary["additional_income"] == calculated_ac_income
        
        print(f"✓ All summary calculations verified")
        print(f"  - Project Value: ₹{summary['project_value']:,.0f}")
        print(f"  - BOQ Total: ₹{summary['boq_total']:,.0f}")
        print(f"  - Cash in Book: ₹{summary['cash_in_book']:,.0f}")
    
    def test_10_project_not_found(self):
        """Test comprehensive view returns 404 for non-existent project"""
        response = self.session.get(f"{BASE_URL}/api/projects/nonexistent_project/comprehensive")
        assert response.status_code == 404
        print(f"✓ Returns 404 for non-existent project")


class TestPaymentStagePermissions:
    """Test permission checks for payment stage operations"""
    
    def test_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/comprehensive")
        assert response.status_code == 401
        print(f"✓ Unauthenticated request rejected with 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
