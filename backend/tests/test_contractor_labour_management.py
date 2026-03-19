"""
Contractor Management API Tests - Updated for new route paths
ROUTES: /api/labour-work-orders (not /api/work-orders)
COLLECTION: labour_work_orders (not work_orders)

- Contractor Categories CRUD
- Contractor CRUD with labour types
- Labour Work Orders with payment stages  
- Labour Attendance
- Material Inventory
- Stage payment request flow
"""
import pytest
import requests
import os
import time
from datetime import datetime

# API base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PLANNING_EMAIL = "planning@constructionos.com"
SITE_ENGINEER_EMAIL = "engineer@constructionos.com"
ADMIN_EMAIL = "admin@constructionos.com"
PASSWORD = "Demo@1234"

# Global session storage
_sessions = {}

def get_session(email):
    """Get or create a session for the given email"""
    if email not in _sessions:
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": PASSWORD
        })
        if login_res.status_code == 429:
            time.sleep(2)  # Wait and retry
            login_res = session.post(f"{BASE_URL}/api/auth/login", json={
                "email": email,
                "password": PASSWORD
            })
        if login_res.status_code == 200:
            _sessions[email] = session
        else:
            raise Exception(f"Login failed for {email}: {login_res.status_code} - {login_res.text}")
    return _sessions[email]


# ==================== CONTRACTOR CATEGORIES ====================

class TestContractorCategories:
    """Contractor Category API Tests"""
    
    def test_get_contractor_categories(self):
        """GET /api/contractor-categories returns categories list"""
        session = get_session(PLANNING_EMAIL)
        res = session.get(f"{BASE_URL}/api/contractor-categories")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have existing categories"
        print(f"Found {len(data)} contractor categories")

    def test_create_contractor_category(self):
        """POST /api/contractor-categories creates new category"""
        session = get_session(PLANNING_EMAIL)
        category_name = f"TEST_Category_{datetime.now().strftime('%H%M%S%f')[:10]}"
        res = session.post(f"{BASE_URL}/api/contractor-categories", json={
            "name": category_name
        })
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert data.get("name") == category_name, "Category name mismatch"
        assert "category_id" in data, "category_id should be present"
        print(f"Created category: {data['category_id']}")


# ==================== CONTRACTOR CRUD ====================

