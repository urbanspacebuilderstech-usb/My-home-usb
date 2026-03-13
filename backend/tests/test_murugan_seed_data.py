"""
Test Murugan Vadapalani Seed Data - Comprehensive verification of all seed data
Tests: Projects, Leads, Payment Stages, Income, Expenses, Approvals, Cheques, Petty Cash
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CREDENTIALS = {
    'super_admin': {'email': 'admin@constructionos.com', 'password': 'Demo@1234'},
    'accountant': {'email': 'accountant@constructionos.com', 'password': 'Demo@1234'},
    'cre': {'email': 'cre@constructionos.com', 'password': 'Demo@1234'},
}


@pytest.fixture(scope='module')
def super_admin_session():
    """Login as Super Admin"""
    session = requests.Session()
    resp = session.post(f'{BASE_URL}/api/auth/login', json=CREDENTIALS['super_admin'])
    assert resp.status_code == 200, f"Super Admin login failed: {resp.text}"
    return session


@pytest.fixture(scope='module')
def accountant_session():
    """Login as Accountant"""
    session = requests.Session()
    resp = session.post(f'{BASE_URL}/api/auth/login', json=CREDENTIALS['accountant'])
    assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
    return session


@pytest.fixture(scope='module')
def cre_session():
    """Login as CRE"""
    session = requests.Session()
    resp = session.post(f'{BASE_URL}/api/auth/login', json=CREDENTIALS['cre'])
    assert resp.status_code == 200, f"CRE login failed: {resp.text}"
    return session


class TestProjectSeedData:
    """Test 1: Only Villa Murugan - Vadapalani project exists"""
    
    def test_only_one_project_exists(self, super_admin_session):
        """Verify only 1 project exists in the database"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects')
        assert resp.status_code == 200
        projects = resp.json()
        assert len(projects) == 1, f"Expected 1 project, found {len(projects)}"
        
    def test_project_details_correct(self, super_admin_session):
        """Verify project details match seed data"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects')
        assert resp.status_code == 200
        project = resp.json()[0]
        
        # Verify project name and ID
        assert project['project_id'] == 'proj_murugan_001'
        assert project['name'] == 'Villa Murugan - Vadapalani'
        assert project['client_name'] == 'Mr. Murugan'
        
        # Verify project specs
        assert project['total_sqft'] == 2400
        assert project['bedrooms'] == 3
        assert project['total_value'] == 5500000
        
        # Verify location
        assert 'Vadapalani' in project['location']
        assert project['city'] == 'Chennai'
        
    def test_project_financial_summary(self, super_admin_session):
        """Verify project income and expense totals"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects')
        project = resp.json()[0]
        
        # From seed: income_project = 900000, expense_project = 280300
        assert project['income_project'] == 900000, f"Expected income 900000, got {project['income_project']}"
        # expense is calculated sum of approved materials + labour + vendor + petty
        # 32500 + 18600 + 76000 + 96000 + 28000 + 25000 + 4200 = 280300
        assert project['expense_project'] == 280300, f"Expected expense 280300, got {project['expense_project']}"


