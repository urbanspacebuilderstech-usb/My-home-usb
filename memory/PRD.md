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

### Session — Feb 12, 2026 — CRE Payment Schedule: Preserve "Pending Accountant Approval" on Partial Rows (P0)
- **Status**: ✅ COMPLETE & DEPLOYED.
- **User report**: asdf row in CRE PS shows **Partial** even though the ₹500 collected is still awaiting accountant approval. User wants "Awaiting Accountant" (existing badge: "Pending Accountant Approval") until accountant approves.
- **Root cause** (`/app/backend/routes/operations.py` L2260-2261 in `/planning/monthly-schedule`):
  - Every partially-collected stage gets split into `collected_portion` + `balance_portion` virtual rows. The code zeroed out `pending_approval_count` for ANY `virtual_kind`, killing the orange badge on the only row actually visible (the balance_portion).
- **Fix**: Zero out `pending_approval_count` ONLY for `collected_portion` rows. balance_portion + non-virtual rows preserve the count so the frontend can correctly render "Pending Accountant Approval" while income remains in `pending_approval` status.

### Session — Feb 12, 2026 — Section Pay Request Polish: One Undo, Footer Honors Accountant, Hide Add (P0)
- **Status**: ✅ COMPLETE & DEPLOYED to VPS (`main.bb78266d.js` live).
- **User asks** (3 in one message):
  1. *"asdf is waiting for account approve but shows Received ₹500. Account approve then only show received amount."* — Section footer was bleeding `income_received` even before accountant approval.
  2. *"once I click Pay Request, button hide; one section one undo icon (not per row)."* — Replace N per-row Undo buttons with ONE section-level Undo.
  3. *"Once request send hide add item button."* — Lock the section so no new rows can be appended once in payment flow.
- **Fixes**:
  - **Frontend** (`/app/frontend/src/pages/ProjectDetail.jsx`):
    - Section footer `received` aggregator now: `Σ (cre_approved ? income_received : 0)` — pending CRE collections no longer count.
    - New `sectionRequested` flag (any row with `payment_requested && !cre_approved && balance > 0`) drives 3 UI gates: hides Pay Request, hides "+ Add", shows section-level Undo.
    - New section-level Undo button (`data-testid=section-undo-pay-request-*`) next to Pay Request slot. Calls new backend endpoint.
    - Per-row Undo button + per-row "With CRE · Undo" UI removed (now just a status pill).
    - New `handleCancelSectionPayment(sectionId, title)` helper with confirm dialog.
  - **Backend** (`/app/backend/routes/projects.py`):
    - NEW `POST /api/projects/{project_id}/addition-sections/{section_id}/cancel-payment-request` — deletes the consolidated section payment_stage and clears `payment_requested` + `linked_stage_id` on every linked row. Refuses if `amount_received > 0` (rejection flow must be used instead). Role-gated to Planning + Super Admin.

### Session — Feb 12, 2026 — Section Pay Request: Consolidated Single Line in CRE (P0)
- **Status**: ✅ COMPLETE & DEPLOYED to VPS (bundle `main.4efe9a23.js` live).
- **User ask**: "in CRE … no need to show in [a] single line item — show only section title and section total amount". Previously the section Pay Request looped over 5 rows and produced 5 stages on the CRE Payment Schedule.
- **Backend** (`/app/backend/routes/projects.py`):
  - NEW `POST /api/projects/{project_id}/addition-sections/{section_id}/request-payment` — bundles all client-approved rows with open balance into ONE `payment_stages` doc with `stage_name = section.title`, `amount = Σ balances`, `linked_addition_ids = [cost_ids]`, `is_section_addition = true`. Idempotent on retries.
  - Forward auto-heal (Project full-details) extended to handle section stages: distributes `amount_received` pro-rata across linked rows.
- **Backend** (`/app/backend/routes/financial.py`):
  - `_sync_addition_cost_received` now branches on `is_section_addition` — on reverse paths (income rejected / sent-for-correction / cheque bounced) it re-syncs each linked row pro-rata.
- **Frontend** (`/app/frontend/src/pages/ProjectDetail.jsx`):
  - New `handleRequestSectionPayment(sectionId, date)` helper makes a single POST.
  - `reqPayDialog` submit path for `mode === 'addition_section'` now calls that helper (was looping 5×).
  - Toast surfaces the bundled count + amount.

### Session — Feb 12, 2026 — Section "Pay Request" Button Visibility Fix (P0)
- **Status**: ✅ COMPLETE & DEPLOYED.
- **Round 1 bug**: JS `c.balance ?? (q * r)` returned 0 when DB stored `balance: 0` explicitly → button hidden.
- **Round 2 bug** (real root cause): DB rows actually use `qty / price / estimated_amount / income_received` — not `quantity / unit_rate / amount / balance`. All those latter names were `null` so `computeOpen` returned 0 for every row.
- **Fix** (`/app/frontend/src/pages/ProjectDetail.jsx` ~L7565): `computeOpen` now reads `qty`, `price`, `estimated_amount`, `income_received` (the same fields the table totals use at L7784). Removed the duplicate older "Req Payment (N)" button that had the same broken logic. ✅ User confirmed via screenshot that Pay Request button now renders correctly.

### Session — Feb 7, 2026 — Global DLR Dialog Redesign + Addition Income-Received Rollback (P0/P1)
- **Status**: ✅ COMPLETE & TESTED (testing_agent_v3_fork iteration_163 — 4/4 backend pytest pass, frontend Global DLR confirmed end-to-end)
- **Frontend** (`/app/frontend/src/components/SiteEngineerWorkOrdersV2.jsx`):
  - Replaced the simple "pick contractor" Global DLR dialog with a tabbed `GlobalDLRDialog` (one tab per contractor) + `ContractorDLRCard` (stat strip · From/To date filters · Open-Stage dropdown · existing DLR list · `Record DLR` opens existing DLRRecordDialog).
  - Stage dropdown lists ONLY currently open stages (is_open=true AND no in-flight RAB), same rule already used by DLRRecordDialog.
- **Backend** (`/app/backend/routes/financial.py`):
  - NEW helper `_sync_addition_cost_received(stage_id)` re-syncs `additional_costs.income_received` to the linked payment_stage's `amount_received` (idempotent · clears `cre_approved` when below threshold).
  - Wired into 3 reverse paths: `reject_income` (both branches), `send_income_for_correction`, `bounce_cheque` (per-stage reduction loop). Fixes the long-standing "ghost income_received" issue in Client Portal / Planning boards.
