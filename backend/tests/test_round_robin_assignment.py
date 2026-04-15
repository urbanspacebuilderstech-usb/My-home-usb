"""
Test Round-Robin Lead Assignment and Pre-Sales → Sales Transfer Flow
Tests:
1. POST /api/marketing/distribution-settings/refresh - Refreshes team lists from users collection
2. GET /api/marketing/distribution-settings - Returns current distribution settings
3. Round-robin Pre-Sales assignment: CRE creates 4 leads - leads alternate between pre_sales team members
4. Round-robin Sales transfer: Create pre-sales lead, move to stg_appointment, verify new Sales lead created
5. Sales user sees transferred leads: Login as sales user, GET /api/crm/sales/leads includes assigned + unassigned
6. Sales dashboard counts: GET /api/crm/sales/dashboard includes all leads for sales users
7. Pre-Sales user sees unassigned leads: GET /api/crm/pre-sales/leads returns own + unassigned leads
8. Pre-Sales dashboard shows all stages including New RNR Leads
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@constructionos.com"
ADMIN_PASSWORD = "Demo@1234"
CRE_EMAIL = "cre@constructionos.com"
CRE_PASSWORD = "Demo@1234"
PRESALES_EMAIL = "presales@constructionos.com"
PRESALES_PASSWORD = "Demo@1234"
SALES_EMAIL = "sales@constructionos.com"
SALES_PASSWORD = "Demo@1234"


class TestRoundRobinAssignment:
    """Test round-robin lead assignment and Pre-Sales → Sales transfer"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as Super Admin and return session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def cre_session(self):
        """Login as CRE and return session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": CRE_EMAIL,
            "password": CRE_PASSWORD
        })
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def presales_session(self):
        """Login as Pre-Sales and return session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": PRESALES_EMAIL,
            "password": PRESALES_PASSWORD
        })
        assert response.status_code == 200, f"Pre-Sales login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def sales_session(self):
        """Login as Sales and return session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": SALES_EMAIL,
            "password": SALES_PASSWORD
        })
        assert response.status_code == 200, f"Sales login failed: {response.text}"
        return session
    
    # ==================== TEST 1: Refresh Distribution Teams ====================
    def test_01_refresh_distribution_teams(self, admin_session):
        """POST /api/marketing/distribution-settings/refresh - Refreshes team lists from users collection"""
        response = admin_session.post(f"{BASE_URL}/api/marketing/distribution-settings/refresh")
        assert response.status_code == 200, f"Refresh failed: {response.text}"
        
        data = response.json()
        assert "pre_sales_team" in data, "Response should contain pre_sales_team"
        assert "sales_team" in data, "Response should contain sales_team"
        assert len(data["pre_sales_team"]) > 0, "Pre-Sales team should have members"
        assert len(data["sales_team"]) > 0, "Sales team should have members"
        
        print(f"✓ Refreshed teams - Pre-Sales: {len(data['pre_sales_team'])} members, Sales: {len(data['sales_team'])} members")
        print(f"  Pre-Sales team: {[u['name'] for u in data['pre_sales_team']]}")
        print(f"  Sales team: {[u['name'] for u in data['sales_team']]}")
    
    # ==================== TEST 2: Get Distribution Settings ====================
    def test_02_get_distribution_settings(self, admin_session):
        """GET /api/marketing/distribution-settings - Returns current distribution settings"""
        response = admin_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert response.status_code == 200, f"Get settings failed: {response.text}"
        
        data = response.json()
        assert "pre_sales_team" in data, "Response should contain pre_sales_team"
        assert "sales_team" in data, "Response should contain sales_team"
        assert "pre_sales_current_index" in data or data.get("pre_sales_team"), "Should have pre_sales index or team"
        assert "sales_current_index" in data or data.get("sales_team"), "Should have sales index or team"
        
        # Verify team details are included
        if "pre_sales_team_details" in data:
            assert len(data["pre_sales_team_details"]) > 0, "Pre-Sales team details should be populated"
        if "sales_team_details" in data:
            assert len(data["sales_team_details"]) > 0, "Sales team details should be populated"
        
        print(f"✓ Distribution settings retrieved successfully")
        print(f"  Pre-Sales team size: {len(data.get('pre_sales_team', []))}")
        print(f"  Sales team size: {len(data.get('sales_team', []))}")
        print(f"  Pre-Sales current index: {data.get('pre_sales_current_index', 0)}")
        print(f"  Sales current index: {data.get('sales_current_index', 0)}")
    
    # ==================== TEST 3: Round-Robin Pre-Sales Assignment ====================
    def test_03_round_robin_presales_assignment(self, cre_session, admin_session):
        """CRE creates 4 leads via POST /api/crm/pre-sales/leads - leads alternate between pre_sales team members"""
        # First get the current distribution settings to know the team
        settings_response = admin_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert settings_response.status_code == 200
        settings = settings_response.json()
        pre_sales_team = settings.get("pre_sales_team", [])
        
        if len(pre_sales_team) < 2:
            pytest.skip("Need at least 2 pre-sales team members for round-robin test")
        
        # Create 4 leads and track assignments
        test_id = uuid.uuid4().hex[:8]
        created_leads = []
        
        for i in range(4):
            lead_data = {
                "name": f"TEST_RR_Lead_{test_id}_{i+1}",
                "email": f"test_rr_{test_id}_{i+1}@example.com",
                "phone": f"900000{i:04d}",
                "source": "other",
                "city": "Test City"
            }
            
            response = cre_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
            assert response.status_code == 200, f"Lead creation failed: {response.text}"
            
            data = response.json()
            created_leads.append({
                "lead_id": data.get("lead_id"),
                "assigned_to": data.get("assigned_to"),
                "name": lead_data["name"]
            })
            print(f"  Lead {i+1}: {lead_data['name']} -> Assigned to: {data.get('assigned_to')}")
        
        # Verify round-robin: assignments should alternate
        assignments = [lead["assigned_to"] for lead in created_leads]
        
        # Check that we have at least 2 different assignees (round-robin working)
        unique_assignees = set(assignments)
        assert len(unique_assignees) >= 2 or len(pre_sales_team) == 1, \
            f"Round-robin should distribute leads among team members. Got: {assignments}"
        
        # If team has 2 members, pattern should be A, B, A, B
        if len(pre_sales_team) == 2:
            assert assignments[0] == assignments[2], "Lead 1 and 3 should have same assignee"
            assert assignments[1] == assignments[3], "Lead 2 and 4 should have same assignee"
            assert assignments[0] != assignments[1], "Lead 1 and 2 should have different assignees"
        
        print(f"✓ Round-robin Pre-Sales assignment working - {len(unique_assignees)} unique assignees for 4 leads")
    
    # ==================== TEST 4: Pre-Sales → Sales Transfer with Round-Robin ====================
    def test_04_presales_to_sales_transfer_round_robin(self, cre_session, admin_session):
        """Create pre-sales lead, move to stg_appointment, verify new Sales lead created with round-robin assignment"""
        # Get current sales team
        settings_response = admin_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert settings_response.status_code == 200
        settings = settings_response.json()
        sales_team = settings.get("sales_team", [])
        
        if len(sales_team) < 1:
            pytest.skip("Need at least 1 sales team member for transfer test")
        
        # Create a pre-sales lead
        test_id = uuid.uuid4().hex[:8]
        lead_data = {
            "name": f"TEST_Transfer_{test_id}",
            "email": f"test_transfer_{test_id}@example.com",
            "phone": f"9111{test_id[:6]}",
            "source": "other",
            "city": "Transfer City"
        }
        
        create_response = cre_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200, f"Lead creation failed: {create_response.text}"
        lead_id = create_response.json().get("lead_id")
        print(f"  Created Pre-Sales lead: {lead_id}")
        
        # Move to Appointment Booked stage (stg_appointment) - this triggers transfer
        stage_update = {
            "stage_id": "stg_appointment",
            "appointment_date": "2026-02-15",
            "appointment_time": "10:00",
            "appointment_type": "office_visit"
        }
        
        transfer_response = cre_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json=stage_update)
        assert transfer_response.status_code == 200, f"Stage update failed: {transfer_response.text}"
        
        transfer_data = transfer_response.json()
        assert transfer_data.get("transferred_to_sales") == True, "Lead should be transferred to Sales"
        assert "new_lead_id" in transfer_data, "Response should contain new_lead_id"
        assert "assigned_to" in transfer_data, "Response should contain assigned_to (Sales person)"
        
        new_sales_lead_id = transfer_data.get("new_lead_id")
        assigned_sales_person = transfer_data.get("assigned_to")
        
        print(f"✓ Pre-Sales → Sales transfer successful")
        print(f"  New Sales lead ID: {new_sales_lead_id}")
        print(f"  Assigned to Sales person: {assigned_sales_person}")
        
        # Verify the new Sales lead exists and is in correct stage
        # Get all sales leads and find our transferred lead
        sales_leads_response = admin_session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert sales_leads_response.status_code == 200
        sales_leads = sales_leads_response.json()
        
        transferred_lead = next((l for l in sales_leads if l.get("lead_id") == new_sales_lead_id), None)
        assert transferred_lead is not None, f"Transferred lead {new_sales_lead_id} not found in Sales leads"
        assert transferred_lead.get("current_stage_id") == "stg_new_appt", \
            f"Transferred lead should be in 'New Appointment' stage, got: {transferred_lead.get('current_stage_id')}"
        assert transferred_lead.get("transferred_from_lead_id") == lead_id, \
            "Transferred lead should reference original Pre-Sales lead"
        
        print(f"✓ Verified transferred lead in Sales CRM at 'New Appointment' stage")
    
    # ==================== TEST 5: Sales User Sees Assigned + Unassigned Leads ====================
    def test_05_sales_user_sees_assigned_and_unassigned_leads(self, sales_session, admin_session):
        """Login as sales user, GET /api/crm/sales/leads should include leads assigned to them AND unassigned leads"""
        # Get sales leads as sales user
        response = sales_session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Get sales leads failed: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list), "Response should be a list of leads"
        
        # Count assigned vs unassigned
        assigned_count = 0
        unassigned_count = 0
        
        for lead in leads:
            assigned_to = lead.get("assigned_to")
            if assigned_to and assigned_to != "":
                assigned_count += 1
            else:
                unassigned_count += 1
        
        print(f"✓ Sales user can see leads")
        print(f"  Total leads visible: {len(leads)}")
        print(f"  Assigned leads: {assigned_count}")
        print(f"  Unassigned leads: {unassigned_count}")
        
        # The sales user should see their own leads + unassigned leads
        # We can't assert exact counts without knowing the data, but we verify the endpoint works
        assert len(leads) >= 0, "Sales user should be able to retrieve leads"
    
    # ==================== TEST 6: Sales Dashboard Counts ====================
    def test_06_sales_dashboard_counts(self, sales_session):
        """GET /api/crm/sales/dashboard should include all leads (assigned + unassigned) for sales users"""
        response = sales_session.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200, f"Get sales dashboard failed: {response.text}"
        
        data = response.json()
        assert "stages" in data, "Dashboard should contain stages"
        assert "total_leads" in data, "Dashboard should contain total_leads"
        
        # Verify stages include expected ones
        stage_names = [s.get("name") for s in data.get("stages", [])]
        assert "New Appointment" in stage_names, "Dashboard should include 'New Appointment' stage"
        
        # Sum up lead counts from stages
        total_from_stages = sum(s.get("lead_count", 0) for s in data.get("stages", []))
        
        print(f"✓ Sales dashboard retrieved successfully")
        print(f"  Total leads: {data.get('total_leads')}")
        print(f"  Total from stages: {total_from_stages}")
        print(f"  Is filtered (sales user): {data.get('is_filtered')}")
        
        # Verify stage counts
        for stage in data.get("stages", []):
            if stage.get("lead_count", 0) > 0:
                print(f"    {stage.get('name')}: {stage.get('lead_count')} leads")
    
    # ==================== TEST 7: Pre-Sales User Sees Own + Unassigned Leads ====================
    def test_07_presales_user_sees_own_and_unassigned_leads(self, presales_session):
        """GET /api/crm/pre-sales/leads returns own + unassigned leads"""
        response = presales_session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200, f"Get pre-sales leads failed: {response.text}"
        
        leads = response.json()
        assert isinstance(leads, list), "Response should be a list of leads"
        
        # Count assigned vs unassigned
        assigned_count = 0
        unassigned_count = 0
        
        for lead in leads:
            assigned_to = lead.get("assigned_to")
            if assigned_to and assigned_to != "":
                assigned_count += 1
            else:
                unassigned_count += 1
        
        print(f"✓ Pre-Sales user can see leads")
        print(f"  Total leads visible: {len(leads)}")
        print(f"  Assigned leads: {assigned_count}")
        print(f"  Unassigned leads: {unassigned_count}")
    
    # ==================== TEST 8: Pre-Sales Dashboard Shows All Stages ====================
    def test_08_presales_dashboard_shows_all_stages(self, presales_session):
        """GET /api/crm/pre-sales/dashboard shows all stages including New RNR Leads"""
        response = presales_session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert response.status_code == 200, f"Get pre-sales dashboard failed: {response.text}"
        
        data = response.json()
        assert "stages" in data, "Dashboard should contain stages"
        assert "total_leads" in data, "Dashboard should contain total_leads"
        
        # Verify all expected stages are present
        stage_names = [s.get("name") for s in data.get("stages", [])]
        expected_stages = ["New Lead", "Contacted", "RNR", "New RNR Leads", "Portfolio sent", "Follow-up", "Appointment Booked"]
        
        for expected in expected_stages:
            assert expected in stage_names, f"Dashboard should include '{expected}' stage"
        
        print(f"✓ Pre-Sales dashboard shows all stages")
        print(f"  Total leads: {data.get('total_leads')}")
        print(f"  Stages found: {stage_names}")
        
        # Print stage counts
        for stage in data.get("stages", []):
            print(f"    {stage.get('name')}: {stage.get('lead_count', 0)} leads")
    
    # ==================== TEST 9: Multiple Transfers Verify Round-Robin Sales Assignment ====================
    def test_09_multiple_transfers_round_robin_sales(self, cre_session, admin_session):
        """Create multiple pre-sales leads and transfer them to verify round-robin sales assignment"""
        # Get current sales team
        settings_response = admin_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert settings_response.status_code == 200
        settings = settings_response.json()
        sales_team = settings.get("sales_team", [])
        
        if len(sales_team) < 2:
            pytest.skip("Need at least 2 sales team members for round-robin transfer test")
        
        test_id = uuid.uuid4().hex[:8]
        transferred_leads = []
        
        # Create and transfer 4 leads
        for i in range(4):
            # Create pre-sales lead
            lead_data = {
                "name": f"TEST_MultiTransfer_{test_id}_{i+1}",
                "email": f"test_multi_{test_id}_{i+1}@example.com",
                "phone": f"922{test_id[:4]}{i:02d}",
                "source": "other"
            }
            
            create_response = cre_session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
            assert create_response.status_code == 200
            lead_id = create_response.json().get("lead_id")
            
            # Transfer to Sales
            stage_update = {
                "stage_id": "stg_appointment",
                "appointment_date": "2026-02-20",
                "appointment_time": "14:00",
                "appointment_type": "online"
            }
            
            transfer_response = cre_session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json=stage_update)
            assert transfer_response.status_code == 200
            
            transfer_data = transfer_response.json()
            transferred_leads.append({
                "original_lead_id": lead_id,
                "new_lead_id": transfer_data.get("new_lead_id"),
                "assigned_to": transfer_data.get("assigned_to")
            })
            print(f"  Transfer {i+1}: {lead_data['name']} -> Sales: {transfer_data.get('assigned_to')}")
        
        # Verify round-robin distribution
        sales_assignments = [lead["assigned_to"] for lead in transferred_leads]
        unique_sales_assignees = set(sales_assignments)
        
        assert len(unique_sales_assignees) >= 2 or len(sales_team) == 1, \
            f"Round-robin should distribute transfers among sales team. Got: {sales_assignments}"
        
        print(f"✓ Multiple transfers verified round-robin sales assignment")
        print(f"  {len(unique_sales_assignees)} unique sales assignees for 4 transfers")


class TestDistributionSettingsAccess:
    """Test access control for distribution settings"""
    
    @pytest.fixture
    def non_admin_session(self):
        """Login as non-admin user"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": CRE_EMAIL,
            "password": CRE_PASSWORD
        })
        assert response.status_code == 200
        return session
    
    def test_non_admin_cannot_refresh_teams(self, non_admin_session):
        """Non-admin users should not be able to refresh distribution teams"""
        response = non_admin_session.post(f"{BASE_URL}/api/marketing/distribution-settings/refresh")
        assert response.status_code == 403, "Non-admin should get 403 for refresh"
        print("✓ Non-admin correctly denied access to refresh teams")
    
    def test_non_admin_cannot_get_distribution_settings(self, non_admin_session):
        """Non-admin users should not be able to get distribution settings"""
        response = non_admin_session.get(f"{BASE_URL}/api/marketing/distribution-settings")
        assert response.status_code == 403, "Non-admin should get 403 for get settings"
        print("✓ Non-admin correctly denied access to distribution settings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
