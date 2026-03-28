"""Migration: Add 'New RNR Leads' stage to pre-sales pipeline"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def migrate():
    mongo_url = os.environ.get("MONGO_URL")
    client = AsyncIOMotorClient(mongo_url)
    db_name = os.environ.get("DB_NAME", "construction_crm")
    db = client[db_name]
    
    # Check if stage already exists
    existing = await db.lead_stages.find_one({"stage_id": "stg_new_rnr"})
    if existing:
        print("Stage 'stg_new_rnr' already exists, skipping")
        client.close()
        return
    
    # Get current max order for pre_sales stages
    last_stage = await db.lead_stages.find({"stage_type": "pre_sales"}).sort("order", -1).limit(1).to_list(1)
    next_order = (last_stage[0]["order"] + 1) if last_stage else 7
    
    # Insert after RNR (order 3) - shift existing stages up
    # Actually, put it right after RNR at order 4, and shift others
    await db.lead_stages.update_many(
        {"stage_type": "pre_sales", "order": {"$gte": 4}},
        {"$inc": {"order": 1}}
    )
    
    new_stage = {
        "stage_id": "stg_new_rnr",
        "name": "New RNR Leads",
        "stage_type": "pre_sales",
        "order": 4,
        "color": "#dc2626",
        "is_final": False,
        "is_active": True,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.lead_stages.insert_one(new_stage)
    print(f"Added 'New RNR Leads' stage at order 4")
    
    # Verify
    stages = await db.lead_stages.find({"stage_type": "pre_sales"}, {"_id": 0, "stage_id": 1, "name": 1, "order": 1}).sort("order", 1).to_list(20)
    for s in stages:
        print(f"  {s['order']}: {s['name']} ({s['stage_id']})")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
