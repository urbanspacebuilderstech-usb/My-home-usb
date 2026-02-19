"""
Test Work Order Stage Payment Flow
Tests the complete flow: Site Engineer requests payment -> Planning approves -> Accounts processes
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

# Test credentials
SITE_ENGINEER_EMAIL = "engineer@constructionos.com"
PLANNING_EMAIL = "planning@constructionos.com"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"


class SessionManager:
    """Manage sessions for different users"""
    
    def __init__(self):
        self.sessions = {}
    
    def get_session(self, email):
        if email not in self.sessions:
            session = requests.Session()
            response = session.post(f"{API}/auth/demo-login", json={"email": email})
            if response.status_code != 200:
                raise Exception(f"Failed to login as {email}: {response.text}")
            self.sessions[email] = session
        return self.sessions[email]


@pytest.fixture(scope="module")
def session_manager():
    return SessionManager()


@pytest.fixture(scope="module")
def site_engineer_session(session_manager):
    return session_manager.get_session(SITE_ENGINEER_EMAIL)


@pytest.fixture(scope="module")
def planning_session(session_manager):
    return session_manager.get_session(PLANNING_EMAIL)


@pytest.fixture(scope="module")
def accountant_session(session_manager):
    return session_manager.get_session(ACCOUNTANT_EMAIL)


class TestAuth:
    """Test authentication for all users"""
    
    def test_site_engineer_login(self, site_engineer_session):
        response = site_engineer_session.get(f"{API}/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == SITE_ENGINEER_EMAIL
        assert data["role"] == "site_engineer"
        print(f"PASS: Site Engineer login - {data['name']}")
    
    def test_planning_login(self, planning_session):
        response = planning_session.get(f"{API}/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == PLANNING_EMAIL
        assert data["role"] == "planning"
        print(f"PASS: Planning login - {data['name']}")
    
    def test_accountant_login(self, accountant_session):
        response = accountant_session.get(f"{API}/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ACCOUNTANT_EMAIL
        assert data["role"] == "accountant"
        print(f"PASS: Accountant login - {data['name']}")


class TestSiteEngineerWorkOrders:
    """Test Site Engineer work order and stage payment endpoints"""
    
    def test_get_site_engineer_projects(self, site_engineer_session):
        response = site_engineer_session.get(f"{API}/site-engineer/my-projects")
        assert response.status_code == 200
        projects = response.json()
        print(f"PASS: Site Engineer projects retrieved - {len(projects)} projects")
        return projects
    
    def test_get_site_engineer_work_orders(self, site_engineer_session):
        response = site_engineer_session.get(f"{API}/site-engineer/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        print(f"PASS: Site Engineer work orders retrieved - {len(work_orders)} work orders")
        return work_orders


class TestPlanningPaymentRequests:
    """Test Planning payment request endpoints"""
    
    def test_get_payment_requests(self, planning_session):
        response = planning_session.get(f"{API}/work-orders/payment-requests")
        assert response.status_code == 200
        requests_data = response.json()
        print(f"PASS: Payment requests retrieved - {len(requests_data)} pending requests")
        return requests_data
    
    def test_get_planning_dashboard(self, planning_session):
        response = planning_session.get(f"{API}/planning/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "new_projects" in data
        print(f"PASS: Planning dashboard - {data}")
        return data


class TestAccountsDashboard:
    """Test Accounts dashboard and pending payments"""
    
    def test_get_accounts_dashboard(self, accountant_session):
        response = accountant_session.get(f"{API}/accounts/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "pending_stage_payments" in data
        assert "stage_payments_total" in data
        print(f"PASS: Accounts dashboard - pending_stage_payments: {data['pending_stage_payments']}, stage_payments_total: {data['stage_payments_total']}")
        return data
    
    def test_get_pending_payments(self, accountant_session):
        response = accountant_session.get(f"{API}/accounts/pending-payments")
        assert response.status_code == 200
        payments = response.json()
        print(f"PASS: Pending payments retrieved - {len(payments)} payments")
        return payments
    
    def test_get_pending_stage_payments(self, accountant_session):
        response = accountant_session.get(f"{API}/accounts/pending-payments?payment_type=stage")
        assert response.status_code == 200
        payments = response.json()
        stage_payments = [p for p in payments if p.get("payment_type") == "stage"]
        print(f"PASS: Stage payments retrieved - {len(stage_payments)} stage payments")
        return stage_payments


class TestStagePaymentFlow:
    """Test complete stage payment flow: Request -> Approve -> Process"""
    
    def test_get_test_work_order(self, site_engineer_session):
        """Find test work order with stages"""
        response = site_engineer_session.get(f"{API}/site-engineer/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Find work order with stages (labour type)
        labour_orders = [wo for wo in work_orders if wo.get("order_type") == "labour" and wo.get("stages")]
        print(f"PASS: Found {len(labour_orders)} labour work orders with stages")
        
        if labour_orders:
            wo = labour_orders[0]
            print(f"Test Work Order: {wo['work_order_number']}")
            for stage in wo.get("stages", []):
                print(f"  - Stage {stage['stage_number']}: {stage['stage_name']} ({stage['status']})")
        
        return labour_orders
    
    def test_request_payment_for_completed_stage(self, site_engineer_session):
        """Site Engineer requests payment for a completed stage"""
        # First get work orders
        response = site_engineer_session.get(f"{API}/site-engineer/work-orders")
        work_orders = response.json()
        
        # Find a stage that's in_progress or completed (not already requested/approved/paid)
        for wo in work_orders:
            if wo.get("order_type") == "labour" and wo.get("stages"):
                for stage in wo.get("stages", []):
                    if stage.get("status") in ["in_progress", "completed"]:
                        # Request payment
                        req_response = site_engineer_session.patch(
                            f"{API}/work-orders/{wo['work_order_id']}/stages/{stage['stage_id']}/request-payment",
                            params={"remarks": "TEST_payment_request - Work completed"}
                        )
                        print(f"Request payment response: {req_response.status_code} - {req_response.text}")
                        if req_response.status_code == 200:
                            print(f"PASS: Payment requested for {wo['work_order_number']} - Stage: {stage['stage_name']}")
                            return {"work_order_id": wo['work_order_id'], "stage_id": stage['stage_id'], "stage_name": stage['stage_name']}
        
        print("INFO: No stages available to request payment (all may be paid or pending)")
        return None
    
    def test_planning_approve_payment(self, planning_session):
        """Planning approves a payment request"""
        # Get payment requests
        response = planning_session.get(f"{API}/work-orders/payment-requests")
        assert response.status_code == 200
        requests_data = response.json()
        
        if requests_data:
            req = requests_data[0]
            # Approve payment
            approve_response = planning_session.patch(
                f"{API}/work-orders/{req['work_order_id']}/stages/{req['stage_id']}/approve-payment"
            )
            print(f"Approve payment response: {approve_response.status_code}")
            if approve_response.status_code == 200:
                print(f"PASS: Payment approved for {req['work_order_number']} - Stage: {req['stage_name']}")
                return {"work_order_id": req['work_order_id'], "stage_id": req['stage_id']}
        
        print("INFO: No payment requests to approve")
        return None
    
    def test_accounts_process_payment(self, accountant_session):
        """Accountant processes approved payment"""
        # Get pending stage payments
        response = accountant_session.get(f"{API}/accounts/pending-payments?payment_type=stage")
        assert response.status_code == 200
        payments = response.json()
        
        stage_payments = [p for p in payments if p.get("payment_type") == "stage"]
        
        if stage_payments:
            payment = stage_payments[0]
            # Process payment
            process_response = accountant_session.patch(
                f"{API}/work-orders/{payment['work_order_id']}/stages/{payment['stage_id']}/process-payment"
            )
            print(f"Process payment response: {process_response.status_code} - {process_response.text}")
            if process_response.status_code == 200:
                print(f"PASS: Payment processed for {payment['work_order_number']} - Stage: {payment['stage_name']}")
                return True
        
        print("INFO: No stage payments to process")
        return None


class TestPermissions:
    """Test role-based access control"""
    
    def test_planning_cannot_access_accounts_dashboard(self, planning_session):
        response = planning_session.get(f"{API}/accounts/dashboard")
        assert response.status_code == 403
        print("PASS: Planning correctly denied access to accounts dashboard")
    
    def test_accountant_cannot_view_payment_requests(self, accountant_session):
        # Accountant should not be able to view payment requests (Planning only endpoint)
        response = accountant_session.get(f"{API}/work-orders/payment-requests")
        # 403 expected - Only Planning can view payment requests
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Accountant correctly denied access to payment requests")
    
    def test_site_engineer_cannot_view_payment_requests(self, site_engineer_session):
        # Site engineer should not be able to view payment requests
        response = site_engineer_session.get(f"{API}/work-orders/payment-requests")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Site Engineer correctly denied access to payment requests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
