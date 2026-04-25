# Security Audit Report — myhomeusb.com Construction CRM
**Date:** 2026-04-25
**Scope:** SAST (Bandit, Semgrep, detect-secrets), DAST (custom test harness), dependency audit (pip-audit), authN/Z review.
**Codebase:** `/app` (backend FastAPI + frontend React), live target `https://www.myhomeusb.com`.
**Previous audit:** `SECURITY_AUDIT_2026-04-08.md`

---

## Executive Summary

| Category | Count |
|---|---|
| 🔴 **CRITICAL** | 2 |
| 🟠 **HIGH** | 3 |
| 🟡 **MEDIUM** | 4 |
| 🟢 **LOW / Info** | 6 |

The application's runtime authN/Z is **solid** — login is rate-limited (locks after ~8 attempts), all protected endpoints reject unauthenticated calls with 401, forged session tokens are rejected, NoSQL injection on `/auth/login` is blocked by Pydantic, and CORS does not reflect attacker origins with credentials.

The **dominant risk is secret leakage in git history + an outdated dependency stack** with several auth-bypass and DoS CVEs (`litellm`, `aiohttp`, `starlette`, `pyjwt`).

---

## 🔴 CRITICAL Findings

### C1. **Production MongoDB Atlas credentials hard-coded in committed files**
- **Files:**
  - `backend/seed_demo_data.py:12` — fallback default in `os.environ.get("MONGO_URL", "mongodb+srv://urbanspacebuilderstech_db_user:BwrIZOO1GfTYGIbW@constructioncrm.l86s93a.mongodb.net/...")`
  - `hostinger_setup/setup_step7.sh:23`
  - `hostinger_setup/DEPLOYMENT_GUIDE.md:233`
- **Impact:** Anyone with read access to the repo (including past commits if pushed publicly) gets full read/write to the production DB.
- **Fix (in order):**
  1. **Immediately rotate the Atlas password** for `urbanspacebuilderstech_db_user` in MongoDB Atlas. Issue a new connection string.
  2. Update `backend/.env` (only) on the VPS with the new URL. **Never** put the connection string back into a tracked file.
  3. Replace fallback in `seed_demo_data.py` with `os.environ["MONGO_URL"]` (no default — fail-fast).
  4. Remove the URL from `setup_step7.sh` and `DEPLOYMENT_GUIDE.md`. Use `${MONGO_URL}` env-var instead.
  5. (Recommended) Purge from git history with `git filter-repo --replace-text` and force-push.

### C2. **`backend/.env` is committed to git history**
- `.gitignore` line 1129 (`*.env\tbackend/.env`) is malformed; the file was committed before being added.
- File contains: real `MONGO_URL`, `RESEND_API_KEY`, `GOOGLE_SHEETS_CLIENT_ID`/`SECRET`, `EMERGENT_LLM_KEY`.
- **Fix:**
  1. `git rm --cached backend/.env && git commit -m "stop tracking backend/.env"`
  2. **Rotate every secret in that file** — Resend API key, Google OAuth client secret, Emergent LLM key, MongoDB password.
  3. Add a clean `backend/.env.example` template that lists key names with placeholder values.

---

## 🟠 HIGH Findings

### H1. **`litellm 1.80.0` — full authentication-bypass chain (GHSA-69x8-hrgq-fjj8)**
- Three issues combine: weak password hashing + JWT cache prefix collision + missing admin role enforcement on `/config/update`.
- **Fix:** `pip install --upgrade litellm` (≥ 1.81 once patched). If you don't actively need litellm at runtime, remove it from `requirements.txt`.

### H2. **`starlette 0.37.2` — multipart parser DoS (GHSA-f96h-pmfr-66vw, GHSA-2c2j-9gv5-cj73)**
- Starlette buffers entire form fields without filename in memory; large files spool to disk without size cap by default. Your `MAX_FILE_SIZE = 50 MB` is enforced AFTER the body is read, so an attacker can send larger payloads to OOM the worker.
- **Fix:** Pin `starlette>=0.40.0` (compatible with FastAPI 0.115+). Add an explicit `Content-Length` check before reading.

### H3. **`aiohttp 3.13.3` — auth-cookie leak on cross-origin redirects (GHSA-966j-vmvw-g2g9)**
- aiohttp drops `Authorization` header but **retains cookies** when redirecting to a different origin → could leak session cookies if any backend code makes outbound HTTP via aiohttp.
- **Fix:** `pip install --upgrade aiohttp` to ≥ 3.14.

### Other dependency CVEs in the same upgrade pass:
| Package | Current | Recommended | CVE |
|---|---|---|---|
| `pyjwt` | 2.10.1 | ≥ 2.11.0 | GHSA-752w-5fwx-jx9f (`crit` header bypass) |
| `cryptography` | 46.0.3 | ≥ 47.0.5 | name-constraint validation gap |
| `requests` | 2.32.5 | ≥ 2.33 | GHSA-gc5v-m9x4-r6x2 |
| `pillow` | 12.1.0 | ≥ 12.2.0 | OOB-write on PSD; unbounded GZIP on FITS |
| `python-multipart` | 0.0.21 | ≥ 0.0.22 | path traversal w/ `UPLOAD_DIR` |
| `pymongo` | 4.5.0 | ≥ 4.7.0 | OOB read in BSON |

Run `pip-audit -r backend/requirements.txt --fix` to bulk-update where safe, then `pip freeze > backend/requirements.txt`.

---

## 🟡 MEDIUM Findings

