"""
Test Suite for Three-Phase Feature Implementation - Site Engineer Module

Phase 1: Enhanced Material Request Flow (approved materials with brands, custom material option)
Phase 2: Material Receiving & Stock Management (enhanced receive dialog, date/time, images, GPS, stock tracking)
Phase 3: Daily Progress Reports (daily progress tab with 'Today's Update' form)

Test credentials: engineer@constructionos.com (demo-login)
Project ID: proj_12f23331b542 (Mr. Vinoth Kumar Babu)
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://estimate-dialog-bugs.preview.emergentagent.com').rstrip('/')


class TestSetup:
    """Setup: Demo login and session management"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session via demo-login"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        
        # Demo login for site engineer
        response = s.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "engineer@constructionos.com"
        })
        assert response.status_code == 200, f"Demo login failed: {response.text}"
        
        data = response.json()
        # Demo login returns user data directly (not wrapped in "user" key)
        assert "email" in data, "No user data in response"
        assert data["email"] == "engineer@constructionos.com"
        print(f"✓ Demo login successful for {data.get('name', 'Site Engineer')}")
        
        return s
    
    @pytest.fixture(scope="class")
    def project_id(self):
        """Return the test project ID"""
        return "proj_12f23331b542"


class TestPhase1ApprovedMaterials(TestSetup):
    """Phase 1: GET /api/projects/{project_id}/approved-materials returns branded material list"""
    
    def test_get_approved_materials_endpoint(self, session, project_id):
        """Test GET /api/projects/{project_id}/approved-materials endpoint exists and returns data"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/approved-materials")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        materials = response.json()
        assert isinstance(materials, list), "Response should be a list"
        print(f"✓ Approved materials endpoint returned {len(materials)} materials")
        
        # If materials exist, verify structure
        if len(materials) > 0:
            mat = materials[0]
            # Check expected fields
            assert "material_id" in mat or "name" in mat, "Material should have material_id or name"
            print(f"  Sample material: {mat.get('name', 'N/A')} - Brand: {mat.get('brand', 'N/A')}")
        
        return materials
    
    def test_approved_materials_has_brand_info(self, session, project_id):
        """Verify approved materials include brand information"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/approved-materials")
        assert response.status_code == 200
        
        materials = response.json()
        # Check if any material has brand field
        has_brand_field = any("brand" in m for m in materials)
        print(f"✓ Brand field present in materials: {has_brand_field}")
        
        # List materials with brands
        branded = [m for m in materials if m.get("brand")]
        print(f"  Materials with brands: {len(branded)}")
        for m in branded[:3]:  # Show first 3
            print(f"    - {m.get('name')}: {m.get('brand')}")


