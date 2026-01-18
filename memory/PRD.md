# Construction Accounting CRM & Project Operations OS

## Product Requirements Document

### Overview
A comprehensive Construction Accounting CRM & Project Operations OS that replaces Excel, WhatsApp, and manual approvals with a single, project-centric, role-based system.

### Original Problem Statement
Build a Construction Accounting CRM with:
- Project Management with BOQ (Bill of Quantities)
- Work Order Management with Approval Workflows
- Procurement & Vendor Management
- Site Receipt with GPS verification
- Expense & Accounting tracking
- Multi-role dashboards
- Client Portal for project visibility
- Notifications & Audit Logs

### User Roles
1. **Super Admin** - Full system access
2. **Accountant** - Approve/reject work orders, manage expenses
3. **Project Manager** - Create projects, submit work orders
4. **Planning Department** - Create and manage BOQ
5. **Procurement Department** - Create POs, manage vendors
6. **Site Engineer** - Submit site receipts with GPS + photos
7. **Vendor** - View assigned orders via Vendor Portal
8. **Client** - Read-only project portal

### Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React with TailwindCSS + Shadcn UI
- **Database**: MongoDB
- **Authentication**: Custom JWT-based demo login system

---

## Implementation Status

### ✅ COMPLETED (December 2025 - January 2026)

#### Core Infrastructure
- [x] FastAPI backend with all API endpoints
- [x] React frontend with routing
- [x] MongoDB database integration
- [x] JWT-based authentication system
- [x] Demo login system (no password required)

#### Project Management
- [x] Projects CRUD operations (Create, Read, Update, Delete)
- [x] Project detail page with tabs
- [x] Project stats (Agreement Value, Received, Spent, Balance)

#### BOQ (Bill of Quantities)
- [x] BOQ management page
- [x] Create/Edit/Delete BOQ items
- [x] Lock/Unlock BOQ items
- [x] Category support (Material, Labour)
- [x] Total budget calculation

#### Work Orders
- [x] Create work orders against BOQ items
- [x] Work order submission workflow
- [x] Status tracking (draft, submitted, approved, rejected, closed)
- [x] Stats cards (Total, Pending, Approved, Rejected)

#### Work Order Assignments (P0 - January 12, 2026)
- [x] Backend endpoints for assignments
- [x] Create assignments with priority and due dates
- [x] Assign work orders to Site Engineers/Procurement
- [x] UI in Project Detail page (Assignments tab)
- [x] Notifications sent to assigned users

#### Project Commitments (P1 - January 12, 2026)
- [x] Backend endpoints for commitments
- [x] Track committed resources/materials per project
- [x] Calculate total committed value
- [x] UI in Project Detail page (Commitments tab)
- [x] Delete functionality for commitments

#### Approval Workflow
- [x] Approval Queue page for Accountants
- [x] Approve/Reject work orders
- [x] Rejection with reason
- [x] Notifications on approval/rejection

#### Procurement (P2 - January 12, 2026)
- [x] Vendor management (Create, Read, Update, Delete)
- [x] Purchase Order creation
- [x] Link POs to work orders
- [x] Vendor table with contact details
- [x] **NEW**: Edit/Delete vendors
- [x] **NEW**: Link vendor to user account for portal access

#### ✅ Vendor Portal (P2 - January 12, 2026)
- [x] Dedicated vendor portal page (`/vendor-portal`)
- [x] Vendor dashboard with order stats
- [x] View assigned purchase orders
- [x] Dispatch orders with vehicle number
- [x] Notifications to procurement on dispatch

#### Site Receipt
- [x] Site receipt submission page
- [x] GPS location capture
- [x] Image upload support
- [x] Link to POs and work orders

#### Expenses & Accounting (P2 - January 12, 2026)
- [x] Expense tracking page
- [x] Filter by project
- [x] Category breakdown (Material, Labour, etc.)
- [x] **NEW**: Edit/Delete expenses
- [x] **NEW**: Edit/Delete payments

#### User Management
- [x] User listing with roles
- [x] Create new users
- [x] Delete users
- [x] Role-based access control
- [x] User stats by role type

#### Notifications
- [x] In-app notifications
- [x] Mark as read functionality
- [x] Super Admin pending approvals view
- [x] Notification creation on key events

#### Dashboard Enhancements (January 12, 2026)
- [x] **Pending Approvals Alert**: Yellow banner showing pending work orders
- [x] **New Tabs**: Overview, Pending Approvals (with badge), Notifications
- [x] **Pending Approvals Card**: Shows count of items waiting for approval
- [x] **Inline Approve/Reject**: Quick action buttons on pending items
- [x] **Notifications Tab**: Shows recent notifications from all users
- [x] **Bell Icon in Nav**: With unread notification count badge

#### UI Consistency Update (P1 - January 12, 2026)
- [x] Dashboard - Modern card-based layout
- [x] Projects page - Table with stats
- [x] Project Detail - Tabbed interface with 5 tabs
- [x] Work Orders - Stats cards + table
- [x] Approval Queue - Modern approval interface
- [x] Procurement - Vendors + POs tabs with edit/delete
- [x] BOQ Management - Budget breakdown with edit/delete/lock
- [x] Expenses - Filterable table with edit/delete
- [x] Site Receipt - GPS status + pending POs
- [x] User Management - Role-based grouping
- [x] Notifications - Unread badges + actions
- [x] Client Portal - Read-only project view
- [x] Vendor Portal - Order management + dispatch

