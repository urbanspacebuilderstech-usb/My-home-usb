"""
HR Admin Module - Comprehensive API Tests
Tests for:
- HR Dashboard metrics
- HR Settings (department timings, leave limits)
- Attendance Calendar (monthly view)
- Admin Mark Attendance
- Late Report
- Leave Management (requests, approve/reject)
- Salary Calculation
- Salary List
- Payslip Generation
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_session():
    """Get authenticated session as Super Admin"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login as Super Admin
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@constructionos.com",
        "password": "Demo@1234"
    })
    
    if login_resp.status_code != 200:
        pytest.skip("Could not authenticate as Super Admin")
    
    return session


class TestHRDashboard:
    """Test HR Dashboard API"""
    
    def test_dashboard_returns_metrics(self, auth_session):
        """GET /api/hr/dashboard returns correct metrics"""
        resp = auth_session.get(f"{BASE_URL}/api/hr/dashboard")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        # Verify all required fields exist
        assert "total_staff" in data, "Missing total_staff"
        assert "today_present" in data, "Missing today_present"
        assert "today_absent" in data, "Missing today_absent"
        assert "today_late" in data, "Missing today_late"
        assert "pending_leaves" in data, "Missing pending_leaves"
        
        # Verify types
        assert isinstance(data["total_staff"], int), "total_staff should be int"
        assert isinstance(data["today_present"], int), "today_present should be int"
        assert isinstance(data["today_absent"], int), "today_absent should be int"
        assert isinstance(data["today_late"], int), "today_late should be int"
        assert isinstance(data["pending_leaves"], int), "pending_leaves should be int"
        
        print(f"Dashboard metrics: total_staff={data['total_staff']}, present={data['today_present']}, absent={data['today_absent']}, late={data['today_late']}, pending_leaves={data['pending_leaves']}")


class TestHRSettings:
    """Test HR Settings APIs"""
    
    def test_get_settings(self, auth_session):
        """GET /api/hr/settings returns department_timings and leave_limits"""
        resp = auth_session.get(f"{BASE_URL}/api/hr/settings")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "department_timings" in data, "Missing department_timings"
        assert "leave_limits" in data, "Missing leave_limits"
        
        # Verify department_timings structure
        dept_timings = data["department_timings"]
        assert isinstance(dept_timings, dict), "department_timings should be dict"
        assert "default" in dept_timings, "Missing default timing"
        
        # Verify leave_limits structure
        leave_limits = data["leave_limits"]
        assert isinstance(leave_limits, dict), "leave_limits should be dict"
        assert "PL" in leave_limits, "Missing PL leave type"
        assert "SL" in leave_limits, "Missing SL leave type"
        assert "CL" in leave_limits, "Missing CL leave type"
        assert "WFH" in leave_limits, "Missing WFH leave type"
        
        # Verify leave limits values
        assert leave_limits["PL"]["annual_limit"] == 12, f"PL limit should be 12, got {leave_limits['PL']['annual_limit']}"
        assert leave_limits["SL"]["annual_limit"] == 12, f"SL limit should be 12, got {leave_limits['SL']['annual_limit']}"
        assert leave_limits["CL"]["annual_limit"] == 6, f"CL limit should be 6, got {leave_limits['CL']['annual_limit']}"
        assert leave_limits["WFH"]["annual_limit"] == 24, f"WFH limit should be 24, got {leave_limits['WFH']['annual_limit']}"
        
        print(f"Settings loaded: {len(dept_timings)} departments, {len(leave_limits)} leave types")
    
    def test_update_settings(self, auth_session):
        """PATCH /api/hr/settings updates department_timings correctly"""
        # First get current settings
        get_resp = auth_session.get(f"{BASE_URL}/api/hr/settings")
        original = get_resp.json()
        
        # Update Engineering timing
        new_timings = original.get("department_timings", {}).copy()
        new_timings["Engineering"] = {"start": "08:30", "end": "17:30", "grace_minutes": 20}
        
        patch_resp = auth_session.patch(f"{BASE_URL}/api/hr/settings", json={
            "department_timings": new_timings
        })
        assert patch_resp.status_code == 200, f"Expected 200, got {patch_resp.status_code}: {patch_resp.text}"
        
        # Verify update
        verify_resp = auth_session.get(f"{BASE_URL}/api/hr/settings")
        updated = verify_resp.json()
        assert updated["department_timings"]["Engineering"]["start"] == "08:30", "Engineering start time not updated"
        assert updated["department_timings"]["Engineering"]["grace_minutes"] == 20, "Engineering grace_minutes not updated"
        
        # Restore original
        auth_session.patch(f"{BASE_URL}/api/hr/settings", json={
            "department_timings": original.get("department_timings", {})
        })
        
        print("Settings update and restore successful")