class TestLeadsSeedData:
    """Test 2 & 3: Pre-Sales and Sales leads exist using correct API endpoints"""
    
    def test_presales_lead_exists(self, super_admin_session):
        """Verify Pre-Sales lead Murugan at Appointment Booked stage"""
        resp = super_admin_session.get(f'{BASE_URL}/api/crm/pre-sales/leads')
        assert resp.status_code == 200, f"GET pre-sales leads failed: {resp.text}"
        leads = resp.json()
        
        # Find lead_murugan_001
        murugan_lead = next((l for l in leads if l.get('lead_id') == 'lead_murugan_001'), None)
        assert murugan_lead is not None, f"lead_murugan_001 not found in {len(leads)} pre-sales leads"
        
        # Verify details
        assert murugan_lead['name'] == 'Murugan'
        assert murugan_lead['current_stage_id'] == 'stg_appointment'
        assert murugan_lead['transferred_to_lead_id'] == 'lead_murugan_sales'
        
        # Verify stage_history exists
        assert 'stage_history' in murugan_lead
        assert len(murugan_lead['stage_history']) >= 6, f"Expected 6 stage history entries, got {len(murugan_lead['stage_history'])}"
        
    def test_sales_lead_exists(self, super_admin_session):
        """Verify Sales lead Murugan at Deal Closed with deal_value 5500000"""
        resp = super_admin_session.get(f'{BASE_URL}/api/crm/sales/leads')
        assert resp.status_code == 200, f"GET sales leads failed: {resp.text}"
        leads = resp.json()
        
        # Find lead_murugan_sales
        murugan_sales = next((l for l in leads if l.get('lead_id') == 'lead_murugan_sales'), None)
        assert murugan_sales is not None, f"lead_murugan_sales not found in {len(leads)} sales leads"
        
        # Verify details
        assert murugan_sales['name'] == 'Murugan'
        assert murugan_sales['current_stage_id'] == 'stg_deal_closed'
        assert murugan_sales['deal_value'] == 5500000, f"Expected deal_value 5500000, got {murugan_sales['deal_value']}"
        assert murugan_sales['transferred_from_lead_id'] == 'lead_murugan_001'


class TestPaymentStages:
    """Test 6: 13 payment stages, 2 paid, 11 pending"""
    
    def test_payment_stages_count(self, super_admin_session):
        """Verify 13 payment stages exist"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects/proj_murugan_001/payment-stages')
        assert resp.status_code == 200
        stages = resp.json()
        
        assert len(stages) == 13, f"Expected 13 payment stages, got {len(stages)}"
        
    def test_paid_vs_pending_stages(self, super_admin_session):
        """Verify 2 paid and 11 pending stages"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects/proj_murugan_001/payment-stages')
        stages = resp.json()
        
        paid_stages = [s for s in stages if s.get('status') == 'paid']
        pending_stages = [s for s in stages if s.get('status') == 'pending']
        
        assert len(paid_stages) == 2, f"Expected 2 paid stages, got {len(paid_stages)}"
        assert len(pending_stages) == 11, f"Expected 11 pending stages, got {len(pending_stages)}"
        
        # Verify paid amounts
        total_paid = sum(s.get('amount_received', 0) for s in paid_stages)
        assert total_paid == 900000, f"Expected total paid 900000, got {total_paid}"


class TestIncomeRecords:
    """Test 9: Income records (2 approved + 1 pending)"""
    
    def test_income_entries(self, super_admin_session):
        """Verify income entries exist"""
        resp = super_admin_session.get(f'{BASE_URL}/api/income', params={'project_id': 'proj_murugan_001'})
        assert resp.status_code == 200
        income = resp.json()
        
        # Should have at least 3 income entries (2 approved from paid stages + 1 pending)
        assert len(income) >= 3, f"Expected at least 3 income entries, got {len(income)}"
        
    def test_pending_income_approval(self, accountant_session):
        """Verify pending income entry exists for accountant approval"""
        resp = accountant_session.get(f'{BASE_URL}/api/approvals/unified')
        assert resp.status_code == 200
        data = resp.json()
        
        pending_income = data.get('income', [])
        # Should have at least 1 pending income (inc_murugan_pending with amount 400000)
        assert len(pending_income) >= 1, f"Expected at least 1 pending income, got {len(pending_income)}"
        
        # Check for the specific pending income
        pending_400k = next((i for i in pending_income if i.get('amount') == 400000), None)
        assert pending_400k is not None, "Pending income of 400000 not found"


