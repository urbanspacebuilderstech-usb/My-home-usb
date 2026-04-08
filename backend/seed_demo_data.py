"""
Comprehensive seed script: Delete all project data and create realistic demo data
for "Swathi 60L G+2" project at 50% completion with 30L paid.
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
    print("🗑️  Cleaning all project-related data...")
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
    project_start = now - timedelta(days=90)  # Started 3 months ago
    today = now

    # Key users
    SE = "user_engineer001"
    PM = "user_pm001"
    PLANNING = "user_planning001"
    PROCUREMENT = "user_procurement001"
    ACCOUNTANT = "user_accountant001"
    SALES = "user_sales001"
    CRE = "user_cre001"
    PRESALES = "user_presales001"
    MARKETING = "user_marketing001"
    ADMIN = "user_f65b2d2e6952"
    SR_SE = "user_20942172399b"

    PROJECT_ID = f"proj_{uid()}"
    PROJECT_CODE = "USB-SW001"

    # ========== STEP 2: CREATE LEAD (CRM Pipeline) ==========
    print("📋 Creating CRM lead...")
    lead_id = f"lead_{uid()}"

    # Get the "Project Onboarded" stage
    onboarded_stage = await db.lead_stages.find_one({"name": {"$regex": "project.*onboard", "$options": "i"}}, {"_id": 0})
    stage_id = onboarded_stage["stage_id"] if onboarded_stage else "stg_project_onboarded"

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
        "assigned_to": SALES,
        "created_by": PRESALES,
        "project_created": True,
        "project_id": PROJECT_ID,
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

    # Also create a few leads in various stages for pipeline view
    stages = await db.lead_stages.find({}, {"_id": 0}).to_list(50)
    stage_map = {s["name"]: s["stage_id"] for s in stages}

    extra_leads = [
        {"name": "Karthik R", "phone": "9988776655", "source": "Referral", "budget": "45L", "stage": "New Lead", "sqft": 1500},
        {"name": "Priya M", "phone": "9877665544", "source": "JustDial", "budget": "80L", "stage": "Follow-up", "sqft": 3000},
        {"name": "Mohan S", "phone": "9766554433", "source": "Instagram", "budget": "35L", "stage": "Site Visit (Client Land)", "sqft": 1200},
    ]
    for el in extra_leads:
        stg_id = None
        for sn, sid in stage_map.items():
            if el["stage"].lower() in sn.lower():
                stg_id = sid
                break
        if not stg_id:
            stg_id = stages[0]["stage_id"] if stages else "stg_new"
        await db.leads.insert_one({
            "lead_id": f"lead_{uid()}", "name": el["name"], "phone": el["phone"],
            "source": el["source"], "budget": el["budget"], "sqft": el["sqft"],
            "building_type": "residential", "location": "Chennai",
            "stage_id": stg_id, "assigned_to": SALES, "created_by": PRESALES,
            "project_created": False, "created_at": iso(now - timedelta(days=10)),
            "updated_at": iso(now - timedelta(days=2)),
        })

    # ========== STEP 3: CREATE PROJECT ==========
    print("🏗️  Creating project: Swathi 60L G+2...")
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
        "additional_cost": 0,
        "income_project": 3000000,
        "income_additional": 0,
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
        "created_at": iso(project_start - timedelta(days=5)),
        "updated_at": iso(now),
    }
    await db.projects.insert_one(project)

    # ========== STEP 4: SITE ENGINEER ASSIGNMENT ==========
    await db.site_engineer_assignments.insert_one({
        "assignment_id": f"assign_{uid()}", "project_id": PROJECT_ID,
        "user_id": SE, "role": "site_engineer",
        "assigned_by": PM, "created_at": iso(project_start),
    })

    # ========== STEP 5: PROJECT STAGES (50% done) ==========
    print("📊 Creating project stages...")
    stage_list = [
        ("Foundation", 100, True), ("Plinth Beam", 100, True),
        ("Ground Floor Walls", 100, True), ("Ground Floor Slab", 100, True),
        ("First Floor Walls", 70, False), ("First Floor Slab", 0, False),
        ("Second Floor Walls", 0, False), ("Second Floor Slab", 0, False),
        ("Plastering", 0, False), ("Electrical & Plumbing", 0, False),
        ("Flooring", 0, False), ("Painting", 0, False),
    ]
    for idx, (name, pct, done) in enumerate(stage_list):
        await db.project_stages.insert_one({
            "stage_id": f"stg_{uid()}", "project_id": PROJECT_ID,
            "name": name, "order": idx + 1, "progress": pct,
            "status": "completed" if done else ("in_progress" if pct > 0 else "pending"),
            "started_at": iso(project_start + timedelta(days=idx * 12)) if pct > 0 else None,
            "completed_at": iso(project_start + timedelta(days=(idx + 1) * 12)) if done else None,
            "created_at": iso(project_start),
        })

    # ========== STEP 6: PROJECT MATERIALS (Planning) ==========
    print("📦 Creating project materials...")
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

    # ========== STEP 7: MATERIAL REQUESTS (Various statuses) ==========
    print("📝 Creating material requests...")
    mat_requests = [
        ("OPC 53 Grade Cement", "UltraTech", "bags", 200, "received_completed", -60),
        ("Steel TMT 12mm", "Tata Tiscon", "kg", 2000, "received_completed", -50),
        ("M-Sand (Fine)", "Local", "units", 40, "received_completed", -45),
        ("Bricks 9x4x3", "Local", "nos", 10000, "in_transit", -10),
        ("OPC 53 Grade Cement", "UltraTech", "bags", 200, "procurement_approved", -5),
        ("Electrical Wire 1.5sqmm", "Havells", "metres", 300, "planning_approved", -2),
        ("CPVC Pipes 3/4 inch", "Astral", "metres", 200, "requested", -1),
    ]
    for name, brand, unit, qty, status, days_ago in mat_requests:
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        await db.material_requests.insert_one({
            "request_id": req_id, "order_id": order_id,
            "project_id": PROJECT_ID, "material_name": name,
            "brand": brand, "unit": unit, "quantity": qty,
            "status": status, "is_approved_material": True,
            "site_engineer_id": SE, "site_engineer_name": "Ramesh Kumar",
            "remarks": f"Required for ongoing construction",
            "created_at": iso(now + timedelta(days=days_ago)),
            "updated_at": iso(now + timedelta(days=days_ago + 1)),
        })
        # Add procurement pricing for completed/in-transit ones
        if status in ("received_completed", "in_transit", "procurement_approved"):
            await db.procurement_pricing.insert_one({
                "pricing_id": f"pp_{uid()}", "request_id": req_id,
                "vendor_id": f"vendor_{uid()[:6]}", "vendor_name": "Balaji Traders",
                "unit_price": 350 if "Cement" in name else 72 if "Steel" in name else 1200,
                "total_price": qty * (350 if "Cement" in name else 72 if "Steel" in name else 1200),
                "payment_type": "credit", "credit_period_days": 30,
                "status": "approved", "created_at": iso(now + timedelta(days=days_ago + 1)),
            })

    # ========== STEP 8: PURCHASE ORDERS ==========
    print("🧾 Creating purchase orders...")
    for i, (name, qty, rate) in enumerate([("OPC 53 Grade Cement", 200, 350), ("Steel TMT 12mm", 2000, 72), ("M-Sand", 40, 1200)]):
        await db.purchase_orders_v2.insert_one({
            "po_id": f"po_{uid()}", "po_number": f"PO-{2024+i:04d}",
            "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
            "material_name": name, "quantity": qty, "unit_price": rate,
            "total_amount": qty * rate, "vendor_name": "Balaji Traders",
            "payment_type": "credit", "status": "delivered",
            "created_at": iso(now - timedelta(days=50-i*10)),
            "delivered_at": iso(now - timedelta(days=40-i*10)),
        })

    # ========== STEP 9: WORK ORDERS (Contractors) ==========
    print("👷 Creating work orders...")
    contractors_data = [
        ("Selvam & Co", "Mason Work", [
            ("Foundation Mason Work", 180000, 180000, "completed"),
            ("Plinth Mason Work", 120000, 120000, "completed"),
            ("GF Walls & Slab", 250000, 200000, "in_progress"),
        ]),
        ("Kumar Electricals", "Electrical", [
            ("GF Electrical Conduit", 80000, 80000, "completed"),
            ("FF Electrical Conduit", 80000, 0, "pending"),
        ]),
        ("Rajesh Plumbing", "Plumbing", [
            ("Underground Plumbing", 60000, 60000, "completed"),
            ("GF Plumbing", 45000, 30000, "in_progress"),
        ]),
    ]
    for cont_name, category, stages in contractors_data:
        wo_id = f"wo_{uid()}"
        wo_stages = []
        for s_name, total, released, status in stages:
            stage_id = f"wos_{uid()}"
            payments = []
            if released > 0:
                if released == total:
                    payments.append({
                        "payment_id": f"pay_{uid()}", "amount": released,
                        "status": "approved", "requested_at": iso(now - timedelta(days=30)),
                        "approved_at": iso(now - timedelta(days=28)),
                    })
                else:
                    payments.append({
                        "payment_id": f"pay_{uid()}", "amount": released * 0.6,
                        "status": "approved", "requested_at": iso(now - timedelta(days=20)),
                        "approved_at": iso(now - timedelta(days=18)),
                    })
                    payments.append({
                        "payment_id": f"pay_{uid()}", "amount": released * 0.4,
                        "status": "approved", "requested_at": iso(now - timedelta(days=5)),
                        "approved_at": iso(now - timedelta(days=3)),
                    })
            wo_stages.append({
                "stage_id": stage_id, "name": s_name,
                "amount": total, "amount_released": released,
                "status": status, "payment_requests": payments,
                "is_finished": status == "completed",
            })
        await db.project_work_orders.insert_one({
            "wo_id": wo_id, "project_id": PROJECT_ID,
            "contractor_name": cont_name, "category": category,
            "stages": wo_stages, "total_amount": sum(s["amount"] for s in wo_stages),
            "total_released": sum(s["amount_released"] for s in wo_stages),
            "status": "active", "created_by": SE,
            "created_at": iso(project_start + timedelta(days=5)),
            "updated_at": iso(now),
        })

    # ========== STEP 10: INCOME (30L paid = 5 installments) ==========
    print("💰 Creating income entries (30L total)...")
    income_entries = [
        ("Advance Payment", 600000, "bank_transfer", -85),
        ("1st Installment - Foundation", 600000, "bank_transfer", -60),
        ("2nd Installment - Plinth", 500000, "cheque", -45),
        ("3rd Installment - GF Walls", 700000, "bank_transfer", -25),
        ("4th Installment - GF Slab", 600000, "bank_transfer", -10),
    ]
    for desc, amt, mode, days_ago in income_entries:
        await db.income.insert_one({
            "income_id": f"inc_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2", "description": desc,
            "amount": amt, "payment_mode": mode, "category": "project_income",
            "received_date": iso(now + timedelta(days=days_ago)),
            "received_by": ACCOUNTANT, "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 11: PETTY CASH ==========
    print("💵 Creating petty cash entries...")
    petty_entries = [
        ("Site cleaning labour", 2500, "pm_approved", -30, PROJECT_ID),
        ("Water tanker for curing", 1500, "acknowledged", -20, PROJECT_ID),
        ("Transportation of rods", 4000, "acknowledged", -15, PROJECT_ID),
        ("Nails and binding wire", 800, "requested", -1, PROJECT_ID),
    ]
    for desc, amt, status, days_ago, pid in petty_entries:
        await db.petty_cash_v2.insert_one({
            "petty_cash_id": f"pc_{uid()}", "project_id": pid,
            "project_name": "Swathi 60L G+2",
            "description": desc, "amount": amt, "category": "site_expense",
            "status": status, "requested_by": SE,
            "requested_by_name": "Ramesh Kumar",
            "pm_approved_by": PM if status != "requested" else None,
            "accountant_settled_by": ACCOUNTANT if status == "acknowledged" else None,
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 12: PETROL ALLOWANCE ==========
    print("⛽ Creating petrol allowance...")
    await db.petrol_allowance.insert_one({
        "allowance_id": f"pa_{uid()}", "requested_by": SE,
        "requested_by_name": "Ramesh Kumar",
        "date": iso(now - timedelta(days=3)), "amount": 500, "km": 45,
        "status": "approved", "approved_by": ACCOUNTANT,
        "created_at": iso(now - timedelta(days=3)),
    })
    await db.petrol_allowance.insert_one({
        "allowance_id": f"pa_{uid()}", "requested_by": SE,
        "requested_by_name": "Ramesh Kumar",
        "date": iso(now - timedelta(days=1)), "amount": 350, "km": 30,
        "status": "requested",
        "created_at": iso(now - timedelta(days=1)),
    })

    # ========== STEP 13: SE ATTENDANCE ==========
    print("📍 Creating SE attendance...")
    for days_ago in range(7):
        d = now - timedelta(days=days_ago)
        if d.weekday() < 6:  # Skip Sunday
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

    # ========== STEP 14: CURING VIDEOS ==========
    print("🎥 Creating curing video records...")
    for days_ago in [5, 4, 3, 2, 1]:
        await db.curing_video_records.insert_one({
            "record_id": f"cv_{uid()}", "user_id": SE,
            "project_id": PROJECT_ID, "project_name": "Swathi 60L G+2",
            "site": "First Floor Slab", "date": (now - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
            "whatsapp_sent": True, "notes": "Curing done properly",
            "created_at": iso(now - timedelta(days=days_ago)),
        })

    # ========== STEP 15: LABOUR ATTENDANCE ==========
    print("👷 Creating labour attendance...")
    labour_types = ["Mason", "Helper", "Centering", "Bar Bender"]
    for days_ago in range(5):
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

    # ========== STEP 16: RECORDED EXPENSES ==========
    print("📊 Creating recorded expenses...")
    expenses = [
        ("Cement Purchase - 200 bags", 70000, "material", -55),
        ("Steel TMT - 2000kg", 144000, "material", -48),
        ("Mason Labour - Foundation", 180000, "labour", -60),
        ("Sand & Aggregate", 168000, "material", -40),
        ("Plumbing Underground", 60000, "contractor", -35),
        ("Electrical Conduit GF", 80000, "contractor", -20),
    ]
    for desc, amt, cat, days_ago in expenses:
        await db.recorded_expenses.insert_one({
            "expense_id": f"exp_{uid()}", "project_id": PROJECT_ID,
            "project_name": "Swathi 60L G+2",
            "description": desc, "amount": amt, "category": cat,
            "payment_mode": "bank_transfer", "recorded_by": ACCOUNTANT,
            "date": iso(now + timedelta(days=days_ago)),
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    # ========== STEP 17: CREDIT LEDGER ==========
    print("📒 Creating credit ledger...")
    await db.credit_ledger.insert_one({
        "ledger_id": f"cl_{uid()}", "vendor_name": "Balaji Traders",
        "project_id": PROJECT_ID, "material": "OPC 53 Grade Cement",
        "amount": 70000, "credit_days": 30, "status": "paid",
        "due_date": iso(now - timedelta(days=25)),
        "paid_date": iso(now - timedelta(days=27)),
        "created_at": iso(now - timedelta(days=55)),
    })
    await db.credit_ledger.insert_one({
        "ledger_id": f"cl_{uid()}", "vendor_name": "Balaji Traders",
        "project_id": PROJECT_ID, "material": "Steel TMT 12mm",
        "amount": 144000, "credit_days": 30, "status": "overdue",
        "due_date": iso(now - timedelta(days=5)),
        "created_at": iso(now - timedelta(days=35)),
    })

    # ========== STEP 18: TRANSIT TRACKING ==========
    await db.transit_tracking.insert_one({
        "tracking_id": f"tt_{uid()}", "project_id": PROJECT_ID,
        "material_name": "Bricks 9x4x3", "quantity": 10000,
        "vendor_name": "Chennai Bricks", "status": "in_transit",
        "expected_delivery": iso(now + timedelta(days=2)),
        "dispatched_at": iso(now - timedelta(days=1)),
        "created_at": iso(now - timedelta(days=1)),
    })

    # ========== STEP 19: DAILY PROGRESS ==========
    print("📈 Creating daily progress...")
    for days_ago in [3, 2, 1]:
        await db.daily_progress.insert_one({
            "progress_id": f"dp_{uid()}", "project_id": PROJECT_ID,
            "date": (now - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
            "stage": "First Floor Walls", "progress": 50 + (3-days_ago)*10,
            "notes": "Work progressing well",
            "reported_by": SE, "created_at": iso(now - timedelta(days=days_ago)),
        })

    # ========== STEP 20: PAYMENT STAGES ==========
    print("💳 Creating payment stages...")
    pay_stages = [
        ("Advance", 600000, "paid", -85),
        ("Foundation Complete", 600000, "paid", -60),
        ("Plinth Complete", 500000, "paid", -45),
        ("Ground Floor Complete", 700000, "paid", -25),
        ("First Floor Slab", 600000, "paid", -10),
        ("Second Floor Complete", 800000, "pending", None),
        ("Plastering", 600000, "pending", None),
        ("Final Handover", 600000, "pending", None),
    ]
    for name, amt, status, days_ago in pay_stages:
        await db.payment_stages.insert_one({
            "stage_id": f"ps_{uid()}", "project_id": PROJECT_ID,
            "name": name, "amount": amt, "status": status,
            "paid_date": iso(now + timedelta(days=days_ago)) if days_ago else None,
            "created_at": iso(project_start),
        })

    # ========== STEP 21: NOTIFICATIONS ==========
    print("🔔 Creating notifications...")
    notifs = [
        (SE, "Bricks shipment dispatched - expected in 2 days", -1),
        (SE, "Petty cash request approved by PM", -2),
        (PM, "Material request pending approval: Cement 200 bags", -5),
        (ACCOUNTANT, "New petrol allowance request from Ramesh Kumar", -1),
        (PLANNING, "Material request from site: Electrical Wire", -2),
        (PROCUREMENT, "Planning approved: OPC Cement 200 bags - Ready for procurement", -3),
    ]
    for user_id, msg, days_ago in notifs:
        await db.notifications.insert_one({
            "notification_id": f"notif_{uid()}", "user_id": user_id,
            "message": msg, "read": days_ago < -2,
            "created_at": iso(now + timedelta(days=days_ago)),
        })

    print("\n✅ SEED COMPLETE!")
    print(f"   Project: Swathi 60L G+2 ({PROJECT_ID})")
    print(f"   Total Value: ₹60,00,000")
    print(f"   Amount Paid: ₹30,00,000 (50%)")
    print(f"   Completion: ~50% (First Floor in progress)")
    print(f"   Stages: 4/12 completed")
    print(f"   Contractors: 3 active work orders")
    print(f"   Material Requests: 7 (various statuses)")
    print(f"   CRM Leads: 4 (1 converted + 3 in pipeline)")

    client.close()

asyncio.run(main())
