"""Seed a lead in 'accountant_pending' state to test accountant Verify/Reject buttons."""
import os, uuid, requests, asyncio, motor.motor_asyncio
from dotenv import load_dotenv

BASE = "https://crm-onboard-flow.preview.emergentagent.com"
load_dotenv("/app/backend/.env")

def login(email, pw):
    s = requests.Session(); s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    r.raise_for_status(); return s

admin = login("admin@constructionos.com", "Demo@1234")
users = admin.get(f"{BASE}/api/users").json()
users = users if isinstance(users, list) else users.get("users", [])
sales_uid = next((u["user_id"] for u in users if u.get("role")=="sales"),
                 next(u["user_id"] for u in users if u.get("role")=="super_admin"))

name = f"AccountantPendingTest {uuid.uuid4().hex[:6]}"
r = admin.post(f"{BASE}/api/crm/leads", json={
    "name": name, "phone": "9876522222", "email": "acpend@test.local",
    "source": "manual", "stage_type": "sales", "assigned_to": sales_uid,
    "sqft": 1200, "budget": 1500000,
})
r.raise_for_status()
lead_id = r.json()["lead_id"]
print("LEAD_ID=", lead_id)
print("LEAD_NAME=", name)

async def seed():
    cl = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = cl[os.environ["DB_NAME"]]
    await d.leads.update_one({"lead_id": lead_id}, {"$set": {"current_stage_id": "stg_payment_collect"}})
asyncio.get_event_loop().run_until_complete(seed())

# Collect advance and send to accountant
r = admin.post(f"{BASE}/api/crm/leads/{lead_id}/collect-advance", json={
    "advance_amount": 50000, "payment_mode": "upi",
    "payment_reference": "TEST-AC-1", "remarks": "for accountant"}); r.raise_for_status()
r = admin.post(f"{BASE}/api/crm/leads/{lead_id}/send-to-accountant"); r.raise_for_status()

r = admin.get(f"{BASE}/api/crm/leads/{lead_id}")
lead = r.json()
print("onboarding_status=", lead.get("onboarding_status"))
print("current_stage_id=", lead.get("current_stage_id"))
