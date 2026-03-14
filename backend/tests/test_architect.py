"""
Architect Module Tests - Site Plans, Design Files, GM Approval
Tests for the new Architect role and dashboard implementation
"""
import pytest
import requests
import os
import json
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ARCHITECT_EMAIL = "architect@constructionos.com"
GM_EMAIL = "gm@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"
PASSWORD = "Demo@1234"
TEST_PROJECT_ID = "proj_murugan_001"


class TestArchitectAuth:
    """Test Architect authentication and access"""
    
    def test_architect_login(self):
        """Architect can login with credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ARCHITECT_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["role"] == "architect"
        assert data["email"] == ARCHITECT_EMAIL
        print(f"✓ Architect login successful: {data['name']}")
    
    def test_gm_login(self):
        """GM can login with credentials"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": GM_EMAIL,
            "password": PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "general_manager"
        print(f"✓ GM login successful: {data['name']}")


class TestArchitectProjects:
    """Test Architect projects list - should NOT have financial data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ARCHITECT_EMAIL,
            "password": PASSWORD
        })
    
    def test_get_projects_no_financial_data(self):
        """Projects endpoint returns no financial data (value, budget, payments)"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} projects")
        
        if len(data) > 0:
            project = data[0]
            # Should NOT have financial fields
            financial_fields = ['value', 'total_value', 'budget', 'advance_amount', 
                              'payments_received', 'balance', 'income']
            for field in financial_fields:
                assert field not in project, f"Financial field '{field}' should NOT be in response"
            print("✓ No financial data exposed")
            
            # Should have architect-specific counts
            assert "site_plans_count" in project
            assert "design_files_count" in project
            assert "pending_approval" in project
            print("✓ Has architect-specific counts (site_plans_count, design_files_count, pending_approval)")
    
    def test_get_projects_with_status_filter(self):
        """Projects endpoint supports status filter"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects?status=in_progress")
        assert response.status_code == 200
        data = response.json()
        # All returned projects should have status=in_progress (or empty if none match)
        for p in data:
            assert p.get("status") == "in_progress", f"Status filter not working: {p.get('status')}"
        print(f"✓ Status filter works, found {len(data)} in_progress projects")
    
    def test_project_has_required_fields(self):
        """Projects have all required display fields"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = ['project_id', 'name', 'client_name', 'status', 
                          'site_plans_count', 'design_files_count', 'pending_approval']
        
        for project in data:
            for field in required_fields:
                assert field in project, f"Missing required field: {field}"
        print("✓ All projects have required display fields")


