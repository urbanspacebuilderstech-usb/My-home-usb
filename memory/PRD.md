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
- 9 Project Stages with start_date & target_date (for Gantt chart)

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
- [x] CRE Dashboard loading fix - parallelized API/DB calls, skeleton loader
- [x] End-to-End Workflow Fix
- [x] Login Loading & Super Admin Flash Fix
- [x] Appointment Booking & Sales Lead Editing
- [x] Rough Estimate PDF Redesign (jsPDF-based, professional letterhead)
- [x] RE Rejection -> Re-edit -> Resubmit Flow
- [x] Pre-Sales Appointment Edit Module
- [x] Fix Duplicate Projects on CRE Dashboard
- [x] Planning Board "New Projects" Tab
- [x] "Convert to Scope" Button
- [x] Approval Workflow Removal (items created in "approved" state)
- [x] Multi-Select Delete for Scope and Payment Schedule
- [x] Project Stages with Templates
- [x] Payment Schedule Balance Logic
- [x] Request Payment for Additional Work
- [x] Dynamic Cheque Entry (multiple cheques per payment)
- [x] CRE Dashboard Redesign (5-tab layout)
- [x] Planning Board Redesign (simplified tabs-only)
- [x] **PM Dashboard & Permissions (Mar 14, 2026)**:
  - Tab-based dashboard for Project Managers (All Projects, Requests, Team)
  - Create Site Engineer users, assign team to projects
  - Material & Labour request approval/rejection
  - Financial data completely hidden from PM role in ProjectDetail
- [x] **Gantt Chart for Project Timelines (Mar 14, 2026)**:
  - Added `start_date` field to project stages (backend model + API)
  - Custom GanttChart component with horizontal timeline bars
  - Color-coded bars: gray=yet_to_start, amber=started, green=finished
  - TODAY marker, zoom in/out controls, legend
  - Month & day column headers with weekend shading
  - Hover tooltips showing stage details (name, dates, duration, status)
  - Table/Gantt view toggle in Project Stages tab
  - Table view updated with Start Date + Target Date columns
  - Add/Edit stage forms include start_date field

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
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review continuation
- [ ] Production deployment guidance
- [ ] Optimize /api/cre/dashboard-summary endpoint (~3.5s response time)