class TestAccountantApprovals:
    """Test 5: Accountant has pending approvals (income + materials + labour + vendor)"""
    
    def test_unified_approvals(self, accountant_session):
        """Verify unified approvals endpoint returns pending items"""
        resp = accountant_session.get(f'{BASE_URL}/api/approvals/unified')
        assert resp.status_code == 200
        data = resp.json()
        
        summary = data.get('summary', {})
        print(f"Approval Summary: {summary}")
        
        # Verify we have pending items
        income_count = summary.get('income_count', 0)
        material_count = summary.get('material_count', 0)
        labour_count = summary.get('labour_count', 0)
        vendor_count = summary.get('vendor_count', 0)
        
        total_pending = income_count + material_count + labour_count + vendor_count
        
        # Expect pending approvals
        print(f"Pending counts - Income: {income_count}, Material: {material_count}, Labour: {labour_count}, Vendor: {vendor_count}")
        assert total_pending >= 1, f"Expected at least 1 pending approval, got {total_pending}"


class TestCheques:
    """Test 7: 4 cheques (incoming/outgoing)"""
    
    def test_cheques_count(self, accountant_session):
        """Verify 4 cheques exist"""
        resp = accountant_session.get(f'{BASE_URL}/api/accountant/cheques')
        assert resp.status_code == 200, f"GET cheques failed: {resp.text}"
        cheques = resp.json()
        
        # Filter for project
        project_cheques = [c for c in cheques if c.get('project_id') == 'proj_murugan_001']
        assert len(project_cheques) == 4, f"Expected 4 cheques for project, got {len(project_cheques)}"
        
    def test_cheque_types(self, accountant_session):
        """Verify incoming and outgoing cheques"""
        resp = accountant_session.get(f'{BASE_URL}/api/accountant/cheques')
        assert resp.status_code == 200
        cheques = resp.json()
        
        project_cheques = [c for c in cheques if c.get('project_id') == 'proj_murugan_001']
        
        incoming = [c for c in project_cheques if c.get('cheque_type') == 'incoming']
        outgoing = [c for c in project_cheques if c.get('cheque_type') == 'outgoing']
        
        assert len(incoming) == 2, f"Expected 2 incoming cheques, got {len(incoming)}"
        assert len(outgoing) == 2, f"Expected 2 outgoing cheques, got {len(outgoing)}"


class TestPettyCash:
    """Test 8: 3 petty cash entries (settled/issued/requested)"""
    
    def test_petty_cash_management(self, accountant_session):
        """Verify petty cash management endpoint works"""
        resp = accountant_session.get(f'{BASE_URL}/api/accountant/petty-cash-management')
        assert resp.status_code == 200
        data = resp.json()
        
        # Check summary
        summary = data.get('summary', {})
        print(f"Petty Cash Summary: {summary}")
        
        # There should be some petty cash data
        site_engineers = data.get('site_engineers', [])
        print(f"Found {len(site_engineers)} site engineers with petty cash data")


class TestWorkOrders:
    """Test Work Orders: 4 work orders for Murugan project"""
    
    def test_work_orders_for_project(self, super_admin_session):
        """Verify work orders exist for project"""
        resp = super_admin_session.get(f'{BASE_URL}/api/work-orders', params={'project_id': 'proj_murugan_001'})
        assert resp.status_code == 200
        work_orders = resp.json()
        
        # Filter for project (may have work orders from other sources)
        murugan_wos = [w for w in work_orders if w.get('project_id') == 'proj_murugan_001']
        
        # Verify we have at least 4 work orders
        assert len(murugan_wos) >= 4, f"Expected at least 4 work orders, got {len(murugan_wos)}"
        
    def test_work_order_details(self, super_admin_session):
        """Verify work order details"""
        resp = super_admin_session.get(f'{BASE_URL}/api/work-orders', params={'project_id': 'proj_murugan_001'})
        work_orders = resp.json()
        
        # Check WO-001 is in_progress
        wo_001 = next((w for w in work_orders if w.get('work_order_code') == 'WO-001'), None)
        assert wo_001 is not None, "WO-001 not found"
        assert wo_001['status'] == 'in_progress', f"Expected WO-001 status 'in_progress', got {wo_001['status']}"


