"""Migration: Update all existing project_code values to USB-H0001 format"""
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")

async def migrate():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Get all projects sorted by creation date
    projects = await db.projects.find({}, {"_id": 0, "project_id": 1, "project_code": 1, "created_at": 1}).sort("created_at", 1).to_list(10000)
    
    print(f"Found {len(projects)} projects to migrate")
    
    for i, proj in enumerate(projects):
        new_code = f"USB-H{str(i + 1).zfill(4)}"
        old_code = proj.get("project_code", "none")
        await db.projects.update_one(
            {"project_id": proj["project_id"]},
            {"$set": {"project_code": new_code}}
        )
        print(f"  {proj['project_id']}: {old_code} -> {new_code}")
    
    print(f"Migration complete. {len(projects)} projects updated.")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
