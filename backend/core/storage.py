"""
Object Storage module - Emergent Object Storage integration with local-disk
fallback so the app works on self-hosted VPS deployments (e.g. Hostinger)
where the Emergent integration endpoint is unavailable.

Selection logic:
  • If LOCAL_UPLOAD_DIR is set OR EMERGENT_LLM_KEY is missing OR the Emergent
    storage init call fails -> use local disk under LOCAL_UPLOAD_DIR
    (default: /var/www/myhomeusb/uploads, falling back to ./uploads).
  • Otherwise use Emergent object storage.
"""
import os
import uuid
import logging
import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "constructionos"

# Local-disk fallback config.
def _resolve_local_dir() -> str:
    explicit = os.environ.get("LOCAL_UPLOAD_DIR")
    if explicit:
        return explicit
    # Sensible default on the production VPS; falls back to repo-relative dir.
    for candidate in ("/var/www/myhomeusb/uploads", "/app/uploads"):
        parent = os.path.dirname(candidate)
        if os.path.isdir(parent):
            return candidate
    return os.path.abspath("./uploads")

LOCAL_UPLOAD_DIR = _resolve_local_dir()

storage_key = None
_use_local = None  # tri-state: None=undecided, True/False once init() has run


def _ensure_local_dir():
    os.makedirs(LOCAL_UPLOAD_DIR, exist_ok=True)


def init_storage():
    """Initialize storage on first use. Returns a truthy marker so callers
    can detect availability. Falls back to local disk if Emergent storage
    is not reachable / not configured."""
    global storage_key, _use_local
    if _use_local is True:
        return "local"
    if storage_key:
        return storage_key

    # Explicit override -> local disk.
    if os.environ.get("LOCAL_UPLOAD_DIR") or not EMERGENT_KEY:
        _use_local = True
        _ensure_local_dir()
        logger.info(f"Object storage: using LOCAL disk at {LOCAL_UPLOAD_DIR}")
        return "local"

    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=15)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        _use_local = False
        logger.info("Object storage initialized successfully (Emergent)")
        return storage_key
    except Exception as e:
        # Emergent storage unreachable (typical on self-hosted VPS). Fall back.
        logger.warning(f"Emergent storage init failed ({e}); falling back to LOCAL disk at {LOCAL_UPLOAD_DIR}")
        _use_local = True
        _ensure_local_dir()
        return "local"


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file. Returns {"path": "...", "size": N}.

    Local mode stores files under LOCAL_UPLOAD_DIR with the same path layout.
    """
    init_storage()
    if _use_local:
        full_path = os.path.join(LOCAL_UPLOAD_DIR, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return {"path": path, "size": len(data)}

    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": storage_key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    """Download file. Returns (content_bytes, content_type)."""
    init_storage()
    if _use_local:
        full_path = os.path.join(LOCAL_UPLOAD_DIR, path)
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Object not found: {path}")
        ext = full_path.rsplit(".", 1)[-1].lower() if "." in full_path else ""
        ctype = MIME_TYPES.get(ext, "application/octet-stream")
        with open(full_path, "rb") as f:
            return f.read(), ctype

    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": storage_key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "pdf": "application/pdf",
    "doc": "application/msword", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv", "txt": "text/plain", "json": "application/json",
}
