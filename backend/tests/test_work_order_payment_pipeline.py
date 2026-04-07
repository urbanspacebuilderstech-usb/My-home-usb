"""
Test Work Order Payment Approval Pipeline
Tests: 4-level approval: Site Engineer Request -> PM Approve -> Planning Approve -> Accountant Process
Endpoints:
- PATCH /api/projects/{project_id}/work-orders/{wo_id}/stages/{stage_id}/request-payment
- PATCH /api/projects/{project_id}/work-orders/{wo_id}/stages/{stage_id}/approve
- PATCH /api/projects/{project_id}/work-orders/{wo_id}/stages/{stage_id}/revert
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test project from main agent context
TEST_PROJECT_ID = "proj_12f23331b542"
# Existing test work order with stages
EXISTING_WO_ID = "wo_1787c639"
EXISTING_STAGES = {
    "approved": "wos_4663c9",
    "requested": "wos_a57a0b",
    "pending": "wos_b639af"
}

@pytest.fixture(scope="module")
def planning_session():
    """Login as planning user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
    assert resp.status_code == 200, f"Planning login failed: {resp.text}"
    return session

@pytest.fixture(scope="module")
def site_engineer_session():
    """Login as site engineer user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
    assert resp.status_code == 200, f"Site Engineer login failed: {resp.text}"
    return session

@pytest.fixture(scope="module")
def pm_session():
    """Login as project manager user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "pm@constructionos.com"})
    assert resp.status_code == 200, f"PM login failed: {resp.text}"
    return session

@pytest.fixture(scope="module")
def accountant_session():
    """Login as accountant user"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
    assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
    return session


class TestWorkOrderExists:
    """Verify test work order exists before running pipeline tests"""
    
    def test_existing_work_order_exists(self, planning_session):
        """Verify the existing test work order exists"""
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{EXISTING_WO_ID}")
        if resp.status_code == 404:
            pytest.skip(f"Test work order {EXISTING_WO_ID} not found - skipping pipeline tests")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        wo = resp.json()
        print(f"Found work order: {wo['work_order_id']} - {wo.get('contractor_name', 'Unknown')}")
        print(f"Stages: {[(s.get('stage_id'), s.get('name'), s.get('status')) for s in wo.get('stages', [])]}")


class TestPaymentRequestEndpoint:
    """Test PATCH /api/projects/{project_id}/work-orders/{wo_id}/stages/{stage_id}/request-payment"""
    
    @pytest.fixture(scope="class")
    def test_work_order(self, planning_session):
        """Create a test work order for payment pipeline testing"""
        # Get a contractor
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        if not active_contractors:
            pytest.skip("No active contractors found")
        contractor_id = active_contractors[0]['contractor_id']
        
        # Create work order with stages
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_PIPELINE Payment pipeline test",
            "scope_items": [
                {"name": "Test Work", "unit": "nos", "quantity": 10, "unit_rate": 1000}
            ],
            "stages": [
                {"name": "Stage 1 - 30%", "type": "percentage", "value": 30},
                {"name": "Stage 2 - 70%", "type": "percentage", "value": 70}
            ],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        assert resp.status_code == 200, f"Failed to create test work order: {resp.text}"
        
        wo_id = resp.json()['work_order_id']
        
        # Fetch to get stage IDs
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        
        yield wo
        
        # Cleanup
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
    
    def test_site_engineer_can_request_payment(self, site_engineer_session, test_work_order):
        """Test that site engineer can request payment for a pending stage"""
        wo_id = test_work_order['work_order_id']
        stage_id = test_work_order['stages'][0]['stage_id']
        
        resp = site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"notes": "Work completed, requesting payment"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "message" in data
        print(f"Payment request successful: {data['message']}")
        
    def test_stage_status_changes_to_requested(self, planning_session, test_work_order):
        """Verify stage status changed to 'requested' after payment request"""
        wo_id = test_work_order['work_order_id']
        
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = resp.json()
        
        stage = wo['stages'][0]
        assert stage['status'] == 'requested', f"Expected status 'requested', got '{stage['status']}'"
        assert stage.get('requested_by') is not None, "requested_by should be set"
        assert stage.get('requested_at') is not None, "requested_at should be set"
        print(f"Stage status verified: {stage['status']}")
        
    def test_cannot_request_payment_for_non_pending_stage(self, site_engineer_session, test_work_order):
        """Test that payment cannot be requested for a stage that's not pending"""
        wo_id = test_work_order['work_order_id']
        stage_id = test_work_order['stages'][0]['stage_id']  # Already requested
        
        resp = site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"notes": "Trying again"}
        )
        assert resp.status_code == 400, f"Expected 400 for already requested stage, got {resp.status_code}"
        print("Correctly rejected duplicate payment request")


