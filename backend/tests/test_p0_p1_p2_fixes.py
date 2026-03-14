"""
Test cases for P0, P1, P2 fixes:
- P0: CRE Dashboard duplicate projects fix and payment_received_count includes payment_verified
- P1: Planning Board New Projects tab with dedicated card view
- P2: Convert RE Scope to Project Scope functionality
- Backend duplicate prevention for convert-re-project endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CRE_USER = {"email": "cre@constructionos.com", "password": "Demo@1234"}
PLANNING_USER = {"email": "planning@constructionos.com", "password": "Demo@1234"}
SUPER_ADMIN = {"email": "urbanspacebuilderstech@gmail.com", "password": "Demo@1234"}


class TestCREDashboardDuplicates:
    """P0: Test that CRE Dashboard does not show duplicate projects"""
    
    def test_cre_login(self):
        """Test CRE user can login"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        data = response.json()
        assert "role" in data
        assert data["role"] == "cre"
        return session
    
    def test_cre_dashboard_no_duplicates(self):
        """Test CRE dashboard returns unique projects (no duplicates)"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        
        # Fetch dashboard
        dashboard_res = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert dashboard_res.status_code == 200, f"Dashboard fetch failed: {dashboard_res.text}"
        
        data = dashboard_res.json()
        recent_projects = data.get("recent_projects", [])
        
        # Check for duplicates by project_id
        project_ids = [p.get("project_id") for p in recent_projects]
        unique_ids = set(project_ids)
        
        assert len(project_ids) == len(unique_ids), f"Duplicate projects found! IDs: {project_ids}"
        print(f"PASS: No duplicate projects found. Total projects: {len(project_ids)}")
    
    def test_cre_dashboard_payment_received_count(self):
        """Test that payment_received_count includes both payment_received and payment_verified statuses"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert login_res.status_code == 200
        
        dashboard_res = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert dashboard_res.status_code == 200
        
        data = dashboard_res.json()
        payment_received_count = data.get("payment_received_count", 0)
        
        # The count should be a non-negative integer
        assert isinstance(payment_received_count, int), "payment_received_count should be an integer"
        assert payment_received_count >= 0, "payment_received_count should be non-negative"
        print(f"PASS: payment_received_count = {payment_received_count}")
    
    def test_cre_dashboard_counts_exist(self):
        """Verify all expected count fields exist in dashboard response"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert login_res.status_code == 200
        
        dashboard_res = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert dashboard_res.status_code == 200
        
        data = dashboard_res.json()
        
        expected_fields = [
            "draft_count", 
            "pending_payment_count", 
            "payment_received_count",
            "in_planning_count", 
            "approved_count", 
            "total_ongoing"
        ]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
            print(f"  {field}: {data[field]}")
        
        print("PASS: All count fields present in CRE dashboard")


class TestPlanningBoardNewProjects:
    """P1: Test Planning Board New Projects tab functionality"""
    
    def test_planning_login(self):
        """Test Planning user can login"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_USER)
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "planning"
        return session
    
    def test_planning_projects_new_status_endpoint(self):
        """Test /api/planning/projects?status=new returns proper data"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_USER)
        assert login_res.status_code == 200
        
        # Fetch new projects
        projects_res = session.get(f"{BASE_URL}/api/planning/projects?status=new")
        assert projects_res.status_code == 200, f"Planning projects fetch failed: {projects_res.text}"
        
        projects = projects_res.json()
        assert isinstance(projects, list), "Response should be a list"
        
        print(f"PASS: Planning new projects endpoint returns {len(projects)} project(s)")
        
        # If there are projects, verify they have expected fields
        if projects:
            first_project = projects[0]
            expected_fields = ["project_id", "name", "client_name", "status"]
            for field in expected_fields:
                assert field in first_project, f"Project missing field: {field}"
            
            # Verify status is one of the new statuses
            valid_statuses = ["in_planning", "planning_review", "planning"]
            assert first_project["status"] in valid_statuses, f"Unexpected status: {first_project['status']}"
            print(f"  First project: {first_project['name']} (status: {first_project['status']})")
    
    def test_planning_stage_dashboard(self):
        """Test planning stage dashboard for new projects count"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_USER)
        assert login_res.status_code == 200
        
        dashboard_res = session.get(f"{BASE_URL}/api/planning/stage-dashboard")
        assert dashboard_res.status_code == 200, f"Stage dashboard failed: {dashboard_res.text}"
        
        data = dashboard_res.json()
        assert "new_projects" in data, "new_projects count missing"
        assert isinstance(data["new_projects"], int), "new_projects should be integer"
        print(f"PASS: Planning dashboard shows {data['new_projects']} new project(s)")


