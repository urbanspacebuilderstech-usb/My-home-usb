"""
Test Suite for Bulk Add and Approval Workflow
Tests: Bulk Scope Items, Payment Stages, Additions, Deductions
       Verification flow (requires 'VERIFY' code)
       Approval flow (Super Admin only)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBulkWorkflow:
    """Test bulk add, verification, and approval workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as super admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        assert self.user["role"] == "super_admin"
        
        # Use test project
        self.project_id = "proj_classic001"
        
        yield
        
        # Cleanup: Delete test items created during tests
        self._cleanup_test_items()
    
    def _cleanup_test_items(self):
        """Clean up test items created during tests"""
        # Get all items and delete ones with TEST_ prefix
        try:
            # Get scope items
            resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/full-details")
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("scope_items", []):
                    if item.get("item_name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/scope-items/{item['scope_id']}")
                for item in data.get("payment_stages", []):
                    if item.get("stage_name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/payment-stages/{item['stage_id']}")
                for item in data.get("additional_costs", []):
                    if item.get("description", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/additional-costs/{item['cost_id']}")
                for item in data.get("deductions", []):
                    if item.get("description", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/deductions/{item['deduction_id']}")
        except Exception as e:
            print(f"Cleanup error: {e}")

    # ==================== BULK SCOPE ITEMS TESTS ====================
    
    def test_bulk_scope_items_create(self):
        """Test POST /api/scope-items/bulk - Create multiple scope items"""
        unique_id = str(uuid.uuid4())[:8]
        items = [
            {"item_name": f"TEST_Foundation_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 100000, "remarks": "Test item 1"},
            {"item_name": f"TEST_Walls_{unique_id}", "quantity": 500, "unit": "Sqft", "unit_rate": 200, "remarks": "Test item 2"},
            {"item_name": f"TEST_Roofing_{unique_id}", "quantity": 1, "unit": "Lot", "unit_rate": 50000, "remarks": "Test item 3"}
        ]
        
        response = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": items
        })
        
        assert response.status_code == 200, f"Bulk scope create failed: {response.text}"
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 3
        
        # Verify items are in draft status
        for item in data["items"]:
            assert item["workflow_status"] == "draft"
            assert item["project_id"] == self.project_id
        
        # Store scope_ids for verification test
        self.created_scope_ids = [item["scope_id"] for item in data["items"]]
        print(f"Created {len(data['items'])} scope items in draft status")
    
    def test_bulk_scope_items_empty_rows_skipped(self):
        """Test that empty rows are skipped in bulk create"""
        unique_id = str(uuid.uuid4())[:8]
        items = [
            {"item_name": f"TEST_Valid_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 10000},
            {"item_name": "", "quantity": 1, "unit": "Nos", "unit_rate": 0},  # Empty - should skip
            {"item_name": f"TEST_Valid2_{unique_id}", "quantity": 2, "unit": "Sqft", "unit_rate": 500}
        ]
        
        response = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": items
        })
        
        assert response.status_code == 200
        data = response.json()
        # Only 2 valid items should be created
        assert len(data["items"]) == 2
        print("Empty rows correctly skipped")

    # ==================== BULK PAYMENT STAGES TESTS ====================
    
    def test_bulk_payment_stages_create(self):
        """Test POST /api/payment-stages/bulk - Create multiple payment stages"""
        unique_id = str(uuid.uuid4())[:8]
        items = [
            {"stage_name": f"TEST_Advance_{unique_id}", "percentage": 20, "amount": 100000, "due_date": "2026-02-01"},
            {"stage_name": f"TEST_Foundation_{unique_id}", "percentage": 30, "amount": 150000, "due_date": "2026-03-01"},
            {"stage_name": f"TEST_Completion_{unique_id}", "percentage": 50, "amount": 250000, "due_date": "2026-06-01"}
        ]
        
        response = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json={
            "project_id": self.project_id,
            "items": items
        })
        
        assert response.status_code == 200, f"Bulk payment create failed: {response.text}"
        data = response.json()
        assert len(data["items"]) == 3
        
        for item in data["items"]:
            assert item["workflow_status"] == "draft"
        
        print(f"Created {len(data['items'])} payment stages in draft status")

    # ==================== BULK ADDITIONS TESTS ====================
    
    def test_bulk_additions_create(self):
        """Test POST /api/additional-costs/bulk - Create multiple additions"""
        unique_id = str(uuid.uuid4())[:8]
        items = [
            {"description": f"TEST_Extra_Electrical_{unique_id}", "estimated_amount": 25000},
            {"description": f"TEST_Extra_Plumbing_{unique_id}", "estimated_amount": 15000},
            {"description": f"TEST_Extra_Painting_{unique_id}", "estimated_amount": 10000}
        ]
        
        response = self.session.post(f"{BASE_URL}/api/additional-costs/bulk", json={
            "project_id": self.project_id,
            "items": items
        })
        
        assert response.status_code == 200, f"Bulk additions create failed: {response.text}"
        data = response.json()
        assert len(data["items"]) == 3
        
        for item in data["items"]:
            assert item["workflow_status"] == "draft"
        
        print(f"Created {len(data['items'])} additions in draft status")

    # ==================== BULK DEDUCTIONS TESTS ====================
    
    def test_bulk_deductions_create(self):
        """Test POST /api/deductions/bulk - Create multiple deductions"""
        unique_id = str(uuid.uuid4())[:8]
        items = [
            {"description": f"TEST_Penalty_{unique_id}", "amount": 5000, "remarks": "Late delivery"},
            {"description": f"TEST_Discount_{unique_id}", "amount": 10000, "remarks": "Early payment discount"},
            {"description": f"TEST_Adjustment_{unique_id}", "amount": 2500, "remarks": "Material adjustment"}
        ]
        
        response = self.session.post(f"{BASE_URL}/api/deductions/bulk", json={
            "project_id": self.project_id,
            "items": items
        })
        
        assert response.status_code == 200, f"Bulk deductions create failed: {response.text}"
        data = response.json()
        assert len(data["items"]) == 3
        
        for item in data["items"]:
            assert item["workflow_status"] == "draft"
        
        print(f"Created {len(data['items'])} deductions in draft status")

    # ==================== VERIFICATION TESTS ====================
    
    def test_scope_verification_invalid_code(self):
        """Test verification fails with wrong code"""
        response = self.session.post(f"{BASE_URL}/api/scope-items/verify", json={
            "item_ids": ["test_id"],
            "verification_code": "WRONG"
        })
        
        assert response.status_code == 400
        assert "VERIFY" in response.json().get("detail", "")
        print("Verification correctly rejected invalid code")
    
    def test_scope_verification_success(self):
        """Test POST /api/scope-items/verify - Verify scope items with VERIFY code"""
        # First create items
        unique_id = str(uuid.uuid4())[:8]
        create_resp = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"item_name": f"TEST_Verify_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 50000}
            ]
        })
        assert create_resp.status_code == 200
        scope_ids = [item["scope_id"] for item in create_resp.json()["items"]]
        
        # Verify with correct code
        verify_resp = self.session.post(f"{BASE_URL}/api/scope-items/verify", json={
            "item_ids": scope_ids,
            "verification_code": "VERIFY"
        })
        
        assert verify_resp.status_code == 200, f"Verification failed: {verify_resp.text}"
        assert "Verified" in verify_resp.json().get("message", "")
        print("Scope items verified successfully")
    
    def test_payment_verification_success(self):
        """Test POST /api/payment-stages/verify"""
        unique_id = str(uuid.uuid4())[:8]
        create_resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"stage_name": f"TEST_VerifyPay_{unique_id}", "percentage": 10, "amount": 50000}
            ]
        })
        assert create_resp.status_code == 200
        stage_ids = [item["stage_id"] for item in create_resp.json()["items"]]
        
        verify_resp = self.session.post(f"{BASE_URL}/api/payment-stages/verify", json={
            "item_ids": stage_ids,
            "verification_code": "VERIFY"
        })
        
        assert verify_resp.status_code == 200
        print("Payment stages verified successfully")
    
    def test_addition_verification_success(self):
        """Test POST /api/additional-costs/verify"""
        unique_id = str(uuid.uuid4())[:8]
        create_resp = self.session.post(f"{BASE_URL}/api/additional-costs/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"description": f"TEST_VerifyAdd_{unique_id}", "estimated_amount": 25000}
            ]
        })
        assert create_resp.status_code == 200
        cost_ids = [item["cost_id"] for item in create_resp.json()["items"]]
        
        verify_resp = self.session.post(f"{BASE_URL}/api/additional-costs/verify", json={
            "item_ids": cost_ids,
            "verification_code": "VERIFY"
        })
        
        assert verify_resp.status_code == 200
        print("Additions verified successfully")
    
    def test_deduction_verification_success(self):
        """Test POST /api/deductions/verify"""
        unique_id = str(uuid.uuid4())[:8]
        create_resp = self.session.post(f"{BASE_URL}/api/deductions/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"description": f"TEST_VerifyDed_{unique_id}", "amount": 5000}
            ]
        })
        assert create_resp.status_code == 200
        deduction_ids = [item["deduction_id"] for item in create_resp.json()["items"]]
        
        verify_resp = self.session.post(f"{BASE_URL}/api/deductions/verify", json={
            "item_ids": deduction_ids,
            "verification_code": "VERIFY"
        })
        
        assert verify_resp.status_code == 200
        print("Deductions verified successfully")

    # ==================== APPROVAL TESTS (Super Admin) ====================
    
    def test_scope_approval_success(self):
        """Test POST /api/scope-items/approve - Super Admin approves scope items"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create and verify items first
        create_resp = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"item_name": f"TEST_Approve_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 75000}
            ]
        })
        assert create_resp.status_code == 200
        scope_ids = [item["scope_id"] for item in create_resp.json()["items"]]
        
        # Verify first
        self.session.post(f"{BASE_URL}/api/scope-items/verify", json={
            "item_ids": scope_ids,
            "verification_code": "VERIFY"
        })
        
        # Approve
        approve_resp = self.session.post(f"{BASE_URL}/api/scope-items/approve", json={
            "item_ids": scope_ids,
            "action": "approve"
        })
        
        assert approve_resp.status_code == 200, f"Approval failed: {approve_resp.text}"
        assert "Approved" in approve_resp.json().get("message", "")
        print("Scope items approved successfully")
    
    def test_scope_rejection_success(self):
        """Test POST /api/scope-items/approve with reject action"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create and verify items first
        create_resp = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"item_name": f"TEST_Reject_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 25000}
            ]
        })
        assert create_resp.status_code == 200
        scope_ids = [item["scope_id"] for item in create_resp.json()["items"]]
        
        # Verify first
        self.session.post(f"{BASE_URL}/api/scope-items/verify", json={
            "item_ids": scope_ids,
            "verification_code": "VERIFY"
        })
        
        # Reject
        reject_resp = self.session.post(f"{BASE_URL}/api/scope-items/approve", json={
            "item_ids": scope_ids,
            "action": "reject"
        })
        
        assert reject_resp.status_code == 200
        assert "Rejected" in reject_resp.json().get("message", "")
        print("Scope items rejected successfully")
    
    def test_payment_approval_success(self):
        """Test POST /api/payment-stages/approve"""
        unique_id = str(uuid.uuid4())[:8]
        
        create_resp = self.session.post(f"{BASE_URL}/api/payment-stages/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"stage_name": f"TEST_ApprovePay_{unique_id}", "percentage": 15, "amount": 75000}
            ]
        })
        assert create_resp.status_code == 200
        stage_ids = [item["stage_id"] for item in create_resp.json()["items"]]
        
        self.session.post(f"{BASE_URL}/api/payment-stages/verify", json={
            "item_ids": stage_ids,
            "verification_code": "VERIFY"
        })
        
        approve_resp = self.session.post(f"{BASE_URL}/api/payment-stages/approve", json={
            "item_ids": stage_ids,
            "action": "approve"
        })
        
        assert approve_resp.status_code == 200
        print("Payment stages approved successfully")
    
    def test_addition_approval_success(self):
        """Test POST /api/additional-costs/approve"""
        unique_id = str(uuid.uuid4())[:8]
        
        create_resp = self.session.post(f"{BASE_URL}/api/additional-costs/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"description": f"TEST_ApproveAdd_{unique_id}", "estimated_amount": 30000}
            ]
        })
        assert create_resp.status_code == 200
        cost_ids = [item["cost_id"] for item in create_resp.json()["items"]]
        
        self.session.post(f"{BASE_URL}/api/additional-costs/verify", json={
            "item_ids": cost_ids,
            "verification_code": "VERIFY"
        })
        
        approve_resp = self.session.post(f"{BASE_URL}/api/additional-costs/approve", json={
            "item_ids": cost_ids,
            "action": "approve"
        })
        
        assert approve_resp.status_code == 200
        print("Additions approved successfully")
    
    def test_deduction_approval_success(self):
        """Test POST /api/deductions/approve"""
        unique_id = str(uuid.uuid4())[:8]
        
        create_resp = self.session.post(f"{BASE_URL}/api/deductions/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"description": f"TEST_ApproveDed_{unique_id}", "amount": 7500}
            ]
        })
        assert create_resp.status_code == 200
        deduction_ids = [item["deduction_id"] for item in create_resp.json()["items"]]
        
        self.session.post(f"{BASE_URL}/api/deductions/verify", json={
            "item_ids": deduction_ids,
            "verification_code": "VERIFY"
        })
        
        approve_resp = self.session.post(f"{BASE_URL}/api/deductions/approve", json={
            "item_ids": deduction_ids,
            "action": "approve"
        })
        
        assert approve_resp.status_code == 200
        print("Deductions approved successfully")

    # ==================== PENDING APPROVALS TEST ====================
    
    def test_get_pending_approvals(self):
        """Test GET /api/approvals/pending - Super Admin only"""
        response = self.session.get(f"{BASE_URL}/api/approvals/pending")
        
        assert response.status_code == 200, f"Get pending approvals failed: {response.text}"
        data = response.json()
        
        assert "scope_items" in data
        assert "payment_stages" in data
        assert "additions" in data
        assert "deductions" in data
        assert "total_count" in data
        
        print(f"Pending approvals: {data['total_count']} total")

    # ==================== PERMISSION TESTS ====================
    
    def test_approval_denied_for_non_admin(self):
        """Test that non-super-admin cannot approve items"""
        # Login as project manager
        pm_session = requests.Session()
        pm_session.headers.update({"Content-Type": "application/json"})
        
        login_resp = pm_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        assert login_resp.status_code == 200
        
        # Try to approve - should fail
        approve_resp = pm_session.post(f"{BASE_URL}/api/scope-items/approve", json={
            "item_ids": ["test_id"],
            "action": "approve"
        })
        
        assert approve_resp.status_code == 403
        assert "Super Admin" in approve_resp.json().get("detail", "")
        print("Non-admin correctly denied approval access")
    
    def test_pending_approvals_denied_for_non_admin(self):
        """Test that non-super-admin cannot view pending approvals"""
        pm_session = requests.Session()
        pm_session.headers.update({"Content-Type": "application/json"})
        
        login_resp = pm_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        assert login_resp.status_code == 200
        
        response = pm_session.get(f"{BASE_URL}/api/approvals/pending")
        assert response.status_code == 403
        print("Non-admin correctly denied pending approvals access")