#### ✅ Comprehensive Project View (P0 - January 18, 2026)
- [x] New route `/projects/{id}/comprehensive` with dedicated page
- [x] Project header with 6 summary cards (Project Value, Total Received, Expenses, Cash in Book, Additional Cost, Balance Due)
- [x] **Overview Tab**: Project Value Summary, Income Summary, Expense Summary, Quick Stats
- [x] **BOQ/Project Value Tab**: Full BOQ breakdown with quantities, rates, and totals
- [x] **Payment Schedule Tab**: Milestone-based payment tracking
  - Create payment stages with percentage and amount
  - Track amount received per stage
  - Status tracking (pending, partial, completed)
  - Inline editing for received amounts
  - Delete payment stages
- [x] **Additional Costs Tab**: Track extra work and variations
  - Create additional cost items with estimated amount
  - Track actual amount and income received
  - Calculate balance due
  - Inline editing for actual/income values
  - Delete cost items
- [x] Backend models: PaymentStage, AdditionalCostItem
- [x] Backend endpoints: GET/POST/PATCH/DELETE for payment-stages and additional-costs
- [x] "Comprehensive View" button added to ProjectDetail page

---

## API Endpoints

### Authentication
- `POST /api/auth/demo-login` - Demo login
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project
- `PATCH /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### BOQ
- `GET /api/boq/{project_id}` - Get BOQ items
- `POST /api/boq` - Create BOQ item
- `PATCH /api/boq/{boq_id}` - Update BOQ item
- `DELETE /api/boq/{boq_id}` - Delete BOQ item

### Work Orders
- `GET /api/work-orders` - List work orders
- `POST /api/work-orders` - Create work order
- `PATCH /api/work-orders/{id}/submit` - Submit
- `PATCH /api/work-orders/{id}/approve` - Approve
- `PATCH /api/work-orders/{id}/reject` - Reject

### Work Order Assignments
- `GET /api/work-order-assignments/{project_id}` - Get assignments
- `GET /api/work-order-assignments` - Get all assignments
- `POST /api/work-order-assignments` - Create assignment
- `PATCH /api/work-order-assignments/{id}/status` - Update status

### Project Commitments
- `GET /api/project-commitments/{project_id}` - Get commitments
- `POST /api/project-commitments` - Create commitment
- `DELETE /api/project-commitments/{id}` - Delete commitment

### Procurement
- `GET /api/vendors` - List vendors
- `POST /api/vendors` - Create vendor
- `PATCH /api/vendors/{vendor_id}` - Update vendor
- `DELETE /api/vendors/{vendor_id}` - Delete vendor
- `PATCH /api/vendors/{vendor_id}/link-user` - Link vendor to user
- `GET /api/purchase-orders` - List POs
- `POST /api/purchase-orders` - Create PO
- `PATCH /api/purchase-orders/{po_id}` - Update PO

### Vendor Portal
- `GET /api/vendor-portal/dashboard` - Get vendor dashboard
- `PATCH /api/vendor-portal/purchase-orders/{po_id}/dispatch` - Dispatch order

### Site Receipts
- `POST /api/site-receipts/upload-image` - Upload image
- `POST /api/site-receipts` - Create receipt

### Expenses & Payments
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense
- `PATCH /api/expenses/{expense_id}` - Update expense
- `DELETE /api/expenses/{expense_id}` - Delete expense
- `GET /api/payments` - List payments
- `POST /api/payments` - Create payment
- `PATCH /api/payments/{payment_id}` - Update payment
- `DELETE /api/payments/{payment_id}` - Delete payment

### Users & Notifications
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `DELETE /api/users/{user_id}` - Delete user
- `GET /api/notifications` - Get notifications
- `PATCH /api/notifications/{id}/read` - Mark read

### Admin
- `GET /api/admin/pending-approvals` - Pending items
- `GET /api/admin/notifications` - All notifications

---

## Demo Credentials

| Role | Email | Access |
|------|-------|--------|
| Super Admin | admin@constructionos.com | Full access |
| Accountant | accountant@constructionos.com | Approvals, expenses |
| Project Manager | pm@constructionos.com | Projects, work orders |
| Planning | planning@constructionos.com | BOQ management |
| Procurement | procurement@constructionos.com | Vendors, POs |
| Site Engineer | engineer@constructionos.com | Site receipts |
| Vendor | vendor@balaji.com | Vendor portal (after linking) |
| Client | raj@client.com | Read-only portal |

---

## File Structure

```
/app/
├── backend/
│   ├── server.py          # Main API server
│   ├── seed_database.py   # Demo data seeder
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Projects.jsx
│   │   │   ├── ProjectDetail.jsx
│   │   │   ├── BOQManagement.jsx
│   │   │   ├── WorkOrders.jsx
│   │   │   ├── ApprovalQueue.jsx
│   │   │   ├── Procurement.jsx
│   │   │   ├── SiteReceipt.jsx
│   │   │   ├── Expenses.jsx
│   │   │   ├── UserManagement.jsx
│   │   │   ├── Notifications.jsx
│   │   │   ├── ClientPortal.jsx
│   │   │   ├── VendorPortal.jsx  # NEW
│   │   │   └── Login.jsx
│   │   ├── components/
│   │   └── App.js
│   ├── package.json
│   └── .env
└── memory/
    └── PRD.md
```

---

## What's Next (P3 - Backlog)

### Future Enhancements
- [ ] Email notifications via Resend (requires API key)
- [ ] Enhanced Client Portal with file uploads
- [ ] Mobile-optimized UI for Site Engineers
- [ ] Advanced audit log viewing
- [ ] Export to Excel/PDF
- [ ] Dashboard charts and graphs
- [ ] Project Timeline/Gantt view

---

*Last Updated: January 12, 2026*
