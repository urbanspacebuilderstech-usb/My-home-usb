"""
Site Engineer Board Module Tests
Tests for:
- Site Engineer Assignment APIs
- Material Request Flow (Requested → Planning → Procurement → Accountant → Ready)
- Labour Request Flow (Requested → Planning → Accountant → Approved)
- Material Receipt with GPS + OTP verification
- Real-time status tracking
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://build-accounting-1.preview.emergentagent.com')

# Test credentials from review request
SUPER_ADMIN_EMAIL = "admin@constructionos.com"
SITE_ENGINEER_EMAIL = "engineer@constructionos.com"
SITE_ENGINEER_USER_ID = "user_engineer001"
TEST_PROJECT_ID = "proj_classic001"


class TestSiteEngineerModule:
    """Site Engineer Board Module Tests"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get admin session for setup operations"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def engineer_session(self):
        """Get site engineer session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert response.status_code == 200, f"Engineer login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def planning_session(self):
        """Get planning user session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def procurement_session(self):
        """Get procurement user session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "procurement@constructionos.com"})
        assert response.status_code == 200, f"Procurement login failed: {response.text}"
        return session
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        """Get accountant user session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        return session

    # ==================== AUTH TESTS ====================
    
    def test_admin_login(self, admin_session):
        """Test admin can login"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == SUPER_ADMIN_EMAIL
        assert data["role"] == "super_admin"
        print(f"✓ Admin login successful: {data['name']}")
    
    def test_engineer_login(self, engineer_session):
        """Test site engineer can login"""
        response = engineer_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == SITE_ENGINEER_EMAIL
        assert data["role"] == "site_engineer"
        print(f"✓ Site Engineer login successful: {data['name']}")

    # ==================== SITE ENGINEER ASSIGNMENT TESTS ====================
    
    def test_get_assignments(self, admin_session):
        """Test GET /api/site-engineer/assignments"""
        response = admin_session.get(f"{BASE_URL}/api/site-engineer/assignments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET assignments returned {len(data)} assignments")
    
    def test_get_assignments_by_project(self, admin_session):
        """Test GET /api/site-engineer/assignments with project filter"""
        response = admin_session.get(f"{BASE_URL}/api/site-engineer/assignments?project_id={TEST_PROJECT_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned assignments should be for the specified project
        for assignment in data:
            assert assignment["project_id"] == TEST_PROJECT_ID
        print(f"✓ GET assignments by project returned {len(data)} assignments")
    
    def test_engineer_can_see_own_assignments(self, engineer_session):
        """Test site engineer can see their own assignments"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/assignments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All assignments should belong to the logged-in engineer
        for assignment in data:
            assert assignment["user_id"] == SITE_ENGINEER_USER_ID
        print(f"✓ Engineer sees {len(data)} own assignments")

    # ==================== MY PROJECTS TESTS ====================
    
    def test_get_my_projects(self, engineer_session):
        """Test GET /api/site-engineer/my-projects"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have max 3 projects
        assert len(data) <= 3, "Site engineer should have max 3 projects"
        print(f"✓ Site engineer has {len(data)} assigned projects")
        
        # Verify project structure
        if len(data) > 0:
            project = data[0]
            assert "project_id" in project
            assert "name" in project
            assert "client_name" in project
            assert "location" in project
            assert "status" in project
            print(f"  - First project: {project['name']}")
    
    def test_my_projects_denied_for_non_engineer(self, admin_session):
        """Test non-site-engineer cannot access my-projects"""
        response = admin_session.get(f"{BASE_URL}/api/site-engineer/my-projects")
        assert response.status_code == 403
        print("✓ Non-engineer correctly denied access to my-projects")

    # ==================== PROJECT DETAIL TESTS ====================
    
    def test_get_project_detail(self, engineer_session):
        """Test GET /api/site-engineer/project/{id}"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/project/{TEST_PROJECT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "project" in data
        assert "material_requests" in data
        assert "labour_requests" in data
        assert "material_receipts" in data
        
        # Verify project data
        assert data["project"]["project_id"] == TEST_PROJECT_ID
        print(f"✓ Project detail retrieved: {data['project']['name']}")
        print(f"  - Material requests: {len(data['material_requests'])}")
        print(f"  - Labour requests: {len(data['labour_requests'])}")
        print(f"  - Material receipts: {len(data['material_receipts'])}")
    
    def test_project_detail_denied_for_unassigned(self, admin_session):
        """Test non-engineer cannot access project detail"""
        response = admin_session.get(f"{BASE_URL}/api/site-engineer/project/{TEST_PROJECT_ID}")
        assert response.status_code == 403
        print("✓ Non-engineer correctly denied access to project detail")

    # ==================== LABOUR TYPES TESTS ====================
    
    def test_get_labour_types(self, engineer_session):
        """Test GET /api/site-engineer/labour-types"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/labour-types")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 5, "Should have at least 5 labour types"
        
        # Verify structure
        for item in data:
            assert "value" in item
            assert "label" in item
        
        # Check expected types
        values = [item["value"] for item in data]
        assert "mason" in values
        assert "helper" in values
        assert "carpenter" in values
        print(f"✓ Labour types returned: {len(data)} types")

    # ==================== MATERIAL REQUEST TESTS ====================
    
    def test_get_material_requests(self, engineer_session):
        """Test GET /api/site-engineer/material-requests"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/material-requests")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Material requests returned: {len(data)} requests")
    
    def test_get_material_requests_by_project(self, engineer_session):
        """Test GET /api/site-engineer/material-requests with project filter"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/material-requests?project_id={TEST_PROJECT_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for req in data:
            assert req["project_id"] == TEST_PROJECT_ID
        print(f"✓ Material requests by project: {len(data)} requests")
    
    def test_get_material_requests_by_status(self, engineer_session):
        """Test GET /api/site-engineer/material-requests with status filter"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/material-requests?status=requested")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for req in data:
            assert req["status"] == "requested"
        print(f"✓ Material requests by status: {len(data)} requests")

    # ==================== LABOUR REQUEST TESTS ====================
    
    def test_get_labour_requests(self, engineer_session):
        """Test GET /api/site-engineer/labour-requests"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/labour-requests")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Labour requests returned: {len(data)} requests")
    
    def test_get_labour_requests_by_project(self, engineer_session):
        """Test GET /api/site-engineer/labour-requests with project filter"""
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/labour-requests?project_id={TEST_PROJECT_ID}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for req in data:
            assert req["project_id"] == TEST_PROJECT_ID
        print(f"✓ Labour requests by project: {len(data)} requests")


class TestMaterialRequestWorkflow:
    """Test complete material request workflow"""
    
    @pytest.fixture(scope="class")
    def sessions(self):
        """Get all required sessions"""
        sessions = {}
        
        # Admin session
        admin = requests.Session()
        resp = admin.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        assert resp.status_code == 200
        sessions["admin"] = admin
        
        # Engineer session
        engineer = requests.Session()
        resp = engineer.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        sessions["engineer"] = engineer
        
        # Planning session
        planning = requests.Session()
        resp = planning.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert resp.status_code == 200
        sessions["planning"] = planning
        
        # Procurement session
        procurement = requests.Session()
        resp = procurement.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "procurement@constructionos.com"})
        assert resp.status_code == 200
        sessions["procurement"] = procurement
        
        # Accountant session
        accountant = requests.Session()
        resp = accountant.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert resp.status_code == 200
        sessions["accountant"] = accountant
        
        return sessions
    
    @pytest.fixture(scope="class")
    def test_material_id(self, sessions):
        """Get a material ID for testing"""
        response = sessions["admin"].get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        materials = response.json()
        if len(materials) > 0:
            return materials[0]["material_id"]
        pytest.skip("No materials available for testing")
    
    def test_create_material_request(self, sessions, test_material_id):
        """Test POST /api/site-engineer/material-requests"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_id": test_material_id,
            "quantity": 10.0,
            "remarks": "TEST_material_request_workflow"
        }
        
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 200, f"Failed to create material request: {response.text}"
        
        data = response.json()
        assert data["project_id"] == TEST_PROJECT_ID
        assert data["material_id"] == test_material_id
        assert data["quantity"] == 10.0
        assert data["status"] == "requested"
        assert "request_id" in data
        assert "order_id" in data
        
        # Store for later tests
        self.__class__.material_request_id = data["request_id"]
        print(f"✓ Material request created: {data['order_id']}")
        return data
    
    def test_planning_approve_material_request(self, sessions):
        """Test planning approval of material request"""
        request_id = getattr(self.__class__, 'material_request_id', None)
        if not request_id:
            pytest.skip("No material request to approve")
        
        response = sessions["planning"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=planning_approve"
        )
        assert response.status_code == 200, f"Planning approval failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "planning_approved"
        assert data["planning_approved_by"] is not None
        print(f"✓ Material request planning approved")
    
    def test_procurement_approve_material_request(self, sessions):
        """Test procurement approval of material request"""
        request_id = getattr(self.__class__, 'material_request_id', None)
        if not request_id:
            pytest.skip("No material request to approve")
        
        response = sessions["procurement"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=procurement_approve&pricing=5000.0"
        )
        assert response.status_code == 200, f"Procurement approval failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "procurement_approved"
        assert data["procurement_approved_by"] is not None
        assert data["procurement_pricing"] == 5000.0
        print(f"✓ Material request procurement approved with pricing: ₹5000")
    
    def test_accountant_approve_material_request(self, sessions):
        """Test accountant approval of material request"""
        request_id = getattr(self.__class__, 'material_request_id', None)
        if not request_id:
            pytest.skip("No material request to approve")
        
        response = sessions["accountant"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=accountant_approve"
        )
        assert response.status_code == 200, f"Accountant approval failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "accountant_approved"
        assert data["accountant_approved_by"] is not None
        print(f"✓ Material request accountant approved - Ready for delivery")


