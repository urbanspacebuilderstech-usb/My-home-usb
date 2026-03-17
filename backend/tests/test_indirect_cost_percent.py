"""
Tests for configurable indirect cost percentage feature.
Tests the ability for Super Admin to configure the Direct/Indirect cost split
via Settings > Company Profile > 'Indirect Cost %' field.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestIndirectCostPercentage:
    """Test suite for configurable indirect cost percentage feature"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def login_as_super_admin(self):
        """Login as super admin via demo-login"""
        resp = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "admin@constructionos.com"}
        )
        assert resp.status_code == 200, f"Super admin login failed: {resp.text}"
        return resp.json()
    
    def login_as_accountant(self):
        """Login as accountant via demo-login"""
        resp = self.session.post(
            f"{BASE_URL}/api/auth/demo-login",
            json={"email": "accountant@constructionos.com"}
        )
        assert resp.status_code == 200, f"Accountant login failed: {resp.text}"
        return resp.json()

    # ==================== Backend API Tests ====================
    
    def test_get_company_settings_returns_indirect_cost_percent(self):
        """GET /api/settings/company should return indirect_cost_percent field"""
        self.login_as_super_admin()
        
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200, f"GET company settings failed: {resp.text}"
        
        data = resp.json()
        assert "indirect_cost_percent" in data, "indirect_cost_percent field missing from company settings"
        assert isinstance(data["indirect_cost_percent"], (int, float)), "indirect_cost_percent should be a number"
        assert 0 < data["indirect_cost_percent"] <= 100, f"indirect_cost_percent should be between 0 and 100, got {data['indirect_cost_percent']}"
        print(f"✓ GET /api/settings/company returns indirect_cost_percent: {data['indirect_cost_percent']}")
    
    def test_update_indirect_cost_percent_as_super_admin(self):
        """POST /api/settings/company with indirect_cost_percent should update the value"""
        self.login_as_super_admin()
        
        # Get current settings
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        current = resp.json()
        original_percent = current.get("indirect_cost_percent", 20)
        
        # Update to a new value (toggle between 25 and 30 to test both directions)
        new_percent = 25 if original_percent != 25 else 30
        
        update_payload = {
            "company_name": current.get("company_name", "ConstructionOS"),
            "indirect_cost_percent": new_percent
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/settings/company",
            json=update_payload
        )
        assert resp.status_code == 200, f"POST company settings failed: {resp.text}"
        
        updated_data = resp.json()
        assert updated_data.get("indirect_cost_percent") == new_percent, \
            f"Expected indirect_cost_percent to be {new_percent}, got {updated_data.get('indirect_cost_percent')}"
        
        # Verify persistence by fetching again
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        persisted_data = resp.json()
        assert persisted_data.get("indirect_cost_percent") == new_percent, \
            f"Persisted value mismatch: expected {new_percent}, got {persisted_data.get('indirect_cost_percent')}"
        
        print(f"✓ Successfully updated indirect_cost_percent from {original_percent} to {new_percent}")
        
        # Restore original value for idempotent tests
        restore_payload = {
            "company_name": current.get("company_name", "ConstructionOS"),
            "indirect_cost_percent": original_percent
        }
        self.session.post(f"{BASE_URL}/api/settings/company", json=restore_payload)
    
    def test_accountant_cannot_update_indirect_cost_percent(self):
        """Accountant should not be able to update company settings (403)"""
        self.login_as_accountant()
        
        update_payload = {
            "company_name": "Test Company",
            "indirect_cost_percent": 15
        }
        
        resp = self.session.post(
            f"{BASE_URL}/api/settings/company",
            json=update_payload
        )
        assert resp.status_code == 403, f"Expected 403 for accountant, got {resp.status_code}: {resp.text}"
        print("✓ Accountant correctly denied from updating company settings (403)")
    
    def test_project_budget_overview_returns_dynamic_percentages(self):
        """GET /api/financial/project-budget-overview should return indirect_cost_percent and direct_cost_percent"""
        self.login_as_super_admin()
        
        resp = self.session.get(f"{BASE_URL}/api/financial/project-budget-overview")
        assert resp.status_code == 200, f"GET project-budget-overview failed: {resp.text}"
        
        data = resp.json()
        assert "indirect_cost_percent" in data, "indirect_cost_percent missing from budget overview"
        assert "direct_cost_percent" in data, "direct_cost_percent missing from budget overview"
        
        indirect_pct = data["indirect_cost_percent"]
        direct_pct = data["direct_cost_percent"]
        
        # Verify they sum to 100
        assert indirect_pct + direct_pct == 100, \
            f"indirect_cost_percent ({indirect_pct}) + direct_cost_percent ({direct_pct}) should equal 100"
        
        # Verify indirect budget calculation matches the percentage
        if data.get("portfolio_total", 0) > 0:
            expected_indirect_budget = data["portfolio_total"] * (indirect_pct / 100)
            actual_indirect_budget = data.get("total_indirect_budget", 0)
            assert abs(expected_indirect_budget - actual_indirect_budget) < 0.01, \
                f"Indirect budget mismatch: expected {expected_indirect_budget}, got {actual_indirect_budget}"
        
        print(f"✓ GET /api/financial/project-budget-overview returns dynamic percentages: Direct={direct_pct}%, Indirect={indirect_pct}%")
    
    def test_update_percent_reflects_in_budget_overview(self):
        """Changing indirect_cost_percent should reflect in project-budget-overview"""
        self.login_as_super_admin()
        
        # Get current settings
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200
        current = resp.json()
        original_percent = current.get("indirect_cost_percent", 20)
        
        # Set to a test value
        test_percent = 25
        update_payload = {
            "company_name": current.get("company_name", "ConstructionOS"),
            "indirect_cost_percent": test_percent
        }
        
        resp = self.session.post(f"{BASE_URL}/api/settings/company", json=update_payload)
        assert resp.status_code == 200
        
        # Verify budget overview reflects the new percentage
        resp = self.session.get(f"{BASE_URL}/api/financial/project-budget-overview")
        assert resp.status_code == 200
        
        data = resp.json()
        assert data.get("indirect_cost_percent") == test_percent, \
            f"Budget overview should show {test_percent}%, got {data.get('indirect_cost_percent')}%"
        assert data.get("direct_cost_percent") == (100 - test_percent), \
            f"Budget overview direct_cost_percent should be {100 - test_percent}%"
        
        print(f"✓ Budget overview correctly reflects updated indirect_cost_percent: {test_percent}%")
        
        # Restore original value
        restore_payload = {
            "company_name": current.get("company_name", "ConstructionOS"),
            "indirect_cost_percent": original_percent
        }
        self.session.post(f"{BASE_URL}/api/settings/company", json=restore_payload)
    
    def test_accountant_can_read_company_settings(self):
        """Accountant should be able to read company settings"""
        self.login_as_accountant()
        
        resp = self.session.get(f"{BASE_URL}/api/settings/company")
        assert resp.status_code == 200, f"Accountant should be able to read company settings: {resp.text}"
        
        data = resp.json()
        assert "indirect_cost_percent" in data, "indirect_cost_percent field should be visible to accountant"
        print(f"✓ Accountant can read company settings including indirect_cost_percent: {data['indirect_cost_percent']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