class TestAttendanceCalendar:
    """Test Attendance Calendar APIs"""
    
    def test_monthly_attendance(self, auth_session):
        """GET /api/hr/attendance/monthly returns monthly view with per-day status"""
        now = datetime.now()
        resp = auth_session.get(f"{BASE_URL}/api/hr/attendance/monthly?month={now.month}&year={now.year}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "month" in data, "Missing month"
        assert "year" in data, "Missing year"
        assert "days_in_month" in data, "Missing days_in_month"
        assert "staff" in data, "Missing staff"
        
        assert data["month"] == now.month, f"Month mismatch: expected {now.month}, got {data['month']}"
        assert data["year"] == now.year, f"Year mismatch: expected {now.year}, got {data['year']}"
        assert isinstance(data["staff"], list), "staff should be list"
        
        # If there are staff, verify structure
        if data["staff"]:
            staff_entry = data["staff"][0]
            assert "staff_id" in staff_entry, "Missing staff_id"
            assert "name" in staff_entry, "Missing name"
            assert "days" in staff_entry, "Missing days"
            assert "summary" in staff_entry, "Missing summary"
            
            summary = staff_entry["summary"]
            assert "present" in summary, "Missing present in summary"
            assert "absent" in summary, "Missing absent in summary"
            assert "leaves" in summary, "Missing leaves in summary"
            assert "working_days" in summary, "Missing working_days in summary"
        
        print(f"Monthly attendance: {len(data['staff'])} staff, {data['days_in_month']} days in month")


class TestAdminMarkAttendance:
    """Test Admin Mark Attendance API"""
    
    def test_mark_attendance(self, auth_session):
        """POST /api/hr/attendance/mark marks a specific status for a staff"""
        # First get a staff member
        staff_resp = auth_session.get(f"{BASE_URL}/api/hr/staff")
        if staff_resp.status_code != 200 or not staff_resp.json():
            pytest.skip("No staff available for testing")
        
        staff_list = staff_resp.json()
        staff_id = staff_list[0]["staff_id"]
        
        # Mark attendance for today
        today = datetime.now().strftime("%Y-%m-%d")
        mark_resp = auth_session.post(f"{BASE_URL}/api/hr/attendance/mark", json={
            "staff_id": staff_id,
            "date": today,
            "status": "P",
            "remarks": "TEST_marked_by_hr_admin_test"
        })
        assert mark_resp.status_code == 200, f"Expected 200, got {mark_resp.status_code}: {mark_resp.text}"
        
        data = mark_resp.json()
        assert data.get("status") == "marked", f"Expected status 'marked', got {data}"
        
        print(f"Marked attendance for {staff_id} on {today}")
    
    def test_mark_attendance_leave(self, auth_session):
        """POST /api/hr/attendance/mark can mark leave status"""
        staff_resp = auth_session.get(f"{BASE_URL}/api/hr/staff")
        if staff_resp.status_code != 200 or not staff_resp.json():
            pytest.skip("No staff available for testing")
        
        staff_list = staff_resp.json()
        staff_id = staff_list[0]["staff_id"]
        
        # Mark as Paid Leave for a past date
        test_date = "2026-01-10"
        mark_resp = auth_session.post(f"{BASE_URL}/api/hr/attendance/mark", json={
            "staff_id": staff_id,
            "date": test_date,
            "status": "PL",
            "remarks": "TEST_paid_leave_mark"
        })
        assert mark_resp.status_code == 200, f"Expected 200, got {mark_resp.status_code}: {mark_resp.text}"
        
        print(f"Marked PL for {staff_id} on {test_date}")


class TestLateReport:
    """Test Late Report API"""
    
    def test_late_report(self, auth_session):
        """GET /api/hr/attendance/late-report returns late employees"""
        now = datetime.now()
        resp = auth_session.get(f"{BASE_URL}/api/hr/attendance/late-report?month={now.month}&year={now.year}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "month" in data, "Missing month"
        assert "year" in data, "Missing year"
        assert "employees" in data, "Missing employees"
        
        assert isinstance(data["employees"], list), "employees should be list"
        
        # If there are late employees, verify structure
        if data["employees"]:
            emp = data["employees"][0]
            assert "staff_id" in emp, "Missing staff_id"
            assert "name" in emp, "Missing name"
            assert "late_days" in emp, "Missing late_days"
            assert "total_late_minutes" in emp, "Missing total_late_minutes"
        
        print(f"Late report: {len(data['employees'])} employees with late arrivals")


class TestLeaveManagement:
    """Test Leave Management APIs"""
    
    def test_get_leave_requests_all(self, auth_session):
        """GET /api/hr/leave/requests returns all leave requests"""
        resp = auth_session.get(f"{BASE_URL}/api/hr/leave/requests")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be list"
        
        print(f"Total leave requests: {len(data)}")
    
    def test_get_leave_requests_by_status(self, auth_session):
        """GET /api/hr/leave/requests?status=pending returns filtered list"""
        for status in ["pending", "approved", "rejected"]:
            resp = auth_session.get(f"{BASE_URL}/api/hr/leave/requests?status={status}")
            assert resp.status_code == 200, f"Expected 200 for status={status}, got {resp.status_code}"
            
            data = resp.json()
            assert isinstance(data, list), f"Response for status={status} should be list"
            
            # Verify all returned items have correct status
            for item in data:
                assert item.get("status") == status, f"Expected status {status}, got {item.get('status')}"
            
            print(f"Leave requests with status={status}: {len(data)}")


class TestSalaryCalculation:
    """Test Salary Calculation APIs"""
    
    def test_calculate_salary(self, auth_session):
        """POST /api/hr/salary/calculate auto-computes salary for all active staff"""
        now = datetime.now()
        resp = auth_session.post(f"{BASE_URL}/api/hr/salary/calculate", json={
            "month": now.month,
            "year": now.year
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "month" in data, "Missing month"
        assert "year" in data, "Missing year"
        assert "working_days" in data, "Missing working_days"
        assert "payroll" in data, "Missing payroll"
        
        assert isinstance(data["payroll"], list), "payroll should be list"
        
        # If there are payroll entries, verify structure
        if data["payroll"]:
            payroll = data["payroll"][0]
            assert "staff_id" in payroll, "Missing staff_id"
            assert "staff_name" in payroll, "Missing staff_name"
            assert "gross_earnings" in payroll, "Missing gross_earnings"
            assert "total_deductions" in payroll, "Missing total_deductions"
            assert "net_pay" in payroll, "Missing net_pay"
            assert "basic_salary" in payroll, "Missing basic_salary"
            assert "hra" in payroll, "Missing hra"
            assert "pa" in payroll, "Missing pa"
            assert "fa" in payroll, "Missing fa"
            assert "lop_deduction" in payroll, "Missing lop_deduction"
            assert "late_deduction" in payroll, "Missing late_deduction"
            assert "loan_deduction" in payroll, "Missing loan_deduction"
        
        print(f"Salary calculated for {len(data['payroll'])} employees, working_days={data['working_days']}")
    
    def test_salary_list(self, auth_session):
        """GET /api/hr/salary/list returns computed payroll for a month"""
        now = datetime.now()
        resp = auth_session.get(f"{BASE_URL}/api/hr/salary/list?month={now.month}&year={now.year}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be list"
        
        print(f"Salary list: {len(data)} entries")


class TestPayslip:
    """Test Payslip API"""
    
    def test_payslip(self, auth_session):
        """GET /api/hr/payslip/{staff_id} returns payslip with company info and salary breakdown"""
        # First get a staff member
        staff_resp = auth_session.get(f"{BASE_URL}/api/hr/staff")
        if staff_resp.status_code != 200 or not staff_resp.json():
            pytest.skip("No staff available for testing")
        
        staff_list = staff_resp.json()
        staff_id = staff_list[0]["staff_id"]
        
        # Calculate salary first to ensure payslip exists
        now = datetime.now()
        auth_session.post(f"{BASE_URL}/api/hr/salary/calculate", json={
            "month": now.month,
            "year": now.year
        })
        
        # Get payslip
        resp = auth_session.get(f"{BASE_URL}/api/hr/payslip/{staff_id}?month={now.month}&year={now.year}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "payroll" in data, "Missing payroll"
        assert "staff" in data, "Missing staff"
        assert "company" in data, "Missing company"
        
        # Verify company info
        company = data["company"]
        assert "name" in company, "Missing company name"
        assert "address" in company, "Missing company address"
        
        # Verify payroll structure
        payroll = data["payroll"]
        assert "staff_name" in payroll, "Missing staff_name"
        assert "gross_earnings" in payroll, "Missing gross_earnings"
        assert "net_pay" in payroll, "Missing net_pay"
        
        print(f"Payslip for {payroll.get('staff_name')}: gross={payroll.get('gross_earnings')}, net={payroll.get('net_pay')}")
    
    def test_payslip_not_found(self, auth_session):
        """GET /api/hr/payslip/{staff_id} returns 404 for non-existent payslip"""
        resp = auth_session.get(f"{BASE_URL}/api/hr/payslip/nonexistent_staff?month=1&year=2020")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"


class TestStaffEndpoint:
    """Test Staff CRUD endpoint (existing from operations.py)"""
    
    def test_get_staff_list(self, auth_session):
        """GET /api/hr/staff returns list of employees"""
        resp = auth_session.get(f"{BASE_URL}/api/hr/staff")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list), "Response should be list"
        
        if data:
            staff = data[0]
            assert "staff_id" in staff, "Missing staff_id"
            assert "name" in staff, "Missing name"
            assert "employee_code" in staff, "Missing employee_code"
        
        print(f"Staff list: {len(data)} employees")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
