#!/usr/bin/env python3
"""
Comprehensive Demo Data Seeder for ConstructionOS
Adds realistic sample data for all modules
"""

import asyncio
import os
import secrets
import random
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

# =============================================================================
# SAMPLE DATA
# =============================================================================

# Indian Names
FIRST_NAMES = ["Rajesh", "Priya", "Amit", "Sneha", "Vikram", "Anita", "Suresh", "Meera", "Karthik", "Divya", 
               "Ramesh", "Lakshmi", "Arun", "Kavitha", "Mohan", "Deepa", "Ganesh", "Sunita", "Prakash", "Rekha"]
LAST_NAMES = ["Kumar", "Sharma", "Iyer", "Nair", "Reddy", "Pillai", "Menon", "Gupta", "Singh", "Desai",
              "Patel", "Rao", "Naidu", "Choudhary", "Verma", "Joshi", "Mehta", "Shah", "Das", "Bhat"]

# Locations
LOCATIONS = [
    "RS Puram, Coimbatore", "Peelamedu, Coimbatore", "Saibaba Colony, Coimbatore",
    "Race Course, Coimbatore", "Gandhipuram, Coimbatore", "Singanallur, Coimbatore",
    "Adyar, Chennai", "T Nagar, Chennai", "Anna Nagar, Chennai", "Velachery, Chennai",
    "Koramangala, Bangalore", "Whitefield, Bangalore", "Indiranagar, Bangalore",
    "Jubilee Hills, Hyderabad", "Banjara Hills, Hyderabad", "Madhapur, Hyderabad"
]

# Project Types
PROJECT_TYPES = ["Villa", "Apartment", "Commercial Building", "Duplex House", "Row House", "Bungalow", "Office Space"]

# Lead Sources
LEAD_SOURCES = ["meta", "seo", "referral", "walk_in", "website", "google_ads", "newspaper", "hoarding"]

# Materials
MATERIALS = [
    {"name": "OPC Cement 53 Grade", "category": "cement", "unit": "bag", "base_price": 450},
    {"name": "PPC Cement", "category": "cement", "unit": "bag", "base_price": 420},
    {"name": "TMT Steel 12mm", "category": "steel", "unit": "kg", "base_price": 72},
    {"name": "TMT Steel 16mm", "category": "steel", "unit": "kg", "base_price": 70},
    {"name": "River Sand", "category": "sand", "unit": "cft", "base_price": 85},
    {"name": "M Sand", "category": "sand", "unit": "cft", "base_price": 55},
    {"name": "Blue Metal 20mm", "category": "aggregate", "unit": "cft", "base_price": 42},
    {"name": "Red Bricks", "category": "bricks", "unit": "piece", "base_price": 8},
    {"name": "AAC Blocks", "category": "blocks", "unit": "piece", "base_price": 55},
    {"name": "Fly Ash Bricks", "category": "bricks", "unit": "piece", "base_price": 6},
]

# Vendors
VENDORS = [
    {"name": "Coimbatore Steel Traders", "category": "steel", "phone": "9876543001", "gst": "33AABCT1234F1ZK"},
    {"name": "KCP Cement Distributors", "category": "cement", "phone": "9876543002", "gst": "33AABCK2345G2ZL"},
    {"name": "Blue Star Aggregates", "category": "aggregate", "phone": "9876543003", "gst": "33AABCB3456H3ZM"},
    {"name": "Modern Bricks Industries", "category": "bricks", "phone": "9876543004", "gst": "33AABCM4567I4ZN"},
    {"name": "Quality Sand Suppliers", "category": "sand", "phone": "9876543005", "gst": "33AABCQ5678J5ZO"},
    {"name": "Lakshmi Hardware", "category": "hardware", "phone": "9876543006", "gst": "33AABCL6789K6ZP"},
    {"name": "Excel Electricals", "category": "electrical", "phone": "9876543007", "gst": "33AABCE7890L7ZQ"},
    {"name": "Plumb Perfect", "category": "plumbing", "phone": "9876543008", "gst": "33AABCP8901M8ZR"},
]

# Labour Types
LABOUR_TYPES = ["mason", "carpenter", "painter", "electrician", "plumber", "helper", "bar_bender", "welder"]