class TestContractorCRUD:
    """Contractor CRUD API Tests"""

    def test_create_contractor_with_labour_types(self):
        """POST /api/contractors creates a contractor with labour types"""
        session = get_session(PLANNING_EMAIL)
        contractor_data = {
            "name": f"TEST_Contractor_{datetime.now().strftime('%H%M%S%f')[:10]}",
            "contact_person": "Test Contact",
            "phone": "+91 9876543210",
            "email": "test_contractor@example.com",
            "contractor_type": "Mason",
            "labour_types": [
                {"type": "skilled", "label": "Skilled Labour", "per_day_cost": 1000},
                {"type": "semi_skilled", "label": "Semi Skilled", "per_day_cost": 800},
                {"type": "helper", "label": "Helper", "per_day_cost": 500}
            ]
        }
        res = session.post(f"{BASE_URL}/api/contractors", json=contractor_data)
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert data.get("name") == contractor_data["name"], "Name mismatch"
        assert "contractor_id" in data, "contractor_id should be present"
        assert len(data.get("labour_types", [])) == 3, "Should have 3 labour types"
        print(f"Created contractor: {data['contractor_id']}")

    def test_get_contractors_list(self):
        """GET /api/contractors returns list of contractors"""
        session = get_session(PLANNING_EMAIL)
        res = session.get(f"{BASE_URL}/api/contractors")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} contractors")

    def test_get_contractors_with_category_filter(self):
        """GET /api/contractors?category=Mason filters by category"""
        session = get_session(PLANNING_EMAIL)
        res = session.get(f"{BASE_URL}/api/contractors", params={"category": "Mason"})
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        # Verify filter works - all returned should have Mason type
        for contractor in data:
            assert contractor.get("contractor_type") == "Mason", "Filter should return only Mason contractors"
        print(f"Found {len(data)} Mason contractors")

    def test_get_single_contractor(self):
        """GET /api/contractors/{id} returns single contractor"""
        session = get_session(PLANNING_EMAIL)
        list_res = session.get(f"{BASE_URL}/api/contractors")
        contractors = list_res.json()
        
        if not contractors:
            pytest.skip("No contractors to test")
        
        contractor_id = contractors[0]["contractor_id"]
        res = session.get(f"{BASE_URL}/api/contractors/{contractor_id}")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert data.get("contractor_id") == contractor_id, "ID mismatch"
        print(f"Retrieved contractor: {data['name']}")

    def test_update_contractor(self):
        """PATCH /api/contractors/{id} updates contractor"""
        session = get_session(PLANNING_EMAIL)
        
        # First create a contractor
        create_res = session.post(f"{BASE_URL}/api/contractors", json={
            "name": f"TEST_UpdateMe_{datetime.now().strftime('%H%M%S%f')[:10]}",
            "phone": "9999999999"
        })
        assert create_res.status_code == 200
        contractor_id = create_res.json()["contractor_id"]
        
        # Update it
        update_data = {
            "contact_person": "Updated Contact Person",
            "phone": "1111111111"
        }
        res = session.patch(f"{BASE_URL}/api/contractors/{contractor_id}", json=update_data)
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert data.get("contact_person") == "Updated Contact Person", "Update failed"
        
        # Verify with GET
        verify_res = session.get(f"{BASE_URL}/api/contractors/{contractor_id}")
        verify_data = verify_res.json()
        assert verify_data.get("contact_person") == "Updated Contact Person", "Update not persisted"
        print(f"Updated contractor: {contractor_id}")

    def test_get_contractor_summary(self):
        """GET /api/contractors/{id}/summary returns work orders + stats"""
        session = get_session(PLANNING_EMAIL)
        list_res = session.get(f"{BASE_URL}/api/contractors")
        contractors = list_res.json()
        
        if not contractors:
            pytest.skip("No contractors to test")
        
        contractor_id = contractors[0]["contractor_id"]
        res = session.get(f"{BASE_URL}/api/contractors/{contractor_id}/summary")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert "contractor" in data, "contractor field missing"
        assert "work_orders" in data, "work_orders field missing"
        assert "recent_attendance" in data, "recent_attendance field missing"
        assert "stats" in data, "stats field missing"
        assert "total_work_orders" in data["stats"], "stats.total_work_orders missing"
        print(f"Contractor summary stats: {data['stats']}")


# ==================== LABOUR WORK ORDERS (NEW PATH) ====================

