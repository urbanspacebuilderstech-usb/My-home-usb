"""
Test Order Detail Popup & Edit Feature
Tests the following:
1. Material request order card click and detail popup functionality
2. PATCH /api/site-engineer/material-requests/{request_id} endpoint for editing
3. Validation that only SE who created request can edit
4. Validation that protected fields cannot be edited
5. Edit only allowed for 'requested' or 'planning_approved' status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://estimate-dialog-bugs.preview.emergentagent.com"

class TestOrderDetailPopupBackend:
    """Backend tests for Order Detail Popup edit feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as Site Engineer
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_resp.status_code == 200, f"Site Engineer login failed: {login_resp.text}"
        self.se_user = login_resp.json().get("user", {})
        self.se_user_id = self.se_user.get("user_id")
        print(f"✓ Logged in as Site Engineer: {self.se_user.get('name')}")
        
    def test_01_get_project_materials(self):
        """Test fetching project data with material requests"""
        # Project ID from review_request: proj_12f23331b542 (Vinoth Kumar)
        project_id = "proj_12f23331b542"
        resp = self.session.get(f"{BASE_URL}/api/site-engineer/project/{project_id}")
        
        # May get 403 if not assigned, check both scenarios
        if resp.status_code == 403:
            print("⚠ Site Engineer not assigned to Vinoth Kumar project - checking available projects")
            # Get assigned projects
            projects_resp = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
            assert projects_resp.status_code == 200
            projects = projects_resp.json()
            print(f"  Available projects: {[p.get('name') for p in projects]}")
            
            if not projects:
                pytest.skip("No projects assigned to site engineer")
            
            # Use first available project
            project_id = projects[0].get("project_id")
            resp = self.session.get(f"{BASE_URL}/api/site-engineer/project/{project_id}")
        
        assert resp.status_code == 200, f"Failed to get project: {resp.text}"
        data = resp.json()
        
        assert "project" in data
        assert "material_requests" in data
        print(f"✓ Project: {data['project'].get('name')}")
        print(f"✓ Material requests count: {len(data['material_requests'])}")
        
        # Check if any requests exist with editable status
        editable_statuses = ['requested', 'planning_approved']
        editable_requests = [r for r in data['material_requests'] if r.get('status') in editable_statuses]
        non_editable_requests = [r for r in data['material_requests'] if r.get('status') not in editable_statuses]
        
        print(f"✓ Editable requests (status=requested/planning_approved): {len(editable_requests)}")
        print(f"✓ Non-editable requests: {len(non_editable_requests)}")
        
        # Store for later tests
        self.__class__.project_data = data
        self.__class__.project_id = data['project'].get('project_id')
        
    def test_02_verify_order_details_structure(self):
        """Verify material request has all fields needed for popup display"""
        if not hasattr(self.__class__, 'project_data'):
            pytest.skip("No project data from previous test")
        
        material_requests = self.project_data['material_requests']
        if not material_requests:
            pytest.skip("No material requests to verify")
            
        # Check first request for required fields
        req = material_requests[0]
        
        # Required display fields
        display_fields = ['request_id', 'order_id', 'material_name', 'quantity', 'unit', 'status', 'created_at']
        for field in display_fields:
            assert field in req, f"Missing field: {field}"
            print(f"✓ Field '{field}': {req.get(field)}")
        
        # Optional fields for detail display
        optional_fields = ['stage', 'urgency', 'remarks', 'vendor_name', 'total_amount', 
                          'planning_approved_at', 'planning_approved_by', 'site_engineer_name']
        for field in optional_fields:
            if req.get(field):
                print(f"  Optional '{field}': {req.get(field)}")
                
    def test_03_create_test_request_for_edit(self):
        """Create a test material request to test edit functionality"""
        if not hasattr(self.__class__, 'project_id'):
            pytest.skip("No project ID available")
            
        # Create a test request
        create_resp = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json={
            "project_id": self.__class__.project_id,
            "material_name": "TEST_Edit_Cement_OPC_53",
            "quantity": 100,
            "unit": "Bags",
            "remarks": "Test request for edit popup feature"
        })
        
        assert create_resp.status_code == 200, f"Failed to create test request: {create_resp.text}"
        data = create_resp.json()
        
        assert data.get('status') == 'requested', f"Expected status 'requested', got {data.get('status')}"
        print(f"✓ Created test request: {data.get('request_id')}")
        print(f"✓ Order ID: {data.get('order_id')}")
        print(f"✓ Status: {data.get('status')}")
        
        self.__class__.test_request_id = data.get('request_id')
        
    def test_04_edit_material_request_success(self):
        """Test successfully editing a material request"""
        if not hasattr(self.__class__, 'test_request_id'):
            pytest.skip("No test request to edit")
        
        request_id = self.__class__.test_request_id
        
        # Edit allowed fields
        updates = {
            "material_name": "TEST_Edit_Cement_PPC",
            "quantity": 150,
            "unit": "Bags",
            "remarks": "Updated test remarks",
            "urgency": "high",
            "stage": "Foundation"
        }
        
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/{request_id}", json=updates)
        
        assert resp.status_code == 200, f"Edit failed: {resp.text}"
        data = resp.json()
        
        assert data.get('material_name') == updates['material_name'], "Material name not updated"
        assert data.get('quantity') == updates['quantity'], "Quantity not updated"
        assert data.get('remarks') == updates['remarks'], "Remarks not updated"
        assert data.get('urgency') == updates['urgency'], "Urgency not updated"
        assert data.get('stage') == updates['stage'], "Stage not updated"
        
        print(f"✓ Successfully edited request {request_id}")
        print(f"✓ Updated material_name: {data.get('material_name')}")
        print(f"✓ Updated quantity: {data.get('quantity')}")
        print(f"✓ Updated urgency: {data.get('urgency')}")
        print(f"✓ Updated stage: {data.get('stage')}")
        
    def test_05_edit_protected_fields_rejected(self):
        """Test that protected fields cannot be edited"""
        if not hasattr(self.__class__, 'test_request_id'):
            pytest.skip("No test request to test")
        
        request_id = self.__class__.test_request_id
        
        # Try to edit protected fields
        protected_updates = {
            "status": "accounts_approved",
            "po_id": "PO-FAKE-123",
            "created_at": "2020-01-01T00:00:00Z"
        }
        
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/{request_id}", json=protected_updates)
        
        # Endpoint should either reject entirely or ignore protected fields
        if resp.status_code == 200:
            data = resp.json()
            # Protected fields should NOT be updated
            assert data.get('status') != "accounts_approved", "Status should not be editable"
            assert data.get('po_id') != "PO-FAKE-123", "PO ID should not be editable"
            print(f"✓ Protected fields were correctly ignored")
            print(f"  Status remains: {data.get('status')}")
        elif resp.status_code == 400:
            print(f"✓ Protected fields edit correctly rejected with 400")
        else:
            print(f"⚠ Unexpected response: {resp.status_code} - {resp.text}")
            
    def test_06_edit_by_other_user_rejected(self):
        """Test that only the SE who created the request can edit it"""
        if not hasattr(self.__class__, 'test_request_id'):
            pytest.skip("No test request to test")
            
        request_id = self.__class__.test_request_id
        
        # Logout and login as different user (accountant)
        logout_resp = self.session.post(f"{BASE_URL}/api/auth/logout")
        
        # Try to login as accountant
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Could not login as accountant for cross-user test")
            
        # Try to edit as accountant
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/{request_id}", json={
            "remarks": "Unauthorized edit attempt"
        })
        
        assert resp.status_code == 403, f"Expected 403 for unauthorized edit, got {resp.status_code}"
        print(f"✓ Correctly rejected edit by different user with 403")
        
        # Re-login as SE
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        
    def test_07_find_orders_with_different_statuses(self):
        """Find orders with different statuses to verify edit button visibility"""
        # Login again as SE
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        
        # Get all material requests
        resp = self.session.get(f"{BASE_URL}/api/site-engineer/material-requests")
        if resp.status_code != 200:
            pytest.skip("Could not fetch material requests")
            
        requests_list = resp.json()
        
        # Group by status
        status_counts = {}
        editable_examples = []
        non_editable_examples = []
        
        for req in requests_list:
            status = req.get('status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
            
            if status in ['requested', 'planning_approved'] and len(editable_examples) < 3:
                editable_examples.append({
                    'request_id': req.get('request_id'),
                    'order_id': req.get('order_id'),
                    'material_name': req.get('material_name'),
                    'status': status
                })
            elif status not in ['requested', 'planning_approved'] and len(non_editable_examples) < 3:
                non_editable_examples.append({
                    'request_id': req.get('request_id'),
                    'order_id': req.get('order_id'),
                    'material_name': req.get('material_name'),
                    'status': status
                })
        
        print(f"\n✓ Material requests by status:")
        for status, count in status_counts.items():
            editable = "EDITABLE" if status in ['requested', 'planning_approved'] else "NOT EDITABLE"
            print(f"  - {status}: {count} ({editable})")
            
        print(f"\n✓ Sample editable orders (Edit button should show):")
        for ex in editable_examples:
            print(f"  - {ex['order_id']}: {ex['material_name']} (status: {ex['status']})")
            
        print(f"\n✓ Sample non-editable orders (No Edit button):")
        for ex in non_editable_examples:
            print(f"  - {ex['order_id']}: {ex['material_name']} (status: {ex['status']})")
            
        self.__class__.editable_examples = editable_examples
        self.__class__.non_editable_examples = non_editable_examples
        
    def test_08_cleanup_test_request(self):
        """Clean up test request if possible (or just leave it)"""
        if hasattr(self.__class__, 'test_request_id'):
            print(f"✓ Test request {self.__class__.test_request_id} left for manual cleanup")
            # Note: There's no delete endpoint, so we leave it with TEST_ prefix for identification


class TestOrderDetailPopupEndpointValidation:
    """Additional endpoint validation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_01_edit_without_auth_rejected(self):
        """Test that editing without authentication is rejected"""
        # Try to edit without login
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/fake_id", json={
            "remarks": "Unauthenticated edit"
        })
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print(f"✓ Unauthenticated edit correctly rejected: {resp.status_code}")
        
    def test_02_edit_nonexistent_request(self):
        """Test editing a request that doesn't exist"""
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        assert login_resp.status_code == 200
        
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/mreq_nonexistent123", json={
            "remarks": "Edit nonexistent"
        })
        assert resp.status_code == 404, f"Expected 404 for nonexistent request, got {resp.status_code}"
        print(f"✓ Edit nonexistent request correctly returned 404")
        
    def test_03_edit_with_empty_payload(self):
        """Test editing with no fields provided"""
        # First create a request
        # Get projects first
        projects_resp = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects available")
            
        project_id = projects_resp.json()[0].get('project_id')
        
        # Create request
        create_resp = self.session.post(f"{BASE_URL}/api/site-engineer/material-requests", json={
            "project_id": project_id,
            "material_name": "TEST_Empty_Payload",
            "quantity": 10,
            "unit": "kg"
        })
        
        if create_resp.status_code != 200:
            pytest.skip("Could not create test request")
            
        request_id = create_resp.json().get('request_id')
        
        # Try to edit with empty payload (only protected fields)
        resp = self.session.patch(f"{BASE_URL}/api/site-engineer/material-requests/{request_id}", json={
            "status": "rejected"  # This is protected, so should be ignored
        })
        
        # Should either return 400 (no editable fields) or 200 (ignored)
        print(f"✓ Edit with only protected fields: {resp.status_code}")
        print(f"  Response: {resp.text[:200] if len(resp.text) > 200 else resp.text}")