def generate_phone():
    return f"98{random.randint(10000000, 99999999)}"

def generate_email(name):
    return f"{name.lower().replace(' ', '.')}@example.com"

def random_date(start_days_ago=90, end_days_ago=0):
    days = random.randint(end_days_ago, start_days_ago)
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

def generate_id(prefix):
    return f"{prefix}_{secrets.token_hex(8)}"


async def seed_comprehensive_data():
    print("🔗 Connecting to MongoDB Atlas...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        await client.admin.command('ping')
        print("✅ Connected successfully!\n")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # ==========================================================================
    # 1. SEED MATERIALS
    # ==========================================================================
    print("📦 Seeding Materials...")
    for mat in MATERIALS:
        mat_id = generate_id("mat")
        existing = await db.materials.find_one({"name": mat["name"]})
        if not existing:
            await db.materials.insert_one({
                "material_id": mat_id,
                "name": mat["name"],
                "category": mat["category"],
                "unit": mat["unit"],
                "base_price": mat["base_price"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"  ✅ {mat['name']}")
    print(f"  Total materials: {await db.materials.count_documents({})}\n")
    
    # ==========================================================================
    # 2. SEED VENDORS
    # ==========================================================================
    print("🏪 Seeding Vendors...")
    vendor_ids = []
    for v in VENDORS:
        v_id = generate_id("vendor")
        existing = await db.vendor_master.find_one({"name": v["name"]})
        if not existing:
            await db.vendor_master.insert_one({
                "vendor_id": v_id,
                "name": v["name"],
                "category": v["category"],
                "phone": v["phone"],
                "email": generate_email(v["name"]),
                "gst_number": v["gst"],
                "address": f"{random.randint(1,200)}, Industrial Area, Coimbatore",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            vendor_ids.append(v_id)
            print(f"  ✅ {v['name']}")
        else:
            vendor_ids.append(existing.get("vendor_id"))
    print(f"  Total vendors: {await db.vendor_master.count_documents({})}\n")
    
    # ==========================================================================
    # 3. SEED PROJECTS
    # ==========================================================================
    print("🏗️ Seeding Projects...")
    projects_data = []
    statuses = ["lead", "planning", "in_progress", "in_progress", "in_progress", "completed", "on_hold"]
    
    for i in range(12):
        client_name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        project_type = random.choice(PROJECT_TYPES)
        location = random.choice(LOCATIONS)
        sqft = random.randint(1200, 5000)
        rate = random.randint(1800, 2800)
        total_value = sqft * rate
        advance = int(total_value * random.uniform(0.1, 0.3))
        status = random.choice(statuses)
        
        project = {
            "project_id": generate_id("proj"),
            "name": f"{project_type} - {location.split(',')[0]}",
            "client_name": client_name,
            "client_email": generate_email(client_name),
            "client_phone": generate_phone(),
            "location": location,
            "sqft": sqft,
            "rate_per_sqft": rate,
            "total_value": total_value,
            "advance_received": advance if status != "lead" else 0,
            "status": status,
            "project_type": project_type.lower().replace(" ", "_"),
            "start_date": random_date(180, 30) if status not in ["lead"] else None,
            "expected_completion": random_date(-90, -180) if status not in ["lead", "planning"] else None,
            "assigned_to": ["user_pm001", "user_engineer001"] if status in ["in_progress", "completed"] else [],
            "created_by": "user_cre001",
            "created_at": random_date(200, 10),
            "notes": f"Client interested in {project_type.lower()} construction"
        }
        
        existing = await db.projects.find_one({"name": project["name"], "client_name": client_name})
        if not existing:
            await db.projects.insert_one(project)
            projects_data.append(project)
            print(f"  ✅ {project['name']} ({status}) - ₹{total_value:,}")
    
    print(f"  Total projects: {await db.projects.count_documents({})}\n")
    
    # ==========================================================================
    # 4. SEED LEADS
    # ==========================================================================
    print("👥 Seeding Leads...")
    stages_presales = ["stg_new_lead", "stg_contacted", "stg_qualified", "stg_site_visit", "stg_handover"]
    stages_sales = ["stg_new_appointment", "stg_proposal", "stg_negotiation", "stg_won", "stg_lost"]
    
    for i in range(25):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        stage_type = random.choice(["pre_sales", "pre_sales", "pre_sales", "sales"])
        stages = stages_presales if stage_type == "pre_sales" else stages_sales
        current_stage = random.choice(stages)
        
        lead = {
            "lead_id": generate_id("lead"),
            "name": name,
            "email": generate_email(name),
            "phone": generate_phone(),
            "source": random.choice(LEAD_SOURCES),
            "city": random.choice(["Coimbatore", "Chennai", "Bangalore", "Hyderabad"]),
            "current_stage_id": current_stage,
            "stage_type": stage_type,
            "stage_history": [{
                "stage_id": current_stage,
                "moved_at": random_date(60, 0),
                "moved_by": "user_presales001" if stage_type == "pre_sales" else "user_sales001"
            }],
            "assigned_to": "user_presales001" if stage_type == "pre_sales" else "user_sales001",
            "custom_fields": {
                "sqft": random.randint(1000, 4000),
                "budget": random.randint(2000000, 10000000)
            },
            "notes": f"Interested in construction, budget around ₹{random.randint(20,100)} lakhs",
            "created_by": "user_marketing001",
            "created_at": random_date(90, 0)
        }
        
        existing = await db.leads.find_one({"phone": lead["phone"]})
        if not existing:
            await db.leads.insert_one(lead)
            print(f"  ✅ {name} ({stage_type} - {current_stage})")
    
    print(f"  Total leads: {await db.leads.count_documents({})}\n")
    
    # ==========================================================================
    # 5. SEED INCOME (Payments Received)
    # ==========================================================================
    print("💰 Seeding Income Records...")
    projects = await db.projects.find({"status": {"$in": ["in_progress", "completed"]}}, {"_id": 0}).to_list(20)
    payment_modes = ["cash", "cheque", "bank_transfer", "upi"]
    
    for proj in projects:
        # Add 2-4 payments per project
        num_payments = random.randint(2, 4)
        total_paid = 0
        
        for j in range(num_payments):
            if total_paid >= proj.get("total_value", 0) * 0.8:
                break
                
            amount = random.randint(100000, 500000)
            total_paid += amount
            
            income = {
                "income_id": generate_id("inc"),
                "project_id": proj["project_id"],
                "project_name": proj["name"],
                "client_name": proj["client_name"],
                "amount": amount,
                "payment_mode": random.choice(payment_modes),
                "payment_date": random_date(120, 5),
                "remarks": random.choice(["Advance payment", "Progress payment", "Milestone payment", "Part payment"]),
                "collected_by": "user_cre001",
                "collected_by_name": "Anita Desai",
                "verified": True,
                "verified_by": "user_accountant001",
                "created_at": random_date(120, 5)
            }
            
            await db.income.insert_one(income)
        
        # Update project advance_received
        await db.projects.update_one(
            {"project_id": proj["project_id"]},
            {"$set": {"advance_received": total_paid}}
        )
        print(f"  ✅ {proj['name']}: ₹{total_paid:,} ({num_payments} payments)")
    
    print(f"  Total income records: {await db.income.count_documents({})}\n")
    
    # ==========================================================================
    # 6. SEED EXPENSES
    # ==========================================================================
    print("📉 Seeding Expenses...")
    expense_categories = ["material", "labour", "transport", "utility", "office", "maintenance"]
    
    for proj in projects[:8]:
        num_expenses = random.randint(3, 6)
        
        for j in range(num_expenses):
            category = random.choice(expense_categories)
            
            expense = {
                "expense_id": generate_id("exp"),
                "project_id": proj["project_id"],
                "project_name": proj["name"],
                "category": category,
                "description": f"{category.title()} expense for {proj['name']}",
                "amount": random.randint(10000, 100000),
                "payment_method": random.choice(["bank_transfer", "cash", "cheque"]),
                "vendor_name": random.choice(VENDORS)["name"] if category == "material" else None,
                "recorded_by": "user_accountant001",
                "recorded_by_name": "Priya Sharma",
                "status": "recorded",
                "created_at": random_date(90, 5)
            }
            
            await db.recorded_expenses.insert_one(expense)
        
        print(f"  ✅ {proj['name']}: {num_expenses} expenses")
    
    print(f"  Total expenses: {await db.recorded_expenses.count_documents({})}\n")
    
    # ==========================================================================
    # 7. SEED MATERIAL REQUESTS
    # ==========================================================================
    print("📋 Seeding Material Requests...")
    materials = await db.materials.find({}, {"_id": 0}).to_list(20)
    request_statuses = ["pending_pm_approval", "pending_planning_approval", "approved", "order_placed", "delivered"]
    
    for proj in projects[:6]:
        num_requests = random.randint(2, 4)
        
        for j in range(num_requests):
            mat = random.choice(materials)
            qty = random.randint(50, 500)
            
            request = {
                "request_id": generate_id("mreq"),
                "project_id": proj["project_id"],
                "project_name": proj["name"],
                "material_id": mat["material_id"],
                "material_name": mat["name"],
                "quantity": qty,
                "unit": mat["unit"],
                "estimated_price": mat["base_price"] * qty,
                "status": random.choice(request_statuses),
                "requested_by": "user_engineer001",
                "requested_by_name": "Ramesh Kumar",
                "required_by": random_date(-7, -30),
                "remarks": f"Required for {random.choice(['foundation', 'structure', 'finishing', 'plumbing'])} work",
                "created_at": random_date(60, 5)
            }
            
            await db.material_requests.insert_one(request)
        
        print(f"  ✅ {proj['name']}: {num_requests} material requests")
    
    print(f"  Total material requests: {await db.material_requests.count_documents({})}\n")
    
    # ==========================================================================
    # 8. SEED LABOUR EXPENSES
    # ==========================================================================
    print("👷 Seeding Labour Expenses...")
    
    for proj in projects[:6]:
        num_labour = random.randint(2, 4)
        
        for j in range(num_labour):
            labour_type = random.choice(LABOUR_TYPES)
            workers = random.randint(2, 8)
            days = random.randint(5, 15)
            rate = random.randint(500, 1000)
            
            labour = {
                "labour_expense_id": generate_id("lab"),
                "project_id": proj["project_id"],
                "project_name": proj["name"],
                "labour_type": labour_type,
                "workers": workers,
                "days": days,
                "rate": rate,
                "total_amount": workers * days * rate,
                "status": random.choice(["pending_pm_approval", "pending_accounts_approval", "approved", "paid"]),
                "requested_by": "user_engineer001",
                "requested_by_name": "Ramesh Kumar",
                "created_at": random_date(60, 5)
            }
            
            await db.labour_expenses.insert_one(labour)
        
        print(f"  ✅ {proj['name']}: {num_labour} labour entries")
    
    print(f"  Total labour expenses: {await db.labour_expenses.count_documents({})}\n")
    
    # ==========================================================================
    # 9. SEED PETTY CASH
    # ==========================================================================
    print("💵 Seeding Petty Cash...")
    petty_statuses = ["requested", "issued", "pending_settlement", "settled"]
    
    for proj in projects[:4]:
        petty = {
            "petty_cash_id": generate_id("pc"),
            "project_id": proj["project_id"],
            "project_name": proj["name"],
            "amount_requested": random.randint(3000, 10000),
            "amount_issued": random.randint(3000, 10000),
            "amount_spent": random.randint(2000, 8000),
            "purpose": random.choice(["Site consumables", "Transport", "Emergency repairs", "Labour advance"]),
            "status": random.choice(petty_statuses),
            "requested_by": "user_engineer001",
            "requested_by_name": "Ramesh Kumar",
            "expenses": [
                {"description": "Auto fare", "amount": random.randint(100, 500)},
                {"description": "Nails and screws", "amount": random.randint(200, 800)},
                {"description": "Water cans", "amount": random.randint(100, 300)}
            ],
            "created_at": random_date(30, 5)
        }
        
        await db.petty_cash_requests.insert_one(petty)
        print(f"  ✅ {proj['name']}: ₹{petty['amount_requested']} ({petty['status']})")
    
    print(f"  Total petty cash: {await db.petty_cash_requests.count_documents({})}\n")
    
    # ==========================================================================
    # 10. SEED HR STAFF
    # ==========================================================================
    print("👨‍💼 Seeding HR Staff...")
    departments = ["operations", "accounts", "admin", "site"]
    designations = ["Site Supervisor", "Accountant", "Office Assistant", "Driver", "Security Guard", "Helper"]
    
    for i in range(8):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        
        staff = {
            "staff_id": generate_id("staff"),
            "name": name,
            "phone": generate_phone(),
            "email": generate_email(name),
            "designation": random.choice(designations),
            "department": random.choice(departments),
            "base_salary": random.randint(15000, 35000),
            "join_date": random_date(365, 30),
            "is_active": True,
            "created_at": random_date(365, 30)
        }
        
        existing = await db.hr_staff.find_one({"phone": staff["phone"]})
        if not existing:
            await db.hr_staff.insert_one(staff)
            print(f"  ✅ {name} ({staff['designation']})")
    
    print(f"  Total staff: {await db.hr_staff.count_documents({})}\n")
    
    # ==========================================================================
    # 11. CREATE INDEXES
    # ==========================================================================
    print("📇 Creating Indexes...")
    
    # Users indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("role")
    
    # Projects indexes
    await db.projects.create_index("project_id", unique=True)
    await db.projects.create_index("status")
    await db.projects.create_index("created_at")
    
    # Leads indexes
    await db.leads.create_index("lead_id", unique=True)
    await db.leads.create_index("current_stage_id")
    await db.leads.create_index("stage_type")
    await db.leads.create_index("assigned_to")
    
    # Income indexes
    await db.income.create_index("income_id", unique=True)
    await db.income.create_index("project_id")
    await db.income.create_index("payment_date")
    
    # Expenses indexes
    await db.recorded_expenses.create_index("expense_id", unique=True)
    await db.recorded_expenses.create_index("project_id")
    await db.recorded_expenses.create_index("category")
    
    # Material requests indexes
    await db.material_requests.create_index("request_id", unique=True)
    await db.material_requests.create_index("project_id")
    await db.material_requests.create_index("status")
    
    # Audit logs indexes
    await db.audit_logs.create_index("audit_id", unique=True)
    await db.audit_logs.create_index("timestamp")
    await db.audit_logs.create_index("user_id")
    await db.audit_logs.create_index("action")
    
    print("  ✅ All indexes created\n")
    
    # ==========================================================================
    # SUMMARY
    # ==========================================================================
    print("=" * 60)
    print("🎉 SEEDING COMPLETE! Database Summary:")
    print("=" * 60)
    
    collections = [
        ("users", "Users"),
        ("projects", "Projects"),
        ("leads", "Leads"),
        ("income", "Income Records"),
        ("recorded_expenses", "Expenses"),
        ("materials", "Materials"),
        ("vendor_master", "Vendors"),
        ("material_requests", "Material Requests"),
        ("labour_expenses", "Labour Expenses"),
        ("petty_cash_requests", "Petty Cash"),
        ("hr_staff", "HR Staff"),
        ("crm_stages", "CRM Stages"),
        ("audit_logs", "Audit Logs")
    ]
    
    for coll, name in collections:
        count = await db[coll].count_documents({})
        print(f"  {name}: {count}")
    
    # Calculate totals
    total_income = 0
    async for inc in db.income.find({}, {"amount": 1}):
        total_income += inc.get("amount", 0)
    
    total_expenses = 0
    async for exp in db.recorded_expenses.find({}, {"amount": 1}):
        total_expenses += exp.get("amount", 0)
    
    total_project_value = 0
    async for proj in db.projects.find({}, {"total_value": 1}):
        total_project_value += proj.get("total_value", 0)
    
    print(f"\n  📊 Financial Summary:")
    print(f"     Total Project Value: ₹{total_project_value:,}")
    print(f"     Total Income: ₹{total_income:,}")
    print(f"     Total Expenses: ₹{total_expenses:,}")
    print("=" * 60)
    
    client.close()
    print("\n✅ Database connection closed.")


if __name__ == "__main__":
    asyncio.run(seed_comprehensive_data())
