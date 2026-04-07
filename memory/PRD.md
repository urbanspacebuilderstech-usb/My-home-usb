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
- Automated onboarding: Payment Collect -> Accountant Approval -> Project Onboarded
- CRE-style "Convert to Project" multi-step dialog

### Project Management (ProjectDetail.jsx)
- Project header with inline editing, auto-generated USB-H0001 format IDs
- Role-based client contact visibility (Sales/Pre-sales/CRE only)
- 7-role team assignment with dropdowns
- Estimate / Final Estimate / Stages / Payments / Additional / Deductions tabs
- Materials tab: Package template loader, View/Edit toggle, dynamic Material/Brand dropdowns
- Labours tab: Work order creation, attendance tracking, payment stages
- **Work Orders tab**: Full CRUD with contractor type -> contractor -> scope/stages/additional + Labour Day Rates
- **4-Level Payment Approval Pipeline**: SE Request -> PM -> Planning -> Accountant
- **Freeze & Reassign**: OTP-verified freeze of underperforming contractors
- Documents tab: Site plans, design files
- Summary tab: Financial overview
- **DLR (Daily Labour Report)**: Per work order attendance tracking with 3 fixed rows
- **Google Maps URL Location Setup**: Paste Google Maps URL to set project coordinates

### Site Engineer View (SiteEngineerDashboard.jsx / SiteEngineerProject.jsx)
- Labour tracking, attendance, material requests
- Contractor Payments section
- **DLR Panel**: Toggle DLR panel on each work order card
- **Inventory Management**: Opening/Received/Used/Closing stock with min threshold alerts
- **Multi-Project GPS Attendance**: Login/logout with 5km geofencing
- **Background GPS Tracking**: Auto-sends location every 5 min while logged in

### Planning Board (PlanningBoard.jsx)
- Packages tab with dynamic Material/Brand dropdowns + "Create New"
- Scope items with Qty/Total columns
- **Live Map Dashboard**: Real-time SE locations with Leaflet, out-of-range flagging
- **Custom Header Navigation**: Planning Board tabs rendered inside main AppHeader

### Other Modules
- Vendor management, Purchase orders
- Contractor management
- BOQ (Bill of Quantities)
- Income/Expense tracking
- PDF generation (jsPDF)

## Database Collections (Key)
- `users`, `projects`, `leads`, `lead_stages`
- `project_work_orders` (scope-based work orders with 4-level approval)
- `daily_labour_reports` (DLR per work order per day)
- `site_engineer_attendance` (multi-project GPS attendance)
- `material_inventory` (opening/closing stock with thresholds)
- `freeze_otps` (stores hashed OTPs for freeze verification)

## Key API Endpoints
- Work Orders: GET/POST/PATCH/DELETE `/api/projects/{project_id}/work-orders`
- Payment Pipeline: PATCH `.../stages/{stage_id}/request-payment`, `.../approve`, `.../revert`
- Freeze: POST `.../freeze/send-otp`, `.../freeze/verify-otp`, `.../freeze/reassign`
- DLR: POST/GET `/api/projects/{pid}/work-orders/{woid}/dlr`
- SE Attendance: POST `/api/site-engineer/attendance/login`, `/api/site-engineer/live-location`
- Live Map: GET `/api/site-engineer/live-locations`
- Project Location: POST `/api/projects/{project_id}/location`

## Completed Tasks (Latest Session - Feb 2026)
- [x] AppHeader custom navigation for Planning Board (Dashboard, Packages, Material Vendors, Labour Contractors, RE Templates, Live Map in main header) - Tested iteration_130

## Prioritized Backlog

### P0 (Critical)
- Refactor ProjectDetail.jsx (~5400 lines) into components
- Refactor PlanningBoard.jsx (~1900 lines) into components

### P1 (High Priority)
- Pre-Deployment Security: 2FA, rate limiting to MongoDB, disable demo-login
- Refactor SiteEngineerDashboard.jsx (~1500 lines)

### P2 (Medium Priority)
- Sr. Engineer -> Jr. Engineer Assignment Workflow
- Aadhar Document Upload (encrypted storage)
- Cash Denomination feature (paused)
- SaaS model conversion (paused)
- Comprehensive UI/UX review

## Credentials
- Demo Access buttons on login page for all roles
- Accountant: accountant@constructionos.com / USB@123.26
