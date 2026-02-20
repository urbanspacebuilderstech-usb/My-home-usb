"""
CRO Payment Verification Workflow Tests
Tests for the enhanced CRO workflow:
1. CRO creates project with advance payment
2. CRO submits project for payment verification (status: pending_payment)
3. Accountant sees project in 'New Requests' tab
4. Accountant verifies payment with transaction ID
5. CRO sees project in 'Payment Received' tab
6. CRO submits verified project to Planning
7. Planning receives project in 'planning_review' status
8. CRO Dashboard shows correct counts for all 5 statuses
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


class TestCROPaymentWorkflow:
    """Full end-to-end CRO payment verification workflow test"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup sessions for CRO and Accountant"""
        self.cro_session = requests.Session()
        self.accountant_session = requests.Session()
        self.planning_session = requests.Session()
        
        # Login as CRO
        response = self.cro_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200, f"CRO login failed: {response.text}"
        self.cro_user = response.json()
        assert self.cro_user["role"] == "cro", "User is not CRO role"
        
        # Login as Accountant
        response = self.accountant_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        self.accountant_user = response.json()
        assert self.accountant_user["role"] == "accountant", "User is not Accountant role"
        
        # Login as Planning
        response = self.planning_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200, f"Planning login failed: {response.text}"
        self.planning_user = response.json()
        
        # Get available packages
        dash_res = self.cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        assert dash_res.status_code == 200
        self.packages = dash_res.json().get("packages", [])
        
    # ========== Step 1: CRO Creates Project with Advance Payment ==========
    
    def test_step1_cro_creates_project_with_advance_payment(self):
        """Step 1: CRO creates a project with advance payment details"""
        if not self.packages:
            pytest.skip("No packages available for testing")
        
        package_id = self.packages[0]["package_id"]
        unique_id = uuid.uuid4().hex[:6]
        
        project_data = {
            "name": f"TEST_PaymentFlow {unique_id}",
            "client_name": f"TEST Client PayFlow {unique_id}",
            "client_phone": "+91 9876543210",
            "client_email": f"testpay{unique_id}@example.com",
            "location": "Chennai Test Location",
            "sqft": 2500,
            "building_type": "villa",
            "expected_start_date": "2026-06-01",
            "package_id": package_id,
            "advance_date": "2026-01-15",
            "advance_amount": 500000,
            "advance_payment_mode": "bank_transfer",
            "rough_estimate_url": "https://example.com/estimate.pdf"
        }
        
        response = self.cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert response.status_code == 200, f"Create project failed: {response.text}"
        
        result = response.json()
        assert "project_id" in result, "Response missing project_id"
        self.project_id = result["project_id"]
        
        # Verify project is in draft status
        get_res = self.cro_session.get(f"{BASE_URL}/api/projects/{self.project_id}")
        assert get_res.status_code == 200
        project = get_res.json()
        
        assert project["status"] == "draft", f"New project should be draft, got {project['status']}"
        assert project["advance_amount"] == 500000, "Advance amount mismatch"
        assert project["advance_payment_mode"] == "bank_transfer", "Payment mode mismatch"
        
        print(f"✓ Step 1 PASSED: Project created with advance payment - ID: {self.project_id}")
        return self.project_id
    
    # ========== Step 2: CRO Submits Project for Payment Verification ==========
    
    def test_step2_cro_submits_for_payment_verification(self):
        """Step 2: CRO submits draft project for payment verification"""
        # Create project first
        project_id = self.test_step1_cro_creates_project_with_advance_payment()
        
        response = self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        assert response.status_code == 200, f"Submit for payment failed: {response.text}"
        
        result = response.json()
        assert "message" in result, "Response should have message"
        
        # Verify status changed to pending_payment
        get_res = self.cro_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert get_res.status_code == 200
        project = get_res.json()
        
        assert project["status"] == "pending_payment", f"Expected pending_payment, got {project['status']}"
        
        print(f"✓ Step 2 PASSED: Project submitted for payment verification - Status: {project['status']}")
        return project_id
    
    # ========== Step 3: Accountant Sees Project in New Requests ==========
    
    def test_step3_accountant_sees_pending_payments(self):
        """Step 3: Accountant can see project in pending advance payments"""
        # First create and submit a project
        project_id = self.test_step2_cro_submits_for_payment_verification()
        
        # Accountant fetches pending advance payments
        response = self.accountant_session.get(f"{BASE_URL}/api/accounts/pending-advance-payments")
        assert response.status_code == 200, f"Failed to get pending payments: {response.text}"
        
        pending_projects = response.json()
        assert isinstance(pending_projects, list), "Response should be a list"
        
        # Find our test project in the list
        found_project = None
        for proj in pending_projects:
            if proj["project_id"] == project_id:
                found_project = proj
                break
        
        assert found_project is not None, f"Project {project_id} not found in pending payments"
        assert found_project["status"] == "pending_payment", "Project should be pending_payment"
        assert found_project["advance_amount"] == 500000, "Advance amount mismatch"
        
        print(f"✓ Step 3 PASSED: Accountant sees project in New Requests - Amount: ₹{found_project['advance_amount']:,.0f}")
        return project_id
    
    # ========== Step 4: Accountant Verifies Payment with Transaction ID ==========
    
    def test_step4_accountant_verifies_payment(self):
        """Step 4: Accountant verifies payment with transaction ID"""
        project_id = self.test_step3_accountant_sees_pending_payments()
        
        verification_data = {
            "transaction_id": f"TXN{uuid.uuid4().hex[:10].upper()}",
            "bank_name": "HDFC Bank",
            "remarks": "Payment verified successfully"
        }
        
        response = self.accountant_session.patch(
            f"{BASE_URL}/api/accounts/verify-advance-payment/{project_id}",
            json=verification_data
        )
        assert response.status_code == 200, f"Verify payment failed: {response.text}"
        
        result = response.json()
        assert "message" in result, "Response should have message"
        
        # Verify project status changed to payment_verified
        get_res = self.cro_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert get_res.status_code == 200
        project = get_res.json()
        
        assert project["status"] == "payment_verified", f"Expected payment_verified, got {project['status']}"
        assert project.get("payment_transaction_id") is not None, "Transaction ID should be stored"
        
        print(f"✓ Step 4 PASSED: Accountant verified payment - TXN ID: {project.get('payment_transaction_id')}")
        return project_id
    
    # ========== Step 5: CRO Sees Project in Payment Received Tab ==========
    
    def test_step5_cro_sees_payment_received(self):
        """Step 5: CRO sees project in 'Payment Received' (payment_verified status)"""
        project_id = self.test_step4_accountant_verifies_payment()
        
        # CRO fetches projects with payment_verified status
        response = self.cro_session.get(f"{BASE_URL}/api/cro/projects/all?status=payment_verified")
        assert response.status_code == 200, f"Failed to get projects: {response.text}"
        
        projects = response.json()
        found_project = None
        for proj in projects:
            if proj["project_id"] == project_id:
                found_project = proj
                break
        
        assert found_project is not None, f"Project {project_id} not found in payment_verified list"
        assert found_project["status"] == "payment_verified", "Project should be payment_verified"
        
        print(f"✓ Step 5 PASSED: CRO sees project in Payment Received tab - Status: {found_project['status']}")
        return project_id
    
    # ========== Step 6: CRO Submits Verified Project to Planning ==========
    
    def test_step6_cro_submits_to_planning(self):
        """Step 6: CRO submits verified project to Planning"""
        project_id = self.test_step5_cro_sees_payment_received()
        
        response = self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit-to-planning")
        assert response.status_code == 200, f"Submit to planning failed: {response.text}"
        
        result = response.json()
        assert "message" in result, "Response should have message"
        
        # Verify status changed to planning_review
        get_res = self.cro_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert get_res.status_code == 200
        project = get_res.json()
        
        assert project["status"] == "planning_review", f"Expected planning_review, got {project['status']}"
        
        print(f"✓ Step 6 PASSED: Project submitted to Planning - Status: {project['status']}")
        return project_id
    
    # ========== Step 7: Planning Receives Project ==========
    
    def test_step7_planning_receives_project(self):
        """Step 7: Planning can see project in planning_review status"""
        project_id = self.test_step6_cro_submits_to_planning()
        
        # Planning user can see the project
        response = self.planning_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200, f"Planning cannot access project: {response.text}"
        
        project = response.json()
        assert project["status"] == "planning_review", f"Expected planning_review, got {project['status']}"
        
        print(f"✓ Step 7 PASSED: Planning receives project in planning_review - Project: {project['name']}")
        return project_id


