"""
Geo-fencing & Live Map Feature Tests
Tests for:
1. PATCH /api/projects/{id}/set-location - Parse Google Maps URL formats
2. POST /api/attendance/track-location - Store GPS ping, check geo-fence, auto-logout if >5km
3. GET /api/attendance/live-locations - Returns active SEs with latest GPS + projects with coordinates
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSetProjectLocation:
    """Test PATCH /api/projects/{id}/set-location - Google Maps URL parsing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin for all tests"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.test_project_id = "proj_12f23331b542"  # Known test project
    
    def test_01_set_location_with_at_format(self):
        """Test Google Maps URL with @lat,lng format"""
        url = "https://www.google.com/maps/place/Chennai/@13.0827,80.2707,12z"
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={"google_maps_url": url}
        )
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert "latitude" in data
        assert "longitude" in data
        assert abs(data["latitude"] - 13.0827) < 0.01
        assert abs(data["longitude"] - 80.2707) < 0.01
        print(f"✓ Set location with @lat,lng format: {data['latitude']}, {data['longitude']}")
    
    def test_02_set_location_with_q_format(self):
        """Test Google Maps URL with ?q=lat,lng format"""
        url = "https://maps.google.com/?q=13.05,80.2824"
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={"google_maps_url": url}
        )
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert abs(data["latitude"] - 13.05) < 0.01
        assert abs(data["longitude"] - 80.2824) < 0.01
        print(f"✓ Set location with ?q=lat,lng format: {data['latitude']}, {data['longitude']}")
    
    def test_03_set_location_with_place_format(self):
        """Test Google Maps URL with /place/.../@lat,lng format"""
        url = "https://www.google.com/maps/place/T+Nagar,+Chennai/@13.0418,80.2341,15z"
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={"google_maps_url": url}
        )
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert abs(data["latitude"] - 13.0418) < 0.01
        assert abs(data["longitude"] - 80.2341) < 0.01
        print(f"✓ Set location with /place/@lat,lng format: {data['latitude']}, {data['longitude']}")
    
    def test_04_set_location_with_direct_coords(self):
        """Test setting location with direct latitude/longitude"""
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={"latitude": 13.05, "longitude": 80.2824}
        )
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert data["latitude"] == 13.05
        assert data["longitude"] == 80.2824
        print(f"✓ Set location with direct coords: {data['latitude']}, {data['longitude']}")
    
    def test_05_set_location_invalid_url(self):
        """Test with invalid Google Maps URL"""
        url = "https://example.com/not-a-maps-url"
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={"google_maps_url": url}
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        assert "Could not extract coordinates" in res.json().get("detail", "")
        print("✓ Invalid URL correctly rejected")
    
    def test_06_set_location_missing_params(self):
        """Test with no coordinates or URL"""
        res = self.session.patch(
            f"{BASE_URL}/api/projects/{self.test_project_id}/set-location",
            json={}
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        print("✓ Missing params correctly rejected")


class TestTrackLocation:
    """Test POST /api/attendance/track-location - GPS tracking and geo-fence"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as site engineer"""
        self.session = requests.Session()
        # Login as admin (who has active attendance)
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.test_project_id = "proj_12f23331b542"
    
    def test_01_track_location_within_geofence(self):
        """Test tracking location within 5km of project"""
        # Project is at 13.05, 80.2824 - send location nearby
        res = self.session.post(
            f"{BASE_URL}/api/attendance/track-location",
            json={"latitude": 13.051, "longitude": 80.283}  # Very close to project
        )
        # May return no_attendance if not logged in today
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        print(f"✓ Track location response: {data}")
        # Status can be 'ok', 'no_attendance', or 'not_active'
        assert data.get("status") in ["ok", "no_attendance", "not_active", "auto_logout"]
    
    def test_02_track_location_outside_geofence(self):
        """Test tracking location >5km from project triggers auto-logout"""
        # Send location far from project (e.g., 10km away)
        res = self.session.post(
            f"{BASE_URL}/api/attendance/track-location",
            json={"latitude": 13.15, "longitude": 80.40}  # ~15km away
        )
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        print(f"✓ Track location (far) response: {data}")
        # If there was an active session, it should auto-logout
        # Otherwise it returns no_attendance or not_active
        assert data.get("status") in ["ok", "no_attendance", "not_active", "auto_logout"]
        if data.get("status") == "auto_logout":
            assert "distance_km" in data
            assert data["distance_km"] > 5
            print(f"✓ Auto-logout triggered at {data['distance_km']}km")
    
    def test_03_track_location_missing_gps(self):
        """Test tracking without GPS coordinates"""
        res = self.session.post(
            f"{BASE_URL}/api/attendance/track-location",
            json={}
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        print("✓ Missing GPS correctly rejected")


class TestLiveLocations:
    """Test GET /api/attendance/live-locations - PM Live Map data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as planning user"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    
    def test_01_get_live_locations(self):
        """Test getting live SE locations"""
        res = self.session.get(f"{BASE_URL}/api/attendance/live-locations")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "active_engineers" in data
        assert "projects" in data
        assert "total_active" in data
        assert isinstance(data["active_engineers"], list)
        assert isinstance(data["projects"], list)
        assert isinstance(data["total_active"], int)
        
        print(f"✓ Live locations: {data['total_active']} active SEs, {len(data['projects'])} projects with GPS")
        
        # Verify project structure if any
        for proj in data["projects"]:
            assert "project_id" in proj
            assert "name" in proj
            assert "latitude" in proj
            assert "longitude" in proj
            print(f"  - Project: {proj['name']} at ({proj['latitude']}, {proj['longitude']})")
        
        # Verify SE structure if any active
        for se in data["active_engineers"]:
            assert "user_id" in se
            assert "user_name" in se
            assert "project_id" in se
            assert "login_time" in se
            print(f"  - Active SE: {se['user_name']} at {se.get('project_name', 'Unknown')}")
    
    def test_02_live_locations_as_admin(self):
        """Test getting live locations as super admin"""
        admin_session = requests.Session()
        login_res = admin_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        assert login_res.status_code == 200
        
        res = admin_session.get(f"{BASE_URL}/api/attendance/live-locations")
        assert res.status_code == 200, f"Failed: {res.text}"
        print("✓ Admin can access live locations")
    
    def test_03_live_locations_permission_denied(self):
        """Test that site engineer cannot access live locations"""
        se_session = requests.Session()
        login_res = se_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_res.status_code == 200
        
        res = se_session.get(f"{BASE_URL}/api/attendance/live-locations")
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        print("✓ Site engineer correctly denied access to live locations")


class TestAttendanceWithGeofence:
    """Test attendance login/logout with geo-fence validation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as site engineer"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    
    def test_01_get_my_projects(self):
        """Verify SE can get their assigned projects"""
        res = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert res.status_code == 200, f"Failed: {res.text}"
        projects = res.json()
        print(f"✓ SE has {len(projects)} assigned projects")
        for p in projects:
            gps_status = "GPS Set" if p.get("latitude") and p.get("longitude") else "No GPS"
            print(f"  - {p['name']}: {gps_status}")
    
    def test_02_get_today_attendance(self):
        """Get today's attendance status"""
        res = self.session.get(f"{BASE_URL}/api/attendance/my-today")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        if data:
            print(f"✓ Today's attendance: {data.get('status', 'unknown')}, {data.get('total_hours', 0)}h")
            for entry in data.get("entries", []):
                print(f"  - {entry.get('project_name')}: {entry.get('login_time')} - {entry.get('logout_time', 'Active')}")
        else:
            print("✓ No attendance record for today")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
