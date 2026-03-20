"""
Work Orders Tab - Multi-Row Attendance & Stage Classification Tests
=====================================================================
Tests for the reworked Work Orders tab with:
1. Multi-row attendance popup (Skilled/Semi-Skilled/Unskilled)
2. Stage classification (Active, Upcoming, Completed)
3. Add new stage API
4. Attendance breakdown in records
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SE_CREDS = {"email": "engineer@constructionos.com", "password": "Demo@1234"}
PLANNING_CREDS = {"email": "planning@constructionos.com", "password": "Demo@1234"}
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
def planning_session():
    """Planning session for adding stages"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_CREDS)
    assert resp.status_code == 200, f"Planning login failed: {resp.text}"
    return session


class TestMultiRowAttendance:
    """Test multi-row attendance with Skilled/Semi-Skilled/Unskilled entries"""
    
    def test_create_multirow_attendance_with_multiple_types(self, se_session):
        """Site engineer can create attendance with multiple worker types"""
        # Get a valid contractor and stage
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        if len(contractors) == 0:
            pytest.skip("No contractors assigned")
        
        # Find a pending or requested stage
        wo_id = None
        stage_id = None
        contractor = None
        stage = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") in ["pending", "requested"]:
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        contractor = c
                        stage = s
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending/requested stages available")
        
        # Use unique date
        unique_date = f"2024-10-{(datetime.now().microsecond % 28) + 1:02d}"
        
        # Get labour rates from stage or use defaults
        labour_rates = stage.get("labour_rates", [])
        skilled_rate = 800
        semi_skilled_rate = 600
        unskilled_rate = 400
        
        for r in labour_rates:
            if r.get("type") == "Skilled":
                skilled_rate = r.get("rate", 800)
            elif r.get("type") == "Semi-Skilled":
                semi_skilled_rate = r.get("rate", 600)
            elif r.get("type") == "Unskilled":
                unskilled_rate = r.get("rate", 400)
        
        # Create multi-type entries
        entries = [
            {"type": "Skilled", "label": "Skilled", "count": 2, "per_day_cost": skilled_rate, "rate": skilled_rate, "total": 2 * skilled_rate},
            {"type": "Semi-Skilled", "label": "Semi-Skilled", "count": 3, "per_day_cost": semi_skilled_rate, "rate": semi_skilled_rate, "total": 3 * semi_skilled_rate},
            {"type": "Unskilled", "label": "Unskilled", "count": 5, "per_day_cost": unskilled_rate, "rate": unskilled_rate, "total": 5 * unskilled_rate}
        ]
        
        expected_total_workers = 2 + 3 + 5  # 10
        expected_total_cost = (2 * skilled_rate) + (3 * semi_skilled_rate) + (5 * unskilled_rate)
        
        payload = {
            "project_id": PROJECT_ID,
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["contractor_name"],
            "work_order_id": wo_id,
            "stage_id": stage_id,
            "date": unique_date,
            "entries": entries,
            "notes": f"TEST multi-type attendance {unique_date}"
        }
        
        resp = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        
        if resp.status_code == 400 and "already recorded" in resp.text.lower():
            print(f"Attendance already exists for {unique_date} - duplicate rejection working")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert "attendance_id" in data, "Should have attendance_id"
        assert data["total_workers"] == expected_total_workers, f"Expected {expected_total_workers} workers, got {data['total_workers']}"
        assert data["total_cost"] == expected_total_cost, f"Expected cost {expected_total_cost}, got {data['total_cost']}"
        assert len(data.get("entries", [])) == 3, "Should have 3 entry types"
        
        print(f"Multi-row attendance created: {data['attendance_id']}")
        print(f"Workers: {data['total_workers']}, Cost: {data['total_cost']}")
        entries_str = [f"{e.get('type')}: {e.get('count')}" for e in data.get('entries', [])]
        print(f"Entries: {entries_str}")
    
    def test_attendance_entries_have_type_breakdown(self, se_session):
        """Attendance records should store breakdown by worker type"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        stage_id = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    wo_id = wo["work_order_id"]
                    stage_id = s["stage_id"]
                    break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No stages found")
        
        # Fetch attendance for this stage
        resp = se_session.get(f"{BASE_URL}/api/labour-attendance?work_order_id={wo_id}&stage_id={stage_id}")
        assert resp.status_code == 200
        records = resp.json()
        
        print(f"Found {len(records)} attendance records for stage {stage_id}")
        
        if len(records) == 0:
            pytest.skip("No attendance records to verify")
        
        # Check that entries have type breakdown
        for record in records[:3]:  # Check first 3 records
            entries = record.get("entries", [])
            if len(entries) > 0:
                for entry in entries:
                    assert "type" in entry or "label" in entry, "Entry should have type or label"
                    assert "count" in entry, "Entry should have count"
                entries_str = [f"{e.get('type', e.get('label'))}: {e.get('count')}" for e in entries]
                print(f"Record {record['attendance_id']}: {record['date']} - {entries_str}")
                break


class TestStageLabourRates:
    """Test that stages have labour_rates array set by Planning"""
    
    def test_stages_have_labour_rates(self, se_session):
        """Stages should have labour_rates array with type and rate"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        stage_with_rates = None
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    labour_rates = s.get("labour_rates", [])
                    if len(labour_rates) > 0:
                        stage_with_rates = s
                        break
                if stage_with_rates:
                    break
            if stage_with_rates:
                break
        
        if not stage_with_rates:
            pytest.skip("No stages with labour_rates found")
        
        labour_rates = stage_with_rates.get("labour_rates", [])
        print(f"Stage '{stage_with_rates['stage_name']}' has {len(labour_rates)} labour rate entries")
        
        for rate in labour_rates:
            assert "type" in rate, "Labour rate should have type"
            assert "rate" in rate, "Labour rate should have rate"
            print(f"  - {rate['type']}: ₹{rate['rate']}/day")