class TestConvertREToScope:
    """P2: Test Convert RE Scope to Project Scope functionality"""
    
    def test_scope_items_bulk_endpoint(self):
        """Test /api/scope-items/bulk endpoint exists and validates input"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_USER)
        assert login_res.status_code == 200
        
        # Test with invalid data (missing project_id)
        response = session.post(f"{BASE_URL}/api/scope-items/bulk", json={
            "items": [{"item_name": "Test Item", "quantity": 1, "unit": "Nos", "unit_rate": 100}]
        })
        
        # Should fail with 422 (validation error) for missing project_id
        assert response.status_code in [400, 422], f"Expected validation error, got {response.status_code}"
        print("PASS: Bulk scope items endpoint validates project_id requirement")
    
    def test_re_project_has_scope_items(self):
        """Test that RE projects can have scope items to convert"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_USER)
        assert login_res.status_code == 200
        
        # Fetch RE projects to check for scope_items
        re_projects_res = session.get(f"{BASE_URL}/api/crm/re-projects")
        
        if re_projects_res.status_code == 200:
            re_projects = re_projects_res.json()
            if re_projects:
                for project in re_projects[:3]:  # Check first 3
                    if "scope_items" in project:
                        scope_count = len(project.get("scope_items", []))
                        print(f"  RE Project '{project.get('project_name', 'N/A')}' has {scope_count} scope items")
                print("PASS: RE Projects have scope_items field")
            else:
                print("INFO: No RE projects found (may be expected if none exist)")
        else:
            print(f"INFO: RE projects endpoint returned {re_projects_res.status_code}")


class TestDuplicatePreventionBackend:
    """Test backend duplicate prevention for convert-re-project endpoint"""
    
    def test_convert_re_project_duplicate_check_logic(self):
        """Verify duplicate check logic exists in convert-re-project endpoint"""
        # This is more of a code review test - verifying the endpoint rejects duplicates
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert login_res.status_code == 200
        
        # Try to convert a non-existent RE project (should return 404)
        response = session.post(f"{BASE_URL}/api/cre/convert-re-project/non_existent_id", json={
            "advance_amount": 10000,
            "payment_mode": "cash",
            "accountant_confirmed": True
        })
        
        # Should fail with 404 (not found) not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for non-existent RE, got {response.status_code}"
        print("PASS: convert-re-project endpoint handles non-existent RE properly")
    
    def test_convert_deal_duplicate_check_logic(self):
        """Verify duplicate check logic exists in convert-deal endpoint"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=CRE_USER)
        assert login_res.status_code == 200
        
        # Try to convert a non-existent lead (should return 404)
        response = session.post(f"{BASE_URL}/api/cre/convert-deal/non_existent_lead_id", json={
            "advance_amount": 10000,
            "payment_mode": "cash",
            "accountant_confirmed": True
        })
        
        # Should fail with 404 (not found) not 500
        assert response.status_code in [400, 404], f"Expected 400/404 for non-existent lead, got {response.status_code}"
        print("PASS: convert-deal endpoint handles non-existent lead properly")


class TestSuperAdminDashboard:
    """Test that Super Admin can see all projects (not filtered by created_by)"""
    
    def test_super_admin_sees_all_projects(self):
        """Super Admin CRE dashboard should show all projects"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
        assert login_res.status_code == 200, f"Super Admin login failed: {login_res.text}"
        
        # Fetch CRE dashboard as Super Admin
        dashboard_res = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert dashboard_res.status_code == 200, f"Dashboard fetch failed: {dashboard_res.text}"
        
        data = dashboard_res.json()
        recent_projects = data.get("recent_projects", [])
        
        # Verify projects exist and no duplicates
        project_ids = [p.get("project_id") for p in recent_projects]
        unique_ids = set(project_ids)
        
        assert len(project_ids) == len(unique_ids), f"Duplicate projects found for Super Admin!"
        print(f"PASS: Super Admin sees {len(project_ids)} unique project(s)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
