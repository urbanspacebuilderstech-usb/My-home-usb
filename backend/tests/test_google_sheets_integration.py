"""
Google Sheets Integration Tests for Marketing Board
Tests the Google Sheets connection, preview, sources, and import API endpoints
Note: OAuth flow is not connected (credentials not configured in .env) - UI should show 'Setup Required'
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGoogleSheetsIntegration:
    """Test Google Sheets integration endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as super admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super_admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.user = login_resp.json()
        assert self.user.get("role") == "super_admin", f"Expected super_admin, got {self.user.get('role')}"
        print(f"Logged in as super_admin: {self.user.get('email')}")
        
        yield
        
        # Cleanup: Logout
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_sheets_config_endpoint_requires_auth(self):
        """Test that sheets config requires authentication"""
        # Create new session without auth
        new_session = requests.Session()
        resp = new_session.get(f"{BASE_URL}/api/sheets/config")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("PASS: /api/sheets/config requires authentication")
    
    def test_sheets_config_returns_correct_structure(self):
        """Test GET /api/sheets/config returns expected structure"""
        resp = self.session.get(f"{BASE_URL}/api/sheets/config")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        
        # Verify expected fields exist
        assert "is_connected" in data, "Missing 'is_connected' field"
        assert "has_credentials" in data, "Missing 'has_credentials' field"
        assert "sources" in data, "Missing 'sources' field"
        
        # Since credentials are not configured, has_credentials should be False
        assert data["has_credentials"] == False, f"Expected has_credentials=False, got {data['has_credentials']}"
        
        # Not connected since no OAuth flow completed
        assert data["is_connected"] == False, f"Expected is_connected=False, got {data['is_connected']}"
        
        print(f"PASS: /api/sheets/config returns correct structure")
        print(f"  - is_connected: {data['is_connected']}")
        print(f"  - has_credentials: {data['has_credentials']}")
        print(f"  - sources: {data['sources']}")
    
    def test_sheets_oauth_login_fails_without_credentials(self):
        """Test that OAuth login fails when credentials are not configured"""
        resp = self.session.get(f"{BASE_URL}/api/sheets/oauth/login")
        
        # Should fail with 400 since credentials are not configured
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "detail" in data, "Missing 'detail' field in error response"
        assert "credentials not configured" in data["detail"].lower(), f"Unexpected error message: {data['detail']}"
        
        print("PASS: /api/sheets/oauth/login correctly rejects when credentials not configured")
    
    def test_sheets_preview_requires_connection(self):
        """Test that sheet preview requires Google Sheets connection"""
        resp = self.session.post(f"{BASE_URL}/api/sheets/preview", json={
            "spreadsheet_url": "https://docs.google.com/spreadsheets/d/test_spreadsheet_id/edit"
        })
        
        # Should fail with 401 since not connected
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "detail" in data, "Missing 'detail' field in error response"
        assert "not connected" in data["detail"].lower(), f"Unexpected error message: {data['detail']}"
        
        print("PASS: /api/sheets/preview correctly requires connection")
    
    def test_sheets_sources_endpoint(self):
        """Test GET /api/sheets/sources returns empty sources"""
        resp = self.session.get(f"{BASE_URL}/api/sheets/sources")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "sources" in data, "Missing 'sources' field"
        assert isinstance(data["sources"], list), "sources should be a list"
        
        print(f"PASS: /api/sheets/sources returns {len(data['sources'])} sources")
    
    def test_sheets_import_requires_source(self):
        """Test that import requires a valid source"""
        resp = self.session.post(f"{BASE_URL}/api/sheets/import", json={
            "source_id": "non_existent_source"
        })
        
        # Should fail with 404 since source doesn't exist
        assert resp.status_code in [404, 401], f"Expected 404 or 401, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "detail" in data, "Missing 'detail' field in error response"
        
        print(f"PASS: /api/sheets/import correctly handles non-existent source: {data['detail']}")
    
    def test_sheets_disconnect_when_not_connected(self):
        """Test disconnecting when already disconnected"""
        resp = self.session.post(f"{BASE_URL}/api/sheets/disconnect")
        
        # Should succeed even when not connected (idempotent)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "message" in data, "Missing 'message' field"
        assert "disconnected" in data["message"].lower(), f"Unexpected message: {data['message']}"
        
        print("PASS: /api/sheets/disconnect is idempotent")
    
    def test_sheets_delete_non_existent_source(self):
        """Test deleting a non-existent source"""
        resp = self.session.delete(f"{BASE_URL}/api/sheets/sources/non_existent_source_123")
        
        # Should succeed or return 404
        assert resp.status_code in [200, 404], f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
        
        print(f"PASS: /api/sheets/sources/{{source_id}} DELETE returns {resp.status_code}")


class TestGoogleSheetsAccessControl:
    """Test access control for Google Sheets endpoints"""
    
    def test_non_super_admin_cannot_access_sheets_config(self):
        """Test that non-super-admin users cannot access sheets endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as pre_sales user
        login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "presales@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Pre-sales user not found, skipping access control test")
        
        user = login_resp.json()
        print(f"Logged in as {user.get('role')}: {user.get('email')}")
        
        # Try to access sheets config
        resp = session.get(f"{BASE_URL}/api/sheets/config")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        
        print("PASS: Non-super-admin cannot access /api/sheets/config")
        
        # Logout
        session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_non_super_admin_cannot_access_sheets_sources(self):
        """Test that non-super-admin users cannot access sheets sources"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as CRE user
        login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("CRE user not found, skipping access control test")
        
        user = login_resp.json()
        print(f"Logged in as {user.get('role')}: {user.get('email')}")
        
        # Try to access sheets sources
        resp = session.get(f"{BASE_URL}/api/sheets/sources")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"
        
        print("PASS: Non-super-admin cannot access /api/sheets/sources")
        
        # Logout
        session.post(f"{BASE_URL}/api/auth/logout")


class TestSheetsSourceCRUD:
    """Test CRUD operations for sheet sources (without actual Google connection)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as super admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super_admin
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        yield
        
        # Cleanup
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_add_source_fails_without_connection(self):
        """Test that adding a source requires connection for validation"""
        # Without OAuth connection, trying to add a source should work
        # (the actual Google API call happens during preview, not source creation)
        resp = self.session.post(f"{BASE_URL}/api/sheets/sources", json={
            "name": "Test Website Source",
            "spreadsheet_url": "https://docs.google.com/spreadsheets/d/test123/edit",
            "sheet_name": "Sheet1",
            "column_mapping": {"A": "name", "B": "phone", "C": "email"},
            "custom_fields": []
        })
        
        # This should succeed at the DB level since we're just storing config
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "source" in data or "message" in data, f"Unexpected response: {data}"
        
        print("PASS: POST /api/sheets/sources accepts source configuration")
        
        # Clean up - get the source ID and delete it
        sources_resp = self.session.get(f"{BASE_URL}/api/sheets/sources")
        if sources_resp.status_code == 200:
            sources = sources_resp.json().get("sources", [])
            for source in sources:
                if source.get("name") == "Test Website Source":
                    delete_resp = self.session.delete(f"{BASE_URL}/api/sheets/sources/{source.get('source_id')}")
                    print(f"Cleaned up test source: {delete_resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
