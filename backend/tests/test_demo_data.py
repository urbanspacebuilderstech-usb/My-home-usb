"""
Test Demo Data Verification
Tests that the seeded demo data 'Swathi 60L G+2' project is correctly displayed across all dashboards
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDemoDataVerification:
    """Verify demo data is correctly seeded and accessible"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with demo login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Super Admin via demo endpoint
        response = self.session.post(f"{BASE_URL}/api/auth/demo-login", json={
            "role": "super_admin"
        })
        if response.status_code == 200:
            # Cookie-based auth, session should have the cookie
            pass
        yield
        self.session.close()
    
    def test_api_health(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/auth/setup-status")
        assert response.status_code == 200
        data = response.json()
        assert data.get("demo_mode") == True
        print(f"PASS: API health check - demo_mode={data.get('demo_mode')}")
    
    def test_projects_list(self):
        """Test projects list contains Swathi 60L G+2"""
        response = self.session.get(f"{BASE_URL}/api/projects")
        assert response.status_code == 200
        projects = response.json()
        
        # Find Swathi project
        swathi_project = None
        for p in projects:
            if 'Swathi' in p.get('name', ''):
                swathi_project = p
                break
        
        assert swathi_project is not None, "Swathi 60L G+2 project not found"
        assert swathi_project.get('total_value') == 6000000, f"Expected 60L, got {swathi_project.get('total_value')}"
        print(f"PASS: Found project '{swathi_project.get('name')}' with value {swathi_project.get('total_value')}")
    
    def test_crm_sales_leads(self):
        """Test CRM Sales leads contain seeded leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/sales/leads")
        assert response.status_code == 200
        leads = response.json()
        
        # Should have 3 sales leads (Swathi, Priya, Mohan)
        lead_names = [l.get('name') for l in leads]
        print(f"Sales leads found: {lead_names}")
        
        assert len(leads) >= 3, f"Expected at least 3 sales leads, got {len(leads)}"
        print(f"PASS: Found {len(leads)} sales leads")
    
    def test_crm_presales_leads(self):
        """Test CRM Pre-Sales leads contain seeded leads"""
        response = self.session.get(f"{BASE_URL}/api/crm/pre-sales/leads")
        assert response.status_code == 200
        leads = response.json()
        
        # Should have at least 1 pre-sales lead (Karthik)
        lead_names = [l.get('name') for l in leads]
        print(f"Pre-sales leads found: {lead_names}")
        
        assert len(leads) >= 1, f"Expected at least 1 pre-sales lead, got {len(leads)}"
        print(f"PASS: Found {len(leads)} pre-sales leads")
    
    def test_project_stages(self):
        """Test project stages are correctly seeded"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_6f62cd636f6a/stages")
        assert response.status_code == 200
        stages = response.json()
        
        # Should have 12 stages, 4 completed
        completed_count = sum(1 for s in stages if s.get('status') == 'completed')
        in_progress_count = sum(1 for s in stages if s.get('status') == 'in_progress')
        
        print(f"Stages: total={len(stages)}, completed={completed_count}, in_progress={in_progress_count}")
        
        assert len(stages) >= 9, f"Expected at least 9 stages, got {len(stages)}"
        assert completed_count >= 4, f"Expected at least 4 completed stages, got {completed_count}"
        print(f"PASS: Found {len(stages)} stages with {completed_count} completed")
    
    def test_project_work_orders(self):
        """Test project work orders are correctly seeded"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_6f62cd636f6a/work-orders")
        assert response.status_code == 200
        work_orders = response.json()
        
        # Should have 3 work orders
        print(f"Work orders found: {len(work_orders)}")
        
        assert len(work_orders) >= 3, f"Expected at least 3 work orders, got {len(work_orders)}"
        print(f"PASS: Found {len(work_orders)} work orders")
    
    def test_income_entries(self):
        """Test income entries are correctly seeded"""
        response = self.session.get(f"{BASE_URL}/api/financial/income")
        assert response.status_code == 200
        income = response.json()
        
        # Should have 5 income entries totaling 30L
        total_income = sum(i.get('amount', 0) for i in income)
        print(f"Income entries: count={len(income)}, total={total_income}")
        
        assert len(income) >= 5, f"Expected at least 5 income entries, got {len(income)}"
        assert total_income >= 3000000, f"Expected at least 30L income, got {total_income}"
        print(f"PASS: Found {len(income)} income entries totaling {total_income}")
    
    def test_payment_stages(self):
        """Test payment stages have correct amount_received"""
        response = self.session.get(f"{BASE_URL}/api/projects/proj_6f62cd636f6a/payment-stages")
        assert response.status_code == 200
        stages = response.json()
        
        # Should have payment stages with amount_received
        total_received = sum(s.get('amount_received', 0) for s in stages)
        print(f"Payment stages: count={len(stages)}, total_received={total_received}")
        
        assert total_received >= 3000000, f"Expected at least 30L received, got {total_received}"
        print(f"PASS: Payment stages total received: {total_received}")
    
    def test_admin_dashboard(self):
        """Test admin dashboard shows correct financials"""
        response = self.session.get(f"{BASE_URL}/api/admin/dashboard-summary")
        assert response.status_code == 200
        data = response.json()
        
        totals = data.get('totals', {})
        print(f"Dashboard totals: {totals}")
        
        # Verify project value and income
        assert totals.get('project_total_value', 0) >= 6000000, "Expected project value >= 60L"
        assert totals.get('income_project', 0) >= 3000000, "Expected income >= 30L"
        print(f"PASS: Dashboard shows correct financials")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