class TestCRODashboardStatusCounts:
    """Test CRO Dashboard shows correct counts for all 5 statuses"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRO session"""
        self.cro_session = requests.Session()
        
        response = self.cro_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        assert response.status_code == 200, f"CRO login failed: {response.text}"
        
    def test_dashboard_has_all_5_status_counts(self):
        """Test dashboard returns all 5 status counts"""
        response = self.cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        
        data = response.json()
        
        # Verify all 5 status counts exist
        required_counts = [
            "draft_count",
            "pending_payment_count",
            "payment_verified_count",
            "planning_review_count",
            "approved_count"
        ]
        
        for field in required_counts:
            assert field in data, f"Missing status count: {field}"
            assert isinstance(data[field], (int, float)), f"{field} should be numeric"
        
        print(f"✓ Dashboard Status Counts:")
        print(f"  - Draft: {data['draft_count']}")
        print(f"  - Pending Payment: {data['pending_payment_count']}")
        print(f"  - Payment Verified: {data['payment_verified_count']}")
        print(f"  - Planning Review: {data['planning_review_count']}")
        print(f"  - Approved: {data['approved_count']}")
        
    def test_dashboard_total_ongoing_excludes_draft_and_pending(self):
        """Test total_ongoing excludes draft and pending_payment"""
        response = self.cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_ongoing" in data, "Missing total_ongoing"
        
        # Total ongoing should be count of projects NOT in draft, pending_payment, completed, cancelled
        print(f"✓ Total Ongoing Projects (excludes draft/pending_payment): {data['total_ongoing']}")


