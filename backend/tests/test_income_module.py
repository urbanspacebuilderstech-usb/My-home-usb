"""
Income Module Backend Tests
Tests for: Income CRUD, Summary, Filters, Project Income Integration
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIncomeModule:
    """Income Module endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with super_admin login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as super_admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.user = login_response.json()
        
        # Store cookies for subsequent requests
        self.session.cookies.update(login_response.cookies)
        
        yield
        
        # Cleanup: Delete test income entries
        try:
            income_response = self.session.get(f"{BASE_URL}/api/income")
            if income_response.status_code == 200:
                for entry in income_response.json():
                    if entry.get("remarks", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/income/{entry['income_id']}")
        except:
            pass
    
    # ==================== INCOME SUMMARY TESTS ====================
    
    def test_get_income_summary(self):
        """Test GET /api/income/summary returns summary with all payment modes"""
        response = self.session.get(f"{BASE_URL}/api/income/summary")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Verify all required fields exist
        assert "total_income" in data
        assert "cash" in data
        assert "cheque" in data
        assert "bank_transfer" in data
        assert "upi" in data
        assert "petty_cash" in data
        assert "entry_count" in data
        
        # Verify types
        assert isinstance(data["total_income"], (int, float))
        assert isinstance(data["entry_count"], int)
        print(f"Income Summary: Total={data['total_income']}, Entries={data['entry_count']}")
    
    # ==================== INCOME LIST TESTS ====================
    
    def test_get_all_income_entries(self):
        """Test GET /api/income returns list of income entries"""
        response = self.session.get(f"{BASE_URL}/api/income")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            entry = data[0]
            # Verify entry structure
            assert "income_id" in entry
            assert "project_id" in entry
            assert "amount" in entry
            assert "payment_mode" in entry
            assert "project_name" in entry  # Should be enriched with project name
        
        print(f"Found {len(data)} income entries")
    
    def test_filter_income_by_project(self):
        """Test filtering income by project_id"""
        # First get a project
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        assert projects_response.status_code == 200
        projects = projects_response.json()
        
        if len(projects) > 0:
            project_id = projects[0]["project_id"]
            response = self.session.get(f"{BASE_URL}/api/income?project_id={project_id}")
            assert response.status_code == 200
            
            data = response.json()
            # All entries should be for this project
            for entry in data:
                assert entry["project_id"] == project_id
            print(f"Filtered income for project {project_id}: {len(data)} entries")
    
    def test_filter_income_by_payment_mode(self):
        """Test filtering income by payment_mode"""
        response = self.session.get(f"{BASE_URL}/api/income?payment_mode=cash")
        assert response.status_code == 200
        
        data = response.json()
        for entry in data:
            assert entry["payment_mode"] == "cash"
        print(f"Filtered cash income: {len(data)} entries")
    
    def test_filter_income_by_date_range(self):
        """Test filtering income by date range"""
        today = datetime.now().strftime("%Y-%m-%d")
        last_month = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/income?start_date={last_month}&end_date={today}")
        assert response.status_code == 200
        
        data = response.json()
        print(f"Filtered income by date range: {len(data)} entries")
    
    # ==================== INCOME CREATE TESTS ====================
    
    def test_create_income_entry_cash(self):
        """Test creating a cash income entry"""
        # Get a project first
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        assert projects_response.status_code == 200
        projects = projects_response.json()
        assert len(projects) > 0, "No projects found for testing"
        
        project_id = projects[0]["project_id"]
        
        # Create income entry
        income_data = {
            "project_id": project_id,
            "amount": 100000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_cash_payment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "income_id" in data
        assert data["amount"] == 100000
        assert data["payment_mode"] == "cash"
        assert data["project_id"] == project_id
        
        print(f"Created cash income: {data['income_id']}")
        
        # Verify it appears in list
        list_response = self.session.get(f"{BASE_URL}/api/income")
        assert list_response.status_code == 200
        entries = list_response.json()
        income_ids = [e["income_id"] for e in entries]
        assert data["income_id"] in income_ids
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{data['income_id']}")
    
    def test_create_income_entry_cheque(self):
        """Test creating a cheque income entry with cheque details"""
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 250000,
            "payment_mode": "cheque",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "cheque_number": "CHQ123456",
            "bank_name": "HDFC Bank",
            "remarks": "TEST_cheque_payment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["payment_mode"] == "cheque"
        assert data["cheque_number"] == "CHQ123456"
        assert data["bank_name"] == "HDFC Bank"
        
        print(f"Created cheque income: {data['income_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{data['income_id']}")
    
    def test_create_income_entry_bank_transfer(self):
        """Test creating a bank transfer income entry with reference"""
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 500000,
            "payment_mode": "bank_transfer",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": "TXN987654321",
            "remarks": "TEST_bank_transfer"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["payment_mode"] == "bank_transfer"
        assert data["reference_number"] == "TXN987654321"
        
        print(f"Created bank transfer income: {data['income_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{data['income_id']}")
    
    def test_create_income_entry_upi(self):
        """Test creating a UPI income entry"""
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 75000,
            "payment_mode": "upi",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": "UPI123456789",
            "remarks": "TEST_upi_payment"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["payment_mode"] == "upi"
        
        print(f"Created UPI income: {data['income_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{data['income_id']}")
    
    def test_create_income_entry_petty_cash(self):
        """Test creating a petty cash income entry"""
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 5000,
            "payment_mode": "petty_cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_petty_cash"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["payment_mode"] == "petty_cash"
        
        print(f"Created petty cash income: {data['income_id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{data['income_id']}")
    
    def test_create_income_invalid_project(self):
        """Test creating income with invalid project returns 404"""
        income_data = {
            "project_id": "invalid_project_id",
            "amount": 100000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_invalid_project"
        }
        
        response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 404
        print("Correctly rejected invalid project")
    
    # ==================== INCOME DELETE TESTS ====================
    
    def test_delete_income_entry(self):
        """Test deleting an income entry"""
        # Create an entry first
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 50000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_to_delete"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert create_response.status_code == 200
        income_id = create_response.json()["income_id"]
        
        # Delete it
        delete_response = self.session.delete(f"{BASE_URL}/api/income/{income_id}")
        assert delete_response.status_code == 200
        
        # Verify it's gone
        list_response = self.session.get(f"{BASE_URL}/api/income")
        entries = list_response.json()
        income_ids = [e["income_id"] for e in entries]
        assert income_id not in income_ids
        
        print(f"Successfully deleted income: {income_id}")
    
    def test_delete_nonexistent_income(self):
        """Test deleting non-existent income returns 404"""
        response = self.session.delete(f"{BASE_URL}/api/income/nonexistent_id")
        assert response.status_code == 404
        print("Correctly rejected delete of non-existent income")
    
    # ==================== PROJECT INCOME INTEGRATION TESTS ====================
    
    def test_income_updates_project_income_field(self):
        """Test that creating income updates project.income_project field"""
        # Get a project
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        # Get initial project income
        project_response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        initial_income = project_response.json().get("income_project", 0)
        
        # Create income entry
        income_data = {
            "project_id": project_id,
            "amount": 100000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_project_update"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert create_response.status_code == 200
        income_id = create_response.json()["income_id"]
        
        # Verify project income updated
        project_response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        updated_income = project_response.json().get("income_project", 0)
        assert updated_income == initial_income + 100000, f"Expected {initial_income + 100000}, got {updated_income}"
        
        print(f"Project income updated: {initial_income} -> {updated_income}")
        
        # Cleanup and verify income decreases
        self.session.delete(f"{BASE_URL}/api/income/{income_id}")
        
        project_response = self.session.get(f"{BASE_URL}/api/projects/{project_id}")
        final_income = project_response.json().get("income_project", 0)
        assert final_income == initial_income, f"Expected {initial_income}, got {final_income}"
        
        print(f"Project income restored after delete: {final_income}")
    
    def test_project_full_details_includes_income(self):
        """Test that project full-details endpoint includes income data"""
        # Get a project
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        # Get full details
        response = self.session.get(f"{BASE_URL}/api/projects/{project_id}/full-details")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify income-related fields in summary
        assert "summary" in data
        summary = data["summary"]
        assert "income_total" in summary
        assert "income_by_mode" in summary
        
        # Verify income_by_mode has all payment modes
        income_by_mode = summary["income_by_mode"]
        assert "cash" in income_by_mode
        assert "cheque" in income_by_mode
        assert "bank_transfer" in income_by_mode
        assert "upi" in income_by_mode
        assert "petty_cash" in income_by_mode
        
        print(f"Project full-details income_total: {summary['income_total']}")
    
    def test_project_income_endpoint(self):
        """Test GET /api/projects/{project_id}/income returns project-specific income"""
        # Get a project
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        response = self.session.get(f"{BASE_URL}/api/projects/{project_id}/income")
        assert response.status_code == 200
        
        data = response.json()
        assert "entries" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_income" in summary
        assert "cash" in summary
        assert "cheque" in summary
        
        print(f"Project income summary: {summary}")
    
    # ==================== SUMMARY CARD UPDATE TESTS ====================
    
    def test_summary_updates_after_income_creation(self):
        """Test that income summary updates after creating new income"""
        # Get initial summary
        initial_response = self.session.get(f"{BASE_URL}/api/income/summary")
        initial_summary = initial_response.json()
        initial_total = initial_summary["total_income"]
        initial_cash = initial_summary["cash"]
        
        # Create income
        projects_response = self.session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        income_data = {
            "project_id": project_id,
            "amount": 200000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_summary_update"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/income", json=income_data)
        assert create_response.status_code == 200
        income_id = create_response.json()["income_id"]
        
        # Get updated summary
        updated_response = self.session.get(f"{BASE_URL}/api/income/summary")
        updated_summary = updated_response.json()
        
        assert updated_summary["total_income"] == initial_total + 200000
        assert updated_summary["cash"] == initial_cash + 200000
        
        print(f"Summary updated: Total {initial_total} -> {updated_summary['total_income']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/income/{income_id}")


class TestIncomePermissions:
    """Test role-based permissions for income operations"""
    
    def test_accountant_can_create_income(self):
        """Test that accountant role can create income"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as accountant
        login_response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert login_response.status_code == 200
        
        # Get a project
        projects_response = session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        # Create income
        income_data = {
            "project_id": project_id,
            "amount": 50000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_accountant_create"
        }
        
        response = session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"Accountant should be able to create income: {response.text}"
        
        # Cleanup
        income_id = response.json()["income_id"]
        session.delete(f"{BASE_URL}/api/income/{income_id}")
        
        print("Accountant can create income: PASS")
    
    def test_project_manager_can_create_income(self):
        """Test that project manager role can create income"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Login as PM
        login_response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        assert login_response.status_code == 200
        
        # Get a project
        projects_response = session.get(f"{BASE_URL}/api/projects")
        projects = projects_response.json()
        project_id = projects[0]["project_id"]
        
        # Create income
        income_data = {
            "project_id": project_id,
            "amount": 50000,
            "payment_mode": "cash",
            "payment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": "TEST_pm_create"
        }
        
        response = session.post(f"{BASE_URL}/api/income", json=income_data)
        assert response.status_code == 200, f"PM should be able to create income: {response.text}"
        
        # Cleanup - need super_admin to delete
        admin_session = requests.Session()
        admin_session.headers.update({"Content-Type": "application/json"})
        admin_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "admin@constructionos.com"})
        admin_session.delete(f"{BASE_URL}/api/income/{response.json()['income_id']}")
        
        print("Project Manager can create income: PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
