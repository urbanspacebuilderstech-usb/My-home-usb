#!/usr/bin/env python3
"""End-to-End Flow Test: Lead → Pre-Sales → Sales → Planning RE → GM Approve → Deal Close → Project → SE Material → Petty Cash"""

import requests
import json
import sys
import time

API_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            API_URL = line.strip().split("=", 1)[1] + "/api"
            break

print(f"API URL: {API_URL}")

results = []
def log(step, ok, detail=""):
    results.append({"step": step, "status": "PASS" if ok else "FAIL", "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {step} -- {detail}")

def login(email):
    s = requests.Session()
    r = s.post(f"{API_URL}/auth/login", json={"email": email, "password": "Demo@1234"})
    return (s, r.json()) if r.status_code == 200 else (None, None)

# ===== LOGIN ALL USERS =====
ps_s, ps_u = login("presales@constructionos.com")
sales_s, sales_u = login("sales@constructionos.com")
plan_s, plan_u = login("planning@constructionos.com")
admin_s, admin_u = login("admin@constructionos.com")
acct_s, acct_u = login("accountant@constructionos.com")
cre_s, cre_u = login("cre@constructionos.com")
se_s, se_u = login("engineer@constructionos.com")

for name, session in [("Pre-Sales", ps_s), ("Sales", sales_s), ("Planning", plan_s), 
                       ("Admin", admin_s), ("Accountant", acct_s), ("CRE", cre_s), ("Site Engineer", se_s)]:
    log(f"Login {name}", session is not None, f"{'OK' if session else 'FAILED'}")
    if session is None:
        print(f"  WARNING: {name} login failed, retrying...")
        if name == "Site Engineer":
            se_s, se_u = login("engineer@constructionos.com")
            log(f"Login {name} (retry)", se_s is not None, f"{'OK' if se_s else 'FAILED'}")

# ===== STEP 1: Pre-Sales creates lead =====
print("\n=== STEP 1: Pre-Sales Creates Lead ===")
r = ps_s.post(f"{API_URL}/crm/pre-sales/leads", json={
    "name": "E2E Villa Client",
    "email": "e2e-villa@example.com",
    "phone": "9876500099",
    "source": "referral",
    "city": "Hyderabad",
    "notes": "E2E test lead"
})
lead_id = r.json().get("lead_id") if r.status_code == 200 else None
log("1. Create Pre-Sales Lead", r.status_code == 200, f"Lead ID: {lead_id}")

# ===== STEP 2: Move through Pre-Sales stages → Auto-transfer to Sales =====
print("\n=== STEP 2: Pre-Sales → Appointment Booked (Auto-transfer) ===")
sales_lead_id = None
for stg in ["stg_contacted", "stg_proposal", "stg_follow_up", "stg_appointment"]:
    r = ps_s.patch(f"{API_URL}/crm/leads/{lead_id}/stage", json={"stage_id": stg})
    resp = r.json() if r.status_code == 200 else {}
    if resp.get("transferred_to_sales"):
        sales_lead_id = resp.get("new_lead_id")
        log("2. Auto-Transfer to Sales", True, f"Sales Lead: {sales_lead_id}")
    time.sleep(0.2)
log("2. Pre-Sales Complete", sales_lead_id is not None, f"Sales Lead: {sales_lead_id}")

# ===== STEP 3: Sales → Rough Estimate Requested (Auto-create RE Project) =====
print("\n=== STEP 3: Sales → RE Requested (Auto-create RE) ===")
re_project_id = None
for stg in ["stg_discussion", "stg_site_visit", "stg_re_requested"]:
    r = sales_s.patch(f"{API_URL}/crm/leads/{sales_lead_id}/stage", json={"stage_id": stg})
    resp = r.json() if r.status_code == 200 else {}
    if resp.get("re_project_created"):
        re_project_id = resp.get("re_project_id")
        log("3. Auto-Create RE Project", True, f"RE ID: {re_project_id}")
    time.sleep(0.2)
log("3. Sales to RE Request", re_project_id is not None, f"RE Project: {re_project_id}")

# ===== STEP 4: Planning updates RE Project =====
print("\n=== STEP 4: Planning Updates RE Project ===")
r = plan_s.patch(f"{API_URL}/crm/re-projects/{re_project_id}", json={
    "project_name": "E2E Villa - Hyderabad",
    "location": "Jubilee Hills, Hyderabad",
    "sqft": 2500,
    "building_type": "residential",
    "handover_months": 18,
    "estimated_total": 5000000,
    "rough_scope_items": [
        {"name": "Foundation", "quantity": 1, "unit": "LS", "rate": 800000, "total": 800000},
        {"name": "Super Structure", "quantity": 1, "unit": "LS", "rate": 2200000, "total": 2200000},
        {"name": "Finishing", "quantity": 1, "unit": "LS", "rate": 2000000, "total": 2000000}
    ]
})
log("4a. Update RE Project", r.status_code == 200, "Scope items + estimates added")

r = plan_s.post(f"{API_URL}/crm/re-projects/{re_project_id}/submit-for-approval")
log("4b. Submit for GM Approval", r.status_code == 200, "Submitted to GM")

# ===== STEP 5: GM Approves RE =====
print("\n=== STEP 5: GM Approves RE Project ===")
r = admin_s.patch(f"{API_URL}/crm/re-projects/{re_project_id}/approve", json={"approved": True})
log("5. GM Approves RE", r.status_code == 200, "RE Approved")

# ===== STEP 6: Sales closes deal (auto-creates main project) =====
print("\n=== STEP 6: Deal Closed → Main Project Created ===")
r = sales_s.patch(f"{API_URL}/crm/leads/{sales_lead_id}/stage", json={
    "stage_id": "stg_deal_closed",
    "advance_amount": 100000,
    "payment_mode": "bank_transfer",
    "payment_reference": "E2E-TXN-001"
})
resp = r.json() if r.status_code == 200 else {}
project_id = resp.get("project_id")
log("6. Deal Closed → Project", r.status_code == 200, f"Project ID: {project_id}")

if not project_id:
    # Fallback: get from lead
    ld = sales_s.get(f"{API_URL}/crm/leads/{sales_lead_id}").json()
    project_id = ld.get("project_id")
    log("6x. Fallback project fetch", project_id is not None, f"Project: {project_id}")

# ===== STEP 7: Verify project exists =====
print("\n=== STEP 7: Verify Project ===")
r = admin_s.get(f"{API_URL}/projects/{project_id}")
if r.status_code == 200:
    proj = r.json()
    log("7. Verify Project", True, f"Name: {proj.get('name')}, Status: {proj.get('status')}, Value: {proj.get('total_value')}")
else:
    log("7. Verify Project", False, r.text[:200])

# ===== STEP 8: Planning adds scope items to the project =====
print("\n=== STEP 8: Planning Adds Scope Items ===")
for si in [
    {"project_id": project_id, "item_name": "Foundation", "quantity": 1, "unit": "LS", "unit_rate": 800000},
    {"project_id": project_id, "item_name": "Super Structure", "quantity": 1, "unit": "LS", "unit_rate": 2200000},
    {"project_id": project_id, "item_name": "Finishing", "quantity": 1, "unit": "LS", "unit_rate": 2000000},
]:
    r = plan_s.post(f"{API_URL}/scope-items", json=si)
    log(f"8. Add Scope: {si['item_name']}", r.status_code == 200, f"Rate: {si['unit_rate']}" if r.status_code == 200 else r.text[:100])

# ===== STEP 9: Assign SE to project =====
print("\n=== STEP 9: Assign Site Engineer ===")
r = admin_s.post(f"{API_URL}/site-engineer/assignments", json={
    "user_id": se_u["user_id"],
    "project_id": project_id,
    "role_in_project": "site_engineer"
})
log("9. Assign SE to Project", r.status_code == 200, "SE assigned" if r.status_code == 200 else r.text[:100])

# ===== STEP 10: SE creates material request =====
print("\n=== STEP 10: Site Engineer Material Request ===")
# Get or create material
r = admin_s.get(f"{API_URL}/materials")
mat_data = r.json()
material_id = None
if isinstance(mat_data, list) and len(mat_data) > 0:
    material_id = mat_data[0].get("material_id")
elif isinstance(mat_data, dict) and mat_data.get("materials"):
    material_id = mat_data["materials"][0].get("material_id")

if not material_id:
    r = admin_s.post(f"{API_URL}/materials", json={"name": "E2E Cement", "category": "cement", "unit": "Bag"})
    material_id = r.json().get("material_id") if r.status_code == 200 else None
log("10a. Get/Create Material", material_id is not None, f"Material: {material_id}")

mat_req_id = None
if material_id:
    r = se_s.post(f"{API_URL}/site-engineer/material-requests", json={
        "project_id": project_id,
        "material_id": material_id,
        "quantity": 50,
        "remarks": "E2E test material"
    })
    mat_req_id = r.json().get("request_id") if r.status_code == 200 else None
    log("10b. Create Material Request", r.status_code == 200, f"Request: {mat_req_id}" if r.status_code == 200 else r.text[:100])

# ===== STEP 11: Planning approves material request =====
print("\n=== STEP 11: Planning Approves Material ===")
if mat_req_id:
    r = plan_s.patch(f"{API_URL}/site-engineer/material-requests/{mat_req_id}/approve?action=planning_approve")
    log("11. Planning Approve Material", r.status_code == 200, "Approved" if r.status_code == 200 else r.text[:100])

# ===== STEP 12: Accountant approves material payment =====
print("\n=== STEP 12: Accountant Approves Material ===")
if mat_req_id:
    r = acct_s.patch(f"{API_URL}/accountant/material-requests/{mat_req_id}/approve")
    log("12. Accountant Approve Material", r.status_code == 200, "Payment approved" if r.status_code == 200 else r.text[:100])

# ===== STEP 13: SE requests petty cash =====
print("\n=== STEP 13: Site Engineer Petty Cash Request ===")
r = se_s.post(f"{API_URL}/site-engineer/petty-cash/request", json={
    "project_id": project_id,
    "amount": 5000,
    "purpose": "Site consumables - nails, wire"
})
pc_id = r.json().get("petty_cash_id") if r.status_code == 200 else None
log("13. Petty Cash Request", r.status_code == 200, f"PC ID: {pc_id}" if r.status_code == 200 else r.text[:100])

# ===== STEP 14: Accountant issues petty cash =====
print("\n=== STEP 14: Accountant Issues Petty Cash ===")
if pc_id:
    r = acct_s.patch(f"{API_URL}/accountant/petty-cash/{pc_id}/issue?amount=5000")
    log("14. Issue Petty Cash", r.status_code == 200, "5000 issued" if r.status_code == 200 else r.text[:100])

# ===== STEP 15: SE records petty cash expense =====
print("\n=== STEP 15: SE Records Petty Cash Expense ===")
if pc_id:
    r = se_s.post(f"{API_URL}/site-engineer/petty-cash/{pc_id}/expense", json={
        "petty_cash_id": pc_id,
        "description": "Nails and wire",
        "amount": 3000,
        "expense_type": "tools",
        "date": "2026-03-08"
    })
    log("15. Record PC Expense", r.status_code == 200, "3000 spent" if r.status_code == 200 else r.text[:100])

# ===== STEP 16: SE submits petty cash for settlement =====
print("\n=== STEP 16: SE Submits PC for Settlement ===")
if pc_id:
    r = se_s.post(f"{API_URL}/site-engineer/petty-cash/{pc_id}/submit")
    log("16. Submit PC Settlement", r.status_code == 200, "Submitted" if r.status_code == 200 else r.text[:100])

# ===== STEP 17: Accountant settles petty cash =====
print("\n=== STEP 17: Accountant Settles Petty Cash ===")
if pc_id:
    r = acct_s.patch(f"{API_URL}/accountant/petty-cash/{pc_id}/settle")
    log("17. Settle Petty Cash", r.status_code == 200, "Settled" if r.status_code == 200 else r.text[:100])

# ===== STEP 18: Verify final project state =====
print("\n=== STEP 18: Final Project Verification ===")
r = admin_s.get(f"{API_URL}/projects/{project_id}")
if r.status_code == 200:
    proj = r.json()
    log("18. Final Project State", True, 
        f"Name: {proj.get('name')}, Status: {proj.get('status')}, Value: {proj.get('total_value')}, Expense: {proj.get('total_expense')}")
else:
    log("18. Final Project State", False, r.text[:100])

# ===== SUMMARY =====
print("\n" + "="*60)
print("E2E FLOW TEST SUMMARY")
print("="*60)
passed = sum(1 for r in results if r["status"] == "PASS")
failed = sum(1 for r in results if r["status"] == "FAIL")
total = len(results)
print(f"Total: {total} | Passed: {passed} | Failed: {failed} | Rate: {passed/total*100:.0f}%")
for r in results:
    icon = "+" if r["status"] == "PASS" else "X"
    print(f"  [{icon}] {r['step']}: {r['detail'][:80]}")

import os
os.makedirs("/app/test_reports", exist_ok=True)
with open("/app/test_reports/e2e_flow_test.json", "w") as f:
    json.dump({"total": total, "passed": passed, "failed": failed, "rate": f"{passed/total*100:.0f}%", "results": results}, f, indent=2)

print(f"\nResults saved to /app/test_reports/e2e_flow_test.json")
sys.exit(0 if failed == 0 else 1)
