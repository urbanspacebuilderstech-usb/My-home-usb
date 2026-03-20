# My Home USB - Construction Management System PRD

## Original Problem Statement
Build a comprehensive labour and materials management system for a Construction OS platform. The system manages projects, site engineers, material procurement, work orders, and daily progress tracking.

## Core Requirements
- Multi-role authentication (Super Admin, Site Engineer, Procurement, Planning, Accountant, etc.)
- Project management with assignments
- Material procurement workflow (request → approval → order → transit → receive)
- Work order management with contractor-centric flow
- Stock management and daily stock counts
- Daily progress reporting
- Google Sheets integration for data sync
- Email notifications via Resend

## Completed Features (by date)

### Pre-existing (before March 2026)
- Full authentication system with demo access
- Project CRUD with multi-role access
- Site Engineer assignment and project views
- Material request workflow (SE → Planning → Procurement → Transit)
- Procurement Board with 7 tabs (Pending, Pricing, Payment, Transit, Credit, Vendors, POs)
- Contractor management and work order creation
- Google Sheets auto-sync
- Email notifications via Resend
- Object Storage for file uploads
- Leaflet/OpenStreetMap integration for geo-location

### March 2026 Session 1
- **Procurement Board Data Seeding**: Script to populate all 7 procurement tabs with dummy data
- **Site Engineer Order Detail Popup**: Clickable order cards showing full details + edit capability
- **Work Orders Tab Rework**: Contractor-centric flow with stage timeline, multi-skill attendance, payment requests

### March 2026 Session 2 (Current)
- **Phase 1: Enhanced Material Request Flow**
  - Approved materials with brands seeded for projects (33 branded materials)
  - SE-accessible endpoint: `GET /api/projects/{project_id}/approved-materials`
  - Material request form redesigned with "Approved Materials" / "Custom / Other" toggle
  - Searchable approved materials list with brand badges
  - Brand field included in material requests and order cards
  - Custom material entry with optional brand
  
- **Phase 2: Material Receiving & Stock Management**
  - Enhanced receive dialog with date, time, lorry image upload, material image upload
  - GPS location capture with coordinates display
  - Receipt creation stores: receive_date, receive_time, lorry_image_id, material_image_id, brand, material_name
  - `GET /api/projects/{project_id}/received-stock` - aggregated received materials endpoint
  - "Receive Now" button enabled for `in_transit` status orders
  - Stock Register tab shows "Materials Received from Deliveries" table
  
- **Phase 3: Daily Progress Reports**
  - New "Daily Progress" tab (4th tab in SE project view)
  - "Today's Update" button opens report form
  - Form includes: Project Name, Date, Day (auto-filled), Work Summary, Current Project Stage selector
  - `POST /api/projects/{project_id}/daily-progress` - create progress entry
  - `GET /api/projects/{project_id}/daily-progress` - list entries (sorted by date desc)
  - Progress entries displayed as cards with date, day, stage badge, summary
  - PM/GM notified on new progress entry

## Architecture
```
/app/
├── backend/
│   ├── server.py          # FastAPI app, CORS, startup
│   ├── core/
│   │   ├── models.py      # Pydantic models, enums
│   │   ├── storage.py     # Emergent Object Storage
│   │   └── notifications.py
│   ├── routes/
│   │   ├── auth.py        # Authentication, demo login
│   │   ├── projects.py    # Project CRUD, materials summary
│   │   ├── site_ops.py    # SE material requests, receipts, approved materials, daily progress
│   │   ├── procurement.py # Procurement board, approvals
│   │   ├── contractors.py # Work orders, stages, attendance
│   │   ├── operations.py  # Planning operations, materials CRUD
│   │   └── files.py       # File upload/download
│   └── seed_*.py          # Data seeding scripts
└── frontend/
    └── src/
        ├── pages/
        │   ├── SiteEngineerProject.jsx  # SE project view (Materials, Work Orders, Stock, Progress)
        │   ├── ProjectDetail.jsx        # Admin project view (4000+ lines, needs refactoring)
        │   └── ...
        └── components/
            ├── OrderDetailDialog.jsx    # Material order detail popup
            ├── WorkOrderTab.jsx         # Contractor work order flow
            └── ui/                      # Shadcn components
```

## Key API Endpoints
- `GET /api/projects/{project_id}/approved-materials` - Branded materials list
- `POST /api/site-engineer/material-requests` - Create request (with brand, is_approved_material)
- `PATCH /api/site-engineer/material-requests/{request_id}` - Edit request
- `POST /api/site-engineer/material-receipts/initiate` - Initiate receipt (with images, date/time)
- `GET /api/projects/{project_id}/received-stock` - Aggregated received materials
- `POST /api/projects/{project_id}/daily-progress` - Log daily progress
- `GET /api/projects/{project_id}/daily-progress` - Get progress entries

## Prioritized Backlog

### P0 (None currently)

### P1
- Two-Factor Authentication (2FA) with mobile OTP
- Advanced Cybersecurity Practices
- Aadhar Document Upload with encrypted storage
- Refactor ProjectDetail.jsx (4000+ lines → smaller components)

### P2
- Cash Denomination feature (paused by user)
- Comprehensive UI/UX review
- Convert to SaaS model
- Production deployment guidance

## Tech Stack
- Frontend: React, Shadcn/UI, Tailwind CSS, Lucide React
- Backend: FastAPI, Motor (async MongoDB driver)
- Database: MongoDB Atlas
- File Storage: Emergent Object Storage
- Maps: Leaflet/OpenStreetMap
- Email: Resend
- Data Sync: Google Sheets API
- PDF: jsPDF / jspdf-autotable

## Test Credentials
- Demo Access buttons on login page for all roles
- Site Engineer: engineer@constructionos.com (demo-login)
- Test Project: proj_12f23331b542 (Mr. Vinoth Kumar Babu)