- **Tests**: `/app/backend/tests/test_addition_income_received_sync.py` (4 cases — reject/correction/bounce + forward approve regression).



### Session — Jun 5, 2026 — RAB Phase 2: Planning OTP Gate on Signed RAB Downloads (P1)
- **Status**: ✅ COMPLETE & DEPLOYED (curl-tested all 6 paths)
- **Backend** (`/app/backend/routes/projects.py`):
  - NEW `POST /api/projects/{pid}/work-orders/{woid}/rabs/{rid}/download-otp/send` — generates 6-digit OTP, SHA-256 hash stored in `db.rab_download_otps` with 10-min TTL, plain code emailed (Resend) to the Planning user who approved THIS RAB (looked up via `planning_approved_by`).
  - MODIFIED `GET .../rabs/{rid}/pdf` — now accepts `?otp=XXXXXX`. Verifies hash, single-use (sets `used=true` on successful verify), expiry-bounded, then returns the existing FPDF stream. Super Admin bypasses for audit/recovery.
- **Frontend** (`/app/frontend/src/components/RABDetailDialog.jsx`):
  - NEW `RabDownloadOtpDialog` — 2-step modal launched from Download button. Step 1: "Send OTP to Planning" → masked email confirmation. Step 2: numeric-only 6-digit input + "Verify & Download" → fetches PDF with `?otp=`.
  - Download button now shows `ShieldCheck + Download` icons to signal the gate.
- **Tests (curl, local)**: SA bypass=200/PDF · No OTP=401 · Wrong OTP=401 · Send OTP=200/masked email · Correct OTP=200/PDF · Replay=401 'already used'.
- **Deployed to VPS**: `git pull && yarn build && pm2 restart backend` — PM2 status online.



### Session — Feb 3, 2026 — Cheque Suspense Account Flow (P0)
- **Status**: ✅ COMPLETE & TESTED (`test_cheque_suspense_lifecycle.py` 2/2 PASS)
- **Backend** (`/app/backend/routes/financial.py`):
  - Fixed `_request_collection_and_keys` for `petty_cash`: corrected collection name (`petty_cash`, not `petty_cash_requests`); now reads `amount_requested → amount_issued → amount_spent` and uses `requested_by_name` for vendor key (SE-level suspense).
  - `pay-context` + `pay` endpoints now consistently key petty_cash suspense by `requested_by` (Site Engineer) so SE-level credit rolls forward across multiple petty cash requests.
  - Extracted `_suspense_key()` helper inside the pay endpoint so debit + credit ledger entries are perfectly mirrored (avoid drift bugs).
  - **Edge case fix**: when payable=0 (suspense fully covers the bill), payment-method-specific validation is now skipped — Accountant can submit without selecting any cheque/cash/bank.
- **Frontend** (`/app/frontend/src/components/PayApprovalDialog.jsx`):
  - `submit()` now detects `fullyCovered = payable <= 0` and short-circuits validation; payload omits cheque_ids/transaction_id/denominations and defaults method to `cash` for the audit trail.
  - Existing Active/Inactive cheque tabs + search + multi-select + auto excess-to-suspense math preview were already in place — verified end-to-end via test.
- **Tests**:
  - `/app/backend/tests/test_cheque_suspense_lifecycle.py` (NEW, 2 cases):
    1. Over-pay flow: bill ₹90K + ₹100K cheque → ₹10K suspense → next ₹110K expense for same vendor → suspense auto-applied, payable ₹100K via current_account → final balance ₹0.
    2. Partial-consumption flow: existing ₹10K suspense → small ₹3K bill → consumes ₹3K, leaves ₹7K carry-forward.
- **User confirmed choices**: vendor_name keyed (b), applies to Material + Labour + Petty-Cash (b), full-consumption + carry-forward (c-i).
- **Note**: Existing `PayApprovalDialog` UI already shows CRE-opened cheques in Active tab and locked cheques in Inactive tab with "Request to Open" CTA. Backend `GET /api/approvals/{type}/{id}/pay-context` returns both lists. No new UI work needed beyond the fully-covered edge case.


### Session — Jun 2, 2026 — Super Architect → Workflow Master Setup Redirect (P0)
- **Status**: ✅ COMPLETE & TESTED (Playwright smoke: login → /workflow-master → 13 role rows + Edit buttons rendered)
- **Frontend** (`/app/frontend/src/App.js`): Imported `WorkflowMasterPage`; registered `Route path="/workflow-master"`; added `super_architect: '/workflow-master'` to `getRoleRedirect()`.
- **Frontend** (`/app/frontend/src/pages/Login.jsx`): Mirror `getRoleRedirect()` updated with `super_architect: '/workflow-master'` so the post-login redirect goes straight to the page (no Finance Board flash).
- **Frontend** (`/app/frontend/src/pages/Dashboard.jsx`): Added explicit role guard — if `userRes.data?.role === 'super_architect'` → `window.location.replace('/workflow-master')`. Also added the same mapping to the `roleRoutes` lookup that handles direct `/dashboard` URL access.
- **Backend** (`/app/backend/routes/projects.py`): `GET /admin/workflow-master/roles` and `PUT /admin/workflow-master/roles/{role}` now accept `user.role in ("super_admin", "super_architect")` (was `super_admin` only). Verified live with curl using the seeded preview user — 13 roles returned, 0 → super_architect now full control.
- **Seed** (preview only): Created `superarchitect@constructionos.com` / `Demo@1234` (role=super_architect) via inline script for testing. Production user `superarchitect@myhomeusb.com` was created in the previous session and is unchanged.

## What's Been Implemented

### Session — Feb 28, 2026 — Stage 2: Additional Costs 4-Step Approval UI (P0)
- **Status**: ✅ COMPLETE & TESTED (iteration_161: 9/9 backend, 100% frontend)
- **Backend** (`/app/backend/routes/projects.py`):
  - NEW endpoint `GET /api/cre/additional-costs` — returns rows in post-GM band (awaiting_client + client_approved) joined to project_name/client_name. Scoped by team.cre/created_by for CRE; 403 for non-CRE/non-superadmin.
