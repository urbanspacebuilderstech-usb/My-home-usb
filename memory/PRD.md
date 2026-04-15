# Construction CRM — Product Requirements Document

## Original Problem Statement
Full-stack Construction CRM (React + FastAPI + MongoDB) for managing pre-sales leads, sales pipeline, project management, HR/payroll, and site operations. Key workflows include automated lead handoff from Pre-Sales → Sales, biometric attendance tracking, and payment processing.

## Architecture
- **Frontend**: React (port 3000), Shadcn/UI components
- **Backend**: FastAPI (port 8001), prefix `/api`
- **Database**: MongoDB Atlas (`construction_crm`)
- **Auth**: Session cookies (not Bearer tokens)
- **Routes**: `/hr-portal`, `/crm-pre-sales`, `/crm-sales`, `/projects`, `/accounts`

## What's Been Implemented

### Session — April 2026
- **Biometric Sync Key UI**: Super Admin can generate/revoke eSSL sync keys from HR Settings
- **Department dropdown**: Added to Add Employee (9 departments: Sales, HR, Operations, Planning, Quality, Architecture, Purchase, Accounts, Marketing)
- **Designation dropdown**: Updated with 38 company-specific job titles
- **Employee Terminate/Left History**: Active/Left toggle, Leave History dialog, Permanent Delete
- **Sort filters**: Added to Active Employees, Left Employees, Roles & Credentials tables
- **Pre-Sales → Sales Transfer Fix**: Transfer triggers on stage_id (not just is_final flag), auto-fixes is_final
- **Unassigned Leads Fix**: Pre-Sales & Sales users now see own + unassigned leads
- **Date Filter Fix**: Pre-Sales & Sales no longer default to today's date
- **Missing Stages Auto-Fill**: New RNR Leads + New Appointment auto-created if missing
- **Duplicate Appointment Booked card removed** from Pre-Sales
- **Sync Sheets access**: Pre-Sales users can now trigger sync (not just Super Admin)
- **Migration endpoint**: POST /api/crm/migrate-stages (Super Admin) fixes stages

### Previous Sessions
- eSSL biometric auto-sync script + CSV upload fallback
- API Security Audit (stripped tokens/passwords from responses)
- Bi-directional Email/Name sync (staff ↔ users)
- HR Password Reset, Setup lockdown, Demo Access blocking
- Pre-Sales daily follow-up filter + auto-move
- HR Attendance UI (Day/Month views, Late/Absent badges)
- Sales Kanban with automated onboarding pipeline
- Site Visit management system
- Follow-up management system

## Pending / Upcoming Tasks
- 🔴 [P0] Deploy to production (user must use "Save to Github")
- 🔴 [P0] PaySprint escrow integration (waiting for API credentials)
- 🔴 [P0] Unified Attendance (SE GPS + Biometric + Manual Punch + Leave CL/SL)
- 🔴 [P0] Automated Payroll
- 🔴 [P0] RNR Count Tracker & Appointment Date Filter (in progress)
- 🟡 [P1] Refactor bloated files (ProjectDetail.jsx 5600+, CRMSales.jsx 2400+, HRPortal.jsx 1600+)
- 🔵 [P2] Sr. Engineer → Jr. Engineer assignment
- 🔵 [P2] Aadhar Document Upload
- 🔵 [P2] Cash Denomination feature
- 🔵 [P2] SaaS conversion

## Key API Endpoints
- POST /api/crm/migrate-stages — Fix missing stages in production
- POST /api/crm/fix-unassigned-sales-leads — Fix unassigned sales leads via round-robin
- POST /api/hr/attendance/essl-sync — Biometric sync
- GET /api/hr/terminated-staff — Left employees with leave history
- DELETE /api/hr/staff/{id}/permanent — Permanent delete
- POST /api/hr/attendance/generate-sync-key — Generate eSSL sync key
- GET /api/marketing/dashboard — Marketing overview (auto-refreshes distribution)
- POST /api/marketing/distribution-settings/refresh — Refresh team members

## Test Reports
- /app/test_reports/iteration_144.json (100% pass rate)
- /app/test_reports/iteration_146.json (100% pass rate)
- /app/test_reports/iteration_147.json (100% pass rate)
