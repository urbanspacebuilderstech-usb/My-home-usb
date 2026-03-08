"""
Phase 2 Financial Tests: Cashbook, Suspense Account, Smart Payment, Project Finance
Testing new endpoints for Construction Accounting CRM Phase 2 features
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication setup for tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Demo login as admin
        login_resp = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com",
            "role": "super_admin"
        })
        
        if login_resp.status_code == 200:
            data = login_resp.json()
            if "token" in data:
                s.headers.update({"Authorization": f"Bearer {data['token']}"})
            # Also set cookie if present
            if "set-cookie" in login_resp.headers:
                pass  # requests handles cookies automatically
        
        return s
    
    def test_demo_login_works(self, session):
        """Verify demo login authentication works"""
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200, f"Auth failed: {resp.text}"
        data = resp.json()
        assert data.get("email") == "admin@constructionos.com"
        print(f"✓ Logged in as: {data.get('name')} ({data.get('role')})")


class TestCashbook:
    """Test Cashbook endpoints - GET /api/cashbook and POST /api/cashbook/manual-expense"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com",
            "role": "super_admin"
        })
        return s
    
    def test_get_cashbook(self, auth_session):
        """GET /api/cashbook returns income, expenses, summary with totals"""
        resp = auth_session.get(f"{BASE_URL}/api/cashbook")
        assert resp.status_code == 200, f"Cashbook GET failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        # Verify response structure
        assert "income" in data, "Missing 'income' in response"
        assert "expenses" in data, "Missing 'expenses' in response"
        assert "summary" in data, "Missing 'summary' in response"
        
        # Verify summary has required fields
        summary = data["summary"]
        assert "total_income" in summary, "Missing 'total_income' in summary"
        assert "total_expense" in summary, "Missing 'total_expense' in summary"
        assert "balance" in summary, "Missing 'balance' in summary"
        assert "income_by_mode" in summary, "Missing 'income_by_mode' in summary"
        
        print(f"✓ Cashbook: Income={summary.get('total_income')}, Expense={summary.get('total_expense')}, Balance={summary.get('balance')}")
    
    def test_create_manual_expense(self, auth_session):
        """POST /api/cashbook/manual-expense creates expense record"""
        # First get a project to use
        projects_resp = auth_session.get(f"{BASE_URL}/api/projects")
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects available for testing")
        
        project = projects_resp.json()[0]
        project_id = project.get("project_id")
        
        # Create manual expense
        expense_data = {
            "project_id": project_id,
            "category": "other",
            "description": f"TEST_Manual expense {uuid.uuid4().hex[:8]}",
            "amount": 1500.00,
            "payment_method": "cash",
            "vendor_name": "Test Vendor",
            "remarks": "Automated test expense"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/cashbook/manual-expense", json=expense_data)
        assert resp.status_code == 200, f"Manual expense creation failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "expense_id" in data, "Missing expense_id in response"
        assert data.get("amount") == 1500.00, "Amount mismatch"
        assert data.get("category") == "other", "Category mismatch"
        assert data.get("project_id") == project_id, "Project ID mismatch"
        
        print(f"✓ Manual expense created: {data.get('expense_id')}")
        
        # Verify it shows in cashbook
        cb_resp = auth_session.get(f"{BASE_URL}/api/cashbook")
        assert cb_resp.status_code == 200
        expenses = cb_resp.json().get("expenses", [])
        found = any(e.get("expense_id") == data.get("expense_id") for e in expenses)
        assert found, "Created expense not found in cashbook"
        print("✓ Expense verified in cashbook")


class TestSuspenseAccount:
    """Test Suspense Account endpoints - overview and payment processing"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com",
            "role": "super_admin"
        })
        return s
    
    def test_get_suspense_overview(self, auth_session):
        """GET /api/suspense/overview returns petty_cash, material_suspense, labour_suspense"""
        resp = auth_session.get(f"{BASE_URL}/api/suspense/overview")
        assert resp.status_code == 200, f"Suspense overview failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        # Verify 3-part suspense structure
        assert "petty_cash" in data, "Missing 'petty_cash' in suspense overview"
        assert "material_suspense" in data, "Missing 'material_suspense' in suspense overview"
        assert "labour_suspense" in data, "Missing 'labour_suspense' in suspense overview"
        
        # Verify petty_cash structure
        petty = data["petty_cash"]
        assert "balance" in petty, "Missing 'balance' in petty_cash"
        
        # Verify material suspense structure
        mat_sus = data["material_suspense"]
        assert "total" in mat_sus, "Missing 'total' in material_suspense"
        assert "balances" in mat_sus, "Missing 'balances' in material_suspense"
        
        # Verify labour suspense structure
        lab_sus = data["labour_suspense"]
        assert "total" in lab_sus, "Missing 'total' in labour_suspense"
        assert "balances" in lab_sus, "Missing 'balances' in labour_suspense"
        
        print(f"✓ Suspense Overview: Petty Cash Balance={petty.get('balance')}, Material Suspense={mat_sus.get('total')}, Labour Suspense={lab_sus.get('total')}")
    
    def test_process_payment_with_suspense(self, auth_session):
        """POST /api/suspense/payment processes payment with smart suspense tracking"""
        # Get a project for allocation
        projects_resp = auth_session.get(f"{BASE_URL}/api/projects")
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects available for testing")
        
        project = projects_resp.json()[0]
        project_id = project.get("project_id")
        project_name = project.get("name", "Test Project")
        
        # Test scenario: Labour asks 80K, Finance pays 100K cheque
        # Expected: 80K goes to expense, 20K goes to suspense
        vendor_name = f"TEST_Contractor_{uuid.uuid4().hex[:6]}"
        payment_data = {
            "payment_type": "labour",
            "vendor_or_contractor": vendor_name,
            "requested_amount": 80000,
            "cheque_amount": 100000,
            "payment_method": "cheque",
            "site_allocations": [
                {"project_id": project_id, "project_name": project_name, "amount": 80000}
            ],
            "remarks": "Automated test payment"
        }
        
        resp = auth_session.post(f"{BASE_URL}/api/suspense/payment", json=payment_data)
        assert resp.status_code == 200, f"Suspense payment failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        # Verify smart suspense calculations
        assert "payment_id" in data, "Missing payment_id"
        assert data.get("requested_amount") == 80000, "Requested amount mismatch"
        assert data.get("cheque_amount") == 100000, "Cheque amount mismatch"
        assert data.get("excess_to_suspense") == 20000, f"Expected 20K excess to suspense, got {data.get('excess_to_suspense')}"
        
        print(f"✓ Payment processed: ID={data.get('payment_id')}, Excess to Suspense={data.get('excess_to_suspense')}")
        
        # Verify suspense balance was updated
        overview_resp = auth_session.get(f"{BASE_URL}/api/suspense/overview")
        assert overview_resp.status_code == 200
        overview = overview_resp.json()
        labour_balances = overview.get("labour_suspense", {}).get("balances", [])
        
        contractor_balance = next((b for b in labour_balances if b.get("name") == vendor_name), None)
        if contractor_balance:
            assert contractor_balance.get("balance") == 20000, f"Expected 20K balance, got {contractor_balance.get('balance')}"
            print(f"✓ Suspense balance verified for {vendor_name}: ₹20,000")
    
    def test_suspense_auto_deduction(self, auth_session):
        """Test that existing suspense balance is auto-deducted on next payment"""
        # Get a project for allocation
        projects_resp = auth_session.get(f"{BASE_URL}/api/projects")
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects available for testing")
        
        project = projects_resp.json()[0]
        project_id = project.get("project_id")
        project_name = project.get("name", "Test Project")
        
        vendor_name = f"TEST_AutoDeduct_{uuid.uuid4().hex[:6]}"
        
        # First payment: Create excess to suspense (100K cheque for 80K request = 20K excess)
        payment1_data = {
            "payment_type": "material",
            "vendor_or_contractor": vendor_name,
            "requested_amount": 80000,
            "cheque_amount": 100000,
            "payment_method": "cheque",
            "site_allocations": [
                {"project_id": project_id, "project_name": project_name, "amount": 80000}
            ],
            "remarks": "First payment - creates suspense"
        }
        
        resp1 = auth_session.post(f"{BASE_URL}/api/suspense/payment", json=payment1_data)
        assert resp1.status_code == 200, f"First payment failed: {resp1.text}"
        data1 = resp1.json()
        assert data1.get("excess_to_suspense") == 20000, "Expected 20K excess on first payment"
        print(f"✓ First payment: Created 20K suspense balance")
        
        # Second payment: Same vendor requests 60K, should auto-deduct 20K from suspense
        # Expected: Only need 40K new payment (60K - 20K from suspense)
        payment2_data = {
            "payment_type": "material",
            "vendor_or_contractor": vendor_name,
            "requested_amount": 60000,
            "cheque_amount": 60000,  # Pay exactly what's requested
            "payment_method": "cheque",
            "site_allocations": [
                {"project_id": project_id, "project_name": project_name, "amount": 60000}
            ],
            "remarks": "Second payment - should use suspense"
        }
        
        resp2 = auth_session.post(f"{BASE_URL}/api/suspense/payment", json=payment2_data)
        assert resp2.status_code == 200, f"Second payment failed: {resp2.text}"
        data2 = resp2.json()
        
        # Verify suspense was used
        assert data2.get("suspense_used") == 20000, f"Expected 20K suspense used, got {data2.get('suspense_used')}"
        assert data2.get("actual_paid") == 40000, f"Expected 40K actual paid, got {data2.get('actual_paid')}"
        
        print(f"✓ Second payment: Used 20K from suspense, Actual paid: 40K")
        print(f"✓ Smart payment auto-deduction working correctly!")


class TestProjectFinance:
    """Test Project Finance endpoint - project-wise income/expense breakdown"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com",
            "role": "super_admin"
        })
        return s
    
    def test_get_project_finance(self, auth_session):
        """GET /api/project-finance returns project-wise income and expense breakdown"""
        resp = auth_session.get(f"{BASE_URL}/api/project-finance")
        assert resp.status_code == 200, f"Project finance failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        assert "projects" in data, "Missing 'projects' in response"
        
        projects = data["projects"]
        if projects:
            # Verify project structure
            first_project = projects[0]
            required_fields = ["project_id", "name", "income", "expenses", "profit"]
            for field in required_fields:
                assert field in first_project, f"Missing '{field}' in project data"
            
            # Verify expenses breakdown structure
            expenses = first_project.get("expenses", {})
            expense_categories = ["material", "labour", "vendor", "total"]
            for cat in expense_categories:
                assert cat in expenses, f"Missing '{cat}' in expenses breakdown"
            
            print(f"✓ Project Finance: {len(projects)} projects returned")
            print(f"✓ First project: {first_project.get('name')} - Income: {first_project.get('income')}, Expenses: {expenses.get('total')}, Profit: {first_project.get('profit')}")
        else:
            print("⚠ No projects found in project finance")


class TestUnifiedApprovals:
    """Test Unified Approvals endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com",
            "role": "super_admin"
        })
        return s
    
    def test_get_unified_approvals(self, auth_session):
        """GET /api/approvals/unified returns pending income and expense approvals"""
        resp = auth_session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200, f"Unified approvals failed: {resp.status_code} - {resp.text}"
        
        data = resp.json()
        # Verify all 4 approval categories are present
        assert "income" in data, "Missing 'income' approvals"
        assert "materials" in data, "Missing 'materials' approvals"
        assert "labour" in data, "Missing 'labour' approvals"
        assert "vendor" in data, "Missing 'vendor' approvals"
        assert "summary" in data, "Missing 'summary'"
        
        # Verify summary structure
        summary = data["summary"]
        assert "income_count" in summary, "Missing income_count in summary"
        assert "material_count" in summary, "Missing material_count in summary"
        assert "labour_count" in summary, "Missing labour_count in summary"
        assert "vendor_count" in summary, "Missing vendor_count in summary"
        
        print(f"✓ Unified Approvals: Income={summary.get('income_count')}, Materials={summary.get('material_count')}, Labour={summary.get('labour_count')}, Vendor={summary.get('vendor_count')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
