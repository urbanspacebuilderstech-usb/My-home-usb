"""Seed demo data for Live Map - 5 active SEs across 4 projects"""
import asyncio, os, uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv()

client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
db = client[os.environ.get('DB_NAME', 'construction_crm')]

# 4 project locations around Chennai
PROJECT_LOCATIONS = [
    {"project_id": "proj_12f23331b542", "latitude": 13.05, "longitude": 80.2824},      # Marina Beach area
    {"project_id": "proj_28a86c68191c", "latitude": 13.0827, "longitude": 80.2707},     # George Town
    {"project_id": "proj_7485a4f669e3", "latitude": 13.0012, "longitude": 80.2565},     # Adyar
]

# 5 SE demo entries - user_id, name, project_idx, lat_offset, lng_offset
SE_DEMOS = [
    ("user_engineer001", "Ramesh Kumar", 0, 0.001, -0.002),
    ("user_20942172399b", "Suresh Patel", 1, -0.001, 0.001),
    ("user_b124e87f1514", "Vignesh", 2, 0.002, 0.001),
    ("user_735e265d4952", "Arun Prasad", 0, -0.002, 0.003),   # 2nd SE at project 0
    ("user_577f8f575d15", "Karthik Rajan", 1, 0.003, -0.001),  # 2nd SE at project 1 -- we need 4th project
]

async def seed():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Set 4th project GPS if needed
    fourth = await db.projects.find_one({"project_id": {"$nin": [p["project_id"] for p in PROJECT_LOCATIONS]}, "latitude": None}, {"_id": 0, "project_id": 1, "name": 1})
    if not fourth:
        fourth = await db.projects.find_one({"project_id": {"$nin": [p["project_id"] for p in PROJECT_LOCATIONS]}}, {"_id": 0, "project_id": 1, "name": 1})
    
    if fourth:
        await db.projects.update_one({"project_id": fourth["project_id"]}, {"$set": {"latitude": 13.0350, "longitude": 80.2120}})
        PROJECT_LOCATIONS.append({"project_id": fourth["project_id"], "latitude": 13.0350, "longitude": 80.2120})
        print(f"Set GPS for 4th project: {fourth['project_id']} ({fourth.get('name','')})")
        # Update SE_DEMOS to use 4th project for last SE
        SE_DEMOS[4] = ("user_577f8f575d15", "Karthik Rajan", 3, 0.001, 0.002)
    
    # Update SE names to be more realistic
    name_updates = {
        "user_735e265d4952": "Arun Prasad",
        "user_577f8f575d15": "Karthik Rajan",
    }
    for uid, name in name_updates.items():
        await db.users.update_one({"user_id": uid}, {"$set": {"name": name}})
    
    # Clear old attendance for today
    await db.se_attendance.delete_many({"date": today})
    await db.se_location_pings.delete_many({"date": today})
    
    login_times = ["08:30", "09:00", "08:45", "09:15", "09:30"]
    
    for i, (uid, name, proj_idx, lat_off, lng_off) in enumerate(SE_DEMOS):
        proj = PROJECT_LOCATIONS[proj_idx]
        proj_doc = await db.projects.find_one({"project_id": proj["project_id"]}, {"_id": 0, "name": 1})
        proj_name = proj_doc.get("name", "") if proj_doc else f"Project {proj_idx}"
        
        se_lat = proj["latitude"] + lat_off
        se_lng = proj["longitude"] + lng_off
        
        # Create attendance record (active - no logout)
        att = {
            "attendance_id": f"att_{uuid.uuid4().hex[:8]}",
            "user_id": uid,
            "user_name": name,
            "date": today,
            "entries": [{
                "project_id": proj["project_id"],
                "project_name": proj_name,
                "login_time": login_times[i],
                "logout_time": None,
                "login_lat": se_lat,
                "login_lng": se_lng,
                "logout_lat": None,
                "logout_lng": None,
            }],
            "total_hours": 0,
            "status": "present",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.se_attendance.insert_one(att)
        
        # Create location ping
        await db.se_location_pings.insert_one({
            "user_id": uid,
            "user_name": name,
            "project_id": proj["project_id"],
            "project_name": proj_name,
            "date": today,
            "latitude": se_lat,
            "longitude": se_lng,
            "timestamp": now_iso,
        })
        
        print(f"  {name} -> {proj_name} (login {login_times[i]}, GPS: {se_lat:.4f}, {se_lng:.4f})")
    
    print(f"\nDone! 5 SEs active across {len(set(s[2] for s in SE_DEMOS))} projects")

asyncio.run(seed())