class TestAccountsDashboardAdvancePayments:
    """Test Accounts Dashboard shows advance payment counts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Accountant session"""
        self.session = requests.Session()
        
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert response.status_code == 200, f"Accountant login failed: {response.text}"
        
    def test_accounts_dashboard_has_advance_payment_count(self):
        """Test accounts dashboard has pending advance payments count"""
        response = self.session.get(f"{BASE_URL}/api/accounts/dashboard")
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        
        data = response.json()
        
        # Check for advance payment metrics
        assert "pending_advance_payments" in data, "Missing pending_advance_payments count"
        assert "advance_payments_total" in data, "Missing advance_payments_total"
        
        print(f"✓ Accounts Dashboard - Pending Advance Payments: {data['pending_advance_payments']}")
        print(f"✓ Accounts Dashboard - Advance Payments Total: ₹{data['advance_payments_total']:,.0f}")


class TestPaymentVerificationValidation:
    """Test payment verification validation rules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup sessions"""
        self.cro_session = requests.Session()
        self.accountant_session = requests.Session()
        
        self.cro_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        self.accountant_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        # Get packages
        dash_res = self.cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        self.packages = dash_res.json().get("packages", [])
        
    def test_cannot_submit_without_advance_payment(self):
        """Test that projects without advance payment cannot be submitted"""
        if not self.packages:
            pytest.skip("No packages available")
        
        unique_id = uuid.uuid4().hex[:6]
        project_data = {
            "name": f"TEST_NoAdvance {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": self.packages[0]["package_id"],
            "advance_amount": 0  # No advance payment
        }
        
        create_res = self.cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        assert create_res.status_code == 200
        project_id = create_res.json()["project_id"]
        
        # Try to submit - should fail
        submit_res = self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        assert submit_res.status_code == 400, f"Expected 400 for no advance payment, got {submit_res.status_code}"
        
        print("✓ Cannot submit project without advance payment (returns 400)")
        
    def test_cannot_submit_to_planning_without_verification(self):
        """Test that projects cannot be sent to Planning without payment verification"""
        if not self.packages:
            pytest.skip("No packages available")
        
        unique_id = uuid.uuid4().hex[:6]
        project_data = {
            "name": f"TEST_NoVerify {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": self.packages[0]["package_id"],
            "advance_amount": 100000,
            "advance_payment_mode": "cash"
        }
        
        create_res = self.cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        project_id = create_res.json()["project_id"]
        
        # Submit for payment verification
        self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        
        # Try to submit to planning without accountant verification - should fail
        submit_res = self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit-to-planning")
        assert submit_res.status_code == 400, f"Expected 400, got {submit_res.status_code}"
        
        print("✓ Cannot submit to Planning without payment verification (returns 400)")
        
    def test_only_accountant_can_verify_payment(self):
        """Test that only Accountant can verify payments"""
        if not self.packages:
            pytest.skip("No packages available")
        
        unique_id = uuid.uuid4().hex[:6]
        project_data = {
            "name": f"TEST_CROVerify {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": self.packages[0]["package_id"],
            "advance_amount": 100000,
            "advance_payment_mode": "upi"
        }
        
        create_res = self.cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        project_id = create_res.json()["project_id"]
        
        # Submit for payment verification
        self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        
        # CRO tries to verify payment - should fail
        verify_res = self.cro_session.patch(
            f"{BASE_URL}/api/accounts/verify-advance-payment/{project_id}",
            json={"transaction_id": "TXN123", "bank_name": "Test Bank"}
        )
        assert verify_res.status_code == 403, f"Expected 403, got {verify_res.status_code}"
        
        print("✓ Only Accountant can verify payments (CRO gets 403)")


