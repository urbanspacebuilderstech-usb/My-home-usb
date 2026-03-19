"""
Test: Rough Requirement Feature for RE Projects
When sales moves lead to 'Rough Estimate Requested' stage with rough_requirement,
it should be stored in the re_projects collection and visible to Planning team.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def sales_token(api_client):
    """Get authentication token for Sales user"""
    response = api_client.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "sales@constructionos.com"
    })
    if response.status_code == 200:
        for cookie in response.cookies:
            api_client.cookies.set(cookie.name, cookie.value)
        return True
    pytest.skip("Sales login failed - skipping sales tests")

@pytest.fixture(scope="module")
def planning_token(api_client):
    """Get authentication token for Planning user"""
    # Create fresh session for planning
    planning_session = requests.Session()
    planning_session.headers.update({"Content-Type": "application/json"})
    response = planning_session.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "planning@constructionos.com"
    })
    if response.status_code == 200:
        for cookie in response.cookies:
            planning_session.cookies.set(cookie.name, cookie.value)
        return planning_session
    pytest.skip("Planning login failed - skipping planning tests")


class TestRoughRequirementFeature:
    """Test rough requirement flow: Sales → Planning"""
    
    created_lead_id = None
    created_re_project_id = None
    
    def test_01_sales_login_success(self, api_client, sales_token):
        """Test Sales demo login works"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Sales /me failed: {response.text}"
        data = response.json()
        assert data.get("role") in ["sales", "super_admin"], f"Expected sales or super_admin role, got: {data.get('role')}"
        print(f"PASS: Sales user logged in - {data.get('email')}")
    
    def test_02_create_lead_for_testing(self, api_client, sales_token):
        """Create a new lead for testing rough requirement flow"""
        unique_name = f"TEST_RoughReq_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "phone": "9876543210",
            "email": f"{unique_name.lower()}@test.com",
            "source": "website",
            "stage_type": "sales"
        }
        response = api_client.post(f"{BASE_URL}/api/crm/leads", json=payload)
        assert response.status_code == 200, f"Failed to create lead: {response.text}"
        data = response.json()
        assert "lead_id" in data, f"No lead_id in response: {data}"
        TestRoughRequirementFeature.created_lead_id = data["lead_id"]
        print(f"PASS: Lead created with ID: {data['lead_id']}")
    
    def test_03_get_sales_stages(self, api_client, sales_token):
        """Verify sales stages are available including 'Rough Estimate Requested'"""
        response = api_client.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        data = response.json()
        stage_names = [s.get("name") for s in data]
        assert "Rough Estimate Requested" in stage_names, f"'Rough Estimate Requested' stage not found in: {stage_names}"
        print(f"PASS: Sales stages available, includes 'Rough Estimate Requested'")
    
    def test_04_move_lead_to_re_requested_with_rough_requirement(self, api_client, sales_token):
        """Move lead to 'Rough Estimate Requested' stage with rough_requirement text"""
        lead_id = TestRoughRequirementFeature.created_lead_id
        assert lead_id is not None, "Lead ID not available - test_02 must have failed"
        
        rough_requirement_text = """Client Requirement for Testing:
- 2 BHK house, ground + 1 floor
- Plot size: 1200 sqft
- Budget range: 30-40 lakhs
- Modern design with car parking
- Timeline: 8-10 months"""
        
        payload = {
            "stage_id": "stg_re_requested",
            "rough_requirement": rough_requirement_text
        }
        response = api_client.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json=payload)
        assert response.status_code == 200, f"Failed to move lead to RE Requested: {response.text}"
        data = response.json()
        
        # Verify RE project was created
        assert data.get("re_project_created") == True, f"RE project not created: {data}"
        assert "re_project_id" in data, f"No re_project_id in response: {data}"
        TestRoughRequirementFeature.created_re_project_id = data["re_project_id"]
        print(f"PASS: Lead moved to 'Rough Estimate Requested', RE Project created: {data['re_project_id']}")
    
    def test_05_verify_re_project_has_rough_requirement(self, api_client, sales_token):
        """Verify the created RE project contains the rough_requirement field"""
        re_project_id = TestRoughRequirementFeature.created_re_project_id
        assert re_project_id is not None, "RE Project ID not available - test_04 must have failed"
        
        response = api_client.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}")
        assert response.status_code == 200, f"Failed to get RE project: {response.text}"
        data = response.json()
        
        # Verify rough_requirement is stored
        assert "rough_requirement" in data, f"rough_requirement field not found in RE project: {data.keys()}"
        assert "2 BHK house" in data["rough_requirement"], f"rough_requirement content mismatch: {data.get('rough_requirement')}"
        assert data.get("status") == "re_requested", f"RE project status should be 're_requested', got: {data.get('status')}"
        print(f"PASS: RE project contains rough_requirement with correct content")
    
    def test_06_planning_can_see_re_project(self, planning_token):
        """Planning team can see the RE project with rough_requirement"""
        re_project_id = TestRoughRequirementFeature.created_re_project_id
        assert re_project_id is not None, "RE Project ID not available"
        
        # Planning session views the RE project
        response = planning_token.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}")
        assert response.status_code == 200, f"Planning failed to get RE project: {response.text}"
        data = response.json()
        
        # Verify rough_requirement is visible
        assert "rough_requirement" in data, "rough_requirement not visible to Planning"
        assert len(data.get("rough_requirement", "")) > 10, "rough_requirement appears empty"
        print(f"PASS: Planning can see RE project with rough_requirement")
    
    def test_07_planning_can_see_re_projects_list(self, planning_token):
        """Planning team can see all RE projects including ones with rough_requirement"""
        response = planning_token.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200, f"Planning failed to list RE projects: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list of RE projects, got: {type(data)}"
        
        # Find our test RE project
        re_project_id = TestRoughRequirementFeature.created_re_project_id
        found_project = None
        for proj in data:
            if proj.get("re_project_id") == re_project_id:
                found_project = proj
                break
        
        assert found_project is not None, f"Test RE project {re_project_id} not found in list"
        assert "rough_requirement" in found_project, "rough_requirement not in list response"
        print(f"PASS: Planning can list RE projects with rough_requirement field")
    
    def test_08_planning_dashboard_shows_re_projects(self, planning_token):
        """Planning dashboard/RE dashboard endpoint works"""
        response = planning_token.get(f"{BASE_URL}/api/crm/planning/re-dashboard")
        assert response.status_code == 200, f"Failed to get Planning RE dashboard: {response.text}"
        data = response.json()
        
        # Should have status_counts
        assert "status_counts" in data or "re_requested" in str(data), f"Dashboard response unexpected: {data}"
        print(f"PASS: Planning RE dashboard loads successfully")
    
    def test_09_move_without_rough_requirement_still_works(self, api_client, sales_token):
        """Test that moving to RE Requested without rough_requirement still creates RE project"""
        # Create another lead
        unique_name = f"TEST_NoReq_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": unique_name,
            "phone": "9876543211",
            "email": f"{unique_name.lower()}@test.com",
            "source": "direct",
            "stage_type": "sales"
        }
        create_response = api_client.post(f"{BASE_URL}/api/crm/leads", json=payload)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Move without rough_requirement
        move_payload = {
            "stage_id": "stg_re_requested"
        }
        move_response = api_client.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json=move_payload)
        assert move_response.status_code == 200, f"Failed to move lead without rough_requirement: {move_response.text}"
        data = move_response.json()
        
        # RE project should still be created
        assert data.get("re_project_created") == True, f"RE project should be created even without rough_requirement: {data}"
        print(f"PASS: RE project created even without rough_requirement (backward compatible)")
    
    def test_10_cleanup_test_data(self, api_client, sales_token):
        """Cleanup test-created leads - verify we can still get data"""
        lead_id = TestRoughRequirementFeature.created_lead_id
        if lead_id:
            response = api_client.get(f"{BASE_URL}/api/crm/leads/{lead_id}")
            assert response.status_code == 200, f"Cleanup check failed: {response.text}"
            data = response.json()
            assert "TEST_" in data.get("name", ""), "Test lead should have TEST_ prefix"
        print(f"PASS: Test data verified (cleanup not strictly needed for this test)")


class TestSalesCRMPageAccess:
    """Test Sales CRM page access"""
    
    def test_sales_crm_dashboard(self, api_client, sales_token):
        """Sales CRM dashboard endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200, f"Sales dashboard failed: {response.text}"
        data = response.json()
        assert "stages" in data, f"No stages in sales dashboard: {data.keys()}"
        assert "re_stats" in data, f"No re_stats in sales dashboard: {data.keys()}"
        print(f"PASS: Sales CRM dashboard loads with stages and re_stats")
    
    def test_sales_crm_leads_list(self, api_client, sales_token):
        """Sales CRM leads list endpoint works"""
        response = api_client.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200, f"Sales leads list failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"PASS: Sales CRM leads list returns {len(data)} leads")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
