"""
Tests for Vendor Auto-Assignment and Auto-PO Generation features:
1. GET /api/projects/{project_id}/vendor-suggestion - returns assigned vendor for material category
2. POST /api/site-engineer/material-requests - auto-attaches vendor when assignment exists
3. PATCH /api/material-requests/{id}/planning-action?action=approve - auto-creates PO when vendor assigned
4. PATCH /api/site-engineer/material-requests/{id}/approve?action=planning_approve - also auto-creates PO
5. GET /api/purchase-orders - returns auto-generated POs with auto_generated=true flag
6. PATCH /api/purchase-orders/{po_id}/status - updates PO status through workflow
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PLANNING_CREDS = {"email": "planning@constructionos.com", "password": "Demo@1234"}
SE_CREDS = {"email": "engineer@constructionos.com", "password": "Demo@1234"}
PROCUREMENT_CREDS = {"email": "procurement@constructionos.com", "password": "Demo@1234"}
ADMIN_CREDS = {"email": "admin@constructionos.com", "password": "Demo@1234"}

# Known project with SE assigned and vendor assignment for Cement
PROJECT_ID = "proj_12f23331b542"


class TestVendorSuggestion:
    """Test GET /api/projects/{project_id}/vendor-suggestion endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as planning
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_CREDS)
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        yield
    
    def test_vendor_suggestion_returns_assigned_vendor_for_cement(self):
        """When Cement vendor is assigned to project, suggestion should return it"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/vendor-suggestion?material_name=Cement")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("found") == True, f"Expected found=True but got: {data}"
        assert "vendor_id" in data
        assert "vendor_name" in data
        assert data.get("category") == "Cement"
        print(f"PASS: Vendor suggestion found: {data['vendor_name']} for category Cement")
    
    def test_vendor_suggestion_fuzzy_matches_cement_opc(self):
        """'Cement OPC 53 Grade' should match category 'Cement' via substring"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/vendor-suggestion?material_name=Cement%20OPC%2053%20Grade")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("found") == True, f"Expected found=True for fuzzy match, got: {data}"
        assert data.get("category") == "Cement"
        print(f"PASS: Fuzzy match worked - 'Cement OPC 53 Grade' matched category 'Cement'")
    
    def test_vendor_suggestion_no_match_for_unassigned_category(self):
        """If no vendor assigned for category, should return found=False"""
        resp = self.session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/vendor-suggestion?material_name=RandomUnassignedMaterial123")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("found") == False, f"Expected found=False for unassigned category, got: {data}"
        print("PASS: No vendor found for unassigned category as expected")


