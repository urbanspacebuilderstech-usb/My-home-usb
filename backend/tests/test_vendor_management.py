"""
Vendor Management System Tests
Tests for:
- Vendor list page at /vendor-management
- Vendor categories CRUD
- Vendor CRUD with brands
- Vendor summary endpoint
- Project vendor assignments
- Purchase orders
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stage-popup.preview.emergentagent.com').rstrip('/')


class TestVendorCategories:
    """Vendor Categories CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user"""
        self.session = requests.Session()
        # Login as planning user
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.user = response.json()
        yield
        
    def test_get_vendor_categories(self):
        """Test GET /api/vendor-categories returns list of categories"""
        response = self.session.get(f"{BASE_URL}/api/vendor-categories")
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Check seeded categories exist
        category_names = [c.get("name") for c in data]
        assert "Cement" in category_names, "Cement category should be seeded"
        assert "Steel" in category_names, "Steel category should be seeded"
        assert "Sand" in category_names, "Sand category should be seeded"
        print(f"Found {len(data)} vendor categories")
        
    def test_create_vendor_category(self):
        """Test POST /api/vendor-categories creates a new category"""
        unique_name = f"TEST_Category_{uuid.uuid4().hex[:6]}"
        response = self.session.post(f"{BASE_URL}/api/vendor-categories", json={
            "name": unique_name
        })
        assert response.status_code == 200, f"Failed to create category: {response.text}"
        data = response.json()
        assert data.get("name") == unique_name, "Category name should match"
        assert "category_id" in data, "Response should include category_id"
        print(f"Created category: {unique_name} with id: {data.get('category_id')}")
        
    def test_create_duplicate_category_fails(self):
        """Test creating duplicate category returns 400"""
        # First create a category
        unique_name = f"TEST_DupCat_{uuid.uuid4().hex[:6]}"
        response = self.session.post(f"{BASE_URL}/api/vendor-categories", json={
            "name": unique_name
        })
        assert response.status_code == 200
        
        # Try to create the same category again
        response = self.session.post(f"{BASE_URL}/api/vendor-categories", json={
            "name": unique_name
        })
        assert response.status_code == 400, "Duplicate category should return 400"


class TestVendorMaster:
    """Vendor Master CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200
        yield
        
    def test_get_vendors_list(self):
        """Test GET /api/vendor-master returns list of vendors"""
        response = self.session.get(f"{BASE_URL}/api/vendor-master")
        assert response.status_code == 200, f"Failed to get vendors: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} vendors")
        
    def test_create_vendor_with_all_fields(self):
        """Test POST /api/vendor-master creates vendor with all fields"""
        vendor_name = f"TEST_Vendor_{uuid.uuid4().hex[:6]}"
        vendor_data = {
            "name": vendor_name,
            "contact_person": "Test Contact",
            "phone": "9876543210",
            "email": "test@vendor.com",
            "address": "Test Address, Chennai",
            "vendor_type": "Cement",
            "bank_name": "Test Bank",
            "account_number": "1234567890",
            "ifsc_code": "TEST0001234",
            "upi_id": "test@upi",
            "brands": [
                {"category": "Cement", "brand_names": ["UltraTech", "Zuari"]},
                {"category": "Steel", "brand_names": ["TATA", "JSW"]}
            ],
            "payment_cycle": "30_days",
            "gst_number": "33AAAAA0000A1Z5",
            "gst_type": "regular",
            "payment_terms": "credit",
            "credit_limit": 500000,
            "credit_days": 30
        }
        response = self.session.post(f"{BASE_URL}/api/vendor-master", json=vendor_data)
        assert response.status_code == 200, f"Failed to create vendor: {response.text}"
        data = response.json()
        assert data.get("name") == vendor_name, "Vendor name should match"
        assert "vendor_id" in data, "Response should include vendor_id"
        assert data.get("vendor_type") == "Cement", "Vendor type should match"
        assert len(data.get("brands", [])) == 2, "Brands should be saved"
        print(f"Created vendor: {vendor_name} with id: {data.get('vendor_id')}")
        return data.get("vendor_id")
        
    def test_vendor_summary_endpoint(self):
        """Test GET /api/vendor-master/{vendor_id}/summary returns vendor summary"""
        # First get a vendor
        vendors_response = self.session.get(f"{BASE_URL}/api/vendor-master")
        vendors = vendors_response.json()
        
        if vendors:
            vendor_id = vendors[0].get("vendor_id")
            response = self.session.get(f"{BASE_URL}/api/vendor-master/{vendor_id}/summary")
            assert response.status_code == 200, f"Failed to get vendor summary: {response.text}"
            data = response.json()
            assert "vendor" in data, "Response should include vendor"
            assert "stats" in data, "Response should include stats"
            assert "orders" in data, "Response should include orders"
            assert "projects" in data, "Response should include projects"
            
            # Validate stats structure
            stats = data.get("stats", {})
            assert "total_orders" in stats, "Stats should include total_orders"
            assert "total_order_value" in stats, "Stats should include total_order_value"
            assert "paid_amount" in stats, "Stats should include paid_amount"
            assert "pending_amount" in stats, "Stats should include pending_amount"
            print(f"Vendor summary stats: {stats}")
        else:
            pytest.skip("No vendors available to test summary")


