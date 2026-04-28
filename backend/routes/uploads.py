"""
Local disk image uploads for User App content (cover photos, package images, etc.).
- On production VPS: stores in /var/www/myhomeusb/uploads/userapp/ (also served by nginx at /uploads/).
- In dev/preview: stores in /app/backend/uploads/userapp/.
- Always exposes a universal GET /api/uploads/file/{filename} so the same URL works in every env
  (Emergent preview only proxies /api/* to the backend).
- Accepts JPG / PNG / WEBP up to 5 MB.
"""
import os
import uuid
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter(tags=["uploads"])

MAX_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}

# Prefer VPS path if writable, otherwise fall back to backend-local dev dir.
_PROD_DIR = Path("/var/www/myhomeusb/uploads/userapp")
_DEV_DIR = Path(__file__).resolve().parent.parent / "uploads" / "userapp"

def _resolve_upload_dir() -> Path:
    if _PROD_DIR.parent.exists() and os.access(_PROD_DIR.parent, os.W_OK):
        _PROD_DIR.mkdir(parents=True, exist_ok=True)
        return _PROD_DIR
    _DEV_DIR.mkdir(parents=True, exist_ok=True)
    return _DEV_DIR

UPLOAD_DIR = _resolve_upload_dir()


def _can_upload(user: User) -> bool:
    return user.role in [
        UserRole.SUPER_ADMIN,
        UserRole.SALES,
        UserRole.PRE_SALES,
        UserRole.MARKETING_HEAD,
    ]


@router.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not _can_upload(user):
        raise HTTPException(status_code=403, detail="Permission denied")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type {ext}. Use JPG, PNG, or WEBP.")
    if file.content_type and file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Max 5MB.")
    if len(contents) < 10:
        raise HTTPException(status_code=400, detail="File appears empty.")

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / filename
    with open(dest, "wb") as f:
        f.write(contents)

    # Universal path — works in preview (via /api) and in prod (via /api or /uploads nginx alias).
    public_path = f"/api/uploads/file/{filename}"
    return {
        "filename": filename,
        "url": public_path,
        "size_bytes": len(contents),
        "content_type": mimetypes.guess_type(str(dest))[0] or file.content_type,
    }


@router.get("/uploads/file/{filename}")
async def get_uploaded_file(filename: str):
    # Basic traversal protection
    if "/" in filename or ".." in filename or not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = UPLOAD_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path,
        media_type=mimetypes.guess_type(str(path))[0] or "image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
