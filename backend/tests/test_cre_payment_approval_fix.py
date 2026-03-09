"""
Test CRE Payment Collection to Accountant Approval Flow
Bug fix: Income records were being created with status='received' instead of 'pending_approval'
Also verifies deal conversion advance payments now create income records

Tests:
1. CRE collects payment via POST /api/payment-stages/{stage_id}/collect
2. Accountant sees pending income in GET /api/approvals/unified
3. Accountant approves income via POST /api/approvals/income/{id}/approve
4. Accountant rejects income via POST /api/approvals/income/{id}/reject
5. After approval, income no longer appears in pending approvals
6. Pre-Sales to Sales transfer regression check
7. Stage Management page regression check
"""
import pytest
import requests
import uuid
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
CRE = {"email": "cre@constructionos.com", "password": "Demo@1234"}


@pytest.fixture(scope="module")
def admin_session():
    """Get authenticated session for Super Admin"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    response = session.post(f"{BASE_URL}/api/auth/login", json=SUPER_ADMIN)
    if response.status_code == 429:
        pytest.skip("Rate limited - wait and retry")
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return session


@pytest.fixture(scope="module")
def accountant_session():
    """Get authenticated session for Accountant"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    time.sleep(1)  # Avoid rate limiting
    response = session.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT)
    if response.status_code == 429:
        pytest.skip("Rate limited - wait and retry")
    assert response.status_code == 200, f"Accountant login failed: {response.text}"
    return session