class TestSitePlans:
    """Test Site Plans CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ARCHITECT_EMAIL,
            "password": PASSWORD
        })
        self.test_plan_id = None
    
    def test_get_site_plans(self):
        """Get site plans for test project"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} site plans for {TEST_PROJECT_ID}")
        
        # Verify seed data exists
        if len(data) >= 3:
            statuses = [sp.get("status") for sp in data]
            print(f"  Statuses: {statuses}")
            # Should have multiple statuses from seed data
            assert "design" in statuses or "yet_to_start" in statuses or "approval_waiting" in statuses
            print("✓ Site plan status workflow data exists")
    
    def test_create_site_plan(self):
        """Create a new site plan"""
        unique_floor = f"TEST_Floor_{uuid.uuid4().hex[:6]}"
        payload = {
            "floor_name": unique_floor,
            "drive_link": "https://drive.google.com/test-link",
            "remarks": "Test site plan for automated testing"
        }
        response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["floor_name"] == unique_floor
        assert data["status"] == "yet_to_start"  # Default status
        assert "plan_id" in data
        self.test_plan_id = data["plan_id"]
        print(f"✓ Created site plan: {data['plan_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{data['plan_id']}")
    
    def test_update_site_plan(self):
        """Update an existing site plan"""
        # First create one
        unique_floor = f"TEST_Update_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        # Update it
        update_payload = {
            "floor_name": f"{unique_floor}_Updated",
            "drive_link": "https://drive.google.com/updated-link",
            "remarks": "Updated remarks"
        }
        response = self.session.patch(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}",
            json=update_payload
        )
        assert response.status_code == 200
        print(f"✓ Updated site plan: {plan_id}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}")
    
    def test_change_status_to_design(self):
        """Change site plan status from yet_to_start to design"""
        # Create a plan
        unique_floor = f"TEST_Status_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        # Change status to design
        response = self.session.patch(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}",
            json={"status": "design"}
        )
        assert response.status_code == 200
        print(f"✓ Changed status to 'design' for plan: {plan_id}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}")
    
    def test_submit_for_approval(self):
        """Submit site plan for GM approval"""
        # Create a plan
        unique_floor = f"TEST_Submit_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        # Submit for approval
        response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}/submit"
        )
        assert response.status_code == 200
        data = response.json()
        assert "submitted" in data.get("message", "").lower() or "approval" in data.get("message", "").lower()
        print(f"✓ Submitted site plan for GM approval: {plan_id}")
        
        # Verify status changed to approval_waiting
        get_response = self.session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans")
        plans = get_response.json()
        test_plan = next((p for p in plans if p["plan_id"] == plan_id), None)
        assert test_plan is not None
        assert test_plan["status"] == "approval_waiting"
        print("✓ Status changed to 'approval_waiting'")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}")
    
    def test_delete_site_plan(self):
        """Delete a site plan"""
        # Create one first
        unique_floor = f"TEST_Delete_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        # Delete it
        response = self.session.delete(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}"
        )
        assert response.status_code == 200
        print(f"✓ Deleted site plan: {plan_id}")


class TestDesignFiles:
    """Test Design Files (3D Photos / Elevations) CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ARCHITECT_EMAIL,
            "password": PASSWORD
        })
    
    def test_get_design_files(self):
        """Get design files for test project"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} design files for {TEST_PROJECT_ID}")
        
        if len(data) >= 2:
            file_types = [df.get("file_type") for df in data]
            print(f"  File types: {file_types}")
    
    def test_create_3d_photo(self):
        """Create a 3D photo design file"""
        unique_name = f"TEST_3D_{uuid.uuid4().hex[:6]}"
        payload = {
            "file_name": unique_name,
            "file_type": "3d_photo",
            "drive_link": "https://drive.google.com/test-3d",
            "remarks": "Test 3D render"
        }
        response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data["file_type"] == "3d_photo"
        assert "file_id" in data
        print(f"✓ Created 3D photo: {data['file_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files/{data['file_id']}")
    
    def test_create_elevation(self):
        """Create an elevation design file"""
        unique_name = f"TEST_Elevation_{uuid.uuid4().hex[:6]}"
        payload = {
            "file_name": unique_name,
            "file_type": "elevation",
            "drive_link": "https://drive.google.com/test-elevation"
        }
        response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        assert data["file_type"] == "elevation"
        print(f"✓ Created elevation: {data['file_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files/{data['file_id']}")
    
    def test_update_design_file(self):
        """Update a design file"""
        unique_name = f"TEST_DF_Update_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files",
            json={"file_name": unique_name, "file_type": "3d_photo"}
        )
        file_id = create_response.json()["file_id"]
        
        # Update
        response = self.session.patch(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files/{file_id}",
            json={"file_name": f"{unique_name}_Updated", "remarks": "Updated remarks"}
        )
        assert response.status_code == 200
        print(f"✓ Updated design file: {file_id}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files/{file_id}")
    
    def test_delete_design_file(self):
        """Delete a design file"""
        unique_name = f"TEST_DF_Delete_{uuid.uuid4().hex[:6]}"
        create_response = self.session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files",
            json={"file_name": unique_name, "file_type": "elevation"}
        )
        file_id = create_response.json()["file_id"]
        
        response = self.session.delete(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/design-files/{file_id}"
        )
        assert response.status_code == 200
        print(f"✓ Deleted design file: {file_id}")


