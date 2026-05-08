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

### Session — May 8, 2026 — Procurement Dashboard: Sub-tabs + Credit Management 3-step Settlement Chain
- **Frontend** (`/app/frontend/src/components/MetaDateFilter.jsx` — NEW):
  - Reusable Meta Ads-style date filter component with preset chips (Today, Yesterday, Last 7 days, This month, Last month) + Custom range picker. Returns `{from, to, label, preset}` via `onChange`. Default preset configurable.
- **Frontend** (`/app/frontend/src/pages/ProcurementBoardSimple.jsx`):
  - Wrapped Dashboard view in a `DashboardTab` component with two sub-tabs: **Material Req** | **Credit Management**. Tab state persists via `?subtab=` URL param. The Meta date filter sits at top-right and applies to both sub-tabs.
  - `RequestsTab` now accepts `dateRange` prop and filters items client-side on `created_at`.
  - **New `CreditManagementTab`** — fetches `/procurement-simple/credit-ledger?status=all&from_date&to_date`, shows 5 status buckets (Pending / Planning Awaiting / Accountant Awaiting / Paid / All) with counts. Each card shows material, vendor, delivered date, deadline, amount, and a **"Due in X days" / "Overdue by X days"** badge. **"Collect Payment"** button on pending items kicks off the 3-step settlement chain.
- **Frontend** (`/app/frontend/src/components/PlanningRequestsTab.jsx`):
  - Added a new **Credit Settlement** pill (purple, with Banknote icon) on Planning's Requests page.
  - Fetches credit-ledger entries with status `pending_planning_approval`. New `CreditSettlementApprovalList` inline component shows each entry with material/vendor/delivered/deadline plus deadline pill. Buttons: **Approve & Send to Accountant** / **Reject** (with reason).
- **Frontend** (`/app/frontend/src/components/AccountantCreditSettlements.jsx` — NEW):
  - Inline component embedded in Accountant Approvals → Materials sub-tab. Lists entries with status `pending_accountant_approval`. **Release Payment** dialog captures method (bank/cash/cheque), bank ref / cheque #, notes — calls existing `/procurement-simple/credit-ledger/{id}/settle` which records the expense in `db.recorded_expenses` and marks the parent material request as fully paid.
- **Backend** (`/app/backend/routes/procurement.py`):
  - `GET /api/procurement-simple/credit-ledger` extended with optional `from_date` / `to_date` query params filtering on `delivered_at`.
  - `POST /api/procurement-simple/credit-ledger/{ledger_id}/request-settlement` — Procurement triggers; status `pending` → `pending_planning_approval`; notifies Planning users.
  - `POST /api/planning/credit-ledger/{ledger_id}/approve` — Planning approves; status → `pending_accountant_approval`; notifies Accountant users.
  - `POST /api/planning/credit-ledger/{ledger_id}/reject` — Planning rejects with reason; returns to `pending`.
  - The existing `/procurement-simple/credit-ledger/{ledger_id}/settle` (Accountant) now requires `pending_accountant_approval` (Super Admin still allowed to override from any active state for emergency cases).
- **Tested end-to-end via curl** — Procurement (Sneha Reddy) requested settlement on `vc_2bf6d847e7` → status flipped to `pending_planning_approval` → Planning approved → status `pending_accountant_approval` → Accountant settled with bank ref → status `paid`, `expense_id=exp_219928d0be46` recorded in `db.recorded_expenses`. Verified on screenshot: Procurement Dashboard sub-tabs render, date filter dropdown works, 3 entries visible with "Due in X days" / "Overdue Yd" badges.

### Session — May 8, 2026 — SE Materials Tab: Unified Lifecycle Cards UI
- **Frontend** (`/app/frontend/src/pages/SiteEngineerProject.jsx`):
  - Added `LIFECYCLE_BUCKETS` and `bucketForMaterial()` helpers (mirroring `ProcurementBoardSimple.jsx` / `PlanningRequestsTab.jsx`) so the Site Engineer's Materials tab now shows the same 8 unified lifecycle cards: **All / New Request / Planning Awaiting / Revision / Awaiting Accountant / Transit / Credit / Delivered**. Counts update live from `material_requests` and clicking a card filters the list.
  - Replaced the old inner `Tabs` (orders/received) with a single flat list of cards. Each card shows: title, status badge, lifecycle bucket pill, ID, qty/unit, brand, vendor, payment mode, plus a green **Collect** action whenever `canReceive()` is true.
  - Two prominent header buttons:
    - **Request Order** (amber) — opens the existing material request dialog.
    - **Collect Material** (green outline + count badge) — jumps the bucket filter to **Transit**, surfacing the items awaiting collection.
  - Color-coded `border-l-4` accent per bucket (amber / yellow / orange / cyan / sky / purple / emerald / violet).
- **Bug fix** (`/app/frontend/src/components/SiteEngineerWorkOrdersV2.jsx`): Imported missing `Hourglass` icon from `lucide-react` (the page was throwing `ReferenceError: Hourglass is not defined` and not rendering at all).
- **Verified** via screenshot tool with `engineer@constructionos.com` / `Demo@1234` on `proj_classic001` (Swathi 60L G+2): cards render with counts (All=17, Transit=1, Delivered=5, etc), Collect Material button correctly switches to Transit bucket with the in-transit Bricks 9x4x3 item visible.