- **Frontend — ProjectDetail.jsx**:
  - 8 new handlers wired: `submitAdditionForReview`, `phApproveAddition`, `phRejectAddition`, `gmApproveAddition`, `gmRejectAddition`, `submitSectionForReview`, `phApproveSection`, `gmApproveSection`.
  - Inline row Status column now surfaces the new chain: created/rejected → "Submit for Review" (PP); ph_review → "Pending PH" + PH Approve/Reject (PH); gm_review → "Pending GM" + GM Approve/Reject (GM); rejected → "Rejected at PH/GM: <reason>" + Resubmit (PP).
  - Section toolbar + Ungrouped toolbar show smart batch buttons "Submit N for Review", "PH Approve (N)", "GM Approve (N)" — only the action eligible for that role at the current item statuses.
  - **Legacy direct "Send to Client" button removed** in favor of the new pipeline.
- **Frontend — CREBoard.jsx**:
  - New tab "Additional Costs" with red badge count for pending-client + need-CRE-action items.
  - Three sub-tabs: Pending Client / Client Approved · Need CRE Action / All. Rows grouped by project with "View Project" deep-link to `/projects/{id}?tab=scope`.
- **Files**: `/app/backend/routes/projects.py` (~lines 4940-4988), `/app/frontend/src/pages/ProjectDetail.jsx` (handlers lines 3185-3290, inline UI ~7315, batch toolbars ~7117 + ~7170), `/app/frontend/src/pages/CREBoard.jsx` (tab trigger ~821, content ~1300+).
- **Tests**: `/app/backend/tests/test_addition_4step_approval.py` (NEW, 9 cases — all pass).


### Session — Feb 27, 2026 — FE Two-Step Planning Approval
- **New flow**: Planning Person edits Final Estimate → **Save Estimate** (locks FE for them) → Planning Head sees Approve / Reject.
  - **Approve** → forwards to GM (existing GM chain continues).
  - **Reject** (mandatory reason) → status `rejected_by_planning_head`, Planning Person can edit again.
  - **Planning Head can also edit** the FE while it's awaiting their review (per user request).
- **Backend** (`/app/backend/routes/final_estimates.py`):
  - New status values: `pending_planning_head_review`, `rejected_by_planning_head`.
  - New endpoints:
    - `POST /api/planning/projects/{id}/final-estimate/save` (Planning Person)
    - `POST /api/planning-head/projects/{id}/final-estimate/approve` (Planning Head)
    - `POST /api/planning-head/projects/{id}/final-estimate/reject` body `{reason}`
  - Notifies the next role on each transition (Planning Head, GM, or Planning Person).
- **Scope lock** (`/app/backend/routes/projects.py`):
  - New helper `_assert_fe_editable_for_planning_person` blocks `planning_person` from create/update/delete on scope items once FE has moved past their hands. Planning Head and Super Admin bypass.
- **Frontend** (`/app/frontend/src/pages/ProjectDetail.jsx`):
  - Two new status pills + a rose Planning Head rejection banner.
  - Planning Person sees **Save Estimate** (cyan); Planning Head sees **Approve → GM** (green) + **Reject** (rose) when status is `pending_planning_head_review`.
  - `canManage` now disables scope-row Edit/Delete buttons for Planning Person when FE is locked (matches backend rule).
- Verified live with curl: save → reject 400 (no reason) → approve → moves to `pending_gm_review`. `tests/test_rab_workflow.py` 2/2 PASS.

### Session — Feb 27, 2026 — Additional Work Bulk-Delete + Client-Approved-Only Value
- **Bulk Delete All button** (Planning Head > Additional tab):
  - Red outline "Delete All" button next to "+ Create Section" — visible only when the project has ≥1 additional cost row.
  - Confirmation dialog requires typing literal `delete` to enable the destructive button.
  - Backend `POST /api/projects/{project_id}/additional-costs/bulk-delete` with body `{confirm: "delete"}`. Skips client-approved rows unless caller is Super Admin. Returns `{deleted_count, blocked_client_approved}`.
- **Client-approval gating of Additions in Project Value**:
  - Only `client_approval_status == 'client_approved'` additions now contribute to **Project Value / Grand Total / Additions Total**. Pending or rejected additions count as ₹0.
  - Fixed in three places: `GET /projects/{id}/value-summary`, `GET /projects/{id}/full-details`, and the dashboard project-list aggregator (`add_by_proj` projection extended).
- Regression `tests/test_rab_workflow.py` 2/2 PASS.

### Session — Feb 27, 2026 — QC Checking Dashboard Redesign
- **Replaced** generic Project Finance Board for `quality_check` role with a purpose-built **QC Checking Dashboard**.
- **Frontend** (`/app/frontend/src/pages/QCDashboard.jsx` — full rewrite):
  - Title: **QC Checking Dashboard**
  - 4 round pill tabs: **Billing Summary · Pending Requests · Check List · Recommender**.
  - "Pending Requests" mounts the existing `RABApprovalQueue` (Approve→Planning / Reject + Pending Action / Forwarded sub-tabs).
  - Billing Summary, Check List, Recommender ship as **Coming Soon** placeholders (visible scaffolding).
  - Below the tabs: **"Projects Assigned for QC Checking"** list — clickable rows opening the project's Project Stages.
- **Dashboard.jsx**: Added role gate — `quality_check` role hitting `/dashboard` is auto-redirected to `/qc-dashboard` so they never see the Project Finance Board.
- **ProjectDetail.jsx role gate**: when `user.role === 'quality_check'`,
  - `activeTab` is forced to `project-stages` after auth.
  - All other tab triggers are hidden — only the **Stages - Project Stages** tab renders.
  - Income/Expense/Cashflow mini-views and Project-Value/Financial-Performance cards are hidden (driven by `canSeeFinancials` which now excludes QC).
- **Backend** (`/app/backend/routes/projects.py`):
  - New `GET /api/qc/projects` — returns projects where `team.qc == current_user.user_id` (super_admin/GM see all).
- Also fixed an accidentally-duplicated docstring in `qc_labour_stage_requests` endpoint.
- Regression: `tests/test_rab_workflow.py` 2/2 PASS.

### Session — Feb 26, 2026 — Estimate Approval Flows (RE + FE) UX Fix
- **Root-cause fix** for "Approval flow not working" report:
  - GM Dashboard had a **duplicate `rough_estimate` tab trigger with no matching TabsContent** — clicking the obvious "rough_estimate" tab showed a blank page. The actual RE approval queue was hidden under a tab labeled "planning".
  - Removed the orphan tab; renamed all tab labels to human-readable: `Overview · Rough Estimates · Projects · Site Engineer · Accountant · Design · Final Estimates · Planning Board · Labour Advance`.
  - Result: RE approval queue (with Approve/Reject buttons) is now directly discoverable under "Rough Estimates".
