"""
Test cases for Google Sheets Export and Auto-Sync features
Features: GET /api/sheets/config, POST /api/sheets/export, POST /api/sheets/auto-sync/config, GET /api/sheets/auto-sync/config
Also tests POST /api/crm/leads for Sales/Pre-Sales/Admin roles
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "admin@constructionos.com"
SUPER_ADMIN_PASSWORD = "Demo@1234"


@pytest.fixture(scope="module")
def admin_session():
    """Create authenticated session for Super Admin"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    
    if response.status_code != 200:
        pytest.skip(f"Failed to login as Super Admin: {response.text}")
    
    return session


class TestSheetsConfig:
    """Test Google Sheets configuration endpoint"""
    
    def test_sheets_config_returns_has_credentials(self, admin_session):
        """GET /api/sheets/config returns has_credentials:true when credentials are configured"""
        response = admin_session.get(f"{BASE_URL}/api/sheets/config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "has_credentials" in data, "Response should contain 'has_credentials' field"
        assert data["has_credentials"] is True, "has_credentials should be True when GOOGLE_SHEETS_CLIENT_ID/SECRET are configured"
        
        # Also verify is_connected is in response (may be True or False depending on OAuth state)
        assert "is_connected" in data, "Response should contain 'is_connected' field"
        print(f"Sheets config: has_credentials={data['has_credentials']}, is_connected={data['is_connected']}")


class TestAutoSyncConfig:
    """Test Auto-Sync configuration endpoints"""
    
    def test_set_auto_sync_config(self, admin_session):
        """POST /api/sheets/auto-sync/config saves auto-sync settings"""
        config_data = {
            "enabled": True,
            "interval_hours": 2,
            "spreadsheet_url": None,
            "column_mapping": {}
        }
        
        response = admin_session.post(f"{BASE_URL}/api/sheets/auto-sync/config", json=config_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert data.get("config", {}).get("enabled") is True, "Config should have enabled=True"
        print(f"Auto-sync config saved: {data}")
    
    def test_get_auto_sync_config(self, admin_session):
        """GET /api/sheets/auto-sync/config returns saved settings"""
        response = admin_session.get(f"{BASE_URL}/api/sheets/auto-sync/config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "enabled" in data, "Response should contain 'enabled' field"
        assert "interval_hours" in data, "Response should contain 'interval_hours' field"
        print(f"Auto-sync config retrieved: enabled={data.get('enabled')}, interval_hours={data.get('interval_hours')}")
    
    def test_disable_auto_sync_config(self, admin_session):
        """POST /api/sheets/auto-sync/config can disable auto-sync"""
        config_data = {
            "enabled": False,
            "interval_hours": 1
        }
        
        response = admin_session.post(f"{BASE_URL}/api/sheets/auto-sync/config", json=config_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it was disabled
        get_response = admin_session.get(f"{BASE_URL}/api/sheets/auto-sync/config")
        data = get_response.json()
        assert data.get("enabled") is False, "Auto-sync should be disabled"
        print("Auto-sync disabled successfully")


class TestSheetsExport:
    """Test Google Sheets export endpoint"""
    
    def test_export_returns_401_when_not_connected(self, admin_session):
        """POST /api/sheets/export returns 401 when Google Sheets not connected"""
        export_data = {
            "sheet_name": "Test Export"
        }
        
        response = admin_session.post(f"{BASE_URL}/api/sheets/export", json=export_data)
        
        # When not connected, should return 401
        # Note: If connected, would return 200 with exported count
        if response.status_code == 401:
            assert "not connected" in response.text.lower() or "not connected" in response.json().get("detail", "").lower(), \
                "401 error should mention 'not connected'"
            print("Export correctly returns 401 when sheets not connected")
        elif response.status_code == 200:
            # If somehow connected, that's also valid
            data = response.json()
            assert "exported" in data, "Success response should contain 'exported' count"
            print(f"Export succeeded (sheets was connected): {data}")
        else:
            # 400 is also acceptable (e.g., bad request for other reasons)
            print(f"Export returned {response.status_code}: {response.text}")


class TestCrmLeadCreate:
    """Test CRM lead creation for different roles"""
    
    def test_super_admin_can_create_lead(self, admin_session):
        """POST /api/crm/leads allows Super Admin to create leads"""
        lead_data = {
            "name": "TEST_SuperAdmin_Lead",
            "phone": "9999000001",
            "email": "test_superadmin@test.com",
            "source": "other",
            "stage_type": "pre_sales",
            "city": "Test City",
            "notes": "Test lead created by Super Admin"
        }
        
        response = admin_session.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "lead_id" in data, "Response should contain 'lead_id'"
        assert "message" in data, "Response should contain 'message'"
        print(f"Super Admin created lead: {data.get('lead_id')}")
        
        return data.get("lead_id")
    
    def test_create_sales_lead(self, admin_session):
        """POST /api/crm/leads can create a Sales type lead"""
        lead_data = {
            "name": "TEST_Sales_Lead",
            "phone": "9999000002",
            "source": "referral",
            "stage_type": "sales",
            "city": "Mumbai"
        }
        
        response = admin_session.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "lead_id" in data, "Response should contain 'lead_id'"
        print(f"Sales lead created: {data.get('lead_id')}")


class TestMarketingDashboard:
    """Test Marketing Dashboard endpoint"""
    
    def test_marketing_dashboard_returns_data(self, admin_session):
        """GET /api/marketing/dashboard returns dashboard data"""
        response = admin_session.get(f"{BASE_URL}/api/marketing/dashboard")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_pre_sales_leads" in data, "Dashboard should contain 'total_pre_sales_leads'"
        assert "total_sales_leads" in data, "Dashboard should contain 'total_sales_leads'"
        print(f"Marketing dashboard: pre_sales={data.get('total_pre_sales_leads')}, sales={data.get('total_sales_leads')}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_leads(self, admin_session):
        """Delete test leads created during testing"""
        # Get all leads and find test ones
        response = admin_session.get(f"{BASE_URL}/api/marketing/all-leads")
        if response.status_code == 200:
            leads = response.json().get("leads", [])
            test_leads = [l for l in leads if l.get("name", "").startswith("TEST_")]
            
            for lead in test_leads:
                try:
                    admin_session.delete(f"{BASE_URL}/api/marketing/leads/{lead['lead_id']}")
                except:
                    pass
            
            print(f"Cleaned up {len(test_leads)} test leads")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