class TestLabourWorkOrders:
    """Labour Work Orders API Tests - /api/labour-work-orders"""
    
    def test_get_labour_work_orders(self):
        """GET /api/labour-work-orders returns work orders"""
        session = get_session(PLANNING_EMAIL)
        res = session.get(f"{BASE_URL}/api/labour-work-orders")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Found {len(data)} labour work orders")

    def test_create_labour_work_order_with_payment_stages(self):
        """POST /api/labour-work-orders creates work order with payment stages"""
        session = get_session(PLANNING_EMAIL)
        
        contractors = session.get(f"{BASE_URL}/api/contractors").json()
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors:
            pytest.skip("No contractors available")
        if not projects:
            pytest.skip("No projects available")
        
        contractor = contractors[0]
        project = projects[0]
        
        work_order_data = {
            "project_id": project["project_id"],
            "project_name": project.get("name", "Test Project"),
            "contractor_id": contractor["contractor_id"],
            "contractor_name": contractor["name"],
            "contractor_type": contractor.get("contractor_type", "Mason"),
            "description": f"TEST_LabourWorkOrder_{datetime.now().strftime('%H%M%S')}",
            "total_amount": 100000,
            "payment_stages": [
                {"stage_name": "Stage 1 - Foundation", "percentage": 30, "amount": 30000},
                {"stage_name": "Stage 2 - Structure", "percentage": 40, "amount": 40000},
                {"stage_name": "Stage 3 - Finishing", "percentage": 30, "amount": 30000}
            ]
        }
        
        res = session.post(f"{BASE_URL}/api/labour-work-orders", json=work_order_data)
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert "work_order_id" in data, "work_order_id missing"
        assert len(data.get("payment_stages", [])) == 3, "Should have 3 payment stages"
        assert data.get("total_amount") == 100000, "Total amount mismatch"
        
        for stage in data["payment_stages"]:
            assert "stage_id" in stage, "stage_id missing"
            assert stage.get("status") == "pending", "Initial status should be pending"
        
        print(f"Created labour work order: {data['work_order_id']}")
        return data  # Return for use in other tests

    def test_update_labour_work_order(self):
        """PATCH /api/labour-work-orders/{wo_id} updates work order"""
        session = get_session(PLANNING_EMAIL)
        
        # First create one
        contractors = session.get(f"{BASE_URL}/api/contractors").json()
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors or not projects:
            pytest.skip("No contractors or projects available")
        
        wo_data = {
            "project_id": projects[0]["project_id"],
            "contractor_id": contractors[0]["contractor_id"],
            "contractor_name": contractors[0]["name"],
            "description": f"TEST_ToUpdate_{datetime.now().strftime('%H%M%S')}",
            "total_amount": 50000,
            "payment_stages": [{"stage_name": "Stage 1", "percentage": 100, "amount": 50000}]
        }
        
        create_res = session.post(f"{BASE_URL}/api/labour-work-orders", json=wo_data)
        assert create_res.status_code == 200
        wo_id = create_res.json()["work_order_id"]
        
        # Update it
        update_res = session.patch(f"{BASE_URL}/api/labour-work-orders/{wo_id}", json={
            "description": "Updated Description",
            "total_amount": 60000
        })
        assert update_res.status_code == 200, f"Update failed: {update_res.text}"
        updated = update_res.json()
        assert updated.get("description") == "Updated Description", "Description not updated"
        print(f"Updated labour work order: {wo_id}")

    def test_filter_work_orders_by_project(self):
        """GET /api/labour-work-orders?project_id=X filters by project"""
        session = get_session(PLANNING_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects available")
        
        project_id = projects[0]["project_id"]
        res = session.get(f"{BASE_URL}/api/labour-work-orders", params={"project_id": project_id})
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        # All returned should have same project_id
        for wo in data:
            assert wo.get("project_id") == project_id, "Filter not working"
        print(f"Found {len(data)} work orders for project {project_id}")

    def test_filter_work_orders_by_contractor(self):
        """GET /api/labour-work-orders?contractor_id=X filters by contractor"""
        session = get_session(PLANNING_EMAIL)
        contractors = session.get(f"{BASE_URL}/api/contractors").json()
        
        if not contractors:
            pytest.skip("No contractors available")
        
        contractor_id = contractors[0]["contractor_id"]
        res = session.get(f"{BASE_URL}/api/labour-work-orders", params={"contractor_id": contractor_id})
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} work orders for contractor {contractor_id}")


# ==================== STAGE PAYMENT FLOW ====================

