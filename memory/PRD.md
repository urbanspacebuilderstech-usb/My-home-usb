# Construction CRM — Product Requirements Document

## Original Problem Statement
Full-stack Construction CRM (React + FastAPI + MongoDB) for managing pre-sales leads, sales pipeline, project management, HR/payroll, and site operations. Key workflows include automated lead handoff from Pre-Sales → Sales, biometric attendance tracking, and payment processing.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI components
- **Backend**: FastAPI (port 8001), prefix `/api`
- **Database**: MongoDB Atlas (`construction_crm`) + Local MongoDB on Hostinger VPS
- **Auth**: Session cookies (not Bearer tokens)
- **Routes**: `/hr-portal`, `/crm-pre-sales`, `/crm-sales`, `/projects`, `/accounts`
- **Hosting**: Emergent (dev/preview) + Hostinger VPS KVM 4 (production at www.myhomeusb.com)

## What's Been Implemented

### Session — May 6, 2026 — Labour Contractor Tabbed Dialog Overhaul
- **Backend** (`/app/backend/core/models.py`, `/app/backend/routes/procurement.py`):
  - `LabourContractor` model now persists `daily_rate_skilled`, `daily_rate_semi_skilled`, `daily_rate_unskilled` (₹/day) and an `is_locked` flag (visual marker only — admin override allowed).
  - `LabourContractorInput` rewritten with all fields `Optional` so PATCH supports partial updates (e.g., `{is_locked: true}` alone). POST still enforces `name` explicitly.
  - New `GET /api/labour-contractors/{id}/payment-summary` returns dual-perspective aggregates: (a) Work Orders → count, total, paid, pending = total − paid, AND (b) Payment Requests → raised / collected / pending. Plus per-project breakdown.
  - New `GET /api/contractor-types/{type_id}/contractors` lists active contractors that include the type in their `work_types`.
- **Frontend** (`/app/frontend/src/pages/PlanningBoard.jsx`):
  - Add/Edit Contractor dialog refactored into a tabbed layout: **Basic** (name/phone/email/address/work types/lock toggle), **Bank** (bank/account/IFSC), **Employee Prices** (per-skill cards), and (edit-only) **Payment Summary** (Work-Order stats + Payment-Request stats + Projects table).
  - Lock/unlock action added to each row in the contractors table; locked rows show a red **Locked** badge.
  - Contractor Types table now has a **View** (eye) button — opens a side dialog listing every contractor under that type, with a quick-edit link back into the main contractor dialog.
- **Tests passed**: backend 16/16 (pytest fixture `/app/backend/tests/test_contractor_dialog_overhaul.py`), frontend 100% of testable flows (Playwright). 0 critical / 0 minor issues.

### Session — Feb 2026 (Fork) — CRE Final Estimate Tab Restyle
- **`CREBoard.jsx`**: Replaced the table-based Final Estimate tab with the same status-card + grouped-project-card layout used in the Planning Board's Rough Estimates tab.
  - Top row: 4 clickable summary cards — `Awaiting You` (pending_cre_review), `In Revision @ Planning` (review_pending), `Approved` (approved), and `All`.
  - Below: project cards grouped by selected status with project code, revision, status badge, review count badge, client/location/sent-date/FE total, and existing `View / Approve / Review` actions.
  - GM-approval logic intentionally omitted — Final Estimate flow does not involve GM.
  - New state `feActiveTab` (default `'awaiting'`) drives the filter.