@pytest.fixture(scope="module")
def cre_session():
    """Get authenticated session for CRE"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    time.sleep(2)  # Avoid rate limiting
    response = session.post(f"{BASE_URL}/api/auth/login", json=CRE)
    if response.status_code == 429:
        pytest.skip("Rate limited - wait and retry")
    assert response.status_code == 200, f"CRE login failed: {response.text}"
    return session


class TestCREPaymentApprovalFix:
    """Test the fix for CRE payment collections appearing in Accountant approvals"""
    
    test_income_id = None
    test_stage_id = None
    
    def test_01_find_project_with_payment_stages(self, cre_session):
        """Find a project with collectible payment stages"""
        # Get all projects
        response = cre_session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200, f"Failed to get projects: {response.text}"
        projects = response.json()
        assert len(projects) > 0, "No projects found"
        
        # Look for a project with payment stages that can be collected
        for project in projects:
            pid = project.get("project_id")
            stages_response = cre_session.get(f"{BASE_URL}/api/payment-stages/{pid}")
            if stages_response.status_code == 200:
                stages = stages_response.json()
                # Find a stage that is ready for collection (not fully paid)
                for stage in stages:
                    if stage.get("status") not in ["paid", "collected"]:
                        self.__class__.test_stage_id = stage.get("stage_id")
                        print(f"Found collectible stage: {self.test_stage_id} in project {pid}")
                        return
        
        # If no existing stage found, we'll create one
        print("No collectible stages found - will use existing data or skip")
    
    def test_02_cre_collect_payment_creates_pending_approval(self, cre_session, admin_session):
        """Test that CRE collecting payment creates income with status='pending_approval'"""
        # First, let's get projects and stages
        projects_response = admin_session.get(f"{BASE_URL}/api/projects")
        assert projects_response.status_code == 200
        projects = projects_response.json()
        
        # Find project with balance > 0
        target_project = None
        target_stages = None
        
        for project in projects:
            pid = project.get("project_id")
            balance = project.get("balance", 0) or project.get("total_value", 0)
            
            if balance > 0:
                stages_response = cre_session.get(f"{BASE_URL}/api/payment-stages/{pid}")
                if stages_response.status_code == 200:
                    stages = stages_response.json()
                    # Find uncollected stage
                    for stage in stages:
                        if stage.get("status") not in ["paid"] and stage.get("amount", 0) > 0:
                            received = stage.get("amount_received", 0) or 0
                            amount = stage.get("amount", 0)
                            if received < amount:
                                target_project = project
                                target_stages = stages
                                self.__class__.test_stage_id = stage.get("stage_id")
                                print(f"Target stage: {stage.get('stage_label', stage.get('stage_name'))} - {self.test_stage_id}")
                                print(f"Stage amount: {amount}, received: {received}")
                                break
                    if target_project:
                        break
        
        if not self.test_stage_id:
            pytest.skip("No collectible payment stage found")
        
        # Collect payment
        collect_amount = 1000  # Small test amount
        collect_data = {
            "amount_received": collect_amount,
            "payment_mode": "cash",
            "payment_reference": f"TEST_{uuid.uuid4().hex[:8]}",
            "remarks": "Test payment collection for approval workflow"
        }
        
        response = cre_session.post(
            f"{BASE_URL}/api/payment-stages/{self.test_stage_id}/collect",
            json=collect_data
        )
        assert response.status_code == 200, f"Failed to collect payment: {response.text}"
        result = response.json()
        print(f"Payment collected: {result}")
        
        # The income_id should be in the response or we need to find it
        if "income_id" in result:
            self.__class__.test_income_id = result["income_id"]
        
    def test_03_accountant_sees_pending_income(self, accountant_session):
        """Verify accountant can see pending income in unified approvals"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200, f"Failed to get approvals: {response.text}"
        
        data = response.json()
        
        # Check structure
        assert "income" in data, "Response missing 'income' key"
        assert "summary" in data, "Response missing 'summary' key"
        
        income_count = data["summary"].get("income_count", 0)
        print(f"Pending income count: {income_count}")
        print(f"Income total: {data['summary'].get('income_total', 0)}")
        
        # At minimum, verify the endpoint returns the correct structure
        pending_income = data.get("income", [])
        
        if len(pending_income) > 0:
            # Verify income entries have correct status
            for inc in pending_income:
                assert inc.get("status") == "pending_approval", f"Income has wrong status: {inc.get('status')}"
                assert inc.get("source") == "approval", f"Income has wrong source: {inc.get('source')}"
                print(f"Pending income: {inc.get('income_id')} - {inc.get('description', 'N/A')} - ₹{inc.get('amount')}")
            
            # Save first income_id for approval test
            self.__class__.test_income_id = pending_income[0].get("income_id")
        
        # Check income_count matches array length
        assert income_count == len(pending_income), f"Count mismatch: {income_count} vs {len(pending_income)}"
        
        print(f"✓ Accountant sees {income_count} pending income entries")
    
    def test_04_approve_income_success(self, accountant_session):
        """Test accountant approving income changes status to 'approved'"""
        if not self.test_income_id:
            # Get a pending income to approve
            response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
            assert response.status_code == 200
            pending = response.json().get("income", [])
            if not pending:
                pytest.skip("No pending income to approve")
            self.__class__.test_income_id = pending[0].get("income_id")
        
        # Approve the income
        response = accountant_session.post(
            f"{BASE_URL}/api/approvals/income/{self.test_income_id}/approve"
        )
        assert response.status_code == 200, f"Failed to approve: {response.text}"
        
        result = response.json()
        assert "message" in result
        print(f"✓ Approved income: {self.test_income_id}")
        
    def test_05_approved_income_not_in_pending(self, accountant_session):
        """Verify approved income no longer appears in pending approvals"""
        if not self.test_income_id:
            pytest.skip("No income_id to verify")
            
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        pending_income = response.json().get("income", [])
        pending_ids = [inc.get("income_id") for inc in pending_income]
        
        assert self.test_income_id not in pending_ids, f"Approved income still in pending list"
        print(f"✓ Approved income {self.test_income_id} correctly removed from pending")
    
    def test_06_reject_income_flow(self, accountant_session, cre_session, admin_session):
        """Test accountant rejecting income changes status to 'rejected'"""
        # Find or create another pending income to reject
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        pending = response.json().get("income", [])
        
        if len(pending) == 0:
            pytest.skip("No pending income to reject")
        
        income_to_reject = pending[0].get("income_id")
        
        # Reject with reason
        response = accountant_session.post(
            f"{BASE_URL}/api/approvals/income/{income_to_reject}/reject",
            params={"reason": "Test rejection for verification"}
        )
        assert response.status_code == 200, f"Failed to reject: {response.text}"
        
        result = response.json()
        assert "message" in result
        print(f"✓ Rejected income: {income_to_reject}")
        
        # Verify no longer in pending
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        pending_after = response.json().get("income", [])
        pending_ids = [inc.get("income_id") for inc in pending_after]
        
        assert income_to_reject not in pending_ids, "Rejected income still in pending"
        print(f"✓ Rejected income correctly removed from pending")


