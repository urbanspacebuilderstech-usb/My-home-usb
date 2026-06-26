"""Branding endpoints.

Lets a Super Admin upload a new logo / favicon and change the App display
name from the Settings → Branding tab. Files are written directly into
`/app/frontend/public/` so CRA's static server picks them up immediately;
a version timestamp on the settings doc is used for cache-busting on the
client side.

Feb 26 2026 — Sai Karthick requested an in-app way to swap the
"My Home USB" branding to "Urban Space Builders" without an engineering
deploy.
"""
from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel

from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter()

BRANDING_DOC_ID = "branding_settings_singleton"
PUBLIC_DIR = Path("/app/frontend/public")
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"}
MAX_BYTES = 2 * 1024 * 1024  # 2 MB

# Slot -> target filename in the public folder. We overwrite the existing
# brand assets so all current usages (Login.jsx imports `/logo.webp`,
# `index.html` references `icon-192.png` etc.) keep working unchanged.
_SLOT_TO_FILES = {
    "logo": ["logo.webp"],
    "favicon": ["icon-192.png", "icon-512.png"],
}


class BrandingPatch(BaseModel):
    app_name: Optional[str] = None


async def _get_or_init_doc():
    doc = await db.branding_settings.find_one({"_id": BRANDING_DOC_ID})
    if doc is None:
        doc = {
            "_id": BRANDING_DOC_ID,
            "app_name": "My Home USB",
            "logo_version": 0,
            "favicon_version": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.branding_settings.insert_one(doc)
    return doc


def _shape(doc: dict) -> dict:
    """Return the response shape with cache-busted URLs."""
    lv = doc.get("logo_version") or 0
    fv = doc.get("favicon_version") or 0
    return {
        "app_name": doc.get("app_name") or "My Home USB",
        "logo_url": f"/logo.webp?v={lv}",
        "favicon_url": f"/icon-192.png?v={fv}",
        "favicon_512_url": f"/icon-512.png?v={fv}",
        "logo_version": lv,
        "favicon_version": fv,
        "updated_at": doc.get("updated_at"),
    }


@router.get("/branding")
async def get_branding():
    """Public read — used by every page to load the current app name and
    cache-busted logo URL on mount. No auth required."""
    doc = await _get_or_init_doc()
    return _shape(doc)


@router.patch("/admin/branding")
async def update_branding(payload: BrandingPatch, user: User = Depends(get_current_user)):
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can update branding")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.app_name is not None:
        name = (payload.app_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="App name cannot be empty")
        if len(name) > 80:
            raise HTTPException(status_code=400, detail="App name max 80 characters")
        updates["app_name"] = name
    await db.branding_settings.update_one(
        {"_id": BRANDING_DOC_ID}, {"$set": updates}, upsert=True,
    )
    doc = await db.branding_settings.find_one({"_id": BRANDING_DOC_ID})
    return _shape(doc)


@router.post("/admin/branding/upload")
async def upload_branding_asset(
    slot: str,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload a new logo or favicon. `slot` ∈ {"logo", "favicon"}."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can upload branding assets")
    if slot not in _SLOT_TO_FILES:
        raise HTTPException(status_code=400, detail=f"slot must be one of {list(_SLOT_TO_FILES.keys())}")

    ext = os.path.splitext((file.filename or "").lower())[1]
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type {ext}. Allowed: {sorted(ALLOWED_EXT)}")

    body = await file.read()
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large; max {MAX_BYTES // 1024 // 1024} MB")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    # Write to every target filename in the slot. For the favicon slot we
    # use the SAME bytes for both 192 and 512 px — the browser/PWA can
    # downscale. Power users who want crisp 512 can call us twice.
    for fname in _SLOT_TO_FILES[slot]:
        target = PUBLIC_DIR / fname
        # Best-effort backup of the old asset so we can roll back manually.
        try:
            if target.exists():
                shutil.copy2(target, target.with_suffix(target.suffix + ".bak"))
        except Exception:
            pass
        with open(target, "wb") as out:
            out.write(body)

    field = "logo_version" if slot == "logo" else "favicon_version"
    now = datetime.now(timezone.utc).isoformat()
    new_ver = int(datetime.now(timezone.utc).timestamp())
    await db.branding_settings.update_one(
        {"_id": BRANDING_DOC_ID},
        {"$set": {field: new_ver, "updated_at": now}},
        upsert=True,
    )
    doc = await db.branding_settings.find_one({"_id": BRANDING_DOC_ID})
    return _shape(doc)
