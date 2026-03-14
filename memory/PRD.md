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

## Credentials
- Super Admin: `admin@constructionos.com` / `Demo@1234`
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