- **FE GM Approve — Skip CRE option (Q2.b)**:
  - Frontend `GMDashboard.jsx` Approve dialog adds a checkbox: **"Skip CRE — auto-share with client"**. When checked, the FE auto-shares: GM approval issues `public_token`, sets status to `pending_client_review` directly, and copies the share link to clipboard.
  - Backend `POST /api/gm/final-estimates/{id}/approve` accepts `{auto_share_to_client: bool}`. Returns `public_url` when auto-shared. CRE is still notified for awareness but doesn't gate the flow.
- **Verified live** with curl: RE `submit-for-approval` → GM queue → Approve; FE `submit-to-gm` → `gm/approve { auto_share_to_client: true }` → public_token issued → public FE endpoint returns the project.
- Test suite: `tests/test_rab_workflow.py` 2/2 PASS (no regression).

### Session — Feb 26, 2026 — RAB Release Dialog v2 (4 payment methods + open-cheque picker)
- **New shared component** `/app/frontend/src/components/LabourRABReleaseDialog.jsx` replaces the inline 3-method ReleaseDialog in `AccountantLabourPayments.jsx`. Shows full bill detail (RAB number, approved amount, stage totals, prior RABs on the WO, approval trail with PM/QC/Planning names, DLR/notes), contractor suspense balance with auto-apply input, and a 4-method picker.
- **4 payment methods** mirroring the Income side (`MultiPaymentInput`): **Cash · Cheque · HDFC CURRENT · HDFC SAVINGS**. Cheque mode lists CRE-opened HDFC cheques (Active/Locked tabs + search + "Request Open" CTA for locked ones); multi-select with running total and auto excess-to-suspense preview.
- **Backend** (`/app/backend/routes/projects.py`):
  - New `GET /api/accountant/labour-rab/{request_id}/pay-context?work_order_id=&stage_id=` — returns request + stage + WO + project + suspense + prior_rabs + active/inactive HDFC cheques.
  - Extended `POST /api/accountant/labour-payments/{request_id}/release` to accept new `payment_method ∈ {cash, cheque, current_account, savings_account}` (legacy `bank/savings` aliased) and `cheque_ids: [str]` for multi-cheque selection. Marks consumed cheques (`used_for_expense_id`, `used_for_rab_number`). Cashbook `bank_ref` now persists for current/savings methods too.
- **Tests**: `/app/backend/tests/test_rab_workflow.py` 2/2 PASS; live curl verified `savings_account` method end-to-end (creates expense + auto-locked payment_stages row).

### Session — Feb 26, 2026 — Labour RAB (Running Account Bill) Approval Chain (Phase 1)
- **Workflow**: SE submits RAB → PM Review → QC Review → Planning Review → Accountant Releases. Each step can Approve (forward) or Reject (return to previous role with mandatory reason). On SE rework, the RAB returns to SE who can resubmit.
- **Backend** (`/app/backend/routes/projects.py`):
  - `PATCH /projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment` — SE creates RAB; sequential numbering RAB-01, RAB-02... per WO. Now notifies PM (was Planning).
  - New queue endpoints: `GET /pm/labour-stage-requests`, `GET /qc/labour-stage-requests`, `GET /site-engineer/labour-stage-requests?status=rework`. Existing `/planning/labour-stage-requests?status=new` re-mapped to `qc_approved`.
  - `POST /payment-requests/{id}/pm-approve | pm-reject | qc-approve | qc-reject | planning-approve | planning-reject | accountant-reject` (PM/QC/Planning/Accountant reject paths). Each transition notifies the next role; PM-reject notifies the SE.
  - **NEW** `POST /payment-requests/{id}/se-resubmit` — SE updates amount/notes and flips back to `requested`.
  - On Accountant `/release`, an auto-locked Payment Schedule row is created in `db.payment_stages` with `kind='labour_rab'`, `rab_request_id=request_id`, `status='paid'`. SE gets a payment-released notification.
- **Frontend**:
  - **NEW** `/app/frontend/src/components/RABApprovalQueue.jsx` — shared queue component used by PM, QC, and Planning; role-aware approve/reject endpoints.
  - **NEW** `/app/frontend/src/pages/QCDashboard.jsx` + route `/qc-dashboard`; AppHeader nav + login redirect added for `quality_check` role.
  - PMDashboard.jsx — new **Labour RAB** tab (mounts `RABApprovalQueue role="project_manager"`).
  - PlanningRequestsTab.jsx — `labour_payments` sub-tab now mounts `RABApprovalQueue role="planning"` (was PlanningLabourStageRequests).
  - ProjectDetail.jsx — removed legacy Planning "Request Advance" button on labour WO stages; SE "Req Payment (RAB)" button now appears on **every open, non-finished** labour stage; new `rabDialog` (amount + notes) wired to the backend. New `handleWoStageRequest` and `submitRabDialog` helpers.
  - SiteEngineerWorkOrdersV2.jsx — StageRequestDialog now has a **Request RAB** sub-tab (or Resubmit RAB-XX if a `se_rework` PR exists). Status badges/buckets updated for `qc_approved` and `se_rework` states. Resubmit calls `/se-resubmit`; first-time call hits `/request-payment`.
- **Tests** (`/app/backend/tests/test_rab_workflow.py`): 2/2 PASS local; testing_agent_v3_fork iteration 160 — backend **9/9** pytest (added QC reject, Planning reject, Accountant reject, Payment Schedule auto-link, role permissions, sequential RAB numbering), frontend 100% on all 4 required surfaces.

### Session — Feb 22, 2026 — Project Detail Payment Schedule CRE/Accountant Rejection Display
- **Frontend** (`/app/frontend/src/pages/ProjectDetail.jsx`):
  - Per-project Payment Schedule table now renders a dedicated red detail `<tr>` under each `cre_rejected` / `accountant_rejected` stage showing the rejection reason, rejector name and timestamp.
  - New "Edit & Resubmit" action (`data-testid="planning-resubmit-${stage_id}"`) replaces the previous `window.prompt()` flow with a Shadcn `Dialog` (`ps-resubmit-dialog`) for amount + remarks. On submit calls `POST /api/payment-stages/{id}/planning-resubmit` (CRE rejected) or `PATCH /api/payment-stages/{id}` (accountant rejected).
  - `fetchData(false)` is now awaited so the UI refreshes the row state before the dialog closes (fixes stale CRE Rejected badge).
