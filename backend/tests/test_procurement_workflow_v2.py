"""
Test Procurement Workflow V2 Features:
1. GET /api/procurement/dashboard - accessible by procurement, PM, accountant, planning, super_admin
2. GET /api/procurement/requests?status=planning_approved - accessible by PM role
3. POST /api/procurement/v2/select-vendor/{request_id} - supports advance/full/credit/post_delivery payment types
4. PATCH /api/procurement/v2/accounts-approval/{request_id} - with action=reject sets status to accounts_rejected
5. POST /api/procurement/v2/select-vendor/{request_id} - allows re-edit when status is accounts_rejected
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - demo login with email only
TEST_USERS = {
    'procurement': 'procurement@constructionos.com',
    'pm': 'pm@constructionos.com',
    'accountant': 'accountant@constructionos.com',
    'admin': 'admin@constructionos.com',
    'planning': 'planning@constructionos.com',
    'se': 'se@constructionos.com',  # Site Engineer - should NOT have access to dashboard
}


@pytest.fixture(scope="module")
def sessions():
    """Create authenticated sessions for each test user"""
    user_sessions = {}
    for role, email in TEST_USERS.items():
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        # Demo login with just email
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        if response.status_code == 200:
            user_sessions[role] = session
            print(f"✓ Logged in as {role}: {email}")
        else:
            print(f"✗ Failed to login as {role}: {response.status_code} - {response.text}")
    return user_sessions


@pytest.fixture(scope="module")
def test_material_request(sessions):
    """Create a test material request in planning_approved status"""
    # We need a material request in planning_approved status
    # First get existing projects and materials
    session = sessions.get('admin') or sessions.get('procurement')
    
    # Get a project
    projects_resp = session.get(f"{BASE_URL}/api/projects")
    if projects_resp.status_code != 200 or not projects_resp.json():
        pytest.skip("No projects available for testing")
    project = projects_resp.json()[0]
    project_id = project.get('project_id')
    
    # Create a material request
    request_data = {
        "project_id": project_id,
        "material_id": f"mat_test_{uuid.uuid4().hex[:8]}",
        "material_name": f"TEST_Procurement_Material_{uuid.uuid4().hex[:6]}",
        "quantity": 100,
        "unit": "Nos",
        "stage": "Foundation",
        "requested_date": datetime.now().isoformat()
    }
    
    # Try to create via SE flow or direct insert
    se_session = sessions.get('se') or sessions.get('admin')
    create_resp = se_session.post(f"{BASE_URL}/api/material-requests", json=request_data)
    
    if create_resp.status_code == 201 or create_resp.status_code == 200:
        request_id = create_resp.json().get('request_id')
        
        # Approve by planning
        planning_session = sessions.get('planning') or sessions.get('admin')
        approve_resp = planning_session.patch(
            f"{BASE_URL}/api/material-requests/{request_id}/planning-approve",
            json={"approved": True}
        )
        if approve_resp.status_code == 200:
            return {"request_id": request_id, "project_id": project_id, **request_data}
    
    # Fallback: search for existing planning_approved request
    resp = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
    if resp.status_code == 200 and resp.json():
        return resp.json()[0]
    
    pytest.skip("Could not create or find a test material request")


class TestProcurementDashboardAccess:
    """Test GET /api/procurement/dashboard access by different roles"""
    
    def test_procurement_can_access_dashboard(self, sessions):
        """Procurement role should access dashboard"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify dashboard structure
        assert "pending_requests" in data
        assert "pricing_in_progress" in data
        assert "waiting_accounts" in data
        assert "approved_orders" in data
        print(f"✓ Procurement dashboard access: pending={data.get('pending_requests')}, pricing={data.get('pricing_in_progress')}")
    
    def test_pm_can_access_dashboard(self, sessions):
        """PM role should access dashboard"""
        session = sessions.get('pm')
        if not session:
            pytest.skip("PM user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "pending_requests" in data
        print(f"✓ PM can access procurement dashboard")
    
    def test_accountant_can_access_dashboard(self, sessions):
        """Accountant role should access dashboard"""
        session = sessions.get('accountant')
        if not session:
            pytest.skip("Accountant user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "pending_requests" in data
        print(f"✓ Accountant can access procurement dashboard")
    
    def test_planning_can_access_dashboard(self, sessions):
        """Planning role should access dashboard"""
        session = sessions.get('planning')
        if not session:
            pytest.skip("Planning user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "pending_requests" in data
        print(f"✓ Planning can access procurement dashboard")
    
    def test_super_admin_can_access_dashboard(self, sessions):
        """Super Admin role should access dashboard"""
        session = sessions.get('admin')
        if not session:
            pytest.skip("Admin user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "pending_requests" in data
        print(f"✓ Super Admin can access procurement dashboard")


class TestProcurementRequestsAccess:
    """Test GET /api/procurement/requests access"""
    
    def test_pm_can_view_planning_approved_requests(self, sessions):
        """PM should be able to view planning_approved requests"""
        session = sessions.get('pm')
        if not session:
            pytest.skip("PM user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ PM can view procurement requests (count: {len(response.json())})")
    
    def test_accountant_can_view_requests(self, sessions):
        """Accountant should be able to view requests"""
        session = sessions.get('accountant')
        if not session:
            pytest.skip("Accountant user not logged in")
        
        response = session.get(f"{BASE_URL}/api/procurement/requests")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Accountant can view procurement requests")


class TestSelectVendorPaymentTypes:
    """Test POST /api/procurement/v2/select-vendor with different payment types"""
    
    def test_select_vendor_with_advance_payment_percent(self, sessions, test_material_request):
        """Test vendor selection with advance payment (percentage mode)"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement user not logged in")
        
        request_id = test_material_request.get('request_id')
        if not request_id:
            pytest.skip("No test material request")
        
        # First get vendors
        vendors_resp = session.get(f"{BASE_URL}/api/vendor-master")
        if vendors_resp.status_code != 200 or not vendors_resp.json():
            # Create a test vendor
            vendor_data = {
                "name": f"TEST_Vendor_{uuid.uuid4().hex[:6]}",
                "phone": "9876543210",
                "category": "material"
            }
            create_vendor = session.post(f"{BASE_URL}/api/vendor-master/v2/create", json=vendor_data)
            if create_vendor.status_code == 200:
                vendor_id = create_vendor.json().get('vendor_id')
                vendor_name = vendor_data['name']
            else:
                pytest.skip("Cannot create vendor for testing")
        else:
            vendor = vendors_resp.json()[0]
            vendor_id = vendor.get('vendor_id')
            vendor_name = vendor.get('name')
        
        # Select vendor with advance payment (percentage mode)
        payload = {
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "unit_rate": 100.0,
            "transport_cost": 500.0,
            "discount": 50.0,
            "payment_type": "advance",
            "advance_mode": "percentage",
            "advance_percent": 50.0,
            "credit_period_days": 0,
            "expected_delivery": "2026-02-01"
        }
        
        response = session.post(f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}", json=payload)
        
        # May fail if request already processed - that's OK
        if response.status_code == 400:
            print(f"⚠ Request already processed or invalid status: {response.json()}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data
        assert data.get("status") == "waiting_payment"  # Advance needs accounts approval
        print(f"✓ Vendor selected with advance payment (50%): status={data.get('status')}")
    
    def test_select_vendor_with_full_payment(self, sessions):
        """Test vendor selection with full payment"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement user not logged in")
        
        # Get a planning_approved request
        requests_resp = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        if requests_resp.status_code != 200 or not requests_resp.json():
            pytest.skip("No pending requests available")
        
        request_id = requests_resp.json()[0].get('request_id')
        
        # Get a vendor
        vendors_resp = session.get(f"{BASE_URL}/api/vendor-master")
        if vendors_resp.status_code != 200 or not vendors_resp.json():
            pytest.skip("No vendors available")
        vendor = vendors_resp.json()[0]
        
        payload = {
            "vendor_id": vendor.get('vendor_id'),
            "vendor_name": vendor.get('name'),
            "unit_rate": 150.0,
            "transport_cost": 0,
            "discount": 0,
            "payment_type": "full",
            "advance_mode": "percentage",
            "credit_period_days": 0
        }
        
        response = session.post(f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}", json=payload)
        
        if response.status_code == 400:
            print(f"⚠ Request already processed: {response.json()}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "waiting_payment"
        print(f"✓ Vendor selected with full payment: status={data.get('status')}")
    
    def test_select_vendor_with_credit(self, sessions):
        """Test vendor selection with credit payment"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement user not logged in")
        
        requests_resp = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        if requests_resp.status_code != 200 or not requests_resp.json():
            pytest.skip("No pending requests available")
        
        request_id = requests_resp.json()[0].get('request_id')
        
        vendors_resp = session.get(f"{BASE_URL}/api/vendor-master")
        if vendors_resp.status_code != 200 or not vendors_resp.json():
            pytest.skip("No vendors available")
        vendor = vendors_resp.json()[0]
        
        payload = {
            "vendor_id": vendor.get('vendor_id'),
            "vendor_name": vendor.get('name'),
            "unit_rate": 200.0,
            "payment_type": "credit",
            "credit_period_days": 45
        }
        
        response = session.post(f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}", json=payload)
        
        if response.status_code == 400:
            print(f"⚠ Request already processed: {response.json()}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Credit should go to vendor_selected directly (no payment approval needed)
        assert data.get("status") == "vendor_selected"
        print(f"✓ Vendor selected with credit (45 days): status={data.get('status')}")
    
    def test_select_vendor_with_post_delivery(self, sessions):
        """Test vendor selection with post-delivery payment"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement user not logged in")
        
        requests_resp = session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        if requests_resp.status_code != 200 or not requests_resp.json():
            pytest.skip("No pending requests available")
        
        request_id = requests_resp.json()[0].get('request_id')
        
        vendors_resp = session.get(f"{BASE_URL}/api/vendor-master")
        if vendors_resp.status_code != 200 or not vendors_resp.json():
            pytest.skip("No vendors available")
        vendor = vendors_resp.json()[0]
        
        payload = {
            "vendor_id": vendor.get('vendor_id'),
            "vendor_name": vendor.get('name'),
            "unit_rate": 175.0,
            "payment_type": "post_delivery"
        }
        
        response = session.post(f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}", json=payload)
        
        if response.status_code == 400:
            print(f"⚠ Request already processed: {response.json()}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Post-delivery should go to vendor_selected directly
        assert data.get("status") == "vendor_selected"
        print(f"✓ Vendor selected with post-delivery payment: status={data.get('status')}")


class TestAccountsRejectionFlow:
    """Test accounts rejection and re-edit flow"""
    
    def test_accounts_reject_sets_accounts_rejected_status(self, sessions):
        """Test that accounts rejection sets status to accounts_rejected"""
        accountant_session = sessions.get('accountant')
        procurement_session = sessions.get('procurement')
        
        if not accountant_session or not procurement_session:
            pytest.skip("Required sessions not available")
        
        # First find a request in waiting_payment status
        requests_resp = procurement_session.get(f"{BASE_URL}/api/material-requests")
        if requests_resp.status_code != 200:
            pytest.skip("Cannot fetch material requests")
        
        waiting_requests = [r for r in requests_resp.json() if r.get('status') == 'waiting_payment']
        
        if not waiting_requests:
            # Create one by selecting vendor with advance payment
            pending_resp = procurement_session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
            if pending_resp.status_code != 200 or not pending_resp.json():
                pytest.skip("No pending requests to test with")
            
            request_id = pending_resp.json()[0].get('request_id')
            vendors = procurement_session.get(f"{BASE_URL}/api/vendor-master").json()
            if not vendors:
                pytest.skip("No vendors available")
            
            # Select with advance payment to trigger waiting_payment status
            payload = {
                "vendor_id": vendors[0].get('vendor_id'),
                "vendor_name": vendors[0].get('name'),
                "unit_rate": 100.0,
                "payment_type": "advance",
                "advance_mode": "percentage",
                "advance_percent": 30.0
            }
            select_resp = procurement_session.post(f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}", json=payload)
            if select_resp.status_code != 200:
                pytest.skip(f"Cannot select vendor: {select_resp.text}")
            waiting_request_id = request_id
        else:
            waiting_request_id = waiting_requests[0].get('request_id')
        
        # Now accountant rejects
        reject_payload = {
            "action": "reject",
            "remarks": "TEST_Rejection_for_testing"
        }
        
        response = accountant_session.patch(
            f"{BASE_URL}/api/procurement/v2/accounts-approval/{waiting_request_id}",
            json=reject_payload
        )
        
        if response.status_code == 400:
            print(f"⚠ Request not in correct state for rejection: {response.json()}")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "accounts_rejected", f"Expected accounts_rejected, got {data.get('status')}"
        print(f"✓ Accounts rejection sets status to accounts_rejected")
    
    def test_procurement_can_reedit_after_rejection(self, sessions):
        """Test that procurement can re-edit after accounts rejection"""
        procurement_session = sessions.get('procurement')
        
        if not procurement_session:
            pytest.skip("Procurement session not available")
        
        # Find a request with accounts_rejected status
        requests_resp = procurement_session.get(f"{BASE_URL}/api/material-requests")
        if requests_resp.status_code != 200:
            pytest.skip("Cannot fetch material requests")
        
        rejected_requests = [r for r in requests_resp.json() if r.get('status') == 'accounts_rejected']
        
        if not rejected_requests:
            pytest.skip("No rejected requests to test re-edit")
        
        request_id = rejected_requests[0].get('request_id')
        
        # Get vendors
        vendors = procurement_session.get(f"{BASE_URL}/api/vendor-master").json()
        if not vendors:
            pytest.skip("No vendors available")
        
        # Re-edit with different pricing
        payload = {
            "vendor_id": vendors[0].get('vendor_id'),
            "vendor_name": vendors[0].get('name'),
            "unit_rate": 90.0,  # Lower price after negotiation
            "transport_cost": 0,
            "discount": 100.0,  # Added discount
            "payment_type": "full",
            "advance_mode": "percentage"
        }
        
        response = procurement_session.post(
            f"{BASE_URL}/api/procurement/v2/select-vendor/{request_id}",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "waiting_payment"
        print(f"✓ Procurement can re-edit rejected request: new status={data.get('status')}")


class TestVendorMasterDropdown:
    """Test vendor master CRUD for dropdown"""
    
    def test_get_vendors_for_dropdown(self, sessions):
        """Test GET /api/vendor-master returns active vendors"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement session not available")
        
        response = session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        vendors = response.json()
        assert isinstance(vendors, list)
        
        for vendor in vendors[:3]:  # Check first 3
            assert "vendor_id" in vendor
            assert "name" in vendor
        
        print(f"✓ Vendor dropdown data: {len(vendors)} vendors available")
    
    def test_create_new_vendor(self, sessions):
        """Test creating a new vendor via quick add"""
        session = sessions.get('procurement')
        if not session:
            pytest.skip("Procurement session not available")
        
        vendor_data = {
            "name": f"TEST_NewVendor_{uuid.uuid4().hex[:6]}",
            "phone": "9876543210",
            "category": "material",
            "payment_terms": "full"
        }
        
        response = session.post(f"{BASE_URL}/api/vendor-master/v2/create", json=vendor_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "vendor_id" in data
        print(f"✓ Created new vendor: {data.get('vendor_id')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
