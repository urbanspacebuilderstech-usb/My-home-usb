"""
CRM Module Tests - Testing Pre-Sales, Sales, RE Projects, Custom Fields, and CSV Import
Tests all CRUD operations and workflow transitions for the CRM system
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCRMPreSales:
    """Pre-Sales CRM Tests - Lead creation and Kanban stage management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Pre-Sales user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Pre-Sales user
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "presales@constructionos.com"
        })
        
        if login_response.status_code != 200:
            # Try with sales user as fallback
            login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "sales@constructionos.com"
            })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as Pre-Sales or Sales user")
    
    def test_presales_dashboard(self):
        """Test Pre-Sales dashboard endpoint"""
        response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "total_leads" in data
        assert "stages" in data
        print(f"Pre-Sales Dashboard: {data.get('total_leads', 0)} total leads")
    
    def test_presales_stages(self):
        """Test Pre-Sales stages endpoint"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert response.status_code == 200
        stages = response.json()
        assert isinstance(stages, list)
        assert len(stages) > 0
        
        # Verify stage structure
        for stage in stages:
            assert "stage_id" in stage
            assert "name" in stage
            assert "stage_type" in stage
            assert stage["stage_type"] == "pre_sales"
        
        print(f"Pre-Sales has {len(stages)} stages: {[s['name'] for s in stages]}")
    
    def test_presales_leads_list(self):
        """Test listing Pre-Sales leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"Pre-Sales has {len(leads)} leads")
    
    def test_create_presales_lead(self):
        """Test creating a new Pre-Sales lead"""
        lead_data = {
            "name": "TEST_CRM_Lead_" + datetime.now().strftime("%H%M%S"),
            "email": f"test_crm_{datetime.now().timestamp()}@example.com",
            "phone": "+91 9876543210",
            "source": "website",
            "address": "123 Test Street",
            "city": "Mumbai",
            "state": "Maharashtra",
            "pincode": "400001",
            "notes": "Test lead from automated testing",
            "custom_fields": {}
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert response.status_code == 200
        result = response.json()
        assert "lead_id" in result
        assert "message" in result
        
        # Verify lead exists in list
        leads_response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        leads = leads_response.json()
        lead_ids = [l.get("lead_id") for l in leads]
        assert result["lead_id"] in lead_ids
        
        print(f"Created lead: {result['lead_id']}")
        return result["lead_id"]


class TestCRMSales:
    """Sales CRM Tests - Lead management and deal conversion"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Sales user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Sales user
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "sales@constructionos.com"
        })
        
        if login_response.status_code != 200:
            # Try with admin as fallback
            login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "admin@constructionos.com"
            })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as Sales user")
    
    def test_sales_dashboard(self):
        """Test Sales dashboard endpoint"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "total_leads" in data
        assert "re_stats" in data
        print(f"Sales Dashboard: {data.get('total_leads', 0)} total leads, RE stats: {data.get('re_stats', {})}")
    
    def test_sales_stages(self):
        """Test Sales stages endpoint"""
        response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=sales")
        assert response.status_code == 200
        stages = response.json()
        assert isinstance(stages, list)
        assert len(stages) > 0
        
        # Verify stage structure
        for stage in stages:
            assert "stage_id" in stage
            assert "name" in stage
            assert "stage_type" in stage
            assert stage["stage_type"] == "sales"
        
        print(f"Sales has {len(stages)} stages: {[s['name'] for s in stages]}")
    
    def test_sales_leads_list(self):
        """Test listing Sales leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200
        leads = response.json()
        assert isinstance(leads, list)
        print(f"Sales has {len(leads)} leads")


class TestLeadStageTransitions:
    """Test lead stage transitions and automatic workflows"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin for full access
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as admin")
    
    def test_move_lead_to_different_stage(self):
        """Test moving a lead to a different stage"""
        # Get stages
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        assert stages_response.status_code == 200
        stages = stages_response.json()
        
        if len(stages) < 2:
            pytest.skip("Need at least 2 stages to test transition")
        
        # Get leads
        leads_response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert leads_response.status_code == 200
        leads = leads_response.json()
        
        if len(leads) == 0:
            # Create a test lead first
            lead_data = {
                "name": "TEST_Stage_Transition_Lead",
                "email": f"test_stage_{datetime.now().timestamp()}@example.com",
                "phone": "+91 9876543210",
                "source": "other",
                "notes": "Test lead for stage transition"
            }
            create_response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
            assert create_response.status_code == 200
            lead_id = create_response.json()["lead_id"]
        else:
            lead_id = leads[0]["lead_id"]
        
        # Find a different stage than current
        current_lead = None
        leads_response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        for lead in leads_response.json():
            if lead["lead_id"] == lead_id:
                current_lead = lead
                break
        
        if not current_lead:
            pytest.skip("Could not find test lead")
        
        current_stage_id = current_lead.get("current_stage_id")
        new_stage = None
        for stage in stages:
            if stage["stage_id"] != current_stage_id:
                new_stage = stage
                break
        
        if not new_stage:
            pytest.skip("Could not find a different stage")
        
        # Move lead
        response = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": new_stage["stage_id"]
        })
        assert response.status_code == 200
        result = response.json()
        assert "message" in result
        print(f"Moved lead {lead_id} to stage '{new_stage['name']}'")


