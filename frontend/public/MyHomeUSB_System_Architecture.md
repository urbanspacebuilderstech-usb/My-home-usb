# MyHomeUSB Construction CRM — Full System Architecture

_Last updated: Feb 2026_

---

## 1. Tech Stack & Topology

```
┌────────────────────────────────────────────────────────────────────┐
│ Client tier                                                        │
│   • Desktop / Tablet / Mobile browser                              │
│   • Native-feel React SPA (Create React App, Tailwind, Shadcn UI)  │
└────────────────────────┬───────────────────────────────────────────┘
                         │ HTTPS · JWT Bearer Auth
┌────────────────────────▼───────────────────────────────────────────┐
│ Web tier — Nginx reverse proxy (Hostinger VPS)                     │
│   • Serves the built React bundle (frontend/build)                 │
│   • Proxies /api/* to FastAPI                                      │
└────────────────────────┬───────────────────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────────────────┐
│ Application tier — FastAPI (PM2-managed)                           │
│   • Routers: auth, crm, projects, financial, operations,           │
│     site_ops, procurement, hr, client_portal, public               │
│   • Background jobs: cheque reminders, payroll, attendance         │
└──┬─────────────────────────────────────────────────────┬───────────┘
   │                                                     │
┌──▼──────────────────────┐               ┌──────────────▼──────────┐
│ Data tier — MongoDB     │               │ External integrations    │
│   • projects, users     │               │  • Google Sheets (OAuth) │
│   • cheques, cashbook   │               │  • Resend (Email)        │
│   • payment_stages      │               │  • SMS / WhatsApp (mock) │
│   • work_orders         │               │  • Object storage (S3)   │
│   • additional_*        │               └──────────────────────────┘
│   • notifications       │
└─────────────────────────┘
```

**Key runtime conventions**
- Single VPS deploy via `sshpass`-driven `git pull && yarn build && pm2 restart backend`.
- All backend routes are mounted under `/api` (Nginx forwards exactly that prefix to FastAPI).
- All URLs, ports, MongoDB credentials live in `.env` files — never hard-coded.
- Auto-redirect to `/client-portal/{projectId}` for single-project clients (Feb 2026).

---

## 2. Data Model Cheat-Sheet

| Collection                          | Purpose                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `users`                             | Every login + role + profile + assignment data                                           |
| `leads`                             | Pre-sales / sales pipeline rows                                                          |
| `projects`                          | Master project ledger (status, team, location, contract data)                            |
| `payment_stages`                    | CRE-side schedule of client payments per project                                         |
| `project_work_orders`               | Contractor/labour WO with `scope_items[]`, `stages[]`, `additional_sections[]`, `additional_work[]` |
| `material_requests` / `_receipts`   | SE flow → Procurement                                                                    |
| `labour_expenses`                   | DLR + payment_request ladder                                                             |
| `cheques`                           | Cheque Management (Received → Opened → Issued → Bounced)                                 |
| `cashbook`                          | Single source of truth for every released payment & received income                      |
| `addition_sections`                 | Per-WO grouping for Additional work (Claimable / Non-Claimable / Rework-SE / Rework-Client) |
| `notifications`                     | Per-user in-app notifications                                                            |
| `petty_cash`                        | PM/SE petty cash requests + issuance                                                     |
| `attendance` / `payroll`            | HR module (under build)                                                                  |

---

## 3. Users & Interfaces — Who Logs In Where

The system has **23 distinct roles**, each with a tailored dashboard.

