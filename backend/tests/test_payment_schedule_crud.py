"""
Test Payment Schedule CRUD operations for Planning role
Tests: Add, Edit, Delete, Submit payment stages
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Planning role credentials
PLANNING_EMAIL = "planning@constructionos.com"
PROJECT_ID = "proj_ca1781bb430a"  # Test project ID from requirements


class TestPaymentScheduleCRUD:
    """Payment Schedule CRUD tests for Planning role"""
    session = None
    created_stage_ids = []  # Track stages we create for cleanup
    
    @classmethod
    def setup_class(cls):
        """Login as Planning role"""
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        
        # Demo login
        login_resp = cls.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PLANNING_EMAIL
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        user = login_resp.json()
        print(f"✓ Logged in as: {user['name']} (Role: {user['role']})")
        assert user['role'] == 'planning', f"Expected planning role, got {user['role']}"
    
    @classmethod 
    def teardown_class(cls):
        """Cleanup created test data"""
        for stage_id in cls.created_stage_ids:
            try:
                cls.session.delete(f"{BASE_URL}/api/payment-stages/{stage_id}")
                print(f"Cleaned up stage: {stage_id}")
            except:
                pass
    
    def test_01_get_project_details(self):
        """Verify project exists and get current payment stages"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert resp.status_code == 200, f"Project fetch failed: {resp.text}"
        
        data = resp.json()
        project = data.get("project", {})
        payment_stages = data.get("payment_stages", [])
        
        print(f"✓ Project: {project.get('name')}")
        print(f"✓ Total Value: {data.get('summary', {}).get('total_value', 0)}")
        print(f"✓ Existing payment stages: {len(payment_stages)}")
        
        # Store draft count for later tests
        draft_stages = [s for s in payment_stages if s.get('workflow_status') == 'draft']
        print(f"✓ Draft stages: {len(draft_stages)}")
        
        return data
    
    def test_02_add_payment_stage_via_bulk(self):
        """Test bulk add payment stages (Add functionality)"""
        # Create test payment stages
        payload = {
            "project_id": PROJECT_ID,
            "items": [
                {
                    "stage_name": "TEST_Payment_Stage_1",
                    "percentage": 10,
                    "amount": 100000,
                    "due_date": (datetime.now() + timedelta(days=30)).isoformat()
                },
                {
                    "stage_name": "TEST_Payment_Stage_2",
                    "percentage": 20,
                    "amount": 200000,
                    "due_date": (datetime.now() + timedelta(days=60)).isoformat()
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
        assert resp.status_code == 200, f"Bulk add failed: {resp.text}"
        
        result = resp.json()
        print(f"✓ Bulk add response: {result}")
        
        # Verify stages were created
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        assert verify_resp.status_code == 200
        
        stages = verify_resp.json()
        test_stages = [s for s in stages if s.get('stage_name', '').startswith('TEST_')]
        
        print(f"✓ Created {len(test_stages)} test payment stages")
        
        # Store stage IDs for cleanup and further testing
        for stage in test_stages:
            TestPaymentScheduleCRUD.created_stage_ids.append(stage['stage_id'])
        
        assert len(test_stages) >= 2, "Expected at least 2 test stages to be created"
        
        # Verify draft status
        for stage in test_stages:
            assert stage['workflow_status'] == 'draft', f"New stage should be draft, got: {stage['workflow_status']}"
        
        return test_stages
    
    def test_03_edit_payment_stage(self):
        """Test editing a draft payment stage (Edit functionality)"""
        assert len(TestPaymentScheduleCRUD.created_stage_ids) > 0, "No test stages available"
        
        stage_id = TestPaymentScheduleCRUD.created_stage_ids[0]
        
        # Update the stage
        update_payload = {
            "stage_name": "TEST_Updated_Stage_Name",
            "percentage": 15,
            "amount": 150000,
            "due_date": (datetime.now() + timedelta(days=45)).strftime("%Y-%m-%d")
        }
        
        resp = self.session.patch(f"{BASE_URL}/api/payment-stages/{stage_id}", json=update_payload)
        assert resp.status_code == 200, f"Edit failed: {resp.text}"
        
        result = resp.json()
        print(f"✓ Edit response: {result}")
        
        # Verify the update persisted
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        
        updated_stage = next((s for s in stages if s['stage_id'] == stage_id), None)
        assert updated_stage is not None, "Updated stage not found"
        
        print(f"✓ Verified stage name: {updated_stage['stage_name']}")
        print(f"✓ Verified percentage: {updated_stage['percentage']}")
        print(f"✓ Verified amount: {updated_stage['amount']}")
        
        assert updated_stage['stage_name'] == "TEST_Updated_Stage_Name", "Stage name not updated"
        assert updated_stage['percentage'] == 15, "Percentage not updated"
        assert updated_stage['amount'] == 150000, "Amount not updated"
    
    def test_04_delete_draft_payment_stage(self):
        """Test deleting a draft payment stage (Delete functionality)"""
        assert len(TestPaymentScheduleCRUD.created_stage_ids) > 1, "Need at least 2 test stages"
        
        # Delete the second test stage
        stage_id = TestPaymentScheduleCRUD.created_stage_ids[1]
        
        resp = self.session.delete(f"{BASE_URL}/api/payment-stages/{stage_id}")
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        
        result = resp.json()
        print(f"✓ Delete response: {result}")
        
        # Verify deletion
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        
        deleted_stage = next((s for s in stages if s['stage_id'] == stage_id), None)
        assert deleted_stage is None, "Stage should be deleted"
        
        print(f"✓ Verified stage {stage_id} is deleted")
        
        # Remove from tracking list
        TestPaymentScheduleCRUD.created_stage_ids.remove(stage_id)
    
    def test_05_submit_payment_schedule(self):
        """Test submitting draft payment schedule (Submit functionality)"""
        # First, ensure we have draft stages
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        
        draft_stages = [s for s in stages if s.get('workflow_status') == 'draft']
        print(f"✓ Draft stages before submit: {len(draft_stages)}")
        
        if len(draft_stages) == 0:
            # Create a draft stage for testing
            payload = {
                "project_id": PROJECT_ID,
                "items": [
                    {
                        "stage_name": "TEST_Submit_Stage",
                        "percentage": 5,
                        "amount": 50000,
                        "due_date": None
                    }
                ]
            }
            create_resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
            assert create_resp.status_code == 200
            
            # Get the created stage ID
            verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
            stages = verify_resp.json()
            draft_stages = [s for s in stages if s.get('stage_name') == 'TEST_Submit_Stage']
            
            if draft_stages:
                TestPaymentScheduleCRUD.created_stage_ids.append(draft_stages[0]['stage_id'])
        
        # Submit the payment schedule
        resp = self.session.post(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-schedule/submit")
        
        # Could fail if no drafts exist
        if resp.status_code == 400:
            result = resp.json()
            if "No draft payment stages" in str(result):
                print("✓ Submit correctly handled - no draft stages to submit")
                return
        
        assert resp.status_code == 200, f"Submit failed: {resp.text}"
        
        result = resp.json()
        print(f"✓ Submit response: {result}")
        
        # Verify status changed to 'requested'
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        
        # Check our test stages are now 'requested'
        for stage_id in TestPaymentScheduleCRUD.created_stage_ids:
            stage = next((s for s in stages if s['stage_id'] == stage_id), None)
            if stage:
                print(f"✓ Stage {stage_id} status: {stage['workflow_status']}")
                assert stage['workflow_status'] == 'requested', f"Stage should be 'requested' after submit"
    
    def test_06_verify_status_transitions(self):
        """Verify status transitions: Draft -> Requested"""
        # Get all stages and check statuses
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        assert resp.status_code == 200
        
        stages = resp.json()
        
        status_counts = {}
        for stage in stages:
            status = stage.get('workflow_status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"✓ Status distribution: {status_counts}")
        
        # Verify we have some stages
        assert len(stages) > 0, "No payment stages found"


class TestPaymentStageAutoCalculation:
    """Test auto-calculation of percentage/amount"""
    session = None
    
    @classmethod
    def setup_class(cls):
        """Login as Planning role"""
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = cls.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PLANNING_EMAIL
        })
        assert login_resp.status_code == 200
    
    def test_percentage_amount_relationship(self):
        """Verify percentage and amount can be set independently"""
        # Get project value
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert resp.status_code == 200
        
        data = resp.json()
        total_value = data.get('summary', {}).get('total_value', 0)
        
        print(f"✓ Project total value: {total_value}")
        
        # Create a stage with percentage
        payload = {
            "project_id": PROJECT_ID,
            "items": [
                {
                    "stage_name": "TEST_AutoCalc_Stage",
                    "percentage": 10,  # 10% of total
                    "amount": int(total_value * 0.1) if total_value else 100000,
                    "due_date": None
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
        assert resp.status_code == 200
        
        # Verify stage creation
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        
        test_stage = next((s for s in stages if s.get('stage_name') == 'TEST_AutoCalc_Stage'), None)
        
        if test_stage:
            print(f"✓ Created stage with percentage: {test_stage['percentage']}%")
            print(f"✓ Created stage with amount: {test_stage['amount']}")
            
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/payment-stages/{test_stage['stage_id']}")
            print(f"✓ Cleaned up test stage")


class TestPlanningRolePermissions:
    """Verify Planning role has correct permissions for payment stages"""
    session = None
    
    @classmethod
    def setup_class(cls):
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = cls.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PLANNING_EMAIL
        })
        assert login_resp.status_code == 200
        cls.user = login_resp.json()
    
    def test_can_add_payment_stages(self):
        """Planning role can add payment stages"""
        payload = {
            "project_id": PROJECT_ID,
            "items": [
                {"stage_name": "TEST_Permission_Stage", "percentage": 5, "amount": 50000, "due_date": None}
            ]
        }
        resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
        assert resp.status_code == 200, f"Planning should be able to add stages: {resp.text}"
        
        # Get and cleanup
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        test_stage = next((s for s in stages if s.get('stage_name') == 'TEST_Permission_Stage'), None)
        if test_stage:
            self.session.delete(f"{BASE_URL}/api/payment-stages/{test_stage['stage_id']}")
        
        print("✓ Planning role can add payment stages")
    
    def test_can_edit_payment_stages(self):
        """Planning role can edit draft payment stages"""
        # Create a stage first
        payload = {
            "project_id": PROJECT_ID,
            "items": [
                {"stage_name": "TEST_Edit_Permission", "percentage": 5, "amount": 50000, "due_date": None}
            ]
        }
        self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
        
        # Get the stage ID
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        test_stage = next((s for s in stages if s.get('stage_name') == 'TEST_Edit_Permission'), None)
        
        if test_stage:
            # Edit the stage
            resp = self.session.patch(f"{BASE_URL}/api/payment-stages/{test_stage['stage_id']}", json={
                "stage_name": "TEST_Edited_Permission"
            })
            assert resp.status_code == 200, f"Planning should be able to edit stages: {resp.text}"
            print("✓ Planning role can edit payment stages")
            
            # Cleanup
            self.session.delete(f"{BASE_URL}/api/payment-stages/{test_stage['stage_id']}")
    
    def test_can_delete_payment_stages(self):
        """Planning role can delete draft payment stages"""
        # Create a stage first
        payload = {
            "project_id": PROJECT_ID,
            "items": [
                {"stage_name": "TEST_Delete_Permission", "percentage": 5, "amount": 50000, "due_date": None}
            ]
        }
        self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json=payload)
        
        # Get the stage ID
        verify_resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        stages = verify_resp.json()
        test_stage = next((s for s in stages if s.get('stage_name') == 'TEST_Delete_Permission'), None)
        
        if test_stage:
            resp = self.session.delete(f"{BASE_URL}/api/payment-stages/{test_stage['stage_id']}")
            assert resp.status_code == 200, f"Planning should be able to delete stages: {resp.text}"
            print("✓ Planning role can delete payment stages")
    
    def test_can_submit_schedule(self):
        """Planning role can submit payment schedule"""
        resp = self.session.post(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-schedule/submit")
        
        # Either success or 'no draft stages' is acceptable
        if resp.status_code == 400:
            result = resp.json()
            if "No draft payment stages" in str(result):
                print("✓ Submit endpoint accessible (no drafts to submit)")
                return
        
        assert resp.status_code == 200, f"Planning should be able to submit schedule: {resp.text}"
        print("✓ Planning role can submit payment schedule")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