### Session — May 7, 2026 — HR CSV Bulk Import: Correct Field Mapping + Duplicate Update
- **Frontend** (`/app/frontend/src/pages/HRPortal.jsx`):
  - Replaced naive `line.split(',')` CSV parser with an **RFC4180-compliant parser** that respects quoted commas, escaped quotes and CRLF. This was the root cause — any address like `"2/312 kovalan street, perumbakkam, chennai-600100"` used to split into 3 fields, shifting every column to the right (aadhar landed in bank, basic salary landed in IFSC, etc.).
  - Added a `HEADER_ALIASES` map so human-readable column titles work out of the box: `Joining Date → date_of_joining`, `DOB / Date of Birth → date_of_birth`, `Gross → gross_salary`, `Basic → basic_salary`, `Aadhar / Aadhaar → aadhar_number`, `Current Address → current_address`, `Mobile → phone`, `IFSC → ifsc_code`, `Bank → bank_name`, `Account No → account_number`, etc.
  - Toast summary now shows `updated` count alongside `imported`.
- **Backend** (`/app/backend/routes/operations.py` → `bulk_import_staff`):
  - **Date normalisation**: accepts `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-Mon-YYYY` etc and stores canonical ISO `YYYY-MM-DD` so the UI renders them correctly.
  - **Scientific notation**: Excel-exported numbers like `6.06602E+11` for account numbers / Aadhaar are now converted back to plain digit strings (`"606602000000"`).
  - **`gross_salary` fallback**: if a template has only a single "Gross" column (no basic/hra/da breakdown), we honour it and treat it as basic-only so the breakdown stays self-consistent.
  - **Duplicates now UPDATE instead of skip** (per user request "skip the balance need to update"). Match is by email OR phone. Non-empty fields overwrite existing values; salary fields always overwrite to keep the balance in sync. Update path reports `updated` count separately from `imported` and adds a per-row warning `"UPDATED existing EMP0001"`.
  - Response shape now includes `updated` alongside `imported / skipped_duplicates / skipped_invalid / errors / warnings / total`.
- **Tested end-to-end** with the user's real `employee_import_template (3).csv` (38 rows): 37 imported, 1 correctly rejected (16-digit fake Aadhar), Kumaran's record verified → `date_of_joining=2024-01-01` (was `01-01-2024`), `account_number=606602000000` (was `6.06602E+11`), full comma-containing address preserved. Re-running the same CSV → imported=0, **updated=37** ✅.

### Session — May 6, 2026 — Final Estimate → GM Approval Workflow
- **Backend** (`/app/backend/routes/final_estimates.py`): State machine extended with a GM step.
  - New states: `pending_gm_review`, `rejected_by_gm` (with rejection history).
  - New endpoints:
    - `POST /api/planning/projects/{id}/final-estimate/submit-to-gm` — Planning submits (legacy `send-to-cre` aliased to same function so old UI calls still work).
    - `GET /api/gm/final-estimates` — GM queue (shows pending + rejected pending re-submission).
    - `POST /api/gm/final-estimates/{id}/approve` — GM approves → `pending_cre_review`, notifies CRE.
    - `POST /api/gm/final-estimates/{id}/reject` — body `{reason}` — returns to Planning with reason banner.
    - `GET /api/projects/{id}/fe-total` — returns `{final_estimate_total, additional_total, deduction_total, grand_total}`.
  - Revision bumps correctly on Planning re-submit after GM rejection OR CRE review.
- **Models** (`/app/backend/core/models.py`, `/app/backend/routes/projects.py`): Added optional `name`, `qty`, `price` to `AdditionalCostItem` and `DeductionItem` + all Create/Update/Bulk input models. Backwards compatible — old records continue to work via `description`/`estimated_amount`/`amount`.
- **Frontend Planning** (`ProjectDetail.jsx`): Status banner now handles `pending_gm_review` + `rejected_by_gm`; rejection reason appears in-banner so Planning sees exactly what to fix. Button renamed "Submit to GM" / "Re-submit to GM"; calls the new endpoint. Live **Total Final Estimate Cost** card added: `(Scope + Additional) − Deductions = Grand Total` with per-component breakdown.
- **Frontend GM** (`GMDashboard.jsx`): New **Final Estimate** tab with badge count. Cards show project, revision, status, client info, submit date, and previous rejection reason (if any). Approve / Reject actions. Reject dialog requires a reason.
- **Tested via curl end-to-end**: Planning submit → GM list (1) → GM reject with reason → status `rejected_by_gm` → Planning re-submit (rev 0 → 1) → GM approve → `pending_cre_review` → CRE list includes project (2). `fe-total` returned correct breakdown.

### ⚠️ Deferred for next session
Per your choice **b-i**, the **3 sub-tabs merge** inside Final Estimate (moving Additional Cost + Deductions UI **inside** the FE tab as sub-tabs with Name/Qty/Price/Total columns + removing the standalone top-level tabs) is still pending. Backend supports the new fields; I flagged the full UI refactor because it's a ~400-line restructure of `ProjectDetail.jsx` that would exceed my context budget in one go. Please say "continue merge" in the next session and I'll ship it as focused follow-up work.