| # | Role | Login UI | Primary Workspace |
|---|------|----------|-------------------|
| 1 | `super_admin` | Web | Super Admin Dashboard (all modules unlocked) |
| 2 | `general_manager` | Web | GM Approvals + Read-only org view |
| 3 | `cre` (Client Relationship Officer) | Web | CRE Dashboard → Project payment ladder |
| 4 | `accountant` | Web | Finance Board (Cashbook · Approvals · Cheque Mgmt · Income) |
| 5 | `project_manager` | Web | PM Dashboard (Projects · Team · Material · Labour · Petty Cash) |
| 6 | `associate_pm` | Web | Sr. SE board + limited PM actions |
| 7 | `sr_site_engineer` | Web | SE board with elevated role permissions |
| 8 | `planning` | Web | Planning workspace + Project Detail editor |
| 9 | `planning_person` | Web | Project-scoped Planning view |
| 10 | `procurement` | Web | Procurement Board (All Projects · Vendors · Material Stock · Vendor Book) |
| 11 | `site_engineer` | Web | SE Dashboard (Projects · Work Orders · DLR · Material · Petty Cash) |
| 12 | `vendor` | Web | Vendor Portal (POs · Material Dispatch) |
| 13 | `client` | Web (Client Portal) | Single-project dashboard (Payments · Visits · Cashflow) |
| 14 | `pre_sales` | Web | CRM Pre-Sales Pipeline |
| 15 | `sales` | Web | CRM Sales Pipeline |
| 16 | `marketing_head` | Web | Marketing analytics + Lead distribution config |
| 17 | `architect` | Web | Architect workspace (drawings, design packages) |
| 18 | `super_architect` | Web | Architect + Approvals |
| 19 | `hr` | Web | HR module (Attendance / Leave / Payroll) |
| 20 | `quality_check` | Web | QC inbox (RAB QC approvals + site visits) |
| 21 | `prospect` | Mobile-first | Quote/Package viewer (read-only) |

Plus background "users":
- **Public** (no login) — landing site, package showcase, lead capture form.
- **System** — cron-driven entries (cheque reminders, escrow sweeps).

---

## 4. Per-Role Function Inventory

Below is what each persona does day-to-day (function = a discrete capability exposed on their dashboard).

### 4.1 `super_admin`
Has every function of every role. Plus exclusive:
- User CRUD, role re-assignment, slot management.
- Org-wide reports, audit log, cashbook reversal.
- Master config: payment templates, WO templates, stage templates, GP/IS %.

### 4.2 `general_manager`
1. View Org KPIs (projects · revenue · margin).
2. Approve project advancement from Planning.
3. Approve high-value RAB releases (above threshold).
4. View all cashbook entries (read-only).
5. Org-wide notification inbox.

### 4.3 `cre`
1. Create new project from a converted Sales lead.
2. Set up the client-side payment_stages ladder.
3. Verify first cheque + raise to Accountant for verification.
4. Track project closure (% paid · pending visits).
5. Push project to Planning when verification clears.
6. Maintain client roster · upload contract docs.

### 4.4 `accountant`
1. **Cashbook** — debit / credit ledger (all expense & income).
2. **Approvals** sub-tabs:
   - Income (CRE-raised cheques)
   - Material Payments (Procurement-raised POs)
   - Labour Payments (SE-raised RABs · _multi-stage releases in one click_)
   - Petty Cash (PM/SE issuance)
3. **Cheque Management** — Received · Opened · Awaiting CRE · Issued · Bounced · Disabled (single source of every cheque in the company).
4. **Income** — view received funds + reconcile.
5. **Suspense Ledger** — track contractor credits and apply on next payment.
6. **Reject / Re-route** any of the above with notes back to the originator.

### 4.5 `project_manager`
1. **All Projects** — Sr. SE-style table view; clicking a row opens the SE workspace.
2. **Change Stage** (Yet to Start → Sub-structure → Super-structure → Finishing → Handover).
3. **Assign Team** to projects (SE / Sr.SE / PMs).
4. **Petty Cash** sub-tabs:
   - PM Petty Cash (own requests)
   - Approve SE Petty Cash
   - Issued history
5. **Approve Material Requests** raised by SE.
6. **Approve Labour RABs** raised by SE (step 1 of the approval ladder).
7. **Approve Mark Work Complete** for stage closure.
8. Org-wide Notifications.

