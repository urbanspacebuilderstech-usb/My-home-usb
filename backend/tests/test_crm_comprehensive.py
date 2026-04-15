"""
Comprehensive CRM Testing - Pre-Sales, Sales, HR Portal, RNR Count, Lead Transfer
Tests: Login, Pre-Sales dashboard, Sales dashboard, RNR count, Lead transfer, HR Portal
Uses module-scoped session to avoid rate limiting
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@constructionos.com"
ADMIN_PASSWORD = "Demo@1234"


@pytest.fixture(scope="module")
def auth_session():
    """Module-scoped authenticated session to avoid rate limiting"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login once for all tests
    login_response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    print(f"✓ Logged in as {ADMIN_EMAIL}")
    yield session
    
    # Cleanup - logout
    try:
        session.post(f"{BASE_URL}/api/auth/logout")
    except:
        pass


class TestLogin:
    """Login tests - run first"""
    
    def test_login_success(self):
        """Test login with admin credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_id" in data or "email" in data, "Login response missing user data"
        print(f"✓ Login successful for {ADMIN_EMAIL}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code in [401, 400, 429], f"Expected 401/400/429, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected")


class TestAuthEndpoints:
    """Auth endpoint tests"""
    
    def test_auth_me_endpoint(self, auth_session):
        """Test /api/auth/me returns current user"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        assert data.get("email") == ADMIN_EMAIL, f"Expected {ADMIN_EMAIL}, got {data.get('email')}"
        print(f"✓ Auth/me returns correct user: {data.get('name')}")


class TestPreSalesDashboard:
    """Pre-Sales dashboard tests"""
    
    def test_presales_dashboard_loads(self, auth_session):
        """Test Pre-Sales dashboard loads correctly"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert response.status_code == 200, f"Pre-Sales dashboard failed: {response.text}"
        data = response.json()
        assert "stages" in data, "Dashboard missing stages"
        assert "total_leads" in data, "Dashboard missing total_leads"
        print(f"✓ Pre-Sales dashboard loaded: {data['total_leads']} total leads")
        
        # Verify stages exist
        stage_names = [s['name'] for s in data['stages']]
        expected_stages = ['New Lead', 'Contacted', 'RNR', 'New RNR Leads', 'Follow-up', 'Appointment Booked']
        for stage in expected_stages:
            assert stage in stage_names, f"Missing stage: {stage}"
        print(f"✓ All expected Pre-Sales stages present: {stage_names}")
    
    def test_presales_leads_endpoint(self, auth_session):
        """Test Pre-Sales leads endpoint returns leads"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Pre-Sales leads failed: {response.text}"
        leads = response.json()
        assert isinstance(leads, list), "Leads should be a list"
        print(f"✓ Pre-Sales leads endpoint returned {len(leads)} leads")
    
    def test_presales_stages_endpoint(self, auth_session):
        """Test Pre-Sales stages endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200, f"Pre-Sales stages failed: {response.text}"
        stages = response.json()
        assert isinstance(stages, list), "Stages should be a list"
        assert len(stages) >= 6, f"Expected at least 6 stages, got {len(stages)}"
        
        # Check for RNR and New RNR Leads stages
        stage_ids = [s['stage_id'] for s in stages]
        assert 'stg_rnr' in stage_ids, "Missing stg_rnr stage"
        assert 'stg_new_rnr' in stage_ids, "Missing stg_new_rnr stage"
        print(f"✓ Pre-Sales stages: {[s['name'] for s in stages]}")
    
    def test_presales_leads_without_date_filter(self, auth_session):
        """Test Pre-Sales leads without date filter returns all leads"""
        response = auth_session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Pre-Sales leads failed: {response.text}"
        leads = response.json()
        assert isinstance(leads, list), "Leads should be a list"
        # Should return leads without filtering by date
        print(f"✓ Pre-Sales leads without date filter returned {len(leads)} leads (no date restriction)")


class TestSalesDashboard:
    """Sales dashboard tests"""
    
    def test_sales_dashboard_loads(self, auth_session):
        """Test Sales dashboard loads correctly"""
        response = auth_session.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200, f"Sales dashboard failed: {response.text}"
        data = response.json()
        assert "stages" in data, "Dashboard missing stages"
        assert "total_leads" in data, "Dashboard missing total_leads"
        print(f"✓ Sales dashboard loaded: {data['total_leads']} total leads")
    
    def test_sales_leads_endpoint(self, auth_session):
        """Test Sales leads endpoint returns leads"""
        response = auth_session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Sales leads failed: {response.text}"
        leads = response.json()
        assert isinstance(leads, list), "Leads should be a list"
        print(f"✓ Sales leads endpoint returned {len(leads)} leads")
    
    def test_sales_stages_endpoint(self, auth_session):
        """Test Sales stages endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Sales stages failed: {response.text}"
        stages = response.json()
        assert isinstance(stages, list), "Stages should be a list"
        assert len(stages) >= 10, f"Expected at least 10 stages, got {len(stages)}"
        
        # Check for key stages
        stage_ids = [s['stage_id'] for s in stages]
        assert 'stg_new_appt' in stage_ids, "Missing stg_new_appt stage"
        print(f"✓ Sales stages: {[s['name'] for s in stages]}")