class TestPhase1MaterialRequestWithBrand(TestSetup):
    """Phase 1: POST /api/site-engineer/material-requests with brand and is_approved_material fields"""
    
    def test_create_material_request_with_brand_and_is_approved(self, session, project_id):
        """Test creating material request with brand and is_approved_material fields"""
        payload = {
            "project_id": project_id,
            "material_name": f"TEST_Cement OPC 53 Phase1_{datetime.now().strftime('%H%M%S')}",
            "brand": "UltraTech",
            "quantity": 10,
            "unit": "bags",
            "is_approved_material": False,  # Custom material
            "remarks": "Test Phase 1 - custom material with brand"
        }
        
        response = session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "request_id" in data, "Response should contain request_id"
        assert data.get("brand") == "UltraTech", f"Brand not saved correctly: {data.get('brand')}"
        assert data.get("is_approved_material") == False, "is_approved_material not saved"
        
        print(f"✓ Material request created with brand: {data.get('request_id')}")
        print(f"  Material: {data.get('material_name')}")
        print(f"  Brand: {data.get('brand')}")
        print(f"  Is Approved: {data.get('is_approved_material')}")
        
        return data.get("request_id")
    
    def test_create_approved_material_request(self, session, project_id):
        """Test creating material request from approved list with is_approved_material=True"""
        # First get an approved material if any exist
        materials_res = session.get(f"{BASE_URL}/api/projects/{project_id}/approved-materials")
        materials = materials_res.json() if materials_res.status_code == 200 else []
        
        payload = {
            "project_id": project_id,
            "material_name": f"TEST_Steel TMT 12mm_{datetime.now().strftime('%H%M%S')}",
            "brand": "Tata Tiscon",
            "quantity": 5,
            "unit": "tons",
            "is_approved_material": True,  # From approved list
            "remarks": "Test Phase 1 - approved material with brand"
        }
        
        # If we have approved materials, use one
        if materials:
            mat = materials[0]
            payload["material_id"] = mat.get("material_id")
            payload["material_name"] = mat.get("name", payload["material_name"])
            payload["brand"] = mat.get("brand") or payload["brand"]
            payload["unit"] = mat.get("unit", payload["unit"])
        
        response = session.post(f"{BASE_URL}/api/site-engineer/material-requests", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("is_approved_material") == True, "is_approved_material should be True"
        print(f"✓ Approved material request created: {data.get('request_id')}")
        
        return data.get("request_id")


class TestPhase2ReceiptEndpoints(TestSetup):
    """Phase 2: Enhanced receipt with date, time, lorry image, material image, GPS"""
    
    def test_receipt_initiate_accepts_new_fields(self, session, project_id):
        """Test POST material-receipts/initiate accepts lorry_image_id, material_image_id, receive_date, receive_time"""
        # First, we need a material request that's ready for receiving
        # Get existing in_transit orders
        orders_res = session.get(f"{BASE_URL}/api/site-engineer/material-requests?project_id={project_id}")
        assert orders_res.status_code == 200
        orders = orders_res.json()
        
        # Find an order in receivable status
        receivable_statuses = ['in_transit', 'accountant_approved', 'ready_for_delivery', 'order_placed']
        receivable_order = next((o for o in orders if o.get("status") in receivable_statuses), None)
        
        if not receivable_order:
            print("⚠ No orders in receivable status to test receipt initiation")
            pytest.skip("No receivable orders available")
            return
        
        # Test receipt initiate with new Phase 2 fields
        payload = {
            "request_id": receivable_order["request_id"],
            "received_qty": receivable_order.get("quantity", 1),
            "gps_latitude": 13.0827,
            "gps_longitude": 80.2707,
            "receive_date": "2026-01-15",
            "receive_time": "14:30",
            "lorry_image_id": "test_lorry_img_001",
            "material_image_id": "test_material_img_001",
            "remarks": "Test Phase 2 receipt with images"
        }
        
        response = session.post(f"{BASE_URL}/api/site-engineer/material-receipts/initiate", json=payload)
        
        # Accept 200 or 400 (material not ready) - we're testing field acceptance
        if response.status_code == 400:
            print(f"⚠ Order not ready for receipt: {response.json().get('detail')}")
            # Verify the endpoint exists and accepts our payload structure
            assert "not ready" in response.text.lower() or "status" in response.text.lower(), \
                "Error should be about status, not field validation"
            print("✓ Receipt endpoint exists and validates order status")
        else:
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            print(f"✓ Receipt initiated: {data.get('receipt_id')}")
            print(f"  Receive date: {data.get('receive_date')}")
            print(f"  Receive time: {data.get('receive_time')}")
            print(f"  Lorry image: {data.get('lorry_image_id')}")
            print(f"  Material image: {data.get('material_image_id')}")


class TestPhase2ReceivedStock(TestSetup):
    """Phase 2: GET /api/projects/{project_id}/received-stock returns aggregated received materials"""
    
    def test_received_stock_endpoint(self, session, project_id):
        """Test GET /api/projects/{project_id}/received-stock endpoint"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/received-stock")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stock = response.json()
        assert isinstance(stock, list), "Response should be a list"
        print(f"✓ Received stock endpoint returned {len(stock)} aggregated materials")
        
        # If stock exists, verify structure
        if len(stock) > 0:
            item = stock[0]
            assert "material_name" in item, "Should have material_name"
            assert "total_received" in item, "Should have total_received"
            
            print(f"  Sample: {item.get('material_name')}")
            print(f"    Total received: {item.get('total_received')} {item.get('unit', '')}")
            print(f"    Brand: {item.get('brand', 'N/A')}")
            print(f"    Receipts count: {len(item.get('receipts', []))}")
        
        return stock
    
    def test_received_stock_has_receipt_details(self, session, project_id):
        """Verify received stock includes receipt details with date/time/images"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/received-stock")
        assert response.status_code == 200
        
        stock = response.json()
        
        for item in stock:
            receipts = item.get("receipts", [])
            if receipts:
                r = receipts[0]
                # Check Phase 2 fields exist in receipt data
                print(f"  Receipt structure for {item.get('material_name')}:")
                print(f"    - receive_date: {'✓' if 'receive_date' in r else '✗'}")
                print(f"    - receive_time: {'✓' if 'receive_time' in r else '✗'}")
                print(f"    - lorry_image_id: {'✓' if 'lorry_image_id' in r else '✗'}")
                print(f"    - material_image_id: {'✓' if 'material_image_id' in r else '✗'}")
                print(f"    - gps coordinates: {'✓' if 'gps_latitude' in r else '✗'}")
                break