### 4.6 `associate_pm`
- All Sr. SE functions.
- Limited PM approvals (PM petty cash + RAB stage approval).

### 4.7 `sr_site_engineer`
- All SE functions.
- **Submit/Delete RABs** (elevated permission).
- Bulk DLR entries.

### 4.8 `planning` & `planning_person`
1. **Project Detail editor** — full read/write on every WO.
2. Add / Edit / Delete **Scope items** (with searchable Unit dropdown).
3. Add / Edit / Delete **Payment Stages** (Fixed amount or % of contract).
4. Add / Edit / Delete **Additional Sections** (4 buckets: Claimable / Non-Claimable / Rework-SE / Rework-Client).
5. Per-section lock/unlock toggle (cascades to items).
6. Per-item lock/unlock toggle (gated on section being unlocked).
7. **Approve RAB** (step 3 of the approval ladder: SE → PM → QC → **Planning** → Accountant).
8. **Reject** with notes.
9. Recompute contract totals, freeze WOs.

### 4.9 `procurement`
1. **All Projects** — material requirement aggregator.
2. **Material Vendors** sub-tab (Vendor view · Materials view).
3. **Material Stock** — receipt vs consumption ledger.
4. **Vendor Book** — Orders · Credits · Summary per vendor.
5. **Material Edit Popup** — Details · Vendors split tabs.
6. Multi-Mode Payment Release (cheque + cash mix).
7. Raise Material PO to Accountant.

### 4.10 `site_engineer`
1. **My Projects** picker (assignments-driven).
2. **Work Orders** board (per contractor):
   - **Payment Schedule** (status pills: All / Open / Completed / Locked Stages).
   - **Additional** (4 sub-tabs: Claimable / Non-Claimable / Rework-SE / Rework-Client).
   - **Additional RAB** (history scoped to additional stages).
   - **Total RAB's** (excludes additional stages).
   - **DLR** (Daily Labour Report).
3. **Request RAB** dialog:
   - Multi-stage allocation with stage-group scoping.
   - Per-section expand → per-item Pick checkbox.
   - Auto-distribute or manual amounts.
   - Section selection scoped by claim_type group.
4. **Edit pending RAB** — same dialog as Request RAB in edit mode.
5. **Mark Work Complete** for a stage.
6. **Material Requests** (raise to PM → Procurement).
7. **Material Receipts** (sign-off on arrival).
8. **Petty Cash** request.
9. **DLR entry** (workers, hours, attendance).

### 4.11 `vendor`
1. View their POs.
2. Confirm / dispatch.
3. Upload invoices.
4. View payment status.

### 4.12 `client`
1. **Single-project dashboard** (auto-redirect on login for 1-project clients).
2. View **payment schedule** + status (Paid / Approved / Pending).
3. **Approve / Reject** Claimable Additional charges.
4. **Cashflow** — money in vs out (filtered: hides Non-Claimable + Rework-SE rows).
5. **Site Visits** — view scheduled visits, confirm presence.
6. **Documents** — contract, invoices, completion certificate.
7. Push notifications via in-app banner.

### 4.13 `pre_sales`
1. CRM Lead inbox (auto-distributed + solo-mode fallback).
2. First-contact log.
3. Convert qualified lead → push to Sales.

