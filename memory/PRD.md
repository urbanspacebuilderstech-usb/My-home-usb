# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## Current Seed Data
**Single Project: Villa Murugan - Vadapalani (PROJ-2026-001)**
- Client: Mr. Murugan, Vadapalani Chennai
- Value: Rs.55,00,000 | 2400 sqft | 3BHK G+1 Villa
- Income: Rs.9,00,000 (2 approved + 1 pending)
- Expenses: Rs.2,80,300
- 13 Payment stages (2 paid, 11 pending)
- 4 Work Orders | 8 Vendors | 12 BOQ Items
- 6 Material Requests | 3 Labour | 2 Vendor Expenses
- 3 Petty Cash | 4 Cheques | 4 Site Stages
- 6 Pending Approvals for Accountant

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] Pre-Sales -> Sales transfer (any is_final stage)
- [x] RNR Stage + Pipeline Stage Management (CRUD)
- [x] Deal conversion, project creation, work orders
- [x] Material request/procurement/approval workflow
- [x] Site Engineer Mini Cashbook + Petty Cash
- [x] Accountant Cashbook, Cheque Management, Project Summary
- [x] Income/Expense Approval System
- [x] Masked Financial Values (Super Admin=visible, Accountant=Rs.*****)
- [x] Super Admin auto-creation (urbanspacebuilderstech@gmail.com)
- [x] Forgot Password + Role-based access control
- [x] 360 degree seed data for Murugan Vadapalani project
- [x] CRE Dashboard loading fix - parallelized API/DB calls, skeleton loader (Mar 14, 2026)
- [x] End-to-End Workflow Fix (Mar 14, 2026)
- [x] Login Loading & Super Admin Flash Fix (Mar 14, 2026)
- [x] Appointment Booking & Sales Lead Editing (Mar 14, 2026)
- [x] **Rough Estimate PDF Redesign (Mar 14, 2026)**:
  - Replaced backend PDF generation with frontend jsPDF-based approach
  - Created shared PDF utility (`/app/frontend/src/utils/pdfGenerator.js`)
  - Updated ALL 4 pages using RE PDF: REProjectsPage, CRMSales, GMDashboard, ProjectDetail
  - Professional letterhead with logo, company name, tagline, contact info
  - Centered "ROUGH ESTIMATE" title with ref/date
  - CLIENT INFORMATION and PROJECT DETAILS in bordered boxes
  - SCOPE OF WORKS table with grid theme
  - Purple ESTIMATED TOTAL box with white text
  - Disclaimer text and footer (company name, Terms & Conditions, GSTIN, timestamp)
  - Diagonal watermark
  - Currency uses "Rs." prefix (jsPDF Helvetica font limitation for ₹ symbol)
  - Works from both RE Projects page and CRM Sales page

- [x] **RE Rejection → Re-edit → Resubmit Flow (Mar 14, 2026)**:
  - GM rejection sends notification to Planning with reason
  - Planning sees rejection reason prominently on rejected projects
  - Planning can Edit and Resubmit rejected REs for re-approval
  - Backend updated to allow editing/resubmitting rejected projects
- [x] **Pre-Sales Appointment Edit Module (Mar 14, 2026)**:
  - Added appointment display card in lead detail overview (date, time, type)
  - Added Edit Appointment dialog pre-filled with existing data
  - Added "Book Appointment" option for leads without appointments
- [x] **P0: Fix Duplicate Projects on CRE Dashboard (Mar 14, 2026)**:
  - Root cause: Dashboard endpoint returned ALL projects (no created_by filter), so projects created by sales AND CRE for same RE showed up twice
  - Added `created_by` filter to `/api/cre/dashboard` for CRE users
  - Fixed `payment_received_count` to include both `payment_received` and `payment_verified` statuses
  - Added duplicate prevention in both `convert-deal` and `convert-re-project` endpoints (checks existing projects by `re_project_id` and `lead_id`)
  - Cleaned up duplicate project data in MongoDB
- [x] **P1: Planning Board "New Projects" Tab (Mar 14, 2026)**:
  - Added dedicated TabsContent for "New Projects" tab with rich card-based view
  - Shows project details: client, location, area, value, advance, building type, phone, email
  - Includes count badge on tab when new projects exist
  - Shows "New from CRE" / "In Review" / "Planning" status badges
  - Includes "View Details" and "Submit for Approval" action buttons
- [x] **P2: "Convert to Scope" Button (Mar 14, 2026)**:
  - Added "Convert to Scope" button in ProjectDetail Rough Estimate tab
  - Copies RE scope items to project's actual scope items via `/api/scope-items/bulk`
  - Auto-switches to the "Scope" tab after conversion
  - Handles edge case when RE has no scope items
- [x] **P0: Approval Workflow Removal (Mar 14, 2026)**:
  - Removed multi-step approval workflow for Scope, Payment Stages, Additional Costs, Deductions
  - Items created in "approved" state by default
- [x] **P1: Multi-Select Delete (Mar 14, 2026)**:
  - Added checkboxes and "Delete Selected" to Scope and Payment Schedule tables
- [x] **P2: Project Stages with Templates (Mar 14, 2026)**:
  - Full project stages tab with create, edit, delete, status tracking, and template system
- [x] **P2: Payment Schedule Balance Logic (Mar 14, 2026)**:
  - Payment schedule calculated on balance (Total - Advance) not total value
- [x] **P2: Request Payment for Additional Work (Mar 14, 2026)**:
  - "Req Payment" button added to Additional Costs table
- [x] **P0: Dynamic Cheque Entry (Mar 14, 2026)**:
  - "No. of Cheques" input dynamically generates cheque detail rows (No., Bank, Amount, Date)
  - Works in Create Project, Collect Payment, and Convert Deal dialogs
  - Backend saves cheque records to `cheques` collection with income/stage linking
  - Cheque total displayed below entries
- [x] **P0: CRE Dashboard Redesign (Mar 14, 2026)**:
  - Redesigned with 5 clean tabs: New Deals, All Projects, Payment Req, Payment Approvals, Payment Collected
  - Summary cards: Total Projects, Total Value, Total Collected, Pending Actions
  - Payment Req tab: Sub-tabs for Stage Payment Requests and Additional Payments
  - Payment Approvals: Advance → Send to Planning, Others → Just Approve
  - Payment Collected: Full payment ledger with project name, date, category, mode, status columns
  - Create Project: Two modes - "Full Project + Advance" and "Request RE from Planning"
  - "Request RE" sends notification to Planning team and creates project in planning_review status
  - New backend endpoints: /cre/additional-payment-requests, /cre/income-collected, /cre/pending-approvals, /cre/projects/request-re

## Credentials
- Accountant: `accountant@constructionos.com` / `Demo@1234`
- CRE: `cre@constructionos.com` / `Demo@1234`
- GM: `gm@constructionos.com` / `Demo@1234`
- Project Manager: `pm@constructionos.com` / `Demo@1234`
- Planning: `planning@constructionos.com` / `Demo@1234`
- Procurement: `procurement@constructionos.com` / `Demo@1234`
- Site Engineer: `engineer@constructionos.com` / `Demo@1234`
- Pre-Sales: `presales@constructionos.com` / `Demo@1234`
- Sales: `sales@constructionos.com` / `Demo@1234`
- Production: `urbanspacebuilderstech@gmail.com` (Forgot Password)

## Backlog
- [ ] Gantt Chart for project timelines (P1)
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review continuation
- [ ] Production deployment guidance
- [ ] Optimize /api/cre/dashboard-summary endpoint (~3.5s response time)