### M1. **No object-level ACL on file downloads** *(IDOR class)*
- Endpoints: `GET /api/files/{file_id}/download`, `GET /api/site-receipts/image/{file_id}`, `GET /api/crm/re-projects/attachments/{file_id}`.
- They check the session is valid, but **do not** check whether the calling user is allowed to access *that specific file* (e.g. is on the project team, owns the receipt). 24-char hex `ObjectId`s are not guessable but are exposed in HTML/PDFs and can leak via misclick or sharing.
- **Fix:** After GridFS lookup, check ACL:
  ```python
  meta = grid_out.metadata or {}
  if meta.get("project_id") and not _user_can_view_project(user, meta["project_id"]):
      raise HTTPException(403, "Forbidden")
  ```
  Add `project_id`/`re_project_id` to GridFS metadata at upload time.

### M2. **CORS reflects `*` for unknown origins** *(defense-in-depth)*
- DAST showed `Origin: evil.example.com` → response `Access-Control-Allow-Origin: *`. The browser blocks credential cookies due to missing `Allow-Credentials`, but the wildcard hides bugs and surprises.
- **Fix:** Restrict CORS to known frontends only:
  ```python
  ALLOWED = ["https://www.myhomeusb.com", "https://crm-onboard-flow.preview.emergentagent.com"]
  app.add_middleware(CORSMiddleware, allow_origins=ALLOWED, allow_credentials=True, ...)
  ```

### M3. **`POST /api/hr/attendance/essl-sync-key` uses non-constant-time hash compare**
- `routes/hr.py` compares with `!=` which is a theoretical timing oracle.
- **Fix:** `import hmac; hmac.compare_digest(key_hash, settings.get("sync_key_hash") or "")`.

### M4. **Bandit `B608` — string-built SQL in `essl_sync.py`**
- Lines 156 & 292 build a SELECT with `f"... [{table}] ..."`. Table/column names come from registry/config not user input, so practical risk is low — but defend in depth.
- **Fix:** Validate with `re.match(r"^[a-zA-Z0-9_]+$", table)` before interpolation.

---

## 🟢 LOW / Informational

| ID | Finding | Note |
|---|---|---|
| L1 | `0.0.0.0` bind in `main.py:54` | Required inside K8s pod; not a real issue. |
| L2 | PostHog public key in `index.html` | Designed to be public — ignore. |
| L3 | 73 detect-secrets hits in `backend/tests/` | Test fixtures (e.g. `Test@1234`). Add `.secrets.baseline` to mute. |
| L4 | `frontend/plugins/visual-edits/dev-server-setup.js:16` | Regex pattern, not an actual password. |
| L5 | Aadhar/PAN stored as plaintext (`HRPortal.jsx`) | Already in backlog as "Encrypted Aadhar upload". |
| L6 | Login rate limit is per-IP only | Add per-account lockout for distributed bruteforce. |

---

## DAST Test Suite — All Pass ✅

| Test | Result |
|---|---|
| `auth/me` leaks password hash? | ❌ No — only `user_id, email, name, picture, role, phone, created_at` returned |
| Login rate-limited? | ✅ Locked after 8 attempts |
| Anonymous → `/projects /cre/cheques /accountant/cheques /auth/me /users` | ✅ All return **401** |
| Forged 64-char session token | ✅ Rejected with **401** |
| Random ObjectId on `/crm/re-projects/attachments/<oid>` | ✅ Returns **404** |
| CORS reflection of `evil.example.com` with credentials | ⚠️ See M2 (no cookie leak, but wildcard) |
| NoSQL injection `{"$ne": ""}` on login | ✅ Blocked by Pydantic (**422 string_type**) |
| SSRF / open redirect | n/a — no URL-accepting endpoints surfaced |

---

## Recommended Remediation Order

### 🚨 TODAY (CRITICAL)
1. Rotate MongoDB Atlas password + all keys in `backend/.env` (Resend, Google OAuth, Emergent LLM).
2. Update `backend/.env` on VPS with new values.
3. `git rm --cached backend/.env`. Scrub MongoDB URL from `seed_demo_data.py`, `setup_step7.sh`, `DEPLOYMENT_GUIDE.md`.

### 📅 THIS WEEK (HIGH)
4. Bulk dependency upgrade: `litellm aiohttp starlette pyjwt cryptography requests pillow python-multipart pymongo`. Re-run pytest.

### 🎯 NEXT SPRINT (MEDIUM)
5. Object-level ACL on file download endpoints (M1).
6. CORS allow-list (M2).
7. `hmac.compare_digest` on sync-key endpoint (M3).
8. SQL identifier validator in `essl_sync.py` (M4).

### 📋 BACKLOG (LOW)
9. `.secrets.baseline` to keep future scans clean.
10. Encrypt Aadhar/PAN at rest (already on roadmap).
11. Per-account login lockout in addition to per-IP.

---

## Tooling Reference
- **Bandit 1.9.4** → 100 findings (97 LOW, 3 MEDIUM)
- **Semgrep 1.161** with `p/security-audit + p/secrets + p/owasp-top-ten + p/python + p/javascript` → **0 findings** on 175 files
- **detect-secrets 1.5.0** → 77 raw hits, **4 prod-relevant** after triage
- **pip-audit 2.9.0** → 36 vulnerable deps in `requirements.txt`
- **Custom DAST harness** (`/tmp/sec/dast.py`) → 8 active tests, **0 findings**

Raw outputs (this run):
- `/tmp/sec/bandit.json`
- `/tmp/sec/semgrep.json`
- `/tmp/sec/secrets.json`
- `/tmp/sec/pipaudit.json`
- `/tmp/sec/dast.json`
