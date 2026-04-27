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

### Session — April 27, 2026 (Latest)
- **Planning Requests tab — total redesign**: Replaced the 5 sub-tabs (Site Engineer Req | Materials | Labour Payment | Labour Stage | Open Req) with **3 colourful pills + count badges**: Material | Labour | Petty Cash. Added Meta-style date range/Month/Year filter and Project search filter. Each row now has **inline Approve & Reject** buttons that open dedicated dialogs (Review-and-Approve with detailed grid + per-type fields like approved-quantity for material; Reject-with-Remarks).
  - Backend: New endpoints `/api/planning/petty-cash-requests`, `/api/planning/petty-cash/{id}/approve`, `/api/planning/petty-cash/{id}/reject` — Planning is now an authorised approver of petty cash (alongside the existing PM flow).
  - Frontend: New shared `ProjectSearchSelect` component (extracted) + `PlanningRequestsTab` component.

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
- 🔴 [P0] Re-create user accounts on Hostinger VPS (setup page ready)
- 🔴 [P0] Secure MongoDB on VPS (create auth user)
- 🔴 [P0] Run migrate-stages + fix-unassigned on live site
- 🔴 [P0] Finish RNR Count Tracker & Appointment Date Filter
- 🔴 [P0] PaySprint escrow integration (waiting for API credentials)
- 🔴 [P0] Unified Attendance (SE GPS + Biometric + Manual Punch + Leave CL/SL)
- 🔴 [P0] Automated Payroll
- 🟡 [P1] Refactor bloated files (ProjectDetail.jsx 5600+, CRMSales.jsx 2400+, HRPortal.jsx 1600+)
- 🔵 [P2] Sr. Engineer → Jr. Engineer assignment
- 🔵 [P2] Aadhar Document Upload
- 🔵 [P2] Cash Denomination feature
- 🔵 [P2] SaaS conversion

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
