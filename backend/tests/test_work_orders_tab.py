"""
Work Orders Tab - Backend API Tests
====================================
Tests for the new Work Orders tab which replaced Labours and Labour Count tabs.
Features:
- GET /api/projects/{project_id}/assigned-contractors - Contractor list with work orders
- POST /api/labour-attendance - Create daily attendance
- PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment - Request payment
- PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/review - Multi-step approval
- Duplicate attendance rejection
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SE_CREDS = {"email": "engineer@constructionos.com", "password": "Demo@1234"}
PROCUREMENT_CREDS = {"email": "procurement@constructionos.com", "password": "Demo@1234"}
PLANNING_CREDS = {"email": "planning@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT_CREDS = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
PROJECT_ID = "proj_12f23331b542"


@pytest.fixture(scope="class")
def se_session():
    """Site Engineer session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json=SE_CREDS)
    assert resp.status_code == 200, f"SE login failed: {resp.text}"
    return session


@pytest.fixture(scope="class")
def procurement_session():
    """Procurement session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json=PROCUREMENT_CREDS)
    assert resp.status_code == 200, f"Procurement login failed: {resp.text}"
    return session


@pytest.fixture(scope="class")
def planning_session():
    """Planning session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_CREDS)
    assert resp.status_code == 200, f"Planning login failed: {resp.text}"
    return session


@pytest.fixture(scope="class")
def accountant_session():
    """Accountant session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_CREDS)
    assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
    return session


class TestAssignedContractorsEndpoint:
    """Test GET /api/projects/{project_id}/assigned-contractors"""
    
    def test_get_assigned_contractors_returns_200(self, se_session):
        """Contractor list endpoint returns 200 for site engineer"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list of contractors"
        print(f"Found {len(data)} contractors assigned to project")
    
    def test_contractor_has_required_fields(self, se_session):
        """Each contractor should have required fields"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data) == 0:
            pytest.skip("No contractors assigned to project")
        
        contractor = data[0]
        required_fields = ["contractor_id", "contractor_name", "work_orders"]
        for field in required_fields:
            assert field in contractor, f"Missing field: {field}"
        print(f"Contractor: {contractor['contractor_name']}, Type: {contractor.get('contractor_type', 'N/A')}")
    
    def test_work_orders_have_stages(self, se_session):
        """Work orders should have payment_stages array"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        data = resp.json()
        
        if len(data) == 0:
            pytest.skip("No contractors assigned")
        
        wo_found = False
        for contractor in data:
            for wo in contractor.get("work_orders", []):
                wo_found = True
                assert "payment_stages" in wo, "Work order should have payment_stages"
                assert "total_amount" in wo, "Work order should have total_amount"
                assert "work_order_id" in wo, "Work order should have work_order_id"
                print(f"Work Order: {wo.get('description', 'N/A')}, Amount: {wo.get('total_amount', 0)}, Stages: {len(wo.get('payment_stages', []))}")
                break
            if wo_found:
                break
        
        if not wo_found:
            pytest.skip("No work orders found")
    
    def test_stages_have_required_fields(self, se_session):
        """Payment stages should have all required fields"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        data = resp.json()
        
        stage_found = False
        for contractor in data:
            for wo in contractor.get("work_orders", []):
                for stage in wo.get("payment_stages", []):
                    stage_found = True
                    required = ["stage_id", "stage_name", "amount", "daily_rate", "status"]
                    for field in required:
                        assert field in stage, f"Stage missing field: {field}"
                    print(f"Stage: {stage['stage_name']}, Amount: {stage['amount']}, Rate: {stage['daily_rate']}, Status: {stage['status']}")
                    break
                if stage_found:
                    break
            if stage_found:
                break
        
        if not stage_found:
            pytest.skip("No stages found")


class TestLabourAttendance:
    """Test POST /api/labour-attendance"""
    
    def test_create_attendance_success(self, se_session):
        """Site engineer can create attendance record"""
        # First get a valid contractor and stage
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        if len(contractors) == 0:
            pytest.skip("No contractors")
        
        # Find a pending stage
        wo_id = None
        stage_id = None
        contractor = None
        daily_rate = 500  # default
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "pending":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        daily_rate = s.get("daily_rate", 500)
                        contractor = c
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending stages to test attendance")
        
        # Use unique date to avoid duplicate
        test_date = f"2025-01-{datetime.now().day:02d}"
        unique_date = f"2024-12-{(datetime.now().microsecond % 28) + 1:02d}"
        
        payload = {
            "project_id": PROJECT_ID,
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["contractor_name"],
            "work_order_id": wo_id,
            "stage_id": stage_id,
            "date": unique_date,
            "entries": [
                {"type": "Worker", "label": "Worker", "count": 3, "per_day_cost": daily_rate, "total": 3 * daily_rate}
            ],
            "notes": f"TEST attendance {unique_date}"
        }
        
        resp = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        # May get 400 if duplicate - that's also valid behavior
        if resp.status_code == 400:
            assert "already recorded" in resp.text.lower(), f"Unexpected 400 error: {resp.text}"
            print(f"Attendance already exists for {unique_date} - duplicate rejection working")
        else:
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
            data = resp.json()
            assert "attendance_id" in data
            assert data["total_workers"] == 3
            print(f"Attendance created: {data['attendance_id']}, Workers: {data['total_workers']}, Cost: {data['total_cost']}")
    
    def test_attendance_auto_calculates_cost(self, se_session):
        """Attendance cost is auto-calculated from count * per_day_cost"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        contractor = None
        daily_rate = 750
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "pending":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        daily_rate = s.get("daily_rate", 750)
                        contractor = c
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending stages")
        
        unique_date = f"2024-11-{(datetime.now().microsecond % 28) + 1:02d}"
        worker_count = 5
        
        payload = {
            "project_id": PROJECT_ID,
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["contractor_name"],
            "work_order_id": wo_id,
            "stage_id": stage_id,
            "date": unique_date,
            "entries": [
                {"type": "Worker", "label": "Worker", "count": worker_count, "per_day_cost": daily_rate, "total": worker_count * daily_rate}
            ],
            "notes": f"TEST cost calc {unique_date}"
        }
        
        resp = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        if resp.status_code == 400:
            print("Duplicate attendance - skipping cost calculation validation")
            return
        
        assert resp.status_code == 200
        data = resp.json()
        expected_cost = worker_count * daily_rate
        assert data["total_cost"] == expected_cost, f"Expected cost {expected_cost}, got {data['total_cost']}"
        print(f"Cost auto-calculated correctly: {worker_count} workers x {daily_rate} rate = {data['total_cost']}")