### Session — May 5, 2026 — Performance Pass: Indexes + Snappier Planning Board
- **Root cause discovered**: Production MongoDB is `mongodb+srv://...` (Atlas) — every query crosses the public internet adding ~240ms each. With 7 parallel calls per Planning Board load, total wait was 1.5–2s, causing the "0 then 2 then 10" flicker as Atlas latency varied.
- **Backend (`backend/server.py`)**: Added 11 critical MongoDB indexes — `projects.{project_id, planning_status+is_archived+is_deleted, status+sent_to_planning_at, is_archived+archived_at, lead_id, re_project_id, created_at, client_phone}`, `notifications.{user_id+created_at, user_id+read}`, `material_requests.{project_id+status}`, plus `material_expenses/labour_expenses/income/expenses` per-project indexes. Verified `IXSCAN` plan via `.explain()`. Each index init is now wrapped individually so a single conflict (e.g. legacy `users.email`) no longer aborts the rest.
- **Frontend (`PlanningBoard.jsx`)**:
  - Auto-refresh slowed from **15s → 60s** (kills the race-condition where stale auto-refresh responses overwrite manual sub-tab fetches).
  - `fetchSubTabProjects` now uses a `useRef` fetch-id guard so rapid tab clicks discard stale responses (no more "0/2/10" flicker).
  - Replaced "Loading projects…" placeholder with **animated skeleton rows** (5 rows × 7 columns) so the table layout stays put and users see a clear loading state.
- **Migration to local MongoDB**: New `backend/scripts/migrate_atlas_to_local.py` (idempotent, batch-copy script, with progress) plus `MIGRATION_TO_LOCAL_MONGO.md` runbook. After running this on the VPS and switching `MONGO_URL=mongodb://localhost:27017`, expected query latency drops from 241ms → ~5ms (~5× total speedup).