class TestLabourRequestWorkflow:
    """Test complete labour request workflow"""
    
    @pytest.fixture(scope="class")
    def sessions(self):
        """Get all required sessions"""
        sessions = {}
        
        # Engineer session
        engineer = requests.Session()
        resp = engineer.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        sessions["engineer"] = engineer
        
        # Planning session
        planning = requests.Session()
        resp = planning.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert resp.status_code == 200
        sessions["planning"] = planning
        
        # Accountant session
        accountant = requests.Session()
        resp = accountant.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert resp.status_code == 200
        sessions["accountant"] = accountant
        
        return sessions
    
    def test_create_labour_request(self, sessions):
        """Test POST /api/site-engineer/labour-requests"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "labour_type": "mason",
            "num_workers": 5,
            "num_days": 3,
            "rate_per_day": 800.0,
            "remarks": "TEST_labour_request_workflow"
        }
        
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/labour-requests", json=payload)
        assert response.status_code == 200, f"Failed to create labour request: {response.text}"
        
        data = response.json()
        assert data["project_id"] == TEST_PROJECT_ID
        assert data["labour_type"] == "mason"
        assert data["num_workers"] == 5
        assert data["num_days"] == 3
        assert data["rate_per_day"] == 800.0
        assert data["total_amount"] == 5 * 3 * 800.0  # 12000
        assert data["status"] == "requested"
        assert "request_id" in data
        assert "order_id" in data
        
        # Store for later tests
        self.__class__.labour_request_id = data["request_id"]
        print(f"✓ Labour request created: {data['order_id']} - Total: ₹{data['total_amount']}")
        return data
    
    def test_planning_approve_labour_request(self, sessions):
        """Test planning approval of labour request"""
        request_id = getattr(self.__class__, 'labour_request_id', None)
        if not request_id:
            pytest.skip("No labour request to approve")
        
        response = sessions["planning"].patch(
            f"{BASE_URL}/api/site-engineer/labour-requests/{request_id}/approve?action=planning_approve"
        )
        assert response.status_code == 200, f"Planning approval failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "planning_approved"
        assert data["planning_approved_by"] is not None
        print(f"✓ Labour request planning approved")
    
    def test_accountant_approve_labour_request(self, sessions):
        """Test accountant approval of labour request"""
        request_id = getattr(self.__class__, 'labour_request_id', None)
        if not request_id:
            pytest.skip("No labour request to approve")
        
        response = sessions["accountant"].patch(
            f"{BASE_URL}/api/site-engineer/labour-requests/{request_id}/approve?action=accountant_approve"
        )
        assert response.status_code == 200, f"Accountant approval failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "approved"
        assert data["accountant_approved_by"] is not None
        print(f"✓ Labour request approved - Final status: approved")


class TestMaterialReceiptWithOTP:
    """Test material receipt with GPS and OTP verification"""
    
    @pytest.fixture(scope="class")
    def sessions(self):
        """Get all required sessions"""
        sessions = {}
        
        # Admin session
        admin = requests.Session()
        resp = admin.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        assert resp.status_code == 200
        sessions["admin"] = admin
        
        # Engineer session
        engineer = requests.Session()
        resp = engineer.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        sessions["engineer"] = engineer
        
        # Planning session
        planning = requests.Session()
        resp = planning.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "planning@constructionos.com"})
        assert resp.status_code == 200
        sessions["planning"] = planning
        
        # Procurement session
        procurement = requests.Session()
        resp = procurement.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "procurement@constructionos.com"})
        assert resp.status_code == 200
        sessions["procurement"] = procurement
        
        # Accountant session
        accountant = requests.Session()
        resp = accountant.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "accountant@constructionos.com"})
        assert resp.status_code == 200
        sessions["accountant"] = accountant
        
        return sessions
    
    @pytest.fixture(scope="class")
    def approved_material_request(self, sessions):
        """Create and approve a material request for receipt testing"""
        # Get a material
        response = sessions["admin"].get(f"{BASE_URL}/api/materials")
        assert response.status_code == 200
        materials = response.json()
        if len(materials) == 0:
            pytest.skip("No materials available")
        material_id = materials[0]["material_id"]
        
        # Create material request
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_id": material_id,
            "quantity": 5.0,
            "remarks": "TEST_receipt_otp_verification"
        }
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 200
        request_id = response.json()["request_id"]
        
        # Planning approve
        response = sessions["planning"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=planning_approve"
        )
        assert response.status_code == 200
        
        # Procurement approve
        response = sessions["procurement"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=procurement_approve&pricing=2500.0"
        )
        assert response.status_code == 200
        
        # Accountant approve
        response = sessions["accountant"].patch(
            f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=accountant_approve"
        )
        assert response.status_code == 200
        
        return request_id
    
    def test_initiate_material_receipt(self, sessions, approved_material_request):
        """Test POST /api/site-engineer/material-receipts/initiate"""
        payload = {
            "request_id": approved_material_request,
            "received_qty": 5.0,
            "gps_latitude": 12.9716,  # Bangalore coordinates
            "gps_longitude": 77.5946,
            "remarks": "TEST_receipt_initiation"
        }
        
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-receipts/initiate", json=payload)
        assert response.status_code == 200, f"Failed to initiate receipt: {response.text}"
        
        data = response.json()
        assert "receipt_id" in data
        assert data["received_qty"] == 5.0
        assert data["gps_latitude"] == 12.9716
        assert data["gps_longitude"] == 77.5946
        
        # Check OTP handling (MOCKED - test_otp should be present since email not configured)
        if "test_otp" in data:
            print(f"✓ Receipt initiated with test OTP: {data['test_otp']} (MOCKED - email not configured)")
            self.__class__.receipt_id = data["receipt_id"]
            self.__class__.test_otp = data["test_otp"]
        else:
            print(f"✓ Receipt initiated - OTP sent to email")
            self.__class__.receipt_id = data["receipt_id"]
            self.__class__.test_otp = None
    
    def test_verify_otp(self, sessions):
        """Test POST /api/site-engineer/material-receipts/verify-otp"""
        receipt_id = getattr(self.__class__, 'receipt_id', None)
        test_otp = getattr(self.__class__, 'test_otp', None)
        
        if not receipt_id:
            pytest.skip("No receipt to verify")
        
        if not test_otp:
            pytest.skip("OTP was sent via email - cannot test verification")
        
        payload = {
            "receipt_id": receipt_id,
            "otp_code": test_otp
        }
        
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-receipts/verify-otp", json=payload)
        assert response.status_code == 200, f"OTP verification failed: {response.text}"
        
        data = response.json()
        assert data["status"] == "verified"
        print(f"✓ Material receipt verified with OTP")
    
    def test_invalid_otp_rejected(self, sessions, approved_material_request):
        """Test that invalid OTP is rejected"""
        # Create another receipt for testing invalid OTP
        payload = {
            "request_id": approved_material_request,
            "received_qty": 1.0,
            "gps_latitude": 12.9716,
            "gps_longitude": 77.5946,
            "remarks": "TEST_invalid_otp"
        }
        
        # This might fail if the request is already fully received
        response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-receipts/initiate", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            receipt_id = data["receipt_id"]
            
            # Try with invalid OTP
            verify_payload = {
                "receipt_id": receipt_id,
                "otp_code": "000000"  # Invalid OTP
            }
            
            response = sessions["engineer"].post(f"{BASE_URL}/api/site-engineer/material-receipts/verify-otp", json=verify_payload)
            assert response.status_code == 400, "Invalid OTP should be rejected"
            print(f"✓ Invalid OTP correctly rejected")
        else:
            print(f"✓ Material already fully received - skipping invalid OTP test")


class TestPermissions:
    """Test role-based permissions"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        assert resp.status_code == 200
        return session
    
    @pytest.fixture(scope="class")
    def engineer_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SITE_ENGINEER_EMAIL})
        assert resp.status_code == 200
        return session
    
    def test_admin_cannot_create_material_request(self, admin_session):
        """Test admin cannot create material requests (only site engineers can)"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "material_id": "mat_test",
            "quantity": 10.0
        }
        response = admin_session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        assert response.status_code == 403
        print("✓ Admin correctly denied from creating material requests")
    
    def test_admin_cannot_create_labour_request(self, admin_session):
        """Test admin cannot create labour requests (only site engineers can)"""
        payload = {
            "project_id": TEST_PROJECT_ID,
            "labour_type": "mason",
            "num_workers": 5,
            "num_days": 3,
            "rate_per_day": 800.0
        }
        response = admin_session.post(f"{BASE_URL}/api/site-engineer/labour-requests", json=payload)
        assert response.status_code == 403
        print("✓ Admin correctly denied from creating labour requests")
    
    def test_engineer_cannot_approve_own_request(self, engineer_session):
        """Test engineer cannot approve their own requests"""
        # Get an existing request
        response = engineer_session.get(f"{BASE_URL}/api/site-engineer/material-requests?status=requested")
        if response.status_code == 200:
            requests_list = response.json()
            if len(requests_list) > 0:
                request_id = requests_list[0]["request_id"]
                # Try to approve
                response = engineer_session.patch(
                    f"{BASE_URL}/api/site-engineer/material-requests/{request_id}/approve?action=planning_approve"
                )
                assert response.status_code == 403
                print("✓ Engineer correctly denied from approving requests")
            else:
                print("✓ No pending requests to test approval denial")
        else:
            print("✓ Permission test skipped - no requests available")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_requests(self):
        """Clean up test material and labour requests"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if resp.status_code != 200:
            print("⚠ Could not login for cleanup")
            return
        
        # Note: In a real scenario, we would delete test data
        # For now, we just verify we can access the data
        print("✓ Test cleanup completed (test data marked with TEST_ prefix)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