class TestStagePaymentFlow:
    """Stage Payment Request/Approval Flow Tests"""
    
    def test_request_payment_by_site_engineer(self):
        """PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment"""
        planning_session = get_session(PLANNING_EMAIL)
        engineer_session = get_session(SITE_ENGINEER_EMAIL)
        
        contractors = planning_session.get(f"{BASE_URL}/api/contractors").json()
        projects = planning_session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors or not projects:
            pytest.skip("No contractors or projects available")
        
        wo_data = {
            "project_id": projects[0]["project_id"],
            "project_name": projects[0].get("name", "Test"),
            "contractor_id": contractors[0]["contractor_id"],
            "contractor_name": contractors[0]["name"],
            "description": f"TEST_PaymentFlow_{datetime.now().strftime('%H%M%S')}",
            "total_amount": 50000,
            "payment_stages": [
                {"stage_name": "Stage 1", "percentage": 50, "amount": 25000}
            ]
        }
        
        create_res = planning_session.post(f"{BASE_URL}/api/labour-work-orders", json=wo_data)
        assert create_res.status_code == 200, f"Create failed: {create_res.text}"
        work_order = create_res.json()
        wo_id = work_order["work_order_id"]
        stage_id = work_order["payment_stages"][0]["stage_id"]
        
        # Site engineer requests payment
        req_res = engineer_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"requested_amount": 25000, "notes": "Stage completed"}
        )
        assert req_res.status_code == 200, f"Request failed: {req_res.text}"
        print(f"Site engineer requested payment for stage {stage_id}")

    def test_review_approve_by_planning(self):
        """PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/review with action=approve"""
        planning_session = get_session(PLANNING_EMAIL)
        engineer_session = get_session(SITE_ENGINEER_EMAIL)
        
        contractors = planning_session.get(f"{BASE_URL}/api/contractors").json()
        projects = planning_session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors or not projects:
            pytest.skip("No contractors or projects available")
        
        wo_data = {
            "project_id": projects[0]["project_id"],
            "project_name": projects[0].get("name", "Test"),
            "contractor_id": contractors[0]["contractor_id"],
            "contractor_name": contractors[0]["name"],
            "description": f"TEST_ApproveFlow_{datetime.now().strftime('%H%M%S')}",
            "total_amount": 30000,
            "payment_stages": [
                {"stage_name": "Review Stage", "percentage": 100, "amount": 30000}
            ]
        }
        
        create_res = planning_session.post(f"{BASE_URL}/api/labour-work-orders", json=wo_data)
        assert create_res.status_code == 200
        work_order = create_res.json()
        wo_id = work_order["work_order_id"]
        stage_id = work_order["payment_stages"][0]["stage_id"]
        
        # Site engineer requests payment
        engineer_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"requested_amount": 30000}
        )
        
        # Planning approves
        review_res = planning_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/review",
            json={"action": "approve", "approved_amount": 30000, "notes": "Approved"}
        )
        assert review_res.status_code == 200, f"Review failed: {review_res.text}"
        print(f"Planning approved stage {stage_id}")

    def test_review_reject_by_planning(self):
        """PATCH /api/labour-work-orders/{wo_id}/stages/{stage_id}/review with action=reject"""
        planning_session = get_session(PLANNING_EMAIL)
        engineer_session = get_session(SITE_ENGINEER_EMAIL)
        
        contractors = planning_session.get(f"{BASE_URL}/api/contractors").json()
        projects = planning_session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors or not projects:
            pytest.skip("No contractors or projects available")
        
        wo_data = {
            "project_id": projects[0]["project_id"],
            "contractor_id": contractors[0]["contractor_id"],
            "contractor_name": contractors[0]["name"],
            "description": f"TEST_RejectFlow_{datetime.now().strftime('%H%M%S')}",
            "total_amount": 20000,
            "payment_stages": [
                {"stage_name": "Reject Stage", "percentage": 100, "amount": 20000}
            ]
        }
        
        create_res = planning_session.post(f"{BASE_URL}/api/labour-work-orders", json=wo_data)
        assert create_res.status_code == 200
        work_order = create_res.json()
        wo_id = work_order["work_order_id"]
        stage_id = work_order["payment_stages"][0]["stage_id"]
        
        # Site engineer requests payment
        engineer_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment",
            json={"requested_amount": 20000}
        )
        
        # Planning rejects
        review_res = planning_session.patch(
            f"{BASE_URL}/api/labour-work-orders/{wo_id}/stages/{stage_id}/review",
            json={"action": "reject", "notes": "Work not complete"}
        )
        assert review_res.status_code == 200, f"Reject failed: {review_res.text}"
        print(f"Planning rejected stage {stage_id}")


# ==================== LABOUR ATTENDANCE ====================