- **Tests**: New pytest `/app/backend/tests/test_payment_stage_cre_reject_resubmit.py` (8/8 PASS). `testing_agent_v3_fork` iterations 158 + 159 — backend 100% / frontend 100%.


### Session — Feb 19, 2026 — Unified Correction Engine (Phase 1: Petty Cash)
- **Backend** (`/app/backend/routes/correction_engine.py` — NEW):
  - Shared 3-helper engine: `apply_rejection`, `apply_resubmit`, `apply_send_for_correction`. Unified status vocabulary `awaiting_accountant / accountant_rejected / approved / under_correction` + `correction_history[]` audit trail.
  - `EXCLUDED_FROM_TOTALS = ['accountant_rejected','rejected','accounts_rejected','under_correction']` — single source of truth for cashbook/cashflow exclusion.
- **Backend** (`/app/backend/routes/cashflow.py`):
  - NEW `reverse_allocation(source_id, kind)` helper — deletes cashflow_ledger rows for a given source so post-approval correction can roll back Direct/Indirect splits instantly.
- **Backend** (`/app/backend/routes/site_ops.py`):
  - `PATCH /accountant/petty-cash/{id}/reject` now routes through the engine, accepts JSON `{reason}`, sets `accountant_rejected` + history.
  - NEW `POST /petty-cash/{id}/resubmit` — original SE/PM/Asst PM (or Super Admin) edits fields & flips status back to `awaiting_accountant`.
  - NEW `POST /accountant/petty-cash/{id}/send-for-correction` — accountant pulls back an Approved/Issued row → status `under_correction`, cashflow_ledger reversed, linked recorded_expenses also flipped to `under_correction`.
  - `/accountant/petty-cash/{id}/issue` now also writes a cashflow_ledger row keyed on petty_cash_id (so the reversal works).
  - GET `/accountant/petty-cash` default queue now includes `awaiting_accountant` so resubmitted rows return.
- **Backend** (`/app/backend/routes/financial.py`):
  - `/cashbook` and `/accountant-overview` expense queries exclude EXCLUDED_EXPENSE_STATUSES across `recorded_expenses`, `material_requests`, `petty_cash`.
- **Frontend** (`/app/frontend/src/components/StatusPill.jsx` — NEW): 4-state pill mapping ~16 legacy backend statuses onto Awaiting / Rejected / Approved / Under Correction visual states.
- **Frontend** (`/app/frontend/src/components/CorrectionDialog.jsx` — NEW): Shared AlertDialog with rejection-reason banner, editable field config, history timeline.
- **Frontend** (`/app/frontend/src/pages/SiteEngineerDashboard.jsx`): Petty cash card now shows StatusPill + red "⚠ Rejected — Re-enter Required" / "🔄 Sent Back for Correction" banner → click → CorrectionDialog with editable amount/purpose/remarks.
- **Frontend** (`/app/frontend/src/pages/AccountsBoard.jsx`): Primary "PM-Approved & Resubmitted" queue table now shows both pm_approved AND awaiting_accountant rows; every row has Process Payment + Reject buttons. SE drill-down rows show StatusPill + Send-for-Correction (on approved rows) + Reject (on any awaiting row) + view-only CorrectionDialog.
- **Tests**: New pytest `/app/backend/tests/test_correction_engine_petty_cash.py` covers the full loop: pm_approved → reject → resubmit → issue (cashflow row created) → send-for-correction (cashflow row reversed) → resubmit → re-approval ready. testing_agent_v3_fork iterations 156 + 157 both PASS — backend 100% / frontend 100%.



### Session — Feb 19, 2026 — Sales Lead Advance Rejection Loop + Accountant CRM Access
- **Backend** (`/app/backend/routes/crm.py`):
  - **Bug fix** (root cause of the "rejection banner doesn't show" report): `POST /api/crm/leads/{lead_id}/accountant-reject` was setting `current_stage_id = "stg_deal_close"` which is not a real `lead_stages` entry (real stage_id is `stg_payment_collect`). Rejected leads were landing in a phantom kanban column and silently disappearing. Now bounces back to `stg_payment_collect`.
  - `POST /api/crm/leads/{lead_id}/send-to-accountant` now also moves `current_stage_id` to `stg_accountant_approval` (was only flipping `onboarding_status`). This populates the "Accountant Approval" kanban column and gates the per-card Verify/Reject buttons correctly.
  - Accountant role now allowed on `/crm/sales/dashboard`, `/crm/sales/leads`, `/crm/sales-overview` (read-only access so they can view the kanban from the Sales board).
- **Frontend**:
  - `/app/frontend/src/components/Sidebar.jsx` — added `accountant` to roles for `/crm-sales`.
  - `/app/frontend/src/components/AppHeader.jsx` — accountant top-nav now includes "Sales CRM" link.
- **Tests**: New backend pytest `/app/backend/tests/test_lead_advance_reject_resubmit.py` covers the full Sales → Send → Reject (with reason) → Sales re-collect → Re-send → Accountant verify loop. testing_agent_v3_fork iterations 154 + 155 confirmed both backend (100%) and frontend (100%) success.



### Session — Feb 15, 2026 — DLR + DPR Unified + SE Logout Enforcement
- **Backend** (`/app/backend/routes/projects.py`):
  - Extended `DLRCreate` model with mandatory `stage_id`, `stage_name`, `work_summary` fields. Empty values rejected with 400 + clear error message.
  - DLR endpoint now verifies `stage_id` actually belongs to the project and re-resolves `stage_name` from `db.project_stages`.
  - On successful DLR creation, a mirror entry is auto-written to `db.daily_progress` (DPR) with `source: 'dlr'` + `dlr_id` linkage so Planning's DPR view stays unified.
  - DLR delete cascades to remove the linked DPR mirror.
- **Backend** (`/app/backend/routes/site_ops.py`):
  - `POST /api/attendance/logout`: SE logout now **blocked** until at least one DLR (with stage + work_summary) is recorded for that project on today's date. Returns 400 with explicit instruction. GPS-lost-auto-logout safeguard remains unrestricted.
- **Frontend** (`/app/frontend/src/components/DLRPanel.jsx`):
  - Fetches project stages and renders mandatory "Current Project Stage" dropdown + mandatory "Work Summary" textarea inside the existing "Record Daily Labour Report" dialog, visually grouped under a teal DPR section.
  - DLR list cards now display Stage + Work Summary inline.
  - Client-side validation blocks submission with toast errors if either field is empty.
