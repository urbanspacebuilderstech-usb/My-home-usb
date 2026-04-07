"""
Curing Video Management API Tests
Tests for the Site Engineer Curing Video feature:
- POST /api/site-engineer/curing-video - Create curing video record
- PATCH /api/site-engineer/curing-video/{record_id}/whatsapp-sent - Mark WhatsApp sent
- GET /api/site-engineer/curing-video/history - Get curing video history
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCuringVideoAPI:
    """Curing Video Management API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Site Engineer login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Site Engineer using demo login
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        print(f"Logged in as Site Engineer: {self.user.get('name', 'Unknown')}")
        
        # Get assigned projects for the SE
        projects_response = self.session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert projects_response.status_code == 200, f"Failed to get projects: {projects_response.text}"
        self.projects = projects_response.json()
        print(f"SE has {len(self.projects)} assigned projects")
        
        if self.projects:
            self.test_project = self.projects[0]
            print(f"Using test project: {self.test_project.get('name')} ({self.test_project.get('project_id')})")
        else:
            pytest.skip("No projects assigned to Site Engineer")
        
        yield
        
        # Cleanup - logout
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_create_curing_video_record_curing_done(self):
        """Test creating a curing video record with curing_done=True"""
        response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": self.test_project["project_id"],
            "curing_done": True
        })
        
        assert response.status_code == 200, f"Failed to create curing record: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "record_id" in data, "Response missing record_id"
        assert data["record_id"].startswith("cur_"), f"Invalid record_id format: {data['record_id']}"
        assert data["project_id"] == self.test_project["project_id"]
        assert data["curing_done"] == True
        assert data["whatsapp_sent"] == False
        assert "date_time" in data
        assert "project_name" in data
        assert "engineer_id" in data
        
        print(f"Created curing record: {data['record_id']} for project {data['project_name']}")
        print(f"  - Curing Done: {data['curing_done']}")
        print(f"  - WhatsApp Sent: {data['whatsapp_sent']}")
        print(f"  - Client Phone: {data.get('client_phone', 'N/A')}")
        
        # Store for later tests
        self.created_record_id = data["record_id"]
        return data
    
    def test_create_curing_video_record_curing_not_done(self):
        """Test creating a curing video record with curing_done=False"""
        response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": self.test_project["project_id"],
            "curing_done": False
        })
        
        assert response.status_code == 200, f"Failed to create curing record: {response.text}"
        data = response.json()
        
        assert data["curing_done"] == False
        assert data["whatsapp_sent"] == False
        print(f"Created curing record (not done): {data['record_id']}")
        return data
    
    def test_create_curing_video_record_missing_project_id(self):
        """Test creating a curing video record without project_id - should fail"""
        response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "curing_done": True
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly rejected request without project_id")
    
    def test_create_curing_video_record_invalid_project(self):
        """Test creating a curing video record with invalid project_id - should fail"""
        response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": "invalid_project_xyz",
            "curing_done": True
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly rejected request with invalid project_id")
    
    def test_mark_whatsapp_sent(self):
        """Test marking WhatsApp as sent for a curing record"""
        # First create a record
        create_response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": self.test_project["project_id"],
            "curing_done": True
        })
        assert create_response.status_code == 200
        record = create_response.json()
        record_id = record["record_id"]
        
        # Mark WhatsApp as sent
        response = self.session.patch(f"{BASE_URL}/api/site-engineer/curing-video/{record_id}/whatsapp-sent")
        
        assert response.status_code == 200, f"Failed to mark WhatsApp sent: {response.text}"
        data = response.json()
        
        assert data["status"] == "ok"
        assert data["record_id"] == record_id
        assert data["whatsapp_sent"] == True
        print(f"Marked WhatsApp sent for record: {record_id}")
    
    def test_mark_whatsapp_sent_invalid_record(self):
        """Test marking WhatsApp sent for non-existent record - should fail"""
        response = self.session.patch(f"{BASE_URL}/api/site-engineer/curing-video/invalid_record_xyz/whatsapp-sent")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly rejected WhatsApp update for invalid record")
    
    def test_get_curing_video_history(self):
        """Test getting curing video history for the logged-in SE"""
        # First create a couple of records
        for i in range(2):
            self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
                "project_id": self.test_project["project_id"],
                "curing_done": i % 2 == 0
            })
        
        # Get history
        response = self.session.get(f"{BASE_URL}/api/site-engineer/curing-video/history")
        
        assert response.status_code == 200, f"Failed to get history: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "History should be a list"
        assert len(data) >= 2, f"Expected at least 2 records, got {len(data)}"
        
        # Validate record structure
        if data:
            record = data[0]
            assert "record_id" in record
            assert "project_id" in record
            assert "project_name" in record
            assert "curing_done" in record
            assert "whatsapp_sent" in record
            assert "date_time" in record
            assert "engineer_id" in record
        
        print(f"Retrieved {len(data)} curing video records")
        for r in data[:3]:  # Show first 3
            print(f"  - {r['record_id']}: {r['project_name']} | Curing: {r['curing_done']} | WA: {r['whatsapp_sent']}")
    
    def test_get_curing_video_history_with_project_filter(self):
        """Test getting curing video history filtered by project_id"""
        # Create a record for the test project
        self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": self.test_project["project_id"],
            "curing_done": True
        })
        
        # Get history with project filter
        response = self.session.get(
            f"{BASE_URL}/api/site-engineer/curing-video/history",
            params={"project_id": self.test_project["project_id"]}
        )
        
        assert response.status_code == 200, f"Failed to get filtered history: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        # All records should be for the filtered project
        for record in data:
            assert record["project_id"] == self.test_project["project_id"], \
                f"Record {record['record_id']} has wrong project_id"
        
        print(f"Retrieved {len(data)} records for project {self.test_project['project_id']}")
    
    def test_curing_video_full_workflow(self):
        """Test complete curing video workflow: create -> verify history -> mark WhatsApp sent"""
        # Step 1: Create curing record with curing_done=True
        create_response = self.session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": self.test_project["project_id"],
            "curing_done": True
        })
        assert create_response.status_code == 200
        record = create_response.json()
        record_id = record["record_id"]
        print(f"Step 1: Created record {record_id}")
        
        # Step 2: Verify record appears in history
        history_response = self.session.get(f"{BASE_URL}/api/site-engineer/curing-video/history")
        assert history_response.status_code == 200
        history = history_response.json()
        record_in_history = next((r for r in history if r["record_id"] == record_id), None)
        assert record_in_history is not None, "Created record not found in history"
        assert record_in_history["whatsapp_sent"] == False
        print(f"Step 2: Record found in history, WhatsApp not sent yet")
        
        # Step 3: Mark WhatsApp as sent
        wa_response = self.session.patch(f"{BASE_URL}/api/site-engineer/curing-video/{record_id}/whatsapp-sent")
        assert wa_response.status_code == 200
        print(f"Step 3: Marked WhatsApp as sent")
        
        # Step 4: Verify WhatsApp status updated in history
        history_response2 = self.session.get(f"{BASE_URL}/api/site-engineer/curing-video/history")
        assert history_response2.status_code == 200
        history2 = history_response2.json()
        record_updated = next((r for r in history2 if r["record_id"] == record_id), None)
        assert record_updated is not None
        assert record_updated["whatsapp_sent"] == True, "WhatsApp status not updated"
        print(f"Step 4: Verified WhatsApp status is now True")
        
        print("Full workflow completed successfully!")


class TestCuringVideoPermissions:
    """Test permission checks for Curing Video API"""
    
    def test_non_se_cannot_create_curing_record(self):
        """Test that non-Site Engineer roles cannot create curing records"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as Accountant (not a Site Engineer)
        login_response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Accountant demo login not available")
        
        # Try to create curing record
        response = session.post(f"{BASE_URL}/api/site-engineer/curing-video", json={
            "project_id": "proj_12f23331b542",
            "curing_done": True
        })
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Correctly denied non-SE from creating curing record")
        
        session.post(f"{BASE_URL}/api/auth/logout")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
