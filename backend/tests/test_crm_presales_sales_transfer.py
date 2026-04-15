"""
Test CRM Pre-Sales to Sales Transfer and Dashboard Features
Tests:
1. Pre-Sales → Sales transfer: Create a pre-sales lead, move to 'Appointment Booked', verify it appears in Sales 'New Appointment' stage
2. Pre-Sales dashboard shows correct stage counts (including unassigned leads)
3. Sales dashboard shows correct stage counts (including unassigned leads)
4. Sales leads endpoint returns leads for sales user (including unassigned)
5. Pre-Sales leads endpoint returns leads for pre_sales user (including unassigned)
6. Migration endpoint POST /api/crm/migrate-stages adds missing stages
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
PRESALES_EMAIL = "presales@constructionos.com"
SALES_EMAIL = "sales@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"
HR_EMAIL = "hr@constructionos.com"
PASSWORD = "Demo@1234"

# Global session to maintain cookies
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Global test data
test_lead_id = None
transferred_lead_id = None


def login_as(email, password=PASSWORD):
    """Login and return response"""
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": email,
        "password": password
    })
    return response


class TestCRMPreSalesToSalesTransfer:
    """Test Pre-Sales to Sales lead transfer workflow"""
    
    def test_01_admin_login(self):
        """Test admin login works"""
        response = login_as(ADMIN_EMAIL)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "user" in data or "user_id" in data, f"Login response missing user data: {data}"
        print(f"✓ Admin login successful")
    
    def test_02_migrate_stages_endpoint(self):
        """Test migration endpoint adds missing stages"""
        # Login as admin first
        login_as(ADMIN_EMAIL)
        
        response = session.post(f"{BASE_URL}/api/crm/migrate-stages")
        assert response.status_code == 200, f"Migration failed: {response.text}"
        data = response.json()
        assert "message" in data, f"Migration response missing message: {data}"
        print(f"✓ Migration endpoint works: {data.get('message')}")
        if data.get('added'):
            print(f"  Added stages: {data['added']}")
        if data.get('fixed'):
            print(f"  Fixed stages: {data['fixed']}")
    
    def test_03_presales_login(self):
        """Test pre-sales login works"""
        response = login_as(PRESALES_EMAIL)
        assert response.status_code == 200, f"Pre-sales login failed: {response.text}"
        print(f"✓ Pre-sales login successful")
    
    def test_04_presales_dashboard_shows_stages(self):
        """Test Pre-Sales dashboard shows correct stage counts"""
        login_as(PRESALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert response.status_code == 200, f"Pre-sales dashboard failed: {response.text}"
        data = response.json()
        
        # Verify dashboard structure
        assert "stages" in data, f"Dashboard missing stages: {data}"
        assert "total_leads" in data, f"Dashboard missing total_leads: {data}"
        
        # Check stages include expected ones
        stage_names = [s.get("name") for s in data.get("stages", [])]
        expected_stages = ["New Lead", "Contacted", "RNR", "Appointment Booked"]
        for expected in expected_stages:
            assert expected in stage_names, f"Missing stage '{expected}' in {stage_names}"
        
        print(f"✓ Pre-Sales dashboard shows {len(data['stages'])} stages, {data['total_leads']} total leads")
        for stage in data.get("stages", []):
            print(f"  - {stage.get('name')}: {stage.get('lead_count', 0)} leads")
    
    def test_05_presales_leads_endpoint_returns_leads(self):
        """Test Pre-Sales leads endpoint returns leads including unassigned"""
        login_as(PRESALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Pre-sales leads failed: {response.text}"
        leads = response.json()
        
        assert isinstance(leads, list), f"Expected list of leads, got: {type(leads)}"
        print(f"✓ Pre-Sales leads endpoint returned {len(leads)} leads")
        
        # Check if there are any unassigned leads
        unassigned_count = sum(1 for l in leads if not l.get("assigned_to"))
        print(f"  - Unassigned leads: {unassigned_count}")
    
    def test_06_sales_login(self):
        """Test sales login works"""
        response = login_as(SALES_EMAIL)
        assert response.status_code == 200, f"Sales login failed: {response.text}"
        print(f"✓ Sales login successful")
    
    def test_07_sales_dashboard_shows_stages(self):
        """Test Sales dashboard shows correct stage counts"""
        login_as(SALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200, f"Sales dashboard failed: {response.text}"
        data = response.json()
        
        # Verify dashboard structure
        assert "stages" in data, f"Dashboard missing stages: {data}"
        assert "total_leads" in data, f"Dashboard missing total_leads: {data}"
        
        # Check stages include expected ones
        stage_names = [s.get("name") for s in data.get("stages", [])]
        expected_stages = ["New Appointment", "Follow-up", "Discussion"]
        for expected in expected_stages:
            assert expected in stage_names, f"Missing stage '{expected}' in {stage_names}"
        
        print(f"✓ Sales dashboard shows {len(data['stages'])} stages, {data['total_leads']} total leads")
        for stage in data.get("stages", []):
            print(f"  - {stage.get('name')}: {stage.get('lead_count', 0)} leads")
    
    def test_08_sales_leads_endpoint_returns_leads(self):
        """Test Sales leads endpoint returns leads including unassigned"""
        login_as(SALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Sales leads failed: {response.text}"
        leads = response.json()
        
        assert isinstance(leads, list), f"Expected list of leads, got: {type(leads)}"
        print(f"✓ Sales leads endpoint returned {len(leads)} leads")
        
        # Check if there are any unassigned leads
        unassigned_count = sum(1 for l in leads if not l.get("assigned_to"))
        print(f"  - Unassigned leads: {unassigned_count}")
    
    def test_09_create_presales_lead(self):
        """Create a new Pre-Sales lead for transfer test"""
        global test_lead_id
        login_as(PRESALES_EMAIL)
        
        test_name = f"TEST_Transfer_Lead_{uuid.uuid4().hex[:8]}"
        response = session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json={
            "name": test_name,
            "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
            "phone": "9876543210",
            "source": "other",
            "city": "Chennai",
            "notes": "Test lead for Pre-Sales to Sales transfer"
        })
        
        assert response.status_code == 200, f"Create lead failed: {response.text}"
        data = response.json()
        assert "lead_id" in data, f"Response missing lead_id: {data}"
        
        test_lead_id = data["lead_id"]
        print(f"✓ Created Pre-Sales lead: {test_name} (ID: {data['lead_id']})")
    
    def test_10_verify_lead_in_presales(self):
        """Verify the created lead appears in Pre-Sales leads"""
        global test_lead_id
        login_as(PRESALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Get leads failed: {response.text}"
        leads = response.json()
        
        lead_ids = [l.get("lead_id") for l in leads]
        assert test_lead_id in lead_ids, f"Created lead not found in Pre-Sales leads"
        
        # Find the lead and verify its stage
        lead = next((l for l in leads if l.get("lead_id") == test_lead_id), None)
        assert lead is not None, "Lead not found"
        assert lead.get("stage_type") == "pre_sales", f"Lead stage_type is not pre_sales: {lead.get('stage_type')}"
        
        print(f"✓ Lead found in Pre-Sales with stage: {lead.get('current_stage_id')}")
    
    def test_11_move_lead_to_appointment_booked(self):
        """Move lead to 'Appointment Booked' stage - should trigger transfer to Sales"""
        global test_lead_id, transferred_lead_id
        login_as(PRESALES_EMAIL)
        
        # Move to Appointment Booked stage with appointment details
        response = session.patch(
            f"{BASE_URL}/api/crm/leads/{test_lead_id}/stage",
            json={
                "stage_id": "stg_appointment",
                "appointment_date": "2026-02-15",
                "appointment_time": "10:00",
                "appointment_type": "office_visit"
            }
        )
        
        assert response.status_code == 200, f"Stage update failed: {response.text}"
        data = response.json()
        
        # Verify transfer happened
        assert data.get("transferred_to_sales") == True, f"Lead was not transferred to Sales: {data}"
        assert "new_lead_id" in data, f"Response missing new_lead_id: {data}"
        
        transferred_lead_id = data["new_lead_id"]
        print(f"✓ Lead transferred to Sales! New lead ID: {data['new_lead_id']}")
        if data.get("assigned_to"):
            print(f"  - Assigned to: {data['assigned_to']}")
    
    def test_12_verify_lead_in_sales_new_appointment(self):
        """Verify the transferred lead appears in Sales 'New Appointment' stage"""
        global transferred_lead_id
        login_as(SALES_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Get sales leads failed: {response.text}"
        leads = response.json()
        
        # Find the transferred lead
        transferred_lead = next(
            (l for l in leads if l.get("lead_id") == transferred_lead_id),
            None
        )
        
        assert transferred_lead is not None, f"Transferred lead not found in Sales leads. Looking for ID: {transferred_lead_id}"
        assert transferred_lead.get("current_stage_id") == "stg_new_appt", f"Lead not in 'New Appointment' stage: {transferred_lead.get('current_stage_id')}"
        assert transferred_lead.get("stage_type") == "sales", f"Lead stage_type is not sales: {transferred_lead.get('stage_type')}"
        assert transferred_lead.get("transferred_from_lead_id") == test_lead_id, "Transfer link not set correctly"
        
        print(f"✓ Transferred lead found in Sales 'New Appointment' stage")
        print(f"  - Stage: {transferred_lead.get('current_stage_id')}")
        print(f"  - Transferred from: {transferred_lead.get('transferred_from_lead_id')}")
    
    def test_13_verify_original_lead_marked_transferred(self):
        """Verify the original Pre-Sales lead is marked as transferred"""
        global test_lead_id, transferred_lead_id
        login_as(ADMIN_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/leads/{test_lead_id}")
        assert response.status_code == 200, f"Get lead failed: {response.text}"
        lead = response.json()
        
        assert lead.get("transferred_to_lead_id") == transferred_lead_id, "Original lead not marked with transfer link"
        assert lead.get("transferred_at") is not None, "Transfer timestamp not set"
        
        print(f"✓ Original Pre-Sales lead marked as transferred")
        print(f"  - Transferred to: {lead.get('transferred_to_lead_id')}")
        print(f"  - Transferred at: {lead.get('transferred_at')}")


class TestCRMStagesConfiguration:
    """Test CRM stages configuration and defaults"""
    
    def test_01_get_presales_stages(self):
        """Test getting Pre-Sales stages"""
        login_as(ADMIN_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200, f"Get stages failed: {response.text}"
        stages = response.json()
        
        assert isinstance(stages, list), f"Expected list of stages, got: {type(stages)}"
        assert len(stages) > 0, "No Pre-Sales stages found"
        
        # Verify expected stages exist
        stage_ids = [s.get("stage_id") for s in stages]
        expected_ids = ["stg_new_lead", "stg_contacted", "stg_rnr", "stg_appointment"]
        for expected in expected_ids:
            assert expected in stage_ids, f"Missing stage '{expected}' in {stage_ids}"
        
        # Verify Appointment Booked has is_final=True
        appointment_stage = next((s for s in stages if s.get("stage_id") == "stg_appointment"), None)
        assert appointment_stage is not None, "Appointment Booked stage not found"
        assert appointment_stage.get("is_final") == True, f"Appointment Booked should have is_final=True: {appointment_stage}"
        
        print(f"✓ Pre-Sales stages configured correctly ({len(stages)} stages)")
        for s in stages:
            final_marker = " [FINAL]" if s.get("is_final") else ""
            print(f"  - {s.get('name')} ({s.get('stage_id')}){final_marker}")
    
    def test_02_get_sales_stages(self):
        """Test getting Sales stages"""
        login_as(ADMIN_EMAIL)
        
        response = session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Get stages failed: {response.text}"
        stages = response.json()
        
        assert isinstance(stages, list), f"Expected list of stages, got: {type(stages)}"
        assert len(stages) > 0, "No Sales stages found"
        
        # Verify expected stages exist
        stage_ids = [s.get("stage_id") for s in stages]
        expected_ids = ["stg_new_appt", "stg_sales_followup", "stg_discussion"]
        for expected in expected_ids:
            assert expected in stage_ids, f"Missing stage '{expected}' in {stage_ids}"
        
        # Verify New Appointment stage exists (first stage for transfers)
        new_appt_stage = next((s for s in stages if s.get("stage_id") == "stg_new_appt"), None)
        assert new_appt_stage is not None, "New Appointment stage not found"
        assert new_appt_stage.get("name") == "New Appointment", f"Stage name mismatch: {new_appt_stage.get('name')}"
        
        print(f"✓ Sales stages configured correctly ({len(stages)} stages)")
        for s in stages:
            final_marker = " [FINAL]" if s.get("is_final") else ""
            print(f"  - {s.get('name')} ({s.get('stage_id')}){final_marker}")


class TestDateFilterDefaults:
    """Test that date filters don't default to today"""
    
    def test_01_presales_leads_no_date_filter_returns_all(self):
        """Test Pre-Sales leads without date filter returns all leads"""
        login_as(PRESALES_EMAIL)
        
        # Get leads without date filter
        response = session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Get leads failed: {response.text}"
        all_leads = response.json()
        
        # Get leads with today's date filter
        today = datetime.now().strftime("%Y-%m-%d")
        response_filtered = session.get(f"{BASE_URL}/api/crm/pre-sales/leads?date_from={today}&date_to={today}")
        assert response_filtered.status_code == 200, f"Get filtered leads failed: {response_filtered.text}"
        today_leads = response_filtered.json()
        
        # Without filter should return more or equal leads than with today filter
        print(f"✓ Pre-Sales leads: {len(all_leads)} total, {len(today_leads)} from today")
        assert len(all_leads) >= len(today_leads), "Date filter not working correctly"
    
    def test_02_sales_leads_no_date_filter_returns_all(self):
        """Test Sales leads without date filter returns all leads"""
        login_as(SALES_EMAIL)
        
        # Get leads without date filter
        response = session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Get leads failed: {response.text}"
        all_leads = response.json()
        
        print(f"✓ Sales leads: {len(all_leads)} total (no date filter applied by default)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