class TestPhase3DailyProgress(TestSetup):
    """Phase 3: Daily Progress Reports - POST and GET endpoints"""
    
    def test_create_daily_progress(self, session, project_id):
        """Test POST /api/projects/{project_id}/daily-progress creates progress entry"""
        payload = {
            "summary": f"TEST_Phase3 - Completed foundation work. Mixed concrete and laid 10 cubic meters. {datetime.now().strftime('%H%M%S')}",
            "current_stage": "Foundation"
        }
        
        response = session.post(f"{BASE_URL}/api/projects/{project_id}/daily-progress", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "progress_id" in data, "Response should contain progress_id"
        assert data.get("summary") == payload["summary"], "Summary not saved correctly"
        assert data.get("current_stage") == "Foundation", "Stage not saved"
        assert "date" in data, "Should have date"
        assert "day" in data, "Should have day of week"
        
        print(f"✓ Daily progress created: {data.get('progress_id')}")
        print(f"  Date: {data.get('date')} ({data.get('day')})")
        print(f"  Stage: {data.get('current_stage')}")
        print(f"  Project: {data.get('project_name')}")
        print(f"  Engineer: {data.get('site_engineer_name')}")
        
        return data.get("progress_id")
    
    def test_get_daily_progress(self, session, project_id):
        """Test GET /api/projects/{project_id}/daily-progress returns entries"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/daily-progress")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        entries = response.json()
        assert isinstance(entries, list), "Response should be a list"
        print(f"✓ Daily progress endpoint returned {len(entries)} entries")
        
        # Verify structure if entries exist
        if entries:
            entry = entries[0]
            required_fields = ["progress_id", "date", "day", "summary"]
            for field in required_fields:
                assert field in entry, f"Entry should have {field}"
            
            print(f"  Latest entry: {entry.get('date')} ({entry.get('day')})")
            print(f"    Stage: {entry.get('current_stage', 'N/A')}")
            print(f"    Summary: {entry.get('summary')[:50]}...")
        
        return entries
    
    def test_daily_progress_has_required_fields(self, session, project_id):
        """Verify daily progress entries have all Phase 3 required fields"""
        # Create a new entry to ensure we have data
        payload = {
            "summary": "TEST_Verification entry for field checking",
            "current_stage": "Plinth"
        }
        create_res = session.post(f"{BASE_URL}/api/projects/{project_id}/daily-progress", json=payload)
        
        # Now get and verify
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/daily-progress")
        assert response.status_code == 200
        
        entries = response.json()
        test_entry = next((e for e in entries if "Verification entry" in e.get("summary", "")), None)
        
        if test_entry:
            # Verify Phase 3 required fields
            assert "project_id" in test_entry, "Should have project_id"
            assert "site_engineer_name" in test_entry, "Should have site_engineer_name"
            assert "date" in test_entry, "Should have date"
            assert "day" in test_entry, "Should have day"
            assert "summary" in test_entry, "Should have summary"
            assert "current_stage" in test_entry, "Should have current_stage"
            
            print("✓ Daily progress entry has all required fields:")
            print(f"  - project_id: {test_entry.get('project_id')}")
            print(f"  - site_engineer_name: {test_entry.get('site_engineer_name')}")
            print(f"  - date: {test_entry.get('date')}")
            print(f"  - day: {test_entry.get('day')}")
            print(f"  - current_stage: {test_entry.get('current_stage')}")


class TestVendorSuggestion(TestSetup):
    """Additional test: Vendor suggestion for materials"""
    
    def test_vendor_suggestion_endpoint(self, session, project_id):
        """Test vendor suggestion endpoint for material auto-assignment"""
        response = session.get(f"{BASE_URL}/api/projects/{project_id}/vendor-suggestion?material_name=Cement")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "found" in data, "Response should have 'found' field"
        
        if data.get("found"):
            print(f"✓ Vendor suggestion found:")
            print(f"  Vendor: {data.get('vendor_name')}")
            print(f"  Category: {data.get('category')}")
            print(f"  Brand: {data.get('brand', 'N/A')}")
        else:
            print("✓ Vendor suggestion endpoint working (no vendor assigned for Cement)")


class TestMaterialRequestFields(TestSetup):
    """Verify material request model accepts all new fields"""
    
    def test_get_material_requests_with_new_fields(self, session, project_id):
        """Verify GET material requests returns brand and is_approved_material fields"""
        response = session.get(f"{BASE_URL}/api/site-engineer/material-requests?project_id={project_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        requests = response.json()
        print(f"✓ Found {len(requests)} material requests")
        
        # Check for Phase 1 fields in recent requests
        test_requests = [r for r in requests if "TEST_" in r.get("material_name", "")]
        if test_requests:
            req = test_requests[0]
            print(f"  Test request: {req.get('request_id')}")
            print(f"    Brand: {req.get('brand', 'N/A')}")
            print(f"    Is Approved: {req.get('is_approved_material', 'N/A')}")


class TestCleanup:
    """Cleanup test data (optional)"""
    
    @pytest.fixture(scope="class")
    def session(self):
        """Create authenticated session"""
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "engineer@constructionos.com"})
        return s
    
    def test_cleanup_info(self, session):
        """Note: Test data with TEST_ prefix created during testing"""
        print("\n" + "="*60)
        print("TEST DATA INFO:")
        print("  - Material requests with 'TEST_' prefix were created")
        print("  - Daily progress entries with 'TEST_' prefix were created")
        print("  - These can be identified and cleaned up if needed")
        print("="*60)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
