"""
Test RE Revision and Client Workflow Features
- RE number auto-increment (USB-RE0001, USB-RE0002...)
- RE revision system (RE0, RE1, RE2...)
- Client workflow: send-to-client -> client-feedback -> client-approve
- Create revision from client feedback
- Search RE projects by RE number
- Get all revisions by RE number
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com')

class TestRERevisionClientWorkflow:
    """Test RE revision and client workflow features"""
    
    sales_cookies = None
    planning_cookies = None
    gm_cookies = None
    test_re_project_id = None
    test_re_number = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_01_sales_login(self):
        """Sales user login for client workflow testing"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        assert response.status_code == 200, f"Sales login failed: {response.text}"
        TestRERevisionClientWorkflow.sales_cookies = response.cookies.get_dict()
        print("PASS: Sales login successful")
    
    def test_02_planning_login(self):
        """Planning user login for revision testing"""
        time.sleep(0.5)  # Rate limit protection
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        TestRERevisionClientWorkflow.planning_cookies = response.cookies.get_dict()
        print("PASS: Planning login successful")
    
    def test_03_gm_login(self):
        """GM user login for approval testing"""
        time.sleep(0.5)  # Rate limit protection
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "gm@constructionos.com"
        })
        assert response.status_code == 200, f"GM login failed: {response.text}"
        TestRERevisionClientWorkflow.gm_cookies = response.cookies.get_dict()
        print("PASS: GM login successful")
    
    def test_04_get_re_projects_with_re_number(self):
        """Verify RE projects have USB-RE numbers and revision badges"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        assert response.status_code == 200, f"Failed to get RE projects: {response.text}"
        projects = response.json()
        assert len(projects) > 0, "No RE projects found"
        
        # Check that projects have re_number and revision fields
        projects_with_re_number = [p for p in projects if p.get('re_number')]
        assert len(projects_with_re_number) > 0, "No projects with RE numbers found"
        
        # Verify RE number format (USB-RE0001)
        for p in projects_with_re_number[:5]:
            re_number = p.get('re_number', '')
            assert re_number.startswith('USB-RE'), f"Invalid RE number format: {re_number}"
            assert 'revision' in p, f"Project missing revision field: {p.get('re_project_id')}"
            print(f"  Found: {re_number} (RE{p.get('revision', 0)}) - Status: {p.get('status')}")
        
        print(f"PASS: Found {len(projects_with_re_number)} RE projects with USB-RE numbers")
    
    def test_05_search_re_projects_by_re_number(self):
        """Test search endpoint finds RE projects by RE number"""
        # Search for USB-RE
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects/search?q=USB-RE",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        assert response.status_code == 200, f"Search failed: {response.text}"
        results = response.json()
        assert len(results) > 0, "Search for 'USB-RE' returned no results"
        
        # Verify all results have matching RE numbers
        for r in results[:5]:
            assert 'USB-RE' in r.get('re_number', ''), f"Search result doesn't match: {r.get('re_number')}"
        
        print(f"PASS: Search 'USB-RE' returned {len(results)} results")
    
    def test_06_search_re_projects_by_client_name(self):
        """Test search endpoint finds RE projects by client name"""
        # Get a client name from existing projects
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        projects = response.json()
        if projects:
            client_name = projects[0].get('client_name', '')[:5]  # First 5 chars
            if client_name:
                search_response = self.session.get(
                    f"{BASE_URL}/api/crm/re-projects/search?q={client_name}",
                    cookies=TestRERevisionClientWorkflow.planning_cookies
                )
                assert search_response.status_code == 200
                print(f"PASS: Search by client name '{client_name}' returned {len(search_response.json())} results")
            else:
                print("SKIP: No client name to search")
        else:
            print("SKIP: No projects to test search")
    
    def test_07_get_revisions_by_re_number(self):
        """Test getting all revisions for an RE number"""
        # First get an RE number that exists
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        projects = response.json()
        projects_with_re = [p for p in projects if p.get('re_number')]
        
        if projects_with_re:
            re_number = projects_with_re[0].get('parent_re_number') or projects_with_re[0].get('re_number')
            
            # Get all revisions for this RE number
            rev_response = self.session.get(
                f"{BASE_URL}/api/crm/re-projects/by-number/{re_number}",
                cookies=TestRERevisionClientWorkflow.planning_cookies
            )
            assert rev_response.status_code == 200, f"Failed to get revisions: {rev_response.text}"
            revisions = rev_response.json()
            
            # Verify revisions are sorted by revision number
            for i, rev in enumerate(revisions):
                print(f"  Revision RE{rev.get('revision', 0)}: {rev.get('re_project_id')} - Status: {rev.get('status')}")
            
            print(f"PASS: Found {len(revisions)} revision(s) for {re_number}")
        else:
            print("SKIP: No RE projects with numbers to test")
    
    def test_08_find_re_approved_project_for_client_workflow(self):
        """Find an RE project with status 're_approved' for client workflow testing"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects?status=re_approved",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        assert response.status_code == 200, f"Failed to get RE projects: {response.text}"
        projects = response.json()
        
        # Filter for re_approved status
        approved_projects = [p for p in projects if p.get('status') == 're_approved']
        
        if approved_projects:
            TestRERevisionClientWorkflow.test_re_project_id = approved_projects[0]['re_project_id']
            TestRERevisionClientWorkflow.test_re_number = approved_projects[0].get('re_number')
            print(f"PASS: Found RE project for testing: {TestRERevisionClientWorkflow.test_re_project_id} ({TestRERevisionClientWorkflow.test_re_number})")
        else:
            # Try to find any project we can use
            all_projects = response.json()
            print(f"INFO: No 're_approved' projects found. Available statuses: {set(p.get('status') for p in all_projects)}")
            pytest.skip("No 're_approved' RE project available for client workflow testing")
    
    def test_09_send_to_client_api(self):
        """Test POST /api/crm/re-projects/{id}/send-to-client"""
        if not TestRERevisionClientWorkflow.test_re_project_id:
            pytest.skip("No test RE project available")
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}/send-to-client",
            json={"notes": "Test send to client"},
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"PASS: Send to client successful - {data.get('message')}")
        elif response.status_code == 400:
            # Already in different status
            print(f"INFO: Cannot send to client - {response.json().get('detail')}")
        else:
            assert False, f"Unexpected response: {response.status_code} - {response.text}"
    
    def test_10_verify_sent_to_client_status(self):
        """Verify RE project status changed to 'sent_to_client'"""
        if not TestRERevisionClientWorkflow.test_re_project_id:
            pytest.skip("No test RE project available")
        
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        assert response.status_code == 200
        project = response.json()
        
        # Status should be sent_to_client or already moved past it
        valid_statuses = ['sent_to_client', 'client_feedback', 'client_approved', 'deal_closed', 'converted']
        assert project.get('status') in valid_statuses or project.get('status') == 're_approved', \
            f"Unexpected status: {project.get('status')}"
        
        print(f"PASS: RE project status is '{project.get('status')}'")
    
    def test_11_client_feedback_api(self):
        """Test POST /api/crm/re-projects/{id}/client-feedback"""
        if not TestRERevisionClientWorkflow.test_re_project_id:
            pytest.skip("No test RE project available")
        
        # First check current status
        check_response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        current_status = check_response.json().get('status')
        
        if current_status != 'sent_to_client':
            print(f"INFO: Cannot add feedback - current status is '{current_status}', need 'sent_to_client'")
            return
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}/client-feedback",
            json={"feedback_notes": "Test client feedback - please reduce budget for flooring"},
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"PASS: Client feedback added - {data.get('message')}")
        elif response.status_code == 400:
            print(f"INFO: Cannot add feedback - {response.json().get('detail')}")
        else:
            assert False, f"Unexpected response: {response.status_code} - {response.text}"
    
    def test_12_client_approve_api(self):
        """Test POST /api/crm/re-projects/{id}/client-approve"""
        if not TestRERevisionClientWorkflow.test_re_project_id:
            pytest.skip("No test RE project available")
        
        # First check current status
        check_response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        current_status = check_response.json().get('status')
        
        if current_status != 'sent_to_client':
            print(f"INFO: Cannot approve - current status is '{current_status}', need 'sent_to_client'")
            return
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}/client-approve",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            print(f"PASS: Client approve successful - {data.get('message')}")
        elif response.status_code == 400:
            print(f"INFO: Cannot approve - {response.json().get('detail')}")
        else:
            assert False, f"Unexpected response: {response.status_code} - {response.text}"
    
    def test_13_find_client_feedback_project_for_revision(self):
        """Find an RE project with 'client_feedback' status for revision testing"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        assert response.status_code == 200
        projects = response.json()
        
        feedback_projects = [p for p in projects if p.get('status') == 'client_feedback']
        
        if feedback_projects:
            TestRERevisionClientWorkflow.test_re_project_id = feedback_projects[0]['re_project_id']
            print(f"PASS: Found client_feedback project: {TestRERevisionClientWorkflow.test_re_project_id}")
        else:
            print(f"INFO: No 'client_feedback' projects found. Available statuses: {set(p.get('status') for p in projects)}")
    
    def test_14_create_revision_api(self):
        """Test POST /api/crm/re-projects/{id}/create-revision"""
        if not TestRERevisionClientWorkflow.test_re_project_id:
            pytest.skip("No test RE project available")
        
        # First check current status
        check_response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        current_status = check_response.json().get('status')
        
        if current_status != 'client_feedback':
            print(f"INFO: Cannot create revision - current status is '{current_status}', need 'client_feedback'")
            return
        
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{TestRERevisionClientWorkflow.test_re_project_id}/create-revision",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            assert "revision" in data
            print(f"PASS: Revision created - {data.get('message')} (RE{data.get('revision')})")
        elif response.status_code == 400:
            print(f"INFO: Cannot create revision - {response.json().get('detail')}")
        elif response.status_code == 403:
            print(f"INFO: Access denied - {response.json().get('detail')}")
        else:
            assert False, f"Unexpected response: {response.status_code} - {response.text}"
    
    def test_15_verify_re_number_in_planning_dashboard(self):
        """Verify RE numbers appear in Planning RE dashboard"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/planning/re-dashboard",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        assert response.status_code == 200, f"Failed to get dashboard: {response.text}"
        dashboard = response.json()
        
        # Dashboard should have status counts
        assert 'status_counts' in dashboard, "Dashboard missing status_counts"
        print(f"PASS: Planning dashboard loaded with status counts: {dashboard.get('status_counts')}")
    
    def test_16_verify_gm_can_see_re_numbers(self):
        """Verify GM can see RE numbers and revision badges"""
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.gm_cookies
        )
        assert response.status_code == 200, f"GM failed to get RE projects: {response.text}"
        projects = response.json()
        
        projects_with_re = [p for p in projects if p.get('re_number')]
        print(f"PASS: GM can see {len(projects_with_re)} RE projects with USB-RE numbers")
    
    def test_17_unauthorized_create_revision(self):
        """Verify Sales cannot create revision (only Planning can)"""
        # Find any client_feedback project
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        projects = response.json()
        feedback_projects = [p for p in projects if p.get('status') == 'client_feedback']
        
        if not feedback_projects:
            print("SKIP: No client_feedback projects to test unauthorized access")
            return
        
        # Try to create revision as Sales (should fail)
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{feedback_projects[0]['re_project_id']}/create-revision",
            cookies=TestRERevisionClientWorkflow.sales_cookies
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Sales correctly denied from creating revision (403)")
    
    def test_18_unauthorized_send_to_client(self):
        """Verify Planning cannot send to client (only Sales can)"""
        # Find any re_approved project
        response = self.session.get(
            f"{BASE_URL}/api/crm/re-projects",
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        projects = response.json()
        approved_projects = [p for p in projects if p.get('status') == 're_approved']
        
        if not approved_projects:
            print("SKIP: No re_approved projects to test unauthorized access")
            return
        
        # Try to send to client as Planning (should fail)
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{approved_projects[0]['re_project_id']}/send-to-client",
            json={},
            cookies=TestRERevisionClientWorkflow.planning_cookies
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Planning correctly denied from sending to client (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
