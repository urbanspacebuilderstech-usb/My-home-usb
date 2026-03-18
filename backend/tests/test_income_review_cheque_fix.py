"""
Test suite for Income Review Cheque Payment Fix

Bug: Accountant unable to approve cheque payments - receiving 'Failed to review' error
Root cause: 
  1. Backend IncomeReviewRequest model used Dict[str, str] for cheque_verifications but frontend sent amount as number
  2. Frontend validation required projectCheques.length > 0 even when no cheques in DB, blocking approval

Fix:
  1. Changed backend cheque_verifications from Dict[str, str] to Dict[str, Any] to accept numeric amounts
  2. Frontend now sends String(c.amount) in payload
  3. Frontend allows approval even without cheque records

Tests:
  - Review income with cheque mode and amount as number in cheque_verifications
  - Review income with cheque mode but NO cheque_verifications (empty cheques scenario) 
  - Review income with cash mode
  - Review income with bank mode
  - Get income cheques endpoint
  - Get unified approvals returns pending income
"""

import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestIncomeReviewChequeFix:
    """Tests for Income Review endpoint with cheque verification fix"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as accountant"""
        self.session = requests.Session()
        resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        self.user = resp.json()
        print(f"Logged in as: {self.user.get('email')} ({self.user.get('role')})")

    def test_get_unified_approvals_returns_pending_income(self):
        """GET /api/approvals/unified should return pending income records"""
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        # Check structure
        assert "income" in data, "Response missing 'income' key"
        assert "summary" in data, "Response missing 'summary' key"
        assert "income_count" in data["summary"], "Summary missing income_count"
        
        print(f"Unified Approvals - Income count: {len(data['income'])}")
        print(f"Summary: {data['summary']}")

    def test_get_income_cheques_endpoint(self):
        """GET /api/approvals/income/{income_id}/cheques should return cheques"""
        # First get pending income
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") == "cheque"]
        
        if not pending_income:
            pytest.skip("No pending cheque income to test")
        
        income = pending_income[0]
        income_id = income.get("income_id")
        
        resp = self.session.get(f"{BASE_URL}/api/approvals/income/{income_id}/cheques")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        
        assert "cheques" in data, "Response missing 'cheques' key"
        print(f"Income {income_id} has {len(data['cheques'])} cheque(s)")
        for c in data['cheques']:
            print(f"  - Cheque: {c.get('cheque_number')} Amount: {c.get('amount')}")

    def test_review_income_cheque_with_amount_as_number(self):
        """POST /api/approvals/income/{income_id}/review with amount as number in cheque_verifications"""
        # Get pending cheque income with cheques
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") == "cheque"]
        
        if not pending_income:
            pytest.skip("No pending cheque income to test")
        
        # Find one with cheques
        income = None
        cheques = None
        for inc in pending_income:
            cheques_resp = self.session.get(f"{BASE_URL}/api/approvals/income/{inc['income_id']}/cheques")
            if cheques_resp.status_code == 200:
                cheques = cheques_resp.json().get("cheques", [])
                if cheques:
                    income = inc
                    break
        
        if not income or not cheques:
            pytest.skip("No pending cheque income with cheque records to test")
        
        income_id = income.get("income_id")
        
        # Build payload with amount as NUMBER (this was the bug - frontend sent numbers)
        payload = {
            "verification_mode": "cheque",
            "notes": "Test review with numeric amount",
            "cheque_verifications": [
                {
                    "cheque_id": c["cheque_id"],
                    "cheque_number": c["cheque_number"],
                    "entered_number": c["cheque_number"],  # Re-enter for verification
                    "amount": c["amount"],  # NUMBER type - this caused the bug before fix
                    "bank": c.get("bank_name", "")
                }
                for c in cheques
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/{income_id}/review", json=payload)
        # Should succeed now with Dict[str, Any] instead of Dict[str, str]
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "message" in data, "Response missing message"
        print(f"Review successful: {data}")

    def test_review_income_cheque_with_no_cheques_in_db(self):
        """POST /api/approvals/income/{income_id}/review with cheque mode but NO cheque_verifications"""
        # Get pending cheque income
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") == "cheque"]
        
        if not pending_income:
            pytest.skip("No pending cheque income to test")
        
        # Find one WITHOUT cheques (or create test scenario)
        income = None
        for inc in pending_income:
            cheques_resp = self.session.get(f"{BASE_URL}/api/approvals/income/{inc['income_id']}/cheques")
            if cheques_resp.status_code == 200:
                cheques = cheques_resp.json().get("cheques", [])
                if not cheques:
                    income = inc
                    break
        
        if not income:
            pytest.skip("No pending cheque income without cheque records to test")
        
        income_id = income.get("income_id")
        
        # Review with cheque mode but NO cheque_verifications (empty list or omitted)
        # This should work after the fix - approval allowed without cheque records
        payload = {
            "verification_mode": "cheque",
            "notes": "Approved cheque payment - no cheque records in system",
            "cheque_number": "CHQ-MANUAL-ENTRY"  # Manual entry allowed
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/{income_id}/review", json=payload)
        # Should succeed - approval allowed even without cheque records
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        print(f"Review without cheques successful: {data}")

    def test_review_income_cash_mode(self):
        """POST /api/approvals/income/{income_id}/review with cash verification_mode"""
        # Get pending cash income
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") == "cash"]
        
        if not pending_income:
            pytest.skip("No pending cash income to test")
        
        income = pending_income[0]
        income_id = income.get("income_id")
        amount = income.get("amount", 10000)
        
        # Build denomination that matches amount (simple: all in 500 notes)
        num_500 = int(amount) // 500
        remainder = int(amount) % 500
        
        payload = {
            "verification_mode": "cash",
            "notes": "Cash verification test",
            "denomination": {
                "500": num_500,
                "100": remainder // 100,
                "50": (remainder % 100) // 50,
                "10": (remainder % 50) // 10
            }
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/{income_id}/review", json=payload)
        assert resp.status_code == 200, f"Failed: {resp.text}"
        print(f"Cash review successful: {resp.json()}")

    def test_review_income_bank_mode(self):
        """POST /api/approvals/income/{income_id}/review with bank verification_mode"""
        # Get pending bank income
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        assert resp.status_code == 200
        
        bank_modes = ["bank_transfer", "neft", "rtgs", "imps", "upi"]
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") in bank_modes]
        
        if not pending_income:
            pytest.skip("No pending bank transfer income to test")
        
        income = pending_income[0]
        income_id = income.get("income_id")
        
        payload = {
            "verification_mode": "bank",
            "notes": "Bank transfer verification test",
            "transaction_id": f"TXN-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/{income_id}/review", json=payload)
        assert resp.status_code == 200, f"Failed: {resp.text}"
        print(f"Bank review successful: {resp.json()}")


class TestIncomeReviewValidation:
    """Tests for validation scenarios"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as accountant"""
        self.session = requests.Session()
        resp = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "accountant@constructionos.com"
        })
        assert resp.status_code == 200
        
    def test_review_non_existent_income_returns_404(self):
        """POST /api/approvals/income/{fake_id}/review should return 404"""
        payload = {
            "verification_mode": "cash",
            "notes": "Test"
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/inc_nonexistent/review", json=payload)
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    def test_cheque_verifications_accepts_any_type(self):
        """Verify cheque_verifications accepts Dict[str, Any] format"""
        # This tests the schema validation - amount as int, float, or string should all work
        
        resp = self.session.get(f"{BASE_URL}/api/approvals/unified")
        pending_income = [i for i in resp.json().get("income", []) if i.get("payment_mode") == "cheque"]
        
        if not pending_income:
            pytest.skip("No pending cheque income to test schema")
        
        # Get cheques
        income = pending_income[0]
        cheques_resp = self.session.get(f"{BASE_URL}/api/approvals/income/{income['income_id']}/cheques")
        cheques = cheques_resp.json().get("cheques", [])
        
        if not cheques:
            pytest.skip("No cheques to test schema")
        
        # Test with mixed types - amount as int (should work with Dict[str, Any])
        payload = {
            "verification_mode": "cheque",
            "cheque_verifications": [
                {
                    "cheque_id": cheques[0]["cheque_id"],
                    "cheque_number": cheques[0]["cheque_number"],
                    "entered_number": cheques[0]["cheque_number"],
                    "amount": 150000,  # Integer - was failing with Dict[str, str]
                    "bank": "Test Bank"
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/approvals/income/{income['income_id']}/review", json=payload)
        # Should not get 422 validation error - the fix allows Any type
        assert resp.status_code != 422, f"Schema validation failed - Dict[str, Any] not working: {resp.text}"
        print(f"Schema test result: {resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