class TestProjectVendorAssignments:
    """Project Vendor Assignments tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        assert response.status_code == 200
        self.project_id = "proj_12f23331b542"  # Test project ID from requirements
        yield
        
    def test_get_project_vendor_assignments(self):
        """Test GET /api/projects/{project_id}/vendor-assignments"""
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/vendor-assignments")
        assert response.status_code == 200, f"Failed to get assignments: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} vendor assignments for project {self.project_id}")
        
    def test_assign_vendor_to_project(self):
        """Test POST /api/projects/{project_id}/vendor-assignments"""
        # Get a vendor first
        vendors_response = self.session.get(f"{BASE_URL}/api/vendor-master")
        vendors = vendors_response.json()
        
        if vendors:
            vendor = vendors[0]
            category = f"TEST_Category_{uuid.uuid4().hex[:4]}"
            
            response = self.session.post(f"{BASE_URL}/api/projects/{self.project_id}/vendor-assignments", json={
                "vendor_id": vendor.get("vendor_id"),
                "category": category,
                "brand": "TestBrand"
            })
            assert response.status_code == 200, f"Failed to assign vendor: {response.text}"
            data = response.json()
            # Should return assignment or message
            if "assignment_id" in data:
                assert data.get("vendor_id") == vendor.get("vendor_id"), "Vendor ID should match"
                assert data.get("category") == category, "Category should match"
                print(f"Assigned vendor {vendor.get('name')} to category {category}")
            else:
                assert "message" in data, "Should return message on update"
                print(f"Assignment result: {data}")
        else:
            pytest.skip("No vendors available to test assignment")
            
    def test_remove_vendor_assignment(self):
        """Test DELETE /api/projects/{project_id}/vendor-assignments/{category}"""
        # First create an assignment
        vendors_response = self.session.get(f"{BASE_URL}/api/vendor-master")
        vendors = vendors_response.json()
        
        if vendors:
            vendor = vendors[0]
            category = f"TEST_RemoveCat_{uuid.uuid4().hex[:4]}"
            
            # Create assignment
            self.session.post(f"{BASE_URL}/api/projects/{self.project_id}/vendor-assignments", json={
                "vendor_id": vendor.get("vendor_id"),
                "category": category
            })
            
            # Remove assignment
            response = self.session.delete(
                f"{BASE_URL}/api/projects/{self.project_id}/vendor-assignments/{category}"
            )
            assert response.status_code == 200, f"Failed to remove assignment: {response.text}"
            print(f"Removed vendor assignment for category {category}")
        else:
            pytest.skip("No vendors available to test removal")
            
    def test_assign_vendor_permission_denied(self):
        """Test that non-planning roles cannot assign vendors"""
        import time
        time.sleep(1)  # Avoid rate limiting
        
        # Login as CRE (should not be able to assign)
        session = requests.Session()
        login_resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        if login_resp.status_code != 200:
            pytest.skip(f"Login failed with status {login_resp.status_code}")
        
        # Get vendors using existing session
        vendors_response = self.session.get(f"{BASE_URL}/api/vendor-master")
        if vendors_response.status_code != 200:
            pytest.skip("Could not get vendors list")
            
        vendors = vendors_response.json()
        
        if vendors and len(vendors) > 0:
            vendor = vendors[0]
            response = session.post(f"{BASE_URL}/api/projects/{self.project_id}/vendor-assignments", json={
                "vendor_id": vendor.get("vendor_id"),
                "category": "TestCategory"
            })
            assert response.status_code == 403, f"CRE should not be able to assign vendors, got {response.status_code}"
        else:
            pytest.skip("No vendors available")


class TestPurchaseOrders:
    """Purchase Orders tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with planning user"""
        import time
        time.sleep(2)  # Avoid rate limiting
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed with status {response.status_code}")
        self.project_id = "proj_12f23331b542"
        yield
        
    def test_get_purchase_orders_for_project(self):
        """Test GET /api/purchase-orders?project_id={project_id}"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders?project_id={self.project_id}")
        assert response.status_code == 200, f"Failed to get POs: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} purchase orders for project {self.project_id}")


class TestPlanningNavigation:
    """Test that Planning header has Vendors link"""
    
    def test_planning_user_can_access_vendor_master(self):
        """Test that planning user can access vendor master endpoint"""
        import time
        time.sleep(2)  # Avoid rate limiting
        
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200, f"Login failed: {response.status_code}"
        
        # Can access vendor-master
        response = session.get(f"{BASE_URL}/api/vendor-master")
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200
        
        # Can access vendor-categories
        response = session.get(f"{BASE_URL}/api/vendor-categories")
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200
        
        print("Planning user has access to vendor endpoints")
        
    def test_procurement_user_can_access_vendors(self):
        """Test that procurement user can access vendor endpoints"""
        import time
        time.sleep(2)  # Avoid rate limiting
        
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "procurement@constructionos.com"
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200, f"Login failed: {response.status_code}"
        
        # Can access vendor-master
        response = session.get(f"{BASE_URL}/api/vendor-master")
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200
        
        print("Procurement user has access to vendor endpoints")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
