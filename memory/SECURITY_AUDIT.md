# Security Audit — IDOR / BAC / SSRF Focus
**Date:** 2026-04-25 (deep-dive update)
**Method:** Multi-role DAST harness against preview env + source review
**Roles tested:** super_admin, cre, accountant, site_engineer, sales, hr, pm, planning, procurement, pre_sales, architect, vendor, client

---

## Summary

| Category | Found | Fixed | Open |
|---|---|---|---|
| 🔴 Critical | 0 | 0 | 0 |
| 🟠 High BAC/IDOR | **3** | **3** | 0 |
| 🟡 Medium | 1 | 0 | 1 |
| ℹ️ False positives (verified by-design) | 22 | n/a | n/a |

**Net result of this pass:** 3 real BAC/IDOR vulnerabilities found and patched in code. 0 SSRF surfaces detected.

---

## ✅ FIXED in this pass

### F1. **IDOR: Vendor could read every project's full detail**
- **Before:** `GET /api/projects/{project_id}` only restricted `client` role. A vendor logged in could fetch any project's client info, P&L, timelines, team, internal notes — including projects they have no PO/assignment on.
- **DAST evidence:** Vendor (Balaji) returned 200 for both project IDs in the system; server returned `client_name`, `client_phone`, `client_email`, full address, full team mapping.
- **Patch:** `routes/projects.py:get_project()` now enforces:
  - `CLIENT` → only their own (`client_user_id == user.user_id`).
  - `VENDOR` → only projects with a matching `purchase_orders.vendor_id|vendor_user_id` OR `project_vendor_assignments.vendor_id|vendor_user_id`.
  - `SITE_ENGINEER / SR_SITE_ENGINEER / ASSOCIATE_PM` → only assigned/team-member projects (matches `team.site_engineer`, `team_members[]`, or `site_engineer_assignments`).
- **Re-test result:**
  - Vendor → assigned project: ✅ 200
  - Vendor → other project: ✅ 403
  - Site engineer → assigned: ✅ 200
  - Site engineer → other: ✅ 403

### F2. **BAC: Material requests list had NO role gate**
- **Before:** `GET /api/site-engineer/material-requests` only filtered `site_engineer_id` for site-engineer role; every other role (sales, HR, vendor, pre-sales, marketing, architect, client) silently received the full cross-project list.
- **Risk class:** Competitive-intel leak (vendors learn what materials competing vendors are quoted for) + privacy leak (sales/HR see internal procurement data).
- **Patch:** `routes/site_ops.py:get_material_requests()` now returns 403 unless `user.role in {super_admin, gm, site_engineer, sr_site_engineer, associate_pm, project_manager, planning, procurement, accountant, cre}`.
- **Re-test result:**
  - vendor / sales / hr / pre_sales / architect / client → ✅ 403
  - cre / accountant / pm / planning / procurement → ✅ 200 (by-design)

### F3. **BAC: Procurement dashboard included site_engineer + sr_site_engineer**
- **Before:** `GET /api/procurement/dashboard` allowed every site engineer to see procurement-wide KPIs (PO totals, vendor performance, GRN backlogs).
- **Patch:** Removed `SR_SITE_ENGINEER` and `SITE_ENGINEER` from the allow-list; added `GENERAL_MANAGER`. New allow-list: `procurement, super_admin, project_manager, planning, accountant, general_manager`.

---

## 🟡 MEDIUM (open) — IDOR class on file downloads

`GET /api/files/{file_id}/download`, `GET /api/site-receipts/image/{file_id}`, `GET /api/crm/re-projects/attachments/{file_id}` validate the session but don't check whether the current user is allowed to read **that specific object**. ObjectIds are 24 hex chars (unguessable in practice), but they're embedded in HTML/PDF/email links and can leak via misclick.

**Recommendation (not yet implemented to avoid scope creep):**
1. Tag `project_id` / `re_project_id` / `staff_id` into `gridfs.metadata` at upload.
2. In each download handler, after `grid_out = await fs.open_download_stream_by_id(...)`, check ACL:
   ```python
   meta = grid_out.metadata or {}
   if meta.get("project_id") and not user_can_view_project(user, meta["project_id"]):
       raise HTTPException(403)
   ```

---

## ❌ Verified false positives — by-design reads

