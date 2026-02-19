import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

async def seed_database():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("Seeding Construction CRM database...")
    
    # Clear existing data
    collections = ['users', 'projects', 'boq_items', 'work_orders', 'vendors', 'purchase_orders', 
                   'site_stages', 'user_sessions', 'expenses', 'payments', 'notifications']
    for coll in collections:
        await db[coll].delete_many({})
    
    # Create demo users
    users_data = [
        {
            "user_id": "user_superadmin001",
            "email": "admin@constructionos.com",
            "name": "Super Admin",
            "role": "super_admin",
            "phone": "+91 9876543210",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_gm001",
            "email": "gm@constructionos.com",
            "name": "Suresh Menon",
            "role": "general_manager",
            "phone": "+91 9876543220",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_cro001",
            "email": "cro@constructionos.com",
            "name": "Anita Desai",
            "role": "cro",
            "phone": "+91 9876543221",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_accountant001",
            "email": "accountant@constructionos.com",
            "name": "Priya Sharma",
            "role": "accountant",
            "phone": "+91 9876543211",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_pm001",
            "email": "pm@constructionos.com",
            "name": "Rajesh Kumar",
            "role": "project_manager",
            "phone": "+91 9876543212",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_planning001",
            "email": "planning@constructionos.com",
            "name": "Amit Patel",
            "role": "planning",
            "phone": "+91 9876543213",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_procurement001",
            "email": "procurement@constructionos.com",
            "name": "Sneha Reddy",
            "role": "procurement",
            "phone": "+91 9876543214",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_engineer001",
            "email": "engineer@constructionos.com",
            "name": "Vikram Singh",
            "role": "site_engineer",
            "phone": "+91 9876543215",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "user_id": "user_client001",
            "email": "raj@client.com",
            "name": "Mr. Raj",
            "role": "client",
            "phone": "+91 9876543216",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.users.insert_many(users_data)
    print(f"✓ Created {len(users_data)} users")
    
    # Create demo project
    project_data = {
        "project_id": "proj_classic001",
        "name": "Classic Condo",
        "client_name": "Mr. Raj",
        "client_user_id": "user_client001",
        "location": "Perumbakkam, Chennai",
        "latitude": 12.9085,
        "longitude": 80.2297,
        "total_value": 6000000,
        "start_date": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
        "expected_completion": (datetime.now(timezone.utc) + timedelta(days=300)).isoformat(),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.projects.insert_one(project_data)
    print("✓ Created project: Classic Condo")
    
    # Create BOQ items
    boq_items = [
        {
            "boq_id": "boq_sand001",
            "project_id": "proj_classic001",
            "item_name": "Sand (M-Sand)",
            "category": "material",
            "unit": "Load",
            "quantity": 10,
            "unit_rate": 18000,
            "total_cost": 180000,
            "locked": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "boq_id": "boq_cement001",
            "project_id": "proj_classic001",
            "item_name": "Cement (UltraTech)",
            "category": "material",
            "unit": "Bag",
            "quantity": 500,
            "unit_rate": 420,
            "total_cost": 210000,
            "locked": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "boq_id": "boq_steel001",
            "project_id": "proj_classic001",
            "item_name": "Steel TMT Bars",
            "category": "material",
            "unit": "Ton",
            "quantity": 5,
            "unit_rate": 65000,
            "total_cost": 325000,
            "locked": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "boq_id": "boq_labour001",
            "project_id": "proj_classic001",
            "item_name": "Mason Labour",
            "category": "labour",
            "unit": "Day",
            "quantity": 100,
            "unit_rate": 800,
            "total_cost": 80000,
            "locked": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.boq_items.insert_many(boq_items)
    print(f"✓ Created {len(boq_items)} BOQ items")
    
    # Create work order
    work_order_data = {
        "work_order_id": "wo_sand001",
        "project_id": "proj_classic001",
        "boq_id": "boq_sand001",
        "created_by_user_id": "user_pm001",
        "requested_quantity": 1,
        "estimated_cost": 18000,
        "purpose": "Foundation work - First load of M-Sand for site leveling",
        "status": "submitted",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.work_orders.insert_one(work_order_data)
    print("✓ Created work order for Sand")
    
    # Create vendor
    vendor_data = {
        "vendor_id": "vendor_balaji001",
        "name": "Sri Balaji Sand Suppliers",
        "contact_person": "Balaji",
        "phone": "+91 9876501234",
        "email": "balaji@sandSuppliers.com",
        "address": "Chengalpattu, Tamil Nadu",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vendors.insert_one(vendor_data)
    print("✓ Created vendor: Sri Balaji Sand Suppliers")
    
    # Create construction stages
    stages = [
        {"stage_id": "stage_001", "project_id": "proj_classic001", "name": "Planning", 
         "status": "completed", "start_date": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
         "completion_date": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"stage_id": "stage_002", "project_id": "proj_classic001", "name": "Foundation", 
         "status": "in_progress", "start_date": (datetime.now(timezone.utc) - timedelta(days=15)).isoformat(),
         "created_at": datetime.now(timezone.utc).isoformat()},
        {"stage_id": "stage_003", "project_id": "proj_classic001", "name": "Pillar Work", 
         "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()},
        {"stage_id": "stage_004", "project_id": "proj_classic001", "name": "Slab Work", 
         "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()},
        {"stage_id": "stage_005", "project_id": "proj_classic001", "name": "Brickwork", 
         "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()},
        {"stage_id": "stage_006", "project_id": "proj_classic001", "name": "Finishing", 
         "status": "pending", "created_at": datetime.now(timezone.utc).isoformat()}
    ]
    await db.site_stages.insert_many(stages)
    print(f"✓ Created {len(stages)} construction stages")
    
    # Create sample payments
    payments = [
        {
            "payment_id": "pay_001",
            "project_id": "proj_classic001",
            "amount": 1500000,
            "payment_date": (datetime.now(timezone.utc) - timedelta(days=25)).isoformat(),
            "description": "Initial advance payment",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "payment_id": "pay_002",
            "project_id": "proj_classic001",
            "amount": 1000000,
            "payment_date": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
            "description": "Second installment",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.payments.insert_many(payments)
    print(f"✓ Created {len(payments)} payment records")
    
    print("\n✅ Database seeded successfully!")
    print("\n📋 Demo Credentials:")
    print("=" * 50)
    print("Super Admin:    admin@constructionos.com")
    print("Accountant:     accountant@constructionos.com")
    print("Project Manager: pm@constructionos.com")
    print("Planning:       planning@constructionos.com")
    print("Procurement:    procurement@constructionos.com")
    print("Site Engineer:  engineer@constructionos.com")
    print("Client:         raj@client.com")
    print("=" * 50)
    print("\n🔑 Use Google OAuth to login with any of these emails")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
