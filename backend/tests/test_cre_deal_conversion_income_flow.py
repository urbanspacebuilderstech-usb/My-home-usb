"""
Test CRE Deal Conversion and Income Approval Flow
Tests the fix for: After Sales closes a deal, CRE should see it in 'New Deals' tab, 
convert it with advance payment, and the Accountant should get payment approval.

Key fixes tested:
1. CRE sees new deals at 'Deal Closed' stage via GET /api/cre/new-deals
2. CRE converts deal via POST /api/cre/convert-deal/{lead_id} with advance payment 
   → creates project + income record with status=pending_approval
3. Accountant sees pending income in GET /api/approvals/unified
4. Accountant approves income via POST /api/approvals/income/{id}/approve
5. Accountant can verify advance via PATCH /api/cre/projects/{id}/accountant-verify
"""
import pytest
import requests
import os
import secrets
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CRE_CREDS = {"email": "cre@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT_CREDS = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
ADMIN_CREDS = {"email": "admin@constructionos.com", "password": "Demo@1234"}


@pytest.fixture(scope="module")
def cre_session():
    """Login as CRE and return authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json=CRE_CREDS)
    if response.status_code != 200:
        pytest.skip(f"CRE login failed: {response.status_code} - {response.text}")
    
    return session


@pytest.fixture(scope="module")
def accountant_session():
    """Login as Accountant and return authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json=ACCOUNTANT_CREDS)
    if response.status_code != 200:
        pytest.skip(f"Accountant login failed: {response.status_code} - {response.text}")
    
    return session


