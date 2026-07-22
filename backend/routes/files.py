"""
File Upload & Download Routes
Uses Emergent Object Storage for production file management
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import io
import os
import zipfile

from core.database import db, fs
from core.deps import get_current_user
from core.models import User, UserRole
from core.storage import put_object, get_object, init_storage, APP_NAME, MIME_TYPES

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

ALLOWED_EXTENSIONS = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg',
    'mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav',
    'zip', 'rar', '7z',
    'dwg', 'dxf',  # CAD files for construction
}

BLOCKED_EXTENSIONS = {'exe', 'bat', 'cmd', 'sh', 'php', 'py', 'js', 'vbs', 'ps1', 'msi', 'dll', 'com', 'scr'}


@router.post("/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("general"),
    project_id: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    user: User = Depends(get_current_user)
):
    """Upload a file to object storage"""
    # File type validation
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not allowed for security reasons.")
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' is not supported. Allowed: images, documents, videos, CAD files.")

    data = await file.read()

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum {MAX_FILE_SIZE // (1024 * 1024)}MB.")

    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/{category}/{user.user_id}/{file_id}.{ext}"

    try:
        result = put_object(storage_path, data, content_type)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="File upload failed")

    file_record = {
        "file_id": file_id,
        "storage_path": result.get("path", storage_path),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": category,
        "project_id": project_id,
        "uploaded_by": user.user_id,
        "uploaded_by_name": user.name,
        "description": description,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.files.insert_one(file_record)

    return {
        "file_id": file_id,
        "filename": file.filename,
        "size": file_record["size"],
        "content_type": content_type,
        "category": category,
        "url": f"/api/files/{file_id}/download",
        "created_at": file_record["created_at"]
    }


@router.get("/files/{file_id}/download")
async def download_file(file_id: str, request: Request):
    """Download a file by file_id. Supports cookie-based auth."""
    # Auth check via cookie
    session_token = request.cookies.get("session_token")
    auth_param = request.query_params.get("auth")
    token = session_token or auth_param

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        # Legacy fallback: attachments uploaded before the unified object-storage
        # migration were saved to GridFS with the ObjectId as their file_id. Try
        # GridFS so older addition-section files keep working without migration.
        try:
            from bson import ObjectId
            try:
                oid = ObjectId(file_id)
            except Exception:
                raise HTTPException(status_code=404, detail="File not found")
            gf = await fs.open_download_stream(oid)
            data = await gf.read()
            meta = gf.metadata or {}
            content_type = meta.get("contentType") or "application/octet-stream"
            filename = gf.filename or "file"
            return Response(
                content=data,
                media_type=content_type,
                headers={
                    "Content-Disposition": f'inline; filename="{filename}"',
                    "Cache-Control": "private, max-age=3600",
                },
            )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="File not found")

    try:
        sp = record.get("storage_path", "")
        if sp.startswith("gridfs://"):
            # GridFS-stored blob (production VPS without object storage init).
            from bson import ObjectId
            gf_id = sp.replace("gridfs://", "", 1)
            gf = await fs.open_download_stream(ObjectId(gf_id))
            data = await gf.read()
            content_type = record.get("content_type") or (gf.metadata or {}).get("contentType") or "application/octet-stream"
        else:
            data, content_type = get_object(sp)
    except Exception as e:
        logger.error(f"Download failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail="File download failed")

    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={
            "Content-Disposition": f'inline; filename="{record.get("original_filename", "file")}"',
            "Cache-Control": "private, max-age=3600"
        }
    )


async def _load_file_bytes(record: dict) -> bytes:
    sp = record.get("storage_path", "")
    if sp.startswith("gridfs://"):
        from bson import ObjectId
        gf = await fs.open_download_stream(ObjectId(sp.replace("gridfs://", "", 1)))
        return await gf.read()
    data, _ = get_object(sp)
    return data


@router.get("/files/download-zip")
async def download_files_zip(project_id: str, category: str, request: Request):
    """Bulk-download every file in a project/category as a single zip.
    Same cookie-based auth as the single-file download route above (so a
    plain <a>/window.open link works without an XHR Authorization header)."""
    session_token = request.cookies.get("session_token")
    auth_param = request.query_params.get("auth")
    token = session_token or auth_param
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    records = await db.files.find(
        {"project_id": project_id, "category": category, "is_deleted": False}, {"_id": 0}
    ).to_list(500)
    if not records:
        raise HTTPException(status_code=404, detail="No files found for this category")

    buf = io.BytesIO()
    used_names = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for rec in records:
            try:
                data = await _load_file_bytes(rec)
            except Exception as e:
                logger.error(f"Zip download skip {rec.get('file_id')}: {e}")
                continue
            name = rec.get("original_filename") or rec.get("file_id") or "file"
            base, ext = os.path.splitext(name)
            candidate, i = name, 1
            while candidate in used_names:
                candidate = f"{base}_{i}{ext}"
                i += 1
            used_names.add(candidate)
            zf.writestr(candidate, data)

    if not used_names:
        raise HTTPException(status_code=500, detail="Could not read any files for this category")

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{category}.zip"'},
    )


@router.get("/files")
async def list_files(
    category: Optional[str] = None,
    project_id: Optional[str] = None,
    user: User = Depends(get_current_user)
):
    """List files with optional filters"""
    query = {"is_deleted": False}
    if category:
        query["category"] = category
    if project_id:
        query["project_id"] = project_id

    files = await db.files.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

    for f in files:
        f["url"] = f"/api/files/{f['file_id']}/download"

    return files


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, user: User = Depends(get_current_user)):
    """Soft-delete a file"""
    record = await db.files.find_one({"file_id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    await db.files.update_one(
        {"file_id": file_id},
        {"$set": {"is_deleted": True, "deleted_by": user.user_id, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {"message": "File deleted"}


# ---------------------------------------------------------------------------
# Project Process Image categories — a fixed, admin-orderable list of photo
# sections (Bhoomi Pooja, Roof Pooja, ...) shown on every project's Documents
# > Project Process Image tab. Order is global (one list for all projects),
# stored the same way as other single-document settings (see app_settings
# usage in routes/home_packages.py).
# ---------------------------------------------------------------------------

DEFAULT_PROCESS_IMAGE_CATEGORIES = [
    {"key": "bhoomi_pooja", "label": "Bhoomi Pooja"},
    {"key": "thalavasal_pooja", "label": "Thalavasal Pooja"},
    {"key": "roof_pooja", "label": "Roof Pooja"},
    {"key": "key_handover", "label": "Key Handover"},
    {"key": "booking", "label": "Booking"},
    {"key": "house_warming", "label": "House Warming"},
    {"key": "elevation", "label": "Elevation"},
    {"key": "interior", "label": "Interior"},
    {"key": "site_photos", "label": "Site Photos"},
    {"key": "others", "label": "Others"},
]

PROCESS_IMAGE_CATEGORY_EDIT_ROLES = [UserRole.SUPER_ADMIN, UserRole.PLANNING, UserRole.PROJECT_MANAGER]


@router.get("/process-image-categories")
async def get_process_image_categories(user: User = Depends(get_current_user)):
    """Ordered list of Project Process Image sections. Falls back to the
    default order until a Super Admin/Planning/PM reorders them at least once."""
    doc = await db.app_settings.find_one({"key": "process_image_categories"}, {"_id": 0})
    categories = doc.get("categories") if doc else None
    return {"categories": categories or DEFAULT_PROCESS_IMAGE_CATEGORIES}


@router.put("/process-image-categories")
async def set_process_image_categories(payload: dict, user: User = Depends(get_current_user)):
    """Persist a new display order for the Project Process Image sections.
    Global (applies to every project) — restricted to roles that manage
    project structure, same set that can delete project documents."""
    if user.role not in PROCESS_IMAGE_CATEGORY_EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    categories = payload.get("categories")
    if not isinstance(categories, list) or not categories:
        raise HTTPException(status_code=400, detail="categories must be a non-empty list")
    for c in categories:
        if not isinstance(c, dict) or not c.get("key") or not c.get("label"):
            raise HTTPException(status_code=400, detail="Each category needs a key and label")

    await db.app_settings.update_one(
        {"key": "process_image_categories"},
        {"$set": {
            "key": "process_image_categories",
            "categories": categories,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.user_id,
            "updated_by_name": user.name,
        }},
        upsert=True,
    )
    return {"categories": categories}


# ---------------------------------------------------------------------------
# Project Process Image links — an external URL (e.g. a Google Drive folder)
# attached to one project's category, shown alongside uploaded photos for
# teams that keep the actual gallery elsewhere. Per project+category, unlike
# the category list above which is global.
# ---------------------------------------------------------------------------

@router.get("/process-image-links")
async def list_process_image_links(project_id: str, category: str, user: User = Depends(get_current_user)):
    links = await db.process_image_links.find(
        {"project_id": project_id, "category": category}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return links


@router.post("/process-image-links")
async def add_process_image_link(payload: dict, user: User = Depends(get_current_user)):
    project_id = (payload.get("project_id") or "").strip()
    category = (payload.get("category") or "").strip()
    url = (payload.get("url") or "").strip()
    label = (payload.get("label") or "").strip()
    if not project_id or not category or not url:
        raise HTTPException(status_code=400, detail="project_id, category and url are required")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Link must start with http:// or https://")

    doc = {
        "link_id": str(uuid.uuid4()),
        "project_id": project_id,
        "category": category,
        "url": url,
        "label": label or url,
        "added_by": user.user_id,
        "added_by_name": user.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.process_image_links.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/process-image-links/{link_id}")
async def delete_process_image_link(link_id: str, user: User = Depends(get_current_user)):
    result = await db.process_image_links.delete_one({"link_id": link_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"message": "Link deleted"}
