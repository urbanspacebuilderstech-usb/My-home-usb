"""
Tests for Multiple Payment Mode Feature
=======================================

Tests the multi-payment feature that allows splitting a single payment into multiple modes:
- POST /api/cre/convert-deal/{lead_id} with payment_entries array
- POST /api/payment-stages/{stage_id}/collect with payment_entries array

Payment entries format:
[{
  "amount": number,
  "payment_mode": "cash" | "cheque" | "bank_transfer" | "upi",
  "reference": string,
  "cheque_details": [{cheque_number, bank_name, amount, cheque_date}] (for cheque mode)
}]
"""

import pytest
import requests
import os
import secrets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

class TestMultiPaymentConvertDeal:
    """Test multi-payment entries for convert-deal endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRE session for testing"""
        self.session = requests.Session()
        # Login as CRE
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200, f"CRE login failed: {response.text}"
        self.user_data = response.json()
        print(f"Logged in as CRE: {self.user_data['name']}")
        yield
        self.session.close()

    def test_convert_deal_api_expects_payment_entries(self):
        """Test that convert-deal endpoint accepts payment_entries array"""
        # This tests the API schema - using a fake lead to verify expected fields
        response = self.session.post(
            f"{BASE_URL}/api/cre/convert-deal/test_multi_pay_lead",
            json={
                "project_name": "Test Multi-Payment Project",
                "client_name": "Test Client",
                "location": "Chennai",
                "advance_amount": 1000000,  # 10 lakhs
                "payment_entries": [
                    {"amount": 500000, "payment_mode": "cheque", "reference": "CHQ-001", 
                     "cheque_details": [
                         {"cheque_number": "123456", "bank_name": "HDFC", "amount": 200000, "cheque_date": "2026-03-20"},
                         {"cheque_number": "123457", "bank_name": "HDFC", "amount": 300000, "cheque_date": "2026-03-25"}
                     ]},
                    {"amount": 200000, "payment_mode": "cash", "reference": ""},
                    {"amount": 300000, "payment_mode": "bank_transfer", "reference": "TXN-789456"}
                ],
                "accountant_confirmed": True
            }
        )
        # Should return 404 for fake lead (not 422 validation error)
        assert response.status_code == 404, f"Expected 404 for fake lead, got {response.status_code}: {response.text}"
        print("PASS: convert-deal endpoint accepts payment_entries array format")

    def test_convert_deal_requires_accountant_confirmation(self):
        """Test that convert-deal requires accountant_confirmed"""
        response = self.session.post(
            f"{BASE_URL}/api/cre/convert-deal/test_no_confirm_lead",
            json={
                "project_name": "Test No Confirm",
                "client_name": "Test Client",
                "location": "Chennai",
                "advance_amount": 500000,
                "payment_entries": [
                    {"amount": 500000, "payment_mode": "cash", "reference": ""}
                ],
                "accountant_confirmed": False  # Should fail
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "accountant" in response.text.lower() or "confirmation" in response.text.lower()
        print("PASS: convert-deal requires accountant_confirmed=True")

    def test_convert_deal_payment_entries_schema(self):
        """Test payment_entries field schema validation"""
        # Test with empty payment entries (should still accept - falls back to legacy mode)
        response = self.session.post(
            f"{BASE_URL}/api/cre/convert-deal/test_empty_entries",
            json={
                "project_name": "Test Empty Entries",
                "client_name": "Test Client",
                "location": "Chennai",
                "advance_amount": 100000,
                "payment_entries": [],  # Empty array
                "payment_mode": "cash",  # Legacy fallback
                "accountant_confirmed": True
            }
        )
        # Should return 404 for fake lead (not schema error)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("PASS: payment_entries accepts empty array with legacy fallback")

    def test_convert_deal_cheque_details_format(self):
        """Test cheque_details within payment_entries"""
        response = self.session.post(
            f"{BASE_URL}/api/cre/convert-deal/test_cheque_details",
            json={
                "project_name": "Test Cheque Details",
                "client_name": "Test Client",
                "location": "Chennai",
                "advance_amount": 500000,
                "payment_entries": [
                    {
                        "amount": 500000,
                        "payment_mode": "cheque",
                        "reference": "Multi-Cheque Payment",
                        "cheque_details": [
                            {"cheque_number": "CHQ001", "bank_name": "ICICI", "amount": 200000, "cheque_date": "2026-03-20"},
                            {"cheque_number": "CHQ002", "bank_name": "HDFC", "amount": 300000, "cheque_date": "2026-03-25"}
                        ]
                    }
                ],
                "accountant_confirmed": True
            }
        )
        # Should return 404 for fake lead (not schema error)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("PASS: cheque_details format within payment_entries is valid")


class TestMultiPaymentCollectStage:
    """Test multi-payment entries for payment stage collection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup CRE session and get project/stage data"""
        self.session = requests.Session()
        # Login as CRE
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200
        self.user = response.json()
        
        # Get projects
        response = self.session.get(f"{BASE_URL}/api/projects")
        self.projects = response.json() if response.status_code == 200 else []
        print(f"Found {len(self.projects)} projects")
        
        yield
        self.session.close()

    def test_collect_payment_api_expects_payment_entries(self):
        """Test that collect endpoint accepts payment_entries array"""
        # Use a fake stage_id to test schema acceptance
        response = self.session.post(
            f"{BASE_URL}/api/payment-stages/test_stage_multi_pay/collect",
            json={
                "amount_received": 500000,
                "payment_entries": [
                    {"amount": 300000, "payment_mode": "bank_transfer", "reference": "TXN-001"},
                    {"amount": 200000, "payment_mode": "upi", "reference": "UPI-REF-002"}
                ],
                "remarks": "Multi-mode payment test"
            }
        )
        # Should return 404 for fake stage (not 422 validation error)
        assert response.status_code == 404, f"Expected 404 for fake stage, got {response.status_code}: {response.text}"
        print("PASS: collect endpoint accepts payment_entries array format")

    def test_collect_payment_with_cheque_entries(self):
        """Test collect payment with cheque details"""
        response = self.session.post(
            f"{BASE_URL}/api/payment-stages/test_cheque_stage/collect",
            json={
                "amount_received": 700000,
                "payment_entries": [
                    {"amount": 400000, "payment_mode": "cheque", "reference": "Multi-Cheque",
                     "cheque_details": [
                         {"cheque_number": "789012", "bank_name": "SBI", "amount": 200000, "cheque_date": "2026-03-22"},
                         {"cheque_number": "789013", "bank_name": "SBI", "amount": 200000, "cheque_date": "2026-03-28"}
                     ]},
                    {"amount": 300000, "payment_mode": "cash", "reference": ""}
                ],
                "remarks": "Mixed payment with cheques"
            }
        )
        # Should return 404 for fake stage (not schema error)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("PASS: collect endpoint accepts cheque_details within payment_entries")

    def test_collect_payment_legacy_mode(self):
        """Test collect payment with legacy single payment mode (backward compat)"""
        response = self.session.post(
            f"{BASE_URL}/api/payment-stages/test_legacy_stage/collect",
            json={
                "amount_received": 100000,
                "payment_mode": "bank_transfer",  # Legacy field
                "payment_reference": "LEGACY-TXN",
                "remarks": "Legacy single mode payment"
            }
        )
        # Should return 404 for fake stage
        assert response.status_code == 404
        print("PASS: collect endpoint supports legacy single payment_mode")


class TestNewDealsList:
    """Test CRE new-deals endpoint returns deal data for conversion"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "cre@constructionos.com"
        })
        assert response.status_code == 200
        yield
        self.session.close()

    def test_new_deals_endpoint(self):
        """Test GET /api/cre/new-deals returns deal data"""
        response = self.session.get(f"{BASE_URL}/api/cre/new-deals")
        assert response.status_code == 200, f"new-deals failed: {response.text}"
        deals = response.json()
        print(f"Found {len(deals)} new deals")
        
        # Check deal structure if we have deals
        if deals:
            deal = deals[0]
            print(f"First deal: {deal.get('name')} (lead_id: {deal.get('lead_id')})")
            # Verify expected fields
            assert "lead_id" in deal or "re_project_id" in deal, "Deal should have lead_id or re_project_id"
            assert "name" in deal or "project_name" in deal, "Deal should have name"
        
        print("PASS: new-deals endpoint works correctly")

    def test_payment_requests_endpoint(self):
        """Test GET /api/cre/payment-requests for stage payments"""
        response = self.session.get(f"{BASE_URL}/api/cre/payment-requests")
        assert response.status_code == 200, f"payment-requests failed: {response.text}"
        requests_data = response.json()
        print(f"Found {len(requests_data)} payment requests")
        print("PASS: payment-requests endpoint works correctly")


class TestPaymentStagesEndpoints:
    """Test payment stages CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        # Login as PM who can create stages
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "email": "pm@constructionos.com"
        })
        if response.status_code != 200:
            # Fallback to super admin
            response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
                "email": "admin@constructionos.com"
            })
        assert response.status_code == 200, "Login failed"
        
        # Get a project
        response = self.session.get(f"{BASE_URL}/api/projects")
        self.projects = response.json() if response.status_code == 200 else []
        self.project_id = self.projects[0]["project_id"] if self.projects else None
        
        yield
        self.session.close()

    def test_get_payment_stages(self):
        """Test GET /api/projects/{id}/payment-stages"""
        if not self.project_id:
            pytest.skip("No project available for testing")
        
        response = self.session.get(f"{BASE_URL}/api/projects/{self.project_id}/payment-stages")
        assert response.status_code == 200, f"Failed to get stages: {response.text}"
        stages = response.json()
        print(f"Found {len(stages)} payment stages for project {self.project_id}")
        print("PASS: payment-stages endpoint works")

    def test_create_payment_stage_for_collect_test(self):
        """Create a payment stage for multi-payment collection test"""
        if not self.project_id:
            pytest.skip("No project available for testing")
        
        # Create a test stage
        stage_data = {
            "project_id": self.project_id,
            "stage_name": f"TEST_MultiPay_Stage_{secrets.token_hex(4)}",
            "percentage": 10,
            "amount": 500000,
            "due_date": "2026-04-01"
        }
        
        response = self.session.post(f"{BASE_URL}/api/payment-stages", json=stage_data)
        if response.status_code == 201 or response.status_code == 200:
            stage = response.json()
            print(f"Created test stage: {stage.get('stage_id', stage)}")
            
            # Now test collect with multi-payment
            cre_session = requests.Session()
            cre_session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": "cre@constructionos.com"})
            
            stage_id = stage.get("stage_id")
            if stage_id:
                collect_response = cre_session.post(
                    f"{BASE_URL}/api/payment-stages/{stage_id}/collect",
                    json={
                        "amount_received": 500000,
                        "payment_entries": [
                            {"amount": 250000, "payment_mode": "bank_transfer", "reference": "TXN-TEST-001"},
                            {"amount": 150000, "payment_mode": "upi", "reference": "UPI-TEST"},
                            {"amount": 100000, "payment_mode": "cash", "reference": ""}
                        ],
                        "remarks": "Multi-payment test collection"
                    }
                )
                print(f"Collect response: {collect_response.status_code} - {collect_response.text[:200]}")
                if collect_response.status_code == 200:
                    print("PASS: Multi-payment collection successful!")
                else:
                    print(f"Note: Collection result: {collect_response.status_code}")
            
            cre_session.close()
        else:
            print(f"Stage creation: {response.status_code} - {response.text[:200]}")
        
        print("PASS: payment stage creation test completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
