"""
Migration: Add re_number, revision, parent_re_number to existing RE projects
Run once: python migrate_re_numbers.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

async def migrate():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Find all RE projects without re_number, sorted by created_at
    projects = await db.re_projects.find(
        {"re_number": {"$exists": False}},
        {"_id": 1, "re_project_id": 1, "created_at": 1}
    ).sort("created_at", 1).to_list(1000)
    
    if not projects:
        print("No RE projects need migration.")
        # Still initialize counter if needed
        counter = await db.counters.find_one({"_id": "re_number"})
        if not counter:
            existing_count = await db.re_projects.count_documents({})
            await db.counters.insert_one({"_id": "re_number", "seq": existing_count})
            print(f"Initialized counter at {existing_count}")
        return
    
    print(f"Migrating {len(projects)} RE projects...")
    
    for i, proj in enumerate(projects):
        num = i + 1
        re_number = f"USB-RE{num:04d}"
        await db.re_projects.update_one(
            {"_id": proj["_id"]},
            {"$set": {
                "re_number": re_number,
                "revision": 0,
                "parent_re_number": re_number
            }}
        )
        print(f"  {proj['re_project_id']} -> {re_number}")
    
    # Set counter to the next available number
    await db.counters.update_one(
        {"_id": "re_number"},
        {"$set": {"seq": len(projects)}},
        upsert=True
    )
    print(f"Counter set to {len(projects)}. Next RE will be USB-RE{len(projects)+1:04d}")
    print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
