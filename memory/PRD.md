# Construction CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive Construction CRM/ERP system with automated project onboarding, sales pipeline management, and operational workflows for a construction company.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB Atlas
- **Auth**: Cookie-based session auth with role-based access control (RBAC)
- **Roles**: super_admin, sales, pre_sales, cre, planning, project_manager, site_engineer, sr_site_engineer, accountant

## What's Been Implemented

### Sales Pipeline (CRMSales.jsx)
- 16-stage Kanban board with drag-and-drop
- Follow-up management, Site Visit management
- Automated onboarding pipeline with CRE-style Convert dialog

### Project Management (ProjectDetail.jsx)
- Full project lifecycle: Estimates, Materials, Labours, Work Orders, Payments, Documents, Summary
- **Work Order Stage Payment System (REVAMPED)**:
  - Multiple partial payment requests per stage until total is paid
  - Amount tracking: Released / Pending / Balance per stage
  - 4-Level Approval: SE → PM → Planning → Accountant
  - "Finish Stage" button with SE remarks (blocks further payments)
  - Backward compatible with legacy single-status stages
- Freeze & Reassign, DLR, Google Maps URL Location

### Site Engineer View (SiteEngineerDashboard.jsx)
- 7 tabs: Projects, Site Visits, Work Orders, Petty Cash, Cashbook, Curing Video, Attendance
- **Work Orders Tab (REVAMPED)**: Stage cards with amount breakdown, "Request Payment" dialog (amount + notes), "Finish Stage" dialog (remarks)
- **Petty Cash (REVAMPED)**: Global request (no project), multi-level approval, Record Expense with categories
- **Curing Video**: Global button, popup, WhatsApp link, history tab
- **Inventory, GPS Attendance, Background GPS Tracking**

### Planning Board (PlanningBoard.jsx)
- Packages, Material Vendors, Live Map Dashboard
- Custom header navigation in AppHeader

### PM Dashboard (PMDashboard.jsx)
- All Projects, Requests, **Petty Cash Approval**, Team tabs

### Accounts Board (AccountsBoard.jsx)
- **Petty Cash Management**: PM-Approved requests section with Process Payment dialog

## Key API Endpoints (Latest)
- Stage Payments: PATCH `.../stages/{sid}/request-payment` (partial), `.../stages/{sid}/approve` (4-level), `.../stages/{sid}/finish`
- Petty Cash: POST `/api/site-engineer/petty-cash/request` (global), PM approve/reject, Accountant process-payment, SE acknowledge
- Direct Expenses: POST `/api/site-engineer/direct-expense`, GET `.../direct-expenses`
- Curing Video: POST/GET/PATCH `/api/site-engineer/curing-video/...`

## Completed Tasks (Latest Session - Apr 2026)
- [x] AppHeader custom navigation - iteration_130
- [x] Curing Video Management - iteration_131
- [x] Dialog viewport fix - iteration_132
- [x] Petty Cash Multi-Level Approval - iteration_133 (17/17)
- [x] Petty Cash Request made global - verified via curl
- [x] **Work Order Stage Payment System** - iteration_134 (21/21 backend)
  - Multiple partial payments per stage
  - 4-level approval pipeline
  - Balance validation, finish stage, rejection flow

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5400 lines)
- Refactor PlanningBoard.jsx (~1900 lines)

### P1 (High Priority)
- Pre-Deployment Security: 2FA, rate limiting, disable demo-login
- Refactor SiteEngineerDashboard.jsx (~2100+ lines)

### P2 (Medium Priority)
- Sr. Engineer → Jr. Engineer Assignment Workflow
- Aadhar Document Upload (encrypted storage)
- Cash Denomination (paused), SaaS conversion (paused)

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