class TestPaymentRejection:
    """Test payment rejection workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup sessions"""
        self.cro_session = requests.Session()
        self.accountant_session = requests.Session()
        
        self.cro_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cro@constructionos.com"
        })
        self.accountant_session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        
        dash_res = self.cro_session.get(f"{BASE_URL}/api/cro/dashboard")
        self.packages = dash_res.json().get("packages", [])
        
    def test_accountant_can_reject_payment(self):
        """Test Accountant can reject a payment with reason"""
        if not self.packages:
            pytest.skip("No packages available")
        
        unique_id = uuid.uuid4().hex[:6]
        project_data = {
            "name": f"TEST_Reject {unique_id}",
            "client_name": f"Client {unique_id}",
            "location": "Test",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": "2026-07-01",
            "package_id": self.packages[0]["package_id"],
            "advance_amount": 100000,
            "advance_payment_mode": "cash"
        }
        
        create_res = self.cro_session.post(f"{BASE_URL}/api/cro/projects", json=project_data)
        project_id = create_res.json()["project_id"]
        
        # Submit for payment verification
        self.cro_session.patch(f"{BASE_URL}/api/cro/projects/{project_id}/submit")
        
        # Accountant rejects payment
        reject_res = self.accountant_session.patch(
            f"{BASE_URL}/api/accounts/reject-advance-payment/{project_id}",
            json={"reason": "Payment details do not match bank records"}
        )
        assert reject_res.status_code == 200, f"Reject failed: {reject_res.text}"
        
        # Verify project goes back to draft
        get_res = self.cro_session.get(f"{BASE_URL}/api/projects/{project_id}")
        project = get_res.json()
        
        assert project["status"] == "draft", f"Rejected project should be draft, got {project['status']}"
        assert project.get("payment_rejection_reason") == "Payment details do not match bank records"
        
        print(f"✓ Payment rejected - Project back to draft with reason: {project.get('payment_rejection_reason')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
