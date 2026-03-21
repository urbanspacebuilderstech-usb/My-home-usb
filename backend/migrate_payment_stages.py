"""Migration: Add Payment Collect and Accountant Approval stages to Sales pipeline"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def migrate():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "construction_os")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    now = datetime.now(timezone.utc)
    
    # 1. Add "Payment Collect" stage if not exists
    existing = await db.lead_stages.find_one({"stage_id": "stg_payment_collect"})
    if not existing:
        await db.lead_stages.insert_one({
            "stage_id": "stg_payment_collect",
            "name": "Payment Collect",
            "stage_type": "sales",
            "order": 9,
            "color": "#f59e0b",
            "is_final": False,
            "is_active": True,
            "created_by": "system",
            "created_at": now
        })
        print("Added 'Payment Collect' stage (order 9)")
    else:
        print("'Payment Collect' stage already exists")
    
    # 2. Add "Accountant Approval" stage if not exists
    existing = await db.lead_stages.find_one({"stage_id": "stg_accountant_approval"})
    if not existing:
        await db.lead_stages.insert_one({
            "stage_id": "stg_accountant_approval",
            "name": "Accountant Approval",
            "stage_type": "sales",
            "order": 10,
            "color": "#f97316",
            "is_final": False,
            "is_active": True,
            "created_by": "system",
            "created_at": now
        })
        print("Added 'Accountant Approval' stage (order 10)")
    else:
        print("'Accountant Approval' stage already exists")
    
    # 3. Move "Project Onboarded" to order 11
    result = await db.lead_stages.update_one(
        {"stage_id": "stg_project_onboarded"},
        {"$set": {"order": 11}}
    )
    print(f"Updated 'Project Onboarded' to order 11 (modified: {result.modified_count})")
    
    # 4. Move "Lost" to order 12
    result = await db.lead_stages.update_one(
        {"stage_id": "stg_lost"},
        {"$set": {"order": 12}}
    )
    print(f"Updated 'Lost' to order 12 (modified: {result.modified_count})")
    
    # 5. Verify final order
    stages = await db.lead_stages.find({"stage_type": "sales"}).sort("order", 1).to_list(20)
    print("\nFinal stage order:")
    for s in stages:
        print(f"  {s['order']}: {s['name']} ({s['stage_id']})")
    
    client.close()
    print("\nMigration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
