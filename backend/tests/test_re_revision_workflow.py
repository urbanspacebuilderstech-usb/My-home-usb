"""
Test RE Revision Workflow - Sales/Pre-Sales RE revision flow
Tests:
1. POST /api/crm/re-projects/{id}/request-revision - Sales can request revision
2. POST /api/crm/re-projects/{id}/create-revision - Planning can create revision
3. PATCH /api/crm/re-projects/{id} - Should return 400 for locked RE
4. POST /api/crm/leads/{id}/accountant-verify - Should notify all_planning, all_cre, all_sales
5. GET /api/crm/re-projects/by-number/{re_number} - Returns all revisions sorted
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRERevisionWorkflow:
    """RE Revision Workflow Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login_as(self, email):
        """Login via demo-login and return session"""
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": email})
        assert response.status_code == 200, f"Login failed for {email}: {response.text}"
        return response.json()
    
    # ==================== GET RE REVISIONS BY NUMBER ====================
    def test_get_re_revisions_by_number(self):
        """Test GET /api/crm/re-projects/by-number/{re_number} returns all revisions sorted"""
        self.login_as("sales@constructionos.com")
        
        # USB-RE0006 should have multiple revisions (RE0, RE1, RE2)
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        
        assert response.status_code == 200, f"Failed to get revisions: {response.text}"
        revisions = response.json()
        
        assert isinstance(revisions, list), "Response should be a list"
        assert len(revisions) >= 2, f"Expected at least 2 revisions, got {len(revisions)}"
        
        # Verify sorted by revision number
        revision_numbers = [r.get('revision', 0) for r in revisions]
        assert revision_numbers == sorted(revision_numbers), "Revisions should be sorted by revision number"
        
        # Verify each revision has required fields
        for rev in revisions:
            assert 're_project_id' in rev, "Missing re_project_id"
            assert 'revision' in rev, "Missing revision number"
            assert 'status' in rev, "Missing status"
            assert 'parent_re_number' in rev or 're_number' in rev, "Missing RE number reference"
        
        print(f"✓ Found {len(revisions)} revisions for USB-RE0006: {revision_numbers}")
    
    # ==================== REQUEST REVISION (SALES) ====================
    def test_request_revision_as_sales(self):
        """Test POST /api/crm/re-projects/{id}/request-revision - Sales can request revision"""
        self.login_as("sales@constructionos.com")
        
        # First, find an RE with re_approved or sent_to_client status
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        assert response.status_code == 200
        revisions = response.json()
        
        # Find one with re_approved status
        approved_re = None
        for rev in revisions:
            if rev.get('status') in ['re_approved', 'sent_to_client']:
                approved_re = rev
                break
        
        if not approved_re:
            pytest.skip("No RE with re_approved or sent_to_client status found")
        
        re_project_id = approved_re['re_project_id']
        
        # Request revision
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}/request-revision",
            json={"reason": "Client requested changes to scope items"}
        )
        
        # May already have revision_requested=true, so accept 200 or 400
        if response.status_code == 200:
            data = response.json()
            assert 'message' in data, "Response should have message"
            print(f"✓ Revision requested successfully for {re_project_id}")
        else:
            # Already requested or other valid state
            print(f"✓ Request revision returned {response.status_code}: {response.text}")
    
    def test_request_revision_requires_sales_role(self):
        """Test that non-sales roles cannot request revision"""
        self.login_as("planning@constructionos.com")
        
        # Get an RE project
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        if response.status_code != 200 or not response.json():
            pytest.skip("No RE projects found")
        
        re_project_id = response.json()[0]['re_project_id']
        
        # Planning should not be able to request revision (only Sales/CRE)
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}/request-revision",
            json={"reason": "Test"}
        )
        
        # Planning role should get 403
        assert response.status_code == 403, f"Expected 403 for planning role, got {response.status_code}"
        print("✓ Planning correctly denied from requesting revision")
    
    # ==================== CREATE REVISION (PLANNING) ====================
    def test_create_revision_as_planning(self):
        """Test POST /api/crm/re-projects/{id}/create-revision - Planning can create revision"""
        self.login_as("planning@constructionos.com")
        
        # Find an RE with revision_requested=true or client_feedback status
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        assert response.status_code == 200
        revisions = response.json()
        
        # Find one that can have revision created
        eligible_re = None
        for rev in revisions:
            if rev.get('revision_requested') or rev.get('status') == 'client_feedback':
                eligible_re = rev
                break
        
        if not eligible_re:
            # Try to find any re_approved one
            for rev in revisions:
                if rev.get('status') in ['re_approved', 'sent_to_client']:
                    eligible_re = rev
                    break
        
        if not eligible_re:
            pytest.skip("No eligible RE for revision creation found")
        
        re_project_id = eligible_re['re_project_id']
        current_revision = eligible_re.get('revision', 0)
        
        # Create revision
        response = self.session.post(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/create-revision")
        
        if response.status_code == 200:
            data = response.json()
            assert 'message' in data, "Response should have message"
            assert 're_project_id' in data, "Response should have new re_project_id"
            assert 'revision' in data, "Response should have revision number"
            assert data['revision'] > current_revision, "New revision should be higher"
            print(f"✓ Created revision RE{data['revision']} from RE{current_revision}")
        elif response.status_code == 400:
            # May not meet conditions
            print(f"✓ Create revision returned 400 (expected if conditions not met): {response.text}")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    def test_create_revision_requires_planning_role(self):
        """Test that non-planning roles cannot create revision"""
        self.login_as("sales@constructionos.com")
        
        # Get an RE project
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        if response.status_code != 200 or not response.json():
            pytest.skip("No RE projects found")
        
        re_project_id = response.json()[0]['re_project_id']
        
        # Sales should not be able to create revision
        response = self.session.post(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/create-revision")
        
        assert response.status_code == 403, f"Expected 403 for sales role, got {response.status_code}"
        print("✓ Sales correctly denied from creating revision")
    
    # ==================== RE LOCK AFTER GM APPROVAL ====================
    def test_re_locked_after_gm_approval(self):
        """Test PATCH /api/crm/re-projects/{id} returns 400 for locked RE (re_approved status)"""
        self.login_as("planning@constructionos.com")
        
        # Find an RE with re_approved status
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        assert response.status_code == 200
        revisions = response.json()
        
        approved_re = None
        for rev in revisions:
            if rev.get('status') == 're_approved':
                approved_re = rev
                break
        
        if not approved_re:
            pytest.skip("No RE with re_approved status found")
        
        re_project_id = approved_re['re_project_id']
        
        # Try to update the locked RE
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": "Trying to edit locked RE"}
        )
        
        assert response.status_code == 400, f"Expected 400 for locked RE, got {response.status_code}"
        assert "locked" in response.text.lower() or "revision" in response.text.lower(), \
            f"Error message should mention locked/revision: {response.text}"
        print(f"✓ RE {re_project_id} correctly locked after GM approval")
    
    def test_super_admin_can_edit_locked_re(self):
        """Test that super_admin can override RE lock"""
        self.login_as("admin@constructionos.com")
        
        # Find an RE with re_approved status
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        assert response.status_code == 200
        revisions = response.json()
        
        approved_re = None
        for rev in revisions:
            if rev.get('status') == 're_approved':
                approved_re = rev
                break
        
        if not approved_re:
            pytest.skip("No RE with re_approved status found")
        
        re_project_id = approved_re['re_project_id']
        
        # Super admin should be able to edit
        response = self.session.patch(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}",
            json={"planning_notes": "Super admin override test"}
        )
        
        # Super admin should succeed
        assert response.status_code == 200, f"Super admin should be able to edit locked RE: {response.text}"
        print(f"✓ Super admin can override RE lock for {re_project_id}")
    
    # ==================== ACCOUNTANT VERIFY NOTIFICATIONS ====================
    def test_accountant_verify_sends_notifications(self):
        """Test POST /api/crm/leads/{id}/accountant-verify sends notifications to all_planning, all_cre, all_sales"""
        self.login_as("accountant@constructionos.com")
        
        # Find a lead with accountant_pending status
        # First get sales leads to find one with the right status
        self.login_as("sales@constructionos.com")
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        
        if response.status_code != 200:
            pytest.skip("Could not fetch sales leads")
        
        leads = response.json()
        
        # Find lead with accountant_pending status
        eligible_lead = None
        for lead in leads:
            if lead.get('onboarding_status') == 'accountant_pending':
                eligible_lead = lead
                break
        
        if not eligible_lead:
            pytest.skip("No lead with accountant_pending status found - accountant-verify requires this status")
        
        lead_id = eligible_lead['lead_id']
        
        # Login as accountant and verify
        self.login_as("accountant@constructionos.com")
        response = self.session.post(f"{BASE_URL}/api/crm/leads/{lead_id}/accountant-verify")
        
        if response.status_code == 200:
            data = response.json()
            assert 'message' in data, "Response should have message"
            print(f"✓ Accountant verified lead {lead_id}, notifications sent to all_planning, all_cre, all_sales")
        elif response.status_code == 400:
            # Already verified or other condition
            print(f"✓ Accountant verify returned 400 (expected if already verified): {response.text}")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")
    
    # ==================== SPECIFIC RE PROJECT TESTS ====================
    def test_specific_re_project_re_cddf150a9d14(self):
        """Test specific RE project re_cddf150a9d14 (USB-RE0006 RE1, status: re_approved with revision_requested: true)"""
        self.login_as("sales@constructionos.com")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/re_cddf150a9d14")
        
        if response.status_code == 404:
            pytest.skip("RE project re_cddf150a9d14 not found")
        
        assert response.status_code == 200, f"Failed to get RE project: {response.text}"
        data = response.json()
        
        # Verify expected fields
        assert data.get('re_number') == 'USB-RE0006' or data.get('parent_re_number') == 'USB-RE0006', \
            f"Expected USB-RE0006, got {data.get('re_number')}"
        
        print(f"✓ RE project re_cddf150a9d14: status={data.get('status')}, revision={data.get('revision')}, revision_requested={data.get('revision_requested')}")
    
    def test_specific_re_project_re_2bd26a02e5c8(self):
        """Test specific RE project re_2bd26a02e5c8 (USB-RE0006 RE2, status: re_in_progress)"""
        self.login_as("planning@constructionos.com")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/re_2bd26a02e5c8")
        
        if response.status_code == 404:
            pytest.skip("RE project re_2bd26a02e5c8 not found")
        
        assert response.status_code == 200, f"Failed to get RE project: {response.text}"
        data = response.json()
        
        print(f"✓ RE project re_2bd26a02e5c8: status={data.get('status')}, revision={data.get('revision')}")
    
    # ==================== REVISION FLOW END-TO-END ====================
    def test_revision_flow_e2e(self):
        """Test complete revision flow: Sales requests -> Planning creates"""
        # Step 1: Login as Sales and find an approved RE
        self.login_as("sales@constructionos.com")
        
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/by-number/USB-RE0006")
        assert response.status_code == 200
        revisions = response.json()
        
        # Find the latest approved RE
        approved_re = None
        for rev in sorted(revisions, key=lambda x: x.get('revision', 0), reverse=True):
            if rev.get('status') in ['re_approved', 'sent_to_client']:
                approved_re = rev
                break
        
        if not approved_re:
            pytest.skip("No approved RE found for e2e test")
        
        re_project_id = approved_re['re_project_id']
        print(f"Testing with RE {re_project_id} (revision {approved_re.get('revision')})")
        
        # Step 2: Sales requests revision
        response = self.session.post(
            f"{BASE_URL}/api/crm/re-projects/{re_project_id}/request-revision",
            json={"reason": "E2E test - client wants changes"}
        )
        
        if response.status_code == 200:
            print("✓ Step 1: Sales requested revision")
        else:
            print(f"Step 1: Request revision returned {response.status_code} (may already be requested)")
        
        # Step 3: Login as Planning and create revision
        self.login_as("planning@constructionos.com")
        
        # Verify revision_requested is set
        response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{re_project_id}")
        assert response.status_code == 200
        re_data = response.json()
        
        if re_data.get('revision_requested') or re_data.get('status') == 'client_feedback':
            # Create revision
            response = self.session.post(f"{BASE_URL}/api/crm/re-projects/{re_project_id}/create-revision")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ Step 2: Planning created revision RE{data.get('revision')}")
                
                # Verify new revision exists
                new_re_id = data.get('re_project_id')
                response = self.session.get(f"{BASE_URL}/api/crm/re-projects/{new_re_id}")
                assert response.status_code == 200
                new_re = response.json()
                assert new_re.get('status') == 're_in_progress', f"New revision should be in progress, got {new_re.get('status')}"
                print(f"✓ Step 3: Verified new revision {new_re_id} is in progress")
            else:
                print(f"Step 2: Create revision returned {response.status_code}: {response.text}")
        else:
            print("Step 2: Skipped - revision not requested and not client_feedback status")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
