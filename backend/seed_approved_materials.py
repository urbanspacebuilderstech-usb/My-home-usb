"""
Seed approved materials with brands for the Vinoth Kumar project.
These are the pre-approved branded materials that Site Engineers can request from.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

APPROVED_MATERIALS = [
    {"name": "Cement OPC 53 Grade", "brand": "UltraTech", "unit": "bags", "specification": "53 Grade OPC", "estimated_rate": 380},
    {"name": "Cement PPC", "brand": "ACC", "unit": "bags", "specification": "Portland Pozzolana Cement", "estimated_rate": 360},
    {"name": "TMT Steel 8mm", "brand": "Tata Tiscon", "unit": "kg", "specification": "Fe-500D Grade", "estimated_rate": 72},
    {"name": "TMT Steel 10mm", "brand": "Tata Tiscon", "unit": "kg", "specification": "Fe-500D Grade", "estimated_rate": 72},
    {"name": "TMT Steel 12mm", "brand": "Tata Tiscon", "unit": "kg", "specification": "Fe-500D Grade", "estimated_rate": 70},
    {"name": "TMT Steel 16mm", "brand": "JSW NeoSteel", "unit": "kg", "specification": "Fe-500D Grade", "estimated_rate": 68},
    {"name": "TMT Steel 20mm", "brand": "JSW NeoSteel", "unit": "kg", "specification": "Fe-500D Grade", "estimated_rate": 68},
    {"name": "River Sand", "brand": "Local Approved", "unit": "cft", "specification": "Zone II Fine Aggregate", "estimated_rate": 55},
    {"name": "M-Sand (Manufactured Sand)", "brand": "Robo Sand", "unit": "cft", "specification": "VSI Crushed", "estimated_rate": 45},
    {"name": "20mm Aggregate", "brand": "Local Approved", "unit": "cft", "specification": "Blue Metal 20mm", "estimated_rate": 38},
    {"name": "12mm Aggregate", "brand": "Local Approved", "unit": "cft", "specification": "Blue Metal 12mm", "estimated_rate": 42},
    {"name": "Red Bricks", "brand": "Local Kiln", "unit": "nos", "specification": "Standard 9x4.5x3 inch", "estimated_rate": 8},
    {"name": "AAC Blocks 6 inch", "brand": "Magicrete", "unit": "nos", "specification": "600x200x150mm", "estimated_rate": 52},
    {"name": "AAC Blocks 4 inch", "brand": "Magicrete", "unit": "nos", "specification": "600x200x100mm", "estimated_rate": 38},
    {"name": "Fly Ash Bricks", "brand": "Local Approved", "unit": "nos", "specification": "Standard Size", "estimated_rate": 7},
    {"name": "Waterproofing Chemical", "brand": "Dr. Fixit", "unit": "litre", "specification": "Pidiproof LW+", "estimated_rate": 85},
    {"name": "Tile Adhesive", "brand": "MYK Laticrete", "unit": "bags", "specification": "C2-TE Grade", "estimated_rate": 520},
    {"name": "Wall Putty", "brand": "Birla White", "unit": "bags", "specification": "20kg bag", "estimated_rate": 580},
    {"name": "Primer", "brand": "Asian Paints", "unit": "litre", "specification": "Interior Primer", "estimated_rate": 180},
    {"name": "Emulsion Paint", "brand": "Asian Paints Royale", "unit": "litre", "specification": "Premium Emulsion", "estimated_rate": 380},
    {"name": "Exterior Paint", "brand": "Asian Paints Apex", "unit": "litre", "specification": "Weather-proof Exterior", "estimated_rate": 320},
    {"name": "PVC Pipes 4 inch", "brand": "Astral", "unit": "nos", "specification": "SWR Type-B", "estimated_rate": 380},
    {"name": "PVC Pipes 3 inch", "brand": "Astral", "unit": "nos", "specification": "SWR Type-B", "estimated_rate": 280},
    {"name": "CPVC Pipes 1/2 inch", "brand": "Astral FlowGuard", "unit": "metres", "specification": "SDR-11", "estimated_rate": 85},
    {"name": "CPVC Pipes 3/4 inch", "brand": "Astral FlowGuard", "unit": "metres", "specification": "SDR-11", "estimated_rate": 120},
    {"name": "Electrical Wire 1.5 sqmm", "brand": "Havells Lifeline", "unit": "metres", "specification": "FR-LSH", "estimated_rate": 18},
    {"name": "Electrical Wire 2.5 sqmm", "brand": "Havells Lifeline", "unit": "metres", "specification": "FR-LSH", "estimated_rate": 28},
    {"name": "Electrical Wire 4 sqmm", "brand": "Havells Lifeline", "unit": "metres", "specification": "FR-LSH", "estimated_rate": 42},
    {"name": "Vitrified Floor Tiles 2x2", "brand": "Kajaria", "unit": "sqft", "specification": "600x600mm Glossy", "estimated_rate": 55},
    {"name": "Ceramic Wall Tiles", "brand": "Somany", "unit": "sqft", "specification": "300x450mm Matt", "estimated_rate": 38},
    {"name": "Granite Slab", "brand": "Local Quarry Approved", "unit": "sqft", "specification": "Polished 18mm", "estimated_rate": 120},
    {"name": "Plywood 18mm", "brand": "CenturyPly", "unit": "sqft", "specification": "BWR Grade", "estimated_rate": 85},
    {"name": "Plywood 12mm", "brand": "CenturyPly", "unit": "sqft", "specification": "MR Grade", "estimated_rate": 62},
]

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    project_id = "proj_12f23331b542"
    
    # Check existing
    existing = await db.project_materials.count_documents({"project_id": project_id})
    if existing > 0:
        print(f"Project already has {existing} approved materials. Skipping seed.")
        return
    
    docs = []
    for mat in APPROVED_MATERIALS:
        docs.append({
            "material_id": f"pm_{uuid.uuid4().hex[:12]}",
            "project_id": project_id,
            "name": mat["name"],
            "brand": mat["brand"],
            "specification": mat["specification"],
            "quantity": 0,
            "unit": mat["unit"],
            "estimated_rate": mat["estimated_rate"],
            "from_package": True,
            "modified_by": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    
    result = await db.project_materials.insert_many(docs)
    print(f"Seeded {len(result.inserted_ids)} approved materials for Vinoth Kumar project")

if __name__ == "__main__":
    asyncio.run(seed())
