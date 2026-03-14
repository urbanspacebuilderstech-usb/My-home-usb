#!/usr/bin/env python3
"""
Construction CRM Backend API Testing Suite
Tests all endpoints with proper authentication and role-based access control
"""

import requests
import sys
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

class ConstructionCRMTester:
    def __init__(self, base_url="https://project-manager-hub-5.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session_tokens = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        
        # Demo user credentials from seed data
        self.demo_users = {
            "super_admin": {"email": "admin@constructionos.com", "user_id": "user_superadmin001"},
            "accountant": {"email": "accountant@constructionos.com", "user_id": "user_accountant001"},
            "project_manager": {"email": "pm@constructionos.com", "user_id": "user_pm001"},
            "planning": {"email": "planning@constructionos.com", "user_id": "user_planning001"},
            "procurement": {"email": "procurement@constructionos.com", "user_id": "user_procurement001"},
            "site_engineer": {"email": "engineer@constructionos.com", "user_id": "user_engineer001"},
            "client": {"email": "raj@client.com", "user_id": "user_client001"}
        }

    def log_test(self, name: str, success: bool, status_code: int = None, error: str = None):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - Status: {status_code}")
        else:
            self.failed_tests.append({"name": name, "error": error, "status": status_code})
            print(f"❌ {name} - Status: {status_code}, Error: {error}")

    def make_request(self, method: str, endpoint: str, data: Dict = None, 
                    user_role: str = None, expected_status: int = 200) -> tuple:
        """Make authenticated API request"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Add authentication if user role specified
        if user_role and user_role in self.session_tokens:
            headers['Authorization'] = f'Bearer {self.session_tokens[user_role]}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            success = response.status_code == expected_status
            response_data = {}
            try:
                response_data = response.json()
            except:
                pass
                
            return success, response.status_code, response_data
            
        except Exception as e:
            return False, 0, {"error": str(e)}

    def setup_test_sessions(self):
        """Create test session tokens for all user roles"""
        print("\n🔧 Setting up test session tokens...")
        
        # For testing purposes, we'll create mock session tokens
        # In a real scenario, these would come from OAuth flow
        test_sessions = {
            "super_admin": "test_session_superadmin_001",
            "accountant": "test_session_accountant_001", 
            "project_manager": "test_session_pm_001",
            "planning": "test_session_planning_001",
            "procurement": "test_session_procurement_001",
            "site_engineer": "test_session_engineer_001",
            "client": "test_session_client_001"
        }
        
        # Store session tokens for testing
        self.session_tokens = test_sessions
        print("✅ Test session tokens created")

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Authentication Endpoints...")
        
        # Test /auth/me without token
        success, status, _ = self.make_request('GET', 'auth/me', expected_status=401)
        self.log_test("Auth /me without token (should fail)", success, status)
        
        # Test /auth/me with invalid token
        headers = {'Authorization': 'Bearer invalid_token'}
        try:
            response = requests.get(f"{self.base_url}/auth/me", headers=headers)
            success = response.status_code == 401
            self.log_test("Auth /me with invalid token (should fail)", success, response.status_code)
        except Exception as e:
            self.log_test("Auth /me with invalid token", False, 0, str(e))

    def test_projects_endpoints(self):
        """Test project management endpoints"""
        print("\n🏗️ Testing Project Endpoints...")
        
        # Test GET /projects (should work for all authenticated users)
        success, status, data = self.make_request('GET', 'projects', user_role='super_admin')
        self.log_test("GET /projects as Super Admin", success, status)
        
        if success and isinstance(data, list):
            print(f"   Found {len(data)} projects")
            # Check if Classic Condo project exists
            classic_condo = next((p for p in data if p.get('name') == 'Classic Condo'), None)
            if classic_condo:
                print(f"   ✓ Found Classic Condo project: {classic_condo.get('project_id')}")
            else:
                print("   ⚠️ Classic Condo project not found")
        
        # Test GET /projects as client (should only see their projects)
        success, status, data = self.make_request('GET', 'projects', user_role='client')
        self.log_test("GET /projects as Client", success, status)
        
        # Test GET specific project
        success, status, data = self.make_request('GET', 'projects/proj_classic001', user_role='super_admin')
        self.log_test("GET /projects/proj_classic001", success, status)
        
        # Test POST /projects (only Super Admin and Project Manager should succeed)
        new_project = {
            "name": "Test Project",
            "client_name": "Test Client",
            "location": "Test Location",
            "total_value": 1000000,
            "start_date": datetime.now(timezone.utc).isoformat(),
            "expected_completion": (datetime.now(timezone.utc) + timedelta(days=180)).isoformat()
        }
        
        success, status, data = self.make_request('POST', 'projects', data=new_project, 
                                                user_role='super_admin', expected_status=200)
        self.log_test("POST /projects as Super Admin", success, status)
        
        # Test POST /projects as unauthorized user (should fail)
        success, status, data = self.make_request('POST', 'projects', data=new_project, 
                                                user_role='client', expected_status=403)
        self.log_test("POST /projects as Client (should fail)", success, status)

    def test_boq_endpoints(self):
        """Test BOQ management endpoints"""
        print("\n📋 Testing BOQ Endpoints...")
        
        # Test GET BOQ for Classic Condo project
        success, status, data = self.make_request('GET', 'boq/proj_classic001', user_role='super_admin')
        self.log_test("GET /boq/proj_classic001", success, status)
        
        if success and isinstance(data, list):
            print(f"   Found {len(data)} BOQ items")
            for item in data[:3]:  # Show first 3 items
                print(f"   - {item.get('item_name')}: {item.get('quantity')} {item.get('unit')} @ ₹{item.get('unit_rate')}")
        
        # Test POST BOQ (only Planning role should succeed)
        new_boq_item = {
            "project_id": "proj_classic001",
            "item_name": "Test Material",
            "category": "material",
            "unit": "Bag",
            "quantity": 10,
            "unit_rate": 500,
            "total_cost": 5000
        }
        
        success, status, data = self.make_request('POST', 'boq', data=new_boq_item, 
                                                user_role='planning', expected_status=200)
        self.log_test("POST /boq as Planning", success, status)
        
        # Test POST BOQ as unauthorized user (should fail)
        success, status, data = self.make_request('POST', 'boq', data=new_boq_item, 
                                                user_role='accountant', expected_status=403)
        self.log_test("POST /boq as Accountant (should fail)", success, status)

    def test_work_orders_endpoints(self):
        """Test work order management endpoints"""
        print("\n📝 Testing Work Order Endpoints...")
        
        # Test GET work orders for different roles
        success, status, data = self.make_request('GET', 'work-orders', user_role='super_admin')
        self.log_test("GET /work-orders as Super Admin", success, status)
        
        success, status, data = self.make_request('GET', 'work-orders', user_role='accountant')
        self.log_test("GET /work-orders as Accountant", success, status)
        
        success, status, data = self.make_request('GET', 'work-orders', user_role='procurement')
        self.log_test("GET /work-orders as Procurement", success, status)
        
        # Test POST work order (only Project Manager should succeed)
        new_work_order = {
            "project_id": "proj_classic001",
            "boq_id": "boq_cement001",
            "requested_quantity": 50,
            "estimated_cost": 21000,
            "purpose": "Test work order for cement"
        }
        
        success, status, data = self.make_request('POST', 'work-orders', data=new_work_order, 
                                                user_role='project_manager', expected_status=200)
        self.log_test("POST /work-orders as Project Manager", success, status)
        
        if success:
            work_order_id = data.get('work_order_id')
            print(f"   Created work order: {work_order_id}")
            
            # Test submit work order
            success, status, _ = self.make_request('PATCH', f'work-orders/{work_order_id}/submit', 
                                                 user_role='project_manager')
            self.log_test(f"PATCH /work-orders/{work_order_id}/submit", success, status)
            
            # Test approve work order (only Accountant should succeed)
            success, status, _ = self.make_request('PATCH', f'work-orders/{work_order_id}/approve', 
                                                 user_role='accountant')
            self.log_test(f"PATCH /work-orders/{work_order_id}/approve as Accountant", success, status)

    def test_vendors_endpoints(self):
        """Test vendor management endpoints"""
        print("\n🏪 Testing Vendor Endpoints...")
        
        # Test GET vendors
        success, status, data = self.make_request('GET', 'vendors', user_role='super_admin')
        self.log_test("GET /vendors", success, status)
        
        if success and isinstance(data, list):
            print(f"   Found {len(data)} vendors")
            balaji_vendor = next((v for v in data if 'Balaji' in v.get('name', '')), None)
            if balaji_vendor:
                print(f"   ✓ Found Sri Balaji Sand Suppliers: {balaji_vendor.get('vendor_id')}")
        
        # Test POST vendor (only Super Admin and Procurement should succeed)
        new_vendor = {
            "name": "Test Vendor Ltd",
            "contact_person": "Test Contact",
            "phone": "+91 9876543999",
            "email": "test@vendor.com",
            "address": "Test Address"
        }
        
        success, status, data = self.make_request('POST', 'vendors', data=new_vendor, 
                                                user_role='procurement', expected_status=200)
        self.log_test("POST /vendors as Procurement", success, status)

    def test_expenses_endpoints(self):
        """Test expense management endpoints"""
        print("\n💰 Testing Expense Endpoints...")
        
        # Test GET expenses
        success, status, data = self.make_request('GET', 'expenses', user_role='super_admin')
        self.log_test("GET /expenses", success, status)
        
        # Test GET expenses for specific project
        success, status, data = self.make_request('GET', 'expenses?project_id=proj_classic001', 
                                                user_role='accountant')
        self.log_test("GET /expenses for specific project", success, status)
        
        # Test POST expense (only Accountant should succeed)
        new_expense = {
            "project_id": "proj_classic001",
            "category": "Material",
            "amount": 5000,
            "description": "Test manual expense"
        }
        
        success, status, data = self.make_request('POST', 'expenses', data=new_expense, 
                                                user_role='accountant', expected_status=200)
        self.log_test("POST /expenses as Accountant", success, status)

    def test_dashboard_endpoints(self):
        """Test dashboard endpoints"""
        print("\n📊 Testing Dashboard Endpoints...")
        
        # Test Super Admin dashboard
        success, status, data = self.make_request('GET', 'dashboards/super-admin', user_role='super_admin')
        self.log_test("GET /dashboards/super-admin", success, status)
        
        if success:
            print(f"   Total Projects: {data.get('total_projects')}")
            print(f"   Total Project Value: ₹{data.get('total_project_value', 0):,}")
            print(f"   Total Received: ₹{data.get('total_received', 0):,}")
            print(f"   Balance: ₹{data.get('balance', 0):,}")
        
        # Test project dashboard
        success, status, data = self.make_request('GET', 'dashboards/project/proj_classic001', 
                                                user_role='super_admin')
        self.log_test("GET /dashboards/project/proj_classic001", success, status)

    def test_client_portal_endpoints(self):
        """Test client portal endpoints"""
        print("\n👤 Testing Client Portal Endpoints...")
        
        # Test client portal access (only Client role should succeed)
        success, status, data = self.make_request('GET', 'client-portal/project/proj_classic001', 
                                                user_role='client')
        self.log_test("GET /client-portal/project/proj_classic001 as Client", success, status)
        
        if success:
            project = data.get('project', {})
            print(f"   Project: {project.get('name')}")
            print(f"   Total Value: ₹{project.get('total_value', 0):,}")
            print(f"   Total Paid: ₹{data.get('total_paid', 0):,}")
            print(f"   Balance: ₹{data.get('balance', 0):,}")
            print(f"   Stages: {len(data.get('stages', []))}")
        
        # Test client portal access as non-client (should fail)
        success, status, data = self.make_request('GET', 'client-portal/project/proj_classic001', 
                                                user_role='accountant', expected_status=403)
        self.log_test("GET /client-portal as Accountant (should fail)", success, status)

    def test_notifications_endpoints(self):
        """Test notification endpoints"""
        print("\n🔔 Testing Notification Endpoints...")
        
        # Test GET notifications
        success, status, data = self.make_request('GET', 'notifications', user_role='accountant')
        self.log_test("GET /notifications", success, status)
        
        if success and isinstance(data, list):
            print(f"   Found {len(data)} notifications")

    def test_user_management_endpoints(self):
        """Test user management endpoints"""
        print("\n👥 Testing User Management Endpoints...")
        
        # Test GET users (only Super Admin should succeed)
        success, status, data = self.make_request('GET', 'users', user_role='super_admin')
        self.log_test("GET /users as Super Admin", success, status)
        
        if success and isinstance(data, list):
            print(f"   Found {len(data)} users")
            roles = [u.get('role') for u in data]
            print(f"   Roles: {set(roles)}")
        
        # Test GET users as non-admin (should fail)
        success, status, data = self.make_request('GET', 'users', user_role='accountant', expected_status=403)
        self.log_test("GET /users as Accountant (should fail)", success, status)

    def run_all_tests(self):
        """Run comprehensive test suite"""
        print("🚀 Starting Construction CRM Backend API Tests")
        print("=" * 60)
        
        # Setup
        self.setup_test_sessions()
        
        # Run all test categories
        self.test_auth_endpoints()
        self.test_projects_endpoints()
        self.test_boq_endpoints()
        self.test_work_orders_endpoints()
        self.test_vendors_endpoints()
        self.test_expenses_endpoints()
        self.test_dashboard_endpoints()
        self.test_client_portal_endpoints()
        self.test_notifications_endpoints()
        self.test_user_management_endpoints()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print(f"\n❌ Failed Tests ({len(self.failed_tests)}):")
            for test in self.failed_tests:
                print(f"   - {test['name']}: {test['error']} (Status: {test['status']})")
        else:
            print("\n✅ All tests passed!")
        
        return len(self.failed_tests) == 0

def main():
    """Main test execution"""
    tester = ConstructionCRMTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())