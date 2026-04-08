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
- Full lifecycle: Estimates, Materials, Labours, Work Orders, Payments, Documents, Summary
- Work Order Stage Payment System with multiple partial payments
- 4-Level Approval, Freeze & Reassign, DLR, Google Maps Location

### Site Engineer View (SiteEngineerDashboard.jsx)
- 7 tabs: Projects, Site Visits, Work Orders (Assigned Contractors), Petty Cash, Cashbook, Curing Video, Attendance
- Assigned Contractors View, Petty Cash, Curing Video, Inventory, GPS Attendance
- SE Material Request from project cards with auto-selected pre-approved materials

### Planning Board, PM Dashboard, Accounts Board
- All with respective approval flows for petty cash and work order payments
- Procurement Approval stage added to material request pipeline

### Security Features
- Google Authenticator 2FA setup/verify flow
- Email OTP Change Password
- DEMO_MODE toggle for demo buttons
- Global Rate Limiting Middleware (100 req/min/IP)
- File Type validation blocking executables
- Protected previously open endpoints

## Completed Tasks (Latest Session - Feb 2026)
- [x] Demo Data Seed Script (`seed_demo_data.py`) - Wipes all project data and seeds comprehensive demo for "Swathi 60L G+2" (60L value, 30L paid, ~50% progress)
- [x] Data populates all dashboards: Super Admin, Sales CRM, SE, Accounts, Planning, Procurement, Project Detail

## Completed Tasks (Previous Sessions)
- [x] GPS Mandatory Attendance
- [x] SE Material Request
- [x] Procurement Approval Step
- [x] 2FA Google Authenticator
- [x] Email OTP Change Password
- [x] Security Audit & Fixes (Demo Mode, Rate Limiting, File Validation)
- [x] Resend Email DNS Verified
- [x] Petrol Allowance
- [x] Work Order Stage Payment System
- [x] Assigned Contractors View
- [x] Petty Cash Multi-Level Approval
- [x] Curing Video Management
- [x] AppHeader custom navigation

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
- `/app/backend/seed_demo_data.py` - Demo data generator
- `/app/backend/routes/auth.py` - Auth, 2FA, OTP
- `/app/backend/routes/projects.py` - Project CRUD, dashboard summary
- `/app/backend/routes/crm.py` - CRM stages, leads, follow-ups
- `/app/backend/routes/site_ops.py` - SE operations, GPS, materials
- `/app/backend/routes/procurement.py` - Procurement approval flow
- `/app/frontend/src/pages/Dashboard.jsx` - Super Admin dashboard
- `/app/frontend/src/pages/CRMSales.jsx` - Sales Kanban
- `/app/frontend/src/pages/SiteEngineerDashboard.jsx` - SE dashboard
- `/app/frontend/src/pages/AccountsBoard.jsx` - Accounts dashboard
