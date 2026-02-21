"""
Test Auth Invitation System - Testing features:
1. POST /api/auth/invite-user - Create user with 'invited' status
2. POST /api/auth/session - Google login rejects non-invited users (403)
3. POST /api/auth/demo-login - Demo login works for existing users
4. GET /api/users - List users including invited ones
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if BASE_URL:
    BASE_URL = BASE_URL.rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def super_admin_session(api_client):
    """Get super admin session via demo login"""
    response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "admin@constructionos.com"
    })
    if response.status_code == 200:
        # Extract session cookie
        session_token = response.cookies.get("session_token")
        if session_token:
            api_client.cookies.set("session_token", session_token)
        return response.json()
    pytest.skip(f"Super Admin demo login failed: {response.status_code} - {response.text}")


class TestDemoLogin:
    """Test Demo Login functionality"""
    
    def test_demo_login_super_admin(self, api_client):
        """Test demo login as Super Admin"""
        response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data, "Response should contain user_id"
        assert data["email"] == "admin@constructionos.com"
        assert data["role"] == "super_admin"
        print(f"✓ Demo login successful for Super Admin: {data['name']}")
    
    def test_demo_login_accountant(self, api_client):
        """Test demo login as Accountant"""
        response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "accountant"
        print(f"✓ Demo login successful for Accountant: {data['name']}")
    
    def test_demo_login_project_manager(self, api_client):
        """Test demo login as Project Manager"""
        response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "project_manager"
        print(f"✓ Demo login successful for PM: {data['name']}")
    
    def test_demo_login_client(self, api_client):
        """Test demo login as Client"""
        response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "mohan@client.com"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["role"] == "client"
        print(f"✓ Demo login successful for Client: {data['name']}")
    
    def test_demo_login_invalid_user(self, api_client):
        """Test demo login with non-existent user returns 404"""
        response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "nonexistent@test.com"
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Demo login correctly rejects non-existent user")


class TestUserInvitation:
    """Test User Invitation System - Super Admin invites users"""
    
    def test_invite_user_as_super_admin(self, api_client, super_admin_session):
        """Super Admin can invite a new user"""
        unique_email = f"TEST_invited_{uuid.uuid4().hex[:8]}@example.com"
        
        response = api_client.post(f"{BASE_URL}/api/auth/invite-user", json={
            "email": unique_email,
            "role": "project_manager",
            "name": "Test Invited User"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert data["email"] == unique_email.lower()
        assert data["role"] == "project_manager"
        # Email may not be sent if Resend API key not configured
        assert "email_sent" in data
        print(f"✓ User invited successfully: {unique_email}")
        print(f"  Email sent: {data.get('email_sent')}")
        
        # Store for cleanup
        return unique_email
    
    def test_invited_user_exists_in_database(self, api_client, super_admin_session):
        """Verify invited user is created in users collection with 'invited' status"""
        # First invite a user
        unique_email = f"TEST_verify_{uuid.uuid4().hex[:8]}@example.com"
        
        invite_response = api_client.post(f"{BASE_URL}/api/auth/invite-user", json={
            "email": unique_email,
            "role": "site_engineer",
            "name": "Verify Invited User"
        })
        
        assert invite_response.status_code == 200
        
        # Now get users list
        users_response = api_client.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        
        users = users_response.json()
        invited_user = next((u for u in users if u["email"] == unique_email.lower()), None)
        
        assert invited_user is not None, f"Invited user not found in users list"
        assert invited_user["role"] == "site_engineer"
        # Status should be 'invited' until user logs in
        assert invited_user.get("status") == "invited", f"User status should be 'invited', got: {invited_user.get('status')}"
        print(f"✓ Invited user exists in database with 'invited' status")
    
    def test_invite_duplicate_user_fails(self, api_client, super_admin_session):
        """Cannot invite a user that already exists"""
        response = api_client.post(f"{BASE_URL}/api/auth/invite-user", json={
            "email": "admin@constructionos.com",  # This user already exists
            "role": "project_manager",
            "name": "Duplicate User"
        })
        
        assert response.status_code == 400, f"Expected 400 for duplicate user, got {response.status_code}"
        data = response.json()
        assert "already exists" in data.get("detail", "").lower()
        print("✓ Cannot invite duplicate user")
    
    def test_invite_user_non_admin_forbidden(self, api_client):
        """Non-Super Admin cannot invite users"""
        # Login as Accountant (not super admin)
        login_response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert login_response.status_code == 200
        
        # Try to invite user
        unique_email = f"TEST_forbidden_{uuid.uuid4().hex[:8]}@example.com"
        response = api_client.post(f"{BASE_URL}/api/auth/invite-user", json={
            "email": unique_email,
            "role": "project_manager",
            "name": "Forbidden Invite"
        })
        
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("✓ Non-Super Admin cannot invite users (403 Forbidden)")
    
    def test_get_invitations_super_admin(self, api_client, super_admin_session):
        """Super Admin can view all invitations"""
        response = api_client.get(f"{BASE_URL}/api/auth/invitations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        invitations = response.json()
        assert isinstance(invitations, list)
        print(f"✓ Get invitations successful: {len(invitations)} invitations found")


class TestGoogleAuthRejection:
    """Test that Google OAuth rejects non-invited users"""
    
    def test_google_auth_session_no_session_id(self, api_client):
        """Google auth session exchange fails without session ID"""
        response = api_client.post(f"{BASE_URL}/api/auth/session")
        
        assert response.status_code == 400, f"Expected 400 without session ID, got {response.status_code}"
        print("✓ Auth session correctly requires session ID")
    
    def test_google_auth_session_invalid_session_id(self, api_client):
        """Google auth session exchange fails with invalid session ID"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/session",
            headers={"X-Session-ID": "invalid_session_123"}
        )
        
        # Should fail because it can't fetch session data from auth service
        assert response.status_code in [400, 403], f"Expected 400 or 403 for invalid session, got {response.status_code}"
        print("✓ Auth session correctly rejects invalid session ID")


class TestAuthenticatedEndpoints:
    """Test authenticated endpoints work properly"""
    
    def test_get_auth_me(self, api_client, super_admin_session):
        """Get current user info"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        assert "role" in data
        print(f"✓ /auth/me returns current user: {data['email']}")
    
    def test_get_users_list(self, api_client, super_admin_session):
        """Get list of all users"""
        response = api_client.get(f"{BASE_URL}/api/users")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0, "Should have at least one user"
        
        # Check user structure
        user = users[0]
        assert "user_id" in user
        assert "email" in user
        assert "role" in user
        print(f"✓ /users returns {len(users)} users")
    
    def test_logout(self, api_client, super_admin_session):
        """Test logout endpoint"""
        response = api_client.post(f"{BASE_URL}/api/auth/logout")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("message") == "Logged out"
        print("✓ Logout successful")


class TestCleanup:
    """Cleanup test data created during tests"""
    
    def test_cleanup_test_users(self, api_client):
        """Delete TEST_ prefixed users created during tests"""
        # Re-login as super admin
        login_response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login for cleanup")
        
        # Get all users
        users_response = api_client.get(f"{BASE_URL}/api/users")
        if users_response.status_code != 200:
            pytest.skip("Could not fetch users for cleanup")
        
        users = users_response.json()
        test_users = [u for u in users if u.get("email", "").startswith("test_")]
        
        deleted = 0
        for user in test_users:
            delete_response = api_client.delete(f"{BASE_URL}/api/users/{user['user_id']}")
            if delete_response.status_code in [200, 204]:
                deleted += 1
        
        print(f"✓ Cleanup: Deleted {deleted} test users")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
