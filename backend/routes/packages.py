"""
Package Management & Rough Estimates
- Enhanced Package CRUD with tag, lock/duplicate
- Brand management (create inline)
- Rough Estimates per package (G+1/G+2/G+3)
- Reorder support for list items
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter()


# ==================== MODELS ====================

class BrandCreate(BaseModel):
    name: str
    category: Optional[str] = None

class RoughEstimateItem(BaseModel):
    name: str = ""
    unit: str = "nos"
    amount: float = 0
    qty: float = 0
    total: float = 0
    remarks: str = ""

class RoughEstimateCreate(BaseModel):
    package_id: str
    name: str
    floor_config: str  # G+1, G+2, G+3
    items: List[RoughEstimateItem] = []

class RoughEstimateUpdate(BaseModel):
    name: Optional[str] = None
    items: Optional[List[RoughEstimateItem]] = None

class PackageDuplicate(BaseModel):
    new_name: str
    new_tag: Optional[str] = None

class ReorderRequest(BaseModel):
    item_ids: List[str]  # Ordered list of IDs


# ==================== BRANDS ====================

@router.get("/brands")
async def get_brands(category: Optional[str] = None, user: User = Depends(get_current_user)):
    """Get all brands, optionally filtered by category (material name)"""
    query = {}
    if category:
        query["category"] = {"$regex": f"^{category}$", "$options": "i"}
    brands = await db.brands.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return brands


@router.post("/brands")
async def create_brand(data: BrandCreate, user: User = Depends(get_current_user)):
    """Create a new brand (no special permission needed)"""
    existing = await db.brands.find_one({"name": {"$regex": f"^{data.name}$", "$options": "i"}, "category": {"$regex": f"^{data.category}$", "$options": "i"} if data.category else None})
    if existing:
        return {"brand_id": existing.get("brand_id"), "name": existing.get("name"), "category": existing.get("category"), "exists": True}

    brand = {
        "brand_id": f"brand_{uuid.uuid4().hex[:8]}",
        "name": data.name,
        "category": data.category,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.brands.insert_one(brand)
    brand.pop("_id", None)
    return brand


# ==================== MATERIAL NAMES (simple master list) ====================

@router.get("/material-names")
async def get_material_names(user: User = Depends(get_current_user)):
    """Get all material names for dropdown"""
    names = await db.material_names.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return names


@router.post("/material-names")
async def create_material_name(data: dict, user: User = Depends(get_current_user)):
    """Create a new material name (no approval needed)"""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = await db.material_names.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        existing.pop("_id", None)
        return {**existing, "exists": True}
    entry = {
        "material_name_id": f"mn_{uuid.uuid4().hex[:8]}",
        "name": name,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.material_names.insert_one(entry)
    entry.pop("_id", None)
    return entry


# ==================== PACKAGE ENHANCEMENTS ====================

@router.post("/packages/{package_id}/lock")
async def lock_package(package_id: str, user: User = Depends(get_current_user)):
    """Lock a package (no further edits)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    result = await db.packages.update_one(
        {"package_id": package_id},
        {"$set": {"is_locked": True, "locked_at": datetime.now(timezone.utc).isoformat(), "locked_by": user.user_id}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Package not found")
    return {"status": "locked"}


@router.post("/packages/{package_id}/duplicate")
async def duplicate_package(package_id: str, data: PackageDuplicate, user: User = Depends(get_current_user)):
    """Duplicate a package (creates an editable copy)"""
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    original = await db.packages.find_one({"package_id": package_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Package not found")

    new_pkg = {**original}
    new_pkg["package_id"] = f"pkg_{uuid.uuid4().hex[:12]}"
    new_pkg["name"] = data.new_name
    new_pkg["tag"] = data.new_tag or original.get("tag", "")
    new_pkg["code"] = f"{original.get('code', 'X')}_COPY"
    new_pkg["is_locked"] = False
    new_pkg["locked_at"] = None
    new_pkg["locked_by"] = None
    new_pkg["created_by"] = user.user_id
    new_pkg["created_at"] = datetime.now(timezone.utc).isoformat()
    new_pkg["updated_at"] = datetime.now(timezone.utc).isoformat()
    new_pkg["duplicated_from"] = package_id

    await db.packages.insert_one(new_pkg)
    return {"package_id": new_pkg["package_id"], "message": "Package duplicated"}


# ==================== ROUGH ESTIMATES ====================

@router.get("/packages/{package_id}/rough-estimates")
async def get_rough_estimates(package_id: str, user: User = Depends(get_current_user)):
    """Get all rough estimates for a package"""
    estimates = await db.rough_estimates.find(
        {"package_id": package_id, "is_active": True}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return estimates


@router.post("/rough-estimates")
async def create_rough_estimate(data: RoughEstimateCreate, user: User = Depends(get_current_user)):
    """Create a rough estimate under a package"""
    pkg = await db.packages.find_one({"package_id": data.package_id}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    items = []
    for i, item in enumerate(data.items):
        items.append({
            "item_id": f"rei_{uuid.uuid4().hex[:8]}",
            "sno": i + 1,
            "name": item.name,
            "unit": item.unit,
            "amount": item.amount,
            "qty": item.qty,
            "total": round(item.amount * item.qty, 2),
            "remarks": item.remarks
        })

    estimate = {
        "estimate_id": f"re_{uuid.uuid4().hex[:12]}",
        "package_id": data.package_id,
        "package_name": pkg.get("name"),
        "name": data.name,
        "floor_config": data.floor_config,
        "items": items,
        "total_value": sum(it["total"] for it in items),
        "is_active": True,
        "created_by": user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rough_estimates.insert_one(estimate)
    estimate.pop("_id", None)
    return estimate


@router.get("/rough-estimates/{estimate_id}")
async def get_rough_estimate(estimate_id: str, user: User = Depends(get_current_user)):
    """Get a rough estimate by ID"""
    est = await db.rough_estimates.find_one({"estimate_id": estimate_id}, {"_id": 0})
    if not est:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return est


@router.patch("/rough-estimates/{estimate_id}")
async def update_rough_estimate(estimate_id: str, data: RoughEstimateUpdate, user: User = Depends(get_current_user)):
    """Update a rough estimate"""
    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        update["name"] = data.name
    if data.items is not None:
        items = []
        for i, item in enumerate(data.items):
            items.append({
                "item_id": f"rei_{uuid.uuid4().hex[:8]}",
                "sno": i + 1,
                "name": item.name,
                "unit": item.unit,
                "amount": item.amount,
                "qty": item.qty,
                "total": round(item.amount * item.qty, 2),
                "remarks": item.remarks
            })
        update["items"] = items
        update["total_value"] = sum(it["total"] for it in items)

    result = await db.rough_estimates.update_one({"estimate_id": estimate_id}, {"$set": update})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "updated"}


@router.delete("/rough-estimates/{estimate_id}")
async def delete_rough_estimate(estimate_id: str, user: User = Depends(get_current_user)):
    """Soft delete a rough estimate"""
    await db.rough_estimates.update_one({"estimate_id": estimate_id}, {"$set": {"is_active": False}})
    return {"status": "deleted"}


# ==================== REORDER ====================

@router.post("/reorder/{entity_type}/{parent_id}")
async def reorder_items(entity_type: str, parent_id: str, data: ReorderRequest, user: User = Depends(get_current_user)):
    """Reorder items within an entity (scope, materials, labour, rough_estimates, payment_stages)"""
    collection_map = {
        "rough_estimates": "rough_estimates",
        "scope": "packages",
        "materials": "packages",
        "labour": "packages",
    }
    coll_name = collection_map.get(entity_type)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")

    if entity_type == "rough_estimates":
        for i, item_id in enumerate(data.item_ids):
            await db.rough_estimates.update_one(
                {"estimate_id": item_id},
                {"$set": {"sort_order": i}}
            )
    else:
        field_map = {"scope": "scope_items", "materials": "material_items", "labour": "labour_items"}
        field = field_map.get(entity_type)
        pkg = await db.packages.find_one({"package_id": parent_id}, {"_id": 0, field: 1})
        if not pkg:
            raise HTTPException(status_code=404, detail="Package not found")

        items = pkg.get(field, [])
        item_map = {item.get("item_id"): item for item in items}
        reordered = []
        for item_id in data.item_ids:
            if item_id in item_map:
                reordered.append(item_map[item_id])

        for item in items:
            if item.get("item_id") not in data.item_ids:
                reordered.append(item)

        await db.packages.update_one({"package_id": parent_id}, {"$set": {field: reordered}})

    return {"status": "reordered"}


# ==================== PROJECT - PACKAGE INTEGRATION ====================

@router.post("/projects/{project_id}/apply-package")
async def apply_package_to_project(project_id: str, package_id: str, user: User = Depends(get_current_user)):
    """Apply a package to a project - copies materials and rough estimates"""
    project = await db.projects.find_one({"project_id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    package = await db.packages.find_one({"package_id": package_id}, {"_id": 0})
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    # Copy materials. Carry the Planning-locked unit and unit price downstream
    # so Final Estimate / Material Requests / POs can render them read-only.
    # `is_locked_from_package=True` + `locked_estimated_rate` + `locked_unit`
    # are the canonical lock signals — any consumer that wants to enforce
    # "Planning locked the price" should check `is_locked_from_package`.
    materials_copy = []
    for m in package.get("material_items", []):
        materials_copy.append({
            "material_id": f"mat_{uuid.uuid4().hex[:8]}",
            "name": m.get("name", ""),
            "brand": m.get("brand", ""),
            "specification": m.get("specification", ""),
            "quantity": m.get("quantity", 0),
            "unit": m.get("unit", "nos"),
            "estimated_rate": m.get("estimated_rate", 0),
            "locked_unit": m.get("unit", "nos"),
            "locked_estimated_rate": m.get("estimated_rate", 0),
            "is_locked_from_package": True,
            "source": "package",
            "source_package_id": package_id
        })

    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {
            "package_id": package_id,
            "package_name": package.get("name"),
            "package_tag": package.get("tag"),
            "package_materials": materials_copy,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    return {"status": "package_applied", "materials_count": len(materials_copy)}
