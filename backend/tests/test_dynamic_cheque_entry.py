"""
Test Dynamic Cheque Entry Feature
Tests for:
1. Create Project with cheque payment mode and cheque_details
2. Collect Payment with cheque payment mode and cheque_details
3. Verify the feature works end-to-end
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def cre_session():
    """Get CRE authenticated session with cookies"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "cre@constructionos.com",
        "password": "Demo@1234"
    })
    
    assert response.status_code == 200, f"CRE login failed: {response.text}"
    print(f"\n✓ Logged in as CRE: {response.json().get('name')}")
    
    return session


# Test: CRE Dashboard loads with correct data
def test_cre_dashboard_loads(cre_session):
    """Test CRE dashboard API returns expected data structure"""
    response = cre_session.get(f"{BASE_URL}/api/cre/dashboard")
    
    assert response.status_code == 200, f"CRE dashboard failed: {response.text}"
    
    data = response.json()
    
    # Verify expected fields exist
    expected_fields = ["draft_count", "pending_payment_count", "recent_projects", "payments_to_collect"]
    for field in expected_fields:
        assert field in data, f"Missing field: {field}"
    
    print(f"\n✓ CRE Dashboard API working correctly")
    print(f"  - Draft projects: {data.get('draft_count', 0)}")
    print(f"  - Pending payment: {data.get('pending_payment_count', 0)}")
    print(f"  - Recent projects: {len(data.get('recent_projects', []))}")
    print(f"  - Payments to collect: {len(data.get('payments_to_collect', []))}")
    
    return data


# Test: Get payment requests that need collection
def test_get_payment_requests(cre_session):
    """Test CRE payment requests endpoint"""
    response = cre_session.get(f"{BASE_URL}/api/cre/payment-requests")
    
    assert response.status_code == 200, f"Failed to get payment requests: {response.text}"
    
    requests_data = response.json()
    print(f"\n✓ Found {len(requests_data)} payment requests")
    
    return requests_data


# Test: Collect payment with cheque details
def test_collect_payment_with_cheque_details(cre_session):
    """Test POST /api/payment-stages/{stage_id}/collect with cheque_details"""
    # Get payment requests
    response = cre_session.get(f"{BASE_URL}/api/cre/payment-requests")
    
    if response.status_code != 200:
        pytest.skip("Could not get payment requests")
    
    requests_data = response.json()
    
    if not requests_data:
        pytest.skip("No payment requests available for testing")
    
    # Find a stage with balance
    test_stage = None
    for stage in requests_data:
        amount = stage.get("amount", 0)
        received = stage.get("amount_received", 0)
        if amount > received:
            test_stage = stage
            break
    
    if not test_stage:
        pytest.skip("No payment stage with balance available")
    
    stage_id = test_stage.get("stage_id")
    balance = test_stage.get("amount", 0) - test_stage.get("amount_received", 0)
    
    test_id = f"TEST_{uuid.uuid4().hex[:8]}"
    collect_amount = min(balance, 50000)
    
    # Collect payment with cheque mode and multiple cheques
    payload = {
        "amount_received": collect_amount,
        "payment_mode": "cheque",
        "payment_reference": f"Test collection {test_id}",
        "remarks": "Test payment collection with multiple cheques",
        "cheque_details": [
            {
                "cheque_number": f"COL_CHQ001_{test_id}",
                "bank_name": "SBI",
                "amount": collect_amount * 0.6,
                "cheque_date": datetime.now().strftime("%Y-%m-%d")
            },
            {
                "cheque_number": f"COL_CHQ002_{test_id}",
                "bank_name": "Axis Bank",
                "amount": collect_amount * 0.4,
                "cheque_date": datetime.now().strftime("%Y-%m-%d")
            }
        ]
    }
    
    response = cre_session.post(f"{BASE_URL}/api/payment-stages/{stage_id}/collect", json=payload)
    
    # Verify collection
    assert response.status_code in [200, 201], f"Failed to collect payment: {response.text}"
    
    print(f"\n✓ Payment collected successfully with cheque details!")
    print(f"  - Stage ID: {stage_id}")
    print(f"  - Amount: ₹{collect_amount:,.0f}")
    print(f"  - Cheque 1: COL_CHQ001_{test_id} (SBI) - ₹{collect_amount * 0.6:,.0f}")
    print(f"  - Cheque 2: COL_CHQ002_{test_id} (Axis) - ₹{collect_amount * 0.4:,.0f}")
    
    return response.json()


# Test: Create project with cheque payment mode
def test_create_project_with_cheque_mode(cre_session):
    """Test POST /api/cre/projects with cheque mode and cheque_details"""
    # First, get a package to use
    dashboard_response = cre_session.get(f"{BASE_URL}/api/cre/dashboard")
    assert dashboard_response.status_code == 200
    
    # Try to get packages from settings
    packages_response = cre_session.get(f"{BASE_URL}/api/settings/packages")
    
    package_id = None
    if packages_response.status_code == 200:
        packages = packages_response.json()
        if packages:
            package_id = packages[0].get("package_id")
    
    if not package_id:
        # Skip if no packages available
        pytest.skip("No packages available for project creation test")
    
    test_id = f"TEST_CHQ_{uuid.uuid4().hex[:8]}"
    
    # Create project with cheque payment mode
    payload = {
        "name": f"Test Cheque Project {test_id}",
        "client_name": "Test Client Cheque",
        "client_phone": "9876543210",
        "client_email": "testchq@example.com",
        "location": "Test Location",
        "sqft": 1500,
        "building_type": "residential",
        "expected_start_date": datetime.now().strftime("%Y-%m-%d"),
        "package_id": package_id,
        "advance_date": datetime.now().strftime("%Y-%m-%d"),
        "advance_amount": 500000,
        "advance_payment_mode": "cheque",
        "cheque_details": [
            {
                "cheque_number": f"ADV_CHQ001_{test_id}",
                "bank_name": "HDFC Bank",
                "amount": 300000,
                "cheque_date": datetime.now().strftime("%Y-%m-%d")
            },
            {
                "cheque_number": f"ADV_CHQ002_{test_id}",
                "bank_name": "ICICI Bank",
                "amount": 200000,
                "cheque_date": datetime.now().strftime("%Y-%m-%d")
            }
        ]
    }
    
    response = cre_session.post(f"{BASE_URL}/api/cre/projects", json=payload)
    
    assert response.status_code in [200, 201], f"Failed to create project: {response.text}"
    
    data = response.json()
    assert "project_id" in data, "Response should contain project_id"
    
    print(f"\n✓ Created project with cheque payment mode!")
    print(f"  - Project ID: {data['project_id']}")
    print(f"  - Advance: ₹500,000 via cheque")
    print(f"  - Cheque 1: ADV_CHQ001_{test_id} (HDFC) - ₹300,000")
    print(f"  - Cheque 2: ADV_CHQ002_{test_id} (ICICI) - ₹200,000")
    
    return data


# Test: Verify projects endpoint returns projects
def test_get_all_cre_projects(cre_session):
    """Test CRE can see all their projects"""
    response = cre_session.get(f"{BASE_URL}/api/cre/projects/all")
    
    assert response.status_code == 200, f"Failed to get projects: {response.text}"
    
    projects = response.json()
    print(f"\n✓ CRE has {len(projects)} projects")
    
    # Check if any have cheque payment mode
    cheque_projects = [p for p in projects if p.get("advance_payment_mode") == "cheque"]
    print(f"  - Projects with cheque payment: {len(cheque_projects)}")
    
    return projects


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