class TestGMApproval:
    """Test GM Approval workflow for site plans"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.architect_session = requests.Session()
        self.architect_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ARCHITECT_EMAIL,
            "password": PASSWORD
        })
        
        self.gm_session = requests.Session()
        self.gm_session.post(f"{BASE_URL}/api/auth/login", json={
            "email": GM_EMAIL,
            "password": PASSWORD
        })
    
    def test_gm_get_pending_approvals(self):
        """GM can see pending design approvals"""
        response = self.gm_session.get(f"{BASE_URL}/api/architect/pending-approvals")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GM sees {len(data)} pending approvals")
        
        # Check enriched data
        for plan in data:
            assert "project_name" in plan or "project_id" in plan
            assert "floor_name" in plan
            assert plan.get("status") == "approval_waiting"
    
    def test_gm_approve_site_plan(self):
        """GM can approve a site plan"""
        # Create and submit a plan
        unique_floor = f"TEST_GMApprove_{uuid.uuid4().hex[:6]}"
        create_response = self.architect_session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        # Submit for approval
        self.architect_session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}/submit"
        )
        
        # GM approves
        response = self.gm_session.patch(
            f"{BASE_URL}/api/architect/site-plans/{plan_id}/approve",
            params={"approved": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert "approved" in data.get("message", "").lower()
        print(f"✓ GM approved site plan: {plan_id}")
        
        # Verify status changed
        get_response = self.architect_session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans")
        plans = get_response.json()
        test_plan = next((p for p in plans if p["plan_id"] == plan_id), None)
        assert test_plan is not None
        assert test_plan["status"] == "approved"
        print("✓ Status changed to 'approved'")
        
        # Cleanup
        self.architect_session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}")
    
    def test_gm_reject_site_plan(self):
        """GM can reject a site plan"""
        # Create and submit
        unique_floor = f"TEST_GMReject_{uuid.uuid4().hex[:6]}"
        create_response = self.architect_session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans",
            json={"floor_name": unique_floor}
        )
        plan_id = create_response.json()["plan_id"]
        
        self.architect_session.post(
            f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}/submit"
        )
        
        # GM rejects
        response = self.gm_session.patch(
            f"{BASE_URL}/api/architect/site-plans/{plan_id}/approve",
            params={"approved": False, "rejection_reason": "Needs revision"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "rejected" in data.get("message", "").lower()
        print(f"✓ GM rejected site plan: {plan_id}")
        
        # Verify status changed back to design (for rework)
        get_response = self.architect_session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans")
        plans = get_response.json()
        test_plan = next((p for p in plans if p["plan_id"] == plan_id), None)
        assert test_plan is not None
        assert test_plan["status"] == "design"  # Rejected plans go back to design
        print("✓ Status changed back to 'design' (for rework)")
        
        # Cleanup
        self.architect_session.delete(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/site-plans/{plan_id}")
    
    def test_architect_cannot_access_approval_endpoint(self):
        """Architect role cannot access GM approval endpoint"""
        response = self.architect_session.get(f"{BASE_URL}/api/architect/pending-approvals")
        # Should be 403 for architect (only GM/super_admin allowed)
        assert response.status_code == 403
        print("✓ Architect correctly denied access to GM approval endpoint")


class TestAllDesignData:
    """Test the combined endpoint for ProjectDetail Documents tab"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": PASSWORD
        })
    
    def test_get_all_design_data(self):
        """Get combined site plans + design files for Documents tab"""
        response = self.session.get(f"{BASE_URL}/api/architect/projects/{TEST_PROJECT_ID}/all-design-data")
        assert response.status_code == 200
        data = response.json()
        
        assert "site_plans" in data
        assert "design_files" in data
        assert isinstance(data["site_plans"], list)
        assert isinstance(data["design_files"], list)
        
        print(f"✓ Combined endpoint returns {len(data['site_plans'])} site plans, {len(data['design_files'])} design files")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
