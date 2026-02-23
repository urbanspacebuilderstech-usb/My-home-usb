"""
Test Project Detail Tabs - Scope, Payments, Additions, Deductions
Tests the new 4-tab layout with CRUD operations for each tab
"""
import pytest
import requests
import os

# Load from frontend .env file
from pathlib import Path
env_path = Path('/app/frontend/.env')
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith('#') and '=' in line:
                key, value = line.strip().split('=', 1)
                os.environ[key] = value

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://construction-hub-182.preview.emergentagent.com').rstrip('/')
PROJECT_ID = "proj_classic001"

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Demo login
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        # Get session cookie
        if 'session_token' in response.cookies:
            s.cookies.set('session_token', response.cookies['session_token'])
        
        return s
    
    def test_auth_me(self, session):
        """Test auth/me endpoint"""
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@constructionos.com"
        assert data["role"] == "super_admin"


class TestProjectFullDetails:
    """Test the full-details endpoint that powers the 4-tab view"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_full_details(self, session):
        """Test GET /projects/{id}/full-details returns all data"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify structure
        assert "project" in data
        assert "scope_items" in data
        assert "payment_stages" in data
        assert "additional_costs" in data
        assert "deductions" in data
        assert "summary" in data
        
        # Verify summary fields
        summary = data["summary"]
        assert "scope_total" in summary
        assert "project_value" in summary
        assert "additions_total" in summary
        assert "payment_received" in summary
        assert "deductions_total" in summary
        assert "balance" in summary
        
        print(f"Full details loaded: {len(data['scope_items'])} scope items, {len(data['payment_stages'])} payments, {len(data['additional_costs'])} additions, {len(data['deductions'])} deductions")