- **Tested**: Backend curl (3 cases — missing stage 400, missing summary 400, valid 200 with DPR mirror), DPR mirror verified, cascade delete verified, frontend smoke screenshot clean.



### Session — May 8, 2026 — PM Dashboard: Read-Only Requests + Petty Cash Income/Expense Sub-tabs
- **Frontend** (`/app/frontend/src/components/PMReadOnlyLifecycle.jsx` — NEW):
  - Two read-only viewer components mirroring the Planning Board's lifecycle pattern: `PMMaterialReadOnlyList` (7 buckets: All / New Request / Planning Awaiting / Revision / Awaiting Accountant / Transit / Delivered) and `PMLabourReadOnlyList` (5 buckets: All / New Request / Planning Awaiting / Awaiting Accountant / Paid). Both are explicitly **(VIEW-ONLY)** — no Approve/Reject buttons rendered. PM cannot approve material or labour at this stage; they can only see lifecycle progress.
- **Frontend** (`/app/frontend/src/components/PMPettyCashTabs.jsx` — NEW):
  - Pill-style sub-tabs **Expense | Income** at the top (orange / emerald accents).
  - **Expense** sub-tab — 4 buckets: `New Expense / Awaiting Accountant / Revisions / Expense Recorded`. PM can **Approve** (calls existing `PATCH /pm/petty-cash/{id}/approve`) and **Reject** (calls `PATCH /pm/petty-cash/{id}/reject`) entries in the `New Expense` bucket. Status mapping: `requested → New Expense`, `pm_approved → Awaiting Accountant`, `pm_rejected/rejected → Revisions`, `issued/partially_settled/settled/completed/approved → Expense Recorded`.
  - **Income** sub-tab — 5 buckets per spec: `New Request / Awaiting Accountant / Revisions / Acknowledged / Payment Done`. Reads from existing `/income` endpoint. Status mapping: `requested/pending → New Request`, `pm_approved/under_review → Awaiting Accountant`, `rejected/revision_requested → Revisions`, `acknowledged/pm_acknowledged → Acknowledged`, `approved/payment_done → Payment Done`. Income is currently view-only on the PM Dashboard (existing accountant-side flow handles approval).
- **Frontend** (`/app/frontend/src/pages/PMDashboard.jsx`):
  - Replaced the simple Material/Labour list in the Requests tab with `<PMMaterialReadOnlyList />` and `<PMLabourReadOnlyList />`.
  - Replaced the legacy Petty Cash table with `<PMPettyCashTabs />`. Approve/Reject still flow through the existing PM endpoints; refresh hooks back into the existing `fetchData(false)` polling.
- **Verified via screenshot**: PM logs in → Requests tab shows Material Requests (3) with 7 lifecycle cards labeled view-only and 3 cards rendered in "New Request (SE)" bucket; Work Order/Labour shows 5 cards. Petty Cash tab shows Expense (orange active) + Income pill bar; 4 buckets render with empty-state.

### Session — May 8, 2026 — Site Engineer Dashboard Simplification + Curing Video Moved to Project View
- **Frontend** (`/app/frontend/src/pages/SiteEngineerDashboard.jsx`):
  - **Header cleaned up**: removed inline action buttons (Site Login / Site Logout / Material Receipt / Curing Video). Only the standard `<AppHeader />` (logo + Dashboard nav + bell + profile) remains.
  - **Top tabs collapsed from 7 → 3** with big-text styling: **My Projects | Petty Cash | Attendance**. The legacy `value="sitevisits"`, `value="workorders"`, `value="minicashbook"`, `value="curingvideo"` `<TabsContent>` blocks are still in the file but unreachable (no triggers); will be cleaned up in a later refactor pass.
  - The 3 active tabs use `text-base sm:text-lg font-semibold py-3 data-[state=active]:bg-white data-[state=active]:text-amber-700` for a card-pill look. Petty Cash retains the count badge for issued/partially_spent items.
- **Frontend** (`/app/frontend/src/components/AppHeader.jsx`): Removed the "Material Receipt" link from the `site_engineer` role nav. SE header now shows only the Dashboard link.
- **Frontend** (`/app/frontend/src/components/ProjectCuringTab.jsx` — NEW): Self-contained Curing Video log scoped to a single project. **Record Curing** dialog with "Curing fully done" checkbox → POST `/site-engineer/curing-video` → on done, auto-opens WhatsApp with prefilled client message and PATCH `whatsapp-sent`. Lists past records with status pill (Done / In progress), recorded-by name, timestamp, and a "WhatsApp" action when done & not yet sent.
- **Frontend** (`/app/frontend/src/pages/SiteEngineerProject.jsx`):
  - Project tabs grew from 3 → **4**: Materials | Work Order (Labour) | Progress | **Curing**. Added the new icon import and TabsContent that mounts `<ProjectCuringTab />` with `projectId` / `projectName` / `user` props.
- **Verified via screenshot**:
  - SE login → clean header with only "Dashboard"; landing shows 3 big-text tabs (My Projects / Petty Cash / Attendance) plus stat cards (Assigned 2, Active Orders 8, Active Sites 1) and project list.
  - Project page → 4 tabs visible; Curing tab opens the empty-state "No curing records yet" view with **Refresh** + **Record Curing** buttons.

### Session — May 8, 2026 — Inventory Auto-population + Out Stock + Stock History + MetaDateFilter Rollout
- **Backend** (`/app/backend/routes/site_ops.py`): Material receipt now **auto-creates a `material_inventory` daily entry** (idempotent for same `project + material + date`). Carries the prior closing forward as opening, adds received qty, stamps `last_in_at` ISO timestamp. Source flag `auto_receipt`.
- **Backend** (`/app/backend/routes/contractors.py`):
  - `GET /material-inventory/history?project_id=…&material_name=…&from_date=&to_date=` — date-wise stock history for a single material.
  - `POST /material-inventory/consume` — Site Engineer logs an "Out Stock" / used qty. Carries forward prior closing as opening, increments today's used, recomputes closing. Idempotent merge for same day. Validates available stock (rejects with detail message if insufficient). Pushes a `consumption_log` entry with qty/notes/at/by for audit.
  - Dashboard endpoint enhanced to surface `last_in_at` / `last_out_at` and tolerate legacy entries that used `current_stock` instead of `closing_stock`.
