"""
Test CRE Dashboard Redesign - 5 Tabs, Summary Cards, New Endpoints
Tests the following new features:
1. CRE Dashboard with 4 summary cards
2. 5 main tabs: New Deals, All Projects, Payment Req, Payment Approvals, Payment Collected
3. New API endpoints: /api/cre/additional-payment-requests, /api/cre/income-collected, /api/cre/pending-approvals
4. Create Project with 'Request RE from Planning' mode via POST /api/cre/projects/request-re
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://multi-cheque-entry.preview.emergentagent.com')


class TestCREDashboardRedesign:
    """Test CRE Dashboard - Summary Cards, 5 Tabs, and New Endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRE session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as CRE via demo-login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Failed to login as CRE - skipping tests")
        
        print(f"CRE Login successful: {login_resp.status_code}")
    
    def test_01_cre_dashboard_loads(self):
        """Test GET /api/cre/dashboard - returns dashboard data with summary metrics"""
        response = self.session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        
        data = response.json()
        
        # Verify dashboard has expected fields for summary cards
        expected_fields = ['total_ongoing', 'total_project_value', 'recent_projects', 'packages']
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"Dashboard data: total_ongoing={data.get('total_ongoing')}, total_value={data.get('total_project_value')}")
        print(f"Recent projects count: {len(data.get('recent_projects', []))}")
        print(f"Packages count: {len(data.get('packages', []))}")
    
    def test_02_cre_new_deals(self):
        """Test GET /api/cre/new-deals - returns deals from Sales & GM-approved RE"""
        response = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 200, f"New deals failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"New deals count: {len(data)}")
        if len(data) > 0:
            print(f"First deal: {data[0].get('name') or data[0].get('project_name')}, type: {data[0].get('deal_type', 'unknown')}")
    
    def test_03_cre_payment_requests(self):
        """Test GET /api/cre/payment-requests - stage payments requested for collection"""
        response = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        assert response.status_code == 200, f"Payment requests failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Stage payment requests count: {len(data)}")
        if len(data) > 0:
            print(f"First request: {data[0].get('project_name')} - {data[0].get('stage_name')} - Amount: {data[0].get('amount')}")
    
    def test_04_cre_additional_payment_requests(self):
        """Test GET /api/cre/additional-payment-requests - returns list of additional cost payment requests"""
        response = self.session.get(f"{BASE_URL}/api/cre/additional-payment-requests")
        assert response.status_code == 200, f"Additional payment requests failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Additional payment requests count: {len(data)}")
        if len(data) > 0:
            print(f"First additional request: {data[0].get('project_name')} - {data[0].get('description')} - Amount: {data[0].get('estimated_amount')}")
    
    def test_05_cre_income_collected(self):
        """Test GET /api/cre/income-collected - returns income records (payment ledger)"""
        response = self.session.get(f"{BASE_URL}/api/cre/income-collected")
        assert response.status_code == 200, f"Income collected failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify income record structure
        if len(data) > 0:
            record = data[0]
            expected_fields = ['income_id', 'project_id', 'amount', 'payment_mode', 'created_at']
            for field in expected_fields:
                assert field in record, f"Income record missing field: {field}"
            
            print(f"First income record: Project={record.get('project_name')}, Amount={record.get('amount')}, Mode={record.get('payment_mode')}")
        
        print(f"Total income records: {len(data)}")
        total_amount = sum(r.get('amount', 0) for r in data)
        print(f"Total collected amount: {total_amount}")
    
    def test_06_cre_pending_approvals(self):
        """Test GET /api/cre/pending-approvals - returns advance_verified and pending_income arrays"""
        response = self.session.get(f"{BASE_URL}/api/cre/pending-approvals")
        assert response.status_code == 200, f"Pending approvals failed: {response.text}"
        
        data = response.json()
        
        # Verify structure has both arrays
        assert 'advance_verified' in data, "Missing advance_verified array"
        assert 'pending_income' in data, "Missing pending_income array"
        
        assert isinstance(data['advance_verified'], list), "advance_verified should be a list"
        assert isinstance(data['pending_income'], list), "pending_income should be a list"
        
        print(f"Advance verified projects: {len(data['advance_verified'])}")
        print(f"Pending income approvals: {len(data['pending_income'])}")
        
        if len(data['advance_verified']) > 0:
            proj = data['advance_verified'][0]
            print(f"First advance verified: {proj.get('name')} - Status: {proj.get('status')} - Advance: {proj.get('advance_amount')}")
        
        if len(data['pending_income']) > 0:
            inc = data['pending_income'][0]
            print(f"First pending income: {inc.get('project_name')} - Amount: {inc.get('amount')}")
    
    def test_07_cre_projects_all(self):
        """Test GET /api/cre/projects/all - returns all CRE projects"""
        response = self.session.get(f"{BASE_URL}/api/cre/projects/all")
        assert response.status_code == 200, f"All projects failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Total CRE projects: {len(data)}")
        if len(data) > 0:
            proj = data[0]
            print(f"First project: {proj.get('name')} - Client: {proj.get('client_name')} - Status: {proj.get('status')}")
    
    def test_08_create_project_request_re(self):
        """Test POST /api/cre/projects/request-re - Create project and request RE from Planning"""
        import uuid
        test_id = str(uuid.uuid4())[:8]
        
        payload = {
            "name": f"TEST_RE_Project_{test_id}",
            "client_name": f"TEST_Client_{test_id}",
            "client_phone": "9876543210",
            "client_email": "test@example.com",
            "location": "Test Location",
            "sqft": 2000,
            "building_type": "residential"
        }
        
        response = self.session.post(f"{BASE_URL}/api/cre/projects/request-re", json=payload)
        
        # Should return 200 with project_id and message
        assert response.status_code == 200, f"Request RE failed: {response.text}"
        
        data = response.json()
        assert 'project_id' in data, "Response should contain project_id"
        assert 'message' in data, "Response should contain message"
        
        print(f"Created project with RE request: {data.get('project_id')}")
        print(f"Message: {data.get('message')}")
        
        # Verify project was created with status 'planning_review' and re_requested flag
        project_resp = self.session.get(f"{BASE_URL}/api/projects/{data.get('project_id')}")
        if project_resp.status_code == 200:
            proj = project_resp.json()
            assert proj.get('status') == 'planning_review', f"Project status should be planning_review, got {proj.get('status')}"
            assert proj.get('re_requested') == True, "Project should have re_requested=True"
            print(f"Project status verified: {proj.get('status')}, re_requested: {proj.get('re_requested')}")
        
        return data.get('project_id')


class TestCREDashboardAccessControl:
    """Test access control for CRE endpoints"""
    
    def test_01_non_cre_cannot_access_dashboard(self):
        """Test that non-CRE users get 403 on CRE endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as accountant
        login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Failed to login as accountant")
        
        # Try to access CRE dashboard
        response = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Access control verified: Accountant cannot access CRE dashboard")
    
    def test_02_super_admin_can_access_cre_endpoints(self):
        """Test that super_admin can access CRE endpoints"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as super admin
        login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_resp.status_code != 200:
            pytest.skip("Failed to login as super_admin")
        
        # Access CRE dashboard
        response = session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 200, f"Super admin should access CRE dashboard: {response.text}"
        
        # Access additional payment requests
        response2 = session.get(f"{BASE_URL}/api/cre/additional-payment-requests")
        assert response2.status_code == 200, "Super admin should access additional payment requests"
        
        # Access income collected
        response3 = session.get(f"{BASE_URL}/api/cre/income-collected")
        assert response3.status_code == 200, "Super admin should access income collected"
        
        print("Super admin can access all CRE endpoints")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
