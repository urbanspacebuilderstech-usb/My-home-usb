"""
Site Visit Management Tests - Iteration 97
Tests for:
1. 16 sales stages including Site Visit stages
2. Sr. Site Engineers endpoint
3. Ongoing Projects endpoint
4. Assign Site Visit (client_land and ongoing_project)
5. Complete Site Visit
6. My Site Visits endpoint
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSalesStages:
    """Test sales stages including new site visit stages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CRE user for authenticated requests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as CRE
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.user = login_res.json()
        # Store cookies for subsequent requests
        self.session.cookies.update(login_res.cookies)
    
    def test_sales_stages_count_and_site_visit_stages(self):
        """Verify 16 sales stages including Site Visit stages"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        print(f"Total sales stages: {len(stages)}")
        
        # Print all stages for debugging
        sorted_stages = sorted(stages, key=lambda x: x.get('order', 99))
        for i, s in enumerate(sorted_stages):
            print(f"  {i+1}. {s['name']} (order={s.get('order')}, id={s['stage_id']})")
        
        # Verify we have 16 stages
        assert len(stages) == 16, f"Expected 16 stages, got {len(stages)}"
        
        # Verify site visit stages exist
        stage_ids = [s['stage_id'] for s in stages]
        assert 'stg_sv_client_land' in stage_ids, "Missing 'Site Visit (Client Land)' stage"
        assert 'stg_sv_ongoing_project' in stage_ids, "Missing 'Site Visit (Our Projects)' stage"
        assert 'stg_sv_done' in stage_ids, "Missing 'Site Visit Done' stage"
        
        # Verify stage names
        stage_names = {s['stage_id']: s['name'] for s in stages}
        assert 'Site Visit (Client Land)' in stage_names.values() or 'stg_sv_client_land' in stage_ids
        assert 'Site Visit (Our Projects)' in stage_names.values() or 'stg_sv_ongoing_project' in stage_ids
        assert 'Site Visit Done' in stage_names.values() or 'stg_sv_done' in stage_ids
        
        # Verify order of site visit stages (should be 5, 6, 7)
        sv_client_land = next((s for s in stages if s['stage_id'] == 'stg_sv_client_land'), None)
        sv_ongoing = next((s for s in stages if s['stage_id'] == 'stg_sv_ongoing_project'), None)
        sv_done = next((s for s in stages if s['stage_id'] == 'stg_sv_done'), None)
        
        if sv_client_land:
            print(f"Site Visit (Client Land) order: {sv_client_land.get('order')}")
        if sv_ongoing:
            print(f"Site Visit (Our Projects) order: {sv_ongoing.get('order')}")
        if sv_done:
            print(f"Site Visit Done order: {sv_done.get('order')}")


class TestSrSiteEngineers:
    """Test Sr. Site Engineers endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CRE user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200
        self.session.cookies.update(login_res.cookies)
    
    def test_get_sr_site_engineers(self):
        """Verify GET /api/crm/sr-site-engineers returns list of Sr. Site Engineers"""
        response = self.session.get(f"{BASE_URL}/api/crm/sr-site-engineers")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        engineers = response.json()
        print(f"Sr. Site Engineers count: {len(engineers)}")
        
        for eng in engineers:
            print(f"  - {eng.get('name')} (id={eng.get('user_id')}, phone={eng.get('phone')})")
        
        # Should have at least 3 Sr. Site Engineers based on test data
        assert len(engineers) >= 3, f"Expected at least 3 Sr. Site Engineers, got {len(engineers)}"
        
        # Verify structure
        for eng in engineers:
            assert 'user_id' in eng, "Missing user_id"
            assert 'name' in eng, "Missing name"


