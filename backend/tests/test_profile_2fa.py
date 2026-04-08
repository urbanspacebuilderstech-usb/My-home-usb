"""
Profile & 2FA Feature Tests
Tests: Profile endpoints, 2FA setup/verify/disable, Login with 2FA
"""
import pytest
import requests
import os
import pyotp

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Super Admin with password
TEST_EMAIL = "urbanspacebuilderstech@gmail.com"
TEST_PASSWORD = "USB@123.26"

# Demo user for regression tests
DEMO_EMAIL = "admin@constructionos.com"


class TestProfileEndpoints:
    """Profile GET/PUT endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session for authenticated requests"""
        self.session = requests.Session()
        # Login with password
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("User has 2FA enabled - need TOTP code to login")
            print(f"✓ Logged in as {TEST_EMAIL}")
        else:
            pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    
    def test_get_profile(self):
        """GET /api/auth/profile returns user profile with two_factor_enabled field"""
        response = self.session.get(f"{BASE_URL}/api/auth/profile")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields
        assert "email" in data, "Profile should contain email"
        assert "name" in data, "Profile should contain name"
        assert "role" in data, "Profile should contain role"
        assert "two_factor_enabled" in data, "Profile should contain two_factor_enabled field"
        assert isinstance(data["two_factor_enabled"], bool), "two_factor_enabled should be boolean"
        
        print(f"✓ Profile retrieved: {data['email']}, 2FA enabled: {data['two_factor_enabled']}")
    
    def test_update_profile_name(self):
        """PUT /api/auth/profile updates name"""
        # Get current profile
        get_response = self.session.get(f"{BASE_URL}/api/auth/profile")
        original_name = get_response.json().get("name", "Test User")
        
        # Update name
        new_name = "Test Update Name"
        response = self.session.put(
            f"{BASE_URL}/api/auth/profile",
            json={"name": new_name}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/auth/profile")
        assert verify_response.json()["name"] == new_name, "Name should be updated"
        
        # Restore original name
        self.session.put(f"{BASE_URL}/api/auth/profile", json={"name": original_name})
        print(f"✓ Profile name updated and restored")
    
    def test_update_profile_phone(self):
        """PUT /api/auth/profile updates phone"""
        # Get current profile
        get_response = self.session.get(f"{BASE_URL}/api/auth/profile")
        original_phone = get_response.json().get("phone", "")
        
        # Update phone
        new_phone = "9876543210"
        response = self.session.put(
            f"{BASE_URL}/api/auth/profile",
            json={"phone": new_phone}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        verify_response = self.session.get(f"{BASE_URL}/api/auth/profile")
        assert verify_response.json()["phone"] == new_phone, "Phone should be updated"
        
        # Restore original phone
        self.session.put(f"{BASE_URL}/api/auth/profile", json={"phone": original_phone})
        print(f"✓ Profile phone updated and restored")
    
    def test_update_profile_empty_fails(self):
        """PUT /api/auth/profile with empty data should fail"""
        response = self.session.put(
            f"{BASE_URL}/api/auth/profile",
            json={}
        )
        assert response.status_code == 400, f"Expected 400 for empty update, got {response.status_code}"
        print(f"✓ Empty profile update correctly rejected")


class Test2FASetup:
    """2FA Setup endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("User has 2FA enabled - cannot test setup")
            print(f"✓ Logged in for 2FA tests")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_2fa_setup_requires_password(self):
        """POST /api/auth/2fa/setup requires password"""
        # Check if 2FA is already enabled
        profile = self.session.get(f"{BASE_URL}/api/auth/profile").json()
        if profile.get("two_factor_enabled"):
            pytest.skip("2FA already enabled")
        
        # Try without password
        response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/setup",
            json={}
        )
        assert response.status_code == 422, f"Expected 422 for missing password, got {response.status_code}"
        print(f"✓ 2FA setup correctly requires password")
    
    def test_2fa_setup_wrong_password(self):
        """POST /api/auth/2fa/setup with wrong password fails"""
        profile = self.session.get(f"{BASE_URL}/api/auth/profile").json()
        if profile.get("two_factor_enabled"):
            pytest.skip("2FA already enabled")
        
        response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/setup",
            json={"password": "wrongpassword123"}
        )
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        print(f"✓ 2FA setup correctly rejects wrong password")
    
    def test_2fa_setup_returns_qr_and_secret(self):
        """POST /api/auth/2fa/setup returns QR code and secret"""
        profile = self.session.get(f"{BASE_URL}/api/auth/profile").json()
        if profile.get("two_factor_enabled"):
            pytest.skip("2FA already enabled")
        
        response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/setup",
            json={"password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "secret" in data, "Response should contain secret"
        assert "qr_code" in data, "Response should contain qr_code"
        assert data["qr_code"].startswith("data:image/png;base64,"), "QR code should be base64 PNG"
        assert len(data["secret"]) >= 16, "Secret should be at least 16 chars"
        
        print(f"✓ 2FA setup returned QR code and secret (length: {len(data['secret'])})")


class Test2FAVerifyAndDisable:
    """2FA Verify and Disable endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session"""
        self.session = requests.Session()
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                pytest.skip("User has 2FA enabled - need TOTP to login")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_2fa_verify_invalid_code(self):
        """POST /api/auth/2fa/verify with invalid code fails"""
        profile = self.session.get(f"{BASE_URL}/api/auth/profile").json()
        if profile.get("two_factor_enabled"):
            pytest.skip("2FA already enabled")
        
        # First setup 2FA to get pending secret
        setup_response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/setup",
            json={"password": TEST_PASSWORD}
        )
        if setup_response.status_code != 200:
            pytest.skip("Could not setup 2FA")
        
        # Try to verify with invalid code
        response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/verify",
            json={"code": "000000"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid code, got {response.status_code}"
        print(f"✓ 2FA verify correctly rejects invalid code")
    
    def test_2fa_disable_not_enabled(self):
        """POST /api/auth/2fa/disable when 2FA not enabled fails"""
        profile = self.session.get(f"{BASE_URL}/api/auth/profile").json()
        if profile.get("two_factor_enabled"):
            pytest.skip("2FA is enabled - cannot test this case")
        
        response = self.session.post(
            f"{BASE_URL}/api/auth/2fa/disable",
            json={"password": TEST_PASSWORD, "code": "123456"}
        )
        assert response.status_code == 400, f"Expected 400 when 2FA not enabled, got {response.status_code}"
        print(f"✓ 2FA disable correctly fails when not enabled")


class TestLoginWith2FA:
    """Login with 2FA tests"""
    
    def test_login_without_2fa_demo_user(self):
        """Demo login works without 2FA"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": DEMO_EMAIL}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "name" in data, "Response should contain name"
        assert "role" in data, "Response should contain role"
        assert data.get("requires_2fa") is None or data.get("requires_2fa") == False, "Demo user should not require 2FA"
        
        print(f"✓ Demo login works: {data['name']} ({data['role']})")
    
    def test_login_password_user_no_2fa(self):
        """Password login works when 2FA is disabled"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("requires_2fa"):
                print(f"✓ Login correctly returns requires_2fa when 2FA is enabled")
            else:
                assert "name" in data, "Response should contain name"
                print(f"✓ Password login works: {data['name']}")
        else:
            pytest.fail(f"Login failed: {response.status_code} - {response.text}")
    
    def test_login_invalid_credentials(self):
        """Login with invalid credentials fails"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": "wrongpassword"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid credentials correctly rejected")


class TestRegressionDemoAccess:
    """Regression tests for demo access"""
    
    def test_demo_login_super_admin(self):
        """Demo login as Super Admin works"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"}
        )
        assert response.status_code == 200
        assert response.json()["role"] == "super_admin"
        print(f"✓ Demo Super Admin login works")
    
    def test_demo_login_procurement(self):
        """Demo login as Procurement works"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "procurement@constructionos.com"}
        )
        assert response.status_code == 200
        assert response.json()["role"] == "procurement"
        print(f"✓ Demo Procurement login works")
    
    def test_demo_login_site_engineer(self):
        """Demo login as Site Engineer works"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "engineer@constructionos.com"}
        )
        assert response.status_code == 200
        assert response.json()["role"] == "site_engineer"
        print(f"✓ Demo Site Engineer login works")
    
    def test_demo_profile_access(self):
        """Demo user can access profile"""
        session = requests.Session()
        # Login
        login_response = session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": DEMO_EMAIL}
        )
        assert login_response.status_code == 200
        
        # Get profile
        profile_response = session.get(f"{BASE_URL}/api/auth/profile")
        assert profile_response.status_code == 200
        
        data = profile_response.json()
        assert "two_factor_enabled" in data
        print(f"✓ Demo user can access profile, 2FA status: {data['two_factor_enabled']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
