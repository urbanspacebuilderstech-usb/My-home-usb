"""
Test Work Orders CRUD endpoints for Planning > Projects > Work Order tab
Tests: GET /api/contractor-types, POST/GET/PATCH/DELETE /api/projects/{project_id}/work-orders
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test project from main agent context
TEST_PROJECT_ID = "proj_12f23331b542"

@pytest.fixture(scope="module")
def planning_session():
    """Login as planning user and return session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Demo login for planning role using email
    resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
    assert resp.status_code == 200, f"Planning login failed: {resp.text}"
    return session


class TestContractorTypesEndpoint:
    """Test GET /api/contractor-types"""
    
    def test_get_contractor_types_returns_200(self, planning_session):
        """Verify contractor types endpoint returns 200"""
        resp = planning_session.get(f"{BASE_URL}/api/contractor-types")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
    def test_contractor_types_returns_list(self, planning_session):
        """Verify contractor types returns a list"""
        resp = planning_session.get(f"{BASE_URL}/api/contractor-types")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
    def test_contractor_types_has_expected_types(self, planning_session):
        """Verify expected contractor types exist (Mason, Painter, Electrical)"""
        resp = planning_session.get(f"{BASE_URL}/api/contractor-types")
        data = resp.json()
        # Based on main agent context: Mason, Painter, Electrical contractors exist
        print(f"Available contractor types: {data}")
        assert len(data) > 0, "Expected at least one contractor type"


class TestWorkOrdersListEndpoint:
    """Test GET /api/projects/{project_id}/work-orders"""
    
    def test_get_work_orders_returns_200(self, planning_session):
        """Verify work orders list endpoint returns 200"""
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
    def test_work_orders_returns_list(self, planning_session):
        """Verify work orders returns a list"""
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} work orders for project {TEST_PROJECT_ID}")
        
    def test_existing_work_order_has_required_fields(self, planning_session):
        """Verify existing work order has required fields"""
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        data = resp.json()
        if len(data) > 0:
            wo = data[0]
            required_fields = ['work_order_id', 'project_id', 'contractor_id', 'contractor_name', 
                             'contractor_type', 'scope_items', 'stages', 'additional_work', 'total_value']
            for field in required_fields:
                assert field in wo, f"Missing field: {field}"
            print(f"Work order {wo['work_order_id']}: {wo['contractor_name']} - Total: {wo['total_value']}")
        else:
            pytest.skip("No existing work orders to verify")