class TestREProjects:
    """Rough Estimate Projects tests - Planning workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with Planning user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Planning user
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "planning@constructionos.com"
        })
        
        if login_response.status_code != 200:
            # Try with admin as fallback
            login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "admin@constructionos.com"
            })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as Planning user")
    
    def test_re_projects_list(self):
        """Test listing RE projects"""
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200
        projects = response.json()
        assert isinstance(projects, list)
        print(f"Found {len(projects)} RE Projects")
        
        if len(projects) > 0:
            for proj in projects[:3]:
                print(f"  - {proj.get('project_name', proj.get('client_name'))}: Status={proj.get('status')}")
    
    def test_re_planning_dashboard(self):
        """Test Planning RE dashboard"""
        response = self.session.get(f"{BASE_URL}/api/crm/planning/re-dashboard")
        assert response.status_code == 200
        data = response.json()
        assert "status_counts" in data
        print(f"RE Dashboard stats: {data.get('status_counts', {})}")
    
    def test_update_re_project(self):
        """Test updating RE project with estimates"""
        # Get RE projects
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200
        projects = response.json()
        
        if len(projects) == 0:
            pytest.skip("No RE projects available to test")
        
        # Find a project that can be edited (not yet approved)
        editable_project = None
        for proj in projects:
            if proj.get("status") in ["re_requested", "re_in_progress"]:
                editable_project = proj
                break
        
        if not editable_project:
            pytest.skip("No editable RE project found")
        
        # Update the project
        update_data = {
            "estimated_material_cost": 500000,
            "estimated_labour_cost": 300000,
            "estimated_overhead": 100000,
            "planning_notes": "Test update from automated testing"
        }
        
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{editable_project['re_project_id']}", 
            json=update_data
        )
        assert response.status_code == 200
        print(f"Updated RE Project {editable_project['re_project_id']}")


class TestREApproval:
    """Test GM/Admin approval of RE projects"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as admin")
    
    def test_admin_can_view_re_projects(self):
        """Test admin can view RE projects"""
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects")
        assert response.status_code == 200
        projects = response.json()
        assert isinstance(projects, list)
        print(f"Admin can view {len(projects)} RE Projects")