- **Frontend** (`/app/frontend/src/pages/SiteEngineerProject.jsx`):
  - Inventory tab now shows enhanced **Current Stock Levels** table with new columns: **Last In At**, **Last Out At**, **Min**, **Status**, plus a per-row **+ Out Stock** action button (red outline, disabled when stock ≤ 0).
  - **Click any row → opens Stock History popup** with full date-wise table: Date / Opening / Received / Used / Closing / In At / Out At.
  - **Out Stock dialog** captures qty + notes, auto-stamps date/time, calls `/material-inventory/consume`, refreshes view.
  - **MetaDateFilter** added to Inventory header (default "This month") and to Materials Requests header (default "This month") — both filter the lifecycle items by `created_at`.
  - Lazy-loads inventory dashboard on first click of the Inventory sub-tab (was previously not fetching for some entry paths).
- **Frontend** (`/app/frontend/src/components/PlanningRequestsTab.jsx`):
  - Replaced the legacy `CashbookDateFilter` with **MetaDateFilter** at the top of Planning's Requests page. State still backs `dateFrom`/`dateTo` for the existing `applyFilters` logic.
- **Frontend** (`/app/frontend/src/pages/ProcurementBoardSimple.jsx`):
  - Added **MetaDateFilter** to **All Projects** tab (filters by `created_at`) and **Material Vendors** tab (filters both vendors and materials).
- AccountsBoard already uses an equivalent calendar-preset filter (`CashbookDateFilter`) — left as-is to avoid invasive refactor.
- **Tested via curl**:
  - Dashboard correctly returns `current_stock` for legacy + new entries (Bricks: 3000 → consumed 10 → 2990 ✅, OPC seeded 50 → consumed 8 → 42 ✅).
  - History endpoint returns full date-wise audit trail.
  - Insufficient-stock guard rejects over-consumption with clear message.
- **Verified via screenshot**: Inventory table renders Bricks 9x4x3=2990 with `Last Out At = 08 May, 08:27 am`. Click row → Stock History popup shows `2026-05-08 | Opening 3000 | Received 0 | Used 10 | Closing 2990`.

### Session — May 8, 2026 — Receipt Flow Overhaul: No-OTP, Big Image Uploads, Photo Visibility for Procurement/Planning, Lifecycle Card Cleanup
- **Backend** (`/app/backend/routes/site_ops.py`):
  - **Removed email-OTP step** for material receipts. `/site-engineer/material-receipts/initiate` now does the entire receipt in one call: persists the receipt with `otp_verified=true`, advances the parent `material_request` per payment-mode rules (`pre_paid`, `advance` → `pending_balance_payment`, `credit` → `delivered` + auto-creates `vendor_credit_ledger` entry, `post_delivery` → `pending_accounts_approval`), legacy flow → `received_partial`/`received_completed`. Stamps `lorry_image_id` and `material_image_id` on the parent request so Procurement/Planning can see them. The legacy `/verify-otp` endpoint is now unused (left in place to avoid breaking older mobile clients).
- **Backend** (`/app/backend/routes/files.py`):
  - Fixed misleading "Maximum 10MB" 413 error message (actual limit is 50MB).
- **Frontend** (`/app/frontend/src/pages/SiteEngineerProject.jsx`):
  - **Image upload bug fixed** — was setting `Content-Type: multipart/form-data` manually, which stripped the auto-generated multipart boundary causing every upload to fail. Now lets axios set it. Bumped client size cap 10MB → 25MB to match real-world phone photos. Surfaces actual backend error message in toast.
  - **Receive dialog**: removed the "OTP will be sent" banner, removed the entire OTP entry dialog, removed `otpDialog` / `otpCode` state. Submit button is now **"Confirm Receipt"** — single click, no email step. The auto-redirect after submit refreshes the request list.
  - **GPS function hardened** — distinguishes permission-denied vs unavailable vs timeout, retries with `enableHighAccuracy:false` if the high-accuracy attempt fails (covers indoor sites without GPS lock), and shows captured location accuracy in the success toast.
  - **Lifecycle cards updated** to user spec: 7 cards = **All / Awaiting Procurement / Awaiting Planning / Awaiting Accountant / Revision / Transit / Delivered**. Removed "New Request" (renamed to Awaiting Procurement) and "Credit" (credit-mode delivered items now fall under Delivered; vendor settlement remains tracked in Procurement → Credit Management).
- **Frontend** (`/app/frontend/src/pages/ProcurementBoardSimple.jsx`, `/app/frontend/src/components/PlanningRequestsTab.jsx`):
  - Removed the **Credit** lifecycle card from both Procurement and Planning Material Req views. Kept the existing "New Request (SE)" label since those views are reviewing SE-raised requests. Credit-mode delivered items now fall into Delivered. Vendor settlement still tracked in Procurement Dashboard → Credit Management sub-tab. Grid recolumned to 7.
- **Frontend** (`/app/frontend/src/components/OrderDetailDialog.jsx`):
  - Added **Delivery Photos & Receipt** card (visible to Procurement, Planning, Accountant after SE marks received). Shows lorry image + material image side-by-side (clickable to open full-size). Plus received qty, received-by, received-at metadata. Falls back to placeholder if either image missing. Uses cookie-authed `/api/files/{id}/download` so it Just Works for any logged-in role.
- **Tested end-to-end via curl** — uploaded 2 images → POST `/site-engineer/material-receipts/initiate` (no OTP) → 200 OK; the parent `material_request` (mreq_97d51ae8c2d5) status flipped from `in_transit` to `received_partial`, `lorry_image_id` and `material_image_id` populated, `received_at` stamped. Verified via screenshot — SE Materials tab now shows the new 7 cards (no Credit/New Request), Procurement Material Req shows 7 cards (no Credit).

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

## Recent Updates (Feb 2026)
- 2026-06-09: **Material Request — single entry point + Steel auto-calc** —
  • Removed the **blue "Request Material" button** from the SE projects list (`/site-engineer`). SE must enter a project and use the orange **"+ Request Order"** flow.
  • Orange dialog now detects `category === 'steel'` on the selected material → swaps Quantity+Unit row for **Diameter (mm) dropdown (6/8/10/12/16/20/25/32)** + **No. of Rods (40 ft)** input + auto-calc **Weight (kg)** using `(D² ÷ 162) × 12.192 × N`. Steel-only **"+ Add Another Item"** lets SE bundle multiple steel sizes in one go. Each Steel row submits as its own `material_request` with `steel_specs: {diameter_mm, rod_count, rod_length_ft, calculated_weight_kg}` metadata.
  • Backend: `MaterialRequestCreate` schema accepts optional `steel_specs`. Auto-tags the doc with `category="steel"` on insert.
  • Setup: Super Admin tags Steel materials with `category="steel"` in Material Master (UI already has the dropdown).
