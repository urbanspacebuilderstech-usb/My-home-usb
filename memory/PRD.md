# Construction CRM - Product Requirements Document

## Original Problem Statement
Build a comprehensive Construction CRM/ERP system with automated project onboarding, sales pipeline management, and operational workflows for a construction company.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB Atlas
- **Auth**: Cookie-based session auth with RBAC
- **Roles**: super_admin, sales, pre_sales, cre, planning, project_manager, site_engineer, sr_site_engineer, accountant

## What's Been Implemented

### Sales Pipeline (CRMSales.jsx)
- 16-stage Kanban board, Follow-ups, Site Visits, Automated onboarding

### Project Management (ProjectDetail.jsx)
- Full lifecycle: Estimates, Materials, Labours, Work Orders, Payments, Documents, Summary
- Work Order Stage Payment System with multiple partial payments
- 4-Level Approval, Freeze & Reassign, DLR, Google Maps Location

### Site Engineer View (SiteEngineerDashboard.jsx)
- 7 tabs: Projects, Site Visits, **Work Orders (Assigned Contractors)**, Petty Cash, Cashbook, Curing Video, Attendance
- **Assigned Contractors View (NEW)**: 
  - Level 1: Grouped contractor list with icon, name, work type badge, active stages count, total amount
  - Level 2: Drill-down into stages with Released/Pending/Balance breakdown, payment request history
  - Request Payment & Finish Stage buttons per stage
  - Back navigation to contractor list
- **Petty Cash**: Global request, multi-level approval, Record Expense with categories
- **Curing Video**: Global button, popup, WhatsApp link, history tab
- **Inventory, GPS Attendance, Background GPS Tracking**

### Planning Board, PM Dashboard, Accounts Board
- All with respective approval flows for petty cash and work order payments

## Completed Tasks (Latest Session - Apr 2026)
- [x] AppHeader custom navigation - iteration_130
- [x] Curing Video Management - iteration_131
- [x] Dialog viewport fix - iteration_132
- [x] Petty Cash Multi-Level Approval - iteration_133
- [x] Petty Cash Request made global
- [x] Work Order Stage Payment System - iteration_134
- [x] **Assigned Contractors View** - iteration_135 (21/21 backend, 100% frontend)
- [x] **Petrol Allowance** - iteration_136 (SE -> Accountant direct, Date/Amount/KM)
- [x] **GPS Mandatory Attendance** - iteration_136 (Login requires GPS ON, auto-logout on GPS loss)
- [x] **SE Material Request** - iteration_137 (Request materials against project from Planning-approved list, 48hr notice)
- [x] **Procurement Approval Step** - iteration_138 (New step: Planning Approved → Procurement Approves → Vendor Selection. Approval tab with Approve/Reject)
- [x] **Resend Email Config** - Updated sender to noreply@myhomeusb.com, DNS verified (SPF/DKIM/MX)
- [x] **2FA Google Authenticator** - iteration_139 (My Profile page with Basic Info + Security tabs, TOTP setup/verify/disable, Login 2FA flow)

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5400 lines)
- Refactor PlanningBoard.jsx (~1900 lines)
- Refactor SiteEngineerDashboard.jsx (~2100+ lines)

### P1 (High)
- Pre-Deployment Security: 2FA, rate limiting, disable demo-login

### P2 (Medium)
- Sr. Engineer → Jr. Engineer Assignment
- Aadhar Document Upload, Cash Denomination (paused), SaaS (paused)

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
