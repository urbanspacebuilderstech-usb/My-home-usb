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
- Work Order Stage Payment System with multi-level approval (SE → PM → Planning → Accountant)
- Labours tab now has full Work Order functionality (same as Work Orders tab): Scope, Stages, Additional, DLR with approval workflows
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
- Comprehensive seed script (`seed_demo_data.py`) populates ALL tabs and boards
- Work Orders seeded with proper schema: total_value, paid_amount, scope_total, stages with approval trail

## Latest Changes (Feb 2026)
- [x] Fixed Work Orders tab ₹0 bug (seed data field name mismatch: total_amount→total_value, completed→approved)
- [x] Added full Work Order functionality to Labours tab Work Orders sub-tab (list/detail view with Scope, Stages, Additional, DLR)
- [x] Both Work Orders tab and Labours tab now share same data source (/api/projects/{id}/work-orders)
- [x] 100% test pass rate (iteration_143)
- [x] Forgot Password: Now returns reset link as fallback when email delivery fails (Copy Link + Open Reset Page)
- [x] Invitation: Always returns setup_link so admin can share manually
- [x] Resend-invitation: Always returns setup_link
- [x] SECURITY AUDIT: Removed ALL token/link leaks from public APIs (forgot-password, setup-status, invite, resend-invitation). No sensitive data exposed in any API response.
- [x] HR Employee Email Sync: Editing email in Employee Directory now auto-updates the linked user's email in Roles & Credentials

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5600 lines)
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
- DEMO_MODE=true in backend/.env

## Key Files
- `/app/backend/seed_demo_data.py` - Demo data generator
- `/app/frontend/src/pages/ProjectDetail.jsx` - Project detail (12 tabs, Work Orders + Labours WO)
- `/app/backend/routes/projects.py` - Project CRUD, work orders API
- `/app/backend/routes/financial.py` - Full details, payments, scope items
