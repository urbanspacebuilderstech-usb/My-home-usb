"""
Test Sr. Engineer to Jr. Engineer Assignment Workflow
Tests the new feature for:
1. GET /api/crm/jr-engineers - returns list of site_engineer and planning role users
2. GET /api/crm/my-site-visits - returns visits with jr_engineer info
3. POST /api/crm/leads/{lead_id}/assign-jr-engineer - assigns a jr engineer to a visit
4. POST /api/crm/leads/{lead_id}/complete-site-visit - allows site_engineer role to mark done
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@constructionos.com"
SR_ENGINEER_EMAIL = "sr.engineer@constructionos.com"
JR_ENGINEER_EMAIL = "engineer@constructionos.com"


class TestSrJrEngineerAssignment:
    """Test Sr. Engineer to Jr. Engineer assignment workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with cookie auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def _login(self, email):
        """Login using demo-login endpoint with email"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        if response.status_code == 200:
            print(f"Login successful: {response.json().get('email')}")
            return response.json()
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None
    
    # ==================== GET /api/crm/jr-engineers ====================
    
    def test_get_jr_engineers_as_admin(self):
        """Test GET /api/crm/jr-engineers returns list of site_engineer and planning role users"""
        user = self._login(ADMIN_EMAIL)
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        
        # Should return 200 for admin
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify structure of returned engineers
        if len(data) > 0:
            engineer = data[0]
            assert "user_id" in engineer, "Engineer should have user_id"
            assert "name" in engineer, "Engineer should have name"
            assert "role" in engineer, "Engineer should have role"
            
            # Verify roles are only site_engineer or planning
            for eng in data:
                assert eng.get("role") in ["site_engineer", "planning"], f"Unexpected role: {eng.get('role')}"
        
        print(f"Found {len(data)} Jr. Engineers (site_engineer/planning roles)")
        for eng in data[:5]:  # Print first 5
            print(f"  - {eng.get('name')} ({eng.get('role')})")
    
    def test_get_jr_engineers_as_sr_engineer(self):
        """Test GET /api/crm/jr-engineers works for sr_site_engineer"""
        user = self._login(SR_ENGINEER_EMAIL)
        assert user is not None, "Sr. Engineer login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        
        # Should return 200 for sr_site_engineer
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Sr. Engineer can access jr-engineers list: {len(data)} engineers")
    
    def test_get_jr_engineers_permission_denied_for_site_engineer(self):
        """Test GET /api/crm/jr-engineers returns 403 for regular site_engineer"""
        user = self._login(JR_ENGINEER_EMAIL)
        assert user is not None, "Jr. Engineer login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        
        # Should return 403 for regular site_engineer
        assert response.status_code == 403, f"Expected 403 for site_engineer, got {response.status_code}"
        print("Correctly denied access to site_engineer role")
    
    # ==================== GET /api/crm/my-site-visits ====================
    
    def test_get_my_site_visits_as_admin(self):
        """Test GET /api/crm/my-site-visits returns visits structure"""
        user = self._login(ADMIN_EMAIL)
        assert user is not None, "Admin login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/my-site-visits")
        
        # Should return 200 for admin (super_admin)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict with today/upcoming/past"
        assert "today" in data, "Response should have 'today' key"
        assert "upcoming" in data, "Response should have 'upcoming' key"
        assert "past" in data, "Response should have 'past' key"
        
        # Count total visits
        total_visits = len(data.get("today", [])) + len(data.get("upcoming", [])) + len(data.get("past", []))
        print(f"Found {total_visits} total site visits (today: {len(data.get('today', []))}, upcoming: {len(data.get('upcoming', []))}, past: {len(data.get('past', []))})")
    
    def test_get_my_site_visits_as_sr_engineer(self):
        """Test GET /api/crm/my-site-visits works for sr_site_engineer"""
        user = self._login(SR_ENGINEER_EMAIL)
        assert user is not None, "Sr. Engineer login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/my-site-visits")
        
        # Should return 200 for sr_site_engineer
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "today" in data and "upcoming" in data and "past" in data
        print(f"Sr. Engineer can access my-site-visits")
    
    def test_get_my_site_visits_as_site_engineer(self):
        """Test GET /api/crm/my-site-visits works for site_engineer"""
        user = self._login(JR_ENGINEER_EMAIL)
        assert user is not None, "Jr. Engineer login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/my-site-visits")
        
        # Should return 200 for site_engineer
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "today" in data and "upcoming" in data and "past" in data
        print(f"Site Engineer can access my-site-visits")
    
    def test_site_visits_returns_jr_engineer_fields(self):
        """Test that my-site-visits returns jr_engineer_id, jr_engineer_name, assigned_to_me_as fields"""
        user = self._login(SR_ENGINEER_EMAIL)
        assert user is not None, "Sr. Engineer login failed"
        
        response = self.session.get(f"{BASE_URL}/api/crm/my-site-visits")
        assert response.status_code == 200
        
        data = response.json()
        all_visits = data.get("today", []) + data.get("upcoming", []) + data.get("past", [])
        
        if len(all_visits) > 0:
            visit = all_visits[0]
            # These fields should exist (even if null)
            assert "jr_engineer_id" in visit, "Visit should have jr_engineer_id field"
            assert "jr_engineer_name" in visit, "Visit should have jr_engineer_name field"
            assert "assigned_to_me_as" in visit, "Visit should have assigned_to_me_as field"
            print(f"Visit fields verified: jr_engineer_id={visit.get('jr_engineer_id')}, jr_engineer_name={visit.get('jr_engineer_name')}, assigned_to_me_as={visit.get('assigned_to_me_as')}")
        else:
            print("No visits found for this engineer - fields cannot be verified")
    
    # ==================== POST /api/crm/leads/{lead_id}/assign-jr-engineer ====================
    
    def test_assign_jr_engineer_requires_sr_engineer_role(self):
        """Test that assign-jr-engineer requires sr_site_engineer or super_admin role"""
        # First login as admin to get a lead_id
        self._login(ADMIN_EMAIL)
        
        # Get sales leads to find one with site_visit_data
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads")
        
        leads = leads_response.json()
        lead_with_visit = next((l for l in leads if l.get("site_visit_data")), None)
        
        if not lead_with_visit:
            pytest.skip("No leads with site_visit_data found")
        
        lead_id = lead_with_visit.get("lead_id")
        
        # Get a jr_engineer to assign
        jr_engineers_response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        if jr_engineers_response.status_code != 200 or len(jr_engineers_response.json()) == 0:
            pytest.skip("No jr_engineers found to assign")
        
        jr_engineer = jr_engineers_response.json()[0]
        jr_engineer_id = jr_engineer.get("user_id")
        
        # Now login as regular site_engineer and try to assign
        self._login(JR_ENGINEER_EMAIL)
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/leads/{lead_id}/assign-jr-engineer",
            params={"jr_engineer_id": jr_engineer_id}
        )
        
        # Regular site_engineer should NOT be able to assign
        assert response.status_code == 403, f"Expected 403 for site_engineer, got {response.status_code}"
        print("Correctly denied assign-jr-engineer to regular site_engineer")
    
    def test_assign_jr_engineer_as_sr_engineer(self):
        """Test that sr_site_engineer can assign jr_engineer"""
        # First login as admin to get a lead_id
        self._login(ADMIN_EMAIL)
        
        # Get sales leads to find one with site_visit_data
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads")
        
        leads = leads_response.json()
        lead_with_visit = next((l for l in leads if l.get("site_visit_data") and l.get("site_visit_data", {}).get("visit_status") != "completed"), None)
        
        if not lead_with_visit:
            # Try to find any lead with site_visit_data
            lead_with_visit = next((l for l in leads if l.get("site_visit_data")), None)
        
        if not lead_with_visit:
            pytest.skip("No leads with site_visit_data found")
        
        lead_id = lead_with_visit.get("lead_id")
        
        # Get a jr_engineer to assign
        jr_engineers_response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        if jr_engineers_response.status_code != 200 or len(jr_engineers_response.json()) == 0:
            pytest.skip("No jr_engineers found to assign")
        
        jr_engineer = jr_engineers_response.json()[0]
        jr_engineer_id = jr_engineer.get("user_id")
        
        # Login as sr_site_engineer
        self._login(SR_ENGINEER_EMAIL)
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/leads/{lead_id}/assign-jr-engineer",
            params={"jr_engineer_id": jr_engineer_id}
        )
        
        # Sr. site_engineer should be able to assign
        assert response.status_code == 200, f"Expected 200 for sr_site_engineer, got {response.status_code}: {response.text}"
        print(f"Sr. Engineer successfully assigned Jr. Engineer to lead {lead_id}")
    
    def test_assign_jr_engineer_without_id_returns_400(self):
        """Test that assign-jr-engineer returns 400 when jr_engineer_id is missing"""
        # Login as admin
        self._login(ADMIN_EMAIL)
        
        # Get sales leads to find one with site_visit_data
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads")
        
        leads = leads_response.json()
        lead_with_visit = next((l for l in leads if l.get("site_visit_data")), None)
        
        if not lead_with_visit:
            pytest.skip("No leads with site_visit_data found")
        
        lead_id = lead_with_visit.get("lead_id")
        
        # Try to assign without jr_engineer_id
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/assign-jr-engineer")
        
        assert response.status_code == 400, f"Expected 400 for missing jr_engineer_id, got {response.status_code}"
        print("Correctly returned 400 for missing jr_engineer_id")
    
    # ==================== POST /api/crm/leads/{lead_id}/complete-site-visit ====================
    
    def test_complete_site_visit_as_admin(self):
        """Test that complete-site-visit works for super_admin"""
        self._login(ADMIN_EMAIL)
        
        # Get sales leads to find one with site_visit_data that is not completed
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads")
        
        leads = leads_response.json()
        pending_visit = next((l for l in leads if l.get("site_visit_data") and l.get("site_visit_data", {}).get("visit_status") != "completed"), None)
        
        if not pending_visit:
            print("No pending site visits found to complete")
            pytest.skip("No pending site visits to complete")
        
        lead_id = pending_visit.get("lead_id")
        print(f"Testing complete-site-visit with lead_id: {lead_id}")
        
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/complete-site-visit")
        
        # Admin should be able to complete
        assert response.status_code == 200, f"Expected 200 for admin, got {response.status_code}: {response.text}"
        print(f"Successfully marked site visit as done for lead {lead_id}")
    
    def test_complete_site_visit_allowed_for_site_engineer_role(self):
        """Test that complete-site-visit is allowed for site_engineer role"""
        # First login as admin to create a test scenario
        self._login(ADMIN_EMAIL)
        
        # Get sales leads to find one with site_visit_data
        leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads")
        
        leads = leads_response.json()
        pending_visit = next((l for l in leads if l.get("site_visit_data") and l.get("site_visit_data", {}).get("visit_status") != "completed"), None)
        
        if not pending_visit:
            print("No pending site visits found")
            pytest.skip("No pending site visits to test")
        
        lead_id = pending_visit.get("lead_id")
        
        # Login as site_engineer
        self._login(JR_ENGINEER_EMAIL)
        
        # Try to complete the visit
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/complete-site-visit")
        
        # site_engineer should be able to complete
        assert response.status_code == 200, f"Expected 200 for site_engineer, got {response.status_code}: {response.text}"
        print(f"site_engineer successfully marked visit as done")


class TestJrEngineersEndpoint:
    """Test the jr-engineers endpoint in detail"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with cookie auth"""
        import time
        time.sleep(2)  # Wait to avoid rate limiting
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin with retry
        for attempt in range(3):
            response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ADMIN_EMAIL})
            if response.status_code == 200:
                print(f"Admin login successful")
                return
            elif response.status_code == 429:
                time.sleep(5)  # Wait longer on rate limit
            else:
                break
        pytest.skip(f"Admin login failed after retries: {response.status_code}")
    
    def test_jr_engineers_returns_correct_roles(self):
        """Test that jr-engineers only returns site_engineer and planning roles"""
        response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        assert response.status_code == 200
        
        engineers = response.json()
        
        for eng in engineers:
            role = eng.get("role")
            assert role in ["site_engineer", "planning"], f"Unexpected role in jr-engineers: {role}"
        
        # Count by role
        site_engineers = [e for e in engineers if e.get("role") == "site_engineer"]
        planning = [e for e in engineers if e.get("role") == "planning"]
        
        print(f"Jr. Engineers breakdown: {len(site_engineers)} site_engineer, {len(planning)} planning")
    
    def test_jr_engineers_has_required_fields(self):
        """Test that jr-engineers returns required fields for UI dropdown"""
        response = self.session.get(f"{BASE_URL}/api/crm/jr-engineers")
        assert response.status_code == 200
        
        engineers = response.json()
        
        if len(engineers) == 0:
            pytest.skip("No jr_engineers found")
        
        eng = engineers[0]
        
        # Required fields for UI dropdown
        required_fields = ["user_id", "name", "role"]
        
        for field in required_fields:
            assert field in eng, f"Jr. Engineer missing required field: {field}"
        
        print(f"Jr. Engineer fields: {list(eng.keys())}")


