#!/usr/bin/env python3
"""Seed script to populate MongoDB Atlas with demo data"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import secrets

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

# Demo Users
DEMO_USERS = [
    {"user_id": "user_superadmin001", "email": "admin@constructionos.com", "name": "Rajesh Kumar", "role": "super_admin", "phone": "9876543210"},
    {"user_id": "user_accountant001", "email": "accountant@constructionos.com", "name": "Priya Sharma", "role": "accountant", "phone": "9876543211"},
    {"user_id": "user_pm001", "email": "pm@constructionos.com", "name": "Vikram Singh", "role": "project_manager", "phone": "9876543212"},
    {"user_id": "user_gm001", "email": "gm@constructionos.com", "name": "Arun Mehta", "role": "gm", "phone": "9876543213"},
    {"user_id": "user_cre001", "email": "cre@constructionos.com", "name": "Anita Desai", "role": "cre", "phone": "9876543214"},
    {"user_id": "user_planning001", "email": "planning@constructionos.com", "name": "Suresh Iyer", "role": "planning", "phone": "9876543215"},
    {"user_id": "user_procurement001", "email": "procurement@constructionos.com", "name": "Meera Nair", "role": "procurement", "phone": "9876543216"},
    {"user_id": "user_presales001", "email": "presales@constructionos.com", "name": "Karthik Reddy", "role": "pre_sales", "phone": "9876543217"},
    {"user_id": "user_sales001", "email": "sales@constructionos.com", "name": "Divya Pillai", "role": "sales", "phone": "9876543218"},
    {"user_id": "user_engineer001", "email": "engineer@constructionos.com", "name": "Ramesh Kumar", "role": "site_engineer", "phone": "9876543219"},
    {"user_id": "user_marketing001", "email": "marketing@constructionos.com", "name": "Sneha Gupta", "role": "marketing_head", "phone": "9876543220"},
]

# Pre-Sales Stages
PRE_SALES_STAGES = [
    {"stage_id": "stg_new_lead", "name": "New Lead", "stage_type": "pre_sales", "order": 1, "color": "#3B82F6"},
    {"stage_id": "stg_contacted", "name": "Contacted", "stage_type": "pre_sales", "order": 2, "color": "#8B5CF6"},
    {"stage_id": "stg_qualified", "name": "Qualified", "stage_type": "pre_sales", "order": 3, "color": "#10B981"},
    {"stage_id": "stg_site_visit", "name": "Site Visit Scheduled", "stage_type": "pre_sales", "order": 4, "color": "#F59E0B"},
    {"stage_id": "stg_handover", "name": "Handover to Sales", "stage_type": "pre_sales", "order": 5, "color": "#EF4444"},
]

# Sales Stages
SALES_STAGES = [
    {"stage_id": "stg_new_appointment", "name": "New Appointment", "stage_type": "sales", "order": 1, "color": "#3B82F6"},
    {"stage_id": "stg_proposal", "name": "Proposal Sent", "stage_type": "sales", "order": 2, "color": "#8B5CF6"},
    {"stage_id": "stg_negotiation", "name": "Negotiation", "stage_type": "sales", "order": 3, "color": "#F59E0B"},
    {"stage_id": "stg_won", "name": "Won", "stage_type": "sales", "order": 4, "color": "#10B981"},
    {"stage_id": "stg_lost", "name": "Lost", "stage_type": "sales", "order": 5, "color": "#EF4444"},
]

# Sample Project
SAMPLE_PROJECT = {
    "project_id": "proj_demo001",
    "name": "Villa Sunrise - Coimbatore",
    "client_name": "Mr. Suresh Kumar",
    "client_email": "suresh@example.com",
    "client_phone": "9876501234",
    "location": "RS Puram, Coimbatore",
    "total_value": 5500000,
    "advance_received": 550000,
    "status": "in_progress",
    "created_at": datetime.now(timezone.utc).isoformat(),
    "created_by": "user_cre001",
    "assigned_to": ["user_pm001", "user_engineer001"],
}

async def seed_database():
    print(f"Connecting to MongoDB Atlas...")
    print(f"URL: {MONGO_URL[:50]}...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Test connection
    try:
        await client.admin.command('ping')
        print("✅ Connected to MongoDB Atlas successfully!")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # Seed Users
    print("\n📝 Seeding users...")
    for user in DEMO_USERS:
        user["created_at"] = datetime.now(timezone.utc).isoformat()
        user["is_active"] = True
        existing = await db.users.find_one({"email": user["email"]})
        if not existing:
            await db.users.insert_one(user)
            print(f"  ✅ Created: {user['name']} ({user['role']})")
        else:
            print(f"  ⏭️ Exists: {user['name']}")
    
    # Seed Stages
    print("\n📝 Seeding CRM stages...")
    for stage in PRE_SALES_STAGES + SALES_STAGES:
        stage["created_at"] = datetime.now(timezone.utc).isoformat()
        existing = await db.crm_stages.find_one({"stage_id": stage["stage_id"]})
        if not existing:
            await db.crm_stages.insert_one(stage)
            print(f"  ✅ Created stage: {stage['name']}")
        else:
            print(f"  ⏭️ Exists: {stage['name']}")
    
    # Seed Sample Project
    print("\n📝 Seeding sample project...")
    existing = await db.projects.find_one({"project_id": SAMPLE_PROJECT["project_id"]})
    if not existing:
        await db.projects.insert_one(SAMPLE_PROJECT)
        print(f"  ✅ Created: {SAMPLE_PROJECT['name']}")
    else:
        print(f"  ⏭️ Exists: {SAMPLE_PROJECT['name']}")
    
    # Create indexes
    print("\n📝 Creating indexes...")
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.projects.create_index("project_id", unique=True)
    await db.leads.create_index("lead_id", unique=True)
    print("  ✅ Indexes created")
    
    print("\n🎉 Database seeding complete!")
    print(f"\n📊 Summary:")
    print(f"  - Users: {await db.users.count_documents({})}")
    print(f"  - Projects: {await db.projects.count_documents({})}")
    print(f"  - CRM Stages: {await db.crm_stages.count_documents({})}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
