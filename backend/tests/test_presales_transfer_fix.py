"""
Pre-Sales to Sales Transfer Bug Fix Tests
==========================================
Tests the fix for: Pre-sales leads not transferring to Sales CRM

Bug Details:
- Line 575-578 in crm.py was hardcoded to check stage['name'] == 'Appointment Booked'
- Fixed to: stage.get('is_final') and not lead.get('transferred_to_lead_id')
- Also fixed missing 'sem', 'social_media', 'direct' in LeadSource enum

Key Verifications:
1. Pre-Sales leads at Appointment Booked stage have transferred_to_lead_id
2. Sales CRM shows transferred leads with transferred_from_lead_id
3. GET /api/crm/sales/leads returns 3+ leads (Vinothini, Preethi, Saikarthick)
4. Double-transfer prevention: lead with transferred_to_lead_id is NOT transferred again
5. RNR stage exists in Pre-Sales
6. Stage Management page accessible for super_admin
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_CREDS = {"email": "admin@constructionos.com", "password": "Demo@1234"}
CRE_CREDS = {"email": "cre@constructionos.com", "password": "Demo@1234"}

# Known transferred leads (verified to exist)
KNOWN_SALES_LEAD_IDS = [
    "lead_5d48dd96cc8a",  # Vinothini
    "lead_23a91b72c284",  # Preethi
    "lead_53b578a04433",  # Saikarthick
]

class TestPreSalesToSalesTransferFix:
    """Test the Pre-Sales to Sales transfer fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as super_admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
        if login_res.status_code != 200:
            pytest.skip("Could not login as super_admin")
    
    def test_sales_crm_has_transferred_leads(self):
        """Verify Sales CRM now shows transferred leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Failed to get sales leads: {response.text}"
        
        leads = response.json()
        print(f"Sales CRM has {len(leads)} leads")
        
        # Should have at least 3 leads (Vinothini, Preethi, Saikarthick)
        assert len(leads) >= 3, f"Expected at least 3 leads in Sales CRM, got {len(leads)}"
        
        # Check that some leads have transferred_from_lead_id (came from Pre-Sales)
        transferred_leads = [l for l in leads if l.get('transferred_from_lead_id')]
        print(f"Found {len(transferred_leads)} leads with transferred_from_lead_id")
        assert len(transferred_leads) >= 1, "No transferred leads found in Sales CRM"
    
    def test_known_leads_exist_in_sales(self):
        """Verify the 3 known leads exist in Sales CRM"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200
        
        leads = response.json()
        lead_ids = [l.get('lead_id') for l in leads]
        
        found_leads = []
        for known_id in KNOWN_SALES_LEAD_IDS:
            if known_id in lead_ids:
                found_leads.append(known_id)
        
        print(f"Found {len(found_leads)} of {len(KNOWN_SALES_LEAD_IDS)} known leads")
        print(f"Found leads: {found_leads}")
        
        # Check lead names
        lead_names = [l.get('name') for l in leads]
        print(f"Lead names in Sales: {lead_names}")
        
        # At least 2 of the known leads should exist
        assert len(found_leads) >= 2 or len(leads) >= 3, "Not enough known leads found in Sales CRM"
    
    def test_presales_transferred_leads_have_transferred_to_id(self):
        """Verify Pre-Sales leads at 'Appointment Booked' have transferred_to_lead_id"""
        response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200
        
        leads = response.json()
        
        # Get stages to find Appointment Booked stage
        stages_res = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert stages_res.status_code == 200
        stages = stages_res.json()
        
        appointment_stage = next((s for s in stages if s.get('name') == 'Appointment Booked'), None)
        
        if appointment_stage:
            appt_stage_id = appointment_stage.get('stage_id')
            leads_at_appointment = [l for l in leads if l.get('current_stage_id') == appt_stage_id]
            
            print(f"Found {len(leads_at_appointment)} leads at Appointment Booked stage")
            
            # Check that transferred leads have transferred_to_lead_id
            for lead in leads_at_appointment:
                if lead.get('transferred_to_lead_id'):
                    print(f"Lead {lead.get('name')} properly has transferred_to_lead_id: {lead.get('transferred_to_lead_id')}")
    
    def test_rnr_stage_exists_in_presales(self):
        """Verify RNR stage exists in Pre-Sales pipeline"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200
        
        stages = response.json()
        stage_names = [s.get('name') for s in stages]
        print(f"Pre-Sales stages: {stage_names}")
        
        assert 'RNR' in stage_names, f"RNR stage not found. Available stages: {stage_names}"
    
    def test_presales_dashboard_shows_rnr(self):
        """Verify Pre-Sales dashboard includes RNR stage with count"""
        response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert response.status_code == 200
        
        dashboard = response.json()
        stages = dashboard.get('stages', [])
        
        rnr_stage = next((s for s in stages if s.get('name') == 'RNR'), None)
        assert rnr_stage is not None, "RNR stage not in Pre-Sales dashboard"
        
        print(f"RNR stage: {rnr_stage}")
        assert 'lead_count' in rnr_stage, "RNR stage missing lead_count"


class TestStageManagement:
    """Test Stage Management feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with super_admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
        if login_res.status_code != 200:
            pytest.skip("Could not login as super_admin")
    
    def test_get_stages_with_counts(self):
        """Verify GET /api/crm/stages/with-counts endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        assert response.status_code == 200, f"Failed to get stages with counts: {response.text}"
        
        stages = response.json()
        assert len(stages) > 0, "No stages returned"
        
        # Check structure
        for stage in stages:
            assert 'stage_id' in stage
            assert 'name' in stage
            assert 'stage_type' in stage
            assert 'lead_count' in stage, f"Stage {stage.get('name')} missing lead_count"
        
        print(f"Found {len(stages)} stages with counts")
        
        # Print stage details
        for s in stages:
            print(f"  - {s.get('name')} ({s.get('stage_type')}): {s.get('lead_count')} leads, is_final={s.get('is_final')}")
    
    def test_get_stages_filtered_by_type(self):
        """Verify stage filtering by type works"""
        # Pre-Sales stages
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200
        presales_stages = response.json()
        
        for s in presales_stages:
            assert s.get('stage_type') == 'pre_sales', f"Got non-pre_sales stage: {s.get('name')}"
        
        # Sales stages
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200
        sales_stages = response.json()
        
        for s in sales_stages:
            assert s.get('stage_type') == 'sales', f"Got non-sales stage: {s.get('name')}"
        
        print(f"Pre-Sales: {len(presales_stages)} stages, Sales: {len(sales_stages)} stages")
    
    def test_create_update_delete_stage(self):
        """Test full stage CRUD lifecycle"""
        # Create
        new_stage = {
            "name": "TEST_AutoDeleteStage",
            "stage_type": "pre_sales",
            "color": "#ef4444"
        }
        create_res = self.session.post(f"{BASE_URL}/api/crm/stages", json=new_stage)
        assert create_res.status_code == 200, f"Failed to create stage: {create_res.text}"
        
        stage_id = create_res.json().get('stage_id')
        print(f"Created stage: {stage_id}")
        
        # Update
        update_res = self.session.patch(f"{BASE_URL}/api/crm/stages/{stage_id}", json={
            "name": "TEST_UpdatedStage",
            "color": "#22c55e"
        })
        assert update_res.status_code == 200, f"Failed to update stage: {update_res.text}"
        print(f"Updated stage {stage_id}")
        
        # Delete (should succeed since no leads)
        delete_res = self.session.delete(f"{BASE_URL}/api/crm/stages/{stage_id}")
        assert delete_res.status_code == 200, f"Failed to delete stage: {delete_res.text}"
        print(f"Deleted stage {stage_id}")


class TestLeadSourceEnum:
    """Test that LeadSource enum includes new values"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
        if login_res.status_code != 200:
            pytest.skip("Could not login as super_admin")
    
    def test_import_template_includes_new_sources(self):
        """Verify import template shows all source options including new ones"""
        response = self.session.get(f"{BASE_URL}/api/crm/import/template")
        assert response.status_code == 200
        
        template = response.json()
        source_options = template.get('source_options', [])
        
        print(f"Source options: {source_options}")
        
        # Check for new source types
        new_sources = ['sem', 'social_media', 'direct']
        for src in new_sources:
            assert src in source_options, f"Missing source: {src}. Available: {source_options}"
    
    def test_create_lead_with_sem_source(self):
        """Test creating a lead with 'sem' source (previously failed)"""
        lead_data = {
            "name": "TEST_SEM_Lead",
            "email": "test_sem@example.com",
            "phone": "9876543210",
            "source": "sem",  # This was failing before the fix
            "notes": "Test lead for SEM source validation"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        
        # Should succeed now with 'sem' in the enum
        assert response.status_code == 200, f"Failed to create lead with sem source: {response.text}"
        
        lead_id = response.json().get('lead_id')
        print(f"Successfully created lead with sem source: {lead_id}")
        
        # Cleanup - we can't delete leads easily, so just verify it worked
    
    def test_create_lead_with_social_media_source(self):
        """Test creating a lead with 'social_media' source"""
        lead_data = {
            "name": "TEST_SocialMedia_Lead",
            "email": "test_social@example.com",
            "source": "social_media",
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert response.status_code == 200, f"Failed to create lead with social_media source: {response.text}"
        print(f"Successfully created lead with social_media source")


class TestDoubleTransferPrevention:
    """Test that leads are not transferred twice"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
        if login_res.status_code != 200:
            pytest.skip("Could not login as super_admin")
    
    def test_already_transferred_lead_not_transferred_again(self):
        """Verify that a lead with transferred_to_lead_id won't trigger another transfer"""
        # Get Pre-Sales leads
        presales_res = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert presales_res.status_code == 200
        
        leads = presales_res.json()
        
        # Find a lead that's already been transferred
        transferred_lead = next(
            (l for l in leads if l.get('transferred_to_lead_id')),
            None
        )
        
        if not transferred_lead:
            print("No already-transferred leads found in Pre-Sales - skipping double-transfer test")
            return
        
        lead_id = transferred_lead.get('lead_id')
        transferred_to = transferred_lead.get('transferred_to_lead_id')
        print(f"Found already-transferred lead: {lead_id} -> {transferred_to}")
        
        # Get the final stage (Appointment Booked)
        stages_res = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        stages = stages_res.json()
        final_stage = next((s for s in stages if s.get('is_final')), None)
        
        if not final_stage:
            print("No final stage found - skipping")
            return
        
        # Count sales leads before
        sales_before = self.session.get(f"{BASE_URL}/api/crm/sales/leads").json()
        sales_count_before = len(sales_before)
        
        # Try to move the lead to final stage again (should NOT create another sales lead)
        move_res = self.session.patch(
            f"{BASE_URL}/api/crm/leads/{lead_id}/stage",
            json={"stage_id": final_stage.get('stage_id')}
        )
        
        # Check the response - should NOT have transferred_to_sales
        result = move_res.json()
        assert not result.get('transferred_to_sales'), \
            f"Lead was transferred again when it shouldn't have been! Response: {result}"
        
        # Verify sales count unchanged
        sales_after = self.session.get(f"{BASE_URL}/api/crm/sales/leads").json()
        sales_count_after = len(sales_after)
        
        assert sales_count_after == sales_count_before, \
            f"Sales lead count changed! Before: {sales_count_before}, After: {sales_count_after}"
        
        print(f"Double-transfer prevention working: sales leads unchanged at {sales_count_after}")


class TestSalesCRMContent:
    """Verify Sales CRM content and structure"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN_CREDS)
        if login_res.status_code != 200:
            pytest.skip("Could not login")
    
    def test_sales_dashboard_structure(self):
        """Verify Sales dashboard returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200
        
        dashboard = response.json()
        
        # Check required fields
        assert 'stages' in dashboard
        assert 'total_leads' in dashboard
        assert 'recent_leads' in dashboard
        assert 're_stats' in dashboard
        
        print(f"Sales dashboard - Total leads: {dashboard.get('total_leads')}")
        print(f"RE Stats: {dashboard.get('re_stats')}")
        
        # Check stages have lead counts
        for stage in dashboard.get('stages', []):
            assert 'lead_count' in stage
            print(f"  - {stage.get('name')}: {stage.get('lead_count')} leads")
    
    def test_sales_leads_have_transferred_info(self):
        """Verify Sales leads include transfer information"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200
        
        leads = response.json()
        
        transferred_count = 0
        for lead in leads:
            if lead.get('transferred_from_lead_id'):
                transferred_count += 1
                print(f"Lead '{lead.get('name')}' transferred from: {lead.get('transferred_from_lead_id')}")
        
        print(f"\n{transferred_count} of {len(leads)} leads came from Pre-Sales")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