class TestWorkflowStatusTransitions:
    """Test workflow status transitions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200
        self.project_id = "proj_classic001"
        yield
    
    def test_full_workflow_draft_to_approved(self):
        """Test complete workflow: draft -> pending_approval -> approved"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Step 1: Create (draft)
        create_resp = self.session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "project_id": self.project_id,
            "items": [
                {"item_name": f"TEST_Workflow_{unique_id}", "quantity": 1, "unit": "Nos", "unit_rate": 100000}
            ]
        })
        assert create_resp.status_code == 200
        items = create_resp.json()["items"]
        assert items[0]["workflow_status"] == "draft"
        scope_id = items[0]["scope_id"]
        
        # Step 2: Verify (pending_approval)
        verify_resp = self.session.post(f"{BASE_URL}/api/scope-items/verify", json={
            "item_ids": [scope_id],
            "verification_code": "VERIFY"
        })
        assert verify_resp.status_code == 200
        
        # Verify status changed
        project_resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/full-details")
        scope_items = project_resp.json()["scope_items"]
        test_item = next((s for s in scope_items if s["scope_id"] == scope_id), None)
        assert test_item is not None
        assert test_item["workflow_status"] == "pending_approval"
        
        # Step 3: Approve (approved)
        approve_resp = self.session.post(f"{BASE_URL}/api/scope-items/approve", json={
            "item_ids": [scope_id],
            "action": "approve"
        })
        assert approve_resp.status_code == 200
        
        # Verify final status
        project_resp = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/full-details")
        scope_items = project_resp.json()["scope_items"]
        test_item = next((s for s in scope_items if s["scope_id"] == scope_id), None)
        assert test_item["workflow_status"] == "approved"
        
        print("Full workflow test passed: draft -> pending_approval -> approved")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/scope-items/{scope_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
