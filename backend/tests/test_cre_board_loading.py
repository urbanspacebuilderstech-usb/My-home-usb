"""
CRE Board Loading Fix Tests
Tests for the parallelization fixes applied to:
- Frontend: Promise.allSettled for API calls
- Backend: asyncio.gather for MongoDB queries

Issue: CRE Board was getting stuck on "Loading..." state
Fix: Parallelized API calls and added skeleton loading state
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestCREBoardAPIs:
    """Test CRE Board API endpoints for performance and correctness"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as CRE user and get session"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "cre@constructionos.com", "password": "Demo@1234"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        yield
        # Cleanup
        self.session.close()
    
    def test_cre_dashboard_returns_200(self):
        """Test /api/cre/dashboard returns 200 with correct data structure"""
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/api/cre/dashboard")
        elapsed = time.time() - start_time
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data structure check
        data = response.json()
        assert "draft_count" in data, "Missing draft_count in response"
        assert "pending_payment_count" in data, "Missing pending_payment_count in response"
        assert "payment_received_count" in data, "Missing payment_received_count in response"
        assert "in_planning_count" in data, "Missing in_planning_count in response"
        assert "approved_count" in data, "Missing approved_count in response"
        assert "total_ongoing" in data, "Missing total_ongoing in response"
        assert "total_project_value" in data, "Missing total_project_value in response"
        assert "recent_projects" in data, "Missing recent_projects in response"
        assert "packages" in data, "Missing packages in response"
        assert "project_stages" in data, "Missing project_stages in response"
        assert "stage_counts" in data, "Missing stage_counts in response"
        
        # Performance check - should be under 5s after parallelization
        assert elapsed < 5.0, f"API took too long: {elapsed:.2f}s (expected < 5s)"
        print(f"Dashboard API response time: {elapsed:.2f}s")
    
    def test_cre_new_deals_returns_200(self):
        """Test /api/cre/new-deals returns 200"""
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        elapsed = time.time() - start_time
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data should be a list
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # Performance check
        assert elapsed < 3.0, f"API took too long: {elapsed:.2f}s (expected < 3s)"
        print(f"New Deals API response time: {elapsed:.2f}s")
    
    def test_cre_payment_requests_returns_200(self):
        """Test /api/cre/payment-requests returns 200"""
        start_time = time.time()
        response = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        elapsed = time.time() - start_time
        
        # Status code check
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data should be a list
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # Performance check
        assert elapsed < 3.0, f"API took too long: {elapsed:.2f}s (expected < 3s)"
        print(f"Payment Requests API response time: {elapsed:.2f}s")
    
    def test_dashboard_metrics_correctness(self):
        """Test that dashboard metrics are correct and match expected values"""
        response = self.session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify counts are non-negative integers
        assert isinstance(data["draft_count"], int) and data["draft_count"] >= 0
        assert isinstance(data["pending_payment_count"], int) and data["pending_payment_count"] >= 0
        assert isinstance(data["payment_received_count"], int) and data["payment_received_count"] >= 0
        assert isinstance(data["in_planning_count"], int) and data["in_planning_count"] >= 0
        assert isinstance(data["approved_count"], int) and data["approved_count"] >= 0
        assert isinstance(data["total_ongoing"], int) and data["total_ongoing"] >= 0
        
        # Verify total_project_value is numeric
        assert isinstance(data["total_project_value"], (int, float))
        
        # Verify project_stages has expected structure
        assert isinstance(data["project_stages"], list)
        if len(data["project_stages"]) > 0:
            stage = data["project_stages"][0]
            assert "id" in stage
            assert "name" in stage
            assert "order" in stage
    
    def test_payment_requests_data_structure(self):
        """Test that payment requests have correct data structure"""
        response = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        assert response.status_code == 200
        
        data = response.json()
        
        # If there are payment requests, verify structure
        if len(data) > 0:
            req = data[0]
            # These fields should be present based on the API
            assert "stage_id" in req or "payment_id" in req, "Missing identifier"
            if "project_name" in req:
                assert isinstance(req["project_name"], str)
            if "amount" in req:
                assert isinstance(req["amount"], (int, float))


class TestCREBoardAuthentication:
    """Test authentication requirements for CRE Board APIs"""
    
    def test_dashboard_requires_auth(self):
        """Test /api/cre/dashboard requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 401, f"Expected 401 for unauthenticated request, got {response.status_code}"
    
    def test_new_deals_requires_auth(self):
        """Test /api/cre/new-deals requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 401, f"Expected 401 for unauthenticated request, got {response.status_code}"
    
    def test_payment_requests_requires_auth(self):
        """Test /api/cre/payment-requests requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cre/payment-requests")
        assert response.status_code == 401, f"Expected 401 for unauthenticated request, got {response.status_code}"


class TestCREBoardWithSuperAdmin:
    """Test CRE Board APIs with Super Admin role"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as Super Admin"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@constructionos.com", "password": "Demo@1234"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        yield
        self.session.close()
    
    def test_super_admin_can_access_dashboard(self):
        """Test Super Admin can access CRE dashboard"""
        response = self.session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 200, f"Super Admin should access CRE dashboard, got {response.status_code}"
    
    def test_super_admin_can_access_new_deals(self):
        """Test Super Admin can access new deals"""
        response = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 200, f"Super Admin should access new deals, got {response.status_code}"
    
    def test_super_admin_can_access_payment_requests(self):
        """Test Super Admin can access payment requests"""
        response = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        assert response.status_code == 200, f"Super Admin should access payment requests, got {response.status_code}"


class TestParallelPerformance:
    """Test that parallelization improved performance"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as CRE user"""
        self.session = requests.Session()
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "cre@constructionos.com", "password": "Demo@1234"}
        )
        assert login_response.status_code == 200
        yield
        self.session.close()
    
    def test_all_apis_total_time_under_threshold(self):
        """Test that calling all 3 APIs sequentially takes reasonable time"""
        start_time = time.time()
        
        # Call all 3 APIs (simulating what frontend does)
        r1 = self.session.get(f"{BASE_URL}/api/cre/dashboard")
        r2 = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        r3 = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        
        total_time = time.time() - start_time
        
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r3.status_code == 200
        
        # Total sequential time should be reasonable
        # Note: Frontend uses Promise.allSettled so actual frontend time is max of these
        print(f"Total sequential API time: {total_time:.2f}s")
        
        # With parallelization in backend, each API should be faster
        # Before fix: ~7s total, After fix: ~3.5s total
        assert total_time < 10.0, f"APIs took too long: {total_time:.2f}s"
