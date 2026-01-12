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
7. **Vendor** - View assigned orders (portal)
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
- [x] Projects CRUD operations
- [x] Project detail page with tabs
- [x] Project stats (Agreement Value, Received, Spent, Balance)

#### BOQ (Bill of Quantities)
- [x] BOQ management page
- [x] Create/view BOQ items
- [x] Category support (Material, Labour)
- [x] Total budget calculation

#### Work Orders
- [x] Create work orders against BOQ items
- [x] Work order submission workflow
- [x] Status tracking (draft, submitted, approved, rejected, closed)
- [x] Stats cards (Total, Pending, Approved, Rejected)

#### ✅ NEW: Work Order Assignments (P0 - January 12, 2026)
- [x] Backend endpoints for assignments
- [x] Create assignments with priority and due dates
- [x] Assign work orders to Site Engineers/Procurement
- [x] UI in Project Detail page (Assignments tab)
- [x] Notifications sent to assigned users

#### ✅ NEW: Project Commitments (P1 - January 12, 2026)
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

#### Procurement
- [x] Vendor management (CRUD)
- [x] Purchase Order creation
- [x] Link POs to work orders
- [x] Vendor table with contact details

#### Site Receipt
- [x] Site receipt submission page
- [x] GPS location capture
- [x] Image upload support
- [x] Link to POs and work orders

#### Expenses & Accounting
- [x] Expense tracking page
- [x] Filter by project
- [x] Category breakdown (Material, Labour, etc.)
- [x] Auto-expense creation from site receipts

#### User Management
- [x] User listing with roles
- [x] Create new users
- [x] Role-based access control
- [x] User stats by role type

#### Notifications
- [x] In-app notifications
- [x] Mark as read functionality
- [x] Super Admin pending approvals view
- [x] Notification creation on key events

#### ✅ UI Consistency Update (P1 - January 12, 2026)
- [x] Dashboard - Modern card-based layout
- [x] Projects page - Table with stats
- [x] Project Detail - Tabbed interface with 5 tabs
- [x] Work Orders - Stats cards + table
- [x] Approval Queue - Modern approval interface
- [x] Procurement - Vendors + POs tabs
- [x] BOQ Management - Budget breakdown
- [x] Expenses - Filterable table
- [x] Site Receipt - GPS status + pending POs
- [x] User Management - Role-based grouping
- [x] Notifications - Unread badges + actions
- [x] Client Portal - Read-only project view

#### Client Portal
- [x] Project overview for clients
- [x] Payment history view
- [x] Photo gallery support
- [x] Document downloads

### 🔄 IN PROGRESS

#### P2 Features (Next)
- [ ] Full CRUD for all modules (edit/delete)
- [ ] Vendor Portal (vendor-specific login and order management)
- [ ] Enhanced reporting and analytics

### 📋 BACKLOG (Future)

#### P3 Features
- [ ] Email notifications via Resend (requires API key)
- [ ] Enhanced Client Portal with file uploads
- [ ] Mobile-optimized UI for Site Engineers
- [ ] Advanced audit log viewing
- [ ] Export to Excel/PDF
- [ ] Dashboard charts and graphs

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

### BOQ
- `GET /api/boq/{project_id}` - Get BOQ items
- `POST /api/boq` - Create BOQ item

### Work Orders
- `GET /api/work-orders` - List work orders
- `POST /api/work-orders` - Create work order
- `PATCH /api/work-orders/{id}/submit` - Submit
- `PATCH /api/work-orders/{id}/approve` - Approve
- `PATCH /api/work-orders/{id}/reject` - Reject

### Work Order Assignments (NEW)
- `GET /api/work-order-assignments/{project_id}` - Get assignments
- `GET /api/work-order-assignments` - Get all assignments
- `POST /api/work-order-assignments` - Create assignment
- `PATCH /api/work-order-assignments/{id}/status` - Update status

### Project Commitments (NEW)
- `GET /api/project-commitments/{project_id}` - Get commitments
- `POST /api/project-commitments` - Create commitment
- `DELETE /api/project-commitments/{id}` - Delete commitment

### Procurement
- `GET /api/vendors` - List vendors
- `POST /api/vendors` - Create vendor
- `GET /api/purchase-orders` - List POs
- `POST /api/purchase-orders` - Create PO

### Site Receipts
- `POST /api/site-receipts/upload-image` - Upload image
- `POST /api/site-receipts` - Create receipt

### Expenses & Payments
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense
- `GET /api/payments` - List payments
- `POST /api/payments` - Create payment

### Users & Notifications
- `GET /api/users` - List users
- `POST /api/users` - Create user
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
│   │   ├── pages/         # All page components
│   │   ├── components/    # UI components
│   │   └── App.js         # Router
│   ├── package.json
│   └── .env
└── memory/
    └── PRD.md             # This file
```

---

*Last Updated: January 12, 2026*
