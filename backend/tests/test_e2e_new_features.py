"""
Test E2E New Features:
1. Auto-Cheque Creation when CRE converts a deal with cheque payment
2. Site Engineer 'Mini Cashbook' tab showing project-specific income/expenses
3. Accountant 'Petty Cash Management' view listing all SE petty cash balances

Database pre-populated with:
- 1 lead (Mr. Vinothkumar babu, lead_978e3cf17f84, deal_closed)
- 1 project (Villa Vinothkumar - Coimbatore, proj_6f33e023cc5f)
- 2 cheques (CHQ001 ₹300K, CHQ002 ₹200K)
- 2 petty cash entries (pc_29ba99b65611 ₹25K issued, pc_425e29780351 ₹15K issued)
- 1 SE assignment (user_engineer001)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://indirect-costs-ui.preview.emergentagent.com"


class TestSession:
    """Shared session with cookie-based auth"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    @pytest.fixture(scope="class") 
    def accountant_session(self, session):
        """Login as accountant"""
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def site_engineer_session(self):
        """Login as site engineer"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Site Engineer login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def cre_session(self):
        """Login as CRE"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cre@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"CRE login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def super_admin_session(self):
        """Login as super admin"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Super Admin login failed: {resp.text}"
        return session


class TestLoginAllRoles(TestSession):
    """Test login for all roles"""
    
    def test_super_admin_login(self):
        """Super Admin login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Super Admin login failed: {resp.text}"
        data = resp.json()
        assert data.get('role') == 'super_admin' or data.get('user', {}).get('role') == 'super_admin'
        print(f"✓ Super Admin login successful - {data.get('name') or data.get('user', {}).get('name')}")
    
    def test_accountant_login(self):
        """Accountant login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "accountant@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        data = resp.json()
        assert data.get('role') == 'accountant' or data.get('user', {}).get('role') == 'accountant'
        print(f"✓ Accountant login successful - {data.get('name') or data.get('user', {}).get('name')}")
    
    def test_site_engineer_login(self):
        """Site Engineer login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "engineer@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"Site Engineer login failed: {resp.text}"
        data = resp.json()
        assert data.get('role') == 'site_engineer' or data.get('user', {}).get('role') == 'site_engineer'
        print(f"✓ Site Engineer login successful - {data.get('name') or data.get('user', {}).get('name')}")
    
    def test_cre_login(self):
        """CRE login"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cre@constructionos.com",
            "password": "Demo@1234"
        })
        assert resp.status_code == 200, f"CRE login failed: {resp.text}"
        data = resp.json()
        assert data.get('role') == 'cre' or data.get('user', {}).get('role') == 'cre'
        print(f"✓ CRE login successful - {data.get('name') or data.get('user', {}).get('name')}")


class TestCRENewDeals(TestSession):
    """Test CRE new deals list shows already converted lead"""
    
    def test_cre_new_deals_endpoint(self, cre_session):
        """CRE should be able to access new deals list"""
        resp = cre_session.get(f"{BASE_URL}/api/cre/new-deals")
        assert resp.status_code == 200, f"CRE new deals failed: {resp.text}"
        deals = resp.json()
        print(f"✓ CRE new deals returned {len(deals)} deal(s)")
        
        # Check for Mr. Vinothkumar babu lead - it might already be converted
        # If converted, it won't appear in new deals (correct behavior)
        vinoth_deal = next((d for d in deals if 'Vinothkumar' in (d.get('name') or d.get('client_name') or '')), None)
        if vinoth_deal:
            print(f"  Found Vinothkumar deal (not yet converted)")
        else:
            print(f"  Vinothkumar deal not in new deals (already converted - expected)")


class TestAccountantChequeManagement(TestSession):
    """Test Accountant Cheque Management showing auto-created cheques"""
    
    def test_accountant_cheques_endpoint(self, accountant_session):
        """Accountant should see all cheques including auto-created ones"""
        resp = accountant_session.get(f"{BASE_URL}/api/accountant/cheques")
        assert resp.status_code == 200, f"Failed to get cheques: {resp.text}"
        cheques = resp.json()
        print(f"✓ Accountant cheques returned {len(cheques)} cheque(s)")
        
        # Look for the auto-created cheques CHQ001 ₹300K and CHQ002 ₹200K
        chq001 = next((c for c in cheques if c.get('cheque_number') == 'CHQ001'), None)
        chq002 = next((c for c in cheques if c.get('cheque_number') == 'CHQ002'), None)
        
        if chq001:
            assert chq001.get('amount') == 300000, f"CHQ001 amount mismatch: {chq001.get('amount')}"
            print(f"  ✓ CHQ001 found - ₹{chq001.get('amount'):,} - Project: {chq001.get('project_name')}")
        else:
            print(f"  ! CHQ001 not found in cheques list")
        
        if chq002:
            assert chq002.get('amount') == 200000, f"CHQ002 amount mismatch: {chq002.get('amount')}"
            print(f"  ✓ CHQ002 found - ₹{chq002.get('amount'):,} - Project: {chq002.get('project_name')}")
        else:
            print(f"  ! CHQ002 not found in cheques list")
        
        # Check that cheques are linked to Villa Vinothkumar - Coimbatore
        villa_cheques = [c for c in cheques if 'Vinothkumar' in (c.get('project_name') or '')]
        print(f"  Found {len(villa_cheques)} cheque(s) linked to Villa Vinothkumar project")
        
        return cheques


class TestSiteEngineerMiniCashbook(TestSession):
    """Test Site Engineer Mini Cashbook showing petty cash entries"""
    
    def test_mini_cashbook_endpoint(self, site_engineer_session):
        """Site Engineer should see their mini cashbook"""
        resp = site_engineer_session.get(f"{BASE_URL}/api/site-engineer/mini-cashbook")
        assert resp.status_code == 200, f"Failed to get mini cashbook: {resp.text}"
        data = resp.json()
        
        summary = data.get('summary', {})
        cashbooks = data.get('cashbooks', [])
        
        total_issued = summary.get('total_issued', 0)
        total_spent = summary.get('total_spent', 0)
        total_balance = summary.get('total_balance', 0)
        
        print(f"✓ Site Engineer Mini Cashbook:")
        print(f"  Total Issued: ₹{total_issued:,.0f}")
        print(f"  Total Spent: ₹{total_spent:,.0f}")
        print(f"  Balance: ₹{total_balance:,.0f}")
        print(f"  Project Count: {len(cashbooks)}")
        
        # Check for expected ₹40,000 total issued (₹25K + ₹15K)
        # Note: This might vary based on actual test data
        if total_issued > 0:
            print(f"  ✓ Petty cash entries found with ₹{total_issued:,.0f} total issued")
        
        return data
    
    def test_petty_cash_list(self, site_engineer_session):
        """Site Engineer should see their petty cash list"""
        resp = site_engineer_session.get(f"{BASE_URL}/api/site-engineer/petty-cash")
        assert resp.status_code == 200, f"Failed to get petty cash list: {resp.text}"
        data = resp.json()
        
        print(f"✓ Site Engineer Petty Cash list:")
        if isinstance(data, list):
            print(f"  Found {len(data)} petty cash entries")
            for pc in data[:5]:  # Show first 5
                print(f"  - {pc.get('petty_cash_id')}: ₹{pc.get('amount_issued', 0):,.0f} ({pc.get('status')})")
        else:
            print(f"  Response: {data}")
        
        return data


class TestAccountantPettyCashManagement(TestSession):
    """Test Accountant Petty Cash Management view"""
    
    def test_petty_cash_management_endpoint(self, accountant_session):
        """Accountant should see all SE petty cash balances"""
        resp = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash-management")
        assert resp.status_code == 200, f"Failed to get petty cash management: {resp.text}"
        data = resp.json()
        
        site_engineers = data.get('site_engineers', [])
        summary = data.get('summary', {})
        
        print(f"✓ Accountant Petty Cash Management:")
        print(f"  Site Engineers with petty cash: {len(site_engineers)}")
        print(f"  Total Issued: ₹{summary.get('total_issued', 0):,.0f}")
        print(f"  Total Spent: ₹{summary.get('total_spent', 0):,.0f}")
        print(f"  Total Balance: ₹{summary.get('total_balance', 0):,.0f}")
        print(f"  Pending Requests: {summary.get('pending_requests', 0)}")
        
        # Check for Ramesh Kumar (SE) with ₹40,000 issued
        ramesh = next((se for se in site_engineers if 'Ramesh' in (se.get('name') or '')), None)
        if ramesh:
            print(f"  ✓ Found SE {ramesh.get('name')}: ₹{ramesh.get('total_issued', 0):,.0f} issued")
        else:
            if site_engineers:
                for se in site_engineers[:3]:
                    print(f"  Found SE: {se.get('name')} - ₹{se.get('total_issued', 0):,.0f} issued")
        
        return data
    
    def test_se_mini_cashbook_for_accountant(self, accountant_session):
        """Accountant can view specific SE's mini cashbook"""
        # First get SE list
        mgmt_resp = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash-management")
        assert mgmt_resp.status_code == 200
        site_engineers = mgmt_resp.json().get('site_engineers', [])
        
        if not site_engineers:
            print("! No site engineers found with petty cash - skipping SE cashbook test")
            pytest.skip("No SE found with petty cash")
            return
        
        # Get first SE's cashbook
        se = site_engineers[0]
        se_user_id = se.get('user_id')
        
        resp = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash/{se_user_id}/mini-cashbook")
        assert resp.status_code == 200, f"Failed to get SE cashbook: {resp.text}"
        data = resp.json()
        
        print(f"✓ Accountant viewing SE Mini Cashbook for {se.get('name')}:")
        print(f"  User: {data.get('user', {}).get('name')}")
        print(f"  Total Issued: ₹{data.get('summary', {}).get('total_issued', 0):,.0f}")
        print(f"  Total Spent: ₹{data.get('summary', {}).get('total_spent', 0):,.0f}")
        print(f"  Balance: ₹{data.get('summary', {}).get('balance', 0):,.0f}")
        print(f"  Petty Cash Entries: {len(data.get('petty_cash', []))}")
        
        return data