### 4.14 `sales`
1. Pipeline view (Stages: New · Quoted · Negotiation · Won · Lost).
2. Slot Management (Phase 2 — show slot beside user's name).
3. Convert Won → push to CRE.

### 4.15 `marketing_head`
1. Lead-source analytics.
2. Distribution rules editor (round-robin / weighted / solo-mode).
3. Campaign ROI.

### 4.16 `architect` / `super_architect`
1. Upload design packages.
2. Version control on drawings.
3. Tag drawings to projects.
4. (Super) Approve revisions.

### 4.17 `hr`
1. Attendance grid.
2. Leave (CL / SL) approvals.
3. Manual punch adjustments.
4. Payroll generation (Phase 2).

### 4.18 `quality_check`
1. **RAB QC inbox** (step 2 of the approval ladder: SE → PM → **QC** → Planning).
2. Site visit reports.
3. Reject with rework reason → creates Rework (SE) additional item.

### 4.19 `prospect`
1. View shared quote.
2. Browse package gallery.
3. Trigger callback.

---

## 5. End-to-End Business Flow (Lead → Handover)

```
Public Site
    │  Lead capture form
    ▼
PRE_SALES (qualify)
    │  Convert
    ▼
SALES (quote, close)
    │  Mark Won
    ▼
CRE  (create project, payment schedule)
    │  Collect 1st cheque
    ▼
ACCOUNTANT (verify cheque → cashbook IN)
    │  Mark verified
    ▼
PLANNING (review, freeze scope)
    │  Submit for approval
    ▼
GENERAL_MANAGER (approve)
    │
    ▼
SUPER_ADMIN (final go-ahead)
    │
    ▼
─── Project goes ACTIVE ───
PROJECT_MANAGER + SR_SITE_ENGINEER + SITE_ENGINEER (execute)
PROCUREMENT (orders + stock)
QUALITY_CHECK (inspect)
ARCHITECT (drawings)

  Per Work Order:
    SE raises RAB
        ↓ PM approves
        ↓ QC approves
        ↓ Planning approves
        ↓ Accountant releases (cashbook OUT)
            ├── Cash (Petty / Suspense)
            ├── Cheque (linked to issued cheque)
            └── Bank transfer (current / savings)

  For Additional Work:
    Planning unlocks section + items
        ↓ SE bills section (or specific picked items)
        ↓ Same approval ladder
        ↓ Client Portal hides Non-Claimable + Rework-SE rows

  For Multi-Stage Bills:
    SE checks N section/stage boxes → allocates amount
        ↓ One RAB request with stage_breakdown[]
        ↓ Approval ladder runs once
        ↓ Accountant releases as ONE payment, ONE cashbook entry

Stage Closure → PM Mark Work Complete
    │
    ▼
Project moves Sub-structure → Super-structure → Finishing → Handover
    │
    ▼
CRE closes (final cheque + handover certificate)
    │
    ▼
COMPLETED
```

---

## 6. Cross-Cutting Modules

- **Cheque Management** — every cheque in the company surfaces here (Received → Opened → Issued → Bounced / Disabled). Project column populated end-to-end (Feb 2026 fix).
- **Suspense Ledger** — auto-credits when a cheque payment exceeds the bill amount; auto-applies on next payment to the same contractor.
- **Notifications** — per-user inbox + push banner; backed by `db.notifications`.
- **Audit Trail** — every payment_request carries `pm_approved_by`, `qc_approved_by`, `planning_approved_by`, `accountant_released_by`, `released_at` snapshots.
- **Public Showcase** — public package gallery, no login required, drives leads.
- **Mobile** — fully responsive; prospect role is mobile-first.

---

## 7. Approval Ladder Summary

| Module                | Originator      | Step 1     | Step 2 | Step 3   | Step 4 (Release) |
| --------------------- | --------------- | ---------- | ------ | -------- | ---------------- |
| Labour RAB            | Site Engineer   | PM         | QC     | Planning | Accountant       |
| Material PO           | Site Engineer   | PM         | —      | Planning | Accountant       |
| Petty Cash (SE)       | Site Engineer   | PM         | —      | —        | Accountant       |
| Petty Cash (PM)       | PM              | —          | —      | —        | Accountant       |
| Income (Cheque)       | CRE             | Accountant | —      | —        | (auto-cashbook)  |
| Project Advancement   | Planning        | GM         | —      | —        | Super Admin      |
| Project Stage         | PM              | —          | —      | —        | (direct)         |

---

_End of architecture document._
