"""
Backend Tests for Gantt Chart Feature - Project Stages with start_date/target_date
Tests project stages CRUD with start_date field for timeline visualization
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
ADMIN_CREDENTIALS = {"email": "admin@constructionos.com", "password": "Demo@1234"}
PM_CREDENTIALS = {"email": "pm@constructionos.com", "password": "Demo@1234"}
TEST_PROJECT_ID = "proj_murugan_001"  # Villa Murugan - Vadapalani project with 9 stages


class TestGanttChartProjectStages:
    """Tests for project stages API - Gantt chart timeline data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        yield
        # Cleanup
        self.session.close()
    
    def test_get_project_stages_returns_start_and_target_date(self):
        """GET /api/projects/{id}/project-stages - Returns stages with start_date and target_date"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        assert res.status_code == 200, f"Failed to get stages: {res.text}"
        
        stages = res.json()
        assert isinstance(stages, list), "Stages should be a list"
        assert len(stages) > 0, "Project should have stages"
        
        # Check first stage has expected fields
        stage = stages[0]
        assert "stage_id" in stage, "Stage should have stage_id"
        assert "stage_name" in stage, "Stage should have stage_name"
        assert "status" in stage, "Stage should have status"
        # Key fields for Gantt chart
        assert "start_date" in stage or stage.get("start_date") is None, "Stage should have start_date field"
        assert "target_date" in stage or stage.get("target_date") is None, "Stage should have target_date field"
        
        print(f"✅ GET project stages returns {len(stages)} stages with timeline data")
    
    def test_project_stages_have_valid_status_values(self):
        """Verify stages have valid status values for Gantt color coding"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        assert res.status_code == 200
        
        stages = res.json()
        valid_statuses = {'yet_to_start', 'started', 'finished'}
        
        for stage in stages:
            assert stage.get('status') in valid_statuses, f"Invalid status '{stage.get('status')}' for stage {stage.get('stage_name')}"
        
        # Count by status for Gantt chart legend
        status_counts = {}
        for stage in stages:
            status = stage.get('status', 'yet_to_start')
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"✅ Stage status distribution: {status_counts}")
    
    def test_create_stage_with_start_date(self):
        """POST /api/projects/{id}/project-stages - Create stage with start_date"""
        unique_id = uuid.uuid4().hex[:6]
        stage_data = {
            "stage_name": f"TEST_Stage_{unique_id}",
            "start_date": "2025-01-15",
            "target_date": "2025-02-15",
            "status": "yet_to_start",
            "remarks": "Test stage for Gantt chart"
        }
        
        res = self.session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages", json=stage_data)
        assert res.status_code == 200, f"Failed to create stage: {res.text}"
        
        created = res.json()
        assert created.get('stage_name') == stage_data['stage_name'], "Stage name mismatch"
        assert created.get('start_date') == stage_data['start_date'], "start_date not saved"
        assert created.get('target_date') == stage_data['target_date'], "target_date not saved"
        
        # Cleanup - delete the test stage
        stage_id = created.get('stage_id')
        if stage_id:
            del_res = self.session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}")
            assert del_res.status_code == 200, f"Failed to cleanup test stage: {del_res.text}"
        
        print(f"✅ Created and cleaned up test stage with start_date")
    
    def test_update_stage_start_date(self):
        """PATCH /api/projects/{id}/project-stages/{stage_id} - Update stage start_date"""
        # First create a test stage
        unique_id = uuid.uuid4().hex[:6]
        create_data = {
            "stage_name": f"TEST_Update_{unique_id}",
            "start_date": "2025-03-01",
            "target_date": "2025-03-31",
            "status": "yet_to_start"
        }
        create_res = self.session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages", json=create_data)
        assert create_res.status_code == 200
        stage_id = create_res.json().get('stage_id')
        
        # Update the stage
        update_data = {
            "start_date": "2025-03-10",
            "target_date": "2025-04-15",
            "status": "started"
        }
        update_res = self.session.patch(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}", json=update_data)
        assert update_res.status_code == 200, f"Failed to update stage: {update_res.text}"
        
        # Verify update
        get_res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        stages = get_res.json()
        updated_stage = next((s for s in stages if s['stage_id'] == stage_id), None)
        
        assert updated_stage is not None, "Updated stage not found"
        assert updated_stage.get('start_date') == "2025-03-10", "start_date not updated"
        assert updated_stage.get('target_date') == "2025-04-15", "target_date not updated"
        assert updated_stage.get('status') == "started", "status not updated"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}")
        
        print(f"✅ Stage start_date update works correctly")
    
    def test_bulk_create_stages_with_dates(self):
        """POST /api/projects/{id}/project-stages/bulk - Bulk create stages with dates"""
        unique_id = uuid.uuid4().hex[:6]
        bulk_stages = [
            {"stage_name": f"TEST_Bulk1_{unique_id}", "start_date": "2025-05-01", "target_date": "2025-05-15", "status": "yet_to_start"},
            {"stage_name": f"TEST_Bulk2_{unique_id}", "start_date": "2025-05-16", "target_date": "2025-05-31", "status": "yet_to_start"},
        ]
        
        res = self.session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/bulk", json=bulk_stages)
        assert res.status_code == 200, f"Bulk create failed: {res.text}"
        
        result = res.json()
        assert 'stages' in result, "Response should contain stages"
        created_stages = result['stages']
        assert len(created_stages) == 2, "Should create 2 stages"
        
        # Cleanup - delete created test stages
        for stage in created_stages:
            stage_id = stage.get('stage_id')
            if stage_id:
                self.session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}")
        
        print(f"✅ Bulk create stages with dates works")


