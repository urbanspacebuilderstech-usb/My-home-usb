"""
Test Work Order Stage Payment System
- SE requests PARTIAL payments multiple times per stage
- 4-level approval pipeline: SE → PM → Planning → Accountant
- SE can 'Finish Stage' with remarks when done
- No more payments allowed after finish
- Cannot request more than balance (total - released - pending)
- Cannot finish a stage with pending payment requests
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PROJECT_ID = "proj_12f23331b542"  # Vinoth Kumar Villa project

# Test credentials
PLANNING_EMAIL = "planning@constructionos.com"
SE_EMAIL = "engineer@constructionos.com"
PM_EMAIL = "pm@constructionos.com"
ACCOUNTANT_EMAIL = "accountant@constructionos.com"

# Contractor ID from database
CONTRACTOR_ID = "cont_paint01"  # Kumar Painters


class TestWorkOrderStagePaymentSystem:
    """Test the complete Work Order Stage Payment flow"""
    
    @pytest.fixture(scope="class")
    def planning_session(self):
        """Login as Planning role to create work orders"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PLANNING_EMAIL})
        assert resp.status_code == 200, f"Planning login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def se_session(self):
        """Login as Site Engineer to request payments"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SE_EMAIL})
        assert resp.status_code == 200, f"SE login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def pm_session(self):
        """Login as Project Manager to approve payments"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": PM_EMAIL})
        assert resp.status_code == 200, f"PM login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def accountant_session(self):
        """Login as Accountant to process payments"""
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": ACCOUNTANT_EMAIL})
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        return session
    
    @pytest.fixture(scope="class")
    def work_order_data(self, planning_session):
        """Create a work order with stages for testing"""
        unique_id = uuid.uuid4().hex[:6]
        
        # Create work order with stages
        wo_payload = {
            "contractor_id": CONTRACTOR_ID,
            "contractor_name": "TEST_Kumar Painters",
            "contractor_type": "Painting",
            "scope_items": [
                {"name": "Interior Painting", "unit": "sqft", "quantity": 1000, "unit_rate": 50},
                {"name": "Exterior Painting", "unit": "sqft", "quantity": 500, "unit_rate": 60}
            ],
            "stages": [
                {"name": "Stage 01 - 30%", "type": "percentage", "value": 30},
                {"name": "Stage 02 - 40%", "type": "percentage", "value": 40},
                {"name": "Stage 03 - 30%", "type": "percentage", "value": 30}
            ],
            "additional_work": [],
            "labour_rates": {"skilled": 600, "semi_skilled": 500, "unskilled": 400},
            "notes": f"TEST_{unique_id} - Work order for stage payment testing"
        }
        
        resp = planning_session.post(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders",
            json=wo_payload
        )
        assert resp.status_code == 200, f"Failed to create work order: {resp.text}"
        data = resp.json()
        assert "work_order_id" in data
        
        # Get the created work order to get stage IDs
        wo_resp = planning_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{data['work_order_id']}")
        assert wo_resp.status_code == 200
        wo = wo_resp.json()
        
        return {
            "work_order_id": data["work_order_id"],
            "total_value": data["total_value"],
            "stages": wo.get("stages", [])
        }
    
    # ==================== WORK ORDER CREATION TESTS ====================
    
    def test_01_work_order_created_with_stages(self, work_order_data):
        """Verify work order was created with correct stages"""
        assert work_order_data["work_order_id"] is not None
        assert len(work_order_data["stages"]) == 3
        
        # Verify stage amounts (scope_total = 1000*50 + 500*60 = 80000)
        scope_total = 80000
        stage1_amount = scope_total * 0.30  # 24000
        stage2_amount = scope_total * 0.40  # 32000
        stage3_amount = scope_total * 0.30  # 24000
        
        assert work_order_data["stages"][0]["amount"] == stage1_amount
        assert work_order_data["stages"][1]["amount"] == stage2_amount
        assert work_order_data["stages"][2]["amount"] == stage3_amount
        print(f"✓ Work order created with 3 stages: {stage1_amount}, {stage2_amount}, {stage3_amount}")
    
    # ==================== SE REQUEST PAYMENT TESTS ====================
    
    def test_02_se_request_partial_payment(self, se_session, work_order_data):
        """SE requests partial payment for stage 1"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        stage_amount = work_order_data["stages"][0]["amount"]
        
        # Request 50% of stage amount
        request_amount = stage_amount * 0.5
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/request-payment",
            json={"amount": request_amount, "notes": "First partial payment request"}
        )
        assert resp.status_code == 200, f"Failed to request payment: {resp.text}"
        data = resp.json()
        assert "request_id" in data
        print(f"✓ SE requested partial payment of ₹{request_amount:,.0f} (request_id: {data['request_id']})")
        
        # Store request_id for later tests
        work_order_data["request_id_1"] = data["request_id"]
    
    def test_03_se_request_second_partial_payment(self, se_session, work_order_data):
        """SE requests another partial payment for the same stage"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        stage_amount = work_order_data["stages"][0]["amount"]
        
        # Request another 30% of stage amount
        request_amount = stage_amount * 0.3
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/request-payment",
            json={"amount": request_amount, "notes": "Second partial payment request"}
        )
        assert resp.status_code == 200, f"Failed to request second payment: {resp.text}"
        data = resp.json()
        assert "request_id" in data
        print(f"✓ SE requested second partial payment of ₹{request_amount:,.0f}")
        
        work_order_data["request_id_2"] = data["request_id"]
    
    def test_04_se_cannot_request_more_than_balance(self, se_session, work_order_data):
        """SE cannot request more than available balance"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        stage_amount = work_order_data["stages"][0]["amount"]
        
        # Try to request more than remaining balance (already requested 80%)
        request_amount = stage_amount * 0.5  # This would exceed 100%
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/request-payment",
            json={"amount": request_amount, "notes": "Should fail - exceeds balance"}
        )
        assert resp.status_code == 400, f"Should have failed but got: {resp.status_code}"
        assert "balance" in resp.text.lower() or "exceeds" in resp.text.lower()
        print(f"✓ Correctly rejected payment request exceeding balance")
    
    # ==================== 4-LEVEL APPROVAL PIPELINE TESTS ====================
    
    def test_05_pm_approves_first_payment_request(self, pm_session, work_order_data):
        """PM approves the first payment request (requested → pm_approved)"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        request_id = work_order_data.get("request_id_1")
        
        resp = pm_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id, "notes": "PM approved"}
        )
        assert resp.status_code == 200, f"PM approval failed: {resp.text}"
        print(f"✓ PM approved first payment request")
    
    def test_06_planning_approves_first_payment_request(self, planning_session, work_order_data):
        """Planning approves the first payment request (pm_approved → planning_approved)"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        request_id = work_order_data.get("request_id_1")
        
        resp = planning_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id, "notes": "Planning approved"}
        )
        assert resp.status_code == 200, f"Planning approval failed: {resp.text}"
        print(f"✓ Planning approved first payment request")
    
    def test_07_accountant_processes_first_payment(self, accountant_session, work_order_data):
        """Accountant processes the first payment (planning_approved → approved)"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        request_id = work_order_data.get("request_id_1")
        stage_amount = work_order_data["stages"][0]["amount"]
        approved_amount = stage_amount * 0.5
        
        resp = accountant_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id, "approved_amount": approved_amount, "notes": "Payment processed"}
        )
        assert resp.status_code == 200, f"Accountant approval failed: {resp.text}"
        print(f"✓ Accountant processed payment of ₹{approved_amount:,.0f}")
    
    def test_08_verify_stage_amounts_after_first_payment(self, se_session, work_order_data):
        """Verify stage amounts are updated correctly after first payment"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}")
        assert resp.status_code == 200
        wo = resp.json()
        
        stage = wo["stages"][0]
        stage_amount = work_order_data["stages"][0]["amount"]
        
        # First payment (50%) should be released
        expected_released = stage_amount * 0.5
        # Second payment (30%) should still be pending
        expected_pending = stage_amount * 0.3
        
        assert stage.get("amount_released", 0) == expected_released, f"Released amount mismatch: {stage.get('amount_released')} != {expected_released}"
        assert stage.get("amount_pending", 0) == expected_pending, f"Pending amount mismatch: {stage.get('amount_pending')} != {expected_pending}"
        print(f"✓ Stage amounts verified: Released=₹{expected_released:,.0f}, Pending=₹{expected_pending:,.0f}")
    
    # ==================== FINISH STAGE TESTS ====================
    
    def test_09_cannot_finish_stage_with_pending_requests(self, se_session, work_order_data):
        """SE cannot finish stage while payment requests are pending"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/finish",
            json={"remarks": "Trying to finish with pending requests"}
        )
        assert resp.status_code == 400, f"Should have failed but got: {resp.status_code}"
        assert "pending" in resp.text.lower()
        print(f"✓ Correctly prevented finishing stage with pending payment requests")
    
    def test_10_complete_second_payment_approval(self, pm_session, planning_session, accountant_session, work_order_data):
        """Complete the approval pipeline for second payment request"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        request_id = work_order_data.get("request_id_2")
        stage_amount = work_order_data["stages"][0]["amount"]
        approved_amount = stage_amount * 0.3
        
        # PM approves
        resp = pm_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id}
        )
        assert resp.status_code == 200, f"PM approval failed: {resp.text}"
        
        # Planning approves
        resp = planning_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id}
        )
        assert resp.status_code == 200, f"Planning approval failed: {resp.text}"
        
        # Accountant processes
        resp = accountant_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "approve", "request_id": request_id, "approved_amount": approved_amount}
        )
        assert resp.status_code == 200, f"Accountant approval failed: {resp.text}"
        print(f"✓ Second payment request fully approved (₹{approved_amount:,.0f})")
    
    def test_11_se_can_finish_stage_after_all_payments_approved(self, se_session, work_order_data):
        """SE can finish stage after all payment requests are approved"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/finish",
            json={"remarks": "Stage 1 completed successfully - all painting work done"}
        )
        assert resp.status_code == 200, f"Failed to finish stage: {resp.text}"
        print(f"✓ SE finished stage with remarks")
    
    def test_12_cannot_request_payment_after_stage_finished(self, se_session, work_order_data):
        """SE cannot request payment after stage is finished"""
        stage_id = work_order_data["stages"][0]["stage_id"]
        
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/request-payment",
            json={"amount": 1000, "notes": "Should fail - stage finished"}
        )
        assert resp.status_code == 400, f"Should have failed but got: {resp.status_code}"
        assert "finished" in resp.text.lower()
        print(f"✓ Correctly prevented payment request on finished stage")
    
    def test_13_verify_final_stage_state(self, se_session, work_order_data):
        """Verify final stage state after finishing"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}")
        assert resp.status_code == 200
        wo = resp.json()
        
        stage = wo["stages"][0]
        stage_amount = work_order_data["stages"][0]["amount"]
        
        # Verify stage is finished
        assert stage.get("stage_status") == "finished", f"Stage status should be 'finished', got: {stage.get('stage_status')}"
        assert stage.get("status") == "completed", f"Stage status should be 'completed', got: {stage.get('status')}"
        assert stage.get("finished_remarks") is not None
        
        # Verify total released = 80% of stage amount (50% + 30%)
        expected_released = stage_amount * 0.8
        assert stage.get("amount_released", 0) == expected_released
        
        # Verify no pending amounts
        assert stage.get("amount_pending", 0) == 0
        
        print(f"✓ Stage verified as finished with total released: ₹{expected_released:,.0f}")
    
    # ==================== REJECTION FLOW TESTS ====================
    
    def test_14_pm_can_reject_payment_request(self, se_session, pm_session, work_order_data):
        """PM can reject a payment request"""
        stage_id = work_order_data["stages"][1]["stage_id"]  # Use stage 2
        stage_amount = work_order_data["stages"][1]["amount"]
        
        # SE requests payment
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/request-payment",
            json={"amount": stage_amount * 0.5, "notes": "Request to be rejected"}
        )
        assert resp.status_code == 200
        request_id = resp.json()["request_id"]
        
        # PM rejects
        resp = pm_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}/stages/{stage_id}/approve",
            json={"action": "reject", "request_id": request_id, "notes": "Insufficient documentation"}
        )
        assert resp.status_code == 200, f"PM rejection failed: {resp.text}"
        print(f"✓ PM rejected payment request")
    
    def test_15_verify_rejected_request_state(self, se_session, work_order_data):
        """Verify rejected request state"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}")
        assert resp.status_code == 200
        wo = resp.json()
        
        stage = wo["stages"][1]
        payment_requests = stage.get("payment_requests", [])
        
        # Find the rejected request
        rejected = [pr for pr in payment_requests if pr.get("status") == "rejected"]
        assert len(rejected) > 0, "Should have at least one rejected request"
        assert rejected[0].get("rejection_reason") is not None
        print(f"✓ Rejected request verified with reason: {rejected[0].get('rejection_reason')}")
    
    # ==================== WORK ORDER LIST/GET TESTS ====================
    
    def test_16_get_work_orders_list(self, se_session, work_order_data):
        """Get list of work orders for project"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders")
        assert resp.status_code == 200
        orders = resp.json()
        
        # Find our test work order
        test_wo = next((wo for wo in orders if wo["work_order_id"] == work_order_data["work_order_id"]), None)
        assert test_wo is not None, "Test work order not found in list"
        
        # Verify it has stages with payment info
        assert len(test_wo.get("stages", [])) == 3
        print(f"✓ Work orders list retrieved, found {len(orders)} orders")
    
    def test_17_get_single_work_order(self, se_session, work_order_data):
        """Get single work order with full details"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{work_order_data['work_order_id']}")
        assert resp.status_code == 200
        wo = resp.json()
        
        # Verify structure
        assert "stages" in wo
        assert "scope_items" in wo
        assert "paid_amount" in wo
        
        # Verify paid_amount reflects approved payments
        stage_amount = work_order_data["stages"][0]["amount"]
        expected_paid = stage_amount * 0.8  # 50% + 30% from stage 1
        assert wo.get("paid_amount", 0) == expected_paid, f"Paid amount mismatch: {wo.get('paid_amount')} != {expected_paid}"
        print(f"✓ Single work order retrieved with paid_amount: ₹{wo.get('paid_amount', 0):,.0f}")