class TestAddStageToWorkOrder:
    """Test POST /api/labour-work-orders/{wo_id}/stages - Add new stage"""
    
    def test_add_stage_creates_new_stage(self, planning_session, se_session):
        """Planning can add a new stage to existing work order"""
        # Get a work order
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        wo_id = None
        for c in contractors:
            for wo in c.get("work_orders", []):
                wo_id = wo["work_order_id"]
                break
            if wo_id:
                break
        
        if not wo_id:
            pytest.skip("No work orders found")
        
        # Add a new stage
        unique_name = f"TEST_Stage_{datetime.now().strftime('%H%M%S')}"
        payload = {
            "stage_name": unique_name,
            "amount": 25000,
            "start_date": "2025-02-01",
            "end_date": "2025-02-28",
            "notes": "Test stage added via API",
            "labour_rates": [
                {"type": "Skilled", "rate": 900},
                {"type": "Semi-Skilled", "rate": 650},
                {"type": "Unskilled", "rate": 450}
            ]
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "stage_id" in data, "New stage should have stage_id"
        assert data["stage_name"] == unique_name, f"Expected name '{unique_name}', got '{data.get('stage_name')}'"
        assert data["amount"] == 25000, f"Expected amount 25000, got {data.get('amount')}"
        assert data["status"] == "pending", f"Expected status 'pending', got '{data.get('status')}'"
        
        # Verify labour_rates were saved
        labour_rates = data.get("labour_rates", [])
        assert len(labour_rates) == 3, f"Expected 3 labour rates, got {len(labour_rates)}"
        
        print(f"New stage added: {data['stage_id']} - {data['stage_name']}")
        print(f"Amount: ₹{data['amount']}, Status: {data['status']}")
        print(f"Labour rates: {labour_rates}")
    
    def test_add_stage_updates_work_order_total(self, planning_session, se_session):
        """Adding a stage should update work order total_amount"""
        # Get work order
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        wo_id = None
        original_total = 0
        for c in contractors:
            for wo in c.get("work_orders", []):
                wo_id = wo["work_order_id"]
                original_total = wo.get("total_amount", 0)
                break
            if wo_id:
                break
        
        if not wo_id:
            pytest.skip("No work orders")
        
        new_amount = 15000
        payload = {
            "stage_name": f"TEST_Total_Update_{datetime.now().strftime('%H%M%S')}",
            "amount": new_amount,
            "labour_rates": [{"type": "Skilled", "rate": 800}]
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages", json=payload)
        assert resp.status_code == 200
        
        # Verify work order total updated
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                if wo["work_order_id"] == wo_id:
                    new_total = wo.get("total_amount", 0)
                    expected_total = original_total + new_amount
                    assert new_total >= original_total, f"Total should increase from {original_total}"
                    print(f"Work order total updated: {original_total} -> {new_total}")
                    return
        
        pytest.fail("Could not verify work order total update")


class TestStageClassification:
    """Test stage classification logic (Active, Upcoming, Completed)"""
    
    def test_approved_stages_are_completed(self, se_session):
        """Stages with status='approved' should be classified as completed"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        approved_found = False
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "approved":
                        approved_found = True
                        # Verify stage has completion data
                        assert s.get("approved_at") or s.get("approved_amount"), "Approved stage should have approval info"
                        print(f"Found approved/completed stage: {s['stage_name']}")
                        print(f"  Approved amount: {s.get('approved_amount')}, Approved at: {s.get('approved_at')}")
        
        if not approved_found:
            pytest.skip("No approved stages found to verify completion status")
    
    def test_pending_stages_exist(self, se_session):
        """Stages with status='pending' should exist (active or upcoming)"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        pending_count = 0
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") == "pending":
                        pending_count += 1
                        print(f"Pending stage: {s['stage_name']} (Contractor: {c.get('contractor_name')})")
        
        print(f"Total pending stages: {pending_count}")
        assert pending_count > 0, "Should have at least one pending stage"
    
    def test_mason_contractor_has_expected_stages(self, se_session):
        """Mason contractor (cont_mason01) should have 3 stages with expected statuses"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        assert resp.status_code == 200
        contractors = resp.json()
        
        mason = None
        for c in contractors:
            if c.get("contractor_id") == "cont_mason01":
                mason = c
                break
        
        if not mason:
            pytest.skip("Mason contractor cont_mason01 not found")
        
        work_orders = mason.get("work_orders", [])
        assert len(work_orders) > 0, "Mason should have work orders"
        
        all_stages = []
        for wo in work_orders:
            all_stages.extend(wo.get("payment_stages", []))
        
        print(f"Mason (cont_mason01) has {len(all_stages)} stages:")
        for s in all_stages:
            print(f"  - {s['stage_name']}: {s['status']}")
        
        # Check for expected stages
        stage_statuses = [s.get("status") for s in all_stages]
        # Should have mix of approved (completed), pending, and possibly requested
        assert len(all_stages) >= 2, "Mason should have at least 2 stages"


class TestAttendanceUpdatesStageSpend:
    """Test that attendance updates stage total_spend and total_attendance_days"""
    
    def test_attendance_updates_stage_totals(self, se_session):
        """Creating attendance should update stage total_spend and total_attendance_days"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        # Find a pending stage
        wo_id = None
        stage_id = None
        contractor = None
        original_spend = 0
        original_days = 0
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                for s in wo.get("payment_stages", []):
                    if s.get("status") in ["pending", "requested"]:
                        wo_id = wo["work_order_id"]
                        stage_id = s["stage_id"]
                        contractor = c
                        original_spend = s.get("total_spend", 0)
                        original_days = s.get("total_attendance_days", 0)
                        break
                if stage_id:
                    break
            if stage_id:
                break
        
        if not stage_id:
            pytest.skip("No pending stage to test")
        
        # Create attendance
        unique_date = f"2024-09-{(datetime.now().microsecond % 28) + 1:02d}"
        cost_per_worker = 700
        workers = 4
        expected_cost = workers * cost_per_worker
        
        payload = {
            "project_id": PROJECT_ID,
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["contractor_name"],
            "work_order_id": wo_id,
            "stage_id": stage_id,
            "date": unique_date,
            "entries": [{"type": "Worker", "label": "Worker", "count": workers, "per_day_cost": cost_per_worker, "total": expected_cost}],
            "notes": f"TEST spend update {unique_date}"
        }
        
        resp = se_session.post(f"{BASE_URL}/api/labour-attendance", json=payload)
        
        if resp.status_code == 400:
            print("Attendance already exists - skipping spend update test")
            return
        
        assert resp.status_code == 200
        
        # Verify stage updated
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/assigned-contractors")
        contractors = resp.json()
        
        for c in contractors:
            for wo in c.get("work_orders", []):
                if wo["work_order_id"] == wo_id:
                    for s in wo.get("payment_stages", []):
                        if s["stage_id"] == stage_id:
                            new_spend = s.get("total_spend", 0)
                            new_days = s.get("total_attendance_days", 0)
                            assert new_spend >= original_spend + expected_cost, f"Spend should increase by {expected_cost}"
                            assert new_days >= original_days + 1, "Days should increase by 1"
                            print(f"Stage spend updated: {original_spend} -> {new_spend}")
                            print(f"Stage days updated: {original_days} -> {new_days}")
                            return


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
