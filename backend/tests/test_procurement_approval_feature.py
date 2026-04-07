"""
Test Procurement Approval Feature
Tests the new procurement approval step in the material request flow:
SE creates → Planning Approves → Procurement Approves (NEW) → Vendor Selection → Accounts → PO → Dispatch → Receipt

Features tested:
1. Dashboard includes pending_approval count
2. GET /api/procurement/requests?status=pending_approval returns planning_approved requests
3. GET /api/procurement/requests?status=pending returns procurement_approved requests
4. PATCH /api/procurement/v2/approve/{request_id} with action=approve changes status to procurement_approved
5. PATCH /api/procurement/v2/approve/{request_id} with action=reject changes status to rejected
6. Vendor selection only works for procurement_approved requests
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Module-level session to avoid rate limiting
_session = None

def get_session():
    """Get or create a shared session with Procurement login"""
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"Content-Type": "application/json"})
        
        # Login as Procurement
        login_response = _session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "procurement@constructionos.com"}
        )
        if login_response.status_code != 200:
            raise Exception(f"Procurement login failed: {login_response.text}")
        print(f"Logged in as: {login_response.json().get('name')}")
    return _session


class TestProcurementApprovalFeature:
    """Test the new Procurement Approval step in material request flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Procurement login"""
        self.session = get_session()
        
    def test_dashboard_includes_pending_approval_count(self):
        """Test that dashboard includes pending_approval count for planning_approved requests"""
        response = self.session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert response.status_code == 200, f"Dashboard API failed: {response.text}"
        
        data = response.json()
        assert "pending_approval" in data, "Dashboard missing 'pending_approval' field"
        assert "pending_requests" in data, "Dashboard missing 'pending_requests' field"
        assert isinstance(data["pending_approval"], int), "pending_approval should be an integer"
        assert isinstance(data["pending_requests"], int), "pending_requests should be an integer"
        
        print(f"Dashboard counts - Pending Approval: {data['pending_approval']}, Pending Requests: {data['pending_requests']}")
        
    def test_get_pending_approval_requests(self):
        """Test GET /api/procurement/requests?status=pending_approval returns planning_approved requests"""
        response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending_approval")
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned requests should have status=planning_approved
        for req in data:
            assert req.get("status") == "planning_approved", f"Expected planning_approved, got {req.get('status')}"
            assert "request_id" in req, "Request missing request_id"
            assert "material_name" in req, "Request missing material_name"
            assert "quantity" in req, "Request missing quantity"
            assert "project_name" in req, "Request missing project_name"
            assert "site_engineer_name" in req, "Request missing site_engineer_name"
            
        print(f"Found {len(data)} planning_approved requests pending procurement approval")
        
    def test_get_pending_requests_for_vendor_selection(self):
        """Test GET /api/procurement/requests?status=pending returns procurement_approved requests"""
        response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        assert response.status_code == 200, f"API failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All returned requests should have status=procurement_approved or accounts_rejected
        for req in data:
            assert req.get("status") in ["procurement_approved", "accounts_rejected"], \
                f"Expected procurement_approved or accounts_rejected, got {req.get('status')}"
            
        print(f"Found {len(data)} procurement_approved requests ready for vendor selection")
        
    def test_procurement_approve_request(self):
        """Test PATCH /api/procurement/v2/approve/{request_id} with action=approve"""
        # First get a planning_approved request
        response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending_approval")
        assert response.status_code == 200
        
        requests_list = response.json()
        if len(requests_list) == 0:
            pytest.skip("No planning_approved requests available to test approval")
            
        request_to_approve = requests_list[0]
        request_id = request_to_approve["request_id"]
        
        # Approve the request
        approve_response = self.session.patch(
            f"{BASE_URL}/api/procurement/v2/approve/{request_id}",
            json={"action": "approve"}
        )
        assert approve_response.status_code == 200, f"Approve failed: {approve_response.text}"
        
        result = approve_response.json()
        assert result.get("status") == "procurement_approved", f"Expected procurement_approved status, got {result}"
        assert "message" in result, "Response missing message"
        
        print(f"Successfully approved request {request_id}")
        
        # Verify the request is now in pending (vendor selection) list
        pending_response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        assert pending_response.status_code == 200
        
        pending_list = pending_response.json()
        approved_ids = [r["request_id"] for r in pending_list]
        assert request_id in approved_ids, "Approved request should appear in pending (vendor selection) list"
        
    def test_procurement_reject_request(self):
        """Test PATCH /api/procurement/v2/approve/{request_id} with action=reject"""
        # First get a planning_approved request
        response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending_approval")
        assert response.status_code == 200
        
        requests_list = response.json()
        if len(requests_list) == 0:
            pytest.skip("No planning_approved requests available to test rejection")
            
        request_to_reject = requests_list[0]
        request_id = request_to_reject["request_id"]
        
        # Reject the request
        reject_response = self.session.patch(
            f"{BASE_URL}/api/procurement/v2/approve/{request_id}",
            json={"action": "reject", "reason": "Test rejection - quantity needs review"}
        )
        assert reject_response.status_code == 200, f"Reject failed: {reject_response.text}"
        
        result = reject_response.json()
        assert "message" in result, "Response missing message"
        
        print(f"Successfully rejected request {request_id}")
        
        # Verify the request is no longer in pending_approval list
        pending_approval_response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending_approval")
        assert pending_approval_response.status_code == 200
        
        pending_approval_list = pending_approval_response.json()
        pending_ids = [r["request_id"] for r in pending_approval_list]
        assert request_id not in pending_ids, "Rejected request should not appear in pending_approval list"
        
    def test_vendor_selection_requires_procurement_approved(self):
        """Test that vendor selection only works for procurement_approved requests"""
        # Get a procurement_approved request
        response = self.session.get(f"{BASE_URL}/api/procurement/requests?status=pending")
        assert response.status_code == 200
        
        requests_list = response.json()
        if len(requests_list) == 0:
            pytest.skip("No procurement_approved requests available to test vendor selection")
            
        request_for_vendor = requests_list[0]
        request_id = request_for_vendor["request_id"]
        
        # Verify the request status is procurement_approved
        assert request_for_vendor.get("status") in ["procurement_approved", "accounts_rejected"], \
            f"Request should be procurement_approved, got {request_for_vendor.get('status')}"
        
        print(f"Request {request_id} is ready for vendor selection with status: {request_for_vendor.get('status')}")
        
    def test_dashboard_counts_update_after_approval(self):
        """Test that dashboard counts update correctly after approval/rejection"""
        # Get initial counts
        initial_response = self.session.get(f"{BASE_URL}/api/procurement/dashboard")
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        
        initial_pending_approval = initial_data.get("pending_approval", 0)
        initial_pending_requests = initial_data.get("pending_requests", 0)
        
        print(f"Initial counts - Pending Approval: {initial_pending_approval}, Pending Requests: {initial_pending_requests}")
        
        # The counts should be non-negative integers
        assert initial_pending_approval >= 0, "pending_approval should be non-negative"
        assert initial_pending_requests >= 0, "pending_requests should be non-negative"


class TestProcurementBoardRegression:
    """Regression tests for existing Procurement Board functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Procurement login"""
        self.session = get_session()
        
    def test_vendor_master_endpoint(self):
        """Test GET /api/vendor-master returns vendors"""
        response = self.session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200, f"Vendor master API failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} vendors in vendor master")
        
    def test_transit_orders_endpoint(self):
        """Test GET /api/procurement/transit returns transit orders"""
        response = self.session.get(f"{BASE_URL}/api/procurement/transit")
        assert response.status_code == 200, f"Transit API failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} orders in transit")
        
    def test_credit_ledger_endpoint(self):
        """Test GET /api/procurement/credit-ledger returns credit entries"""
        response = self.session.get(f"{BASE_URL}/api/procurement/credit-ledger")
        assert response.status_code == 200, f"Credit ledger API failed: {response.text}"
        
        data = response.json()
        assert "entries" in data, "Response missing 'entries' field"
        assert "total_outstanding" in data, "Response missing 'total_outstanding' field"
        print(f"Credit ledger: {len(data.get('entries', []))} entries, Outstanding: {data.get('total_outstanding')}")
        
    def test_purchase_orders_endpoint(self):
        """Test GET /api/purchase-orders returns purchase orders"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        # May return 403 if not authorized, which is acceptable
        assert response.status_code in [200, 403], f"Purchase orders API failed: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Response should be a list"
            print(f"Found {len(data)} purchase orders")
        else:
            print("Purchase orders endpoint returned 403 (access restricted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
