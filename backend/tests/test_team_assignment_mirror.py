"""
Regression test for the Site Engineer assignment bug:

PATCH /api/projects/{id}/team must mirror site_engineer assignments into the
`site_engineer_assignments` collection so the SE dashboard can list the project.
"""
import os
import uuid
import asyncio

import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load backend env so MONGO_URL points at the same DB the API uses
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "construction_crm")


def _login_super_admin():
    """Login and return a session that sends the session cookie regardless of Secure flag."""
    sess = requests.Session()
    r = sess.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@constructionos.com", "password": "Demo@1234"},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    # FastAPI sets session_token cookie with Secure=True; over plain HTTP requests'
    # default jar drops it. Re-attach explicitly so it's sent on subsequent calls.
    token = r.cookies.get("session_token")
    if token is None:
        # Fallback: parse from raw header
        for c in sess.cookies:
            if c.name == "session_token":
                token = c.value
                break
    assert token, f"No session_token cookie: {dict(r.cookies)}  headers={r.headers}"
    sess.cookies.set("session_token", token)
    sess.headers.update({"Cookie": f"session_token={token}"})
    return sess


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def test_patch_team_mirrors_into_site_engineer_assignments():
    """Assigning a SE via /projects/{id}/team must create an active row in site_engineer_assignments."""
    pid = f"test_proj_{uuid.uuid4().hex[:8]}"
    uid_a = f"test_se_a_{uuid.uuid4().hex[:8]}"
    uid_b = f"test_se_b_{uuid.uuid4().hex[:8]}"

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    async def _seed():
        await db.projects.insert_one({
            "project_id": pid,
            "name": "Mr. Joseph Vijay (test)",
            "team": {},
            "is_deleted": False,
        })
        await db.users.insert_many([
            {"user_id": uid_a, "name": "Prita A", "role": "site_engineer", "is_active": True, "email": f"a_{uid_a}@t.com"},
            {"user_id": uid_b, "name": "Prita B", "role": "site_engineer", "is_active": True, "email": f"b_{uid_b}@t.com"},
        ])

    async def _cleanup():
        await db.projects.delete_one({"project_id": pid})
        await db.users.delete_many({"user_id": {"$in": [uid_a, uid_b]}})
        await db.site_engineer_assignments.delete_many({"project_id": pid})

    async def _fetch_active(uid):
        return await db.site_engineer_assignments.find_one(
            {"project_id": pid, "user_id": uid, "is_active": True}, {"_id": 0}
        )

    async def _count_active(uid):
        return await db.site_engineer_assignments.count_documents(
            {"project_id": pid, "user_id": uid, "is_active": True}
        )

    try:
        _run(_seed())
        sess = _login_super_admin()

        # 1) Assign SE A
        r = sess.patch(f"{BASE_URL}/api/projects/{pid}/team", json={"site_engineer": uid_a}, timeout=30)
        assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"
        a = _run(_fetch_active(uid_a))
        assert a is not None, "Assignment doc was NOT created for SE A"
        assert a.get("project_name") == "Mr. Joseph Vijay (test)"

        # 2) Reassign to SE B — A's assignment must be deactivated, B's created
        r = sess.patch(f"{BASE_URL}/api/projects/{pid}/team", json={"site_engineer": uid_b}, timeout=30)
        assert r.status_code == 200, r.text
        assert _run(_fetch_active(uid_a)) is None, "SE A's old assignment was NOT deactivated"
        assert _run(_fetch_active(uid_b)) is not None, "Assignment for SE B was NOT created"

        # 3) Idempotent re-PATCH with same SE B → no duplicate
        sess.patch(f"{BASE_URL}/api/projects/{pid}/team", json={"site_engineer": uid_b}, timeout=30)
        cnt = _run(_count_active(uid_b))
        assert cnt == 1, f"Expected exactly 1 active assignment, got {cnt}"

        # 4) Clear SE — assignment must be deactivated
        r = sess.patch(f"{BASE_URL}/api/projects/{pid}/team", json={"site_engineer": None}, timeout=30)
        assert r.status_code == 200
        assert _run(_fetch_active(uid_b)) is None, "Clearing SE did NOT deactivate the assignment"
    finally:
        _run(_cleanup())


def test_my_projects_returns_assigned_project():
    """End-to-end: SE's /site-engineer/my-projects must return the project after team-PATCH."""
    pid = f"test_proj_{uuid.uuid4().hex[:8]}"
    se_email = f"se_{uuid.uuid4().hex[:8]}@test.com"
    se_password = "Test@1234"
    se_uid = f"test_se_{uuid.uuid4().hex[:8]}"

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    from passlib.context import CryptContext
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async def _seed():
        await db.projects.insert_one({
            "project_id": pid,
            "name": "E2E Test Project",
            "team": {},
            "is_deleted": False,
            "status": "in_progress",
        })
        await db.users.insert_one({
            "user_id": se_uid,
            "name": "Test SE",
            "role": "site_engineer",
            "is_active": True,
            "email": se_email,
            "password_hash": pwd_ctx.hash(se_password),
            "password_set": True,
            "created_at": "2026-05-06T00:00:00+00:00",
        })

    async def _cleanup():
        await db.projects.delete_one({"project_id": pid})
        await db.users.delete_one({"user_id": se_uid})
        await db.site_engineer_assignments.delete_many({"project_id": pid})

    try:
        _run(_seed())
        admin = _login_super_admin()
        r = admin.patch(f"{BASE_URL}/api/projects/{pid}/team", json={"site_engineer": se_uid}, timeout=30)
        assert r.status_code == 200, r.text

        se_sess = requests.Session()
        r = se_sess.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": se_email, "password": se_password},
            timeout=30,
        )
        assert r.status_code == 200, f"SE login failed: {r.text}"
        se_token = r.cookies.get("session_token")
        assert se_token, "No SE session_token cookie returned"
        se_sess.headers.update({"Cookie": f"session_token={se_token}"})

        r = se_sess.get(f"{BASE_URL}/api/site-engineer/my-projects", timeout=30)
        assert r.status_code == 200, r.text
        projects = r.json()
        ids = [p.get("project_id") for p in projects]
        assert pid in ids, f"Project {pid} missing from SE's my-projects: {ids}"
    finally:
        _run(_cleanup())
