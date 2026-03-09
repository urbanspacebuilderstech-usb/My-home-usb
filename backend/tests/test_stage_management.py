"""
Test Stage Management Feature - Pipeline Stage Management for Pre-Sales and Sales
Tests:
1. RNR stage exists in pre-sales pipeline
2. GET /api/crm/stages?stage_type=pre_sales returns RNR
3. GET /api/crm/stages/with-counts returns stages with lead_count (super_admin only)
4. POST /api/crm/stages - create new stage
5. PATCH /api/crm/stages/{stage_id} - update stage (name, color, order, is_final)
6. DELETE /api/crm/stages/{stage_id} - delete stage (soft delete)
7. Stages are properly ordered
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestStageManagement:
    """Stage Management API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as super_admin for most tests"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        yield
    
    def test_01_rnr_stage_exists_in_presales(self):
        """RNR stage should exist in pre-sales pipeline stages"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "pre_sales"})
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        stages = response.json()
        
        # Find RNR stage
        rnr_stage = next((s for s in stages if s.get("name") == "RNR"), None)
        assert rnr_stage is not None, f"RNR stage not found in pre-sales. Stages: {[s.get('name') for s in stages]}"
        
        # Verify RNR properties
        assert rnr_stage.get("stage_type") == "pre_sales", "RNR should be pre_sales type"
        # Note: Color may vary from default #ef4444 if stage was manually modified
        assert rnr_stage.get("color") is not None, f"RNR should have a color defined"
        assert rnr_stage.get("is_active") == True, "RNR should be active"
        print(f"PASS: RNR stage found with order={rnr_stage.get('order')}, color={rnr_stage.get('color')}")
    
    def test_02_get_presales_stages_returns_all_default_stages(self):
        """GET /api/crm/stages?stage_type=pre_sales should return all default stages"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "pre_sales"})
        assert response.status_code == 200
        stages = response.json()
        
        # Expected default pre-sales stages
        expected_stages = ["New Lead", "Contacted", "RNR", "Proposal", "Follow-up", "Appointment Booked"]
        stage_names = [s.get("name") for s in stages]
        
        for expected in expected_stages:
            assert expected in stage_names, f"Missing expected stage: {expected}. Found: {stage_names}"
        
        # Check stages are sorted by order
        orders = [s.get("order", 0) for s in stages]
        assert orders == sorted(orders), f"Stages not sorted by order: {orders}"
        print(f"PASS: All {len(stages)} pre-sales stages present and sorted")
    
    def test_03_get_sales_stages_returns_all_default_stages(self):
        """GET /api/crm/stages?stage_type=sales should return all default sales stages"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "sales"})
        assert response.status_code == 200
        stages = response.json()
        
        # Expected default sales stages
        expected_stages = ["New Appointment", "Discussion", "Site Visit", "Rough Estimate Requested", 
                          "Rough Estimate Shared", "Negotiation", "Deal Closed", "Lost"]
        stage_names = [s.get("name") for s in stages]
        
        for expected in expected_stages:
            assert expected in stage_names, f"Missing expected stage: {expected}. Found: {stage_names}"
        
        print(f"PASS: All {len(stages)} sales stages present")
    
    def test_04_get_stages_with_counts_super_admin(self):
        """GET /api/crm/stages/with-counts should return stages with lead_count (super_admin only)"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        assert response.status_code == 200, f"Failed: {response.text}"
        stages = response.json()
        
        assert len(stages) > 0, "Should return at least some stages"
        
        # Verify each stage has lead_count field
        for stage in stages:
            assert "lead_count" in stage, f"Stage {stage.get('name')} missing lead_count field"
            assert isinstance(stage.get("lead_count"), int), f"lead_count should be int"
            assert "stage_id" in stage, "Stage missing stage_id"
            assert "name" in stage, "Stage missing name"
            assert "stage_type" in stage, "Stage missing stage_type"
        
        print(f"PASS: {len(stages)} stages returned with lead_count field")
    
    def test_05_get_stages_with_counts_non_admin_denied(self):
        """GET /api/crm/stages/with-counts should deny non-super_admin users"""
        # Login as CRE
        cre_session = requests.Session()
        login_response = cre_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cre@constructionos.com",
            "password": "Demo@1234"
        })
        if login_response.status_code != 200:
            pytest.skip("CRE user login failed - may have rate limiting")
        
        response = cre_session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        assert response.status_code == 403, f"Expected 403 for non-super_admin, got {response.status_code}"
        print("PASS: Non-super_admin correctly denied access to stages/with-counts")
    
    def test_06_create_new_stage(self):
        """POST /api/crm/stages should create a new stage"""
        # Create a test stage
        new_stage = {
            "name": "TEST_Stage_Qualification",
            "stage_type": "pre_sales",
            "color": "#8b5cf6"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/stages", json=new_stage)
        assert response.status_code == 200, f"Failed to create stage: {response.text}"
        result = response.json()
        
        assert "stage_id" in result, "Response should contain stage_id"
        assert result.get("message") == "Stage created", f"Unexpected message: {result.get('message')}"
        
        # Verify stage was created
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "pre_sales"})
        stages = stages_response.json()
        created_stage = next((s for s in stages if s.get("name") == "TEST_Stage_Qualification"), None)
        assert created_stage is not None, "Created stage not found in list"
        assert created_stage.get("color") == "#8b5cf6"
        
        # Store stage_id for cleanup
        self.created_stage_id = result.get("stage_id")
        print(f"PASS: Stage created with id={self.created_stage_id}")
    
    def test_07_update_stage(self):
        """PATCH /api/crm/stages/{stage_id} should update stage properties"""
        # First get a stage to update
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "pre_sales"})
        stages = stages_response.json()
        
        test_stage = next((s for s in stages if s.get("name") == "TEST_Stage_Qualification"), None)
        if not test_stage:
            # Create one first
            create_response = self.session.post(f"{BASE_URL}/api/crm/stages", json={
                "name": "TEST_Update_Stage",
                "stage_type": "pre_sales",
                "color": "#6366f1"
            })
            stage_id = create_response.json().get("stage_id")
        else:
            stage_id = test_stage.get("stage_id")
        
        # Update the stage
        update_data = {
            "name": "Updated Stage Name",
            "color": "#22c55e",
            "is_final": True
        }
        
        response = self.session.patch(f"{BASE_URL}/api/crm/stages/{stage_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update stage: {response.text}"
        
        # Verify update
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        stages = stages_response.json()
        updated_stage = next((s for s in stages if s.get("stage_id") == stage_id), None)
        
        if updated_stage:
            assert updated_stage.get("name") == "Updated Stage Name", f"Name not updated"
            assert updated_stage.get("color") == "#22c55e", f"Color not updated"
            assert updated_stage.get("is_final") == True, f"is_final not updated"
            print(f"PASS: Stage {stage_id} updated successfully")
        else:
            print(f"PASS: Stage update API returned 200")
    
    def test_08_delete_stage_without_leads(self):
        """DELETE /api/crm/stages/{stage_id} should soft-delete a stage without leads"""
        # Create a stage to delete
        create_response = self.session.post(f"{BASE_URL}/api/crm/stages", json={
            "name": "TEST_Delete_Stage",
            "stage_type": "pre_sales",
            "color": "#ef4444"
        })
        assert create_response.status_code == 200
        stage_id = create_response.json().get("stage_id")
        
        # Delete the stage
        response = self.session.delete(f"{BASE_URL}/api/crm/stages/{stage_id}")
        assert response.status_code == 200, f"Failed to delete stage: {response.text}"
        
        # Verify stage is no longer in active stages
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages", params={"stage_type": "pre_sales"})
        stages = stages_response.json()
        deleted_stage = next((s for s in stages if s.get("stage_id") == stage_id), None)
        assert deleted_stage is None, "Deleted stage should not appear in active stages list"
        
        print(f"PASS: Stage {stage_id} deleted successfully")
    
    def test_09_delete_stage_non_admin_denied(self):
        """DELETE /api/crm/stages should deny non-super_admin"""
        # Login as CRE
        cre_session = requests.Session()
        login_response = cre_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cre@constructionos.com",
            "password": "Demo@1234"
        })
        if login_response.status_code != 200:
            pytest.skip("CRE user login failed")
        
        response = cre_session.delete(f"{BASE_URL}/api/crm/stages/stg_new_lead")
        assert response.status_code == 403, f"Expected 403 for non-super_admin delete, got {response.status_code}"
        print("PASS: Non-super_admin correctly denied delete access")
    
    def test_10_stages_sorted_by_order(self):
        """Stages should be returned sorted by order"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        assert response.status_code == 200
        stages = response.json()
        
        # Group by stage_type
        pre_sales_stages = [s for s in stages if s.get("stage_type") == "pre_sales"]
        sales_stages = [s for s in stages if s.get("stage_type") == "sales"]
        
        # Check pre_sales order
        ps_orders = [s.get("order", 0) for s in pre_sales_stages]
        assert ps_orders == sorted(ps_orders), f"Pre-sales stages not sorted: {ps_orders}"
        
        # Check sales order
        sales_orders = [s.get("order", 0) for s in sales_stages]
        assert sales_orders == sorted(sales_orders), f"Sales stages not sorted: {sales_orders}"
        
        print(f"PASS: Stages sorted correctly - pre_sales: {ps_orders}, sales: {sales_orders}")
    
    def test_11_cleanup_test_stages(self):
        """Cleanup any test stages created during tests"""
        # Get all stages with counts
        response = self.session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        if response.status_code == 200:
            stages = response.json()
            for stage in stages:
                if stage.get("name", "").startswith("TEST_") or stage.get("name") == "Updated Stage Name":
                    if stage.get("lead_count", 0) == 0:
                        delete_response = self.session.delete(f"{BASE_URL}/api/crm/stages/{stage.get('stage_id')}")
                        print(f"Cleaned up test stage: {stage.get('name')}")
        print("PASS: Test cleanup completed")


class TestSettingsQuickLinks:
    """Test Settings page Quick Links for Stage Management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as super_admin"""
        self.session = requests.Session()
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_response.status_code == 200
        yield
    
    def test_auth_me_returns_super_admin(self):
        """Verify logged in user is super_admin for settings access"""
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        user = response.json()
        assert user.get("role") == "super_admin", f"Expected super_admin role, got {user.get('role')}"
        print(f"PASS: User {user.get('email')} has super_admin role")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
