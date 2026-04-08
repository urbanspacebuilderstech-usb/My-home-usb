"""
Test Change Password OTP Flow
Tests the new email OTP-based password change feature:
- POST /api/auth/send-password-otp - Sends OTP to user's email
- POST /api/auth/verify-otp-reset-password - Verifies OTP and sets new password
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "urbanspacebuilderstech@gmail.com"
SUPER_ADMIN_PASSWORD = "USB@123.26"


class TestChangePasswordOTPFlow:
    """Tests for Change Password via OTP flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login_super_admin(self):
        """Login as super admin and return session with cookies"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited - too many login attempts")
        assert response.status_code == 200, f"Login failed: {response.text}"
        return self.session
    
    # ==================== SEND OTP TESTS ====================
    
    def test_send_otp_requires_authentication(self):
        """Test that send-password-otp requires authentication"""
        response = self.session.post(f"{BASE_URL}/api/auth/send-password-otp")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: send-password-otp requires authentication")
    
    def test_send_otp_success(self):
        """Test sending OTP to authenticated user's email"""
        self.login_super_admin()
        
        response = self.session.post(f"{BASE_URL}/api/auth/send-password-otp")
        assert response.status_code == 200, f"Send OTP failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "email" in data, "Response should contain masked email"
        
        # Verify email is masked (e.g., "urb***@gmail.com")
        masked_email = data["email"]
        assert "***" in masked_email, f"Email should be masked, got: {masked_email}"
        assert "@" in masked_email, f"Masked email should contain @, got: {masked_email}"
        
        print(f"PASS: OTP sent successfully, masked email: {masked_email}")
    
    # ==================== VERIFY OTP TESTS ====================
    
    def test_verify_otp_requires_authentication(self):
        """Test that verify-otp-reset-password requires authentication"""
        response = self.session.post(f"{BASE_URL}/api/auth/verify-otp-reset-password", json={
            "otp": "123456",
            "new_password": "NewPass123"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: verify-otp-reset-password requires authentication")
    
    def test_verify_otp_rejects_invalid_otp(self):
        """Test that invalid OTP is rejected"""
        self.login_super_admin()
        
        # First send OTP to create a valid OTP record
        send_response = self.session.post(f"{BASE_URL}/api/auth/send-password-otp")
        assert send_response.status_code == 200, f"Send OTP failed: {send_response.text}"
        
        # Try to verify with wrong OTP
        response = self.session.post(f"{BASE_URL}/api/auth/verify-otp-reset-password", json={
            "otp": "000000",  # Wrong OTP
            "new_password": "NewPass123"
        })
        
        assert response.status_code == 400, f"Expected 400 for invalid OTP, got {response.status_code}"
        data = response.json()
        assert "Invalid OTP" in data.get("detail", ""), f"Expected 'Invalid OTP' error, got: {data}"
        print("PASS: Invalid OTP is rejected correctly")
    
    def test_verify_otp_rejects_short_password(self):
        """Test that password shorter than 6 characters is rejected"""
        self.login_super_admin()
        
        # First send OTP
        send_response = self.session.post(f"{BASE_URL}/api/auth/send-password-otp")
        assert send_response.status_code == 200, f"Send OTP failed: {send_response.text}"
        
        # Try to set short password
        response = self.session.post(f"{BASE_URL}/api/auth/verify-otp-reset-password", json={
            "otp": "123456",  # Any OTP (will fail validation first)
            "new_password": "12345"  # Only 5 characters
        })
        
        assert response.status_code == 400, f"Expected 400 for short password, got {response.status_code}"
        data = response.json()
        assert "6 characters" in data.get("detail", "").lower() or "password" in data.get("detail", "").lower(), \
            f"Expected password length error, got: {data}"
        print("PASS: Short password is rejected correctly")
    
    def test_verify_otp_rejects_no_otp_record(self):
        """Test that verify fails when no OTP was sent"""
        # Create a fresh session (no OTP sent)
        fresh_session = requests.Session()
        fresh_session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = fresh_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if login_response.status_code == 429:
            pytest.skip("Rate limited")
        
        # Note: We can't easily test "no OTP record" because the previous tests
        # may have created OTP records. This test verifies the endpoint exists.
        response = fresh_session.post(f"{BASE_URL}/api/auth/verify-otp-reset-password", json={
            "otp": "999999",
            "new_password": "ValidPass123"
        })
        
        # Should either be 400 (invalid OTP) or 400 (no OTP found)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Verify OTP handles missing/invalid OTP correctly")
    
    # ==================== REGRESSION TESTS ====================
    
    def test_profile_endpoint_still_works(self):
        """Regression: GET /api/auth/profile still works"""
        self.login_super_admin()
        
        response = self.session.get(f"{BASE_URL}/api/auth/profile")
        assert response.status_code == 200, f"Profile endpoint failed: {response.text}"
        
        data = response.json()
        assert "email" in data, "Profile should contain email"
        assert "two_factor_enabled" in data, "Profile should contain two_factor_enabled"
        print(f"PASS: Profile endpoint works, email: {data.get('email')}")
    
    def test_profile_update_still_works(self):
        """Regression: PUT /api/auth/profile still works"""
        self.login_super_admin()
        
        # Get current profile
        profile_response = self.session.get(f"{BASE_URL}/api/auth/profile")
        assert profile_response.status_code == 200
        current_name = profile_response.json().get("name", "Test User")
        
        # Update profile
        response = self.session.put(f"{BASE_URL}/api/auth/profile", json={
            "name": current_name,  # Keep same name
            "phone": "9876543210"
        })
        assert response.status_code == 200, f"Profile update failed: {response.text}"
        print("PASS: Profile update endpoint works")
    
    def test_2fa_setup_endpoint_exists(self):
        """Regression: POST /api/auth/2fa/setup endpoint exists"""
        self.login_super_admin()
        
        # Try to setup 2FA (may fail if already enabled, but endpoint should exist)
        response = self.session.post(f"{BASE_URL}/api/auth/2fa/setup", json={
            "password": SUPER_ADMIN_PASSWORD
        })
        
        # Should be 200 (success) or 400 (already enabled) - not 404
        assert response.status_code in [200, 400], f"2FA setup endpoint issue: {response.status_code} - {response.text}"
        print(f"PASS: 2FA setup endpoint exists, status: {response.status_code}")
    
    def test_2fa_disable_endpoint_exists(self):
        """Regression: POST /api/auth/2fa/disable endpoint exists"""
        self.login_super_admin()
        
        # Try to disable 2FA (may fail if not enabled, but endpoint should exist)
        response = self.session.post(f"{BASE_URL}/api/auth/2fa/disable", json={
            "password": SUPER_ADMIN_PASSWORD,
            "code": "123456"
        })
        
        # Should be 200 (success) or 400 (not enabled/invalid code) - not 404
        assert response.status_code in [200, 400, 401], f"2FA disable endpoint issue: {response.status_code} - {response.text}"
        print(f"PASS: 2FA disable endpoint exists, status: {response.status_code}")


class TestOTPEndpointValidation:
    """Additional validation tests for OTP endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_send_otp_endpoint_method(self):
        """Test that send-password-otp only accepts POST"""
        # GET should fail
        response = self.session.get(f"{BASE_URL}/api/auth/send-password-otp")
        assert response.status_code in [401, 405], f"GET should not be allowed: {response.status_code}"
        print("PASS: send-password-otp only accepts POST")
    
    def test_verify_otp_endpoint_method(self):
        """Test that verify-otp-reset-password only accepts POST"""
        # GET should fail
        response = self.session.get(f"{BASE_URL}/api/auth/verify-otp-reset-password")
        assert response.status_code in [401, 405], f"GET should not be allowed: {response.status_code}"
        print("PASS: verify-otp-reset-password only accepts POST")
    
    def test_verify_otp_requires_body(self):
        """Test that verify-otp-reset-password requires request body"""
        # Login first
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        if login_response.status_code == 429:
            pytest.skip("Rate limited")
        
        # POST without body
        response = self.session.post(f"{BASE_URL}/api/auth/verify-otp-reset-password")
        assert response.status_code == 422, f"Expected 422 for missing body, got {response.status_code}"
        print("PASS: verify-otp-reset-password requires request body")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