### Session — May 5, 2026 — Planning Handover Hardened (Legacy Data Fix)
- **Issue**: Production showed a project ("RE - Mr. Joseph Vijay") in Planning Board's New Projects tab while the project's actual status was still `pending_payment` (waiting on accountant approval). Root cause: legacy projects had `planning_status='new'` set without ever going through the explicit CRE `send-to-planning` handoff.
- **Hardened gate**: Both planning list endpoints now require explicit `sent_to_planning_at` (set only by `/cre/projects/{id}/send-to-planning`) before listing a project as "new" — independent of `planning_status` value.
  - `GET /api/planning/projects-filtered?planning_status=new` → adds `sent_to_planning_at exists & not null`.
  - `GET /api/planning/projects?status=new` → splits the `in_planning` branch to also require `sent_to_planning_at`; `planning_review` / `planning` (already past Planning's first action) bypass the gate.
- Soft-deleted projects are now also excluded from `/planning/projects` (was missing).
- Verified end-to-end: legacy project with `planning_status=new` + `status=in_planning` but NO `sent_to_planning_at` is correctly hidden from both endpoints. After `send-to-planning` is invoked, the project re-appears with the timestamp set.

### Session — May 5, 2026 — Planning Handover & Archive Tab Fix
- **CRE → Planning Handover Gate**: Backend `PATCH /api/cre/projects/{id}/send-to-planning` now flips `planning_status: pending_planning → new` (and stamps `planning_new_date`) in addition to setting `status='in_planning'`. Projects that were freshly converted via `convert-deal` no longer "leak" into the Planning Board's New Projects tab until the CRE explicitly hands them over. Notification fires to all `planning` users on send-to-planning.
- **Planning Board "Archive Projects" Tab Fix**: `PlanningBoard.jsx` had a stale `useEffect` guard that compared `activeTab === 'all_projects'` (always false — `all_projects` lives under `dashSubTab`, not `activeTab`). This blocked the fetch on every sub-tab switch (only the initial 'new' load worked). Switched the guard to `dashSubTab === 'all_projects'`. Archive / Current / Delivered tabs now correctly fetch & render from `/api/planning/projects-filtered`.
- **Verified end-to-end** via curl + Playwright — projects with `pending_planning` are hidden from /new, archived projects render in the Archive sub-tab, and `send-to-planning` correctly promotes them.

### Session — April 28, 2026 — Share Package Link Dialog Width Fix
- **Bug**: Pre-Sales' `🎁 Share Package Link` dialog rendered narrow; long package URL pushed inner flex content wider than the dialog, clipping labels ("eting message", "lic Package URL") and the URL input.
- **Fix** in `CRMPreSales.jsx` (`PackageLinkShareDialog`):
  - Dialog widened: `max-w-md` → `max-w-xl` (576px).
  - URL `<Input>` now `flex-1 min-w-0` so it shrinks inside its flex row instead of overflowing.
  - Preview `<pre>` got `break-all` so long URLs wrap cleanly.
- ESLint clean. Change is frontend-only; deploy with same `git pull + yarn build + pm2 restart`.

### Session — April 28, 2026 — White Screen on `/user-app` (Pre-Sales)
- **Bug**: `<AppHeader />` in `UserApp.jsx` was called without a `user` prop. `AppHeader.jsx:254` unconditionally evaluated `role.replace(...)` which threw `TypeError: Cannot read properties of undefined (reading 'replace')`, crashing the whole tree into a white screen. Affected any role opening `/user-app` (visible to Pre-Sales & Sales because Super Admin hit other routes first).
- **Fix (2 files)**:
  - `AppHeader.jsx` — made line 254 safe: `{role ? role.replace(/_/g, ' ') : ''}` and `{user?.name || ''}`. Header now renders even while the user object is still hydrating.
  - `UserApp.jsx` — now fetches `/auth/me` on mount and passes `user` prop to `<AppHeader user={user} />` (matches Dashboard/CRMSales/CRMPreSales pattern).
- **Verified**: Logged in as `presales@constructionos.com`, navigated to `/user-app`, page renders fully (Kavitha Nair / PRE SALES chip, all 4 tabs, Generic portfolio link card, testimonial cards). Zero runtime errors.

### Session — April 28, 2026 — Force-Refresh UX Fix
- **Auth caching on force-refresh**: App now hydrates the user state instantly from `sessionStorage` (`mhu_user_cache`) so a browser refresh no longer shows the "Authenticating…" white-screen flash.
  - `App.js` — `cachedUser` seeded from `sessionStorage`; `getAuthUser()` persists on success, removes only on 401/403; `ProtectedRoute` starts `isAuthenticated = true` when cache exists and revalidates `/auth/me` silently in the background. 429/5xx blips on a cached user no longer flash the spinner.
  - `Login.jsx` — writes `sessionStorage.setItem('mhu_user_cache', user)` on successful login.
  - `AppHeader.jsx` + `Login.jsx` — call `window.__clearAuthCache()` on logout/re-login, which removes the sessionStorage key.
  - **Verified via Playwright**: spinner NOT visible immediately after `page.reload()`; cache persists through refresh. Ready to deploy.

### Session — April 27, 2026 (Latest — Custom RE Share Links)
- **Pivot from Prospect Login → Public Token URL** (`/quote/:token`): Sales now share Rough Estimates via a no-login link that expires in 30 days. New module `/app/backend/routes/quote_links.py` (HMAC-signed token = `quote_id.signature[:24]`).
  - Backend endpoints (under `/api`):
    - `POST /leads/{lead_id}/generate-quote-link` — creates link, auto-revokes prior live link, advances lead to `stg_re_to_client` (requires RE to be GM-approved).
    - `GET /leads/{lead_id}/quote-link` — returns `{link, status: live|expired|none}` for the header chip.
    - `GET /public/quote/{token}` — no-auth public quote view; returns `{expired:true, sales_person:{...}}` once 30d elapse.
    - `POST /public/quote/{token}/book-appointment` — public form drops a NEW lead tagged `client_appointment` back to the original sales person + notification.
    - `POST /leads/{lead_id}/regenerate-re` — clones the RE with `revision++`, sends back to Planning with remarks, lead → `stg_re_request`, notification to all_planning.
    - `GET /leads/{lead_id}/timeline` — unified events feed (stages + follow-ups + appointment + payment + quote_links).
  - Frontend:
    - New page `PublicQuoteView.jsx` (mobile-first, mounted at `/quote/:token` BEFORE ProtectedRoute) with **live-quote view** (full RE + 30d countdown chip + Call-Sales CTA) and **expired view** (sales contact card + appointment booking form).
    - `CRMSales.jsx` — "Move to RE Client" replaced with **"Generate RE Link"** + **"Regenerate RE"** buttons. Live/Expired chip + clickable URL with copy. RE Link events appear in the lead Timeline tab. Stage move to `stg_re_to_client` now auto-generates the link (no popup needed).
  - Auto-revoke + signed token = old links return 410 as soon as a fresh link is generated.
  - **Testing**: 15/15 backend pytest cases pass (test_quote_links.py). Frontend public view verified live; data-testids confirmed for detail-generate-re-link-btn / regen-submit-btn / quote-link-status-chip / appt-submit-btn.

### Session — April 27, 2026 (earlier in same day)
- Auto-move lead to **`stg_project_onboarded`** when accountant approves an Advance Income.
- Sales appointment card now displays Site Engineer + Project name on Site Visit / Project Visit stages.
- Quote details expanded to show full Scope items, per-sqft math, and a "What's Included" panel.

### Session — April 23, 2026
- **Unified "Pay & Settle" workflow (Accountant)**: New `PayApprovalDialog` (cheque / current-account / savings / cash with denomination split). Auto-applies vendor's existing suspense balance, computes net payable, and books excess from over-paid cheques back to suspense. Wired into Material + Labour approval rows alongside the legacy Approve/Reject.
  - Backend: `GET /api/approvals/{type}/{id}/pay-context` + `POST /api/approvals/{type}/{id}/pay` (financial.py)
  - Fixed material→`material_expenses` collection mapping (was incorrectly pointing to `material_requests`)

### Session — April 21–22, 2026
- **Unified Accountant Date Filter (P0)**: `CashbookDateFilter` component (Meta-style range picker + Month/Year dropdowns, defaulting to current month) now drives filtering across ALL accountant tabs — Cashbook, Approvals (Income + Expense), Cheque Management (by `cheque_date`), and Project-Wise Summary (refetches `/accountant/cashbook-filtered`). Summary counts & totals now reflect the active range.
- **Timeline Ascending Sort**: Lead Timeline (Pre-Sales + Sales) unifies & sorts events by actual timestamp; Follow-ups split into "Scheduled" + "Closed" events
- **Sales Stages Restructured (13 stages)**: New Appointment → Office Visit → Followup → Client Land Visit → Our Projects Visit → RE-Request → RE-Planning → RE-Client → Negotiation → Deal Close (renamed from Payment Collect) → Accountant Approval → Project Onboarded → Lost. Auto-migration for old stages (Discussion→Followup, Deal Closed→Deal Close, Site Visit Done→RE Request)
- **Sales Header Cleanup**: Removed "Sales CRM" & "RE Projects" text from top nav; added RE Projects button in toolbar
- **Sales UI Parity with Pre-Sales**: Follow-up dialog with Date+Time+Remarks; Quick Record/New buttons on list view; Colorful 2-row stage summary with counts
- **Top 5 old stat cards removed** (Total Leads / Deal Closed / Advance Collected / RE Requested / Converted)
- **Stage tabs scrollbar**: Slim 6px scrollbar no longer overlays tab text
- **UnitSelect Portal + 110+ Construction Units**: Dropdown renders via createPortal with fixed positioning (smart flip-up near bottom), pointer-events+stopPropagation for Radix Dialog, searchable, 11 categories (Count/Weight/Volume/Area/Length/Packaging/Transport/Construction/Electrical/Work/Misc)
- **RE Template Dialog upgrades**: max-w-5xl, table-fixed layout, full-width Description Input
- **RE Edit Dialog upgrades**: max-w-5xl, table-fixed, widened columns
- **NEW: "Use Template" sub-popup inside RE Edit**: Search templates, apply via Replace or Append mode — then edit/reorder/delete/add manually before submit to GM
- **Production deploys**: All changes shipped to www.myhomeusb.com via SSH + git pull + yarn build + pm2 restart

### Session — April 2026
- **Round-Robin Fix**: Sales/Pre-Sales users see ONLY their assigned leads. Fixed $or overwrite bug in search. Enhanced assign_lead_to_next_user with team validation.
- **Google Sheets OAuth Fix**: Dynamic redirect_uri from FRONTEND_URL — works on preview and live domains
- **Hostinger VPS Deployment**: Ubuntu, Node.js 20, Python 3.13, MongoDB 7, Nginx, SSL (Let's Encrypt), PM2, UFW firewall
- **Date Filters on All Projects**: Month, Year, Date Range, Status filters
- **Driver Designation**: Added to HR dropdown
- **Fix Unassigned Leads Endpoint**: POST /api/crm/fix-unassigned-sales-leads (fixes both sales + pre-sales)
- **Migration Endpoint**: POST /api/crm/migrate-stages (restores all 16 sales stages + 7 pre-sales stages)

### Earlier Session — April 2026
- **Biometric Sync Key UI**: Super Admin can generate/revoke eSSL sync keys from HR Settings
- **Department dropdown**: 9 departments
- **Designation dropdown**: 38+ company-specific job titles + Driver
- **Employee Terminate/Left History**: Active/Left toggle, Leave History dialog, Permanent Delete
- **Sort filters**: Added to Active Employees, Left Employees, Roles & Credentials tables
- **Pre-Sales → Sales Transfer Fix**: Transfer triggers on stage_id
- **Unassigned Leads Fix**: Pre-Sales & Sales users now see own leads only
- **Date Filter Fix**: Pre-Sales & Sales no longer default to today's date
- **Missing Stages Auto-Fill**: New RNR Leads + New Appointment auto-created
- **Round-Robin Distribution**: Auto-detects active users, sequential assignment

### Previous Sessions
- eSSL biometric auto-sync script + CSV upload fallback
- API Security Audit
- Bi-directional Email/Name sync
- HR Password Reset, Setup lockdown, Demo Access blocking
- Pre-Sales daily follow-up filter + auto-move
- HR Attendance UI (Day/Month views)
- Sales Kanban with automated onboarding pipeline
- Site Visit management system
- Follow-up management system

## Pending / Upcoming Tasks
- 🟢 [DONE] Custom expiring RE share link + Sales Timeline view (Apr 27)
- 🔴 [P1] Open Stage flow verification — Site Engineer payments on locked stages
- 🔴 [P1] File Download IDOR — object-level ACL on `/files/{id}/download` and `/crm/re-projects/attachments/{id}`
- 🔴 [P0] PaySprint escrow integration (waiting for API credentials)
- 🔴 [P1] Interakt WhatsApp auto-send for RE links/Welcome (parked by user)
- 🔴 [P0] Unified Attendance (SE GPS + Biometric + Manual Punch + Leave CL/SL)
- 🔴 [P0] Automated Payroll
- 🟡 [P1] Refactor bloated files (CRMSales.jsx 3300+, AccountsBoard.jsx, ProjectDetail.jsx 5600+, HRPortal.jsx 1600+)
- 🔵 [P2] Cleanup — remove unused `prospect.py` / `CreateProspectUserDialog.jsx` / `ProspectApp.jsx` legacy auth flow
- 🔵 [P2] Sr. Engineer → Jr. Engineer assignment
- 🔵 [P2] Aadhar Document Upload
- 🔵 [P2] Cash Denomination feature

## Key API Endpoints
- POST /api/crm/migrate-stages — Fix missing stages in production
- POST /api/crm/fix-unassigned-sales-leads — Fix unassigned leads via round-robin
- POST /api/hr/attendance/essl-sync — Biometric sync
- GET /api/hr/terminated-staff — Left employees with leave history
- DELETE /api/hr/staff/{id}/permanent — Permanent delete
- POST /api/hr/attendance/generate-sync-key — Generate eSSL sync key
- GET /api/marketing/dashboard — Marketing overview (auto-refreshes distribution)
- POST /api/marketing/distribution-settings/refresh — Refresh team members

## Hostinger VPS Details
- IP: 187.127.152.103
- Domain: www.myhomeusb.com
- OS: Ubuntu
- Stack: Node.js 20, Python 3.13, MongoDB 7, Nginx, PM2
- SSL: Let's Encrypt (auto-renew)
- Firewall: UFW (22, 80, 443)

## Test Reports
- /app/test_reports/iteration_146.json (100% pass rate)
- /app/test_reports/iteration_147.json (100% pass rate)
- /app/test_reports/iteration_148.json (100% pass rate)
