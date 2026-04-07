"""
Site Engineer Daily Attendance Feature Tests
Tests for multi-project time tracking with GPS verification
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAttendanceFeature:
    """Test Site Engineer Attendance Login/Logout and History"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as site engineer
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_resp.status_code == 200, f"SE login failed: {login_resp.text}"
        self.se_user = login_resp.json()
        print(f"Logged in as SE: {self.se_user.get('name', 'Unknown')}")
        yield
    
    def test_01_get_my_today_attendance_initial(self):
        """GET /api/attendance/my-today - Returns today's attendance (may be empty)"""
        resp = self.session.get(f"{BASE_URL}/api/attendance/my-today")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "date" in data, "Response should have date field"
        assert "entries" in data, "Response should have entries field"
        assert "total_hours" in data, "Response should have total_hours field"
        assert "status" in data, "Response should have status field"
        print(f"Today's attendance: {data}")
    
    def test_02_get_my_history_attendance(self):
        """GET /api/attendance/my-history - Returns last 30 days history"""
        resp = self.session.get(f"{BASE_URL}/api/attendance/my-history")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "History should be a list"
        print(f"Attendance history count: {len(data)}")
        if data:
            print(f"Sample record: {data[0]}")
    
    def test_03_attendance_login_without_project(self):
        """POST /api/attendance/login - Should fail without project_id"""
        resp = self.session.post(f"{BASE_URL}/api/attendance/login", json={})
        assert resp.status_code == 422, f"Expected 422 for missing project_id, got {resp.status_code}"
        print("Correctly rejected login without project_id")
    
    def test_04_attendance_login_invalid_project(self):
        """POST /api/attendance/login - Should fail with invalid project"""
        resp = self.session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": "invalid_project_xyz",
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 404, f"Expected 404 for invalid project, got {resp.status_code}"
        print("Correctly rejected login with invalid project")
    
    def test_05_attendance_login_success(self):
        """POST /api/attendance/login - Login to a valid project"""
        # First get SE's assigned projects
        projects_resp = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert projects_resp.status_code == 200, f"Failed to get projects: {projects_resp.text}"
        projects = projects_resp.json()
        
        if not projects:
            pytest.skip("No projects assigned to SE - cannot test login")
        
        project = projects[0]
        project_id = project["project_id"]
        print(f"Testing login to project: {project.get('name')} ({project_id})")
        
        # First check if already logged in and logout if needed
        today_resp = self.session.get(f"{BASE_URL}/api/attendance/my-today")
        today_data = today_resp.json()
        for entry in today_data.get("entries", []):
            if not entry.get("logout_time"):
                # Logout from current project first
                logout_resp = self.session.post(f"{BASE_URL}/api/attendance/logout", json={
                    "project_id": entry["project_id"]
                })
                print(f"Logged out from {entry.get('project_name')}: {logout_resp.status_code}")
        
        # Now login
        resp = self.session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": project_id,
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert "message" in data, "Response should have message"
        assert "login_time" in data, "Response should have login_time"
        print(f"Login success: {data}")
        
        # Store for later tests
        self.__class__.logged_project_id = project_id
    
    def test_06_attendance_double_login_prevention(self):
        """POST /api/attendance/login - Should prevent double login to same project"""
        if not hasattr(self.__class__, 'logged_project_id'):
            pytest.skip("No active login from previous test")
        
        resp = self.session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": self.__class__.logged_project_id,
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 400, f"Expected 400 for double login, got {resp.status_code}"
        assert "already logged in" in resp.text.lower() or "logout first" in resp.text.lower(), f"Error message should mention already logged in: {resp.text}"
        print(f"Correctly prevented double login: {resp.json()}")
    
    def test_07_attendance_login_another_project_blocked(self):
        """POST /api/attendance/login - Should block login to another project without logout"""
        if not hasattr(self.__class__, 'logged_project_id'):
            pytest.skip("No active login from previous test")
        
        # Get another project
        projects_resp = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        projects = projects_resp.json()
        
        other_projects = [p for p in projects if p["project_id"] != self.__class__.logged_project_id]
        if not other_projects:
            pytest.skip("Only one project assigned - cannot test cross-project login block")
        
        other_project = other_projects[0]
        resp = self.session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": other_project["project_id"],
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 400, f"Expected 400 for login to another project without logout, got {resp.status_code}"
        print(f"Correctly blocked login to another project: {resp.json()}")
    
    def test_08_attendance_logout_success(self):
        """POST /api/attendance/logout - Logout from project"""
        if not hasattr(self.__class__, 'logged_project_id'):
            pytest.skip("No active login from previous test")
        
        resp = self.session.post(f"{BASE_URL}/api/attendance/logout", json={
            "project_id": self.__class__.logged_project_id,
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 200, f"Logout failed: {resp.text}"
        data = resp.json()
        assert "message" in data, "Response should have message"
        assert "logout_time" in data, "Response should have logout_time"
        assert "total_hours" in data, "Response should have total_hours"
        assert "status" in data, "Response should have status (full_day/half_day/short_day)"
        print(f"Logout success: {data}")
    
    def test_09_attendance_logout_not_logged_in(self):
        """POST /api/attendance/logout - Should fail if not logged in"""
        if not hasattr(self.__class__, 'logged_project_id'):
            pytest.skip("No project from previous test")
        
        resp = self.session.post(f"{BASE_URL}/api/attendance/logout", json={
            "project_id": self.__class__.logged_project_id
        })
        # Should fail because we already logged out
        assert resp.status_code == 400, f"Expected 400 for logout when not logged in, got {resp.status_code}"
        print(f"Correctly rejected logout when not logged in: {resp.json()}")
    
    def test_10_verify_today_attendance_after_logout(self):
        """GET /api/attendance/my-today - Verify attendance record after logout"""
        resp = self.session.get(f"{BASE_URL}/api/attendance/my-today")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        # Should have at least one entry with both login and logout times
        entries = data.get("entries", [])
        if entries:
            completed_entries = [e for e in entries if e.get("login_time") and e.get("logout_time")]
            print(f"Completed entries today: {len(completed_entries)}")
            if completed_entries:
                entry = completed_entries[-1]
                print(f"Last entry: {entry.get('project_name')} - {entry.get('login_time')} to {entry.get('logout_time')}")
        
        # Verify status calculation
        status = data.get("status")
        total_hours = data.get("total_hours", 0)
        print(f"Total hours: {total_hours}, Status: {status}")
        
        # Verify status logic
        if total_hours >= 8:
            assert status == "full_day", f"Expected full_day for {total_hours}h"
        elif total_hours >= 4:
            assert status == "half_day", f"Expected half_day for {total_hours}h"
        elif total_hours > 0:
            assert status == "short_day", f"Expected short_day for {total_hours}h"


class TestAttendanceGPSVerification:
    """Test GPS verification for attendance"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin to set project location
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        yield
    
    def test_01_set_project_location(self):
        """PATCH /api/projects/{id}/set-location - Set GPS coordinates"""
        project_id = "proj_12f23331b542"  # Vinoth Kumar Villa
        
        resp = self.session.patch(f"{BASE_URL}/api/projects/{project_id}/set-location", json={
            "latitude": 13.0827,
            "longitude": 80.2707
        })
        assert resp.status_code == 200, f"Failed to set location: {resp.text}"
        data = resp.json()
        assert "message" in data, "Response should have message"
        print(f"Set project location: {data}")
    
    def test_02_gps_verification_too_far(self):
        """POST /api/attendance/login - Should reject if >5km from project"""
        # Login as SE
        se_session = requests.Session()
        se_session.headers.update({"Content-Type": "application/json"})
        login_resp = se_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_resp.status_code == 200
        
        # First logout if logged in
        today_resp = se_session.get(f"{BASE_URL}/api/attendance/my-today")
        today_data = today_resp.json()
        for entry in today_data.get("entries", []):
            if not entry.get("logout_time"):
                se_session.post(f"{BASE_URL}/api/attendance/logout", json={"project_id": entry["project_id"]})
        
        # Try to login from a location far away (Delhi coordinates - ~2000km from Chennai)
        project_id = "proj_12f23331b542"
        resp = se_session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": project_id,
            "latitude": 28.6139,  # Delhi
            "longitude": 77.2090
        })
        
        # Should be rejected due to distance
        assert resp.status_code == 400, f"Expected 400 for GPS too far, got {resp.status_code}: {resp.text}"
        assert "km away" in resp.text.lower() or "5km" in resp.text.lower(), f"Error should mention distance: {resp.text}"
        print(f"Correctly rejected login from far location: {resp.json()}")
    
    def test_03_gps_verification_within_range(self):
        """POST /api/attendance/login - Should allow if within 5km"""
        # Login as SE
        se_session = requests.Session()
        se_session.headers.update({"Content-Type": "application/json"})
        login_resp = se_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_resp.status_code == 200
        
        # First logout if logged in
        today_resp = se_session.get(f"{BASE_URL}/api/attendance/my-today")
        today_data = today_resp.json()
        for entry in today_data.get("entries", []):
            if not entry.get("logout_time"):
                se_session.post(f"{BASE_URL}/api/attendance/logout", json={"project_id": entry["project_id"]})
        
        # Try to login from nearby location (within 5km of Chennai)
        project_id = "proj_12f23331b542"
        resp = se_session.post(f"{BASE_URL}/api/attendance/login", json={
            "project_id": project_id,
            "latitude": 13.0850,  # Very close to project location
            "longitude": 80.2720
        })
        
        assert resp.status_code == 200, f"Login should succeed within 5km: {resp.text}"
        print(f"Login succeeded within range: {resp.json()}")
        
        # Cleanup - logout
        se_session.post(f"{BASE_URL}/api/attendance/logout", json={"project_id": project_id})


class TestAttendancePMView:
    """Test PM/Planning view of all SE attendance"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_01_pm_view_all_attendance(self):
        """GET /api/attendance/all - PM can view all SE attendance"""
        # Login as planning
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert login_resp.status_code == 200, f"Planning login failed: {login_resp.text}"
        
        resp = self.session.get(f"{BASE_URL}/api/attendance/all")
        assert resp.status_code == 200, f"Failed to get all attendance: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Total attendance records visible to PM: {len(data)}")
        if data:
            print(f"Sample record: {data[0]}")
    
    def test_02_pm_view_attendance_by_date(self):
        """GET /api/attendance/all?date=YYYY-MM-DD - Filter by date"""
        # Login as planning
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert login_resp.status_code == 200
        
        today = datetime.now().strftime("%Y-%m-%d")
        resp = self.session.get(f"{BASE_URL}/api/attendance/all?date={today}")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        print(f"Attendance records for {today}: {len(data)}")
    
    def test_03_se_cannot_view_all_attendance(self):
        """GET /api/attendance/all - SE should not have access"""
        # Login as SE
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_resp.status_code == 200
        
        resp = self.session.get(f"{BASE_URL}/api/attendance/all")
        assert resp.status_code == 403, f"Expected 403 for SE accessing all attendance, got {resp.status_code}"
        print("Correctly denied SE access to all attendance")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