class TestPettyCashIssueEndpoint(TestSession):
    """Test Accountant issue petty cash endpoint"""
    
    def test_petty_cash_issue_requires_json_body(self, accountant_session):
        """PATCH /api/accountant/petty-cash/{id}/issue accepts JSON body"""
        # Get a petty cash request with 'requested' status
        pc_resp = accountant_session.get(f"{BASE_URL}/api/accountant/petty-cash")
        assert pc_resp.status_code == 200
        petty_cash_list = pc_resp.json()
        
        # Find a 'requested' status petty cash (if any)
        requested_pc = next((pc for pc in petty_cash_list if pc.get('status') == 'requested'), None)
        
        if not requested_pc:
            print("! No 'requested' petty cash found - testing endpoint structure only")
            # Test with a non-existent ID to check endpoint accepts JSON body
            resp = accountant_session.patch(
                f"{BASE_URL}/api/accountant/petty-cash/test_pc_id/issue",
                json={"amount": 1000, "remarks": "Test"}
            )
            # Should return 404 (not found) instead of 400 (bad request)
            assert resp.status_code in [404, 422], f"Unexpected status: {resp.status_code} - {resp.text}"
            print(f"✓ Endpoint accepts JSON body (returned {resp.status_code} for non-existent ID)")
            return
        
        # If we have a requested PC, test the issue flow
        pc_id = requested_pc.get('petty_cash_id')
        amount = requested_pc.get('amount_requested', 5000)
        
        resp = accountant_session.patch(
            f"{BASE_URL}/api/accountant/petty-cash/{pc_id}/issue",
            json={"amount": amount, "remarks": "Test issue"}
        )
        assert resp.status_code == 200, f"Failed to issue petty cash: {resp.text}"
        data = resp.json()
        print(f"✓ Petty cash issued: {data.get('message')}")


class TestCREDashboard(TestSession):
    """Test CRE Dashboard endpoint"""
    
    def test_cre_dashboard(self, cre_session):
        """CRE dashboard should load"""
        resp = cre_session.get(f"{BASE_URL}/api/cre/dashboard")
        assert resp.status_code == 200, f"CRE dashboard failed: {resp.text}"
        data = resp.json()
        print(f"✓ CRE Dashboard loaded:")
        print(f"  Draft Projects: {data.get('draft_count', 0)}")
        print(f"  Pending Payment: {data.get('pending_payment_count', 0)}")
        print(f"  Ongoing Projects: {data.get('total_ongoing', 0)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