class TestLeadOperations:
    """Lead CRUD and stage operations"""
    
    def test_create_presales_lead(self, auth_session):
        """Test creating a Pre-Sales lead"""
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_Lead_{unique_id}",
            "email": f"test_{unique_id}@example.com",
            "phone": f"98765{unique_id[:5]}",
            "source": "other",
            "city": "Chennai",
            "notes": "Test lead created by automated test"
        }
        response = auth_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert response.status_code == 200, f"Create lead failed: {response.text}"
        data = response.json()
        assert "lead_id" in data, "Response missing lead_id"
        print(f"✓ Created Pre-Sales lead: {data['lead_id']}")
    
    def test_lead_stage_update(self, auth_session):
        """Test lead stage update API"""
        # Create a lead first
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_StageUpdate_{unique_id}",
            "email": f"stage_{unique_id}@example.com",
            "phone": f"98765{unique_id[:5]}",
            "source": "other"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200, f"Create lead failed: {create_response.text}"
        lead_id = create_response.json()['lead_id']
        
        # Update stage to Contacted
        stage_response = auth_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_contacted"
        })
        assert stage_response.status_code == 200, f"Stage update failed: {stage_response.text}"
        
        # Verify stage changed
        lead_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_response.status_code == 200
        lead = lead_response.json()
        assert lead['current_stage_id'] == 'stg_contacted', f"Stage should be stg_contacted, got {lead['current_stage_id']}"
        print(f"✓ Lead stage updated to Contacted")


class TestRNRCount:
    """RNR count increment tests"""
    
    def test_rnr_count_increment(self, auth_session):
        """Test RNR count increments when lead moved to RNR stage"""
        # First create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_RNR_{unique_id}",
            "email": f"rnr_{unique_id}@example.com",
            "phone": f"98765{unique_id[:5]}",
            "source": "other"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200, f"Create lead failed: {create_response.text}"
        lead_id = create_response.json()['lead_id']
        print(f"✓ Created test lead: {lead_id}")
        
        # Get initial lead state
        lead_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_response.status_code == 200, f"Get lead failed: {lead_response.text}"
        initial_rnr_count = lead_response.json().get('rnr_count', 0)
        print(f"  Initial RNR count: {initial_rnr_count}")
        
        # Move to RNR stage
        stage_response = auth_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_rnr"
        })
        assert stage_response.status_code == 200, f"Stage change failed: {stage_response.text}"
        print(f"✓ Moved lead to RNR stage")
        
        # Verify RNR count incremented
        lead_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_response.status_code == 200, f"Get lead failed: {lead_response.text}"
        new_rnr_count = lead_response.json().get('rnr_count', 0)
        assert new_rnr_count == initial_rnr_count + 1, f"RNR count should be {initial_rnr_count + 1}, got {new_rnr_count}"
        print(f"✓ RNR count incremented: {initial_rnr_count} → {new_rnr_count}")
    
    def test_rnr_count_on_new_rnr_stage(self, auth_session):
        """Test RNR count increments when lead moved to New RNR Leads stage"""
        # Create a lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_NewRNR_{unique_id}",
            "email": f"newrnr_{unique_id}@example.com",
            "phone": f"98765{unique_id[:5]}",
            "source": "other"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()['lead_id']
        
        # Move to New RNR Leads stage
        stage_response = auth_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_new_rnr"
        })
        assert stage_response.status_code == 200, f"Stage change failed: {stage_response.text}"
        
        # Verify RNR count incremented
        lead_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        assert lead_response.status_code == 200
        rnr_count = lead_response.json().get('rnr_count', 0)
        assert rnr_count >= 1, f"RNR count should be at least 1, got {rnr_count}"
        print(f"✓ RNR count on New RNR Leads stage: {rnr_count}")