class TestSiteVisitDataStructure:
    """Test the data structure of site visits"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with cookie auth"""
        import time
        time.sleep(2)  # Wait to avoid rate limiting
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin with retry
        for attempt in range(3):
            response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ADMIN_EMAIL})
            if response.status_code == 200:
                print(f"Admin login successful")
                return
            elif response.status_code == 429:
                time.sleep(5)  # Wait longer on rate limit
            else:
                break
        pytest.skip(f"Admin login failed after retries: {response.status_code}")
    
    def test_site_visit_has_required_fields(self):
        """Test that site visits have all required fields for the UI"""
        response = self.session.get(f"{BASE_URL}/api/crm/my-site-visits")
        assert response.status_code == 200
        
        data = response.json()
        all_visits = data.get("today", []) + data.get("upcoming", []) + data.get("past", [])
        
        if len(all_visits) == 0:
            # Try to get visits from sales leads
            leads_response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
            if leads_response.status_code == 200:
                leads = leads_response.json()
                visits_count = len([l for l in leads if l.get("site_visit_data")])
                print(f"No visits for admin, but found {visits_count} leads with site_visit_data")
            pytest.skip("No site visits to verify")
        
        visit = all_visits[0]
        
        # Required fields for UI
        required_fields = [
            "lead_id",
            "client_name",
            "visit_type",
            "visit_date",
            "visit_status",
            "jr_engineer_id",
            "jr_engineer_name",
            "assigned_to_me_as"
        ]
        
        for field in required_fields:
            assert field in visit, f"Visit missing required field: {field}"
        
        print(f"All required fields present in visit data")
        print(f"Visit: {visit.get('client_name')} - type: {visit.get('visit_type')}, status: {visit.get('visit_status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
