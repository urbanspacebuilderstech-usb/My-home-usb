"""
Test Material Receipt OTP and Resend OTP endpoints
Tests for iteration 30 - Material Receipt enhancements with OTP email verification
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMaterialReceiptOTP:
    """Test OTP-related endpoints for material receipt"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as site engineer
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "engineer@constructionos.com", "password": "Demo@1234"}
        )
        if login_response.status_code != 200:
            pytest.skip("Site engineer login failed - skipping tests")
        
        yield
        
        # Logout
        try:
            self.session.post(f"{BASE_URL}/api/auth/logout")
        except:
            pass
    
    def test_resend_otp_without_transit_order(self):
        """Test resend-OTP endpoint fails gracefully when no in-transit order exists"""
        # Try with a non-existent request ID
        response = self.session.post(
            f"{BASE_URL}/api/procurement/v2/resend-otp/nonexistent_request"
        )
        
        # Should return 404 (request not found) or 400 (bad request)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should have detail field"
        print(f"Expected error response: {data}")
    
    def test_transit_orders_endpoint(self):
        """Test GET /procurement/transit endpoint works for site engineer"""
        response = self.session.get(f"{BASE_URL}/api/procurement/transit")
        
        assert response.status_code == 200, f"Transit endpoint failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Transit orders should be a list"
        print(f"Found {len(data)} transit orders")
        
        # If there are any orders, verify structure
        if len(data) > 0:
            order = data[0]
            assert "request_id" in order, "Order should have request_id"
            assert "status" in order, "Order should have status"


class TestAdminLogin:
    """Test admin login and project access"""
    
    def test_admin_login_successful(self):
        """Test admin can login successfully"""
        session = requests.Session()
        
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@constructionos.com", "password": "Demo@1234"}
        )
        
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        
        data = response.json()
        assert "user" in data or "name" in data, "Login response should contain user info"
        print(f"Admin login successful: {data.get('name', data.get('user', {}).get('name', 'unknown'))}")
    
    def test_projects_endpoint(self):
        """Test projects endpoint accessible for admin"""
        session = requests.Session()
        
        # Login as admin
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@constructionos.com", "password": "Demo@1234"}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Admin login failed")
        
        # Get projects
        response = session.get(f"{BASE_URL}/api/projects")
        
        assert response.status_code == 200, f"Projects endpoint failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Projects should be a list"
        print(f"Found {len(data)} projects")
        
        if len(data) > 0:
            project = data[0]
            assert "project_id" in project, "Project should have project_id"
            print(f"First project: {project.get('name', project.get('project_id'))}")


class TestSiteEngineerLogin:
    """Test site engineer login and material receipt access"""
    
    def test_site_engineer_login_successful(self):
        """Test site engineer can login successfully"""
        session = requests.Session()
        
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "engineer@constructionos.com", "password": "Demo@1234"}
        )
        
        assert response.status_code == 200, f"Site engineer login failed: {response.status_code}"
        
        data = response.json()
        assert "user" in data or "name" in data, "Login response should contain user info"
        
        # Check role
        user_data = data.get("user", data)
        role = user_data.get("role", "")
        print(f"Site engineer login successful. Role: {role}")
    
    def test_auth_me_endpoint(self):
        """Test /auth/me returns current user info"""
        session = requests.Session()
        
        # Login first
        login_response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "engineer@constructionos.com", "password": "Demo@1234"}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Login failed")
        
        # Get current user
        response = session.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"/auth/me failed: {response.status_code}"
        
        data = response.json()
        assert "email" in data or "user_id" in data, "Should return user data"
        print(f"Current user: {data.get('email', data.get('name', 'unknown'))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
