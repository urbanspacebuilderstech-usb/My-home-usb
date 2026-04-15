"""
Test Round-Robin Lead Assignment Fix
Tests for:
1. Login with admin credentials
2. Round-robin auto-assigns sales leads when Super Admin creates a sales lead via POST /api/crm/leads with stage_type=sales
3. Pre-Sales → Sales transfer (move lead to stg_appointment) assigns the new Sales lead to a sales team member
4. POST /api/crm/fix-unassigned-sales-leads migration endpoint works
5. GET /api/marketing/distribution-settings returns valid pre_sales_team and sales_team with user details
6. POST /api/marketing/distribution-settings/refresh refreshes team members
7. GET /api/marketing/dashboard auto-refreshes distribution settings and returns team stats
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRoundRobinAssignment:
    """Test round-robin lead assignment functionality"""
    
    session = None
    created_leads = []
    
    @classmethod
    def setup_class(cls):
        """Setup test session with admin login"""
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        cls.created_leads = []
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test data"""
        # Note: In production, we'd delete test leads here
        pass
    
    def test_01_login_admin(self):
        """Test login with admin credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        
        # Handle rate limiting
        if response.status_code == 429:
            pytest.skip("Rate limited - using existing session")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data or "email" in data, "Login response missing user data"
        print(f"Login successful: {data.get('user', {}).get('email', data.get('email'))}")
    
    def test_02_verify_auth_me(self):
        """Verify authenticated session"""
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        
        if response.status_code == 401:
            # Try login again
            login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@constructionos.com",
                "password": "Demo@1234"
            })
            if login_resp.status_code == 429:
                pytest.skip("Rate limited")
            response = self.session.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200, f"Auth check failed: {response.text}"
        data = response.json()
        assert data.get("role") == "super_admin", f"Expected super_admin role, got {data.get('role')}"
        print(f"Authenticated as: {data.get('name')} ({data.get('role')})")
    
    def test_03_get_distribution_settings(self):
        """Test GET /api/marketing/distribution-settings returns valid team data"""
        response = self.session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        
        assert response.status_code == 200, f"Failed to get distribution settings: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "pre_sales_team" in data, "Missing pre_sales_team"
        assert "sales_team" in data, "Missing sales_team"
        assert "pre_sales_team_details" in data, "Missing pre_sales_team_details"
        assert "sales_team_details" in data, "Missing sales_team_details"
        
        # Verify teams have members
        pre_sales_team = data.get("pre_sales_team", [])
        sales_team = data.get("sales_team", [])
        
        print(f"Pre-Sales Team: {len(pre_sales_team)} members")
        print(f"Sales Team: {len(sales_team)} members")
        
        # Verify team details have user info
        if data.get("pre_sales_team_details"):
            for user in data["pre_sales_team_details"]:
                assert "user_id" in user, "Missing user_id in pre_sales_team_details"
                assert "name" in user, "Missing name in pre_sales_team_details"
                print(f"  Pre-Sales: {user.get('name')} ({user.get('user_id')})")
        
        if data.get("sales_team_details"):
            for user in data["sales_team_details"]:
                assert "user_id" in user, "Missing user_id in sales_team_details"
                assert "name" in user, "Missing name in sales_team_details"
                print(f"  Sales: {user.get('name')} ({user.get('user_id')})")
    
    def test_04_refresh_distribution_settings(self):
        """Test POST /api/marketing/distribution-settings/refresh refreshes team members"""
        response = self.session.post(f"{BASE_URL}/api/marketing/distribution-settings/refresh")
        
        assert response.status_code == 200, f"Failed to refresh distribution settings: {response.text}"
        data = response.json()
        
        assert "message" in data, "Missing message in response"
        assert "pre_sales_team" in data, "Missing pre_sales_team in response"
        assert "sales_team" in data, "Missing sales_team in response"
        
        print(f"Refresh result: {data.get('message')}")
        print(f"Pre-Sales Team after refresh: {len(data.get('pre_sales_team', []))} members")
        print(f"Sales Team after refresh: {len(data.get('sales_team', []))} members")
        
        # Verify team members have names
        for user in data.get("pre_sales_team", []):
            assert "user_id" in user, "Missing user_id"
            assert "name" in user, "Missing name"
        
        for user in data.get("sales_team", []):
            assert "user_id" in user, "Missing user_id"
            assert "name" in user, "Missing name"
    
    def test_05_create_sales_lead_with_round_robin(self):
        """Test round-robin auto-assigns sales leads when Super Admin creates a sales lead"""
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_RR_Sales_{unique_id}",
            "email": f"test_rr_sales_{unique_id}@test.com",
            "phone": "9876543210",
            "source": "other",
            "stage_type": "sales",  # Create directly as sales lead
            "notes": "Test lead for round-robin assignment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/leads", json=lead_data)
        
        assert response.status_code == 200, f"Failed to create sales lead: {response.text}"
        data = response.json()
        
        assert "lead_id" in data, "Missing lead_id in response"
        lead_id = data["lead_id"]
        self.created_leads.append(lead_id)
        
        # Verify assigned_to is NOT null (round-robin should have assigned it)
        assigned_to = data.get("assigned_to")
        print(f"Created sales lead: {lead_id}")
        print(f"Assigned to: {assigned_to}")
        
        # The key fix: assigned_to should NOT be null for sales leads
        assert assigned_to is not None, "CRITICAL: Sales lead was NOT assigned via round-robin (assigned_to is null)"
        
        # Verify by fetching the lead
        get_response = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert get_response.status_code == 200, f"Failed to get lead: {get_response.text}"
        lead_data = get_response.json()
        
        assert lead_data.get("assigned_to") is not None, "Lead assigned_to is null after creation"
        assert lead_data.get("assigned_to_name") is not None, "Lead assigned_to_name is null"
        print(f"Verified: Lead assigned to {lead_data.get('assigned_to_name')} ({lead_data.get('assigned_to')})")
    
    def test_06_create_presales_lead_and_transfer_to_sales(self):
        """Test Pre-Sales → Sales transfer assigns the new Sales lead to a sales team member"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Step 1: Create a pre-sales lead
        lead_data = {
            "name": f"TEST_RR_Transfer_{unique_id}",
            "email": f"test_rr_transfer_{unique_id}@test.com",
            "phone": "9876543211",
            "source": "meta"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert response.status_code == 200, f"Failed to create pre-sales lead: {response.text}"
        data = response.json()
        
        lead_id = data["lead_id"]
        self.created_leads.append(lead_id)
        print(f"Created pre-sales lead: {lead_id}")
        
        # Step 2: Move to Appointment Booked (stg_appointment) - this triggers transfer to Sales
        stage_update = {
            "stage_id": "stg_appointment",
            "appointment_date": "2026-04-20",
            "appointment_time": "10:00",
            "appointment_type": "office_visit"
        }
        
        transfer_response = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json=stage_update)
        assert transfer_response.status_code == 200, f"Failed to transfer lead: {transfer_response.text}"
        transfer_data = transfer_response.json()
        
        print(f"Transfer response: {transfer_data}")
        
        # Verify transfer happened
        assert transfer_data.get("transferred_to_sales") == True, "Lead was not transferred to sales"
        
        new_lead_id = transfer_data.get("new_lead_id")
        assert new_lead_id is not None, "Missing new_lead_id in transfer response"
        self.created_leads.append(new_lead_id)
        
        # The key fix: assigned_to should NOT be null for the transferred sales lead
        assigned_to = transfer_data.get("assigned_to")
        print(f"New sales lead: {new_lead_id}")
        print(f"Assigned to: {assigned_to}")
        
        assert assigned_to is not None, "CRITICAL: Transferred sales lead was NOT assigned via round-robin"
        
        # Verify by fetching the new sales lead
        get_response = self.session.get(f"{BASE_URL}/api/crm/leads/{new_lead_id}")
        assert get_response.status_code == 200, f"Failed to get transferred lead: {get_response.text}"
        sales_lead = get_response.json()
        
        assert sales_lead.get("stage_type") == "sales", "Transferred lead is not a sales lead"
        assert sales_lead.get("assigned_to") is not None, "Transferred sales lead assigned_to is null"
        assert sales_lead.get("assigned_to_name") is not None, "Transferred sales lead assigned_to_name is null"
        print(f"Verified: Transferred lead assigned to {sales_lead.get('assigned_to_name')} ({sales_lead.get('assigned_to')})")
    
    def test_07_fix_unassigned_sales_leads_endpoint(self):
        """Test POST /api/crm/fix-unassigned-sales-leads migration endpoint"""
        response = self.session.post(f"{BASE_URL}/api/crm/fix-unassigned-sales-leads")
        
        assert response.status_code == 200, f"Failed to fix unassigned leads: {response.text}"
        data = response.json()
        
        assert "message" in data, "Missing message in response"
        assert "fixed" in data, "Missing fixed count in response"
        
        print(f"Fix unassigned leads result: {data.get('message')}")
        print(f"Fixed: {data.get('fixed')} leads")
        
        if data.get("total_unassigned"):
            print(f"Total unassigned found: {data.get('total_unassigned')}")
    
    def test_08_marketing_dashboard_auto_refresh(self):
        """Test GET /api/marketing/dashboard auto-refreshes distribution settings and returns team stats"""
        response = self.session.get(f"{BASE_URL}/api/marketing/dashboard")
        
        assert response.status_code == 200, f"Failed to get marketing dashboard: {response.text}"
        data = response.json()
        
        # Verify dashboard structure (API returns pre_sales_team and sales_team)
        assert "pre_sales_team" in data, "Missing pre_sales_team"
        assert "sales_team" in data, "Missing sales_team"
        assert "distribution_settings" in data, "Missing distribution_settings"
        
        pre_sales_team = data.get("pre_sales_team", [])
        sales_team = data.get("sales_team", [])
        
        print(f"Pre-Sales Team Stats: {len(pre_sales_team)} members")
        print(f"Sales Team Stats: {len(sales_team)} members")
        
        # Verify stats have required fields
        for stat in pre_sales_team:
            assert "user_id" in stat, "Missing user_id in pre_sales_team"
            assert "name" in stat, "Missing name in pre_sales_team"
            assert "total_leads" in stat, "Missing total_leads in pre_sales_team"
            print(f"  Pre-Sales: {stat.get('name')} - {stat.get('total_leads')} leads, {stat.get('converted', 0)} converted")
        
        for stat in sales_team:
            assert "user_id" in stat, "Missing user_id in sales_team"
            assert "name" in stat, "Missing name in sales_team"
            print(f"  Sales: {stat.get('name')} - {stat.get('total_leads', 0)} leads, {stat.get('appointments', 0)} appointments, {stat.get('deals_closed', 0)} deals")
        
        # Verify sales team has stats (the fix ensures sales_team is populated)
        assert len(sales_team) > 0, "CRITICAL: Sales team stats are empty - distribution settings may not be refreshed"
    
    def test_09_verify_recent_lead_activity_has_assigned_name(self):
        """Test that Recent Lead Activity shows assigned_to_name (not Unassigned) for newly created leads"""
        # Get marketing dashboard which includes recent lead activity
        response = self.session.get(f"{BASE_URL}/api/marketing/dashboard")
        assert response.status_code == 200, f"Failed to get marketing dashboard: {response.text}"
        data = response.json()
        
        recent_activity = data.get("recent_activity", [])
        print(f"Recent Lead Activity: {len(recent_activity)} items")
        
        # Check if any of our test leads appear in recent activity
        test_leads_found = 0
        for activity in recent_activity:
            if "TEST_RR_" in activity.get("name", ""):
                test_leads_found += 1
                assigned_name = activity.get("assigned_to_name")
                print(f"  Test Lead: {activity.get('name')} - Assigned to: {assigned_name}")
                
                # The fix: assigned_to_name should NOT be null or "Unassigned"
                if activity.get("stage_type") == "sales":
                    assert assigned_name is not None, f"Sales lead {activity.get('name')} has null assigned_to_name"
                    assert assigned_name != "Unassigned", f"Sales lead {activity.get('name')} shows 'Unassigned'"
        
        print(f"Found {test_leads_found} test leads in recent activity")
    
    def test_10_verify_sales_leads_list_has_assignments(self):
        """Verify sales leads list shows assigned_to for leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get sales leads: {response.text}"
        leads = response.json()
        
        print(f"Total sales leads: {len(leads)}")
        
        # Check our test leads
        test_leads = [l for l in leads if "TEST_RR_" in l.get("name", "")]
        print(f"Test leads found: {len(test_leads)}")
        
        for lead in test_leads:
            assigned_to = lead.get("assigned_to")
            assigned_name = lead.get("assigned_to_name")
            print(f"  {lead.get('name')}: assigned_to={assigned_to}, assigned_to_name={assigned_name}")
            
            # All test sales leads should have assignments
            assert assigned_to is not None, f"Lead {lead.get('name')} has null assigned_to"
            assert assigned_name is not None, f"Lead {lead.get('name')} has null assigned_to_name"


class TestDistributionSettingsValidation:
    """Additional tests for distribution settings validation"""
    
    session = None
    
    @classmethod
    def setup_class(cls):
        cls.session = requests.Session()
        cls.session.headers.update({"Content-Type": "application/json"})
        # Login
        cls.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
    
    def test_distribution_settings_has_valid_users(self):
        """Verify distribution settings team members are valid active users"""
        # Get distribution settings
        settings_resp = self.session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        if settings_resp.status_code != 200:
            pytest.skip("Could not get distribution settings")
        
        settings = settings_resp.json()
        
        pre_sales_team = settings.get("pre_sales_team", [])
        sales_team = settings.get("sales_team", [])
        
        # Verify pre_sales_team members exist
        for user_id in pre_sales_team:
            # The team_details should have this user
            found = any(u.get("user_id") == user_id for u in settings.get("pre_sales_team_details", []))
            assert found, f"Pre-sales team member {user_id} not found in team_details"
        
        # Verify sales_team members exist
        for user_id in sales_team:
            found = any(u.get("user_id") == user_id for u in settings.get("sales_team_details", []))
            assert found, f"Sales team member {user_id} not found in team_details"
        
        print(f"All {len(pre_sales_team)} pre-sales team members validated")
        print(f"All {len(sales_team)} sales team members validated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
