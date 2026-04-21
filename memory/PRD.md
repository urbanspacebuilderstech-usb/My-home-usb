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

### Session — April 21, 2026 (Latest)
- **Timeline Ascending Sort Fix**: Lead Timeline in both Pre-Sales & Sales now unifies stage_history, follow_ups, rnr_log, office_visit, and lead creation into a single list sorted strictly ascending by timestamp. Earlier, separate sections caused out-of-order entries (e.g., RNR #1 from 21 Apr appeared after Follow-up scheduled for 22 Apr).
- **Sales CRM RNR Events**: Added RNR log rendering to Sales CRM timeline for parity with Pre-Sales.

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
