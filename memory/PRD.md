# Construction CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive Construction CRM/ERP system with automated project onboarding, sales pipeline management, and operational workflows for a construction company.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB Atlas
- **Auth**: Cookie-based session auth with RBAC
- **Roles**: super_admin, sales, pre_sales, cre, planning, project_manager, site_engineer, sr_site_engineer, accountant, hr, architect, marketing_head, general_manager, client, vendor

## What's Been Implemented

### Sales Pipeline (CRMSales.jsx)
- 16-stage Kanban board, Follow-ups, Site Visits, Automated onboarding

### Project Management (ProjectDetail.jsx)
- 12 tabs: Estimate, Final Estimate, Stages, Team, Materials, Labours, Work Orders, Payments, Additional, Deduction, Summary, Documents
- Work Order Stage Payment System with multiple partial payments
- 4-Level Approval, Freeze & Reassign, DLR, Google Maps Location

### Site Engineer View (SiteEngineerDashboard.jsx)
- 7 tabs: Projects, Site Visits, Work Orders, Petty Cash, Cashbook, Curing Video, Attendance
- GPS Attendance, SE Material Request from project cards

### Planning Board, PM Dashboard, Accounts Board, Procurement Board
- All with respective approval flows

### Security Features
- Google Authenticator 2FA, Email OTP Change Password
- DEMO_MODE toggle, Global Rate Limiting, File Type validation

### Demo Data System
- Comprehensive seed script (`seed_demo_data.py`) that:
  - Wipes all project data
  - Seeds ONE project "Swathi 60L G+2" (₹80L scope, ₹30L paid, ~50% progress)
  - Populates ALL 12 project detail tabs with realistic data
  - Populates ALL role-specific dashboards (Sales, SE, Accounts, Planning, Procurement, PM, Super Admin)
  - Creates 9 CRM leads, 13 scope items, 12 stages, 10 materials, 10 material requests, 8 labour expenses, 3 work orders, 5 income entries, 8 payment stages, 2 additional costs, 3 deductions, 5 design files, 3 site plans, 6 BOQ items, inventory, credit ledger, cheques, attendance, curing videos, etc.

## Completed Tasks (Latest Session - Feb 2026)
- [x] Comprehensive Demo Data Seed Script - populates ALL tabs and ALL boards
- [x] Fixed stage field names (stage_name, start_date, target_date, finished/started/yet_to_start)
- [x] Fixed payment stage fields (stage_name, percentage, workflow_status, is_advance)
- [x] Verified: Super Admin dashboard, Project Detail (Estimate, Stages, Payments tabs)

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5400 lines)
- Refactor SiteEngineerDashboard.jsx (~2200+ lines)
- Refactor AccountsBoard.jsx (~3000 lines)

### P1 (High)
- Sr. Engineer to Jr. Engineer Assignment Workflow

### P2 (Medium)
- Aadhar Document Upload (with encrypted storage)
- Cash Denomination (paused)
- SaaS conversion (paused)

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
- DEMO_MODE=true in backend/.env (must remain true for preview)

## Key Files
- `/app/backend/seed_demo_data.py` - Demo data generator (34 steps, all collections)
- `/app/backend/routes/auth.py` - Auth, 2FA, OTP
- `/app/backend/routes/projects.py` - Project CRUD, stages, team, dashboard
- `/app/backend/routes/financial.py` - Full details, payments, scope items
- `/app/backend/routes/crm.py` - CRM stages, leads, RE projects
- `/app/frontend/src/pages/ProjectDetail.jsx` - Project detail with 12 tabs
- `/app/frontend/src/pages/Dashboard.jsx` - Super Admin dashboard