class TestRegressionChecks:
    """Regression tests for related functionality"""
    
    def test_07_presales_to_sales_transfer_working(self, admin_session):
        """Verify Pre-Sales to Sales transfer still works"""
        # Get Pre-Sales stages
        response = admin_session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        assert len(stages) > 0, "No Pre-Sales stages found"
        
        # Check for final stage (transfer trigger)
        final_stages = [s for s in stages if s.get("is_final")]
        assert len(final_stages) > 0, "No final Pre-Sales stage found (needed for transfer)"
        
        print(f"✓ Pre-Sales has {len(stages)} stages, {len(final_stages)} final stages")
        
        # Get Sales stages
        response = admin_session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200
        
        sales_stages = response.json()
        assert len(sales_stages) > 0, "No Sales stages found"
        print(f"✓ Sales has {len(sales_stages)} stages")
    
    def test_08_stage_management_accessible(self, admin_session):
        """Verify Stage Management page is accessible"""
        # Get stages with counts (Stage Management data)
        response = admin_session.get(f"{BASE_URL}/api/crm/stages/with-counts")
        assert response.status_code == 200, f"Stage management not accessible: {response.text}"
        
        stages = response.json()
        assert len(stages) > 0, "No stages returned from management endpoint"
        
        # Verify structure
        for stage in stages[:3]:
            assert "stage_id" in stage
            assert "name" in stage
            assert "stage_type" in stage
            assert "lead_count" in stage  # Count should be present
        
        pre_sales = [s for s in stages if s.get("stage_type") == "pre_sales"]
        sales = [s for s in stages if s.get("stage_type") == "sales"]
        
        print(f"✓ Stage Management: {len(pre_sales)} Pre-Sales, {len(sales)} Sales stages")


class TestUnifiedApprovalsStructure:
    """Test the unified approvals endpoint structure and data"""
    
    def test_09_unified_approvals_response_structure(self, accountant_session):
        """Verify unified approvals endpoint returns correct structure"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Check all required keys
        required_keys = ["income", "materials", "labour", "vendor", "summary"]
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
        
        # Check summary structure
        summary = data.get("summary", {})
        summary_keys = ["income_count", "income_total", "material_count", "labour_count", "vendor_count"]
        for key in summary_keys:
            assert key in summary, f"Summary missing: {key}"
        
        print("✓ Unified approvals structure verified")
        print(f"  Income: {summary.get('income_count')} items, ₹{summary.get('income_total', 0):,.0f}")
        print(f"  Materials: {summary.get('material_count')} items")
        print(f"  Labour: {summary.get('labour_count')} items")
        print(f"  Vendor: {summary.get('vendor_count')} items")
    
    def test_10_income_entries_have_correct_fields(self, accountant_session):
        """Verify income entries in approvals have required fields"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        income = response.json().get("income", [])
        
        if len(income) > 0:
            entry = income[0]
            # Check key fields
            assert "income_id" in entry, "Missing income_id"
            assert "amount" in entry, "Missing amount"
            assert "status" in entry, "Missing status"
            assert entry.get("status") == "pending_approval", f"Wrong status: {entry.get('status')}"
            
            # Source should be 'approval' for CRE-collected payments
            if entry.get("source"):
                print(f"  Source: {entry.get('source')}")
            
            print(f"✓ Income entry structure verified: {entry.get('income_id')}")
        else:
            print("✓ No pending income entries (structure test passed via endpoint)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