class TestLeadTransfer:
    """Pre-Sales to Sales transfer tests"""
    
    def test_presales_to_sales_transfer(self, auth_session):
        """Test lead transfer from Pre-Sales to Sales when moved to Appointment Booked"""
        # Create a Pre-Sales lead
        unique_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_Transfer_{unique_id}",
            "email": f"transfer_{unique_id}@example.com",
            "phone": f"98765{unique_id[:5]}",
            "source": "referral",
            "city": "Chennai"
        }
        create_response = auth_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()['lead_id']
        print(f"✓ Created Pre-Sales lead: {lead_id}")
        
        # Move to Appointment Booked stage (final stage - triggers transfer)
        stage_response = auth_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": "stg_appointment",
            "appointment_date": "2026-02-15",
            "appointment_time": "10:00 AM",
            "appointment_type": "office_visit"
        })
        assert stage_response.status_code == 200, f"Stage change failed: {stage_response.text}"
        data = stage_response.json()
        
        # Verify transfer happened
        assert data.get('transferred_to_sales') == True, "Lead should be transferred to Sales"
        assert 'new_lead_id' in data, "Response should contain new_lead_id"
        new_sales_lead_id = data['new_lead_id']
        print(f"✓ Lead transferred to Sales: {new_sales_lead_id}")
        
        # Verify the new Sales lead exists
        sales_lead_response = auth_session.get(f"{BASE_URL}/api/crm/leads/{new_sales_lead_id}")
        assert sales_lead_response.status_code == 200, f"Get Sales lead failed: {sales_lead_response.text}"
        sales_lead = sales_lead_response.json()
        assert sales_lead['stage_type'] == 'sales', "New lead should be in Sales"
        assert sales_lead['current_stage_id'] == 'stg_new_appt', f"New lead should be in New Appointment stage, got {sales_lead['current_stage_id']}"
        assert sales_lead.get('transferred_from_lead_id') == lead_id, "Should reference original Pre-Sales lead"
        print(f"✓ Sales lead verified: stage={sales_lead['current_stage_id']}, transferred_from={sales_lead.get('transferred_from_lead_id')}")


class TestDistributionSettings:
    """Round-robin distribution settings tests"""
    
    def test_distribution_settings_endpoint(self, auth_session):
        """Test round-robin distribution settings API"""
        response = auth_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert response.status_code == 200, f"Distribution settings failed: {response.text}"
        data = response.json()
        assert "pre_sales_team" in data or "enabled" in data, "Response should contain distribution settings"
        print(f"✓ Distribution settings endpoint works")


class TestHRPortal:
    """HR Portal tests"""
    
    def test_hr_dashboard(self, auth_session):
        """Test HR dashboard endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/hr/dashboard")
        assert response.status_code == 200, f"HR dashboard failed: {response.text}"
        data = response.json()
        assert "total_staff" in data, "Dashboard missing total_staff"
        print(f"✓ HR dashboard loaded: {data.get('total_staff')} total staff")
    
    def test_hr_staff_list(self, auth_session):
        """Test HR staff list endpoint (Active employees)"""
        response = auth_session.get(f"{BASE_URL}/api/hr/staff")
        assert response.status_code == 200, f"HR staff list failed: {response.text}"
        staff = response.json()
        assert isinstance(staff, list), "Staff should be a list"
        print(f"✓ HR staff list returned {len(staff)} employees")
    
    def test_hr_terminated_staff(self, auth_session):
        """Test HR terminated staff endpoint (Left employees)"""
        response = auth_session.get(f"{BASE_URL}/api/hr/terminated-staff")
        assert response.status_code == 200, f"HR terminated staff failed: {response.text}"
        terminated = response.json()
        assert isinstance(terminated, list), "Terminated staff should be a list"
        print(f"✓ HR terminated staff list returned {len(terminated)} employees")
    
    def test_hr_settings(self, auth_session):
        """Test HR settings endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/hr/settings")
        assert response.status_code == 200, f"HR settings failed: {response.text}"
        data = response.json()
        assert "department_timings" in data or "leave_limits" in data, "Settings should contain department_timings or leave_limits"
        print(f"✓ HR settings loaded")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
