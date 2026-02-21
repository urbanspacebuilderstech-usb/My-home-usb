"""
Test Financial Control Structure:
- Indirect Cost Management (Accountant creates → Super Admin approves → Accountant confirms → Entry locked)
- Suspense Account Management (Accountant creates → Super Admin allocates/rejects)
- Financial Audit Logs (All actions are logged)
- Role-based access control
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ACCOUNTANT_EMAIL = "accountant@constructionos.com"
SUPER_ADMIN_EMAIL = "admin@constructionos.com"

class TestFinancialControlSetup:
    """Setup and verify authentication for financial control tests"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        """Get accountant session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip(f"Accountant login failed: {response.text}")
        return session
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        """Get super admin session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip(f"Super Admin login failed: {response.text}")
        return session
    
    def test_accountant_login(self, accountant_session):
        """Test accountant can login"""
        response = accountant_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "accountant"
        print(f"✓ Accountant logged in: {data['name']}")
    
    def test_admin_login(self, admin_session):
        """Test super admin can login"""
        response = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "super_admin"
        print(f"✓ Super Admin logged in: {data['name']}")


class TestIndirectCostCategories:
    """Test indirect cost categories API"""
    
    @pytest.fixture(scope="class")
    def session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Login failed")
        return session
    
    def test_get_indirect_cost_categories(self, session):
        """Test getting indirect cost categories"""
        response = session.get(f"{BASE_URL}/api/financial/indirect-cost-categories")
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        assert len(categories) > 0
        # Verify categories have required structure
        for cat in categories:
            assert "value" in cat
            assert "label" in cat
        print(f"✓ Found {len(categories)} indirect cost categories")


class TestIndirectCostManagement:
    """Test Indirect Cost CRUD and Workflow"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Accountant login failed")
        return session
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_01_get_indirect_costs(self, accountant_session):
        """Test getting indirect costs list"""
        response = accountant_session.get(f"{BASE_URL}/api/financial/indirect-costs")
        assert response.status_code == 200
        costs = response.json()
        assert isinstance(costs, list)
        print(f"✓ Retrieved {len(costs)} indirect cost entries")
    
    def test_02_create_indirect_cost_accountant_only(self, accountant_session, admin_session):
        """Test only Accountant can create indirect costs"""
        payload = {
            "category": "utilities",
            "description": "TEST_Monthly electricity bill January 2026",
            "amount": 15000,
            "payment_method": "bank_transfer",
            "vendor_name": "TEST_BESCOM",
            "invoice_number": f"TEST_INV_{datetime.now().strftime('%H%M%S')}",
            "remarks": "Test entry - can be deleted"
        }
        
        # Accountant should be able to create
        response = accountant_session.post(f"{BASE_URL}/api/financial/indirect-costs", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "indirect_cost_id" in data
        print(f"✓ Accountant created indirect cost: {data['indirect_cost_id']}")
        
        # Store for later tests
        TestIndirectCostManagement.created_cost_id = data["indirect_cost_id"]
    
    def test_03_admin_cannot_create_indirect_cost(self, admin_session):
        """Test Super Admin cannot create indirect costs (role restriction)"""
        payload = {
            "category": "utilities",
            "description": "TEST_Admin trying to create",
            "amount": 5000,
            "payment_method": "cash"
        }
        response = admin_session.post(f"{BASE_URL}/api/financial/indirect-costs", json=payload)
        assert response.status_code == 403
        print("✓ Super Admin correctly blocked from creating indirect costs")
    
    def test_04_verify_created_cost_status_pending(self, accountant_session):
        """Verify newly created cost is in pending status"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/indirect-costs")
        assert response.status_code == 200
        costs = response.json()
        
        created_cost = next((c for c in costs if c["indirect_cost_id"] == cost_id), None)
        assert created_cost is not None, "Created cost not found"
        assert created_cost["status"] == "pending"
        print(f"✓ Indirect cost status is 'pending' as expected")
    
    def test_05_accountant_cannot_approve(self, accountant_session):
        """Test Accountant cannot approve indirect costs"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.patch(
            f"{BASE_URL}/api/financial/indirect-costs/{cost_id}/approve",
            json={"approved": True}
        )
        assert response.status_code == 403
        print("✓ Accountant correctly blocked from approving indirect costs")
    
    def test_06_admin_approve_indirect_cost(self, admin_session):
        """Test Super Admin can approve indirect cost"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = admin_session.patch(
            f"{BASE_URL}/api/financial/indirect-costs/{cost_id}/approve",
            json={"approved": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert "approved" in data.get("message", "").lower() or data.get("status") == "approved"
        print(f"✓ Super Admin approved indirect cost")
    
    def test_07_verify_approved_status(self, accountant_session):
        """Verify cost is now approved"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/indirect-costs?status=approved")
        assert response.status_code == 200
        costs = response.json()
        
        approved_cost = next((c for c in costs if c["indirect_cost_id"] == cost_id), None)
        assert approved_cost is not None, "Approved cost not found"
        assert approved_cost["status"] == "approved"
        assert approved_cost.get("approved_by") is not None
        print(f"✓ Indirect cost status is 'approved', approved by: {approved_cost.get('approved_by_name')}")
    
    def test_08_accountant_confirm_payment(self, accountant_session):
        """Test Accountant can confirm payment of approved cost"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.patch(
            f"{BASE_URL}/api/financial/indirect-costs/{cost_id}/confirm",
            json={
                "payment_date": datetime.now().isoformat(),
                "reference_number": f"TEST_TXN_{datetime.now().strftime('%H%M%S')}",
                "remarks": "Payment confirmed for test"
            }
        )
        assert response.status_code == 200
        print(f"✓ Accountant confirmed payment")
    
    def test_09_verify_confirmed_and_locked(self, accountant_session):
        """Verify cost is confirmed and locked"""
        cost_id = getattr(TestIndirectCostManagement, 'created_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/indirect-costs?status=confirmed")
        assert response.status_code == 200
        costs = response.json()
        
        confirmed_cost = next((c for c in costs if c["indirect_cost_id"] == cost_id), None)
        assert confirmed_cost is not None, "Confirmed cost not found"
        assert confirmed_cost["status"] == "confirmed"
        assert confirmed_cost.get("is_locked") == True
        print(f"✓ Indirect cost is confirmed and locked")


class TestIndirectCostRejection:
    """Test Indirect Cost Rejection Flow"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Accountant login failed")
        return session
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_01_create_cost_for_rejection(self, accountant_session):
        """Create an indirect cost to be rejected"""
        payload = {
            "category": "other",
            "description": "TEST_Invalid expense - should be rejected",
            "amount": 99999,
            "payment_method": "cash",
            "remarks": "Test rejection flow"
        }
        
        response = accountant_session.post(f"{BASE_URL}/api/financial/indirect-costs", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestIndirectCostRejection.reject_cost_id = data["indirect_cost_id"]
        print(f"✓ Created cost for rejection: {data['indirect_cost_id']}")
    
    def test_02_admin_reject_with_reason(self, admin_session):
        """Test Super Admin can reject with reason"""
        cost_id = getattr(TestIndirectCostRejection, 'reject_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = admin_session.patch(
            f"{BASE_URL}/api/financial/indirect-costs/{cost_id}/approve",
            json={
                "approved": False,
                "rejection_reason": "Invalid expense - not authorized"
            }
        )
        assert response.status_code == 200
        print(f"✓ Super Admin rejected indirect cost with reason")
    
    def test_03_verify_rejected_status(self, accountant_session):
        """Verify cost is rejected with reason"""
        cost_id = getattr(TestIndirectCostRejection, 'reject_cost_id', None)
        if not cost_id:
            pytest.skip("No cost ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/indirect-costs?status=rejected")
        assert response.status_code == 200
        costs = response.json()
        
        rejected_cost = next((c for c in costs if c["indirect_cost_id"] == cost_id), None)
        assert rejected_cost is not None, "Rejected cost not found"
        assert rejected_cost["status"] == "rejected"
        assert rejected_cost.get("rejection_reason") is not None
        print(f"✓ Indirect cost rejected with reason: {rejected_cost.get('rejection_reason')}")


class TestSuspenseAccount:
    """Test Suspense Account CRUD and Workflow"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Accountant login failed")
        return session
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_01_get_suspense_entries(self, accountant_session):
        """Test getting suspense entries list"""
        response = accountant_session.get(f"{BASE_URL}/api/financial/suspense")
        assert response.status_code == 200
        entries = response.json()
        assert isinstance(entries, list)
        print(f"✓ Retrieved {len(entries)} suspense entries")
    
    def test_02_create_suspense_entry_accountant(self, accountant_session):
        """Test Accountant can create suspense entry"""
        payload = {
            "amount": 25000,
            "transaction_type": "income",
            "description": "TEST_Unknown bank deposit - needs identification",
            "source": "Unknown sender - bank deposit",
            "reference_number": f"TEST_REF_{datetime.now().strftime('%H%M%S')}",
            "payment_method": "bank_transfer",
            "remarks": "Test suspense entry"
        }
        
        response = accountant_session.post(f"{BASE_URL}/api/financial/suspense", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "suspense_id" in data
        TestSuspenseAccount.created_suspense_id = data["suspense_id"]
        print(f"✓ Created suspense entry: {data['suspense_id']}")
    
    def test_03_admin_cannot_create_suspense(self, admin_session):
        """Test Super Admin cannot create suspense entries"""
        payload = {
            "amount": 5000,
            "transaction_type": "expense",
            "description": "TEST_Admin trying to create",
        }
        response = admin_session.post(f"{BASE_URL}/api/financial/suspense", json=payload)
        assert response.status_code == 403
        print("✓ Super Admin correctly blocked from creating suspense entries")
    
    def test_04_verify_pending_status(self, accountant_session):
        """Verify suspense entry is pending"""
        suspense_id = getattr(TestSuspenseAccount, 'created_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/suspense?status=pending")
        assert response.status_code == 200
        entries = response.json()
        
        entry = next((e for e in entries if e["suspense_id"] == suspense_id), None)
        assert entry is not None, "Suspense entry not found"
        assert entry["status"] == "pending"
        print(f"✓ Suspense entry is 'pending' as expected")
    
    def test_05_accountant_cannot_allocate(self, accountant_session):
        """Test Accountant cannot allocate suspense entries"""
        suspense_id = getattr(TestSuspenseAccount, 'created_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = accountant_session.patch(
            f"{BASE_URL}/api/financial/suspense/{suspense_id}/allocate",
            json={
                "approved": True,
                "allocated_to": "indirect_cost",
                "allocation_reason": "Test allocation"
            }
        )
        assert response.status_code == 403
        print("✓ Accountant correctly blocked from allocating suspense entries")
    
    def test_06_admin_allocate_to_indirect(self, admin_session):
        """Test Super Admin can allocate suspense to indirect cost"""
        suspense_id = getattr(TestSuspenseAccount, 'created_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = admin_session.patch(
            f"{BASE_URL}/api/financial/suspense/{suspense_id}/allocate",
            json={
                "approved": True,
                "allocated_to": "indirect_cost",
                "allocation_category": "miscellaneous",
                "allocation_reason": "Identified as miscellaneous overhead"
            }
        )
        assert response.status_code == 200
        print(f"✓ Super Admin allocated suspense entry to indirect cost")
    
    def test_07_verify_allocated_status(self, accountant_session):
        """Verify entry is allocated and locked"""
        suspense_id = getattr(TestSuspenseAccount, 'created_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/suspense?status=allocated")
        assert response.status_code == 200
        entries = response.json()
        
        entry = next((e for e in entries if e["suspense_id"] == suspense_id), None)
        assert entry is not None, "Allocated entry not found"
        assert entry["status"] == "allocated"
        assert entry["allocated_to"] == "indirect_cost"
        assert entry.get("is_locked") == True
        print(f"✓ Suspense entry is allocated and locked")


class TestSuspenseRejection:
    """Test Suspense Entry Rejection Flow"""
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Accountant login failed")
        return session
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_01_create_suspense_for_rejection(self, accountant_session):
        """Create suspense entry for rejection"""
        payload = {
            "amount": 1000,
            "transaction_type": "expense",
            "description": "TEST_Suspicious transaction - should be rejected",
            "remarks": "Test rejection flow"
        }
        
        response = accountant_session.post(f"{BASE_URL}/api/financial/suspense", json=payload)
        assert response.status_code == 200
        data = response.json()
        TestSuspenseRejection.reject_suspense_id = data["suspense_id"]
        print(f"✓ Created suspense for rejection: {data['suspense_id']}")
    
    def test_02_admin_reject_suspense(self, admin_session):
        """Test Super Admin can reject suspense entry"""
        suspense_id = getattr(TestSuspenseRejection, 'reject_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = admin_session.patch(
            f"{BASE_URL}/api/financial/suspense/{suspense_id}/allocate",
            json={
                "approved": False,
                "rejection_reason": "Invalid transaction - cannot be verified"
            }
        )
        assert response.status_code == 200
        print(f"✓ Super Admin rejected suspense entry")
    
    def test_03_verify_rejected_status(self, accountant_session):
        """Verify entry is rejected"""
        suspense_id = getattr(TestSuspenseRejection, 'reject_suspense_id', None)
        if not suspense_id:
            pytest.skip("No suspense ID from previous test")
        
        response = accountant_session.get(f"{BASE_URL}/api/financial/suspense?status=rejected")
        assert response.status_code == 200
        entries = response.json()
        
        entry = next((e for e in entries if e["suspense_id"] == suspense_id), None)
        assert entry is not None, "Rejected entry not found"
        assert entry["status"] == "rejected"
        assert entry.get("rejection_reason") is not None
        print(f"✓ Suspense entry rejected with reason: {entry.get('rejection_reason')}")


class TestFinancialAuditLogs:
    """Test Financial Audit Logs"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        if response.status_code != 200:
            pytest.skip("Accountant login failed")
        return session
    
    def test_01_admin_can_view_audit_logs(self, admin_session):
        """Test Super Admin can view audit logs"""
        response = admin_session.get(f"{BASE_URL}/api/financial/audit-logs")
        assert response.status_code == 200
        logs = response.json()
        assert isinstance(logs, list)
        print(f"✓ Super Admin can view {len(logs)} audit logs")
    
    def test_02_accountant_cannot_view_audit_logs(self, accountant_session):
        """Test Accountant cannot view audit logs"""
        response = accountant_session.get(f"{BASE_URL}/api/financial/audit-logs")
        assert response.status_code == 403
        print("✓ Accountant correctly blocked from viewing audit logs")
    
    def test_03_verify_audit_log_content(self, admin_session):
        """Verify audit logs contain expected actions"""
        response = admin_session.get(f"{BASE_URL}/api/financial/audit-logs?entity_type=indirect_cost")
        assert response.status_code == 200
        logs = response.json()
        
        if len(logs) > 0:
            # Check logs have required fields
            log = logs[0]
            assert "entity_type" in log
            assert "entity_id" in log
            assert "action" in log
            assert "performed_by" in log
            assert "performed_at" in log
            print(f"✓ Audit logs contain proper structure: {log.get('action')} - {log.get('description', '')[:50]}")
        else:
            print("✓ No indirect_cost audit logs found (test data may have been cleared)")


class TestFinancialControlDashboard:
    """Test Financial Control Dashboard"""
    
    @pytest.fixture(scope="class")
    def admin_session(self):
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SUPER_ADMIN_EMAIL})
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return session
    
    def test_get_financial_control_dashboard(self, admin_session):
        """Test getting financial control dashboard"""
        response = admin_session.get(f"{BASE_URL}/api/financial/control-dashboard")
        assert response.status_code == 200
        data = response.json()
        # Dashboard should have summary data
        print(f"✓ Financial Control Dashboard retrieved successfully")
        print(f"  - Pending Indirect Costs: {data.get('pending_indirect_costs', 0)}")
        print(f"  - Pending Suspense: {data.get('pending_suspense', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