class TestApprovalPipeline:
    """Test the 4-level approval pipeline"""
    
    @pytest.fixture(scope="class")
    def pipeline_work_order(self, planning_session, site_engineer_session):
        """Create a work order and request payment for pipeline testing"""
        # Get a contractor
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        contractor_id = active_contractors[0]['contractor_id']
        
        # Create work order
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_APPROVAL_PIPELINE Full pipeline test",
            "scope_items": [
                {"name": "Pipeline Test Work", "unit": "nos", "quantity": 10, "unit_rate": 1000}
            ],
            "stages": [
                {"name": "Pipeline Stage", "type": "percentage", "value": 100}
            ],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        wo_id = resp.json()['work_order_id']
        
        # Fetch to get stage ID
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage_id = wo['stages'][0]['stage_id']
        
        # Site engineer requests payment
        site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"notes": "Pipeline test - requesting payment"}
        )
        
        yield {"wo_id": wo_id, "stage_id": stage_id}
        
        # Cleanup
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
    
    def test_pm_can_approve_requested_stage(self, pm_session, planning_session, pipeline_work_order):
        """Test PM can approve a stage in 'requested' status"""
        wo_id = pipeline_work_order['wo_id']
        stage_id = pipeline_work_order['stage_id']
        
        resp = pm_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/approve",
            json={"action": "approve", "notes": "PM approved"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify status changed to pm_approved
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage = wo['stages'][0]
        
        assert stage['status'] == 'pm_approved', f"Expected 'pm_approved', got '{stage['status']}'"
        assert stage.get('pm_approved_by') is not None
        print(f"PM approval successful, status: {stage['status']}")
        
    def test_planning_can_approve_pm_approved_stage(self, planning_session, pipeline_work_order):
        """Test Planning can approve a stage in 'pm_approved' status"""
        wo_id = pipeline_work_order['wo_id']
        stage_id = pipeline_work_order['stage_id']
        
        resp = planning_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/approve",
            json={"action": "approve", "notes": "Planning approved"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify status changed to planning_approved
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage = wo['stages'][0]
        
        assert stage['status'] == 'planning_approved', f"Expected 'planning_approved', got '{stage['status']}'"
        assert stage.get('planning_approved_by') is not None
        print(f"Planning approval successful, status: {stage['status']}")
        
    def test_accountant_can_process_planning_approved_stage(self, accountant_session, planning_session, pipeline_work_order):
        """Test Accountant can process (final approve) a stage in 'planning_approved' status"""
        wo_id = pipeline_work_order['wo_id']
        stage_id = pipeline_work_order['stage_id']
        
        resp = accountant_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/approve",
            json={"action": "approve", "notes": "Payment processed", "approved_amount": 10000}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify status changed to approved (paid)
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage = wo['stages'][0]
        
        assert stage['status'] == 'approved', f"Expected 'approved', got '{stage['status']}'"
        assert stage.get('approved_amount') == 10000, f"Expected approved_amount 10000, got {stage.get('approved_amount')}"
        assert wo.get('paid_amount', 0) > 0, "paid_amount should be updated"
        print(f"Accountant processing successful, status: {stage['status']}, paid: {wo.get('paid_amount')}")


class TestRejectAndRevert:
    """Test rejection and revert functionality"""
    
    @pytest.fixture(scope="class")
    def reject_test_work_order(self, planning_session, site_engineer_session):
        """Create a work order for rejection testing"""
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        contractor_id = active_contractors[0]['contractor_id']
        
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_REJECT Rejection test",
            "scope_items": [
                {"name": "Reject Test Work", "unit": "nos", "quantity": 5, "unit_rate": 2000}
            ],
            "stages": [
                {"name": "Reject Stage", "type": "percentage", "value": 100}
            ],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        wo_id = resp.json()['work_order_id']
        
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage_id = wo['stages'][0]['stage_id']
        
        # Request payment
        site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"notes": "Requesting for rejection test"}
        )
        
        yield {"wo_id": wo_id, "stage_id": stage_id}
        
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
    
    def test_pm_can_reject_stage(self, pm_session, planning_session, reject_test_work_order):
        """Test PM can reject a requested stage"""
        wo_id = reject_test_work_order['wo_id']
        stage_id = reject_test_work_order['stage_id']
        
        resp = pm_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/approve",
            json={"action": "reject", "notes": "Work not complete, rejecting"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify status changed to rejected
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage = wo['stages'][0]
        
        assert stage['status'] == 'rejected', f"Expected 'rejected', got '{stage['status']}'"
        assert stage.get('rejection_reason') is not None, "rejection_reason should be set"
        print(f"Rejection successful, status: {stage['status']}, reason: {stage.get('rejection_reason')}")
        
    def test_site_engineer_can_revert_rejected_stage(self, site_engineer_session, planning_session, reject_test_work_order):
        """Test Site Engineer can revert a rejected stage back to pending"""
        wo_id = reject_test_work_order['wo_id']
        stage_id = reject_test_work_order['stage_id']
        
        resp = site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/revert"
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify status changed back to pending
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        stage = wo['stages'][0]
        
        assert stage['status'] == 'pending', f"Expected 'pending', got '{stage['status']}'"
        assert stage.get('rejection_reason') is None, "rejection_reason should be cleared"
        print(f"Revert successful, status: {stage['status']}")


class TestPermissionChecks:
    """Test permission checks for approval pipeline"""
    
    def test_planning_cannot_approve_requested_stage(self, planning_session, site_engineer_session):
        """Test Planning cannot approve a stage that's only 'requested' (needs PM first)"""
        # Create work order
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        contractors = resp.json()
        contractor_id = [c for c in contractors if c.get('is_active', True)][0]['contractor_id']
        
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_PERM Permission test",
            "scope_items": [{"name": "Perm Test", "unit": "nos", "quantity": 1, "unit_rate": 1000}],
            "stages": [{"name": "Perm Stage", "type": "percentage", "value": 100}],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        wo_id = resp.json()['work_order_id']
        
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        stage_id = get_resp.json()['stages'][0]['stage_id']
        
        # Request payment
        site_engineer_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"notes": "Permission test"}
        )
        
        # Planning tries to approve (should fail - needs PM first)
        approve_resp = planning_session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}/stages/{stage_id}/approve",
            json={"action": "approve"}
        )
        assert approve_resp.status_code == 400, f"Expected 400, got {approve_resp.status_code}"
        print("Permission check passed: Planning cannot skip PM approval")
        
        # Cleanup
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