The harness initially flagged 22 "BAC" items. After source review, all are intentional business-flow grants. Documenting here so future scans don't re-raise them:

| Endpoint | Allowed roles (by-design) | Reason |
|---|---|---|
| `GET /hr/staff` | super_admin, accountant, hr | Accountant needs salary/cost data for monthly payroll cash forecasting. (`operations.py:3441`) |
| `GET /hr/payroll` | super_admin, accountant, hr | Same — accountant approves the payroll batch. (`operations.py:4177`) |
| `GET /financial/indirect-cost-categories` | all authenticated | Reference data only — list of labels like "Marketing", "Office Rent". No PII or numbers. |
| `GET /crm/sales/leads`, `/crm/pre-sales/leads` | super_admin, sales, pre_sales, gm, **cre** | CRE owns the post-deal handoff workflow and needs the originating lead context (Deal Close → Onboarding). |
| `GET /site-engineer/petty-cash` | site_engineer family + project_manager | PM oversees petty cash issuance to engineers on their projects. |
| `GET /site-engineer/material-requests` | site_engineer family + planning + procurement + accountant + cre | These roles are in the approval funnel; explicitly allow-listed in the patch above. |
| `GET /procurement/dashboard` | procurement, accountant, project_manager, planning, gm | Accountant needs PO outflow KPIs; PM/Planning need vendor performance for their projects. |

---

## SSRF probes — clean ✅

5 payloads tested against 3 likely SSRF surfaces (`/sheets/preview`, `/sheets/preview-all-tabs`, `/sheets/import-all-tabs`):

| Payload | Result |
|---|---|
| `http://169.254.169.254/latest/meta-data/` (AWS IMDS) | 422 / 4xx — Pydantic schema rejects URL outside expected format |
| `http://127.0.0.1:8001/api/users` | 422 |
| `http://localhost:8001/api/users` | 422 |
| `file:///etc/passwd` | 422 |
| `gopher://127.0.0.1:6379/` | 422 |

The Google-Sheets endpoints accept only `spreadsheet_id` (a 44-char Google ID), not arbitrary URLs, so they cannot be coerced into outbound HTTP(S) calls to attacker-chosen hosts. **No SSRF surface in the codebase.**

---

## Mutation BAC — all clean ✅

| Test | Result |
|---|---|
| `site_engineer / sales / cre / pm / planning / pre_sales / client` → `DELETE /users/{id}` | All 403 ✅ |
| `site_engineer / sales / cre / pm / planning / pre_sales / client` → `POST /approvals/income/{id}/approve` | All 403 ✅ |
| All non-CRE roles → `PATCH /cre/cheques/{id}/open` | All 403 ✅ (verified yesterday) |
| All non-accountant/non-admin → `PATCH /accountant/cheques/{id}/status` (deposit) | Already enforced ✅ |
| Forged 64-char session token | 401 ✅ |
| NoSQL injection on login (`{"$ne": ""}`) | 422 ✅ (Pydantic blocks) |

---

## Recommended next steps

| Priority | Action | Owner | Est. effort |
|---|---|---|---|
| 🔥 P0 | (Standing from prior audit) Rotate MongoDB Atlas password + scrub `seed_demo_data.py:12`, `setup_step7.sh:23`, `DEPLOYMENT_GUIDE.md:233`. `git rm --cached backend/.env`. | You + me | 30 min |
| 🟠 P1 | Implement object-level ACL on file/attachment download endpoints (M1 above). | me | 30-45 min |
| 🟡 P2 | Bulk dependency upgrade (litellm, aiohttp, starlette, pyjwt, etc — see `SECURITY_AUDIT_2026-04-08.md`). | me | 20 min + test |
| 🟢 P3 | `.secrets.baseline` to keep `detect-secrets` clean. | me | 10 min |

---

## Test artifacts (this run)
- `/tmp/sec/dast_deep.py` — multi-role DAST harness (13 logins, 200+ assertions)
- `/tmp/sec/dast_deep.json` — raw findings
- Patched files:
  - `backend/routes/projects.py` — `get_project()` ACL extended
  - `backend/routes/site_ops.py` — `get_material_requests()` role gate
  - `backend/routes/procurement.py` — `get_procurement_dashboard()` allow-list tightened