- 2026-06-09: **Payment Schedule — Option A (dateless stages visible)** — 304 of 369 stages had no `expected_payment_date`/`due_date` → invisible on Payment Schedule. Now included in "All Months" with amber "⚠ No Date Set" badge. Anti-cache headers on `/api/planning/monthly-schedule` ensure same data every device.
- 2026-06-09: **Multi-mode Payment Release (Phase 1)** — `LabourRABReleaseDialog` rebuilt with shared `MultiPaymentEntryRows` component. Backend `/accountant/labour-payments/{id}/release` accepts `payment_entries: [{method, amount, bank_ref?, cheque_ids?}]` with cross-row cheque dedup, suspense reconciliation, backward-compatible with legacy single-mode body. Phase 2 (Material vendor + Petty Cash) pending user verification of Phase 1.
- 2026-06-09: **Mr Achyuth — full accounting reconciliation (option a)** — Stage 02 milestone fixed to ₹932,023 (was ₹956,798), ₹50K Sales token advance re-linked from deleted virtual stage `ps_ce2f0ed5c4b7` to Stage 01, bulk cheque collection re-allocated so Stage 01 = ₹93,202 (₹50K + ₹43,202), Stage 02 = ₹932,023, Stage 03 receives ₹74,775 pre-credit. Total Income now correctly shows ₹11,00,000. Sum of stage amounts (₹46,60,114) aligns with Project Value (₹46,60,113.50). Script: `backend/scripts/heal_achyuth_full_reconcile.py` (idempotent).
- 2026-06-09: **System hardening — stop orphaning Sales advance incomes** —
  • `DELETE /payment-stages/{id}` now auto-relinks any incomes pointing at the deleted stage to the next `is_advance=True` stage on the project (or NULLs if none exists). Prevents the Mr Achyuth bug where deleting a materialized advance stage left the ₹50K advance income with a dangling payment_stage_id, invisible to every UI view.
  • Self-heal in `/full-details` (financial.py ~line 2310) now also rescues incomes whose `payment_stage_id` points to a non-existent stage (not just NULL pointers).
  • `POST /apply-payment-template` now auto-links project's existing advance-payment incomes to the newly-created Stage 01 (is_advance=True) and stamps `linked_income_id`. Rule enforced: token advance always stays in Stage 01, never cascades.
- 2026-06-08: **CRE Payment Schedule default → "All Months"** (revert to old behavior) — Super Admin / CRE land on the full pipeline on fresh login, so future months like Jul/Aug 2026 with planned stages are immediately visible without manually pressing Next. File: `frontend/src/pages/CREBoard.jsx` (`psAllMonths` default flipped to `true`). Deployed to VPS.
- 2026-06-08: **Mr Achyuth Stage-2 milestone amount reconciled** — Stage 2 "Advance payment for Foundation and Plinth Beam Concrete" was stored at ₹956,798 but its 20% slice of project total (₹4,660,113.50) is ₹932,023. (Superseded by full reconcile on 2026-06-09.)
- 2026-02-25: **Payment Schedule stage amounts mismatch FIX** — Root cause was a race condition: `/full-details` (which feeds the bottom Payment Schedule list) and `/payment-summary` (which feeds the top Project Value card) were called in parallel via `Promise.all`. Only `/payment-summary` had the self-heal logic (`amount = locked_value × pct / 100`). Fix: replicated the same self-heal block in `/projects/{id}/full-details` (`routes/financial.py` lines ~1873–1908) and made `project_value` anchor to the locked `total_value` (FE-locked scope) consistently across both endpoints. Both endpoints now return identical, healed `payment_stages` regardless of fetch order.
- 2026-02: Sales — Per-lead Reassign action — Lead detail dialog now has a purple **"Reassign"** button next to Edit. Opens a dialog with: New Salesperson dropdown (auto-filtered to active users with matching stage_type role) + optional Reason. Submitting hits new `POST /api/crm/leads/{lead_id}/reassign` which validates role, swaps `assigned_to` + `assigned_to_name`, logs to `activity_log`, and notifies both old and new owner. Works on every tab.
  - Files: `backend/routes/crm.py` (new `LeadReassignInput` + `reassign_lead` endpoint); `frontend/src/pages/CRMSales.jsx` (Reassign button in detail header, `reassignDialog` state + `handleReassignSubmit` + dialog UI)
- 2026-02: Pre-Sales contact masking + Appointment Booked date chip + Public RE amber theme.
- 2026-02: Public RE Sent to Client page — green branding swapped for amber/yellow.
- 2026-02: Office Visit + Follow-up next-meeting badges visible across CRM Sales tabs.
- 2026-02: HR Edit "Failed to save" silent error fixed (Murugan.P case).
- 2026-02: Additional Work — Req Payment now creates a linked Payment Schedule entry with chosen due date.
- 2026-02: Payment Schedule "virtual sales advance" row no longer disappears after save.
- 2026-02: Rough Estimate Payment Schedule + Convert action.
- 2026-02: Add Payment Stages dialog — accounts for already-collected advance.
- 2026-02: Payment Schedule reorder — Drag-to-reorder enabled.
- 2026-02: Planning role — Edit Additions/Deductions permission
- 2026-02: Edit Additions & Deductions — Added clean Edit dialog (Name + Qty + Amount) on each Additional Work and Deduction row.
- 2026-02: Simplified Add Additions/Deductions dialogs — Now uses **Name | Qty | Amount** only.
- 2026-02: WO Header & Stage Order — Total Contract amount is now displayed as a big highlighted card; Auto Additional payment stages save & render LAST (after user-defined stages).
- 2026-02: Savings A/c Payment Mode + Income Edit — Added "Savings A/c" everywhere; Income view dialog now editable.
- 2026-02: Work Order Auto Payment Stages — Each Additional cost row in a Work Order now auto-becomes a separate **fixed-amount payment stage** (locked). User-defined % stages compute on **Scope only**.
- 2026-02: Same-Role Lead Transfer — Marketing Board "Transfer Role & Leads" dialog now allows handing over leads to a teammate already in the same Pre-Sales/Sales role.
- 2026-02: Client Portal V2 — Fixed "Final Estimate" returning 0 (now reads `scope_items`); added "Pre-Construction" tab showing 7 CRE pre-construction stages.

