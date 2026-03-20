"""
Test HR User Creation and Deletion Endpoints
Tests the new user management features:
- POST /api/hr/users/create (Super Admin and HR)
- DELETE /api/hr/users/{user_id} (Super Admin only)
- HR role restrictions for creating super_admin/hr roles
- Password validation
- Email uniqueness
- Login with newly created user
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user emails - use unique prefix for easy cleanup
TEST_EMAIL_PREFIX = "test_user_creation_"


class TestHRUserCreation:
    """Tests for user creation and deletion by Super Admin and HR"""
    
    # Store session cookies and created user IDs for cleanup
    super_admin_session = None
    hr_session = None
    created_user_ids = []
    created_user_emails = []

    @classmethod
    def setup_class(cls):
        """Setup Super Admin and HR sessions once for all tests"""
        time.sleep(2)  # Initial delay to avoid rate limiting
        
        # Super Admin login
        resp = requests.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"},
            allow_redirects=False
        )
        assert resp.status_code == 200, f"Super Admin login failed: {resp.status_code}"
        cls.super_admin_session = requests.Session()
        cls.super_admin_session.cookies.update(resp.cookies)
        
        time.sleep(1)  # Delay between logins
        
        # HR login
        resp_hr = requests.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "hr@constructionos.com"},
            allow_redirects=False
        )
        assert resp_hr.status_code == 200, f"HR login failed: {resp_hr.status_code}"
        cls.hr_session = requests.Session()
        cls.hr_session.cookies.update(resp_hr.cookies)

    @classmethod
    def teardown_class(cls):
        """Cleanup test users after all tests complete"""
        time.sleep(1)
        if cls.super_admin_session:
            for user_id in cls.created_user_ids:
                try:
                    cls.super_admin_session.delete(f"{BASE_URL}/api/hr/users/{user_id}")
                    time.sleep(0.3)
                except Exception:
                    pass

    def _delay(self):
        """Add delay to avoid rate limiting"""
        time.sleep(0.5)

    # ============ SUPER ADMIN USER CREATION TESTS ============
    
    def test_01_super_admin_create_user_success(self):
        """Super Admin can create a new user with email/password/role"""
        unique_email = f"{TEST_EMAIL_PREFIX}{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "Test123456",
                "confirm_password": "Test123456",
                "role": "site_engineer",
                "name": "TEST_Created User"
            }
        )
        
        assert resp.status_code == 200, f"User creation failed: {resp.status_code} - {resp.text}"
        data = resp.json()
        
        # Validate response structure
        assert "user_id" in data, "Response missing user_id"
        assert data["email"] == unique_email.lower(), "Email mismatch"  # API lowercases email
        assert data["role"] == "site_engineer", "Role mismatch"
        assert data["name"] == "TEST_Created User", "Name mismatch"
        assert data["is_active"] == True, "User should be active"
        assert "password_hash" not in data, "Password hash should not be returned"
        
        # Store for cleanup and verification
        TestHRUserCreation.created_user_ids.append(data["user_id"])
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        print(f"✓ Super Admin created user: {unique_email} with role site_engineer")

    def test_02_super_admin_can_create_super_admin_role(self):
        """Super Admin can create another super_admin user"""
        unique_email = f"{TEST_EMAIL_PREFIX}admin_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "AdminPass123",
                "confirm_password": "AdminPass123",
                "role": "super_admin",
                "name": "TEST_New Admin"
            }
        )
        
        assert resp.status_code == 200, f"Super Admin role creation failed: {resp.text}"
        data = resp.json()
        assert data["role"] == "super_admin"
        
        TestHRUserCreation.created_user_ids.append(data["user_id"])
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        print(f"✓ Super Admin created another super_admin: {unique_email}")

    def test_03_super_admin_can_create_hr_role(self):
        """Super Admin can create an HR user"""
        unique_email = f"{TEST_EMAIL_PREFIX}hr_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "HRPass123",
                "confirm_password": "HRPass123",
                "role": "hr",
                "name": "TEST_New HR"
            }
        )
        
        assert resp.status_code == 200, f"HR role creation failed: {resp.text}"
        data = resp.json()
        assert data["role"] == "hr"
        
        TestHRUserCreation.created_user_ids.append(data["user_id"])
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        print(f"✓ Super Admin created HR user: {unique_email}")

    # ============ HR USER CREATION TESTS ============
    
    def test_04_hr_can_create_regular_user(self):
        """HR can create users with regular roles (not super_admin or hr)"""
        unique_email = f"{TEST_EMAIL_PREFIX}by_hr_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.hr_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "UserPass123",
                "confirm_password": "UserPass123",
                "role": "accountant",
                "name": "TEST_HR Created Accountant"
            }
        )
        
        assert resp.status_code == 200, f"HR user creation failed: {resp.status_code} - {resp.text}"
        data = resp.json()
        assert data["role"] == "accountant"
        
        TestHRUserCreation.created_user_ids.append(data["user_id"])
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        print(f"✓ HR created accountant user: {unique_email}")

    def test_05_hr_cannot_create_super_admin_role(self):
        """HR cannot create super_admin users - should return 403"""
        unique_email = f"{TEST_EMAIL_PREFIX}forbidden_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.hr_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "AdminPass123",
                "confirm_password": "AdminPass123",
                "role": "super_admin",
                "name": "TEST_Forbidden Admin"
            }
        )
        
        assert resp.status_code == 403, f"Expected 403 for HR creating super_admin, got {resp.status_code}"
        assert "cannot create Super Admin" in resp.text or "HR cannot" in resp.text
        
        print(f"✓ HR correctly blocked from creating super_admin role")

    def test_06_hr_cannot_create_hr_role(self):
        """HR cannot create other HR users - should return 403"""
        unique_email = f"{TEST_EMAIL_PREFIX}forbidden_hr_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.hr_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "HRPass123",
                "confirm_password": "HRPass123",
                "role": "hr",
                "name": "TEST_Forbidden HR"
            }
        )
        
        assert resp.status_code == 403, f"Expected 403 for HR creating hr role, got {resp.status_code}"
        
        print(f"✓ HR correctly blocked from creating hr role")

    # ============ VALIDATION TESTS ============
    
    def test_07_password_mismatch_validation(self):
        """Password mismatch should return 400"""
        unique_email = f"{TEST_EMAIL_PREFIX}mismatch_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "Test123456",
                "confirm_password": "DifferentPass",
                "role": "site_engineer",
                "name": "TEST_Mismatch"
            }
        )
        
        assert resp.status_code == 400, f"Expected 400 for password mismatch, got {resp.status_code}"
        assert "match" in resp.text.lower()
        
        print(f"✓ Password mismatch correctly validated")

    def test_08_password_length_validation(self):
        """Password less than 6 chars should return 400"""
        unique_email = f"{TEST_EMAIL_PREFIX}short_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "12345",
                "confirm_password": "12345",
                "role": "site_engineer",
                "name": "TEST_Short"
            }
        )
        
        assert resp.status_code == 400, f"Expected 400 for short password, got {resp.status_code}"
        assert "6 character" in resp.text.lower() or "at least" in resp.text.lower()
        
        print(f"✓ Password length validation works correctly")

    def test_09_email_uniqueness_validation(self):
        """Duplicate email should return 400"""
        # First create a user
        unique_email = f"{TEST_EMAIL_PREFIX}duplicate_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        resp1 = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "Test123456",
                "confirm_password": "Test123456",
                "role": "site_engineer",
                "name": "TEST_First"
            }
        )
        assert resp1.status_code == 200
        TestHRUserCreation.created_user_ids.append(resp1.json()["user_id"])
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        self._delay()
        
        # Try to create with same email
        resp2 = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "Test123456",
                "confirm_password": "Test123456",
                "role": "accountant",
                "name": "TEST_Duplicate"
            }
        )
        
        assert resp2.status_code == 400, f"Expected 400 for duplicate email, got {resp2.status_code}"
        assert "already exists" in resp2.text.lower()
        
        print(f"✓ Email uniqueness validation works correctly")

    # ============ DELETE USER TESTS ============
    
    def test_10_super_admin_can_delete_user(self):
        """Super Admin can delete users"""
        # Create a user to delete
        unique_email = f"{TEST_EMAIL_PREFIX}delete_me_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        create_resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "DeleteMe123",
                "confirm_password": "DeleteMe123",
                "role": "site_engineer",
                "name": "TEST_ToDelete"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user_id"]
        
        self._delay()
        
        # Delete the user
        delete_resp = TestHRUserCreation.super_admin_session.delete(
            f"{BASE_URL}/api/hr/users/{user_id}"
        )
        
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.status_code} - {delete_resp.text}"
        assert "deleted" in delete_resp.text.lower()
        
        self._delay()
        
        # Verify user no longer exists - try to get users list and check
        users_resp = TestHRUserCreation.super_admin_session.get(f"{BASE_URL}/api/hr/users")
        assert users_resp.status_code == 200
        users = users_resp.json()
        user_emails = [u.get("email") for u in users]
        assert unique_email.lower() not in user_emails, "User should be deleted"
        
        print(f"✓ Super Admin successfully deleted user: {unique_email}")

    def test_11_hr_cannot_delete_user(self):
        """HR cannot delete users - should return 403"""
        # Create a user to attempt deletion
        unique_email = f"{TEST_EMAIL_PREFIX}hr_del_{uuid.uuid4().hex[:8]}@test.com"
        self._delay()
        
        create_resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": "HRDelete123",
                "confirm_password": "HRDelete123",
                "role": "site_engineer",
                "name": "TEST_HRCannotDelete"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user_id"]
        TestHRUserCreation.created_user_ids.append(user_id)
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        self._delay()
        
        # HR tries to delete
        delete_resp = TestHRUserCreation.hr_session.delete(
            f"{BASE_URL}/api/hr/users/{user_id}"
        )
        
        assert delete_resp.status_code == 403, f"Expected 403 for HR delete, got {delete_resp.status_code}"
        
        print(f"✓ HR correctly blocked from deleting users")

    # ============ LOGIN WITH NEW USER TEST ============
    
    def test_12_login_with_newly_created_user(self):
        """Login with newly created user email/password works"""
        unique_email = f"{TEST_EMAIL_PREFIX}login_test_{uuid.uuid4().hex[:8]}@test.com"
        password = "LoginTest123"
        self._delay()
        
        # Create the user
        create_resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": unique_email,
                "password": password,
                "confirm_password": password,
                "role": "site_engineer",
                "name": "TEST_LoginTest"
            }
        )
        assert create_resp.status_code == 200
        user_id = create_resp.json()["user_id"]
        TestHRUserCreation.created_user_ids.append(user_id)
        TestHRUserCreation.created_user_emails.append(unique_email)
        
        self._delay()
        
        # Login with the new user
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": unique_email, "password": password},
            allow_redirects=False
        )
        
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code} - {login_resp.text}"
        login_data = login_resp.json()
        assert login_data.get("email") == unique_email.lower()
        assert login_data.get("role") == "site_engineer"
        
        self._delay()
        
        # Verify session works - call /api/auth/me
        new_session = requests.Session()
        new_session.cookies.update(login_resp.cookies)
        me_resp = new_session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 200
        assert me_resp.json().get("email") == unique_email.lower()
        
        print(f"✓ Login with newly created user successful: {unique_email}")

    # ============ MISSING FIELDS VALIDATION ============
    
    def test_13_missing_required_fields(self):
        """Missing required fields should return 400"""
        self._delay()
        
        # Missing email
        resp = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "password": "Test123456",
                "confirm_password": "Test123456",
                "role": "site_engineer"
            }
        )
        assert resp.status_code == 400, f"Expected 400 for missing email, got {resp.status_code}"
        
        self._delay()
        
        # Missing password
        resp2 = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": f"{TEST_EMAIL_PREFIX}nopwd@test.com",
                "role": "site_engineer"
            }
        )
        assert resp2.status_code == 400, f"Expected 400 for missing password, got {resp2.status_code}"
        
        self._delay()
        
        # Missing role
        resp3 = TestHRUserCreation.super_admin_session.post(
            f"{BASE_URL}/api/hr/users/create",
            json={
                "email": f"{TEST_EMAIL_PREFIX}norole@test.com",
                "password": "Test123456",
                "confirm_password": "Test123456"
            }
        )
        assert resp3.status_code == 400, f"Expected 400 for missing role, got {resp3.status_code}"
        
        print(f"✓ Missing required fields validation works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
