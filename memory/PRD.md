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
- 16-stage Kanban board with drag-and-drop (DnD-Kit)
- Follow-up management with auto-move + date filtering
- Site Visit management (Client Land / Our Projects)
- Automated onboarding: Payment Collect → Accountant Approval → Project Onboarded
- CRE-style "Convert to Project" multi-step dialog

### Project Management (ProjectDetail.jsx)
- Project header with inline editing, auto-generated USB-H0001 format IDs
- Role-based client contact visibility (Sales/Pre-sales/CRE only)
- 7-role team assignment with dropdowns
- Estimate / Final Estimate / Stages / Payments / Additional / Deductions tabs
- Materials tab: Package template loader, View/Edit toggle, dynamic Material/Brand dropdowns
- Labours tab: Work order creation, attendance tracking, payment stages
- **Work Orders tab**: Full CRUD with contractor type → contractor → scope/stages/additional + **Labour Day Rates** (skilled/semi-skilled/unskilled per-day rates for DLR)
- **4-Level Payment Approval Pipeline**: SE Request → PM → Planning → Accountant
- **Freeze & Reassign (NEW)**: OTP-verified freeze of underperforming contractors, auto-creates new WO with balance stages for replacement contractor
- Documents tab: Site plans, design files
- Summary tab: Financial overview

### Site Engineer View (SiteEngineerProject.jsx)
- Labour tracking, attendance, material requests
- Contractor Payments section: View project work orders, request stage payments
- **Daily Labour Report (DLR)**: Toggle DLR panel on each work order card to record/view attendance
- Work order tab (old labour-based system)
- Stock management, daily progress

### Planning Board (PlanningBoard.jsx)
- Packages tab with dynamic Material/Brand dropdowns + "Create New"
- Scope items with Qty/Total columns

### Other Modules
- Vendor management, Purchase orders
- Contractor management
- BOQ (Bill of Quantities)
- Income/Expense tracking
- PDF generation (jsPDF)

## Database Collections (Key)
- `users`, `projects`, `leads`, `lead_stages`
- `project_work_orders` (scope-based work orders with 4-level approval)
- `daily_labour_reports` (DLR per work order per day, tracks type/count/day_value/rate)
- `freeze_otps` (stores hashed OTPs for freeze verification)
- `work_orders` (OLD - labour-based, used by Labours tab)
- `labour_work_orders` (OLD - used by Site Engineer)
- `material_names`, `material_requests`, `purchase_orders`
- `contractors`, `vendor_master`

## Key API Endpoints
- Work Orders: GET/POST/PATCH/DELETE `/api/projects/{project_id}/work-orders`
- Payment Pipeline: PATCH `.../stages/{stage_id}/request-payment`, `.../approve`, `.../revert`
- Freeze: POST `.../freeze/send-otp`, `.../freeze/verify-otp`, `.../freeze/reassign`
- **DLR**: POST/GET `/api/projects/{pid}/work-orders/{woid}/dlr`, DELETE `.../dlr/{dlr_id}`, GET `/api/projects/{pid}/dlr/summary`
- Contractor Types: GET `/api/contractor-types`

## Completed Tasks (Latest Session - April 2026)
- [x] Work Orders CRUD backend (project_work_orders collection)
- [x] 4-level payment approval pipeline (SE → PM → Planning → Accountant)
- [x] Work Orders tab in ProjectDetail with approval trail UI
- [x] Site Engineer contractor payments view with "Request Payment"
- [x] Fixed null safety crash in ProjectDetail (materialsData, laboursData, designData, woForm)
- [x] **Freeze & Reassign feature**: OTP-verified freeze + auto-reassign balance stages to new contractor
- [x] Planning Board 2-Level Nested Tab Restructuring
- [x] **Daily Labour Report (DLR)**: Per work order attendance tracking (Skilled/Semi-Skilled/Unskilled, day fractions 0.5/1/1.5, auto-cost calc). Shared DLRPanel component used in both SiteEngineerProject & ProjectDetail.
- [x] Testing: iteration_121-124 all passed

## Prioritized Backlog

### P0 (Critical)
- None currently blocking

### P1 (High Priority)
- Refactor ProjectDetail.jsx (~5300 lines) into components
- Refactor CRMSales.jsx (~2300 lines) into components
- Geo-fencing & Location Tracking (Phase 1)
- Pre-Deployment Security: 2FA, rate limiting to MongoDB, disable demo-login

### P2 (Medium Priority)
- Sr. Engineer → Jr. Engineer Assignment Workflow
- Aadhar Document Upload (encrypted storage)
- Cash Denomination feature (paused)
- SaaS model conversion (paused)
- Comprehensive UI/UX review

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