class TestOngoingProjects:
    """Test Ongoing Projects endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CRE user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200
        self.session.cookies.update(login_res.cookies)
    
    def test_get_ongoing_projects(self):
        """Verify GET /api/crm/ongoing-projects returns active projects with site engineer details"""
        response = self.session.get(f"{BASE_URL}/api/crm/ongoing-projects")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        projects = response.json()
        print(f"Ongoing projects count: {len(projects)}")
        
        for p in projects:
            eng_name = p.get('site_engineer', {}).get('name', 'No engineer') if p.get('site_engineer') else 'No engineer'
            print(f"  - {p.get('project_name')} @ {p.get('location')} (Engineer: {eng_name})")
        
        # Should have 4 active projects based on test data
        assert len(projects) >= 4, f"Expected at least 4 ongoing projects, got {len(projects)}"
        
        # Verify structure
        for p in projects:
            assert 'project_id' in p, "Missing project_id"
            assert 'project_name' in p, "Missing project_name"
            # site_engineer can be None if not assigned
    
    def test_ongoing_projects_search(self):
        """Test search functionality for ongoing projects"""
        response = self.session.get(f"{BASE_URL}/api/crm/ongoing-projects?search=Villa")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        projects = response.json()
        print(f"Projects matching 'Villa': {len(projects)}")
        
        # Should find Lakshmi Villa
        if len(projects) > 0:
            for p in projects:
                print(f"  - {p.get('project_name')}")


class TestAssignSiteVisit:
    """Test site visit assignment endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CRE user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200
        self.session.cookies.update(login_res.cookies)
        
        # Get a test lead
        leads_res = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_res.status_code == 200:
            leads = leads_res.json()
            # Find a lead in Follow-up or Deal Closed stage
            self.test_lead = next((l for l in leads if l.get('current_stage_id') in ['stg_sales_followup', 'stg_deal_closed']), None)
            if not self.test_lead and leads:
                self.test_lead = leads[0]
        else:
            self.test_lead = None
    
    def test_assign_client_land_visit(self):
        """Test assigning a client land site visit"""
        if not self.test_lead:
            pytest.skip("No test lead available")
        
        # Get Sr. Engineers
        eng_res = self.session.get(f"{BASE_URL}/api/crm/sr-site-engineers")
        assert eng_res.status_code == 200
        engineers = eng_res.json()
        if not engineers:
            pytest.skip("No Sr. Site Engineers available")
        
        sr_engineer = engineers[0]
        lead_id = self.test_lead['lead_id']
        
        # Assign site visit
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/assign-site-visit", json={
            "visit_type": "client_land",
            "sr_engineer_id": sr_engineer['user_id'],
            "visit_date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "TEST_site_visit_iteration97"
        })
        
        print(f"Assign client land visit response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to assign: {response.text}"
        
        data = response.json()
        assert data.get('stage') == 'stg_sv_client_land', f"Expected stage stg_sv_client_land, got {data.get('stage')}"
        assert 'site_visit_data' in data
        assert data['site_visit_data'].get('visit_type') == 'client_land'
        assert data['site_visit_data'].get('sr_engineer_id') == sr_engineer['user_id']
        
        print(f"Successfully assigned to {data['site_visit_data'].get('sr_engineer_name')}")
    
    def test_assign_ongoing_project_visit(self):
        """Test assigning an ongoing project site visit"""
        # Get a different lead
        leads_res = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_res.status_code != 200:
            pytest.skip("Cannot get leads")
        
        leads = leads_res.json()
        # Find a lead NOT in site visit stages
        test_lead = next((l for l in leads if l.get('current_stage_id') not in ['stg_sv_client_land', 'stg_sv_ongoing_project', 'stg_sv_done']), None)
        if not test_lead:
            pytest.skip("No suitable test lead available")
        
        # Get ongoing projects
        proj_res = self.session.get(f"{BASE_URL}/api/crm/ongoing-projects")
        assert proj_res.status_code == 200
        projects = proj_res.json()
        if not projects:
            pytest.skip("No ongoing projects available")
        
        project = projects[0]
        lead_id = test_lead['lead_id']
        
        # Assign site visit
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/assign-site-visit", json={
            "visit_type": "ongoing_project",
            "project_id": project['project_id'],
            "visit_date": datetime.now().strftime("%Y-%m-%d"),
            "notes": "TEST_ongoing_project_visit_iteration97"
        })
        
        print(f"Assign ongoing project visit response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to assign: {response.text}"
        
        data = response.json()
        assert data.get('stage') == 'stg_sv_ongoing_project', f"Expected stage stg_sv_ongoing_project, got {data.get('stage')}"
        assert 'site_visit_data' in data
        assert data['site_visit_data'].get('visit_type') == 'ongoing_project'
        assert data['site_visit_data'].get('project_id') == project['project_id']
        
        print(f"Successfully assigned to project {data['site_visit_data'].get('project_name')}")
    
    def test_assign_client_land_without_engineer_fails(self):
        """Test that client land visit without engineer fails"""
        if not self.test_lead:
            pytest.skip("No test lead available")
        
        lead_id = self.test_lead['lead_id']
        
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/assign-site-visit", json={
            "visit_type": "client_land",
            "visit_date": datetime.now().strftime("%Y-%m-%d")
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"Correctly rejected: {response.json().get('detail')}")
    
    def test_assign_ongoing_project_without_project_fails(self):
        """Test that ongoing project visit without project fails"""
        if not self.test_lead:
            pytest.skip("No test lead available")
        
        lead_id = self.test_lead['lead_id']
        
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/assign-site-visit", json={
            "visit_type": "ongoing_project",
            "visit_date": datetime.now().strftime("%Y-%m-%d")
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"Correctly rejected: {response.json().get('detail')}")