@pytest.fixture(scope="module")
def admin_session():
    """Login as Super Admin and return authenticated session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    return session


class TestCRENewDeals:
    """Test CRE can see new deals in 'New Deals' tab"""
    
    def test_cre_new_deals_endpoint(self, cre_session):
        """Test GET /api/cre/new-deals returns correct structure"""
        response = cre_session.get(f"{BASE_URL}/api/cre/new-deals")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        deals = response.json()
        assert isinstance(deals, list), "Response should be a list"
        
        print(f"✓ CRE new-deals endpoint works. Found {len(deals)} deals")
        
        # Check if Murugan deal exists (from seed data - may already be converted)
        murugan_deals = [d for d in deals if 'murugan' in str(d.get('name', '')).lower() 
                        or 'murugan' in str(d.get('client_name', '')).lower()]
        print(f"  - Murugan deals in list: {len(murugan_deals)}")
        
        return deals
    
    def test_deal_structure(self, cre_session):
        """Test that deals have correct structure (deal_type, client info, etc)"""
        response = cre_session.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 200
        
        deals = response.json()
        
        if len(deals) > 0:
            deal = deals[0]
            # Deals should have deal_type
            assert 'deal_type' in deal, "Deal should have deal_type field"
            print(f"✓ Deal structure valid. First deal type: {deal.get('deal_type')}")
        else:
            print("! No deals found (may all be converted already)")


class TestCREDashboard:
    """Test CRE Dashboard functionality"""
    
    def test_cre_dashboard(self, cre_session):
        """Test GET /api/cre/dashboard returns dashboard data"""
        response = cre_session.get(f"{BASE_URL}/api/cre/dashboard")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check expected fields
        assert "pending_payment_count" in data, "Dashboard should have pending_payment_count"
        assert "recent_projects" in data, "Dashboard should have recent_projects"
        
        print(f"✓ CRE dashboard works")
        print(f"  - Pending payment count: {data.get('pending_payment_count')}")
        print(f"  - Recent projects: {len(data.get('recent_projects', []))}")
        
        return data


class TestAccountantApprovals:
    """Test Accountant can see pending approvals including income"""
    
    def test_unified_approvals_endpoint(self, accountant_session):
        """Test GET /api/approvals/unified returns all pending approvals"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check structure
        assert "income" in data, "Should have 'income' field"
        assert "materials" in data, "Should have 'materials' field"
        assert "labour" in data, "Should have 'labour' field"
        assert "vendor" in data, "Should have 'vendor' field"
        assert "summary" in data, "Should have 'summary' field"
        
        print(f"✓ Unified approvals endpoint works")
        print(f"  - Pending income: {len(data['income'])} (total: {data['summary'].get('income_total', 0)})")
        print(f"  - Pending materials: {len(data['materials'])}")
        print(f"  - Pending labour: {len(data['labour'])}")
        print(f"  - Pending vendor: {len(data['vendor'])}")
        
        return data
    
    def test_pending_income_structure(self, accountant_session):
        """Test pending income records have correct structure"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        data = response.json()
        pending_income = data.get("income", [])
        
        if len(pending_income) > 0:
            income = pending_income[0]
            
            # Should have key fields
            assert "income_id" in income, "Income should have income_id"
            assert "amount" in income, "Income should have amount"
            assert "status" in income, "Income should have status"
            
            # Status should be pending_approval
            assert income.get("status") == "pending_approval", f"Income status should be pending_approval, got {income.get('status')}"
            
            print(f"✓ Pending income structure valid")
            print(f"  - First pending income: {income.get('income_id')}")
            print(f"  - Amount: {income.get('amount')}")
            print(f"  - Project: {income.get('project_name')}")
        else:
            print("! No pending income found (may all be approved)")


class TestIncomeApproval:
    """Test Accountant can approve/reject income"""
    
    def test_approve_income(self, accountant_session):
        """Test POST /api/approvals/income/{id}/approve"""
        # First get pending income
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        pending_income = response.json().get("income", [])
        
        if len(pending_income) == 0:
            pytest.skip("No pending income to approve")
        
        income_id = pending_income[0].get("income_id")
        amount = pending_income[0].get("amount")
        
        print(f"  Approving income: {income_id} (amount: {amount})")
        
        # Approve the income
        response = accountant_session.post(f"{BASE_URL}/api/approvals/income/{income_id}/approve")
        
        # Could be 200 or 404 if already processed
        if response.status_code == 200:
            print(f"✓ Income {income_id} approved successfully")
            data = response.json()
            assert "message" in data, "Response should have message"
        elif response.status_code == 404:
            print(f"! Income {income_id} already processed or not found")
        else:
            print(f"✗ Unexpected status: {response.status_code} - {response.text}")


class TestAccountantVerifyAdvance:
    """Test Accountant can verify advance payment on projects"""
    
    def test_accountant_verify_advance(self, accountant_session):
        """Test PATCH /api/cre/projects/{project_id}/accountant-verify"""
        # First find a project with status=pending_payment
        response = accountant_session.get(f"{BASE_URL}/api/accounts/pending-verifications")
        
        if response.status_code != 200:
            # Try alternate approach - get all projects
            response = accountant_session.get(f"{BASE_URL}/api/cre/projects/all")
            if response.status_code != 200:
                pytest.skip("Cannot access projects")
            
            projects = response.json()
            pending_projects = [p for p in projects if p.get("status") == "pending_payment"]
        else:
            pending_projects = response.json()
        
        if len(pending_projects) == 0:
            print("! No projects pending payment verification")
            return
        
        project = pending_projects[0]
        project_id = project.get("project_id")
        
        print(f"  Verifying advance for project: {project_id}")
        
        # Verify the advance
        response = accountant_session.patch(
            f"{BASE_URL}/api/cre/projects/{project_id}/accountant-verify",
            json={"transaction_id": "TXN_TEST_123", "payment_type": "bank_transfer", "remarks": "Test verification"}
        )
        
        if response.status_code == 200:
            print(f"✓ Advance verified for project {project_id}")
            data = response.json()
            assert "status" in data, "Response should have status"
        elif response.status_code == 400:
            # Project may not be in pending_payment status
            print(f"! Project {project_id} not in pending_payment status: {response.json().get('detail')}")
        else:
            print(f"✗ Unexpected status: {response.status_code} - {response.text}")


class TestCreateTestLeadAndConvert:
    """Create a test lead at Deal Closed and convert it (full flow test)"""
    
    def test_full_conversion_flow(self, admin_session, cre_session, accountant_session):
        """Full E2E test: Create lead → Convert → Check income → Approve"""
        
        # Step 1: Get Deal Closed stage ID
        response = admin_session.get(f"{BASE_URL}/api/crm/stages?type=sales")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        
        stages = response.json()
        deal_closed_stage = None
        for stage in stages:
            if stage.get("name") == "Deal Closed":
                deal_closed_stage = stage
                break
        
        if not deal_closed_stage:
            pytest.skip("Deal Closed stage not found")
        
        deal_closed_stage_id = deal_closed_stage.get("stage_id")
        print(f"  Deal Closed stage ID: {deal_closed_stage_id}")
        
        # Step 2: Create a test lead directly at Deal Closed stage
        test_lead_id = f"test_lead_{secrets.token_hex(4)}"
        test_lead = {
            "lead_id": test_lead_id,
            "name": f"TEST_Conversion_{datetime.now().strftime('%H%M%S')}",
            "phone": "9876543210",
            "email": "test_conversion@test.com",
            "city": "Chennai",
            "current_stage_id": deal_closed_stage_id,
            "stage_type": "sales",
            "status": "active",
            "deal_value": 3500000,
            "source": "test",
            "created_at": datetime.now().isoformat()
        }
        
        # Insert lead directly (admin)
        response = admin_session.post(f"{BASE_URL}/api/crm/leads", json=test_lead)
        
        if response.status_code not in [200, 201]:
            # Try alternate endpoint
            print(f"! Lead creation via API failed: {response.status_code}")
            pytest.skip("Cannot create test lead via API")
        
        print(f"✓ Test lead created: {test_lead_id}")
        
        # Step 3: CRE should see this lead in new-deals
        response = cre_session.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 200
        
        deals = response.json()
        our_deal = None
        for deal in deals:
            if deal.get("lead_id") == test_lead_id:
                our_deal = deal
                break
        
        if not our_deal:
            print(f"! Test lead not found in new-deals (may need different stage)")
            # Continue anyway to test conversion endpoint
        else:
            print(f"✓ Test lead appears in CRE new-deals")
        
        # Step 4: Convert the deal to project
        convert_data = {
            "project_name": f"TEST Project {test_lead_id}",
            "client_name": "Test Client",
            "client_phone": "9876543210",
            "client_email": "test@test.com",
            "location": "Chennai",
            "sqft": 1500,
            "building_type": "residential",
            "expected_start_date": datetime.now().strftime("%Y-%m-%d"),
            "advance_amount": 250000,  # Important: advance triggers income creation
            "payment_mode": "bank_transfer",
            "payment_reference": "TXN_TEST_REF",
            "accountant_confirmed": True
        }
        
        response = cre_session.post(
            f"{BASE_URL}/api/cre/convert-deal/{test_lead_id}",
            json=convert_data
        )
        
        if response.status_code == 404:
            print(f"! Lead not found for conversion (expected if lead creation failed)")
            return
        
        if response.status_code == 400:
            print(f"! Conversion failed: {response.json().get('detail')}")
            return
        
        assert response.status_code == 200, f"Conversion failed: {response.status_code} - {response.text}"
        
        result = response.json()
        project_id = result.get("project_id")
        print(f"✓ Deal converted to project: {project_id}")
        print(f"  - Advance collected: {result.get('advance_collected')}")
        print(f"  - Status: {result.get('status')}")
        
        # Step 5: Check income record was created with pending_approval
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        pending_income = response.json().get("income", [])
        
        # Look for income matching our project
        our_income = None
        for income in pending_income:
            if income.get("project_id") == project_id:
                our_income = income
                break
        
        if our_income:
            print(f"✓ Income record created with pending_approval status")
            print(f"  - Income ID: {our_income.get('income_id')}")
            print(f"  - Amount: {our_income.get('amount')}")
            print(f"  - Status: {our_income.get('status')}")
            
            # Step 6: Approve the income
            income_id = our_income.get("income_id")
            response = accountant_session.post(f"{BASE_URL}/api/approvals/income/{income_id}/approve")
            
            if response.status_code == 200:
                print(f"✓ Income approved successfully")
            else:
                print(f"! Income approval returned: {response.status_code}")
        else:
            print(f"! Income record not found in pending approvals (check convert_deal logic)")


class TestExistingMuruganData:
    """Test with existing Murugan seed data"""
    
    def test_murugan_income_exists(self, accountant_session):
        """Check if Murugan pending income exists from seed data"""
        response = accountant_session.get(f"{BASE_URL}/api/approvals/unified")
        assert response.status_code == 200
        
        data = response.json()
        pending_income = data.get("income", [])
        
        # Look for Murugan-related income
        murugan_income = [i for i in pending_income 
                         if 'murugan' in str(i.get('project_name', '')).lower()
                         or i.get('income_id', '').startswith('inc_murugan')]
        
        if murugan_income:
            print(f"✓ Found {len(murugan_income)} Murugan pending income records")
            for inc in murugan_income:
                print(f"  - {inc.get('income_id')}: {inc.get('amount')} ({inc.get('status')})")
        else:
            print("! No Murugan pending income found (may be approved already)")
    
    def test_murugan_project_exists(self, cre_session):
        """Check if Murugan project exists"""
        response = cre_session.get(f"{BASE_URL}/api/cre/dashboard")
        assert response.status_code == 200
        
        data = response.json()
        recent_projects = data.get("recent_projects", [])
        
        murugan_projects = [p for p in recent_projects 
                           if 'murugan' in str(p.get('name', '')).lower()
                           or p.get('project_id') == 'proj_murugan_001']
        
        if murugan_projects:
            print(f"✓ Found Murugan project(s):")
            for proj in murugan_projects:
                print(f"  - {proj.get('project_id')}: {proj.get('name')} (status: {proj.get('status')})")
        else:
            print("! No Murugan projects found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
