"""
Master Seed Script - Murugan Vadapalani Project
Creates 100% realistic data across all 10 roles and all screens.
Deletes all existing data first (except users and stages).
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

# Load from .env file if not in environment
if not MONGO_URL or not DB_NAME:
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    key, val = line.split('=', 1)
                    val = val.strip().strip('"').strip("'")
                    os.environ[key.strip()] = val

MONGO_URL = os.environ.get("MONGO_URL", "").strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "construction_crm").strip('"').strip("'")

def uid(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:12]}"

NOW = datetime.now(timezone.utc)
def dt(days_ago=0, hours=10):
    return (NOW - timedelta(days=days_ago, hours=NOW.hour-hours)).isoformat()

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # ---- STEP 1: Clear all transactional data ----
    collections_to_clear = [
        "leads", "projects", "re_projects", "income", "income_entries",
        "recorded_expenses", "expenses", "material_expenses", "labour_expenses",
        "vendor_service_expenses", "material_requests", "material_receipts",
        "materials", "work_orders", "work_order_assignments",
        "payment_stages", "payment_records", "payment_verifications",
        "petty_cash", "petty_cash_requests", "cheques", "cheque_suspense",
        "suspense_entries", "suspense_transactions",
        "boq_items", "scope_items", "packages", "site_stages",
        "site_photos", "site_receipts", "site_engineer_assignments",
        "purchase_orders", "purchase_orders_v2", "procurement_logs", "procurement_pricing",
        "vendor_price_history", "vendor_master", "vendors",
        "labour_contractors", "labour_requests",
        "attendance", "payroll", "staff", "deductions",
        "additional_costs", "indirect_costs", "project_commitments", "project_materials",
        "approval_requests", "audit_logs", "financial_audit_logs",
        "notifications", "documents", "files", "credit_ledger", "transactions",
        "transit_tracking",
    ]
    for col in collections_to_clear:
        await db[col].delete_many({})
    print(f"Cleared {len(collections_to_clear)} collections")

    # ---- USER IDs ----
    SA = "user_superadmin001"
    GM = "user_gm001"
    CRE = "user_cre001"
    ACC = "user_accountant001"
    PM = "user_pm001"
    PLAN = "user_planning001"
    PROC = "user_procurement001"
    SE = "user_engineer001"
    PRESALES = "user_presales001"
    SALES = "user_sales001"

    # ---- STEP 2: Create Lead in Pre-Sales ----
    lead_id = "lead_murugan_001"
    lead = {
        "lead_id": lead_id,
        "name": "Murugan",
        "email": "murugan.vadapalani@gmail.com",
        "phone": "+91 98765 43210",
        "alternate_phone": "+91 98765 43211",
        "source": "referral",
        "stage_type": "pre_sales",
        "current_stage_id": "stg_appointment",
        "assigned_to": PRESALES,
        "assigned_to_name": "Karthik Reddy",
        "notes": "High value client - wants 3BHK villa in Vadapalani. Budget: 55 lakhs. Timeline: 8 months.",
        "location": "Vadapalani, Chennai",
        "budget": "55,00,000",
        "property_type": "3BHK Villa",
        "custom_fields": {
            "requirement": "3BHK Independent Villa with car parking",
            "plot_size": "2400 sqft",
            "construction_type": "G+1 Residential",
            "preferred_start": "March 2026"
        },
        "status": "active",
        "tags": ["high_value", "referral", "vadapalani"],
        "stage_history": [
            {"stage_id": "stg_new_lead", "stage_name": "New Lead", "moved_at": dt(30), "moved_by": PRESALES},
            {"stage_id": "stg_contacted", "stage_name": "Contacted", "moved_at": dt(28), "moved_by": PRESALES},
            {"stage_id": "stg_rnr", "stage_name": "RNR", "moved_at": dt(25), "moved_by": PRESALES},
            {"stage_id": "stg_proposal", "stage_name": "Proposal", "moved_at": dt(20), "moved_by": PRESALES},
            {"stage_id": "stg_follow_up", "stage_name": "Follow-up", "moved_at": dt(15), "moved_by": PRESALES},
            {"stage_id": "stg_appointment", "stage_name": "Appointment Booked", "moved_at": dt(10), "moved_by": PRESALES},
        ],
        "transferred_to_lead_id": "lead_murugan_sales",
        "created_by": PRESALES,
        "created_by_name": "Karthik Reddy",
        "created_at": dt(30),
        "updated_at": dt(10),
    }
    await db.leads.insert_one(lead)

    # ---- STEP 3: Sales Lead (transferred from Pre-Sales) ----
    sales_lead_id = "lead_murugan_sales"
    sales_lead = {
        "lead_id": sales_lead_id,
        "name": "Murugan",
        "email": "murugan.vadapalani@gmail.com",
        "phone": "+91 98765 43210",
        "alternate_phone": "+91 98765 43211",
        "source": "referral",
        "stage_type": "sales",
        "current_stage_id": "stg_deal_closed",
        "assigned_to": SALES,
        "assigned_to_name": "Divya Pillai",
        "transferred_from_lead_id": lead_id,
        "notes": "Client confirmed. Deal closed with 55L contract. Advance: 5L.",
        "location": "Vadapalani, Chennai",
        "budget": "55,00,000",
        "property_type": "3BHK Villa",
        "custom_fields": {
            "requirement": "3BHK Independent Villa with car parking",
            "plot_size": "2400 sqft",
            "construction_type": "G+1 Residential",
            "site_visit_date": dt(8),
            "negotiation_rounds": "2",
            "final_amount": "55,00,000"
        },
        "status": "converted",
        "tags": ["high_value", "converted", "vadapalani"],
        "deal_value": 5500000,
        "stage_history": [
            {"stage_id": "stg_new_appt", "stage_name": "New Appointment", "moved_at": dt(10), "moved_by": SALES},
            {"stage_id": "stg_site_visit", "stage_name": "Site Visit Done", "moved_at": dt(8), "moved_by": SALES},
            {"stage_id": "stg_negotiation", "stage_name": "Negotiation", "moved_at": dt(6), "moved_by": SALES},
            {"stage_id": "stg_proposal_sent", "stage_name": "Proposal Sent", "moved_at": dt(5), "moved_by": SALES},
            {"stage_id": "stg_deal_closed", "stage_name": "Deal Closed", "moved_at": dt(3), "moved_by": SALES},
        ],
        "converted_at": dt(3),
        "converted_by": SALES,
        "created_by": "system",
        "created_at": dt(10),
        "updated_at": dt(3),
    }
    await db.leads.insert_one(sales_lead)

    # ---- STEP 4: Create Main Project ----
    proj_id = "proj_murugan_001"
    project = {
        "project_id": proj_id,
        "project_code": "PROJ-2026-001",
        "name": "Villa Murugan - Vadapalani",
        "client_name": "Mr. Murugan",
        "client_email": "murugan.vadapalani@gmail.com",
        "client_phone": "+91 98765 43210",
        "location": "Plot No. 42, 3rd Cross Street, Vadapalani, Chennai - 600026",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600026",
        "latitude": 13.0505,
        "longitude": 80.2121,
        "total_value": 5500000,
        "advance_amount": 500000,
        "total_sqft": 2400,
        "floors": 2,
        "bedrooms": 3,
        "bathrooms": 3,
        "car_parking": 1,
        "construction_type": "G+1 Residential Villa",
        "property_type": "3BHK Villa",
        "description": "Premium 3BHK independent villa with modern amenities, car parking, garden space, and terrace. G+1 construction on 2400 sqft plot.",
        "status": "in_progress",
        "approval_status": "approved",
        "start_date": dt(2),
        "expected_completion": (NOW + timedelta(days=240)).isoformat(),
        "lead_id": sales_lead_id,
        "assigned_pm": PM,
        "assigned_pm_name": "Vikram Singh",
        "assigned_cre": CRE,
        "assigned_cre_name": "Anita Desai",
        "assigned_se": SE,
        "assigned_se_name": "Ramesh Kumar",
        "income_project": 500000,
        "expense_project": 0,
        "created_by": SA,
        "created_by_name": "Rajesh Kumar",
        "created_at": dt(3),
        "updated_at": dt(0),
    }
    await db.projects.insert_one(project)

    # ---- STEP 5: RE Project (CRE view) ----
    await db.re_projects.insert_one({
        "re_project_id": uid("re_"),
        "project_id": proj_id,
        "project_name": "Villa Murugan - Vadapalani",
        "client_name": "Mr. Murugan",
        "client_phone": "+91 98765 43210",
        "assigned_cre": CRE,
        "assigned_cre_name": "Anita Desai",
        "total_value": 5500000,
        "advance_collected": 500000,
        "balance_due": 5000000,
        "status": "active",
        "created_at": dt(3),
    })

    # ---- STEP 6: Payment Schedule (13 stages) ----
    payment_stages_data = [
        ("Advance Payment", 500000, "paid", dt(3)),
        ("Foundation - Underground Sump", 400000, "paid", dt(1)),
        ("Foundation - Plinth Beam", 400000, "pending", None),
        ("Ground Floor - Column & Beam", 500000, "pending", None),
        ("Ground Floor - Slab", 500000, "pending", None),
        ("First Floor - Column & Beam", 400000, "pending", None),
        ("First Floor - Slab", 400000, "pending", None),
        ("Brickwork & Plastering", 500000, "pending", None),
        ("Electrical & Plumbing", 400000, "pending", None),
        ("Flooring & Tiling", 400000, "pending", None),
        ("Painting & Finishing", 300000, "pending", None),
        ("Carpentry & Fixtures", 300000, "pending", None),
        ("Final Handover", 200000, "pending", None),
    ]
    ps_ids = []
    for i, (name, amt, status, paid_date) in enumerate(payment_stages_data):
        ps_id = f"ps_murugan_{i+1:02d}"
        ps_ids.append(ps_id)
        stage = {
            "stage_id": ps_id,
            "project_id": proj_id,
            "stage_name": name,
            "stage_label": f"Stage {i+1}",
            "amount": amt,
            "order": i + 1,
            "status": status,
            "workflow_status": "collected" if status == "paid" else "pending_collection",
            "amount_received": amt if status == "paid" else 0,
            "payment_mode": "upi" if status == "paid" else None,
            "payment_reference": f"UPI-MUR-{i+1:03d}" if status == "paid" else None,
            "payment_date": paid_date,
            "collected_by": CRE if status == "paid" else None,
            "collected_by_name": "Anita Desai" if status == "paid" else None,
            "created_at": dt(3),
        }
        await db.payment_stages.insert_one(stage)

    # ---- STEP 7: Income Records (from paid stages) ----
    inc_ids = []
    for i, (name, amt, status, paid_date) in enumerate(payment_stages_data):
        if status == "paid":
            inc_id = f"inc_murugan_{i+1:02d}"
            inc_ids.append(inc_id)
            await db.income.insert_one({
                "income_id": inc_id,
                "project_id": proj_id,
                "project_name": "Villa Murugan - Vadapalani",
                "category": "payment_collection",
                "sub_category": name,
                "amount": amt,
                "payment_mode": "upi",
                "payment_reference": f"UPI-MUR-{i+1:03d}",
                "payment_date": paid_date,
                "stage": name,
                "description": f"Payment collection: Stage {i+1} - {name}",
                "collected_by": CRE,
                "collected_by_name": "Anita Desai",
                "status": "approved",
                "source": "approval",
                "approved_by": ACC,
                "approved_by_name": "Priya Sharma",
                "approved_at": paid_date,
                "created_at": paid_date,
            })

    # ---- STEP 8: BOQ Items ----
    boq_items = [
        ("Foundation Work", "Excavation, PCC, Footing, Plinth beam", 800000, "civil"),
        ("Structural Work - GF", "Columns, beams, slab for ground floor", 700000, "civil"),
        ("Structural Work - FF", "Columns, beams, slab for first floor", 600000, "civil"),
        ("Brickwork", "9 inch & 4.5 inch walls", 350000, "civil"),
        ("Plastering", "Internal & external plastering", 200000, "civil"),
        ("Electrical", "Wiring, switches, DB box, earthing", 400000, "electrical"),
        ("Plumbing", "PVC pipes, fittings, sanitary", 300000, "plumbing"),
        ("Flooring", "Vitrified tiles, marble", 400000, "finishing"),
        ("Painting", "Interior & exterior painting", 300000, "finishing"),
        ("Carpentry", "Doors, windows, kitchen cabinet", 350000, "woodwork"),
        ("CCTV & Security", "4 cameras, DVR setup", 50000, "electrical"),
        ("Landscaping", "Garden, compound wall, gate", 150000, "civil"),
    ]
    for i, (name, desc, cost, category) in enumerate(boq_items):
        await db.boq_items.insert_one({
            "boq_id": f"boq_murugan_{i+1:02d}",
            "project_id": proj_id,
            "name": name,
            "description": desc,
            "estimated_cost": cost,
            "actual_cost": 0,
            "category": category,
            "unit": "lumpsum",
            "quantity": 1,
            "rate": cost,
            "status": "approved" if i < 4 else "pending",
            "created_by": PLAN,
            "created_at": dt(2),
        })

    # ---- STEP 9: Work Orders ----
    wo_data = [
        ("WO-001", "Foundation & Earthwork", "Balaji Construction", "foundation", 800000, "in_progress"),
        ("WO-002", "Structural Work - Ground Floor", "Sri Vinayaga Builders", "structural", 700000, "approved"),
        ("WO-003", "Electrical Work", "Spark Electricals", "electrical", 400000, "pending"),
        ("WO-004", "Plumbing Work", "AquaFlow Systems", "plumbing", 300000, "pending"),
    ]
    wo_ids = []
    for i, (code, name, contractor, category, amt, status) in enumerate(wo_data):
        wo_id = f"wo_murugan_{i+1:02d}"
        wo_ids.append(wo_id)
        await db.work_orders.insert_one({
            "work_order_id": wo_id,
            "work_order_code": code,
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "title": name,
            "contractor_name": contractor,
            "category": category,
            "total_amount": amt,
            "paid_amount": 200000 if i == 0 else 0,
            "balance_amount": amt - (200000 if i == 0 else 0),
            "status": status,
            "start_date": dt(2) if i == 0 else None,
            "expected_end_date": (NOW + timedelta(days=60 + i*30)).isoformat(),
            "description": f"{name} for Villa Murugan project",
            "terms": "Payment on milestone completion",
            "assigned_to": SE,
            "assigned_to_name": "Ramesh Kumar",
            "created_by": PM,
            "created_by_name": "Vikram Singh",
            "approved_by": GM if status != "pending" else None,
            "approved_by_name": "Arun Mehta" if status != "pending" else None,
            "created_at": dt(2),
        })

    # ---- STEP 10: Vendors ----
    vendors = [
        ("Balaji Construction", "9876543210", "balaji@construction.com", "contractor"),
        ("Sri Vinayaga Builders", "9876543211", "vinayaga@builders.com", "contractor"),
        ("Spark Electricals", "9876543212", "spark@electricals.com", "electrical"),
        ("AquaFlow Systems", "9876543213", "aqua@flow.com", "plumbing"),
        ("Chennai Steel Corp", "9876543214", "steel@corp.com", "material_supplier"),
        ("Ambuja Cement Dealer", "9876543215", "ambuja@dealer.com", "material_supplier"),
        ("Royal Tiles Gallery", "9876543216", "royal@tiles.com", "material_supplier"),
        ("Vadapalani Sand Supplier", "9876543217", "sand@supplier.com", "material_supplier"),
    ]
    for name, phone, email, vtype in vendors:
        await db.vendor_master.insert_one({
            "vendor_id": uid("ven_"),
            "name": name,
            "phone": phone,
            "email": email,
            "vendor_type": vtype,
            "address": "Chennai, Tamil Nadu",
            "gst_number": f"33AABCT{uuid.uuid4().hex[:4].upper()}1Z5",
            "is_active": True,
            "created_by": PROC,
            "created_at": dt(2),
        })

    # ---- STEP 11: Material Requests & Expenses ----
    mat_data = [
        ("TMT Steel - 12mm", "Chennai Steel Corp", 500, "kg", 65, 32500, "accounts_approved"),
        ("TMT Steel - 8mm", "Chennai Steel Corp", 300, "kg", 62, 18600, "accounts_approved"),
        ("OPC Cement 53 Grade", "Ambuja Cement Dealer", 200, "bags", 380, 76000, "accounts_approved"),
        ("M-Sand", "Vadapalani Sand Supplier", 40, "units", 4500, 180000, "procurement_priced"),
        ("River Sand", "Vadapalani Sand Supplier", 20, "units", 6000, 120000, "requested"),
        ("Vitrified Tiles 2x2", "Royal Tiles Gallery", 2400, "sqft", 55, 132000, "requested"),
    ]
    for i, (name, vendor, qty, unit, rate, total, status) in enumerate(mat_data):
        mat_id = f"mat_murugan_{i+1:02d}"
        await db.material_expenses.insert_one({
            "expense_id": mat_id,
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "material_name": name,
            "vendor_name": vendor,
            "quantity": qty,
            "unit": unit,
            "rate": rate,
            "estimated_cost": total,
            "final_amount": total if "approved" in status else 0,
            "work_order_id": wo_ids[0] if i < 3 else None,
            "category": "material",
            "status": status,
            "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "planning_approved_by": PLAN if status != "requested" else None,
            "procurement_priced_by": PROC if "approved" in status or status == "procurement_priced" else None,
            "accounts_approved_by": ACC if "accounts_approved" in status else None,
            "payment_mode": "current_account" if "accounts_approved" in status else None,
            "created_at": dt(2 - i * 0.3),
        })
        # Create recorded expense for approved materials
        if "accounts_approved" in status:
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{mat_id}",
                "project_id": proj_id,
                "project_name": "Villa Murugan - Vadapalani",
                "expense_type": "material",
                "category": "material",
                "amount": total,
                "vendor_name": vendor,
                "description": f"Material: {name} - {qty} {unit}",
                "payment_method": "current_account",
                "status": "recorded",
                "source": "approval",
                "created_by": ACC,
                "created_at": dt(1),
            })

    # ---- STEP 12: Labour Expenses ----
    labour_data = [
        ("Balaji Construction", "Foundation Labour", 12, 800, 10, 96000, "accounts_approved"),
        ("Balaji Construction", "Excavation Labour", 8, 700, 5, 28000, "accounts_approved"),
        ("Sri Vinayaga Builders", "Mason Team", 6, 1000, 15, 90000, "planning_approved"),
    ]
    for i, (contractor, desc, workers, daily_rate, days, total, status) in enumerate(labour_data):
        lab_id = f"lab_murugan_{i+1:02d}"
        await db.labour_expenses.insert_one({
            "labour_expense_id": lab_id,
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "contractor_name": contractor,
            "description": desc,
            "num_workers": workers,
            "daily_rate": daily_rate,
            "num_days": days,
            "total_amount": total,
            "work_order_id": wo_ids[0],
            "status": status,
            "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "planning_approved_by": PLAN,
            "accounts_approved_by": ACC if "accounts_approved" in status else None,
            "payment_mode": "cash" if "accounts_approved" in status else None,
            "created_at": dt(1),
        })
        if "accounts_approved" in status:
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{lab_id}",
                "project_id": proj_id,
                "project_name": "Villa Murugan - Vadapalani",
                "expense_type": "labour",
                "category": "labour",
                "amount": total,
                "vendor_name": contractor,
                "description": f"Labour: {desc} - {workers} workers x {days} days",
                "payment_method": "cash",
                "status": "recorded",
                "source": "approval",
                "created_by": ACC,
                "created_at": dt(1),
            })

    # ---- STEP 13: Vendor/Service Expenses ----
    vendor_exp = [
        ("JCB Rental - Excavation", "Vadapalani JCB Service", 25000, "accounts_approved"),
        ("Concrete Mixer Rental", "Chennai Equipment Hire", 15000, "requested"),
    ]
    for i, (desc, vendor, amt, status) in enumerate(vendor_exp):
        ve_id = f"vse_murugan_{i+1:02d}"
        await db.vendor_service_expenses.insert_one({
            "expense_id": ve_id,
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "vendor_name": vendor,
            "description": desc,
            "amount": amt,
            "status": status,
            "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "accounts_approved_by": ACC if "accounts_approved" in status else None,
            "payment_mode": "cash" if "accounts_approved" in status else None,
            "created_at": dt(1),
        })
        if "accounts_approved" in status:
            await db.recorded_expenses.insert_one({
                "expense_id": f"exp_{ve_id}",
                "project_id": proj_id,
                "project_name": "Villa Murugan - Vadapalani",
                "expense_type": "vendor_service",
                "category": "other",
                "amount": amt,
                "vendor_name": vendor,
                "description": desc,
                "payment_method": "cash",
                "status": "recorded",
                "source": "approval",
                "created_by": ACC,
                "created_at": dt(1),
            })

    # ---- STEP 14: Petty Cash ----
    petty_data = [
        ("Site miscellaneous - nails, binding wire", 5000, 5000, 4200, "settled"),
        ("Water tanker for curing", 3000, 3000, 3000, "issued"),
        ("Tea & snacks for workers", 2000, 0, 0, "requested"),
    ]
    for i, (purpose, req_amt, issued, spent, status) in enumerate(petty_data):
        await db.petty_cash.insert_one({
            "petty_cash_id": f"pc_murugan_{i+1:02d}",
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "purpose": purpose,
            "amount_requested": req_amt,
            "amount_issued": issued,
            "amount_spent": spent,
            "balance": issued - spent,
            "status": status,
            "issued_by": ACC if issued > 0 else None,
            "issued_by_name": "Priya Sharma" if issued > 0 else None,
            "issued_at": dt(1) if issued > 0 else None,
            "settled_at": dt(0) if status == "settled" else None,
            "created_at": dt(2),
        })

    # Also add recorded expense for petty cash
    await db.recorded_expenses.insert_one({
        "expense_id": uid("exp_"),
        "project_id": proj_id,
        "project_name": "Villa Murugan - Vadapalani",
        "expense_type": "petty_cash",
        "category": "petty_cash",
        "amount": 4200,
        "vendor_name": "Site Miscellaneous",
        "description": "Petty cash: nails, binding wire etc.",
        "payment_method": "cash",
        "status": "recorded",
        "source": "manual",
        "created_by": ACC,
        "created_at": dt(0),
    })

    # ---- STEP 15: Cheques ----
    cheque_data = [
        ("CHQ001", "incoming", "Mr. Murugan", "client", 500000, "cleared", dt(3), dt(3), dt(2)),
        ("CHQ002", "outgoing", "Balaji Construction", "vendor", 200000, "cleared", dt(1), dt(1), dt(0)),
        ("CHQ003", "outgoing", "Chennai Steel Corp", "vendor", 127100, "deposited", dt(0), dt(0), None),
        ("CHQ004", "incoming", "Mr. Murugan", "client", 400000, "received", (NOW + timedelta(days=7)).isoformat(), None, None),
    ]
    for num, ctype, party, ptype, amt, status, cdate, dep_date, clr_date in cheque_data:
        await db.cheques.insert_one({
            "cheque_id": uid("chq_"),
            "cheque_number": num,
            "cheque_type": ctype,
            "bank_name": "HDFC Bank" if ctype == "outgoing" else "SBI",
            "branch_name": "Vadapalani Branch",
            "party_name": party,
            "party_type": ptype,
            "project_id": proj_id,
            "project_name": "Villa Murugan - Vadapalani",
            "amount": amt,
            "cheque_date": cdate,
            "status": status,
            "deposit_date": dep_date,
            "clearance_date": clr_date,
            "remarks": f"{num} - {party}",
            "created_by": ACC,
            "created_by_name": "Priya Sharma",
            "created_at": cdate,
        })

    # ---- STEP 16: Site Engineer Assignments ----
    await db.site_engineer_assignments.insert_one({
        "assignment_id": uid("sea_"),
        "project_id": proj_id,
        "project_name": "Villa Murugan - Vadapalani",
        "user_id": SE,
        "user_name": "Ramesh Kumar",
        "role": "site_engineer",
        "assigned_by": PM,
        "assigned_at": dt(2),
    })

    # ---- STEP 17: Site Stages / Progress ----
    site_stages_data = [
        ("Excavation", 100, "completed"),
        ("PCC & Footing", 100, "completed"),
        ("Plinth Beam", 80, "in_progress"),
        ("Ground Floor Columns", 0, "not_started"),
    ]
    for i, (name, pct, status) in enumerate(site_stages_data):
        await db.site_stages.insert_one({
            "stage_id": uid("ss_"),
            "project_id": proj_id,
            "name": name,
            "progress": pct,
            "status": status,
            "order": i + 1,
            "updated_by": SE,
            "updated_at": dt(0),
            "created_at": dt(2),
        })

    # ---- STEP 18: Notifications ----
    notifs = [
        (ACC, "New payment collected - Stage 2: Foundation Sump (₹4,00,000)", "payment", dt(1)),
        (GM, "Work Order WO-001 approved for Villa Murugan", "work_order", dt(2)),
        (CRE, "Payment collection pending: Stage 3 - Plinth Beam (₹4,00,000)", "reminder", dt(0)),
        (SE, "Material request approved: TMT Steel 12mm - 500kg", "material", dt(1)),
        (PLAN, "New material request: River Sand - 20 units", "material", dt(0)),
        (PROC, "Pricing pending: M-Sand - 40 units from Vadapalani Sand Supplier", "procurement", dt(0)),
        (PM, "Project progress update: Plinth Beam at 80%", "progress", dt(0)),
        (SA, "Deal closed: Murugan Vadapalani - ₹55,00,000", "deal", dt(3)),
    ]
    for user_id, msg, ntype, created in notifs:
        await db.notifications.insert_one({
            "notification_id": uid("notif_"),
            "user_id": user_id,
            "message": msg,
            "type": ntype,
            "project_id": proj_id,
            "is_read": False,
            "created_at": created,
        })

    # ---- STEP 19: Audit Logs ----
    audit_entries = [
        (SA, "create", "project", proj_id, "Created project Villa Murugan - Vadapalani", dt(3)),
        (CRE, "create", "payment", ps_ids[0], "Collected advance payment ₹5,00,000", dt(3)),
        (CRE, "create", "payment", ps_ids[1], "Collected Stage 2 payment ₹4,00,000", dt(1)),
        (ACC, "approve", "income", inc_ids[0], "Approved advance payment", dt(3)),
        (ACC, "approve", "income", inc_ids[1], "Approved Stage 2 payment", dt(1)),
        (GM, "approve", "work_order", wo_ids[0], "Approved WO-001 Foundation Work", dt(2)),
        (SE, "create", "material_request", "mat_murugan_01", "Requested TMT Steel 12mm", dt(2)),
        (PLAN, "approve", "material_request", "mat_murugan_01", "Planning approved TMT Steel", dt(2)),
        (PROC, "price", "material_request", "mat_murugan_01", "Priced TMT Steel at ₹65/kg", dt(1)),
        (ACC, "approve", "material_expense", "mat_murugan_01", "Approved TMT Steel payment ₹32,500", dt(1)),
    ]
    for user_id, action, entity, entity_id, desc, created in audit_entries:
        await db.audit_logs.insert_one({
            "log_id": uid("log_"),
            "user_id": user_id,
            "action": action,
            "entity_type": entity,
            "entity_id": entity_id,
            "description": desc,
            "created_at": created,
        })

    # ---- STEP 20: Update project totals ----
    total_income = 900000  # 500000 + 400000
    total_expense = sum([32500, 18600, 76000, 96000, 28000, 25000, 4200])  # material + labour + vendor + petty
    await db.projects.update_one({"project_id": proj_id}, {"$set": {
        "income_project": total_income,
        "expense_project": total_expense,
        "updated_at": NOW.isoformat(),
    }})

    # ---- STEP 21: Pending approval for accountant to see ----
    # One pending income from a recent collection
    await db.income.insert_one({
        "income_id": "inc_murugan_pending",
        "project_id": proj_id,
        "project_name": "Villa Murugan - Vadapalani",
        "category": "payment_collection",
        "sub_category": "Foundation - Plinth Beam",
        "amount": 400000,
        "payment_mode": "cheque",
        "payment_reference": "CHQ004",
        "payment_date": dt(0),
        "stage": "Foundation - Plinth Beam",
        "description": "Payment collection: Stage 3 - Foundation - Plinth Beam",
        "collected_by": CRE,
        "collected_by_name": "Anita Desai",
        "status": "pending_approval",
        "source": "approval",
        "created_at": dt(0),
    })

    print("=" * 60)
    print("SEED COMPLETE - Villa Murugan Vadapalani")
    print("=" * 60)
    print(f"Lead (Pre-Sales): {lead_id}")
    print(f"Lead (Sales): {sales_lead_id}")
    print(f"Project: {proj_id}")
    print(f"Income: ₹{total_income:,.0f} (+ ₹4,00,000 pending approval)")
    print(f"Expenses: ₹{total_expense:,.0f}")
    print(f"Payment Stages: {len(payment_stages_data)} (2 paid, 11 pending)")
    print(f"Work Orders: {len(wo_data)}")
    print(f"Material Requests: {len(mat_data)}")
    print(f"Labour Expenses: {len(labour_data)}")
    print(f"Vendor Expenses: {len(vendor_exp)}")
    print(f"Petty Cash: {len(petty_data)}")
    print(f"Cheques: {len(cheque_data)}")
    print(f"Vendors: {len(vendors)}")
    print(f"BOQ Items: {len(boq_items)}")
    print("=" * 60)

    client.close()

if __name__ == "__main__":
    asyncio.run(seed())