class TestDuplicateAttendanceRejection:
    """Test that duplicate attendance for same date+stage is rejected"""
    
    def test_duplicate_attendance_rejected(self, se_session):
        """Submitting attendance for same date+stage should be rejected"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        contractor = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "pending":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        contractor = c
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending stages")
        
        # Use a fixed date for duplicate test
        test_date = "2024-06-15"
        
        payload = {
            "project_id": PROJECT_ID,
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["contractor_name"],
            "work_order_id": wo_id,
            "stage_id": stage_id,
            "date": test_date,
            "entries": [{"type": "Worker", "label": "Worker", "count": 2, "per_day_cost": 500, "total": 1000}],
            "notes": "TEST duplicate 1"
        }
        
        # First submission
        resp1 = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        
        # Second submission with same date+stage
        payload["notes"] = "TEST duplicate 2"
        resp2 = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        
        # At least one should be rejected as duplicate
        if resp1.status_code == 200:
            assert resp2.status_code == 400, f"Second attendance should be rejected, got {resp2.status_code}"
            assert "already recorded" in resp2.text.lower(), f"Expected duplicate error, got: {resp2.text}"
            print("Duplicate attendance correctly rejected on second submission")
        elif resp1.status_code == 400:
            # First was already duplicate
            print("Attendance for this date already exists - duplicate rejection working")


class TestStagePaymentRequest:
    """Test PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment"""
    
    def test_request_payment_changes_status_to_requested(self, se_session):
        """SE requesting payment should change stage status to 'requested'"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        # Find a pending stage
        wo_id = None
        stage_id = None
        stage_amount = 0
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "pending":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        stage_amount = s.get("amount", 10000)
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending stages to request payment")
        
        payload = {
            "requested_amount": stage_amount,
            "notes": "TEST payment request"
        }
        
        resp = se_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json=payload
        )
        
        if resp.status_code == 400 and "already requested" in resp.text.lower():
            print("Stage already requested - skipping")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"Payment request submitted for stage {stage_id}, amount: {stage_amount}")
        
        # Verify status changed
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                if wo["work_order_id"] == wo_id:
                    for s in wo.get("payment_stages", []):
                        if s["stage_id"] == stage_id:
                            assert s["status"] == "requested", f"Expected status 'requested', got '{s['status']}'"
                            print(f"Stage status verified: {s['status']}")


class TestMultiStepApproval:
    """Test PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/review"""
    
    def test_procurement_can_approve_requested_stage(self, se_session, procurement_session):
        """Procurement can approve a 'requested' stage"""
        # Find a requested stage
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "requested":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No requested stages for procurement approval")
        
        resp = procurement_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/review",
            json={"action": "approve", "notes": "Procurement approved"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"Procurement approved stage {stage_id}")
    
    def test_planning_can_approve_procurement_approved_stage(self, se_session, planning_session):
        """Planning can approve a 'procurement_approved' stage"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") in ["requested", "procurement_approved"]:
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No stage available for planning approval")
        
        resp = planning_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/review",
            json={"action": "approve", "notes": "Planning approved"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"Planning approved stage {stage_id}")
    
    def test_accountant_can_release_payment(self, se_session, accountant_session):
        """Accountant can release payment for 'planning_approved' stage"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        amount = 0
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "planning_approved":
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        amount = s.get("requested_amount", s.get("amount", 10000))
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No planning_approved stage for accountant")
        
        resp = accountant_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/review",
            json={"action": "approve", "approved_amount": amount, "notes": "Payment released"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print(f"Accountant released payment for stage {stage_id}, amount: {amount}")


class TestGetLabourAttendance:
    """Test GET /api/labour-attendance with filters"""
    
    def test_get_attendance_by_stage(self, se_session):
        """Can get attendance records filtered by stage_id"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                if wo.get("payment_stages"):
                    wo_id = wo["work_order_id"]
                    stage_id = wo["payment_stages"][0]["stage_id"]
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No stages found")
        
        resp = se_session.get(
            f"{BASE_URL}/api/labour-attendance?work_order_id={wo_id}&stage_id={stage_id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        print(f"Found {len(data)} attendance records for stage {stage_id}")
        
        if len(data) > 0:
            record = data[0]
            assert "date" in record
            assert "total_workers" in record
            assert "total_cost" in record
            print(f"Sample record: Date={record['date']}, Workers={record['total_workers']}, Cost={record['total_cost']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
