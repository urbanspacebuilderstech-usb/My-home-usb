"""
Test Suite: Petrol Allowance & GPS Mandatory Attendance
Features tested:
1. Petrol Allowance - SE requests, Accountant approves/rejects
2. GPS Mandatory Attendance - Login requires GPS, auto-logout on GPS loss
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from demo access
SE_EMAIL = "engineer@constructionos.com"
SE_PASSWORD = "USB@123.26"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"
ACCOUNTANT_PASSWORD = "USB@123.26"


@pytest.fixture(scope="module")
def se_token():
    """Get Site Engineer token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": SE_EMAIL,
        "password": SE_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"SE login failed: {response.text}")
    return response.json().get("token")


@pytest.fixture(scope="module")
def accountant_token():
    """Get Accountant token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ACCOUNTANT_EMAIL,
        "password": ACCOUNTANT_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Accountant login failed: {response.text}")
    return response.json().get("token")


# Store created allowance IDs for cleanup/verification
created_allowance_ids = []


class TestPetrolAllowance:
    """Petrol Allowance feature tests"""
    
    def test_se_request_petrol_allowance(self, se_token):
        """SE can request petrol allowance with amount and KM"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"amount": 500, "km": 25},
            headers=headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "allowance_id" in data
        assert data["amount"] == 500
        assert data["km"] == 25
        assert data["status"] == "requested"
        created_allowance_ids.append(data["allowance_id"])
        print(f"✓ Created petrol allowance: {data['allowance_id']}")
    
    def test_se_request_petrol_allowance_validation_no_amount(self, se_token):
        """SE cannot request petrol allowance without amount"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"km": 25},
            headers=headers
        )
        assert response.status_code == 400
        assert "Amount is required" in response.json().get("detail", "")
        print("✓ Validation: Amount required")
    
    def test_se_request_petrol_allowance_validation_no_km(self, se_token):
        """SE cannot request petrol allowance without KM"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"amount": 500},
            headers=headers
        )
        assert response.status_code == 400
        assert "KM is required" in response.json().get("detail", "")
        print("✓ Validation: KM required")
    
    def test_se_petrol_history(self, se_token):
        """SE can view petrol allowance history"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/site-engineer/petrol-allowance/history", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ SE petrol history: {len(data)} records")
    
    def test_accountant_get_petrol_requests(self, accountant_token):
        """Accountant can view all petrol allowance requests"""
        headers = {"Authorization": f"Bearer {accountant_token}"}
        response = requests.get(f"{BASE_URL}/api/accountant/petrol-allowance", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Accountant sees {len(data)} petrol requests")
    
    def test_accountant_approve_petrol_allowance(self, accountant_token, se_token):
        """Accountant can approve petrol allowance"""
        # First create a new request to approve
        se_headers = {"Authorization": f"Bearer {se_token}"}
        create_resp = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"amount": 300, "km": 15},
            headers=se_headers
        )
        assert create_resp.status_code == 200
        allowance_id = create_resp.json()["allowance_id"]
        created_allowance_ids.append(allowance_id)
        
        # Accountant approves
        acc_headers = {"Authorization": f"Bearer {accountant_token}"}
        response = requests.patch(f"{BASE_URL}/api/accountant/petrol-allowance/{allowance_id}/approve", 
            headers=acc_headers
        )
        assert response.status_code == 200
        assert response.json().get("status") == "approved"
        print(f"✓ Accountant approved petrol allowance: {allowance_id}")
        
        # Verify in SE history
        history_resp = requests.get(f"{BASE_URL}/api/site-engineer/petrol-allowance/history", headers=se_headers)
        approved_record = next((r for r in history_resp.json() if r["allowance_id"] == allowance_id), None)
        assert approved_record is not None
        assert approved_record["status"] == "approved"
    
    def test_accountant_reject_petrol_allowance(self, accountant_token, se_token):
        """Accountant can reject petrol allowance"""
        # First create a new request to reject
        se_headers = {"Authorization": f"Bearer {se_token}"}
        create_resp = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"amount": 200, "km": 10},
            headers=se_headers
        )
        assert create_resp.status_code == 200
        allowance_id = create_resp.json()["allowance_id"]
        created_allowance_ids.append(allowance_id)
        
        # Accountant rejects
        acc_headers = {"Authorization": f"Bearer {accountant_token}"}
        response = requests.patch(f"{BASE_URL}/api/accountant/petrol-allowance/{allowance_id}/reject", 
            json={"reason": "Test rejection"},
            headers=acc_headers
        )
        assert response.status_code == 200
        print(f"✓ Accountant rejected petrol allowance: {allowance_id}")
        
        # Verify in SE history
        history_resp = requests.get(f"{BASE_URL}/api/site-engineer/petrol-allowance/history", headers=se_headers)
        rejected_record = next((r for r in history_resp.json() if r["allowance_id"] == allowance_id), None)
        assert rejected_record is not None
        assert rejected_record["status"] == "rejected"
    
    def test_accountant_cannot_approve_already_approved(self, accountant_token, se_token):
        """Accountant cannot approve already approved request"""
        # Create and approve
        se_headers = {"Authorization": f"Bearer {se_token}"}
        create_resp = requests.post(f"{BASE_URL}/api/site-engineer/petrol-allowance", 
            json={"amount": 100, "km": 5},
            headers=se_headers
        )
        allowance_id = create_resp.json()["allowance_id"]
        created_allowance_ids.append(allowance_id)
        
        acc_headers = {"Authorization": f"Bearer {accountant_token}"}
        requests.patch(f"{BASE_URL}/api/accountant/petrol-allowance/{allowance_id}/approve", headers=acc_headers)
        
        # Try to approve again
        response = requests.patch(f"{BASE_URL}/api/accountant/petrol-allowance/{allowance_id}/approve", headers=acc_headers)
        assert response.status_code == 400
        assert "Cannot approve" in response.json().get("detail", "")
        print("✓ Cannot double-approve petrol allowance")


class TestGPSMandatoryAttendance:
    """GPS Mandatory Attendance tests"""
    
    def test_attendance_login_requires_gps(self, se_token):
        """Attendance login fails without valid GPS coordinates"""
        headers = {"Authorization": f"Bearer {se_token}"}
        
        # First get a project to login to
        projects_resp = requests.get(f"{BASE_URL}/api/site-engineer/my-projects", headers=headers)
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects assigned to SE")
        
        project_id = projects_resp.json()[0]["project_id"]
        
        # Try login with 0,0 coordinates (invalid GPS)
        response = requests.post(f"{BASE_URL}/api/attendance/login", 
            json={"project_id": project_id, "latitude": 0, "longitude": 0},
            headers=headers
        )
        assert response.status_code == 400
        detail = response.json().get("detail", "").lower()
        assert "gps" in detail or "location" in detail
        print("✓ Attendance login rejected without valid GPS")
    
    def test_attendance_login_with_valid_gps(self, se_token):
        """Attendance login succeeds with valid GPS coordinates"""
        headers = {"Authorization": f"Bearer {se_token}"}
        
        # First logout if already logged in
        requests.post(f"{BASE_URL}/api/attendance/gps-lost-logout", headers=headers)
        
        # Get a project
        projects_resp = requests.get(f"{BASE_URL}/api/site-engineer/my-projects", headers=headers)
        if projects_resp.status_code != 200 or not projects_resp.json():
            pytest.skip("No projects assigned to SE")
        
        project = projects_resp.json()[0]
        project_id = project["project_id"]
        
        # Use project coordinates if available, else use Chennai coordinates
        lat = float(project.get("latitude") or 13.0827)
        lng = float(project.get("longitude") or 80.2707)
        
        response = requests.post(f"{BASE_URL}/api/attendance/login", 
            json={"project_id": project_id, "latitude": lat, "longitude": lng},
            headers=headers
        )
        # Could be 200 (success) or 400 (already logged in)
        if response.status_code == 400 and "already logged in" in response.json().get("detail", "").lower():
            print("✓ SE already logged in (expected)")
        else:
            assert response.status_code == 200, f"Login failed: {response.text}"
            assert "login_time" in response.json()
            print(f"✓ Attendance login successful: {response.json().get('message')}")
    
    def test_gps_lost_auto_logout_endpoint(self, se_token):
        """GPS-lost auto-logout endpoint works"""
        headers = {"Authorization": f"Bearer {se_token}"}
        
        response = requests.post(f"{BASE_URL}/api/attendance/gps-lost-logout", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Status can be: auto_logout, no_record, not_active
        assert data.get("status") in ["auto_logout", "no_record", "not_active"]
        print(f"✓ GPS-lost logout endpoint: status={data.get('status')}")
    
    def test_attendance_today_endpoint(self, se_token):
        """SE can check today's attendance"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/attendance/my-today", headers=headers)
        assert response.status_code == 200
        # Can be null or attendance record
        print(f"✓ Today's attendance endpoint works")
    
    def test_attendance_history_endpoint(self, se_token):
        """SE can view attendance history"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/attendance/my-history", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Attendance history: {len(data)} records")


class TestRegressionPettyCash:
    """Regression tests for existing Petty Cash features"""
    
    def test_petty_cash_summary(self, se_token):
        """SE can get petty cash summary"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/site-engineer/petty-cash/summary", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ Petty cash summary accessible")
    
    def test_petty_cash_list(self, se_token):
        """SE can get petty cash list"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/site-engineer/petty-cash", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Petty cash list: {len(data)} records")
    
    def test_income_history(self, se_token):
        """SE can get income history"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/site-engineer/petty-cash/income-history", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Income history: {len(data)} records")
    
    def test_direct_expenses(self, se_token):
        """SE can get direct expenses"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/site-engineer/direct-expenses", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Direct expenses: {len(data)} records")
    
    def test_expense_categories(self, se_token):
        """SE can get expense categories"""
        headers = {"Authorization": f"Bearer {se_token}"}
        response = requests.get(f"{BASE_URL}/api/expense-categories", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Expense categories: {len(data)} categories")


class TestAccountantBoard:
    """Accountant board tests"""
    
    def test_accountant_petty_cash_management(self, accountant_token):
        """Accountant can access petty cash management"""
        headers = {"Authorization": f"Bearer {accountant_token}"}
        response = requests.get(f"{BASE_URL}/api/accountant/petty-cash-management", headers=headers)
        assert response.status_code == 200
        print(f"✓ Accountant petty cash management accessible")
    
    def test_accountant_petty_cash_list(self, accountant_token):
        """Accountant can get petty cash list"""
        headers = {"Authorization": f"Bearer {accountant_token}"}
        response = requests.get(f"{BASE_URL}/api/accountant/petty-cash", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Accountant petty cash list: {len(data)} records")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
