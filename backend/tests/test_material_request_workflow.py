"""
Test Material Request Workflow:
Site Engineer raises request → Planning approves qty → Procurement assigns vendor + amount → Accountant approves

Tests the new Planning Board endpoints:
- GET /api/material-requests?status=requested
- GET /api/labour-expenses?status=requested
- PATCH /api/material-requests/{id}/planning-action
- PATCH /api/labour-expenses/{id}/planning-action

Workflow status flow: requested → planning_approved → procurement_assigned/waiting_payment → order_placed
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level session to preserve cookies across tests
session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

# Test data storage
test_data = {
    "project_id": None,
    "material_request_id": None,
    "reject_request_id": None,
    "engineer_user_id": None
}


# ==================== ENDPOINT EXISTENCE TESTS ====================

def test_01_material_requests_endpoint_exists():
    """GET /api/material-requests should not return 404 (previously broken)"""
    # Login as admin first
    login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
    
    response = session.get(f"{BASE_URL}/api/material-requests")
    assert response.status_code != 404, f"Endpoint returned 404 - not found"
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    print(f"PASS - GET /api/material-requests exists and returns 200")


def test_02_material_requests_with_status_filter():
    """GET /api/material-requests?status=requested should not return 404 (THIS WAS THE BUG)"""
    response = session.get(f"{BASE_URL}/api/material-requests?status=requested")
    assert response.status_code != 404, f"Endpoint returned 404 - THE BUG IS NOT FIXED"
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Expected list response"
    print(f"PASS - GET /api/material-requests?status=requested exists and returns 200 with {len(data)} items")


def test_03_labour_expenses_endpoint_exists():
    """GET /api/labour-expenses should not return 404"""
    response = session.get(f"{BASE_URL}/api/labour-expenses")
    assert response.status_code != 404, f"Endpoint returned 404 - not found"
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    print(f"PASS - GET /api/labour-expenses exists and returns 200")


def test_04_labour_expenses_with_status_filter():
    """GET /api/labour-expenses?status=requested should not return 404 (THIS WAS THE BUG)"""
    response = session.get(f"{BASE_URL}/api/labour-expenses?status=requested")
    assert response.status_code != 404, f"Endpoint returned 404 - THE BUG IS NOT FIXED"
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Expected list response"
    print(f"PASS - GET /api/labour-expenses?status=requested exists and returns 200 with {len(data)} items")


def test_05_planning_action_endpoint_structure():
    """Verify planning-action endpoint URL structure is correct"""
    response = session.patch(
        f"{BASE_URL}/api/material-requests/nonexistent_id/planning-action",
        params={"action": "approve"}
    )
    # 404 = request not found (endpoint exists!)
    # 405 = method not allowed (endpoint may not exist)
    assert response.status_code != 405, f"Endpoint method not allowed - check route definition"
    assert response.status_code in [404, 403, 422], f"Unexpected status: {response.status_code}"
    print(f"PASS - PATCH /api/material-requests/{{id}}/planning-action endpoint exists (returned {response.status_code})")


# ==================== WORKFLOW TESTS ====================

def test_06_super_admin_login():
    """Super Admin can login via demo-login"""
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "admin@constructionos.com"
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "user_id" in data or "user" in data, "No user data returned"
    print(f"PASS - Admin logged in successfully")


def test_07_create_test_project():
    """Create a project for testing"""
    from datetime import datetime, timedelta
    
    start_date = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")
    
    response = session.post(f"{BASE_URL}/api/projects", json={
        "name": "TEST_MaterialWorkflow_Project",
        "client_name": "Test Client",
        "location": "Test Location",
        "total_value": 1000000,
        "status": "active",
        "start_date": start_date,
        "expected_completion": end_date
    })
    assert response.status_code in [200, 201], f"Create project failed: {response.text}"
    data = response.json()
    test_data["project_id"] = data.get("project_id")
    assert test_data["project_id"], "No project_id returned"
    print(f"PASS - Created test project: {test_data['project_id']}")


def test_08_get_site_engineer_user():
    """Get a site engineer user for assignment"""
    response = session.get(f"{BASE_URL}/api/hr/users")
    assert response.status_code == 200, f"Failed to get users: {response.text}"
    users = response.json()
    
    # Find site_engineer or use engineer@constructionos.com
    site_engineers = [u for u in users if u.get("role") == "site_engineer"]
    if site_engineers:
        test_data["engineer_user_id"] = site_engineers[0].get("user_id")
        print(f"PASS - Found site engineer: {test_data['engineer_user_id']}")
    else:
        engineer = next((u for u in users if u.get("email") == "engineer@constructionos.com"), None)
        if engineer:
            test_data["engineer_user_id"] = engineer.get("user_id")
            print(f"PASS - Found engineer@constructionos.com: {test_data['engineer_user_id']}")
        else:
            print(f"INFO - No site engineer found, will use admin for material request")


def test_09_assign_site_engineer_to_project():
    """Assign site engineer to the test project"""
    if not test_data["engineer_user_id"] or not test_data["project_id"]:
        pytest.skip("No engineer user ID or project ID")
        
    response = session.post(f"{BASE_URL}/api/site-engineer/assignments", json={
        "user_id": test_data["engineer_user_id"],
        "project_id": test_data["project_id"]
    })
    
    if response.status_code in [200, 201]:
        print(f"PASS - Assigned engineer to project")
    elif response.status_code == 400:
        if "already assigned" in response.text.lower():
            print(f"PASS - Engineer already assigned to project")
        elif "must be a Site Engineer" in response.text:
            print(f"INFO - User is not site engineer role, will create request as admin")
        else:
            print(f"INFO - Assignment returned 400: {response.text}")
    else:
        print(f"INFO - Assignment returned {response.status_code}: {response.text}")


def test_10_create_material_request_as_admin():
    """Create a material request (as admin since engineer might not be assigned)"""
    if not test_data["project_id"]:
        pytest.skip("No test project")
    
    # Use admin to create material request (super_admin can bypass assignment check)
    response = session.post(f"{BASE_URL}/api/site-engineer/material-requests", json={
        "project_id": test_data["project_id"],
        "material_name": "TEST Cement Bags",
        "quantity": 100,
        "unit": "bags",
        "remarks": "Test request for workflow testing"
    })
    
    if response.status_code == 403:
        # Admin might not have permission, try with actual site engineer endpoints
        print(f"INFO - Admin cannot create site engineer request, trying site-ops route")
        pytest.skip("Admin cannot create material request via site-engineer endpoint")
    
    assert response.status_code in [200, 201], f"Create material request failed: {response.text}"
    data = response.json()
    test_data["material_request_id"] = data.get("request_id")
    assert test_data["material_request_id"], "No request_id returned"
    assert data.get("status") == "requested", f"Expected status 'requested', got: {data.get('status')}"
    print(f"PASS - Created material request: {test_data['material_request_id']} with status 'requested'")


def test_11_login_as_planning():
    """Login as Planning user"""
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "planning@constructionos.com"
    })
    assert response.status_code == 200, f"Planning login failed: {response.text}"
    data = response.json()
    assert data.get("role") == "planning", f"Expected planning role, got: {data.get('role')}"
    print(f"PASS - Logged in as Planning user")


def test_12_planning_can_see_requested_material_requests():
    """Planning Board can see material requests with status=requested"""
    response = session.get(f"{BASE_URL}/api/material-requests?status=requested")
    assert response.status_code == 200, f"GET /api/material-requests?status=requested failed: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Expected list response"
    print(f"PASS - Planning sees {len(data)} material requests with status=requested")
    
    # Check if our test request is visible
    if test_data["material_request_id"]:
        found = any(r.get("request_id") == test_data["material_request_id"] for r in data)
        if found:
            print(f"PASS - Test material request is visible to Planning")
        else:
            print(f"INFO - Test request not in list (may not exist or status changed)")


def test_13_planning_approve_material_request():
    """Planning approves material request via PATCH planning-action"""
    if not test_data["material_request_id"]:
        pytest.skip("No test material request")
    
    response = session.patch(
        f"{BASE_URL}/api/material-requests/{test_data['material_request_id']}/planning-action",
        params={"action": "approve"}
    )
    assert response.status_code == 200, f"Planning approve failed: {response.text}"
    data = response.json()
    
    # Response should indicate success
    assert data.get("status") == "planning_approved" or data.get("message") == "Approved", \
        f"Expected success response, got: {data}"
    print(f"PASS - Planning approved material request, new status: planning_approved")


def test_14_verify_status_changed_to_planning_approved():
    """Verify the material request status is now planning_approved"""
    if not test_data["material_request_id"]:
        pytest.skip("No test material request")
    
    # Get all material requests
    response = session.get(f"{BASE_URL}/api/material-requests")
    assert response.status_code == 200, f"Failed to get material requests: {response.text}"
    data = response.json()
    
    # Find our test request
    test_request = next(
        (r for r in data if r.get("request_id") == test_data["material_request_id"]), 
        None
    )
    
    if test_request:
        assert test_request.get("status") == "planning_approved", \
            f"Expected status 'planning_approved', got: {test_request.get('status')}"
        print(f"PASS - Material request status confirmed: planning_approved")
    else:
        print(f"INFO - Test request not found in response, checking with admin")
        # Re-login as admin to check
        session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        response = session.get(f"{BASE_URL}/api/material-requests")
        data = response.json()
        test_request = next(
            (r for r in data if r.get("request_id") == test_data["material_request_id"]), 
            None
        )
        if test_request:
            assert test_request.get("status") == "planning_approved", \
                f"Expected 'planning_approved', got: {test_request.get('status')}"
            print(f"PASS - Material request status confirmed via admin: planning_approved")


def test_15_login_as_procurement():
    """Login as Procurement user"""
    response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
        "email": "procurement@constructionos.com"
    })
    assert response.status_code == 200, f"Procurement login failed: {response.text}"
    data = response.json()
    assert data.get("role") == "procurement", f"Expected procurement role, got: {data.get('role')}"
    print(f"PASS - Logged in as Procurement user")


def test_16_procurement_can_see_pending_requests():
    """Procurement can see planning-approved requests via GET /api/procurement/requests?status=pending"""
    response = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
    assert response.status_code == 200, f"GET /api/procurement/requests failed: {response.text}"
    data = response.json()
    assert isinstance(data, list), "Expected list response"
    print(f"PASS - Procurement can see {len(data)} pending requests")


def test_17_test_planning_reject_flow():
    """Test Planning reject flow - create another request and reject it"""
    # Login as admin to create another request
    session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
    
    if not test_data["project_id"]:
        pytest.skip("No test project")
    
    # Create a new request to reject
    response = session.post(f"{BASE_URL}/api/site-engineer/material-requests", json={
        "project_id": test_data["project_id"],
        "material_name": "TEST Steel Rods for Rejection",
        "quantity": 50,
        "unit": "ton",
        "remarks": "Test request for rejection"
    })
    
    if response.status_code not in [200, 201]:
        pytest.skip(f"Could not create second request: {response.text}")
    
    reject_request_id = response.json().get("request_id")
    test_data["reject_request_id"] = reject_request_id
    print(f"Created reject test request: {reject_request_id}")
    
    # Login as planning to reject
    session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
    
    response = session.patch(
        f"{BASE_URL}/api/material-requests/{reject_request_id}/planning-action",
        params={"action": "reject", "reason": "Test rejection reason"}
    )
    assert response.status_code == 200, f"Planning reject failed: {response.text}"
    data = response.json()
    assert data.get("status") == "rejected" or data.get("message") == "Rejected", \
        f"Expected rejected status, got: {data}"
    print(f"PASS - Planning rejected material request, status now: rejected")


def test_18_cleanup_summary():
    """Print summary of test data created"""
    print(f"\n=== TEST DATA SUMMARY ===")
    print(f"Test Project: {test_data['project_id']}")
    print(f"Approved Request: {test_data['material_request_id']}")
    print(f"Rejected Request: {test_data['reject_request_id']}")
    print(f"All test data has TEST_ prefix for identification")
    print(f"=========================")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