class TestLabourAttendance:
    """Labour Attendance API Tests"""
    
    def test_create_labour_attendance(self):
        """POST /api/labour-attendance creates entry with auto cost calculation"""
        session = get_session(SITE_ENGINEER_EMAIL)
        
        contractors = session.get(f"{BASE_URL}/api/contractors").json()
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not contractors or not projects:
            pytest.skip("No contractors or projects available")
        
        attendance_data = {
            "project_id": projects[0]["project_id"],
            "contractor_id": contractors[0]["contractor_id"],
            "contractor_name": contractors[0]["name"],
            "date": datetime.now().strftime("%Y-%m-%d"),
            "entries": [
                {"type": "skilled", "label": "Skilled", "count": 5, "per_day_cost": 1000},
                {"type": "helper", "label": "Helper", "count": 3, "per_day_cost": 500}
            ],
            "notes": "TEST attendance entry"
        }
        
        res = session.post(f"{BASE_URL}/api/labour-attendance", json=attendance_data)
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert "attendance_id" in data, "attendance_id missing"
        assert data.get("total_workers") == 8, "Total workers should be 8"
        assert data.get("total_cost") == 6500, f"Total cost should be 6500, got {data.get('total_cost')}"
        print(f"Created attendance: {data['attendance_id']}, Total cost: {data['total_cost']}")

    def test_get_labour_attendance_by_project(self):
        """GET /api/labour-attendance?project_id=X returns entries"""
        session = get_session(SITE_ENGINEER_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        res = session.get(f"{BASE_URL}/api/labour-attendance", params={
            "project_id": projects[0]["project_id"]
        })
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} attendance entries")

    def test_get_labour_attendance_by_date(self):
        """GET /api/labour-attendance?date=YYYY-MM-DD returns entries"""
        session = get_session(SITE_ENGINEER_EMAIL)
        today = datetime.now().strftime("%Y-%m-%d")
        
        res = session.get(f"{BASE_URL}/api/labour-attendance", params={
            "date": today
        })
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} attendance entries for {today}")

    def test_get_daily_summary(self):
        """GET /api/labour-attendance/daily-summary?project_id=X returns per-project daily totals"""
        session = get_session(SITE_ENGINEER_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        today = datetime.now().strftime("%Y-%m-%d")
        res = session.get(f"{BASE_URL}/api/labour-attendance/daily-summary", params={
            "project_id": projects[0]["project_id"],
            "date": today
        })
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert "date" in data, "date missing"
        assert "total_workers" in data, "total_workers missing"
        assert "total_cost" in data, "total_cost missing"
        assert "by_contractor" in data, "by_contractor missing"
        print(f"Daily summary: workers={data['total_workers']}, cost={data['total_cost']}")


# ==================== MATERIAL INVENTORY ====================

class TestMaterialInventory:
    """Material Inventory API Tests"""
    
    def test_create_inventory_entry(self):
        """POST /api/material-inventory creates entry with auto closing stock calculation"""
        session = get_session(SITE_ENGINEER_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        inventory_data = {
            "project_id": projects[0]["project_id"],
            "material_name": f"TEST_Cement_{datetime.now().strftime('%H%M%S')}",
            "unit": "Bags",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "opening_stock": 100,
            "received": 50,
            "used": 30,
            "notes": "Test inventory entry"
        }
        
        res = session.post(f"{BASE_URL}/api/material-inventory", json=inventory_data)
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        
        assert "inventory_id" in data, "inventory_id missing"
        # closing_stock = opening + received - used = 100 + 50 - 30 = 120
        assert data.get("closing_stock") == 120, f"Closing stock should be 120, got {data.get('closing_stock')}"
        print(f"Created inventory: {data['inventory_id']}, Closing stock: {data['closing_stock']}")

    def test_get_material_inventory(self):
        """GET /api/material-inventory?project_id=X returns entries by project"""
        session = get_session(SITE_ENGINEER_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        res = session.get(f"{BASE_URL}/api/material-inventory", params={
            "project_id": projects[0]["project_id"]
        })
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} inventory entries")

    def test_get_latest_inventory(self):
        """GET /api/material-inventory/latest?project_id=X returns latest stock per material"""
        session = get_session(SITE_ENGINEER_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        res = session.get(f"{BASE_URL}/api/material-inventory/latest", params={
            "project_id": projects[0]["project_id"]
        })
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        print(f"Found latest inventory for {len(data)} materials")


# ==================== PROJECT CONTRACTOR ASSIGNMENTS ====================

class TestProjectContractorAssignments:
    """Project Contractor Assignments API Tests"""
    
    def test_get_project_contractor_assignments(self):
        """GET /api/projects/{project_id}/contractor-assignments returns labour work orders"""
        session = get_session(PLANNING_EMAIL)
        projects = session.get(f"{BASE_URL}/api/projects").json()
        
        if not projects:
            pytest.skip("No projects")
        
        project_id = projects[0]["project_id"]
        res = session.get(f"{BASE_URL}/api/projects/{project_id}/contractor-assignments")
        assert res.status_code == 200, f"Failed: {res.text}"
        data = res.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} contractor assignments for project {project_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
