"""
Seed comprehensive dummy data for the Procurement Board - Vinoth Kumar project.
Uses the correct database (construction_crm) and existing user/project data.
"""
import asyncio
import os
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

now = datetime.now(timezone.utc)
now_iso = now.isoformat()

# Existing user IDs from the real database
SE_ID = "user_engineer001"
SE_NAME = "Ramesh Kumar"
PROC_ID = "user_procurement001"
PROC_NAME = "Meera Nair"
PLAN_ID = "user_planning001"
PLAN_NAME = "Suresh Iyer"
ACCT_ID = "user_accountant001"
ACCT_NAME = "Priya Sharma"

PROJECT_ID = "proj_12f23331b542"
PROJECT_NAME = "Mr. Vinoth Kumar Babu"


def uid():
    return uuid.uuid4().hex[:12]


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"Connected to DB: {DB_NAME}")
    print(f"Project: {PROJECT_ID} - {PROJECT_NAME}")

    # ===== 1. SEED VENDOR MASTER =====
    vendors_to_create = [
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Ambuja Cement Dealer",
            "category": "material",
            "contact_person": "Krishnan",
            "phone": "9876543215",
            "email": "sales@ambujacements.in",
            "address": "T. Nagar, Chennai",
            "bank_name": "HDFC Bank",
            "bank_account_number": "50100234567890",
            "ifsc_code": "HDFC0001234",
            "payment_method": "bank",
            "gst_number": "33AABCA1234M1ZA",
            "pan_number": "AABCA1234M",
            "materials_supplied": ["OPC Cement", "PPC Cement", "Ready Mix"],
            "payment_terms": "credit",
            "credit_limit": 500000,
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=40)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Chennai Steel Corp",
            "category": "material",
            "contact_person": "Balaji",
            "phone": "9876543214",
            "email": "orders@chennaisteel.com",
            "address": "Ambattur, Chennai",
            "bank_name": "SBI",
            "bank_account_number": "38765432100",
            "ifsc_code": "SBIN0001234",
            "payment_method": "bank",
            "gst_number": "33AABCS5678N1ZB",
            "pan_number": "AABCS5678N",
            "materials_supplied": ["TMT Steel", "Binding Wire", "Steel Rod"],
            "payment_terms": "advance",
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=38)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Spark Electricals",
            "category": "material",
            "contact_person": "Ganesh",
            "phone": "9876543212",
            "email": "ganesh@sparkelectricals.in",
            "address": "Porur, Chennai",
            "bank_name": "ICICI Bank",
            "bank_account_number": "1234567890",
            "ifsc_code": "ICIC0001234",
            "payment_method": "bank",
            "gst_number": "33AABCE9012P1ZC",
            "materials_supplied": ["Electrical Wire", "MCB", "Switch Board", "Panel Board"],
            "payment_terms": "full",
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=35)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "AquaFlow Systems",
            "category": "material",
            "contact_person": "Rajan",
            "phone": "9876543213",
            "email": "rajan@aquaflow.com",
            "address": "Vadapalani, Chennai",
            "bank_name": "Indian Bank",
            "bank_account_number": "6789012345",
            "ifsc_code": "IDIB0001234",
            "payment_method": "bank",
            "materials_supplied": ["PVC Pipe", "CPVC Pipe", "Fittings", "Valves"],
            "payment_terms": "advance",
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=33)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Royal Tiles Gallery",
            "category": "material",
            "contact_person": "Senthil",
            "phone": "9876543216",
            "email": "senthil@royaltiles.in",
            "address": "Anna Nagar, Chennai",
            "bank_name": "Axis Bank",
            "bank_account_number": "917020012345678",
            "ifsc_code": "UTIB0001234",
            "payment_method": "bank",
            "materials_supplied": ["Floor Tiles", "Wall Tiles", "Granite Slab"],
            "payment_terms": "credit",
            "credit_limit": 300000,
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=30)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Vadapalani Sand Supplier",
            "category": "material",
            "contact_person": "Murugan",
            "phone": "9876543217",
            "address": "Kundrathur, Chennai",
            "bank_name": "Indian Overseas Bank",
            "payment_method": "cash",
            "materials_supplied": ["M-Sand", "P-Sand", "Blue Metal", "Gravel"],
            "payment_terms": "advance",
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=28)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Sree Lakshmi Hardware",
            "category": "material",
            "contact_person": "Ganesh Kumar",
            "phone": "9867543210",
            "email": "ganesh@sreelakshmi.com",
            "address": "Porur, Chennai",
            "bank_name": "Indian Bank",
            "bank_account_number": "6789012345",
            "ifsc_code": "IDIB0004567",
            "payment_method": "bank",
            "materials_supplied": ["Plywood", "Shuttering Material", "Nails", "Bolts"],
            "payment_terms": "full",
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=25)).isoformat(),
            "updated_at": now_iso,
        },
        {
            "vendor_id": f"vm_{uid()}",
            "name": "Balaji Construction",
            "category": "labour",
            "contact_person": "Balaji",
            "phone": "9876543210",
            "address": "Valasaravakkam, Chennai",
            "labour_category": "civil",
            "rate_type": "per_day",
            "location_coverage": "Chennai",
            "payment_terms": "credit",
            "credit_limit": 200000,
            "is_active": True,
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=45)).isoformat(),
            "updated_at": now_iso,
        },
    ]

    created_vendors = 0
    for v in vendors_to_create:
        existing = await db.vendor_master.find_one({"name": v["name"]})
        if not existing:
            await db.vendor_master.insert_one(v)
            created_vendors += 1
    print(f"Vendors: {created_vendors} created, {len(vendors_to_create) - created_vendors} existed")

    # Get vendor map
    all_vendors = await db.vendor_master.find({"is_active": True}, {"_id": 0, "vendor_id": 1, "name": 1}).to_list(50)
    vendor_map = {v["name"]: v["vendor_id"] for v in all_vendors}

    # ===== 2. SEED MATERIAL REQUESTS =====
    materials = [
        ("OPC 53 Grade Cement", "Bags", 200, 380, "Ambuja Cement Dealer"),
        ("TMT Steel 12mm", "Tonnes", 5, 52000, "Chennai Steel Corp"),
        ("M-Sand (Fine)", "Cubic Feet", 500, 45, "Vadapalani Sand Supplier"),
        ("Blue Metal 20mm", "Cubic Feet", 300, 38, "Vadapalani Sand Supplier"),
        ("Electrical Wire 2.5mm", "Coils", 50, 1200, "Spark Electricals"),
        ("PVC Pipe 4 inch", "Pieces", 100, 450, "AquaFlow Systems"),
        ("Floor Tiles 2x2", "Boxes", 150, 65, "Royal Tiles Gallery"),
        ("Plywood 18mm", "Sheets", 40, 1800, "Sree Lakshmi Hardware"),
        ("KCP Cement PPC", "Bags", 300, 350, "Ambuja Cement Dealer"),
        ("Binding Wire", "KG", 100, 70, "Chennai Steel Corp"),
        ("CPVC Pipe 1 inch", "Pieces", 80, 320, "AquaFlow Systems"),
        ("Wall Tiles 12x18", "Boxes", 200, 55, "Royal Tiles Gallery"),
        ("MCB 32A", "Pieces", 20, 280, "Spark Electricals"),
        ("Ready Mix M25", "Cubic Meters", 15, 5500, "Ambuja Cement Dealer"),
        ("Granite Slab", "Sqft", 300, 120, "Royal Tiles Gallery"),
    ]

    created_requests = []

    # --- PENDING TAB: planning_approved requests not yet in procurement_pricing ---
    for mat_name, unit, qty, price, vendor_name in materials[:3]:
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        req = {
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "site_engineer_id": SE_ID,
            "site_engineer_name": SE_NAME,
            "material_name": mat_name,
            "material_id": f"mat_{uid()}",
            "quantity": qty,
            "unit": unit,
            "estimated_price": price * qty,
            "stage": "Foundation",
            "urgency": "high",
            "remarks": f"Required for foundation work - {mat_name}",
            "status": "planning_approved",
            "requested_at": (now - timedelta(days=5)).isoformat(),
            "planning_approved_by": PLAN_ID,
            "planning_approved_at": (now - timedelta(days=3)).isoformat(),
            "created_at": (now - timedelta(days=5)).isoformat(),
            "updated_at": (now - timedelta(days=3)).isoformat(),
        }
        await db.material_requests.insert_one(req)
        created_requests.append(("pending", req_id, mat_name))

    # --- PRICING TAB: vendor_selected, waiting_payment, payment_approved, po_generated ---
    pricing_statuses = ["vendor_selected", "waiting_payment", "payment_approved", "po_generated"]
    for i, (mat_name, unit, qty, price, vendor_name) in enumerate(materials[3:7]):
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        status = pricing_statuses[i]
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        total_amount = price * qty
        payment_types = ["advance", "full", "credit", "advance"]
        payment_type = payment_types[i]

        if payment_type == "advance":
            advance_amount = round(total_amount * 0.5)
            balance_amount = total_amount - advance_amount
        elif payment_type == "full":
            advance_amount = total_amount
            balance_amount = 0
        else:
            advance_amount = 0
            balance_amount = total_amount

        req = {
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "site_engineer_id": SE_ID,
            "site_engineer_name": SE_NAME,
            "material_name": mat_name,
            "material_id": f"mat_{uid()}",
            "quantity": qty,
            "unit": unit,
            "estimated_price": total_amount,
            "stage": "Superstructure",
            "urgency": "medium",
            "status": status,
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "unit_rate": price,
            "transport_cost": 1500,
            "discount": 500,
            "total_amount": total_amount + 1000,
            "payment_type": payment_type,
            "advance_mode": "percentage",
            "advance_amount": advance_amount,
            "advance_percent": 50 if payment_type == "advance" else None,
            "balance_amount": balance_amount,
            "credit_period_days": 30 if payment_type == "credit" else 0,
            "procurement_approved_by": PROC_ID,
            "procurement_approved_at": (now - timedelta(days=2)).isoformat(),
            "requested_at": (now - timedelta(days=8)).isoformat(),
            "planning_approved_by": PLAN_ID,
            "planning_approved_at": (now - timedelta(days=6)).isoformat(),
            "created_at": (now - timedelta(days=8)).isoformat(),
            "updated_at": (now - timedelta(days=1)).isoformat(),
        }

        if status in ["payment_approved", "po_generated"]:
            req["accountant_approved_by"] = ACCT_ID
            req["accountant_approved_at"] = (now - timedelta(days=1)).isoformat()

        if status == "po_generated":
            po_id = f"PO-{now.strftime('%Y%m%d')}-{uid()[:6].upper()}"
            req["po_id"] = po_id
            req["po_generated_at"] = (now - timedelta(hours=6)).isoformat()
            po_doc = {
                "po_id": po_id,
                "po_number": f"PO-{now.strftime('%Y%m%d%H%M%S')}-A",
                "request_id": req_id,
                "order_id": order_id,
                "project_id": PROJECT_ID,
                "project_name": PROJECT_NAME,
                "vendor_id": vendor_id,
                "vendor_name": vendor_name,
                "material_name": mat_name,
                "quantity": qty,
                "unit": unit,
                "unit_rate": price,
                "transport_cost": 1500,
                "discount": 500,
                "total_amount": total_amount + 1000,
                "payment_type": payment_type,
                "advance_paid": advance_amount,
                "balance_due": balance_amount,
                "status": "generated",
                "generated_by": PROC_ID,
                "generated_at": (now - timedelta(hours=6)).isoformat(),
            }
            await db.purchase_orders_v2.insert_one(po_doc)

        await db.material_requests.insert_one(req)
        created_requests.append(("pricing", req_id, mat_name))

    # --- PAYMENT TAB: additional waiting_payment items ---
    for mat_name, unit, qty, price, vendor_name in materials[7:9]:
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        total_amount = price * qty
        req = {
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "site_engineer_id": SE_ID,
            "site_engineer_name": SE_NAME,
            "material_name": mat_name,
            "material_id": f"mat_{uid()}",
            "quantity": qty,
            "unit": unit,
            "estimated_price": total_amount,
            "stage": "Finishing",
            "urgency": "low",
            "status": "waiting_payment",
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "unit_rate": price,
            "transport_cost": 2000,
            "discount": 0,
            "total_amount": total_amount + 2000,
            "payment_type": "full",
            "advance_amount": total_amount + 2000,
            "balance_amount": 0,
            "procurement_approved_by": PROC_ID,
            "procurement_approved_at": (now - timedelta(days=1)).isoformat(),
            "requested_at": (now - timedelta(days=7)).isoformat(),
            "planning_approved_by": PLAN_ID,
            "planning_approved_at": (now - timedelta(days=5)).isoformat(),
            "created_at": (now - timedelta(days=7)).isoformat(),
            "updated_at": (now - timedelta(days=1)).isoformat(),
        }
        await db.material_requests.insert_one(req)
        created_requests.append(("payment", req_id, mat_name))

    # --- TRANSIT TAB: in_transit ---
    vehicle_nums = ["TN 09 AB 1234", "TN 22 CD 5678", "TN 07 EF 9012"]
    driver_names = ["Kumar", "Ravi", "Senthil"]
    for j, (mat_name, unit, qty, price, vendor_name) in enumerate(materials[9:12]):
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        total_amount = price * qty
        otp = str(100000 + j * 111111)
        po_id = f"PO-{(now - timedelta(days=3)).strftime('%Y%m%d')}-{uid()[:6].upper()}"

        req = {
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "site_engineer_id": SE_ID,
            "site_engineer_name": SE_NAME,
            "material_name": mat_name,
            "material_id": f"mat_{uid()}",
            "quantity": qty,
            "unit": unit,
            "estimated_price": total_amount,
            "stage": "Superstructure",
            "status": "in_transit",
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "unit_rate": price,
            "transport_cost": 1000,
            "discount": 0,
            "total_amount": total_amount + 1000,
            "payment_type": "advance",
            "advance_amount": round(total_amount * 0.5),
            "balance_amount": round(total_amount * 0.5),
            "po_id": po_id,
            "po_generated_at": (now - timedelta(days=2)).isoformat(),
            "dispatched_at": (now - timedelta(hours=12 - j * 3)).isoformat(),
            "vehicle_number": vehicle_nums[j],
            "driver_phone": f"98765{43210 + j}",
            "receipt_otp": otp,
            "procurement_approved_by": PROC_ID,
            "accountant_approved_by": ACCT_ID,
            "requested_at": (now - timedelta(days=10)).isoformat(),
            "planning_approved_by": PLAN_ID,
            "created_at": (now - timedelta(days=10)).isoformat(),
            "updated_at": (now - timedelta(hours=6)).isoformat(),
        }
        await db.material_requests.insert_one(req)

        # Transit tracking
        await db.transit_tracking.insert_one({
            "tracking_id": f"trk_{uid()}",
            "po_id": po_id,
            "request_id": req_id,
            "project_id": PROJECT_ID,
            "status": "dispatched",
            "vehicle_number": vehicle_nums[j],
            "driver_name": driver_names[j],
            "driver_phone": f"98765{43210 + j}",
            "estimated_arrival": (now + timedelta(hours=6 + j * 2)).isoformat(),
            "updates": [{
                "timestamp": (now - timedelta(hours=12)).isoformat(),
                "status": "dispatched",
                "remarks": "Material dispatched from vendor",
            }],
            "created_at": (now - timedelta(hours=12)).isoformat(),
        })

        # PO v2
        await db.purchase_orders_v2.insert_one({
            "po_id": po_id,
            "po_number": f"PO-{uid()[:8].upper()}",
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "material_name": mat_name,
            "quantity": qty,
            "unit": unit,
            "unit_rate": price,
            "total_amount": total_amount + 1000,
            "status": "in_transit",
            "dispatched_at": (now - timedelta(hours=12)).isoformat(),
            "vehicle_number": vehicle_nums[j],
            "generated_by": PROC_ID,
            "generated_at": (now - timedelta(days=2)).isoformat(),
        })
        created_requests.append(("transit", req_id, mat_name))

    # --- CREDIT LEDGER ---
    for k, (mat_name, unit, qty, price, vendor_name) in enumerate(materials[12:15]):
        req_id = f"mreq_{uid()}"
        order_id = f"MR-{uid()[:6].upper()}"
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        total_amount = price * qty
        po_id = f"PO-{(now - timedelta(days=15)).strftime('%Y%m%d')}-{uid()[:6].upper()}"
        delivery_date = (now - timedelta(days=10 - k * 3)).isoformat()
        due_date = (now + timedelta(days=20 - k * 15)).isoformat()
        paid = [0, round(total_amount * 0.4), 0][k]
        balance = total_amount - paid
        status = ["outstanding", "partially_paid", "outstanding"][k]

        req = {
            "request_id": req_id,
            "order_id": order_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "site_engineer_id": SE_ID,
            "material_name": mat_name,
            "material_id": f"mat_{uid()}",
            "quantity": qty,
            "unit": unit,
            "status": "received_completed",
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "unit_rate": price,
            "total_amount": total_amount,
            "payment_type": "credit",
            "credit_period_days": 30,
            "po_id": po_id,
            "created_at": (now - timedelta(days=20)).isoformat(),
            "updated_at": (now - timedelta(days=5)).isoformat(),
        }
        await db.material_requests.insert_one(req)

        credit_entry = {
            "entry_id": f"cle_{uid()}",
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "request_id": req_id,
            "po_id": po_id,
            "material_name": mat_name,
            "quantity": qty,
            "unit": unit,
            "credit_amount": total_amount,
            "paid_amount": paid,
            "balance_amount": balance,
            "credit_period_days": 30,
            "delivery_date": delivery_date,
            "payment_due_date": due_date,
            "status": status,
            "payment_requested": k == 2,
            "payment_history": [],
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=15)).isoformat(),
        }
        if paid > 0:
            credit_entry["payment_history"].append({
                "date": (now - timedelta(days=5)).isoformat(),
                "amount": paid,
                "reference": f"NEFT-{uid()[:8].upper()}",
                "paid_by": ACCT_ID,
                "remarks": "Partial payment",
            })
        await db.credit_ledger.insert_one(credit_entry)
        created_requests.append(("credit", req_id, mat_name))

    # --- PURCHASE ORDERS (auto-generated from site_ops, stored in purchase_orders collection) ---
    auto_po_materials = [
        ("Cement OPC 53 Grade", "Bags", 150, 390, "Ambuja Cement Dealer"),
        ("TMT Steel 16mm", "Tonnes", 3, 55000, "Chennai Steel Corp"),
        ("M-Sand (Coarse)", "Cubic Feet", 400, 48, "Vadapalani Sand Supplier"),
    ]
    po_statuses = ["pending", "approved", "dispatched"]
    for idx, (mat_name, unit, qty, price, vendor_name) in enumerate(auto_po_materials):
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        po_id = f"po_{uid()[:8]}"
        total = price * qty
        po = {
            "po_id": po_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "material_request_id": f"mreq_{uid()}",
            "items": [{
                "material_name": mat_name,
                "quantity": qty,
                "unit": unit,
                "category": "Cement" if "Cement" in mat_name else "Steel" if "Steel" in mat_name else "Sand",
            }],
            "total_amount": total,
            "paid_amount": 0,
            "status": po_statuses[idx],
            "payment_status": "unpaid",
            "auto_generated": True,
            "notes": f"Auto-generated from material request",
            "created_by": PLAN_ID,
            "created_at": (now - timedelta(days=4 - idx)).isoformat(),
            "updated_at": now_iso,
        }
        await db.purchase_orders.insert_one(po)

    # Manual POs
    manual_pos = [
        ("Shuttering Material", "Sets", 10, 3500, "Sree Lakshmi Hardware"),
        ("Electrical Panel Board", "Pieces", 2, 15000, "Spark Electricals"),
    ]
    for idx, (mat_name, unit, qty, price, vendor_name) in enumerate(manual_pos):
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        po_id = f"po_{uid()[:8]}"
        total = price * qty
        po = {
            "po_id": po_id,
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "items": [{
                "material_name": mat_name,
                "quantity": qty,
                "unit": unit,
            }],
            "total_amount": total,
            "paid_amount": 0,
            "status": "pending",
            "payment_status": "unpaid",
            "auto_generated": False,
            "notes": f"Manual PO for {mat_name}",
            "created_by": PROC_ID,
            "created_at": (now - timedelta(days=3)).isoformat(),
            "updated_at": now_iso,
        }
        await db.purchase_orders.insert_one(po)

    # --- PROCUREMENT PRICING (for dashboard metrics) ---
    pricing_items = [
        ("River Sand", "Cubic Feet", 200, 55, "Vadapalani Sand Supplier", "pricing_in_progress"),
        ("Gravel 12mm", "Cubic Feet", 150, 42, "Vadapalani Sand Supplier", "waiting_accounts"),
    ]
    for mat_name, unit, qty, price, vendor_name, p_status in pricing_items:
        vendor_id = vendor_map.get(vendor_name, f"vnd_{uid()}")
        pricing_id = f"prc_{uid()}"
        total = price * qty

        pricing_doc = {
            "pricing_id": pricing_id,
            "request_id": f"mreq_{uid()}",
            "request_type": "material_request",
            "project_id": PROJECT_ID,
            "project_name": PROJECT_NAME,
            "material_id": f"mat_{uid()}",
            "material_name": mat_name,
            "requested_qty": qty,
            "unit": unit,
            "site_engineer_id": SE_ID,
            "site_engineer_name": SE_NAME,
            "vendor_quotes": [
                {
                    "quote_id": f"quote_{uid()}",
                    "vendor_id": vendor_id,
                    "vendor_name": vendor_name,
                    "unit_price": price,
                    "quantity": qty,
                    "transport_cost": 1000,
                    "discount": 200,
                    "total": total + 800,
                    "is_selected": True,
                    "created_at": (now - timedelta(days=2)).isoformat(),
                },
                {
                    "quote_id": f"quote_{uid()}",
                    "vendor_id": f"vnd_{uid()}",
                    "vendor_name": "Other Supplier",
                    "unit_price": price + 5,
                    "quantity": qty,
                    "transport_cost": 1500,
                    "discount": 0,
                    "total": (price + 5) * qty + 1500,
                    "is_selected": False,
                    "created_at": (now - timedelta(days=2)).isoformat(),
                },
            ],
            "selected_vendor_id": vendor_id,
            "selected_vendor_name": vendor_name,
            "final_amount": total + 800,
            "status": p_status,
            "submitted_by": PROC_ID if p_status == "waiting_accounts" else None,
            "submitted_at": (now - timedelta(days=1)).isoformat() if p_status == "waiting_accounts" else None,
            "payment_status": "pending",
            "paid_amount": 0,
            "delivery_status": "pending",
            "delivered_qty": 0,
            "created_at": (now - timedelta(days=3)).isoformat(),
            "updated_at": (now - timedelta(days=1)).isoformat(),
        }
        await db.procurement_pricing.insert_one(pricing_doc)

    # ===== SUMMARY =====
    print(f"\n{'='*50}")
    print(f"PROCUREMENT BOARD SEED COMPLETE")
    print(f"Project: {PROJECT_NAME}")
    print(f"{'='*50}")
    print(f"Material requests: {len(created_requests)}")
    for tab, rid, name in created_requests:
        print(f"  [{tab:10s}] {rid} - {name}")
    print(f"Purchase Orders (auto): 3")
    print(f"Purchase Orders (manual): 2")
    print(f"Procurement Pricing: 2")
    print(f"Credit Ledger entries: 3")
    print(f"Transit Tracking entries: 3")
    print(f"Vendors: {len(vendors_to_create)}")
    print(f"{'='*50}")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