class TestCustomFields:
    """Custom Fields Builder tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login")
    
    def test_list_custom_fields(self):
        """Test listing custom fields"""
        response = self.session.get(f"{BASE_URL}/api/crm/custom-fields")
        assert response.status_code == 200
        fields = response.json()
        assert isinstance(fields, list)
        print(f"Found {len(fields)} custom fields")
        
        for field in fields:
            print(f"  - {field.get('label')} ({field.get('field_type')})")
    
    def test_create_custom_field(self):
        """Test creating a custom field"""
        field_data = {
            "name": f"test_field_{datetime.now().strftime('%H%M%S')}",
            "label": "Test Field",
            "field_type": "text",
            "required": False,
            "placeholder": "Enter test value"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/custom-fields", json=field_data)
        assert response.status_code == 200
        result = response.json()
        assert "field_id" in result
        
        print(f"Created custom field: {result['field_id']}")
        return result["field_id"]
    
    def test_create_dropdown_field(self):
        """Test creating a dropdown custom field"""
        field_data = {
            "name": f"test_dropdown_{datetime.now().strftime('%H%M%S')}",
            "label": "Test Dropdown",
            "field_type": "dropdown",
            "required": False,
            "options": ["Option 1", "Option 2", "Option 3"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/custom-fields", json=field_data)
        assert response.status_code == 200
        result = response.json()
        assert "field_id" in result
        
        # Verify field in list
        fields_response = self.session.get(f"{BASE_URL}/api/crm/custom-fields")
        fields = fields_response.json()
        created_field = next((f for f in fields if f["field_id"] == result["field_id"]), None)
        assert created_field is not None
        assert created_field["options"] == ["Option 1", "Option 2", "Option 3"]
        
        print(f"Created dropdown field: {result['field_id']}")


class TestCSVImport:
    """CSV Import workflow tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as pre-sales or admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "presales@constructionos.com"
        })
        
        if login_response.status_code != 200:
            login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "admin@constructionos.com"
            })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login")
    
    def test_import_template(self):
        """Test getting CSV import template"""
        response = self.session.get(f"{BASE_URL}/api/crm/import/template")
        assert response.status_code == 200
        template = response.json()
        assert "standard_columns" in template
        assert "custom_field_columns" in template
        assert "source_options" in template
        
        print(f"Import template - Standard columns: {template['standard_columns']}")
        print(f"Import template - Source options: {template['source_options']}")
    
    def test_csv_import(self):
        """Test CSV lead import"""
        # Prepare lead data for import
        import_data = {
            "leads": [
                {
                    "name": f"TEST_Import_Lead_1_{datetime.now().strftime('%H%M%S')}",
                    "email": f"import1_{datetime.now().timestamp()}@example.com",
                    "phone": "+91 9876543211",
                    "city": "Mumbai"
                },
                {
                    "name": f"TEST_Import_Lead_2_{datetime.now().strftime('%H%M%S')}",
                    "email": f"import2_{datetime.now().timestamp()}@example.com",
                    "phone": "+91 9876543212",
                    "city": "Delhi"
                }
            ],
            "column_mapping": {
                "name": "name",
                "email": "email",
                "phone": "phone",
                "city": "city"
            },
            "source": "csv_import"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/import/csv", json=import_data)
        assert response.status_code == 200
        result = response.json()
        assert "imported_count" in result
        assert result["imported_count"] >= 0
        
        print(f"Imported {result['imported_count']} leads, errors: {result.get('error_count', 0)}")


class TestCRMStageManagement:
    """Test stage CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login as admin")
    
    def test_create_presales_stage(self):
        """Test creating a new Pre-Sales stage"""
        stage_data = {
            "name": f"TEST_Stage_{datetime.now().strftime('%H%M%S')}",
            "stage_type": "pre_sales",
            "color": "#ff5733"
        }
        
        response = self.session.post(f"{BASE_URL}/api/crm/stages", json=stage_data)
        assert response.status_code == 200
        result = response.json()
        assert "stage_id" in result
        
        print(f"Created Pre-Sales stage: {result['stage_id']}")
        return result["stage_id"]


class TestEndToEndCRMWorkflow:
    """End-to-end workflow tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin for full access
        login_response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "admin@constructionos.com"
        })
        
        if login_response.status_code == 200:
            self.user = login_response.json()
        else:
            pytest.skip("Could not login")
    
    def test_full_workflow_presales_to_sales(self):
        """Test Pre-Sales to Sales transfer workflow"""
        # Get appointment booked stage
        stages_response = self.session.get(f"{BASE_URL}/api/crm/stages?stage_type=pre_sales")
        stages = stages_response.json()
        
        appointment_booked_stage = None
        for stage in stages:
            if "appointment" in stage["name"].lower() and "booked" in stage["name"].lower():
                appointment_booked_stage = stage
                break
        
        if not appointment_booked_stage:
            print("Warning: 'Appointment Booked' stage not found - checking available stages")
            for s in stages:
                print(f"  Available stage: {s['name']} (is_final: {s.get('is_final', False)})")
            pytest.skip("'Appointment Booked' stage not found")
        
        # Create a test lead
        lead_data = {
            "name": f"TEST_E2E_Lead_{datetime.now().strftime('%H%M%S')}",
            "email": f"e2e_{datetime.now().timestamp()}@example.com",
            "phone": "+91 9876543210",
            "source": "website",
            "notes": "E2E test lead"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/crm/pre-sales/leads", json=lead_data)
        assert create_response.status_code == 200
        lead_id = create_response.json()["lead_id"]
        
        # Move to appointment booked - should trigger transfer to Sales
        transfer_response = self.session.patch(f"{BASE_URL}/api/crm/leads/{lead_id}/stage", json={
            "stage_id": appointment_booked_stage["stage_id"]
        })
        assert transfer_response.status_code == 200
        result = transfer_response.json()
        
        if result.get("transferred_to_sales"):
            print(f"SUCCESS: Lead transferred to Sales CRM")
        else:
            print(f"Lead moved to '{appointment_booked_stage['name']}' stage")
        
        print(f"Result: {result}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
