"""
Test Reorder Endpoints for Drag-and-Drop functionality
Tests: POST /api/scope-items/reorder, /api/additional-costs/reorder, /api/deductions/reorder
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReorderEndpoints:
    """Test reorder endpoints for scope items, additional costs, and deductions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with demo login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Super Admin via demo-login
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Get a project to test with
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        assert projects_response.status_code == 200, f"Failed to get projects: {projects_response.text}"
        projects = projects_response.json()
        assert len(projects) > 0, "No projects found for testing"
        self.project_id = projects[0]["project_id"]
        
    def test_scope_items_reorder_endpoint_exists(self):
        """Test that POST /api/scope-items/reorder endpoint exists and accepts valid request"""
        # First get existing scope items for this project
        scope_response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/scope-items")
        
        if scope_response.status_code == 200:
            scope_items = scope_response.json()
            if len(scope_items) >= 2:
                # Get scope IDs and reverse them to test reorder
                scope_ids = [item["scope_id"] for item in scope_items[:3]]  # Take up to 3 items
                reversed_ids = list(reversed(scope_ids))
                
                # Test reorder endpoint
                reorder_response = self.session.post(
                    f"{BASE_URL}/api/scope-items/reorder",
                    json={"scope_ids": reversed_ids}
                )
                assert reorder_response.status_code == 200, f"Reorder failed: {reorder_response.text}"
                data = reorder_response.json()
                assert "message" in data
                assert data["message"] == "Scope items reordered"
                print(f"PASS: Scope items reorder endpoint works - reordered {len(reversed_ids)} items")
            else:
                print(f"SKIP: Not enough scope items to test reorder (found {len(scope_items)})")
        else:
            print(f"SKIP: Could not get scope items for project {self.project_id}")
    
    def test_scope_items_reorder_empty_ids_returns_400(self):
        """Test that empty scope_ids returns 400 error"""
        response = self.session.post(
            f"{BASE_URL}/api/scope-items/reorder",
            json={"scope_ids": []}
        )
        assert response.status_code == 400, f"Expected 400 for empty scope_ids, got {response.status_code}"
        print("PASS: Scope items reorder returns 400 for empty scope_ids")
    
    def test_additional_costs_reorder_endpoint_exists(self):
        """Test that POST /api/additional-costs/reorder endpoint exists and accepts valid request"""
        # First get existing additional costs for this project
        costs_response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/additional-costs")
        
        if costs_response.status_code == 200:
            costs = costs_response.json()
            if len(costs) >= 2:
                # Get cost IDs and reverse them to test reorder
                cost_ids = [item["cost_id"] for item in costs[:3]]  # Take up to 3 items
                reversed_ids = list(reversed(cost_ids))
                
                # Test reorder endpoint
                reorder_response = self.session.post(
                    f"{BASE_URL}/api/additional-costs/reorder",
                    json={"cost_ids": reversed_ids}
                )
                assert reorder_response.status_code == 200, f"Reorder failed: {reorder_response.text}"
                data = reorder_response.json()
                assert "message" in data
                assert data["message"] == "Additional costs reordered"
                print(f"PASS: Additional costs reorder endpoint works - reordered {len(reversed_ids)} items")
            else:
                print(f"SKIP: Not enough additional costs to test reorder (found {len(costs)})")
        else:
            print(f"SKIP: Could not get additional costs for project {self.project_id}")
    
    def test_additional_costs_reorder_empty_ids_returns_400(self):
        """Test that empty cost_ids returns 400 error"""
        response = self.session.post(
            f"{BASE_URL}/api/additional-costs/reorder",
            json={"cost_ids": []}
        )
        assert response.status_code == 400, f"Expected 400 for empty cost_ids, got {response.status_code}"
        print("PASS: Additional costs reorder returns 400 for empty cost_ids")
    
    def test_deductions_reorder_endpoint_exists(self):
        """Test that POST /api/deductions/reorder endpoint exists and accepts valid request"""
        # First get existing deductions for this project
        deductions_response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/deductions")
        
        if deductions_response.status_code == 200:
            deductions = deductions_response.json()
            if len(deductions) >= 2:
                # Get deduction IDs and reverse them to test reorder
                deduction_ids = [item["deduction_id"] for item in deductions[:3]]  # Take up to 3 items
                reversed_ids = list(reversed(deduction_ids))
                
                # Test reorder endpoint
                reorder_response = self.session.post(
                    f"{BASE_URL}/api/deductions/reorder",
                    json={"deduction_ids": reversed_ids}
                )
                assert reorder_response.status_code == 200, f"Reorder failed: {reorder_response.text}"
                data = reorder_response.json()
                assert "message" in data
                assert data["message"] == "Deductions reordered"
                print(f"PASS: Deductions reorder endpoint works - reordered {len(reversed_ids)} items")
            else:
                print(f"SKIP: Not enough deductions to test reorder (found {len(deductions)})")
        else:
            print(f"SKIP: Could not get deductions for project {self.project_id}")
    
    def test_deductions_reorder_empty_ids_returns_400(self):
        """Test that empty deduction_ids returns 400 error"""
        response = self.session.post(
            f"{BASE_URL}/api/deductions/reorder",
            json={"deduction_ids": []}
        )
        assert response.status_code == 400, f"Expected 400 for empty deduction_ids, got {response.status_code}"
        print("PASS: Deductions reorder returns 400 for empty deduction_ids")
    
    def test_reorder_requires_authentication(self):
        """Test that reorder endpoints require authentication"""
        # Create a new session without login
        unauthenticated_session = requests.Session()
        unauthenticated_session.headers.update({"Content-Type": "application/json"})
        
        # Test scope items reorder
        response = unauthenticated_session.post(
            f"{BASE_URL}/api/scope-items/reorder",
            json={"scope_ids": ["test_id"]}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Scope items reorder requires authentication")
        
        # Test additional costs reorder
        response = unauthenticated_session.post(
            f"{BASE_URL}/api/additional-costs/reorder",
            json={"cost_ids": ["test_id"]}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Additional costs reorder requires authentication")
        
        # Test deductions reorder
        response = unauthenticated_session.post(
            f"{BASE_URL}/api/deductions/reorder",
            json={"deduction_ids": ["test_id"]}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Deductions reorder requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
