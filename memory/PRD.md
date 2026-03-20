# My Home USB - Construction Management System PRD

## Original Problem Statement
Build a comprehensive Construction OS (My Home USB) with labour and materials management, multi-role workflows, project management, and vendor procurement automation.

## User Personas & Roles
- **Super Admin**: Full system access
- **General Manager (GM)**: High-level oversight
- **Project Manager (PM)**: Project oversight & approvals
- **Planning**: Budget & resource allocation, material/labour approval
- **Procurement**: Vendor management, pricing, PO generation, material tracking
- **Accountant**: Payment approvals, financial tracking
- **Site Engineer**: Daily logs, material requests, labour attendance
- **CRE**: Client relationship management
- **Pre-Sales / Sales**: Lead management
- **HR**: Employee management
- **Client**: Project visibility
- **Vendor**: Order tracking

## Core Requirements
1. Multi-role authentication with demo access
2. Project lifecycle management
3. Material request → Planning approval → Procurement → Accountant → Delivery workflow
4. Labour expense management with contractor-centric tracking
5. Vendor master management
6. Purchase order automation
7. Credit ledger tracking
8. Real-time notifications with workflow context
9. Google Sheets sync for reporting
10. Object storage for documents

## Tech Stack
- **Frontend**: React + Shadcn UI + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB Atlas
- **Integrations**: Google Sheets API, Resend (email), Emergent Object Storage, Leaflet/OSM, jsPDF

## Key Database Collections
- `users`, `sessions`, `projects`
- `material_requests` (status workflow: draft → planning_approved → vendor_selected → waiting_payment → payment_approved → po_generated → in_transit → received_completed)
- `labour_expenses` (similar workflow)
- `vendor_master` (material & labour vendors)
- `purchase_orders` (manual/auto POs)
- `purchase_orders_v2` (auto-generated POs from procurement flow)
- `procurement_pricing` (vendor quotes & pricing)
- `credit_ledger` (vendor credit tracking)
- `transit_tracking` (delivery tracking)
- `contractor_master`, `site_engineer_assignments`

## What's Been Implemented

### Completed Features
- [x] Multi-role authentication with demo access buttons
- [x] Project management (CRUD, timeline, milestones)
- [x] Material request workflow (SE → Planning → Procurement → Accountant → Delivery)
- [x] Labour expense workflow (SE → Planning → Procurement → Accountant)
- [x] Vendor master management (add, edit, categorize)
- [x] Purchase Order system (auto-generated & manual)
- [x] Credit ledger with overdue tracking
- [x] Transit tracking with OTP verification
- [x] Procurement Board V2 with 7 tabs (Pending, Pricing, Payment, POs, Transit, Credit, Vendors)
- [x] Site Engineer project page with Labour Count & Stock Register tabs
- [x] Contractor-centric labour attendance (skill types, daily cost calculation)
- [x] Work order stage timeline for contractors
- [x] Workflow-aware toast notifications (34 messages across 12 pages)
- [x] Accountant approval flow (bug fixed - status transitions corrected)
- [x] Vendor/PO automation (auto-assign vendors, auto-generate POs on planning approval)
- [x] Google Sheets auto-sync
- [x] Comprehensive procurement board data seeding for Vinoth Kumar project (Mar 2026)
- [x] Order Detail Popup - clickable order cards showing full details, approval timeline, and inline editing (Mar 2026)
- [x] Work Orders Tab - replaced Labours/Labour Count with contractor-centric work order stages, daily attendance, and multi-step payment request flow (Mar 2026)

### Demo Data Seeded (Mar 20, 2026)
- Vinoth Kumar project: 15 material requests across all workflow states
- 8 vendors with complete profiles
- 5 purchase orders (3 auto, 2 manual)
- 3 credit ledger entries (₹91.1K outstanding, 1 overdue)
- 3 transit orders with vehicle/OTP tracking
- 2 procurement pricing records

## Backlog

### P0
- [ ] Two-Factor Authentication (2FA) with mobile OTP

### P1
- [ ] Advanced Cybersecurity Practices (break into actionable items)
- [ ] Aadhar Document Upload with encrypted storage (object storage integration)
- [ ] Refactor ProjectDetail.jsx (4000+ lines → smaller components)

### P2
- [ ] Cash Denomination feature (paused by user)
- [ ] Comprehensive UI/UX review
- [ ] Convert to SaaS model
- [ ] Production deployment guidance

## Credentials
- All demo users: password `Demo@1234`
- Email format: `{role}@constructionos.com` (e.g., procurement@constructionos.com)
- Demo Access buttons available on login page