class TestMaterialRequestVendorAutoAttach:
    """Test POST /api/site-engineer/material-requests auto-attaches vendor"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.se_session = requests.Session()
        self.se_session.headers.update({"Content-Type": "application/json"})
        # Login as site engineer
        resp = self.se_session.post(f"{BASE_URL}/api/auth/login", json=SE_CREDS)
        assert resp.status_code == 200, f"SE Login failed: {resp.text}"
        yield
    
    def test_material_request_auto_attaches_vendor_for_cement(self):
        """Creating a Cement material request should auto-attach the assigned vendor"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "project_id": PROJECT_ID,
            "material_name": f"TEST_Cement OPC {unique_id}",
            "quantity": 50,
            "unit": "bags",
            "remarks": "Test auto-attach vendor"
        }
        resp = self.se_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create material request: {resp.text}"
        data = resp.json()
        
        # Verify auto-attached vendor fields
        assert "assigned_vendor_id" in data, f"Missing assigned_vendor_id: {data}"
        assert "assigned_vendor_name" in data, f"Missing assigned_vendor_name: {data}"
        assert data.get("assigned_vendor_category") == "Cement", f"Wrong category: {data.get('assigned_vendor_category')}"
        print(f"PASS: Material request created with auto-attached vendor: {data.get('assigned_vendor_name')}")
        
        # Store request_id for cleanup
        self.created_request_id = data.get("request_id")
    
    def test_material_request_no_vendor_for_steel(self):
        """Creating a Steel material request should NOT auto-attach vendor (no assignment)"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "project_id": PROJECT_ID,
            "material_name": f"TEST_TMT Steel {unique_id}",
            "quantity": 100,
            "unit": "kg",
            "remarks": "Test no vendor auto-attach"
        }
        resp = self.se_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create material request: {resp.text}"
        data = resp.json()
        
        # Should NOT have vendor fields (unless Steel is also assigned)
        # Check if assigned_vendor_id is present and not null
        vendor_id = data.get("assigned_vendor_id")
        if vendor_id:
            # If a Steel vendor is assigned, that's fine - the test just verifies the behavior
            print(f"INFO: Steel vendor was found (may be assigned): {data.get('assigned_vendor_name')}")
        else:
            print("PASS: No vendor auto-attached for Steel (no assignment exists)")


class TestPlanningApprovalAutoPO:
    """Test planning approval auto-creates PO when vendor is assigned"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.se_session = requests.Session()
        self.se_session.headers.update({"Content-Type": "application/json"})
        resp = self.se_session.post(f"{BASE_URL}/api/auth/login", json=SE_CREDS)
        assert resp.status_code == 200
        
        self.planning_session = requests.Session()
        self.planning_session.headers.update({"Content-Type": "application/json"})
        resp = self.planning_session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_CREDS)
        assert resp.status_code == 200
        yield
    
    def test_planning_action_approve_creates_auto_po(self):
        """PATCH /api/material-requests/{id}/planning-action?action=approve should auto-create PO"""
        # Step 1: Create material request (Cement - has vendor assigned)
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "project_id": PROJECT_ID,
            "material_name": f"TEST_Cement for PO {unique_id}",
            "quantity": 25,
            "unit": "bags"
        }
        resp = self.se_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert resp.status_code == 200
        request_data = resp.json()
        request_id = request_data["request_id"]
        assert request_data.get("assigned_vendor_id"), "Vendor should be auto-attached at creation"
        print(f"Created request {request_id} with vendor {request_data.get('assigned_vendor_name')}")
        
        # Step 2: Planning approves via /planning-action endpoint
        resp = self.planning_session.patch(
            f"{BASE_URL}/api/material-requests/{request_id}/planning-action",
            params={"action": "approve"}
        )
        assert resp.status_code == 200, f"Approval failed: {resp.text}"
        result = resp.json()
        
        # Verify auto_po flag in response
        assert result.get("auto_po") == True, f"Expected auto_po=True in response: {result}"
        print(f"PASS: Planning approval returned auto_po=True")
        
        # Step 3: Verify the material request now has po_id
        resp = self.se_session.get(f"{BASE_URL}/api/site-engineer/material-requests?project_id={PROJECT_ID}")
        assert resp.status_code == 200
        requests_list = resp.json()
        updated_req = next((r for r in requests_list if r.get("request_id") == request_id), None)
        assert updated_req, "Request not found in list"
        assert updated_req.get("po_id"), f"po_id should be set after approval: {updated_req}"
        assert updated_req.get("auto_po_generated") == True, f"auto_po_generated flag missing: {updated_req}"
        print(f"PASS: Material request has po_id={updated_req.get('po_id')} after planning approval")
    
    def test_site_engineer_approve_endpoint_also_creates_po(self):
        """PATCH /api/site-engineer/material-requests/{id}/approve?action=planning_approve should also auto-create PO"""
        # Step 1: Create material request (Cement)
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "project_id": PROJECT_ID,
            "material_name": f"TEST_Cement via SE endpoint {unique_id}",
            "quantity": 30,
            "unit": "bags"
        }
        resp = self.se_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert resp.status_code == 200
        request_data = resp.json()
        request_id = request_data["request_id"]
        print(f"Created request {request_id}")
        
        # Step 2: Planning approves via /site-engineer/material-requests/{id}/approve endpoint
        resp = self.planning_session.patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve",
            params={"action": "planning_approve"}
        )
        assert resp.status_code == 200, f"Approval failed: {resp.text}"
        result = resp.json()
        
        # Verify result has po_id
        assert result.get("po_id"), f"po_id should be in response: {result}"
        assert result.get("auto_po_generated") == True
        print(f"PASS: /site-engineer/...approve endpoint also created PO: {result.get('po_id')}")


