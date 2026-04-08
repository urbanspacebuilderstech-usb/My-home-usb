"""
Comprehensive seed script: Delete all project data and create realistic demo data
for "Swathi 60L G+2" project at 50% completion with 30L paid.
Populates ALL tabs and ALL role-specific boards.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb+srv://urbanspacebuilderstech_db_user:BwrIZOO1GfTYGIbW@constructioncrm.l86s93a.mongodb.net/?retryWrites=true&w=majority")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

def uid():
    return uuid.uuid4().hex[:12]

async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # ========== STEP 1: CLEAN ALL PROJECT-RELATED DATA ==========
    print("Cleaning all project-related data...")
    collections_to_clean = [
        "projects", "leads", "project_materials", "project_work_orders",
        "project_stages", "material_requests", "site_photos", "documents",
        "petty_cash", "petty_cash_v2", "petty_cash_requests", "se_attendance",
        "se_location_pings", "curing_video_records", "labour_attendance",
        "labour_work_orders", "labour_expenses", "labour_contractors",
        "income", "procurement_pricing", "purchase_orders", "purchase_orders_v2",
        "credit_ledger", "petrol_allowance", "payment_records",
        "daily_labour_reports", "daily_progress", "site_plans",
        "material_receipts", "material_inventory", "transit_tracking",
        "recorded_expenses", "direct_expenses", "work_orders",
        "re_projects", "re_change_logs", "rough_estimates", "scope_items",
        "site_engineer_assignments", "project_vendor_assignments",
        "additional_costs", "deductions", "indirect_costs", "indirect_cost_allocations",
        "boq_items", "cheques", "cheque_suspense", "suspense_entries",
        "design_files", "expenses", "expenses_labour", "expenses_material",
        "material_expenses", "vendor_service_expenses", "financial_audit_logs",
        "payment_stages", "notifications", "attendance",
    ]
    for coll in collections_to_clean:
        r = await db[coll].delete_many({})
        if r.deleted_count > 0:
            print(f"  Deleted {r.deleted_count} from {coll}")

    now = datetime.now(timezone.utc)
    iso = lambda d: d.isoformat()

    # Key dates
    project_start = now - timedelta(days=90)
    today = now

    # Key users (from DB)
    SE = "user_engineer001"         # Ramesh Kumar
    PM = "user_pm001"               # Vikram Singh
    PLANNING = "user_planning001"   # Suresh Iyer
    PROCUREMENT = "user_procurement001"  # Meera Nair
    ACCOUNTANT = "user_accountant001"    # Priya Sharma
    SALES = "user_sales001"         # Divya Pillai
    CRE = "user_cre001"             # Anita Desai
    PRESALES = "user_presales001"   # Karthik Reddy
    MARKETING = "user_marketing001" # Sneha Gupta
    ADMIN = "user_f65b2d2e6952"     # Urban Space Builders
    SR_SE = "user_20942172399b"     # Suresh Patel
    GM = "user_gm001"              # Arun Mehta
    ARCHITECT = "user_architect001" # Deepa Architect

    PROJECT_ID = f"proj_{uid()}"
    PROJECT_CODE = "USB-SW001"
    RE_PROJECT_ID = f"re_{uid()}"
    RE_NUMBER = "USB-RE0001"

    # ========== STEP 2: CREATE RE PROJECT (Estimate tab) ==========
    print("Creating Rough Estimate (RE) project...")
    re_scope_items = [
        {"name": "Foundation Work", "quantity": 1, "unit": "Lump Sum", "rate": 600000, "total": 600000},
        {"name": "Plinth Beam & DPC", "quantity": 1, "unit": "Lump Sum", "rate": 300000, "total": 300000},
        {"name": "Ground Floor Structure", "quantity": 1100, "unit": "Sqft", "rate": 1800, "total": 1980000},
        {"name": "First Floor Structure", "quantity": 1100, "unit": "Sqft", "rate": 1800, "total": 1980000},
        {"name": "Second Floor Structure", "quantity": 550, "unit": "Sqft", "rate": 1800, "total": 990000},
        {"name": "Plastering & Finishing", "quantity": 2200, "unit": "Sqft", "rate": 250, "total": 550000},
        {"name": "Electrical Work", "quantity": 2200, "unit": "Sqft", "rate": 180, "total": 396000},
        {"name": "Plumbing Work", "quantity": 2200, "unit": "Sqft", "rate": 120, "total": 264000},
        {"name": "Flooring (Vitrified)", "quantity": 2200, "unit": "Sqft", "rate": 100, "total": 220000},
        {"name": "Painting (Interior + Exterior)", "quantity": 2200, "unit": "Sqft", "rate": 80, "total": 176000},
        {"name": "Doors & Windows", "quantity": 25, "unit": "Nos", "rate": 12000, "total": 300000},
        {"name": "Staircase", "quantity": 2, "unit": "Nos", "rate": 75000, "total": 150000},
        {"name": "Overhead Tank & Sump", "quantity": 1, "unit": "Set", "rate": 94000, "total": 94000},
    ]

    await db.re_projects.insert_one({
        "re_project_id": RE_PROJECT_ID,
        "lead_id": f"lead_{uid()}",
        "re_number": RE_NUMBER,
        "revision": 0,
        "parent_re_number": RE_NUMBER,
        "client_name": "Swathi",
        "client_email": "swathi@gmail.com",
        "client_phone": "9876543210",
        "project_name": "Swathi 60L G+2",
        "location": "Velachery, Chennai",
        "sqft": 2200,
        "building_type": "G+2 Residential",
        "handover_months": 12,
        "rough_scope_items": re_scope_items,
        "estimated_total": sum(i["total"] for i in re_scope_items),
        "status": "client_approved",
        "planning_notes": "G+2 with 3BHK on each floor. Premium package selected.",
        "prepared_by": PLANNING,
        "prepared_at": iso(project_start - timedelta(days=20)),
        "submitted_for_approval": True,
        "submitted_at": iso(project_start - timedelta(days=18)),
        "gm_approved_by": GM,
        "gm_approved_at": iso(project_start - timedelta(days=16)),
        "sent_to_client_by": SALES,
        "sent_to_client_at": iso(project_start - timedelta(days=14)),
        "client_approved_by": SALES,
        "client_approved_at": iso(project_start - timedelta(days=10)),
        "converted_project_id": PROJECT_ID,
        "converted_at": iso(project_start - timedelta(days=5)),
        "converted_by": CRE,
        "created_by": CRE,
        "created_at": iso(project_start - timedelta(days=25)),
        "updated_at": iso(project_start - timedelta(days=5)),
    })

    # ========== STEP 3: CREATE CRM LEAD (Sales Board) ==========
    print("Creating CRM leads...")
    onboarded_stage = await db.lead_stages.find_one({"name": {"$regex": "project.*onboard", "$options": "i"}}, {"_id": 0})
    stage_id = onboarded_stage["stage_id"] if onboarded_stage else "stg_project_onboarded"

    lead_id = f"lead_{uid()}"
    lead = {
        "lead_id": lead_id,
        "name": "Swathi",
        "phone": "9876543210",
        "email": "swathi@gmail.com",
        "source": "Website",
        "location": "Velachery, Chennai",
        "budget": "60 Lakhs",
        "sqft": 2200,
        "building_type": "G+2 Residential",
        "notes": "Client wants G+2 with 3BHK on each floor. Total budget 60L.",
        "stage_id": stage_id,
        "current_stage_id": stage_id,
        "stage_type": "sales",
        "assigned_to": SALES,
        "created_by": PRESALES,
        "project_created": True,
        "project_id": PROJECT_ID,
        "re_project_id": RE_PROJECT_ID,
        "re_number": RE_NUMBER,
        "next_followup_date": None,
        "previous_stage_id": None,
        "site_visit_data": {
            "visit_type": "client_land",
            "visit_date": iso(project_start - timedelta(days=15)),
            "sr_engineer_id": SR_SE,
            "status": "completed",
            "notes": "Good plot, 30x40, east facing"
        },
        "created_at": iso(project_start - timedelta(days=30)),
        "updated_at": iso(project_start - timedelta(days=5)),
    }
    await db.leads.insert_one(lead)

    # Extra leads in various pipeline stages
    stages = await db.lead_stages.find({}, {"_id": 0}).to_list(50)
    stage_map = {s["name"]: s["stage_id"] for s in stages}

    extra_leads = [
        {"name": "Karthik R", "phone": "9988776655", "source": "Referral", "budget": "45L", "stage": "New Lead", "sqft": 1500, "building_type": "G+1 Residential", "location": "Adyar, Chennai"},
        {"name": "Priya M", "phone": "9877665544", "source": "JustDial", "budget": "80L", "stage": "Follow-up", "sqft": 3000, "building_type": "G+2 Residential", "location": "Anna Nagar, Chennai"},
        {"name": "Mohan S", "phone": "9766554433", "source": "Instagram", "budget": "35L", "stage": "Site Visit (Client Land)", "sqft": 1200, "building_type": "Individual House", "location": "Tambaram, Chennai"},
        {"name": "Vimal K", "phone": "9655443322", "source": "Website", "budget": "1.2 Cr", "stage": "RE - From Planning", "sqft": 4000, "building_type": "G+3 Commercial", "location": "T.Nagar, Chennai"},
        {"name": "Deepa L", "phone": "9544332211", "source": "Referral", "budget": "55L", "stage": "Negotiation", "sqft": 2000, "building_type": "G+2 Residential", "location": "Porur, Chennai"},
        {"name": "Senthil V", "phone": "9433221100", "source": "Facebook", "budget": "30L", "stage": "Contacted", "sqft": 1000, "building_type": "Individual House", "location": "Chromepet, Chennai"},
        {"name": "Anitha B", "phone": "9322110099", "source": "Google Ads", "budget": "70L", "stage": "Appointment Booked", "sqft": 2800, "building_type": "G+2 Residential", "location": "Sholinganallur, Chennai"},
        {"name": "Rajesh P", "phone": "9211009988", "source": "Referral", "budget": "50L", "stage": "Discussion", "sqft": 1800, "building_type": "G+1 Residential", "location": "Medavakkam, Chennai"},
    ]
    for el in extra_leads:
        stg_id = None
        for sn, sid in stage_map.items():
            if el["stage"].lower() in sn.lower():
                stg_id = sid
                break
        if not stg_id:
            stg_id = stages[0]["stage_id"] if stages else "stg_new"
        days_ago = 3 + extra_leads.index(el) * 2
        await db.leads.insert_one({
            "lead_id": f"lead_{uid()}", "name": el["name"], "phone": el["phone"],
            "email": f"{el['name'].lower().replace(' ','')}@gmail.com",
            "source": el["source"], "budget": el["budget"], "sqft": el["sqft"],
            "building_type": el["building_type"], "location": el["location"],
            "notes": f"Interested in {el['building_type']}. Budget {el['budget']}.",
            "stage_id": stg_id, "current_stage_id": stg_id,
            "stage_type": "sales",
            "assigned_to": SALES, "created_by": PRESALES,
            "project_created": False,
            "next_followup_date": iso(now + timedelta(days=1)) if "Follow" in el["stage"] else None,
            "created_at": iso(now - timedelta(days=days_ago)),
            "updated_at": iso(now - timedelta(days=1)),
        })

    # ========== STEP 4: CREATE PROJECT ==========
    print("Creating project: Swathi 60L G+2...")
    project = {
        "project_id": PROJECT_ID,
        "project_code": PROJECT_CODE,
        "name": "Swathi 60L G+2",
        "client_name": "Swathi",
        "client_phone": "9876543210",
        "client_email": "swathi@gmail.com",
        "client_user_id": None,
        "location": "Velachery, Chennai",
        "latitude": 12.9815,
        "longitude": 80.2176,
        "sqft": 2200,
        "building_type": "G+2 Residential",
        "package_id": None,
        "package_name": "Premium Package",
        "materials_locked": True,
        "current_stage": "first_floor_slab",
        "stage_history": [
            {"stage": "foundation", "started": iso(project_start), "completed": iso(project_start + timedelta(days=20))},
            {"stage": "plinth", "started": iso(project_start + timedelta(days=20)), "completed": iso(project_start + timedelta(days=35))},
            {"stage": "ground_floor", "started": iso(project_start + timedelta(days=35)), "completed": iso(project_start + timedelta(days=55))},
            {"stage": "first_floor_slab", "started": iso(project_start + timedelta(days=55)), "completed": None},
        ],
        "advance_date": iso(project_start - timedelta(days=5)),
        "advance_amount": 600000,
        "advance_payment_mode": "bank_transfer",
        "total_value": 6000000,
        "additional_cost": 150000,
        "income_project": 3000000,
        "income_additional": 50000,
        "total_expense": 2400000,
        "start_date": iso(project_start),
        "expected_completion": iso(project_start + timedelta(days=180)),
        "status": "active",
        "created_by": ADMIN,
        "planning_modified_by": PLANNING,
        "planning_submitted_at": iso(project_start + timedelta(days=2)),
        "planning_status": "active",
        "planning_active_date": iso(project_start + timedelta(days=3)),
        "site_engineer_user_id": SE,
        "project_name": "Swathi 60L G+2",
        "re_project_id": RE_PROJECT_ID,
        "team": {
            "architect": ARCHITECT,
            "project_manager": PM,
            "sr_site_engineer": SR_SE,
            "site_engineer": SE,
            "cre": CRE,
            "qc": None,
            "procurement": PROCUREMENT,
        },
        "created_at": iso(project_start - timedelta(days=5)),
        "updated_at": iso(now),
    }
    await db.projects.insert_one(project)

    # ========== STEP 5: SITE ENGINEER ASSIGNMENT ==========
    await db.site_engineer_assignments.insert_one({
        "assignment_id": f"assign_{uid()}", "project_id": PROJECT_ID,
        "user_id": SE, "role": "site_engineer",
        "assigned_by": PM, "is_active": True, "created_at": iso(project_start),
    })

    # ========== STEP 6: SCOPE ITEMS (Final Estimate tab) ==========
    print("Creating scope items (Final Estimate)...")
    scope_items_data = [
        ("Foundation Work", 1, "Lump Sum", 600000),
        ("Plinth Beam & DPC", 1, "Lump Sum", 300000),
        ("Ground Floor Structure", 1100, "Sqft", 1800),
        ("First Floor Structure", 1100, "Sqft", 1800),
        ("Second Floor Structure", 550, "Sqft", 1800),
        ("Plastering & Finishing", 2200, "Sqft", 250),
        ("Electrical Work", 2200, "Sqft", 180),
        ("Plumbing Work", 2200, "Sqft", 120),
        ("Flooring (Vitrified)", 2200, "Sqft", 100),
        ("Painting (Interior + Exterior)", 2200, "Sqft", 80),
        ("Doors & Windows", 25, "Nos", 12000),
        ("Staircase", 2, "Nos", 75000),
        ("Overhead Tank & Sump", 1, "Set", 94000),
    ]
    for idx, (name, qty, unit, rate) in enumerate(scope_items_data):
        await db.scope_items.insert_one({
            "scope_id": f"scope_{uid()}", "project_id": PROJECT_ID,
            "item_name": name, "quantity": qty, "unit": unit,
            "unit_rate": rate, "total_amount": qty * rate,
            "remarks": f"From RE: {RE_NUMBER}" if idx < 5 else "",
            "workflow_status": "approved",
            "sort_order": idx + 1,
            "created_by": PLANNING, "verified_by": PM, "approved_by": GM,
            "created_at": iso(project_start + timedelta(days=1)),
        })

    # ========== STEP 7: PROJECT STAGES (Stages tab) ==========
    print("Creating project stages...")
    stage_list = [
        ("Foundation", 100, True), ("Plinth Beam", 100, True),
        ("Ground Floor Walls", 100, True), ("Ground Floor Slab", 100, True),
        ("First Floor Walls", 70, False), ("First Floor Slab", 0, False),
        ("Second Floor Walls", 0, False), ("Second Floor Slab", 0, False),
        ("Plastering", 0, False), ("Electrical & Plumbing", 0, False),
        ("Flooring", 0, False), ("Painting", 0, False),
    ]
    for idx, (name, pct, done) in enumerate(stage_list):
        status = "finished" if done else ("started" if pct > 0 else "yet_to_start")
        start = project_start + timedelta(days=idx * 12) if pct > 0 else None
        target = project_start + timedelta(days=(idx + 1) * 12 + 5)
        await db.project_stages.insert_one({
            "stage_id": f"pstg_{uid()}", "project_id": PROJECT_ID,
            "stage_name": name, "order": idx + 1, "progress": pct,
            "status": status,
            "start_date": start.strftime("%Y-%m-%d") if start else None,
            "target_date": target.strftime("%Y-%m-%d"),
            "remarks": f"{'Completed' if done else 'In progress' if pct > 0 else 'Upcoming'}",
            "created_by": PM,
            "created_at": iso(project_start),
        })

    # ========== STEP 8: PROJECT MATERIALS (Materials in Planning) ==========
    print("Creating project materials...")
    materials = [
        ("OPC 53 Grade Cement", "UltraTech", "bags", 800, 350),
        ("M-Sand (Fine)", "Local", "units", 100, 1200),
        ("Steel TMT 12mm", "Tata Tiscon", "kg", 5000, 72),
        ("Bricks 9x4x3", "Local", "nos", 20000, 8),
        ("River Sand", "Local", "units", 60, 2800),
        ("20mm Aggregate", "Local", "units", 80, 1500),
        ("Electrical Wire 1.5sqmm", "Havells", "metres", 500, 18),
        ("CPVC Pipes 3/4 inch", "Astral", "metres", 200, 85),
        ("Steel TMT 8mm", "Tata Tiscon", "kg", 2000, 68),
        ("Waterproofing Chemical", "Dr.Fixit", "litres", 100, 250),
    ]
    for name, brand, unit, qty, rate in materials:
        await db.project_materials.insert_one({
            "material_id": f"pm_{uid()}", "project_id": PROJECT_ID,
            "name": name, "brand": brand, "unit": unit,
            "quantity": qty, "rate": rate, "specification": "",
            "created_at": iso(project_start + timedelta(days=2)),
            "updated_at": iso(project_start + timedelta(days=2)),
        })

    # ========== STEP 9: MATERIAL REQUESTS (Materials tab + Planning/Procurement/SE boards) ==========
    print("Creating material requests...")
    mat_requests = [
        ("OPC 53 Grade Cement", "UltraTech", "bags", 200, 350, "received_completed", -60, "Foundation"),
        ("Steel TMT 12mm", "Tata Tiscon", "kg", 2000, 72, "received_completed", -50, "Foundation"),
        ("M-Sand (Fine)", "Local", "units", 40, 1200, "received_completed", -45, "Plinth"),
        ("Bricks 9x4x3", "Local", "nos", 10000, 8, "in_transit", -10, "GF Walls"),
        ("OPC 53 Grade Cement", "UltraTech", "bags", 200, 350, "procurement_approved", -5, "FF Walls"),
        ("Electrical Wire 1.5sqmm", "Havells", "metres", 300, 18, "planning_approved", -2, "Electrical"),
        ("CPVC Pipes 3/4 inch", "Astral", "metres", 200, 85, "requested", -1, "Plumbing"),
        ("Steel TMT 8mm", "Tata Tiscon", "kg", 500, 68, "vendor_selected", -8, "FF Slab"),
        ("20mm Aggregate", "Local", "units", 30, 1500, "received_completed", -35, "Foundation"),
        ("River Sand", "Local", "units", 20, 2800, "received_completed", -30, "Plinth"),
    ]
    for name, brand, unit, qty, rate, status, days_ago, stage in mat_requests:
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        total = qty * rate
        await db.material_requests.insert_one({
            "request_id": req_id, "order_id": order_id,
            "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
            "material_name": name, "brand": brand, "unit": unit,
            "quantity": qty, "unit_rate": rate, "total_amount": total,
            "status": status, "stage": stage,
            "is_approved_material": True,
            "site_engineer_id": SE, "site_engineer_name": "Ramesh Kumar",
            "vendor_name": "Balaji Traders" if status not in ("requested", "planning_approved") else None,
            "remarks": f"Required for {stage}",
            "required_date": iso(now + timedelta(days=days_ago + 3)),
            "expected_delivery": iso(now + timedelta(days=days_ago + 5)) if status in ("in_transit", "vendor_selected") else None,
            "received_qty": qty if status == "received_completed" else 0,
            "created_at": iso(now + timedelta(days=days_ago)),
            "updated_at": iso(now + timedelta(days=days_ago + 1)),
        })
        if status in ("received_completed", "in_transit", "procurement_approved", "vendor_selected"):
            await db.procurement_pricing.insert_one({
                "pricing_id": f"pp_{uid()}", "request_id": req_id,
                "vendor_id": f"vendor_{uid()[:6]}", "vendor_name": "Balaji Traders",
                "unit_price": rate, "total_price": total,
                "payment_type": "credit", "credit_period_days": 30,
                "status": "approved", "created_at": iso(now + timedelta(days=days_ago + 1)),
            })

    # ========== STEP 10: LABOUR EXPENSES (Labours tab) ==========
    print("Creating labour expenses...")
    labour_items = [
        ("Selvam & Co", "Mason Work - Foundation", "mason", 8, 20, 900, "accounts_approved", -70),
        ("Selvam & Co", "Mason Work - Plinth", "mason", 6, 15, 900, "accounts_approved", -50),
        ("Selvam & Co", "Mason Work - GF Walls", "mason", 10, 25, 900, "pm_approved", -20),
        ("Kumar Electricals", "GF Electrical Conduit", "electrician", 4, 12, 1000, "accounts_approved", -25),
        ("Rajesh Plumbing", "Underground Plumbing", "plumber", 3, 10, 850, "accounts_approved", -40),
        ("Rajesh Plumbing", "GF Plumbing Work", "plumber", 4, 8, 850, "requested", -3),
        ("Daily Labour", "Centering Work - GF Slab", "centering", 6, 5, 1200, "accounts_approved", -30),
        ("Daily Labour", "Helper Work", "helper", 8, 30, 600, "pm_approved", -10),
    ]
    for cont, desc, ltype, workers, days, rate, status, days_ago in labour_items:
        await db.labour_expenses.insert_one({
            "labour_expense_id": f"le_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "contractor_name": cont, "description": desc,
            "labour_type": ltype, "num_workers": workers, "num_days": days,
            "daily_rate": rate, "total_amount": workers * days * rate,
            "status": status,
            "requested_by": SE, "requested_by_name": "Ramesh Kumar",
            "approved_by": PM if status != "requested" else None,
            "payment_method": "bank_transfer",
            "created_at": iso(now + timedelta(days=days_ago)),
            "updated_at": iso(now + timedelta(days=days_ago + 1)),
        })

    # ========== STEP 11: WORK ORDERS (Work Orders tab) ==========
    print("Creating work orders...")
    contractors_data = [
        ("Selvam & Co", "Mason Work", "cont_001", "mason", [
            ("Foundation Mason Work", 180000, "approved", [
                {"amount": 180000, "requested_at": iso(now - timedelta(days=60)), "pm_approved_at": iso(now - timedelta(days=59)), "planning_approved_at": iso(now - timedelta(days=58)), "accountant_approved_at": iso(now - timedelta(days=57)), "approved_amount": 180000},
            ]),
            ("Plinth Mason Work", 120000, "approved", [
                {"amount": 120000, "requested_at": iso(now - timedelta(days=45)), "pm_approved_at": iso(now - timedelta(days=44)), "planning_approved_at": iso(now - timedelta(days=43)), "accountant_approved_at": iso(now - timedelta(days=42)), "approved_amount": 120000},
            ]),
            ("GF Walls & Slab", 250000, "pm_approved", [
                {"amount": 250000, "requested_at": iso(now - timedelta(days=15)), "pm_approved_at": iso(now - timedelta(days=13))},
            ]),
            ("FF Walls", 200000, "pending", []),
        ]),
        ("Kumar Electricals", "Electrical", "cont_002", "electrical", [
            ("GF Electrical Conduit", 80000, "approved", [
                {"amount": 80000, "requested_at": iso(now - timedelta(days=25)), "pm_approved_at": iso(now - timedelta(days=24)), "planning_approved_at": iso(now - timedelta(days=23)), "accountant_approved_at": iso(now - timedelta(days=22)), "approved_amount": 80000},
            ]),
            ("FF Electrical Conduit", 80000, "pending", []),
        ]),
        ("Rajesh Plumbing", "Plumbing", "cont_003", "plumbing", [
            ("Underground Plumbing", 60000, "approved", [
                {"amount": 60000, "requested_at": iso(now - timedelta(days=40)), "pm_approved_at": iso(now - timedelta(days=39)), "planning_approved_at": iso(now - timedelta(days=38)), "accountant_approved_at": iso(now - timedelta(days=37)), "approved_amount": 60000},
            ]),
            ("GF Plumbing", 45000, "requested", [
                {"amount": 45000, "requested_at": iso(now - timedelta(days=5))},
            ]),
        ]),
    ]
    for cont_name, category, cont_id, cont_type, wo_stages in contractors_data:
        work_order_id = f"wo_{uid()}"
        stages_list = []
        paid_total = 0
        for s_name, s_amount, s_status, payments in wo_stages:
            stage = {
                "stage_id": f"wos_{uid()[:6]}",
                "name": s_name, "type": "amount", "value": s_amount,
                "amount": s_amount, "status": s_status,
                "requested_by": SE if s_status != "pending" else None,
                "requested_at": payments[0].get("requested_at") if payments else None,
                "pm_approved_by": PM if s_status in ("pm_approved", "planning_approved", "approved") else None,
                "pm_approved_at": payments[0].get("pm_approved_at") if payments and s_status in ("pm_approved", "planning_approved", "approved") else None,
                "planning_approved_by": PLANNING if s_status in ("planning_approved", "approved") else None,
                "planning_approved_at": payments[0].get("planning_approved_at") if payments and s_status in ("planning_approved", "approved") else None,
                "accountant_approved_by": ACCOUNTANT if s_status == "approved" else None,
                "accountant_approved_at": payments[0].get("accountant_approved_at") if payments and s_status == "approved" else None,
                "approved_amount": payments[0].get("approved_amount") if payments and s_status == "approved" else None,
                "rejection_reason": None,
            }
            stages_list.append(stage)
            if s_status == "approved":
                paid_total += s_amount

        scope_total = sum(s["amount"] for s in stages_list)
        await db.project_work_orders.insert_one({
            "work_order_id": work_order_id, "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "contractor_id": cont_id, "contractor_name": cont_name,
            "contractor_type": cont_type,
            "scope_items": [{"name": category, "unit": "Lump Sum", "quantity": 1, "unit_rate": scope_total, "total": scope_total}],
            "scope_total": scope_total,
            "stages": stages_list,
            "additional_work": [],
            "additional_total": 0,
            "total_value": scope_total,
            "paid_amount": paid_total,
            "notes": f"{category} work for Swathi 60L G+2",
            "labour_rates": {"skilled": 900, "semi_skilled": 600, "unskilled": 400},
            "status": "active", "is_active": True,
            "created_by": SE,
            "created_at": iso(project_start + timedelta(days=5)),
            "updated_at": iso(now),
        })

    # ========== STEP 12: PURCHASE ORDERS ==========
    print("Creating purchase orders...")
    po_items = [
        ("OPC 53 Grade Cement", 200, 350, "Balaji Traders", "delivered", -60),
        ("Steel TMT 12mm", 2000, 72, "Balaji Traders", "delivered", -50),
        ("M-Sand", 40, 1200, "Local Supplier", "delivered", -45),
        ("Bricks 9x4x3", 10000, 8, "Chennai Bricks", "in_transit", -10),
        ("Steel TMT 8mm", 500, 68, "Balaji Traders", "delivered", -35),
    ]
    for i, (name, qty, rate, vendor, status, days_ago) in enumerate(po_items):
        await db.purchase_orders_v2.insert_one({
            "po_id": f"po_{uid()}", "po_number": f"PO-{2024+i:04d}",
            "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
            "material_name": name, "quantity": qty, "unit_price": rate,
            "total_amount": qty * rate, "vendor_name": vendor,
            "payment_type": "credit", "status": status,
            "created_at": iso(now + timedelta(days=days_ago)),
            "delivered_at": iso(now + timedelta(days=days_ago + 5)) if status == "delivered" else None,
        })

    # ========== STEP 13: INCOME (Payments tab + Accounts Board) ==========
    print("Creating income entries (30L total)...")
    income_entries = [
        ("Advance Payment", 600000, "bank_transfer", -85, "NEFT - Advance"),
        ("1st Installment - Foundation", 600000, "bank_transfer", -60, "NEFT Ref: FND001"),
        ("2nd Installment - Plinth", 500000, "cheque", -45, "Cheque No: 456789"),
        ("3rd Installment - GF Walls", 700000, "bank_transfer", -25, "NEFT Ref: GFW001"),
        ("4th Installment - GF Slab", 600000, "bank_transfer", -10, "NEFT Ref: GFS001"),
    ]
    for desc, amt, mode, days_ago, ref in income_entries:
        await db.income.insert_one({
            "income_id": f"inc_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2", "description": desc,
            "amount": amt, "payment_mode": mode, "category": "project_income",
            "payment_date": iso(now + timedelta(days=days_ago)),
            "reference_number": ref,
            "cheque_number": "456789" if "cheque" in mode else None,
            "bank_name": "HDFC Bank" if "cheque" in mode else "SBI",
            "remarks": desc,
            "recorded_by": ACCOUNTANT, "received_by": ACCOUNTANT,
            "received_date": iso(now + timedelta(days=days_ago)),
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 14: PAYMENT STAGES (Payments tab) ==========
    print("Creating payment stages...")
    total_val = 6000000  # project total value
    pay_stages = [
        ("Advance Collection", 600000, 10.0, "paid", -85, True),
        ("Foundation Complete", 600000, 10.0, "paid", -60, False),
        ("Plinth Complete", 500000, 8.33, "paid", -45, False),
        ("Ground Floor Complete", 700000, 11.67, "paid", -25, False),
        ("First Floor Slab", 600000, 10.0, "paid", -10, False),
        ("Second Floor Complete", 800000, 13.33, "pending", None, False),
        ("Plastering & Finishing", 600000, 10.0, "pending", None, False),
        ("Final Handover", 600000, 10.0, "pending", None, False),
    ]
    for name, amt, pct, status, days_ago, is_adv in pay_stages:
        await db.payment_stages.insert_one({
            "stage_id": f"ps_{uid()}", "project_id": PROJECT_ID,
            "stage_name": name, "amount": amt, "percentage": pct,
            "status": status,
            "amount_received": amt if status == "paid" else 0,
            "is_advance": is_adv,
            "due_date": (now + timedelta(days=days_ago)).strftime("%Y-%m-%d") if days_ago else (now + timedelta(days=30)).strftime("%Y-%m-%d"),
            "paid_date": iso(now + timedelta(days=days_ago)) if days_ago else None,
            "workflow_status": "approved",
            "created_at": iso(project_start),
        })

    # ========== STEP 15: ADDITIONAL COSTS (Additional tab) ==========
    print("Creating additional costs...")
    additional_items = [
        ("Extra waterproofing for terrace", 80000, 50000, 50000, "in_progress"),
        ("Compound wall extension", 70000, 0, 0, "pending"),
    ]
    for desc, est, actual, received, status in additional_items:
        await db.additional_costs.insert_one({
            "cost_id": f"ac_{uid()}", "project_id": PROJECT_ID,
            "description": desc, "estimated_amount": est,
            "actual_amount": actual, "income_received": received,
            "status": status, "workflow_status": "approved",
            "created_by": PM, "verified_by": PLANNING, "approved_by": GM,
            "created_at": iso(now - timedelta(days=15)),
        })

    # ========== STEP 16: DEDUCTIONS (Deduction tab) ==========
    print("Creating deductions...")
    deduction_items = [
        ("Late delivery penalty - Cement", 5000, "approved"),
        ("Quality issue - Sand batch", 8000, "approved"),
        ("Client discount - Festival offer", 10000, "pending"),
    ]
    for desc, amt, wf_status in deduction_items:
        await db.deductions.insert_one({
            "deduction_id": f"ded_{uid()}", "project_id": PROJECT_ID,
            "description": desc, "amount": amt,
            "status": "approved" if wf_status == "approved" else "pending",
            "workflow_status": wf_status,
            "remarks": desc,
            "created_by": ACCOUNTANT, "verified_by": PM,
            "approved_by": GM if wf_status == "approved" else None,
            "created_at": iso(now - timedelta(days=10)),
        })

    # ========== STEP 17: DESIGN FILES & SITE PLANS (Documents tab) ==========
    print("Creating design files and site plans...")
    design_files = [
        ("Architectural Floor Plan - GF", "floor_plan", "approved"),
        ("Structural Drawing - Foundation", "structural", "approved"),
        ("Elevation Design - Front", "elevation", "approved"),
        ("Electrical Layout - GF", "electrical", "pending"),
        ("Plumbing Layout - GF", "plumbing", "pending"),
    ]
    for name, category, status in design_files:
        await db.design_files.insert_one({
            "design_file_id": f"df_{uid()}", "project_id": PROJECT_ID,
            "name": name, "category": category,
            "status": status,
            "uploaded_by": ARCHITECT, "uploaded_by_name": "Deepa Architect",
            "file_url": "", "file_type": "pdf",
            "notes": f"{name} for Swathi 60L G+2",
            "created_at": iso(project_start + timedelta(days=10)),
        })

    site_plans = [
        ("Foundation Layout Plan", "layout", "Foundation"),
        ("Ground Floor Plan", "floor_plan", "Ground Floor"),
        ("First Floor Plan", "floor_plan", "First Floor"),
    ]
    for name, plan_type, floor in site_plans:
        await db.site_plans.insert_one({
            "plan_id": f"sp_{uid()}", "project_id": PROJECT_ID,
            "name": name, "type": plan_type, "floor": floor,
            "file_url": "", "status": "approved",
            "uploaded_by": ARCHITECT,
            "created_at": iso(project_start + timedelta(days=8)),
        })

    # ========== STEP 18: RECORDED EXPENSES (Accounts Board) ==========
    print("Creating recorded expenses...")
    expenses = [
        ("Cement Purchase - 200 bags", 70000, "material", "bank_transfer", -55),
        ("Steel TMT 12mm - 2000kg", 144000, "material", "bank_transfer", -48),
        ("Mason Labour - Foundation", 180000, "labour", "bank_transfer", -60),
        ("Sand & Aggregate", 168000, "material", "bank_transfer", -40),
        ("Plumbing Underground", 60000, "contractor", "cheque", -35),
        ("Electrical Conduit GF", 80000, "contractor", "bank_transfer", -20),
        ("Centering Material Hire", 45000, "material", "cash", -28),
        ("Water Tanker x10", 15000, "site_expense", "cash", -22),
        ("Steel TMT 8mm - 500kg", 34000, "material", "bank_transfer", -33),
        ("Plinth Beam Concrete", 25000, "material", "bank_transfer", -42),
    ]
    for desc, amt, cat, mode, days_ago in expenses:
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "description": desc, "amount": amt, "category": cat,
            "payment_mode": mode, "payment_method": mode,
            "recorded_by": ACCOUNTANT,
            "date": iso(now + timedelta(days=days_ago)),
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 19: PETTY CASH (SE + Accounts) ==========
    print("Creating petty cash entries...")
    petty_entries = [
        ("Site cleaning labour", 2500, "pm_approved", -30),
        ("Water tanker for curing", 1500, "acknowledged", -20),
        ("Transportation of rods", 4000, "acknowledged", -15),
        ("Nails and binding wire", 800, "requested", -1),
        ("Auto charges for site inspection", 350, "acknowledged", -8),
        ("Tea & snacks for workers", 500, "pm_approved", -5),
    ]
    for desc, amt, status, days_ago in petty_entries:
        await db.petty_cash_v2.insert_one({
            "petty_cash_id": f"pc_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "description": desc, "amount": amt, "category": "site_expense",
            "status": status, "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "pm_approved_by": PM if status != "requested" else None,
            "accountant_settled_by": ACCOUNTANT if status == "acknowledged" else None,
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 20: PETROL ALLOWANCE ==========
    print("Creating petrol allowance...")
    for days_ago, amt, km, status in [(5, 500, 45, "approved"), (3, 350, 30, "approved"), (1, 400, 35, "requested")]:
        await db.petrol_allowance.insert_one({
            "allowance_id": f"pa_{uid()}", "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "date": iso(now - timedelta(days=days_ago)), "amount": amt, "km": km,
            "status": status, "approved_by": ACCOUNTANT if status == "approved" else None,
            "created_at": iso(now - timedelta(days=days_ago)),
        })

    # ========== STEP 21: SE ATTENDANCE ==========
    print("Creating SE attendance...")
    for days_ago in range(10):
        d = now - timedelta(days=days_ago)
        if d.weekday() < 6:
            await db.se_attendance.insert_one({
                "user_id": SE, "date": d.strftime("%Y-%m-%d"),
                "entries": [{
                    "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
                    "login_time": "08:30", "logout_time": "17:30" if days_ago > 0 else None,
                    "login_lat": 12.9815, "login_lng": 80.2176,
                }],
                "total_hours": 9.0 if days_ago > 0 else 0,
                "status": "full_day" if days_ago > 0 else "active",
                "created_at": iso(d),
            })

    # ========== STEP 22: CURING VIDEOS ==========
    print("Creating curing video records...")
    for days_ago in [7, 6, 5, 4, 3, 2, 1]:
        await db.curing_video_records.insert_one({
            "record_id": f"cv_{uid()}", "user_id": SE,
            "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
            "site": "First Floor Slab", "date": (now - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
            "whatsapp_sent": True, "notes": "Curing done properly",
            "created_at": iso(now - timedelta(days=days_ago)),
        })

    # ========== STEP 23: LABOUR ATTENDANCE ==========
    print("Creating labour attendance...")
    labour_types = ["Mason", "Helper", "Centering", "Bar Bender"]
    for days_ago in range(7):
        d = now - timedelta(days=days_ago)
        if d.weekday() < 6:
            await db.labour_attendance.insert_one({
                "attendance_id": f"la_{uid()}", "project_id": PROJECT_ID,
                "date": d.strftime("%Y-%m-%d"),
                "entries": [
                    {"type": lt, "count": 4 if lt == "Mason" else 6 if lt == "Helper" else 2, "rate": 900 if lt == "Mason" else 600 if lt == "Helper" else 1000}
                    for lt in labour_types
                ],
                "total_cost": 4*900 + 6*600 + 2*1000 + 2*1000,
                "recorded_by": SE, "created_at": iso(d),
            })

    # ========== STEP 24: MATERIAL INVENTORY ==========
    print("Creating material inventory...")
    inventory_items = [
        ("OPC 53 Grade Cement", "bags", 200, 120, 80),
        ("Steel TMT 12mm", "kg", 2000, 1500, 500),
        ("M-Sand (Fine)", "units", 40, 30, 10),
        ("Bricks 9x4x3", "nos", 10000, 7000, 3000),
        ("20mm Aggregate", "units", 30, 25, 5),
        ("River Sand", "units", 20, 18, 2),
    ]
    for name, unit, received, used, stock in inventory_items:
        await db.material_inventory.insert_one({
            "inventory_id": f"inv_{uid()}", "project_id": PROJECT_ID,
            "material_name": name, "unit": unit,
            "total_received": received, "total_used": used,
            "current_stock": stock,
            "last_updated": iso(now - timedelta(days=1)),
            "created_at": iso(project_start + timedelta(days=10)),
        })

    # ========== STEP 25: CREDIT LEDGER ==========
    print("Creating credit ledger...")
    credit_items = [
        ("Balaji Traders", "OPC 53 Grade Cement", 70000, "paid", -55, -27),
        ("Balaji Traders", "Steel TMT 12mm", 144000, "overdue", -48, None),
        ("Local Supplier", "M-Sand (Fine)", 48000, "paid", -45, -20),
        ("Balaji Traders", "Steel TMT 8mm", 34000, "active", -33, None),
    ]
    for vendor, mat, amt, status, created_days, paid_days in credit_items:
        await db.credit_ledger.insert_one({
            "ledger_id": f"cl_{uid()}", "vendor_name": vendor,
            "project_id": PROJECT_ID, "material": mat,
            "amount": amt, "credit_days": 30, "status": status,
            "due_date": iso(now + timedelta(days=created_days + 30)),
            "paid_date": iso(now + timedelta(days=paid_days)) if paid_days else None,
            "created_at": iso(now + timedelta(days=created_days)),
        })

    # ========== STEP 26: TRANSIT TRACKING ==========
    await db.transit_tracking.insert_one({
        "tracking_id": f"tt_{uid()}", "project_id": PROJECT_ID,
        "material_name": "Bricks 9x4x3", "quantity": 10000,
        "vendor_name": "Chennai Bricks", "status": "in_transit",
        "expected_delivery": iso(now + timedelta(days=2)),
        "dispatched_at": iso(now - timedelta(days=1)),
        "created_at": iso(now - timedelta(days=1)),
    })

    # ========== STEP 27: DAILY PROGRESS ==========
    print("Creating daily progress...")
    for days_ago in [5, 4, 3, 2, 1]:
        await db.daily_progress.insert_one({
            "progress_id": f"dp_{uid()}", "project_id": PROJECT_ID,
            "date": (now - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
            "stage": "First Floor Walls", "progress": 40 + (5-days_ago)*8,
            "notes": f"Progress: FF walls at {40 + (5-days_ago)*8}%",
            "reported_by": SE, "created_at": iso(now - timedelta(days=days_ago)),
        })

    # ========== STEP 28: LABOUR WORK ORDERS (for PM/SE boards) ==========
    print("Creating labour work orders...")
    lwo_data = [
        ("Selvam & Co", "Mason", "active", 250000, 180000),
        ("Kumar Electricals", "Electrical", "active", 80000, 80000),
        ("Rajesh Plumbing", "Plumbing", "active", 105000, 60000),
    ]
    for cont, cat, status, total, released in lwo_data:
        await db.labour_work_orders.insert_one({
            "lwo_id": f"lwo_{uid()}", "project_id": PROJECT_ID,
            "contractor_name": cont, "category": cat,
            "status": status, "total_amount": total,
            "amount_released": released,
            "created_by": SE, "created_at": iso(project_start + timedelta(days=10)),
        })

    # ========== STEP 29: CONTRACTORS ==========
    existing = await db.contractors.count_documents({})
    if existing == 0:
        print("Creating contractors...")
        contractors = [
            ("Selvam & Co", "9876001122", "Mason Work", "cont_001"),
            ("Kumar Electricals", "9876002233", "Electrical", "cont_002"),
            ("Rajesh Plumbing", "9876003344", "Plumbing", "cont_003"),
            ("Ganesh Centering", "9876004455", "Centering", "cont_004"),
            ("Babu Painting", "9876005566", "Painting", "cont_005"),
        ]
        for name, phone, cat, cid in contractors:
            await db.contractors.insert_one({
                "contractor_id": cid, "name": name, "phone": phone,
                "category": cat, "status": "active",
                "created_at": iso(project_start),
            })

    # ========== STEP 30: CHEQUES (Accounts Board) ==========
    print("Creating cheques...")
    cheques = [
        ("456789", "HDFC Bank", 500000, "cleared", "Plinth installment"),
        ("456790", "ICICI Bank", 200000, "pending", "Advance partial"),
    ]
    for num, bank, amt, status, desc in cheques:
        await db.cheques.insert_one({
            "cheque_id": f"chq_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "cheque_number": num, "bank_name": bank,
            "amount": amt, "status": status,
            "description": desc,
            "recorded_by": ACCOUNTANT,
            "date": iso(now - timedelta(days=40)),
            "created_at": iso(now - timedelta(days=40)),
        })

    # ========== STEP 31: VENDOR ASSIGNMENTS ==========
    print("Creating vendor assignments...")
    await db.project_vendor_assignments.insert_one({
        "assignment_id": f"va_{uid()}", "project_id": PROJECT_ID,
        "vendor_id": "user_vendor001", "vendor_name": "Balaji Vendor",
        "category": "Material Supply",
        "assigned_by": PROCUREMENT, "status": "active",
        "created_at": iso(project_start + timedelta(days=5)),
    })

    # ========== STEP 32: DAILY LABOUR REPORTS ==========
    print("Creating daily labour reports...")
    for days_ago in [3, 2, 1]:
        d = now - timedelta(days=days_ago)
        await db.daily_labour_reports.insert_one({
            "report_id": f"dlr_{uid()}", "project_id": PROJECT_ID,
            "date": d.strftime("%Y-%m-%d"),
            "work_order_id": None,
            "entries": [
                {"type": "Mason", "count": 4, "rate": 900},
                {"type": "Helper", "count": 6, "rate": 600},
                {"type": "Bar Bender", "count": 2, "rate": 1000},
            ],
            "total_workers": 12, "total_cost": 4*900 + 6*600 + 2*1000,
            "notes": "FF walls work ongoing",
            "reported_by": SE, "reported_by_name": "Ramesh Kumar",
            "status": "submitted" if days_ago > 1 else "draft",
            "created_at": iso(d),
        })

    # ========== STEP 33: NOTIFICATIONS ==========
    print("Creating notifications...")
    notifs = [
        (SE, "Bricks shipment dispatched - expected in 2 days", -1),
        (SE, "Petty cash request approved by PM", -2),
        (SE, "New material request approved by planning", -3),
        (PM, "Material request pending approval: Cement 200 bags", -5),
        (PM, "Work order payment request from Selvam & Co", -2),
        (PM, "Daily labour report submitted by Ramesh Kumar", -1),
        (ACCOUNTANT, "New petrol allowance request from Ramesh Kumar", -1),
        (ACCOUNTANT, "Income recorded: 4th Installment Rs.6,00,000", -10),
        (ACCOUNTANT, "Credit overdue: Balaji Traders - Steel TMT", -3),
        (PLANNING, "Material request from site: Electrical Wire", -2),
        (PLANNING, "New scope item approved by GM", -5),
        (PROCUREMENT, "Planning approved: OPC Cement 200 bags", -3),
        (PROCUREMENT, "Vendor pricing submitted for Steel TMT", -4),
        (ADMIN, "Project Swathi 60L G+2 - First Floor in progress", -1),
        (ADMIN, "New lead: Anitha B - Rs.70L - G+2", -2),
    ]
    for user_id, msg, days_ago in notifs:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uid()}", "user_id": user_id,
            "message": msg, "read": days_ago < -3,
            "project_id": PROJECT_ID,
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 34: BOQ ITEMS (for Planning Board) ==========
    print("Creating BOQ items...")
    boq_data = [
        ("Cement OPC 53", "bags", 800, 350),
        ("Steel TMT 12mm", "kg", 5000, 72),
        ("M-Sand Fine", "units", 100, 1200),
        ("Bricks 9x4x3", "nos", 20000, 8),
        ("River Sand", "units", 60, 2800),
        ("20mm Aggregate", "units", 80, 1500),
    ]
    for name, unit, qty, rate in boq_data:
        await db.boq_items.insert_one({
            "boq_id": f"boq_{uid()}", "project_id": PROJECT_ID,
            "item_name": name, "unit": unit,
            "quantity": qty, "unit_rate": rate,
            "total_cost": qty * rate,
            "created_at": iso(project_start + timedelta(days=3)),
        })

    # ========== SUMMARY ==========
    scope_total = sum(q*r for _, q, _, r in scope_items_data)
    add_total = sum(e for _, e, _, _, _ in additional_items)

    print(f"\nSEED COMPLETE!")
    print(f"  Project: Swathi 60L G+2 ({PROJECT_ID})")
    print(f"  RE Project: {RE_PROJECT_ID} ({RE_NUMBER})")
    print(f"  Scope Total: {scope_total:,.0f}")
    print(f"  Additional: {add_total:,.0f}")
    print(f"  Income (30L): 3,000,000")
    print(f"  Stages: 12 (4 completed, 1 in progress)")
    print(f"  Work Orders: 3 contractors")
    print(f"  Material Requests: 10")
    print(f"  Labour Expenses: 8")
    print(f"  Scope Items: 13 (Final Estimate)")
    print(f"  Additional Costs: 2")
    print(f"  Deductions: 3")
    print(f"  Design Files: 5, Site Plans: 3")
    print(f"  CRM Leads: 9 (1 converted + 8 in pipeline)")
    print(f"  Inventory Items: 6")
    print(f"  BOQ Items: 6")

    client.close()

asyncio.run(main())