class TestWorkOrderStagePaymentEdgeCases:
    """Test edge cases and error handling"""
    
    @pytest.fixture(scope="class")
    def se_session(self):
        session = requests.Session()
        resp = session.post(f"{BASE_URL}/api/auth/demo-login", json={"email": SE_EMAIL})
        assert resp.status_code == 200
        return session
    
    def test_request_payment_invalid_work_order(self, se_session):
        """Request payment for non-existent work order"""
        resp = se_session.patch(
            f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/wo_invalid123/stages/stg_001/request-payment",
            json={"amount": 1000, "notes": "Test"}
        )
        assert resp.status_code == 404
        print(f"✓ Correctly returned 404 for invalid work order")
    
    def test_request_payment_invalid_stage(self, se_session):
        """Request payment for non-existent stage"""
        # First get a valid work order
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders")
        if resp.status_code == 200 and len(resp.json()) > 0:
            wo_id = resp.json()[0]["work_order_id"]
            
            resp = se_session.patch(
                f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{wo_id}/stages/stg_invalid/request-payment",
                json={"amount": 1000, "notes": "Test"}
            )
            assert resp.status_code == 404
            print(f"✓ Correctly returned 404 for invalid stage")
        else:
            pytest.skip("No work orders available for testing")
    
    def test_request_payment_zero_amount(self, se_session):
        """Request payment with zero amount"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders")
        if resp.status_code == 200 and len(resp.json()) > 0:
            wo = resp.json()[0]
            if wo.get("stages"):
                stage_id = wo["stages"][0]["stage_id"]
                
                resp = se_session.patch(
                    f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{wo['work_order_id']}/stages/{stage_id}/request-payment",
                    json={"amount": 0, "notes": "Zero amount test"}
                )
                assert resp.status_code == 400
                print(f"✓ Correctly rejected zero amount request")
            else:
                pytest.skip("No stages in work order")
        else:
            pytest.skip("No work orders available for testing")
    
    def test_request_payment_negative_amount(self, se_session):
        """Request payment with negative amount"""
        resp = se_session.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders")
        if resp.status_code == 200 and len(resp.json()) > 0:
            wo = resp.json()[0]
            if wo.get("stages"):
                stage_id = wo["stages"][0]["stage_id"]
                
                resp = se_session.patch(
                    f"{BASE_URL}/api/projects/{PROJECT_ID}/work-orders/{wo['work_order_id']}/stages/{stage_id}/request-payment",
                    json={"amount": -1000, "notes": "Negative amount test"}
                )
                assert resp.status_code == 400
                print(f"✓ Correctly rejected negative amount request")
            else:
                pytest.skip("No stages in work order")
        else:
            pytest.skip("No work orders available for testing")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