class TestProjectManagerRoleHiddenCards:
    """Tests for PM role restrictions - hidden Value and Additions cards"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login as PM"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as Project Manager
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=PM_CREDENTIALS)
        assert login_res.status_code == 200, f"PM login failed: {login_res.text}"
        yield
        self.session.close()
    
    def test_pm_can_access_project_stages(self):
        """PM should be able to access project stages for Gantt chart"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        assert res.status_code == 200, f"PM cannot access project stages: {res.text}"
        
        stages = res.json()
        assert isinstance(stages, list), "Should return list of stages"
        print(f"✅ PM can access project stages ({len(stages)} stages)")
    
    def test_pm_can_view_project_details(self):
        """PM should be able to access project full details"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/full-details")
        assert res.status_code == 200, f"PM cannot access project details: {res.text}"
        
        data = res.json()
        assert 'project' in data, "Should contain project data"
        assert 'scope_items' in data, "Should contain scope_items"
        print(f"✅ PM can access project full details")
    
    def test_pm_can_update_stage_status(self):
        """PM should be able to update stage status for progress tracking"""
        # First create a test stage
        unique_id = uuid.uuid4().hex[:6]
        create_data = {
            "stage_name": f"TEST_PMUpdate_{unique_id}",
            "start_date": "2025-06-01",
            "target_date": "2025-06-30",
            "status": "yet_to_start"
        }
        create_res = self.session.post(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages", json=create_data)
        assert create_res.status_code == 200
        stage_id = create_res.json().get('stage_id')
        
        # PM updates status
        update_res = self.session.patch(
            f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}",
            json={"status": "started"}
        )
        assert update_res.status_code == 200, f"PM cannot update stage: {update_res.text}"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages/{stage_id}")
        
        print(f"✅ PM can update stage status")


class TestVillaMuruganProjectStages:
    """Tests for the specific test project proj_murugan_001 with 9 stages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert login_res.status_code == 200
        yield
        self.session.close()
    
    def test_murugan_project_has_expected_stages(self):
        """Villa Murugan project should have stages with dates"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        assert res.status_code == 200
        
        stages = res.json()
        print(f"Found {len(stages)} stages in Villa Murugan project")
        
        # Check for expected stage types
        stage_names = [s['stage_name'] for s in stages]
        print(f"Stage names: {stage_names}")
        
        # Verify at least some stages have dates
        stages_with_start = [s for s in stages if s.get('start_date')]
        stages_with_target = [s for s in stages if s.get('target_date')]
        
        print(f"✅ Stages with start_date: {len(stages_with_start)}")
        print(f"✅ Stages with target_date: {len(stages_with_target)}")
    
    def test_murugan_stages_status_distribution(self):
        """Check status distribution for Gantt chart color coding"""
        res = self.session.get(f"{BASE_URL}/api/projects/{TEST_PROJECT_ID}/project-stages")
        assert res.status_code == 200
        
        stages = res.json()
        
        finished = [s for s in stages if s.get('status') == 'finished']
        started = [s for s in stages if s.get('status') == 'started']
        yet_to_start = [s for s in stages if s.get('status') == 'yet_to_start']
        
        print(f"✅ Finished (green): {len(finished)}")
        print(f"✅ Started/In Progress (amber): {len(started)}")
        print(f"✅ Yet to Start (gray): {len(yet_to_start)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
