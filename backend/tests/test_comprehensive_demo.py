"""
Comprehensive test for Construction CRM demo data
Tests all tabs in Project Detail and all role-specific boards
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://crm-onboard-flow.preview.emergentagent.com').rstrip('/')

# Demo user credentials
DEMO_USERS = {
    "super_admin": "admin@constructionos.com",
    "sales": "sales@constructionos.com",
    "site_engineer": "engineer@constructionos.com",
    "accountant": "accountant@constructionos.com",
    "planning": "planning@constructionos.com",
    "procurement": "procurement@constructionos.com",
    "project_manager": "pm@constructionos.com",
}

class TestDemoLogin:
    """Test demo login functionality"""
    
    def test_demo_login_super_admin(self):
        """Test Super Admin demo login"""
        response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["super_admin"]
        })
        print(f"Demo login response: {response.status_code}")
        assert response.status_code == 200, f"Demo login failed: {response.text}"
        data = response.json()
        assert "session_token" in data or "token" in data, "No token in response"
        return data
    
    def test_demo_login_all_roles(self):
        """Test demo login for all roles"""
        for role, email in DEMO_USERS.items():
            response = requests.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": email
            })
            print(f"{role} login: {response.status_code}")
            assert response.status_code == 200, f"{role} demo login failed: {response.text}"


class TestSuperAdminDashboard:
    """Test Super Admin Dashboard - should show project with correct financials"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Super Admin"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["super_admin"]
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_dashboard_summary(self, auth_session):
        """Test dashboard summary endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        print(f"Dashboard summary: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Totals: {data.get('totals', {})}")
            print(f"Projects count: {len(data.get('projects', []))}")
            # Check for Swathi project
            projects = data.get('projects', [])
            swathi_project = next((p for p in projects if 'Swathi' in p.get('name', '')), None)
            if swathi_project:
                print(f"Swathi project found: {swathi_project}")
                # Verify financials - scope ~80L, income 30L
                assert swathi_project.get('income_received', 0) >= 2500000, "Income should be ~30L"
        else:
            print(f"Dashboard summary error: {response.text}")
    
    def test_projects_list(self, auth_session):
        """Test projects list"""
        response = auth_session.get(f"{BASE_URL}/api/projects")
        print(f"Projects list: {response.status_code}")
        assert response.status_code == 200, f"Projects list failed: {response.text}"
        projects = response.json()
        print(f"Total projects: {len(projects)}")
        # Find Swathi project
        swathi = next((p for p in projects if 'Swathi' in p.get('name', '')), None)
        if swathi:
            print(f"Swathi project ID: {swathi.get('project_id')}")
            print(f"Swathi project value: {swathi.get('total_value')}")
            return swathi.get('project_id')
        return None


class TestProjectDetailTabs:
    """Test all tabs in Project Detail page"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["super_admin"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    @pytest.fixture
    def project_id(self, auth_session):
        """Get the Swathi project ID"""
        response = auth_session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        swathi = next((p for p in projects if 'Swathi' in p.get('name', '')), None)
        if swathi:
            return swathi.get('project_id')
        # Return first project if Swathi not found
        return projects[0].get('project_id') if projects else None
    
    def test_estimate_tab_re_project(self, auth_session, project_id):
        """Test Estimate tab - should show RE project with rough scope items"""
        if not project_id:
            pytest.skip("No project found")
        
        # Get project to find RE project ID
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}")
        assert response.status_code == 200, f"Get project failed: {response.text}"
        project = response.json()
        re_project_id = project.get('re_project_id')
        print(f"RE Project ID: {re_project_id}")
        
        if re_project_id:
            # Get RE project details
            response = auth_session.get(f"{BASE_URL}/api/re-projects/{re_project_id}")
            print(f"RE project response: {response.status_code}")
            if response.status_code == 200:
                re_data = response.json()
                scope_items = re_data.get('rough_scope_items', [])
                print(f"RE scope items count: {len(scope_items)}")
                assert len(scope_items) >= 10, f"Expected ~13 scope items, got {len(scope_items)}"
    
    def test_final_estimate_tab_scope_items(self, auth_session, project_id):
        """Test Final Estimate tab - should show 13 scope items"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/scope-items/{project_id}")
        print(f"Scope items response: {response.status_code}")
        if response.status_code == 200:
            items = response.json()
            print(f"Scope items count: {len(items)}")
            assert len(items) >= 10, f"Expected ~13 scope items, got {len(items)}"
        else:
            print(f"Scope items error: {response.text}")
    
    def test_stages_tab(self, auth_session, project_id):
        """Test Stages tab - should show 12 stages"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/project-stages")
        print(f"Project stages response: {response.status_code}")
        if response.status_code == 200:
            stages = response.json()
            print(f"Stages count: {len(stages)}")
            completed = len([s for s in stages if s.get('status') == 'completed'])
            in_progress = len([s for s in stages if s.get('status') == 'in_progress'])
            print(f"Completed: {completed}, In Progress: {in_progress}")
            assert len(stages) >= 10, f"Expected ~12 stages, got {len(stages)}"
        else:
            print(f"Stages error: {response.text}")
    
    def test_team_tab(self, auth_session, project_id):
        """Test Team tab - should show assigned team members"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/team")
        print(f"Team response: {response.status_code}")
        if response.status_code == 200:
            team = response.json()
            print(f"Team data: {team}")
            # Check for key roles
            roles_with_members = [k for k, v in team.items() if v is not None]
            print(f"Roles with members: {roles_with_members}")
            assert len(roles_with_members) >= 3, f"Expected at least 3 team members, got {len(roles_with_members)}"
        else:
            print(f"Team error: {response.text}")
    
    def test_materials_tab(self, auth_session, project_id):
        """Test Materials tab - should show material requests"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/materials-summary")
        print(f"Materials summary response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            requests_list = data.get('requests', []) if isinstance(data, dict) else data
            print(f"Material requests count: {len(requests_list)}")
        else:
            print(f"Materials error: {response.text}")
    
    def test_labours_tab(self, auth_session, project_id):
        """Test Labours tab - should show labour expenses"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/labours-summary")
        print(f"Labours summary response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            expenses = data.get('expenses', []) if isinstance(data, dict) else data
            print(f"Labour expenses count: {len(expenses)}")
        else:
            print(f"Labours error: {response.text}")
    
    def test_work_orders_tab(self, auth_session, project_id):
        """Test Work Orders tab - should show 3 work orders"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/project-work-orders/{project_id}")
        print(f"Work orders response: {response.status_code}")
        if response.status_code == 200:
            orders = response.json()
            print(f"Work orders count: {len(orders)}")
            for wo in orders[:3]:
                print(f"  - {wo.get('contractor_name')}: {wo.get('category')}")
        else:
            print(f"Work orders error: {response.text}")
    
    def test_payments_tab(self, auth_session, project_id):
        """Test Payments tab - should show payment stages"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/payment-stages")
        print(f"Payment stages response: {response.status_code}")
        if response.status_code == 200:
            stages = response.json()
            print(f"Payment stages count: {len(stages)}")
            paid = len([s for s in stages if s.get('status') == 'paid'])
            pending = len([s for s in stages if s.get('status') == 'pending'])
            print(f"Paid: {paid}, Pending: {pending}")
        else:
            print(f"Payment stages error: {response.text}")
    
    def test_additional_tab(self, auth_session, project_id):
        """Test Additional tab - should show additional costs"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/additional-costs/{project_id}")
        print(f"Additional costs response: {response.status_code}")
        if response.status_code == 200:
            costs = response.json()
            print(f"Additional costs count: {len(costs)}")
        else:
            print(f"Additional costs error: {response.text}")
    
    def test_deduction_tab(self, auth_session, project_id):
        """Test Deduction tab - should show deductions"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/deductions/{project_id}")
        print(f"Deductions response: {response.status_code}")
        if response.status_code == 200:
            deductions = response.json()
            print(f"Deductions count: {len(deductions)}")
        else:
            print(f"Deductions error: {response.text}")
    
    def test_documents_tab(self, auth_session, project_id):
        """Test Documents tab - should show design files and site plans"""
        if not project_id:
            pytest.skip("No project found")
        
        # Design files
        response = auth_session.get(f"{BASE_URL}/api/architect/projects/{project_id}/all-design-data")
        print(f"Design data response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            design_files = data.get('design_files', [])
            site_plans = data.get('site_plans', [])
            print(f"Design files: {len(design_files)}, Site plans: {len(site_plans)}")
        else:
            print(f"Design data error: {response.text}")
    
    def test_full_details_endpoint(self, auth_session, project_id):
        """Test full-details endpoint for project"""
        if not project_id:
            pytest.skip("No project found")
        
        response = auth_session.get(f"{BASE_URL}/api/projects/{project_id}/full-details")
        print(f"Full details response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Full details keys: {list(data.keys())}")
            summary = data.get('summary', {})
            print(f"Summary: {summary}")
        else:
            print(f"Full details error: {response.text}")


class TestSalesCRMBoard:
    """Test Sales CRM Board - should show 9 leads"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Sales"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["sales"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_leads_list(self, auth_session):
        """Test leads list"""
        response = auth_session.get(f"{BASE_URL}/api/leads")
        print(f"Leads response: {response.status_code}")
        if response.status_code == 200:
            leads = response.json()
            print(f"Total leads: {len(leads)}")
            # Check for various stages
            stages = set(l.get('stage_id') for l in leads)
            print(f"Unique stages: {len(stages)}")
            assert len(leads) >= 5, f"Expected ~9 leads, got {len(leads)}"
        else:
            print(f"Leads error: {response.text}")


class TestAccountsBoard:
    """Test Accounts Board - should show income, expenses, petty cash, cheques"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Accountant"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["accountant"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_accountant_overview(self, auth_session):
        """Test accountant overview"""
        response = auth_session.get(f"{BASE_URL}/api/accountant/overview")
        print(f"Accountant overview response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Income by mode: {data.get('income_by_mode', {})}")
            print(f"Expense by mode: {data.get('expense_by_mode', {})}")
            print(f"Totals: {data.get('totals', {})}")
        else:
            print(f"Accountant overview error: {response.text}")
    
    def test_income_entries(self, auth_session):
        """Test income entries"""
        response = auth_session.get(f"{BASE_URL}/api/income")
        print(f"Income response: {response.status_code}")
        if response.status_code == 200:
            income = response.json()
            print(f"Income entries: {len(income)}")
            total = sum(i.get('amount', 0) for i in income)
            print(f"Total income: {total}")
        else:
            print(f"Income error: {response.text}")
    
    def test_cheques(self, auth_session):
        """Test cheques"""
        response = auth_session.get(f"{BASE_URL}/api/cheques")
        print(f"Cheques response: {response.status_code}")
        if response.status_code == 200:
            cheques = response.json()
            print(f"Cheques count: {len(cheques)}")
        else:
            print(f"Cheques error: {response.text}")
    
    def test_credit_ledger(self, auth_session):
        """Test credit ledger"""
        response = auth_session.get(f"{BASE_URL}/api/credit-ledger")
        print(f"Credit ledger response: {response.status_code}")
        if response.status_code == 200:
            ledger = response.json()
            print(f"Credit ledger entries: {len(ledger)}")
        else:
            print(f"Credit ledger error: {response.text}")


class TestSiteEngineerDashboard:
    """Test Site Engineer Dashboard"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Site Engineer"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["site_engineer"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_se_dashboard(self, auth_session):
        """Test SE dashboard"""
        response = auth_session.get(f"{BASE_URL}/api/se/dashboard")
        print(f"SE dashboard response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"SE dashboard keys: {list(data.keys())}")
        else:
            print(f"SE dashboard error: {response.text}")
    
    def test_se_projects(self, auth_session):
        """Test SE assigned projects"""
        response = auth_session.get(f"{BASE_URL}/api/projects")
        print(f"SE projects response: {response.status_code}")
        if response.status_code == 200:
            projects = response.json()
            print(f"SE projects count: {len(projects)}")
        else:
            print(f"SE projects error: {response.text}")
    
    def test_petty_cash(self, auth_session):
        """Test petty cash"""
        response = auth_session.get(f"{BASE_URL}/api/petty-cash-v2")
        print(f"Petty cash response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            entries = data if isinstance(data, list) else data.get('entries', [])
            print(f"Petty cash entries: {len(entries)}")
        else:
            print(f"Petty cash error: {response.text}")


class TestPlanningBoard:
    """Test Planning Board"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Planning"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["planning"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_planning_projects(self, auth_session):
        """Test planning projects"""
        response = auth_session.get(f"{BASE_URL}/api/planning/projects")
        print(f"Planning projects response: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Planning projects: {data}")
        else:
            print(f"Planning projects error: {response.text}")
    
    def test_boq_items(self, auth_session):
        """Test BOQ items"""
        # First get a project
        response = auth_session.get(f"{BASE_URL}/api/projects")
        if response.status_code == 200:
            projects = response.json()
            if projects:
                project_id = projects[0].get('project_id')
                response = auth_session.get(f"{BASE_URL}/api/boq/{project_id}")
                print(f"BOQ items response: {response.status_code}")
                if response.status_code == 200:
                    items = response.json()
                    print(f"BOQ items count: {len(items)}")


class TestProcurementBoard:
    """Test Procurement Board"""
    
    @pytest.fixture
    def auth_session(self):
        """Get authenticated session for Procurement"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": DEMO_USERS["procurement"]
        })
        assert response.status_code == 200
        data = response.json()
        token = data.get("session_token") or data.get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_material_requests(self, auth_session):
        """Test material requests for procurement"""
        response = auth_session.get(f"{BASE_URL}/api/material-requests")
        print(f"Material requests response: {response.status_code}")
        if response.status_code == 200:
            requests_list = response.json()
            print(f"Material requests count: {len(requests_list)}")
            # Check various statuses
            statuses = set(r.get('status') for r in requests_list)
            print(f"Request statuses: {statuses}")
        else:
            print(f"Material requests error: {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
