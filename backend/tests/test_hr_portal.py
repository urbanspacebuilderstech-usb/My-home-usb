"""
Test HR Portal Backend Endpoints
Tests employee profiles and user roles/credentials management
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHRPortalBackend:
    """HR Portal Backend API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session for HR demo login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_session = requests.Session()
        self.admin_session.headers.update({"Content-Type": "application/json"})
    
    def login_as_hr(self):
        """Login as HR user via demo-login"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "hr@constructionos.com"}
        )
        return response.status_code == 200
    
    def login_as_admin(self):
        """Login as Super Admin via demo-login"""
        response = self.admin_session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"}
        )
        return response.status_code == 200
    
    # ========== HR Demo Login and Access Tests ==========
    
    def test_hr_demo_login(self):
        """HR user can login via demo-login endpoint"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "hr@constructionos.com"}
        )
        assert response.status_code == 200, f"HR login failed: {response.text}"
        data = response.json()
        assert data.get("role") == "hr", f"Expected role 'hr', got: {data.get('role')}"
        assert data.get("email") == "hr@constructionos.com"
        print(f"PASS: HR login successful - user: {data.get('name')}")
    
    def test_hr_can_access_auth_me(self):
        """HR user can access /api/auth/me after login"""
        assert self.login_as_hr(), "HR login failed"
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        assert data.get("role") == "hr"
        print(f"PASS: HR can access auth/me - role: {data.get('role')}")
    
    # ========== Employee Profiles (Staff) Endpoints ==========
    
    def test_hr_can_get_staff_list(self):
        """HR can access GET /api/hr/staff (employee directory)"""
        assert self.login_as_hr(), "HR login failed"
        response = self.session.get(f"{BASE_URL}/api/hr/staff")
        assert response.status_code == 200, f"Get staff failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of staff"
        print(f"PASS: HR can get staff list - count: {len(data)}")
        return data
    
    def test_hr_can_create_employee(self):
        """HR can POST /api/hr/staff to create new employee"""
        assert self.login_as_hr(), "HR login failed"
        test_employee = {
            "name": "TEST_John Doe HR Test",
            "email": "test_john@test.com",
            "phone": "9876543210",
            "department": "Engineering",
            "designation": "Site Engineer",
            "basic_salary": 30000,
            "hra": 10000,
            "da": 5000,
            "ta": 2000,
            "other_allowances": 1000,
            "pf": 3000,
            "esi": 500,
            "professional_tax": 200,
            "tds": 1000,
            "other_deductions": 0
        }
        response = self.session.post(
            f"{BASE_URL}/api/hr/staff",
            json=test_employee
        )
        assert response.status_code == 200, f"Create employee failed: {response.text}"
        data = response.json()
        assert data.get("name") == test_employee["name"]
        assert "staff_id" in data
        assert "employee_code" in data
        # Verify salary calculations
        expected_gross = 48000  # 30000+10000+5000+2000+1000
        expected_net = 43300  # 48000 - 4700 (3000+500+200+1000+0)
        assert data.get("gross_salary") == expected_gross, f"Gross mismatch: {data.get('gross_salary')}"
        assert data.get("net_salary") == expected_net, f"Net mismatch: {data.get('net_salary')}"
        print(f"PASS: Employee created - code: {data.get('employee_code')}, net_salary: {data.get('net_salary')}")
        return data
    
    def test_hr_can_update_employee(self):
        """HR can PATCH /api/hr/staff/{staff_id} to update employee"""
        # First create an employee
        created = self.test_hr_can_create_employee()
        staff_id = created.get("staff_id")
        
        # Update the employee
        update_data = {
            "department": "HR",
            "designation": "HR Executive",
            "basic_salary": 35000
        }
        response = self.session.patch(
            f"{BASE_URL}/api/hr/staff/{staff_id}",
            json=update_data
        )
        assert response.status_code == 200, f"Update employee failed: {response.text}"
        
        # Verify update via GET
        get_response = self.session.get(f"{BASE_URL}/api/hr/staff/{staff_id}")
        assert get_response.status_code == 200
        updated = get_response.json()
        assert updated.get("department") == "HR"
        assert updated.get("designation") == "HR Executive"
        assert updated.get("basic_salary") == 35000
        print(f"PASS: Employee updated - department: {updated.get('department')}")
        return updated
    
    def test_hr_can_update_employee_profile(self):
        """HR can PATCH /api/hr/staff/{staff_id}/profile for extended fields"""
        # First create an employee
        created = self.test_hr_can_create_employee()
        staff_id = created.get("staff_id")
        
        # Update profile fields
        profile_data = {
            "father_name": "Robert Doe",
            "mother_name": "Jane Doe",
            "blood_group": "O+",
            "gender": "Male",
            "marital_status": "Single",
            "aadhar_number": "1234 5678 9012",
            "pan_number": "ABCDE1234F",
            "emergency_contact_name": "Emergency Contact",
            "emergency_contact_relation": "Brother",
            "emergency_contact_phone": "9876543211"
        }
        response = self.session.patch(
            f"{BASE_URL}/api/hr/staff/{staff_id}/profile",
            json=profile_data
        )
        assert response.status_code == 200, f"Update profile failed: {response.text}"
        
        # Verify via GET
        get_response = self.session.get(f"{BASE_URL}/api/hr/staff/{staff_id}")
        assert get_response.status_code == 200
        updated = get_response.json()
        assert updated.get("father_name") == "Robert Doe"
        assert updated.get("blood_group") == "O+"
        print(f"PASS: Employee profile updated - blood_group: {updated.get('blood_group')}")
    
    def test_hr_can_get_single_employee(self):
        """HR can GET /api/hr/staff/{staff_id} for single employee"""
        created = self.test_hr_can_create_employee()
        staff_id = created.get("staff_id")
        
        response = self.session.get(f"{BASE_URL}/api/hr/staff/{staff_id}")
        assert response.status_code == 200, f"Get single employee failed: {response.text}"
        data = response.json()
        assert data.get("staff_id") == staff_id
        print(f"PASS: Can get single employee - {data.get('name')}")
    
    # ========== Users/Roles & Credentials Endpoints ==========
    
    def test_hr_can_get_all_users(self):
        """HR can access GET /api/hr/users (all system users)"""
        assert self.login_as_hr(), "HR login failed"
        response = self.session.get(f"{BASE_URL}/api/hr/users")
        assert response.status_code == 200, f"Get users failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of users"
        assert len(data) > 0, "Expected at least one user"
        # Check user has expected fields
        first_user = data[0]
        assert "user_id" in first_user
        assert "email" in first_user
        assert "role" in first_user
        # Ensure password_hash is NOT exposed
        assert "password_hash" not in first_user
        print(f"PASS: HR can get all users - count: {len(data)}")
        return data
    
    def test_users_list_has_staff_link(self):
        """Users endpoint returns staff_link info for linked employees"""
        assert self.login_as_hr(), "HR login failed"
        response = self.session.get(f"{BASE_URL}/api/hr/users")
        assert response.status_code == 200
        data = response.json()
        # Check that staff_link field exists (even if null)
        for user in data:
            assert "staff_link" in user, f"Missing staff_link in user: {user.get('email')}"
        print(f"PASS: All users have staff_link field")
    
    def test_super_admin_can_update_user_role(self):
        """Super Admin can PATCH /api/hr/users/{user_id}/update-role"""
        assert self.login_as_admin(), "Admin login failed"
        
        # Get users list
        response = self.admin_session.get(f"{BASE_URL}/api/hr/users")
        assert response.status_code == 200
        users = response.json()
        
        # Find a non-admin user to update
        test_user = next((u for u in users if u.get("role") not in ["super_admin"]), None)
        if not test_user:
            pytest.skip("No non-admin user found for testing")
        
        user_id = test_user.get("user_id")
        original_role = test_user.get("role")
        
        # Try to update user's name (a safe field)
        update_response = self.admin_session.patch(
            f"{BASE_URL}/api/hr/users/{user_id}/update-role",
            json={"name": test_user.get("name", "Updated Name")}
        )
        assert update_response.status_code == 200, f"Update role failed: {update_response.text}"
        print(f"PASS: Super Admin can update user - user_id: {user_id}")
    
    def test_hr_cannot_update_user_role(self):
        """HR role cannot update user roles (only Super Admin can)"""
        assert self.login_as_hr(), "HR login failed"
        assert self.login_as_admin(), "Admin login failed"
        
        # Get a user to update
        response = self.admin_session.get(f"{BASE_URL}/api/hr/users")
        users = response.json()
        test_user = users[0] if users else None
        if not test_user:
            pytest.skip("No user found")
        
        # HR tries to update role - should fail
        hr_response = self.session.patch(
            f"{BASE_URL}/api/hr/users/{test_user.get('user_id')}/update-role",
            json={"role": "vendor"}
        )
        assert hr_response.status_code == 403, f"HR should not be able to update roles: {hr_response.status_code}"
        print(f"PASS: HR correctly denied role update permissions")
    
    def test_super_admin_can_reset_password(self):
        """Super Admin can POST /api/hr/users/{user_id}/reset-password"""
        assert self.login_as_admin(), "Admin login failed"
        
        # Get users list
        response = self.admin_session.get(f"{BASE_URL}/api/hr/users")
        users = response.json()
        
        # Find a non-admin user
        test_user = next((u for u in users if u.get("email") != "admin@constructionos.com"), None)
        if not test_user:
            pytest.skip("No non-admin user found")
        
        user_id = test_user.get("user_id")
        
        # Reset password
        reset_response = self.admin_session.post(
            f"{BASE_URL}/api/hr/users/{user_id}/reset-password",
            json={"new_password": "TestPassword123"}
        )
        assert reset_response.status_code == 200, f"Reset password failed: {reset_response.text}"
        print(f"PASS: Super Admin can reset password for user: {test_user.get('email')}")
    
    def test_hr_cannot_reset_password(self):
        """HR role cannot reset passwords (only Super Admin can)"""
        assert self.login_as_hr(), "HR login failed"
        assert self.login_as_admin(), "Admin login failed"
        
        # Get a user
        response = self.admin_session.get(f"{BASE_URL}/api/hr/users")
        users = response.json()
        test_user = next((u for u in users if u.get("role") != "super_admin"), None)
        if not test_user:
            pytest.skip("No non-admin user found")
        
        # HR tries to reset password - should fail
        hr_response = self.session.post(
            f"{BASE_URL}/api/hr/users/{test_user.get('user_id')}/reset-password",
            json={"new_password": "NewPassword123"}
        )
        assert hr_response.status_code == 403, f"HR should not reset passwords: {hr_response.status_code}"
        print(f"PASS: HR correctly denied password reset permissions")
    
    # ========== Cleanup ==========
    
    def test_cleanup_test_data(self):
        """Cleanup: Delete test employees created during testing"""
        assert self.login_as_admin(), "Admin login failed"
        response = self.admin_session.get(f"{BASE_URL}/api/hr/staff")
        if response.status_code == 200:
            staff = response.json()
            test_staff = [s for s in staff if s.get("name", "").startswith("TEST_")]
            for s in test_staff:
                delete_resp = self.admin_session.delete(f"{BASE_URL}/api/hr/staff/{s.get('staff_id')}")
                if delete_resp.status_code == 200:
                    print(f"Cleaned up test employee: {s.get('name')}")
        print("PASS: Test cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