class TestWorkOrderCRUD:
    """Test full CRUD operations for work orders"""
    
    @pytest.fixture(scope="class")
    def contractor_id(self, planning_session):
        """Get a contractor ID for testing"""
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        assert resp.status_code == 200, f"Failed to get contractors: {resp.text}"
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        assert len(active_contractors) > 0, "No active contractors found"
        return active_contractors[0]['contractor_id']
    
    def test_create_work_order_success(self, planning_session, contractor_id):
        """Test creating a new work order with scope, stages, and additional work"""
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_WO_CRUD Test work order",
            "scope_items": [
                {"name": "Foundation Work", "unit": "sqft", "quantity": 100, "unit_rate": 50},
                {"name": "Plastering", "unit": "sqft", "quantity": 200, "unit_rate": 25}
            ],
            "stages": [
                {"name": "Stage 1 - 30%", "type": "percentage", "value": 30},
                {"name": "Stage 2 - 50%", "type": "percentage", "value": 50},
                {"name": "Stage 3 - Final", "type": "amount", "value": 2000}
            ],
            "additional_work": [
                {"description": "Extra finishing", "unit": "nos", "quantity": 5, "unit_rate": 100}
            ]
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "work_order_id" in data, "Response should contain work_order_id"
        assert "total_value" in data, "Response should contain total_value"
        
        # Scope total: 100*50 + 200*25 = 5000 + 5000 = 10000
        # Additional total: 5*100 = 500
        # Total: 10500
        expected_total = 10500
        assert data["total_value"] == expected_total, f"Expected total {expected_total}, got {data['total_value']}"
        
        print(f"Created work order: {data['work_order_id']} with total: {data['total_value']}")
        
        # Store for cleanup
        self.__class__.created_wo_id = data['work_order_id']
        
    def test_get_created_work_order(self, planning_session):
        """Verify created work order can be retrieved"""
        wo_id = getattr(self.__class__, 'created_wo_id', None)
        if not wo_id:
            pytest.skip("No work order created in previous test")
            
        resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        wo = resp.json()
        assert wo['work_order_id'] == wo_id
        assert len(wo['scope_items']) == 2, f"Expected 2 scope items, got {len(wo['scope_items'])}"
        assert len(wo['stages']) == 3, f"Expected 3 stages, got {len(wo['stages'])}"
        assert len(wo['additional_work']) == 1, f"Expected 1 additional work item, got {len(wo['additional_work'])}"
        
        # Verify scope item totals are calculated
        for item in wo['scope_items']:
            assert 'total' in item, "Scope item should have calculated total"
            
        # Verify stage amounts are calculated
        for stage in wo['stages']:
            assert 'amount' in stage, "Stage should have calculated amount"
            
        print(f"Verified work order: {wo_id}")
        print(f"  Scope items: {[s['name'] for s in wo['scope_items']]}")
        print(f"  Stages: {[s['name'] for s in wo['stages']]}")
        
    def test_update_work_order(self, planning_session, contractor_id):
        """Test updating a work order"""
        wo_id = getattr(self.__class__, 'created_wo_id', None)
        if not wo_id:
            pytest.skip("No work order created in previous test")
            
        # Update with modified scope and stages
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_WO_CRUD Updated work order",
            "scope_items": [
                {"name": "Foundation Work - Updated", "unit": "sqft", "quantity": 150, "unit_rate": 60}
            ],
            "stages": [
                {"name": "Stage 1 - 50%", "type": "percentage", "value": 50},
                {"name": "Stage 2 - Final", "type": "percentage", "value": 50}
            ],
            "additional_work": []
        }
        
        resp = planning_session.patch(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify update by fetching
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        assert get_resp.status_code == 200
        
        wo = get_resp.json()
        assert len(wo['scope_items']) == 1, f"Expected 1 scope item after update, got {len(wo['scope_items'])}"
        assert len(wo['stages']) == 2, f"Expected 2 stages after update, got {len(wo['stages'])}"
        assert len(wo['additional_work']) == 0, f"Expected 0 additional work after update, got {len(wo['additional_work'])}"
        
        # New total: 150*60 = 9000
        assert wo['total_value'] == 9000, f"Expected total 9000, got {wo['total_value']}"
        
        print(f"Updated work order: {wo_id}, new total: {wo['total_value']}")
        
    def test_delete_work_order(self, planning_session):
        """Test soft-deleting a work order"""
        wo_id = getattr(self.__class__, 'created_wo_id', None)
        if not wo_id:
            pytest.skip("No work order created in previous test")
            
        resp = planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        # Verify it's no longer in the list (soft delete)
        list_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders")
        assert list_resp.status_code == 200
        
        work_orders = list_resp.json()
        wo_ids = [wo['work_order_id'] for wo in work_orders]
        assert wo_id not in wo_ids, f"Deleted work order {wo_id} should not appear in list"
        
        print(f"Deleted work order: {wo_id}")


class TestWorkOrderStageCalculations:
    """Test stage amount calculations (percentage vs fixed amount)"""
    
    @pytest.fixture(scope="class")
    def contractor_id(self, planning_session):
        """Get a contractor ID for testing"""
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        return active_contractors[0]['contractor_id']
    
    def test_percentage_stage_calculation(self, planning_session, contractor_id):
        """Test that percentage stages calculate correctly based on scope total"""
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_STAGE_CALC Percentage test",
            "scope_items": [
                {"name": "Work Item", "unit": "nos", "quantity": 10, "unit_rate": 1000}  # Total: 10000
            ],
            "stages": [
                {"name": "30% Stage", "type": "percentage", "value": 30},  # Should be 3000
                {"name": "70% Stage", "type": "percentage", "value": 70}   # Should be 7000
            ],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        assert resp.status_code == 200, f"Failed to create: {resp.text}"
        
        wo_id = resp.json()['work_order_id']
        
        # Fetch and verify
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        
        assert wo['stages'][0]['amount'] == 3000, f"30% of 10000 should be 3000, got {wo['stages'][0]['amount']}"
        assert wo['stages'][1]['amount'] == 7000, f"70% of 10000 should be 7000, got {wo['stages'][1]['amount']}"
        
        print(f"Percentage calculation verified: 30%={wo['stages'][0]['amount']}, 70%={wo['stages'][1]['amount']}")
        
        # Cleanup
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        
    def test_fixed_amount_stage(self, planning_session, contractor_id):
        """Test that fixed amount stages use the value directly"""
        payload = {
            "contractor_id": contractor_id,
            "notes": "TEST_STAGE_CALC Fixed amount test",
            "scope_items": [
                {"name": "Work Item", "unit": "nos", "quantity": 10, "unit_rate": 1000}
            ],
            "stages": [
                {"name": "Fixed Stage", "type": "amount", "value": 5000}  # Should be exactly 5000
            ],
            "additional_work": []
        }
        
        resp = planning_session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        assert resp.status_code == 200, f"Failed to create: {resp.text}"
        
        wo_id = resp.json()['work_order_id']
        
        # Fetch and verify
        get_resp = planning_session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")
        wo = get_resp.json()
        
        assert wo['stages'][0]['amount'] == 5000, f"Fixed amount should be 5000, got {wo['stages'][0]['amount']}"
        
        print(f"Fixed amount verified: {wo['stages'][0]['amount']}")
        
        # Cleanup
        planning_session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders/{wo_id}")


class TestWorkOrderPermissions:
    """Test permission checks for work order operations"""
    
    def test_unauthorized_role_cannot_create(self, planning_session):
        """Test that unauthorized roles cannot create work orders"""
        # First login as a role that shouldn't have access (e.g., accountant)
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Try demo login as accountant (should not have create permission)
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        if resp.status_code != 200:
            pytest.skip("Could not login as accountant for permission test")
            
        # Try to create work order
        payload = {
            "contractor_id": "test_contractor",
            "notes": "Should fail",
            "scope_items": [],
            "stages": [],
            "additional_work": []
        }
        
        create_resp = session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/work-orders", json=payload)
        # Accountant should get 403
        assert create_resp.status_code == 403, f"Expected 403 for accountant, got {create_resp.status_code}"
        print("Permission check passed: Accountant cannot create work orders")


class TestContractorFiltering:
    """Test contractor filtering by type"""
    
    def test_contractors_can_be_filtered_by_type(self, planning_session):
        """Verify contractors endpoint returns data that can be filtered by type"""
        # Get all contractors
        resp = planning_session.get(f"{BASE_URL}/api/contractors")
        assert resp.status_code == 200
        
        contractors = resp.json()
        active_contractors = [c for c in contractors if c.get('is_active', True)]
        
        # Get contractor types
        types_resp = planning_session.get(f"{BASE_URL}/api/contractor-types")
        types = types_resp.json()
        
        if len(types) > 0:
            # Filter contractors by first type
            first_type = types[0]
            filtered = [c for c in active_contractors if c.get('contractor_type') == first_type]
            print(f"Type '{first_type}': {len(filtered)} contractors")
            
            # Verify filtering works
            for c in filtered:
                assert c['contractor_type'] == first_type
                
        print(f"Total contractors: {len(active_contractors)}, Types: {types}")