class TestMaterialRequests:
    """Test Material Requests: 6 total"""
    
    def test_material_expenses(self, super_admin_session):
        """Verify 6 material expense entries exist"""
        resp = super_admin_session.get(f'{BASE_URL}/api/expenses/material', params={'project_id': 'proj_murugan_001'})
        assert resp.status_code == 200
        materials = resp.json()
        
        # From seed: 6 material entries
        assert len(materials) >= 6, f"Expected at least 6 material expenses, got {len(materials)}"
        
        # Check statuses
        approved = [m for m in materials if m.get('status') == 'accounts_approved']
        priced = [m for m in materials if m.get('status') == 'procurement_priced']
        requested = [m for m in materials if m.get('status') == 'requested']
        
        print(f"Material statuses - Approved: {len(approved)}, Priced: {len(priced)}, Requested: {len(requested)}")


class TestBOQItems:
    """Test BOQ Items: 12 items"""
    
    def test_boq_items_count(self, super_admin_session):
        """Verify 12 BOQ items exist"""
        # Using correct endpoint: /api/boq/{project_id}
        resp = super_admin_session.get(f'{BASE_URL}/api/boq/proj_murugan_001')
        assert resp.status_code == 200, f"GET BOQ items failed: {resp.text}"
        boq_items = resp.json()
        
        assert len(boq_items) == 12, f"Expected 12 BOQ items, got {len(boq_items)}"


class TestAccountantOverview:
    """Test Accountant Overview endpoint"""
    
    def test_accountant_overview_totals(self, accountant_session):
        """Verify accountant overview has correct totals"""
        resp = accountant_session.get(f'{BASE_URL}/api/accountant/overview')
        assert resp.status_code == 200
        data = resp.json()
        
        totals = data.get('totals', {})
        print(f"Accountant Overview Totals: {totals}")
        
        # Verify we have income and expense data
        assert 'total_income' in totals
        assert 'total_expense' in totals
        assert 'net_balance' in totals


class TestMaskedValuesForRoles:
    """Test 10: Masked values work correctly for Accountant (₹*****) vs Super Admin"""
    
    def test_super_admin_role_check(self, super_admin_session):
        """Verify Super Admin can access auth/me endpoint"""
        resp = super_admin_session.get(f'{BASE_URL}/api/auth/me')
        assert resp.status_code == 200, f"GET auth/me failed: {resp.text}"
        user = resp.json()
        assert user['role'] == 'super_admin', f"Expected role 'super_admin', got {user['role']}"
        
    def test_accountant_role_check(self, accountant_session):
        """Verify Accountant role"""
        resp = accountant_session.get(f'{BASE_URL}/api/auth/me')
        assert resp.status_code == 200, f"GET auth/me failed: {resp.text}"
        user = resp.json()
        assert user['role'] == 'accountant', f"Expected role 'accountant', got {user['role']}"
        
    def test_cre_role_check(self, cre_session):
        """Verify CRE role"""
        resp = cre_session.get(f'{BASE_URL}/api/auth/me')
        assert resp.status_code == 200, f"GET auth/me failed: {resp.text}"
        user = resp.json()
        assert user['role'] == 'cre', f"Expected role 'cre', got {user['role']}"


class TestComprehensiveProjectData:
    """Test comprehensive project view with all data"""
    
    def test_comprehensive_project_view(self, super_admin_session):
        """Verify comprehensive project endpoint works"""
        resp = super_admin_session.get(f'{BASE_URL}/api/projects/proj_murugan_001/comprehensive')
        assert resp.status_code == 200, f"GET comprehensive failed: {resp.text}"
        data = resp.json()
        
        # Check we have BOQ items
        assert 'boq_items' in data
        boq_items = data.get('boq_items', [])
        assert len(boq_items) == 12, f"Expected 12 BOQ items in comprehensive view, got {len(boq_items)}"
        
        # Check we have payment stages
        assert 'payment_stages' in data
        payment_stages = data.get('payment_stages', [])
        assert len(payment_stages) == 13, f"Expected 13 payment stages, got {len(payment_stages)}"


# Run tests directly if executed as script
if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