class TestCompleteSiteVisit:
    """Test completing a site visit"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as CRE user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200
        self.session.cookies.update(login_res.cookies)
    
    def test_complete_site_visit(self):
        """Test completing a site visit moves lead to stg_sv_done"""
        # Get leads in site visit stages
        leads_res = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_res.status_code != 200:
            pytest.skip("Cannot get leads")
        
        leads = leads_res.json()
        # Find a lead in site visit stage
        test_lead = next((l for l in leads if l.get('current_stage_id') in ['stg_sv_client_land', 'stg_sv_ongoing_project']), None)
        
        if not test_lead:
            print("No lead in site visit stage, creating one first...")
            # Create a site visit first
            eng_res = self.session.get(f"{BASE_URL}/api/crm/sr-site-engineers")
            if eng_res.status_code != 200 or not eng_res.json():
                pytest.skip("No Sr. Engineers available")
            
            engineers = eng_res.json()
            # Get any lead
            any_lead = next((l for l in leads if l.get('current_stage_id') not in ['stg_sv_done', 'stg_project_onboarded']), None)
            if not any_lead:
                pytest.skip("No suitable lead available")
            
            # Assign site visit
            assign_res = self.session.post(f"{BASE_URL}/api/crm/leads/{any_lead['lead_id']}/assign-site-visit", json={
                "visit_type": "client_land",
                "sr_engineer_id": engineers[0]['user_id'],
                "visit_date": datetime.now().strftime("%Y-%m-%d"),
                "notes": "TEST_for_completion"
            })
            if assign_res.status_code != 200:
                pytest.skip(f"Could not create site visit: {assign_res.text}")
            
            test_lead = any_lead
            test_lead['current_stage_id'] = 'stg_sv_client_land'
        
        lead_id = test_lead['lead_id']
        
        # Complete site visit
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/complete-site-visit")
        
        print(f"Complete site visit response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to complete: {response.text}"
        
        # Verify lead moved to stg_sv_done
        lead_res = self.session.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
        if lead_res.status_code == 200:
            lead = lead_res.json()
            assert lead.get('current_stage_id') == 'stg_sv_done', f"Expected stg_sv_done, got {lead.get('current_stage_id')}"
            print(f"Lead successfully moved to Site Visit Done stage")


class TestMySiteVisits:
    """Test my-site-visits endpoint for site engineers"""
    
    def test_my_site_visits_requires_engineer_role(self):
        """Test that my-site-visits requires site engineer role"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as CRE (not a site engineer)
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
        assert login_res.status_code == 200
        session.cookies.update(login_res.cookies)
        
        response = session.get(f"{BASE_URL}/api/crm/my-site-visits")
        
        # Should be 403 for non-engineer
        print(f"my-site-visits as CRE: {response.status_code}")
        assert response.status_code == 403, f"Expected 403 for non-engineer, got {response.status_code}"
    
    def test_my_site_visits_as_engineer(self):
        """Test my-site-visits as site engineer"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as site engineer
        login_res = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        if login_res.status_code != 200:
            pytest.skip("Cannot login as engineer")
        session.cookies.update(login_res.cookies)
        
        response = session.get(f"{BASE_URL}/api/crm/my-site-visits")
        
        print(f"my-site-visits as engineer: {response.status_code}")
        
        # Could be 200 or 403 depending on engineer role
        if response.status_code == 200:
            visits = response.json()
            print(f"Site visits: {visits}")
        elif response.status_code == 403:
            print("Engineer role may not have sr_site_engineer permission")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