class TestScopeItems:
    """Test Scope Items CRUD - sum becomes project value"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_scope_items(self, session):
        """Test GET /projects/{id}/scope-items"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/scope-items")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} scope items")
    
    def test_create_scope_item(self, session):
        """Test POST /scope-items with qty, unit, rate"""
        payload = {
            "project_id": PROJECT_ID,
            "item_name": "TEST_Electrical Work",
            "quantity": 100,
            "unit": "Sqft",
            "unit_rate": 500,
            "remarks": "Test scope item"
        }
        response = session.post(f"{BASE_URL}/api/scope-items", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["item_name"] == "TEST_Electrical Work"
        assert data["quantity"] == 100
        assert data["unit"] == "Sqft"
        assert data["unit_rate"] == 500
        assert data["total_amount"] == 50000  # qty * rate
        assert "scope_id" in data
        
        # Store for cleanup
        self.__class__.created_scope_id = data["scope_id"]
        print(f"Created scope item: {data['scope_id']} with total {data['total_amount']}")
    
    def test_scope_total_becomes_project_value(self, session):
        """Verify scope total becomes project value in summary"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert response.status_code == 200
        
        data = response.json()
        scope_items = data["scope_items"]
        summary = data["summary"]
        
        # Calculate expected scope total
        expected_total = sum(item.get("total_amount", 0) for item in scope_items)
        
        assert summary["scope_total"] == expected_total
        # Project value should equal scope total when scope items exist
        if scope_items:
            assert summary["project_value"] == summary["scope_total"]
        
        print(f"Scope total: {summary['scope_total']}, Project value: {summary['project_value']}")
    
    def test_delete_scope_item(self, session):
        """Test DELETE /scope-items/{id}"""
        if not hasattr(self.__class__, 'created_scope_id'):
            pytest.skip("No scope item to delete")
        
        scope_id = self.__class__.created_scope_id
        response = session.delete(f"{BASE_URL}/api/scope-items/{scope_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/scope-items")
        data = response.json()
        scope_ids = [item["scope_id"] for item in data]
        assert scope_id not in scope_ids
        print(f"Deleted scope item: {scope_id}")


class TestPaymentStages:
    """Test Payment Stages CRUD with percentage and amount"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_payment_stages(self, session):
        """Test GET /projects/{id}/payment-stages"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} payment stages")
    
    def test_create_payment_stage(self, session):
        """Test POST /payment-stages with percentage and amount"""
        payload = {
            "project_id": PROJECT_ID,
            "stage_name": "TEST_Advance Payment",
            "percentage": 10,
            "amount": 100000
        }
        response = session.post(f"{BASE_URL}/api/payment-stages", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["stage_name"] == "TEST_Advance Payment"
        assert data["percentage"] == 10
        assert data["amount"] == 100000
        assert data["amount_received"] == 0
        assert "stage_id" in data
        
        self.__class__.created_stage_id = data["stage_id"]
        print(f"Created payment stage: {data['stage_id']}")
    
    def test_update_payment_amount_received(self, session):
        """Test PATCH /payment-stages/{id} to update amount_received inline"""
        if not hasattr(self.__class__, 'created_stage_id'):
            pytest.skip("No payment stage to update")
        
        stage_id = self.__class__.created_stage_id
        payload = {"amount_received": 50000}
        response = session.patch(f"{BASE_URL}/api/payment-stages/{stage_id}", json=payload)
        assert response.status_code == 200
        
        # Verify update
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        data = response.json()
        stage = next((s for s in data if s["stage_id"] == stage_id), None)
        assert stage is not None
        assert stage["amount_received"] == 50000
        print(f"Updated payment stage amount_received to 50000")
    
    def test_delete_payment_stage(self, session):
        """Test DELETE /payment-stages/{id}"""
        if not hasattr(self.__class__, 'created_stage_id'):
            pytest.skip("No payment stage to delete")
        
        stage_id = self.__class__.created_stage_id
        response = session.delete(f"{BASE_URL}/api/payment-stages/{stage_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/payment-stages")
        data = response.json()
        stage_ids = [s["stage_id"] for s in data]
        assert stage_id not in stage_ids
        print(f"Deleted payment stage: {stage_id}")


class TestAdditionalCosts:
    """Test Additional Costs (Additions) CRUD"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_additional_costs(self, session):
        """Test GET /projects/{id}/additional-costs"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/additional-costs")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} additional costs")
    
    def test_create_additional_cost(self, session):
        """Test POST /additional-costs"""
        payload = {
            "project_id": PROJECT_ID,
            "description": "TEST_Extra Flooring",
            "estimated_amount": 75000
        }
        response = session.post(f"{BASE_URL}/api/additional-costs", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["description"] == "TEST_Extra Flooring"
        assert data["estimated_amount"] == 75000
        assert data["income_received"] == 0
        assert "cost_id" in data
        
        self.__class__.created_cost_id = data["cost_id"]
        print(f"Created additional cost: {data['cost_id']}")
    
    def test_update_income_received(self, session):
        """Test PATCH /additional-costs/{id} to update income_received inline"""
        if not hasattr(self.__class__, 'created_cost_id'):
            pytest.skip("No additional cost to update")
        
        cost_id = self.__class__.created_cost_id
        payload = {"income_received": 25000}
        response = session.patch(f"{BASE_URL}/api/additional-costs/{cost_id}", json=payload)
        assert response.status_code == 200
        
        # Verify update
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/additional-costs")
        data = response.json()
        cost = next((c for c in data if c["cost_id"] == cost_id), None)
        assert cost is not None
        assert cost["income_received"] == 25000
        print(f"Updated additional cost income_received to 25000")
    
    def test_delete_additional_cost(self, session):
        """Test DELETE /additional-costs/{id}"""
        if not hasattr(self.__class__, 'created_cost_id'):
            pytest.skip("No additional cost to delete")
        
        cost_id = self.__class__.created_cost_id
        response = session.delete(f"{BASE_URL}/api/additional-costs/{cost_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/additional-costs")
        data = response.json()
        cost_ids = [c["cost_id"] for c in data]
        assert cost_id not in cost_ids
        print(f"Deleted additional cost: {cost_id}")


class TestDeductions:
    """Test Deductions CRUD - reduces balance only, not project value"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_get_deductions(self, session):
        """Test GET /projects/{id}/deductions"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/deductions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} deductions")
    
    def test_create_deduction(self, session):
        """Test POST /deductions"""
        payload = {
            "project_id": PROJECT_ID,
            "description": "TEST_Penalty for delay",
            "amount": 10000,
            "remarks": "Test deduction"
        }
        response = session.post(f"{BASE_URL}/api/deductions", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["description"] == "TEST_Penalty for delay"
        assert data["amount"] == 10000
        assert "deduction_id" in data
        
        self.__class__.created_deduction_id = data["deduction_id"]
        print(f"Created deduction: {data['deduction_id']}")
    
    def test_deduction_reduces_balance_not_project_value(self, session):
        """Verify deductions reduce balance only, not project value"""
        # Get full details before
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert response.status_code == 200
        data = response.json()
        
        summary = data["summary"]
        project_value = summary["project_value"]
        deductions_total = summary["deductions_total"]
        balance = summary["balance"]
        
        # Balance formula: Total Value - Payments Received - Additions Received - Deductions
        # Deductions should NOT affect project_value
        expected_balance = summary["total_value"] - summary["payment_received"] - summary["additions_received"] - deductions_total
        
        assert balance == expected_balance, f"Balance calculation incorrect: expected {expected_balance}, got {balance}"
        
        # Project value should NOT include deductions
        assert project_value == summary["scope_total"] or project_value == data["project"].get("total_value", 0)
        
        print(f"Project value: {project_value}, Deductions: {deductions_total}, Balance: {balance}")
        print("Verified: Deductions reduce balance only, not project value")
    
    def test_delete_deduction(self, session):
        """Test DELETE /deductions/{id}"""
        if not hasattr(self.__class__, 'created_deduction_id'):
            pytest.skip("No deduction to delete")
        
        deduction_id = self.__class__.created_deduction_id
        response = session.delete(f"{BASE_URL}/api/deductions/{deduction_id}")
        assert response.status_code == 200
        
        # Verify deletion
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/deductions")
        data = response.json()
        deduction_ids = [d["deduction_id"] for d in data]
        assert deduction_id not in deduction_ids
        print(f"Deleted deduction: {deduction_id}")


class TestBalanceCalculation:
    """Test the balance calculation formula"""
    
    @pytest.fixture(scope="class")
    def session(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert response.status_code == 200
        return s
    
    def test_balance_formula(self, session):
        """Test Balance = Total Value - Payments - Deductions"""
        response = session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/full-details")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        
        # Balance = Total Value - Payment Received - Additions Received - Deductions
        expected_balance = (
            summary["total_value"] 
            - summary["payment_received"] 
            - summary["additions_received"]
            - summary["deductions_total"]
        )
        
        assert summary["balance"] == expected_balance, f"Balance mismatch: expected {expected_balance}, got {summary['balance']}"
        
        print(f"Balance calculation verified:")
        print(f"  Total Value: {summary['total_value']}")
        print(f"  - Payment Received: {summary['payment_received']}")
        print(f"  - Additions Received: {summary['additions_received']}")
        print(f"  - Deductions: {summary['deductions_total']}")
        print(f"  = Balance: {summary['balance']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