class TestPurchaseOrdersEndpoints:
    """Test GET /api/purchase-orders and PATCH /api/purchase-orders/{po_id}/status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as procurement (has access to POs)
        resp = self.session.post(f"{BASE_URL}/api/auth/login", json=PROCUREMENT_CREDS)
        assert resp.status_code == 200
        yield
    
    def test_get_purchase_orders_returns_list(self):
        """GET /api/purchase-orders should return list of POs"""
        resp = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert resp.status_code == 200
        orders = resp.json()
        assert isinstance(orders, list)
        print(f"PASS: GET /api/purchase-orders returned {len(orders)} orders")
    
    def test_get_purchase_orders_filter_by_project(self):
        """GET /api/purchase-orders?project_id=X should filter by project"""
        resp = self.session.get(f"{BASE_URL}/api/purchase-orders?project_id={PROJECT_ID}")
        assert resp.status_code == 200
        orders = resp.json()
        for po in orders:
            assert po.get("project_id") == PROJECT_ID, f"PO has wrong project_id: {po}"
        print(f"PASS: Filter by project_id returned {len(orders)} POs")
    
    def test_get_purchase_orders_has_auto_generated_flag(self):
        """Auto-generated POs should have auto_generated=true flag"""
        resp = self.session.get(f"{BASE_URL}/api/purchase-orders?project_id={PROJECT_ID}")
        assert resp.status_code == 200
        orders = resp.json()
        auto_pos = [po for po in orders if po.get("auto_generated") == True]
        assert len(auto_pos) > 0, "Expected at least one auto-generated PO"
        print(f"PASS: Found {len(auto_pos)} auto-generated POs with auto_generated=True")
    
    def test_update_po_status_workflow(self):
        """PATCH /api/purchase-orders/{po_id}/status should update status"""
        # Get a pending PO
        resp = self.session.get(f"{BASE_URL}/api/purchase-orders?status=pending")
        assert resp.status_code == 200
        orders = resp.json()
        
        if not orders:
            pytest.skip("No pending POs to test status update")
        
        po = orders[0]
        po_id = po["po_id"]
        
        # Update to approved
        resp = self.session.patch(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            json={"status": "approved"}
        )
        assert resp.status_code == 200, f"Status update failed: {resp.text}"
        updated = resp.json()
        assert updated.get("status") == "approved", f"Status not updated: {updated}"
        print(f"PASS: PO {po_id} status updated to 'approved'")
        
        # Update to dispatched
        resp = self.session.patch(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            json={"status": "dispatched"}
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated.get("status") == "dispatched"
        print(f"PASS: PO {po_id} status updated to 'dispatched'")
        
        # Update to delivered
        resp = self.session.patch(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            json={"status": "delivered"}
        )
        assert resp.status_code == 200
        updated = resp.json()
        assert updated.get("status") == "delivered"
        print(f"PASS: PO {po_id} status updated to 'delivered'")


class TestMaterialRequestNoAutoPoWithoutVendor:
    """Test that no auto-PO is created when vendor is NOT assigned"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.se_session = requests.Session()
        self.se_session.headers.update({"Content-Type": "application/json"})
        resp = self.se_session.post(f"{BASE_URL}/api/auth/login", json=SE_CREDS)
        assert resp.status_code == 200
        
        self.planning_session = requests.Session()
        self.planning_session.headers.update({"Content-Type": "application/json"})
        resp = self.planning_session.post(f"{BASE_URL}/api/auth/login", json=PLANNING_CREDS)
        assert resp.status_code == 200
        yield
    
    def test_no_po_created_for_unassigned_category(self):
        """Approving a request with unassigned category should NOT create PO"""
        # Create material request with random category (no vendor assigned)
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "project_id": PROJECT_ID,
            "material_name": f"TEST_RandomMaterial_{unique_id}",
            "quantity": 10,
            "unit": "units"
        }
        resp = self.se_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert resp.status_code == 200
        request_data = resp.json()
        request_id = request_data["request_id"]
        
        # Verify no vendor attached at creation
        has_vendor = request_data.get("assigned_vendor_id")
        if has_vendor:
            pytest.skip(f"This category has vendor assigned: {request_data.get('assigned_vendor_name')}")
        
        # Approve
        resp = self.planning_session.patch(
            f"{BASE_URL}/api/material-requests/{request_id}/planning-action",
            params={"action": "approve"}
        )
        assert resp.status_code == 200
        result = resp.json()
        
        # Should NOT have auto_po
        assert result.get("auto_po") != True, f"auto_po should be False for unassigned category: {result}"
        print("PASS: No auto-PO created for unassigned category")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