### Session — May 6, 2026 — Alternative Phone field on Sales/Pre-Sales leads
- **Backend** (`/app/backend/routes/crm.py`):
  - Added `alternative_phone: Optional[str]` to `Lead`, `LeadCreate`, `AdminLeadCreate`, and `LeadUpdateInput` models — persisted on POST/PATCH.
  - Added `alternative_phone` to lead search regex on both Pre-Sales and Sales list endpoints (skipped dedup query to avoid false-positive imports).
- **Frontend** — Alternative Phone input added on:
  - `MarketingBoard.jsx` Add-Lead dialog (`new-lead-alt-phone`).
  - `CRMPreSales.jsx` Add-Lead and Edit-Lead dialogs (`lead-alt-phone`, `edit-lead-alt-phone`) + lead detail card now shows alt number with "(alt)" tag.
  - `CRMSales.jsx` Edit-Lead dialog (`edit-alt-phone`) + lead detail grid shows "Alt. Phone".
- **Tested via curl**: created → persisted → searchable → PATCH-updated → returned correctly. All 4 places work end-to-end.

### Session — May 6, 2026 — Sales / Pre-Sales Role Transfer (with full pipeline migration)
- **Backend** (`/app/backend/routes/crm.py`): 3 new Super-Admin-only endpoints
  - `GET /api/admin/transfer-sales-role/preview/{from_user_id}` → returns counts (total/open/closed leads, sales_leads, RE projects) + list of eligible target users (any active user without sales/pre_sales role).
  - `POST /api/admin/transfer-sales-role` → atomically: re-verifies SA password, validates source has sales/pre_sales role, validates target is active and free, tags closed leads with `commission_owner` (closed-deal commissions stay with original), reassigns ALL `leads`/`sales_leads` to target with `handover_history` appended, swaps roles (source → `employee`, target → source's role), writes `role_transfer_audit` row, notifies both users.
  - `GET /api/admin/role-transfer-audit` → audit history.
- **Frontend** (`/app/frontend/src/pages/MarketingBoard.jsx`): Sales Team tab now has a **Transfer (↔)** button on every Pre-Sales and Sales row. Click opens a 2-step dialog: Step 1 = preview counts + target picker + reason, Step 2 = re-enter Super Admin password + irreversible-action checkbox.
- **Validation gates verified via curl**: wrong password → 401; target with sales/pre_sales role → 400; missing reason → 400.
- **End-to-end live test** (curl): transferred 945 leads from Kavitha → Amit → confirmed roles flipped, closed lead got `commission_owner=Kavitha` preserved, `handover_history` appended; reverted cleanly.
- **Frontend smoke test passed**: dialog renders, counts show, Next button correctly disabled until target + reason filled.
- **Per-user product choices honored**: (a) full data including remarks/follow-ups (embedded in lead docs); (b-iii) closed-deal commissions stay with original via `commission_owner` flag, future deals belong to new owner; (c-ii) RE Projects' `prepared_by` left untouched — only `assigned_to` flips.

### Session — May 6, 2026 — Production Deploy via SSH
- SSH'd into Hostinger VPS (187.127.152.103) with explicit user consent. Ran `git pull` (21 commits), `pm2 restart backend`, `yarn build`. Startup migration backfilled 2 `site_engineer_assignments` rows (including Mr. Joseph Vijay → Prita). New frontend bundle (`main.4eb27f8a.js`) live. **WARNING**: User shared root SSH password in chat — pending rotation by user.

### Session — May 6, 2026 — Site Engineer Assignment Mirror Fix
- **Bug**: Production project "Mr. Joseph Vijay" had Prita assigned as Site Engineer via Planning's Team Edit dialog, but Prita's Site Engineer dashboard showed "No Projects Assigned".
- **Root cause**: `PATCH /api/projects/{id}/team` only updated `project.team[role]` but never created the matching `site_engineer_assignments` doc. Meanwhile `GET /api/site-engineer/my-projects` queries that collection — so SEs assigned via Planning's dialog never saw their projects.
- **Fix** (`/app/backend/routes/projects.py`): `update_project_team` now mirrors `site_engineer / sr_site_engineer / associate_pm` changes into `site_engineer_assignments` (insert new active row, deactivate old user's row, maintain legacy `assigned_se` shortcut, notify the new assignee). Idempotent — repeated PATCH with same user does not duplicate.
- **Backfill** (`/app/backend/server.py` startup): One-shot migration that scans every project; if `team.site_engineer/sr_site_engineer/associate_pm` is set without an active assignment doc, the doc is created. Idempotent. On preview env created 1 row matching the reported case.
- **Tests** (`/app/backend/tests/test_team_assignment_mirror.py`): 2 end-to-end pytest cases — (1) SE A→B reassignment correctness + idempotency + clear; (2) freshly-assigned SE can fetch `/site-engineer/my-projects` and see the project. Both passing against live API.

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
