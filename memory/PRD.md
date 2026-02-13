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
- [x] Project Detail - Tabbed interface with 4 tabs (Scope, Payments, Additions, Deductions)
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

#### ✅ Enhanced Project Detail View (P0 - February 4, 2026)
- [x] **Redesigned Project Detail Page** with 4-tab layout based on user's sketch
- [x] **Project Header**: Name, Client, Location, Status
- [x] **6 Summary Cards**: Project Value, Additions, Total Value, Payments Received, Deductions, Balance
- [x] **Scope Tab**: Define N number of scope items
  - Scope items sum to Project Value
  - Fields: Item Name, Qty, Unit, Unit Rate, Total, Remarks
  - Add/Delete scope items with auto-calculation
- [x] **Payments Tab**: Milestone-based payment tracking
  - Fields: Stage Name, %, Amount, Received, Balance, Status
  - Inline editing for received amounts
  - Auto-calculate percentage from project value
- [x] **Additions Tab**: Track extra work and variations
  - Fields: Description, Amount, Income, Balance, Status
  - Inline editing for income received
- [x] **Deductions Tab**: Track penalties, discounts, adjustments
  - **Deductions reduce BALANCE only, NOT project value**
  - Fields: Description, Amount, Status, Remarks
- [x] **Backend Models**: ScopeItem, DeductionItem (new)
- [x] **Backend Endpoints**: 
  - GET/POST/PATCH/DELETE for /scope-items
  - GET/POST/PATCH/DELETE for /deductions
  - GET /projects/{id}/full-details (comprehensive data)
- [x] **Balance Calculation**: Total Value - Payments Received - Deductions

#### ✅ Super Admin Dashboard (P0 - February 4, 2026)
- [x] **Redesigned Dashboard** with 3 summary card sections matching user's sketch
- [x] **Project Value Section**: Project Total Value, Addition Cost, Total
- [x] **Income Section**: Project Amount, Additional Amount, Total
- [x] **Balance Section**: Project Balance, Additional Balance, Grand Total
- [x] **Expense Bar**: Total Expense, X Amount, Cash in Book, Y Amount
- [x] **All Projects List**: Table with S.No, Project, Client, Value, Income, Balance, Status, Actions
- [x] **Create Client/Project Button**: Opens dialog with form
  - Project Name, Client Name, Location, Initial Value
  - Start Date, Expected Completion (required)
  - Status dropdown (Planning, Active, On Hold, Completed)
- [x] **View All Projects Button**: Navigates to /projects
- [x] **Non-Super-Admin View**: Basic dashboard with quick links for other roles
- [x] **Backend Endpoint**: GET /api/admin/dashboard-summary
- [x] **Testing**: 13/13 backend tests passed, 100% frontend success

#### ✅ Income Module (P0 - February 4, 2026)
- [x] **Separate Income Module Page** at `/income`
- [x] **6 Summary Cards**: Total Income, Cash, Cheque, Bank Transfer, UPI, Petty Cash
- [x] **Add Income Dialog**: 
  - Project selection
  - Amount, Payment Date
  - Payment Mode (Cash, Cheque, Bank Transfer, UPI, Petty Cash)
  - Cheque Number & Bank Name (for cheque mode)
  - Reference/Transaction ID (for bank/UPI)
  - Remarks
- [x] **Filters**: Project, Payment Mode, Date Range
- [x] **Income Table**: S.No, Project (clickable), Mode, Amount, Date, Reference, Remarks, Delete
- [x] **Flow**:
  - Payment Tab = Request payments (milestones)
  - Income Module = Record actual received payments
  - Income reflects on project payment summary
- [x] **Backend Model**: IncomeEntry with PaymentMode enum
- [x] **Backend Endpoints**: 
  - GET /api/income (with filters)
  - GET /api/income/summary
  - GET /api/projects/{id}/income
  - POST /api/income
  - PATCH /api/income/{id}
  - DELETE /api/income/{id}
- [x] **Project Integration**: Income updates project.income_project field
- [x] **Balance Calculation**: Total Value - Income Received - Deductions

#### ✅ Expense Management Module (P0 - February 6, 2026)
- [x] **Three Expense Types**: Material, Labour, Vendor/Service
- [x] **Role-Based Approval Workflows**:
  - Site Engineer → Planning → Procurement (Material only) → Accounts → Super Admin
  - Each role sees only their assigned workflow stage
- [x] **Material Expense Workflow**:
  - Step 1: Site Engineer creates request (project, material, qty, date)
  - Step 2: Planning approval/rejection
  - Step 3: Procurement adds vendor quotes & pricing
  - Step 4: Accounts final approval
- [x] **Labour Expense Module**:
  - Fields: Labour type, workers, days, rate, auto-total
  - Approval: Planning → Accounts → Super Admin
- [x] **Vendor/Service Expense Module**:
  - Fields: Vendor, service type, amount, invoice
  - Same approval workflow
- [x] **Payment Options After Approval**:
  - Credit (mark as payable, no payment)
  - Advance/Partial (enter amount, auto-calculate balance)
  - Full Settlement (mark completed)
- [x] **Summary Cards**: Material, Labour, Vendor/Service, Total with paid amounts
- [x] **Status Tracking**: Requested → Planning Approved → Procurement Priced → Accounts Approved → Completed
- [x] **Payment Status**: Pending, Partial, Paid, Credit
- [x] **Auto-update project expense totals**
- [x] **Backend Models**: MaterialExpense, LabourExpense, VendorServiceExpense, ExpensePayment
- [x] **Backend Endpoints**: Full CRUD + approval workflows for all 3 types

#### ✅ System Settings Module (P0 - February 6, 2026)
- [x] **Company Profile Settings** at `/settings`
  - Company Name, Email, Phone, Address
  - GST Number for tax compliance
  - Default Currency selection (INR, USD, EUR, GBP, AED)
  - Financial Year Start month
  - Logo URL configuration
- [x] **Settings Summary API**: Returns counts for users, materials, vendors
- [x] **Backend Endpoints**: GET/POST/PATCH /api/settings/company

#### ✅ Material Management Module (P0 - February 6, 2026)
- [x] **Material Master** at `/materials`
  - Full CRUD operations for materials
  - 12 Categories: Cement, Sand, Steel, Bricks, Aggregate, Tiles, Electrical, Plumbing, Paint, Wood, Hardware, Other
  - Unit selection (Nos, Kg, Ton, Bag, Load, CFT, SFT, etc.)
  - HSN Code for GST compliance
  - Soft delete (is_active flag)
  - Search and filter by category
- [x] **Duplicate name validation**
- [x] **Permission Control**: Super Admin, Planning, Procurement only
- [x] **Backend Endpoints**: Full CRUD /api/materials

#### ✅ Vendor Master Module (P0 - February 6, 2026)
- [x] **Vendor Master** at `/vendor-management`
  - Full CRUD operations for vendors
  - Contact details (person, phone, email, address)
  - GST Number for tax compliance
  - Payment Terms (Full, Advance, Credit)
  - Credit Limit and Credit Days for credit vendors
  - Card-based UI with all vendor details
  - Soft delete (is_active flag)
  - Search functionality
- [x] **Permission Control**: Super Admin, Procurement only
- [x] **Backend Endpoints**: Full CRUD /api/vendor-master

#### ✅ Enhanced User Management (P0 - February 6, 2026)
- [x] **User Management** at `/users` (enhanced)
  - Full CRUD operations for users
  - Edit user name, phone, role, department
  - Delete users (with session cleanup)
  - Self-delete prevention
  - Search and filter by role
  - Department field added
  - Stats cards (Total, Admins, Staff, Clients, Vendors)
- [x] **Role descriptions** in create/edit dialog
- [x] **Permission Control**: Super Admin only for role/delete, self can edit name/phone
- [x] **Backend Endpoints**: GET/PATCH/DELETE /api/users/{id}, GET /api/roles

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
- `GET /api/users/{id}` - Get specific user
- `PATCH /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Delete user
- `GET /api/roles` - Get all available roles
- `GET /api/notifications` - Get notifications
- `PATCH /api/notifications/{id}/read` - Mark read

### System Settings (NEW - Feb 6, 2026)
- `GET /api/settings/company` - Get company settings
- `POST /api/settings/company` - Create/update company settings
- `PATCH /api/settings/company` - Partial update company settings
- `GET /api/settings/summary` - Get settings summary (counts)

### Material Management (NEW - Feb 6, 2026)
- `GET /api/materials` - List materials (with category/active filters)
- `GET /api/materials/categories` - Get all material categories
- `GET /api/materials/{id}` - Get specific material
- `POST /api/materials` - Create material
- `PATCH /api/materials/{id}` - Update material
- `DELETE /api/materials/{id}` - Soft delete material

### Vendor Master (NEW - Feb 6, 2026)
- `GET /api/vendor-master` - List vendors from master
- `GET /api/vendor-master/{id}` - Get specific vendor
- `POST /api/vendor-master` - Create vendor in master
- `PATCH /api/vendor-master/{id}` - Update vendor
- `DELETE /api/vendor-master/{id}` - Soft delete vendor

### Admin
- `GET /api/admin/pending-approvals` - Pending items
- `GET /api/admin/notifications` - All notifications

### Comprehensive Project View (NEW)
- `GET /api/projects/{id}/comprehensive` - Get comprehensive project data
- `GET /api/projects/{id}/payment-stages` - Get payment stages
- `POST /api/payment-stages` - Create payment stage
- `PATCH /api/payment-stages/{stage_id}` - Update payment stage
- `DELETE /api/payment-stages/{stage_id}` - Delete payment stage
- `GET /api/projects/{id}/additional-costs` - Get additional costs
- `POST /api/additional-costs` - Create additional cost
- `PATCH /api/additional-costs/{cost_id}` - Update additional cost
- `DELETE /api/additional-costs/{cost_id}` - Delete additional cost

### Enhanced Project Detail (NEW - Feb 4, 2026)
- `GET /api/projects/{id}/full-details` - Get full project data with all tabs
- `GET /api/projects/{id}/scope-items` - Get scope items
- `POST /api/scope-items` - Create scope item
- `PATCH /api/scope-items/{scope_id}` - Update scope item
- `DELETE /api/scope-items/{scope_id}` - Delete scope item
- `GET /api/projects/{id}/deductions` - Get deductions
- `POST /api/deductions` - Create deduction
- `PATCH /api/deductions/{deduction_id}` - Update deduction
- `DELETE /api/deductions/{deduction_id}` - Delete deduction

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
│   │   │   ├── FinancialOverview.jsx  # NEW
│   │   │   ├── ComprehensiveProjectView.jsx  # NEW (Jan 18, 2026)
│   │   │   ├── Settings.jsx  # NEW (Feb 6, 2026)
│   │   │   ├── MaterialManagement.jsx  # NEW (Feb 6, 2026)
│   │   │   ├── VendorMasterManagement.jsx  # NEW (Feb 6, 2026)
│   │   │   └── Login.jsx
│   │   ├── components/
│   │   └── App.js
│   ├── package.json
│   └── .env
└── memory/
    └── PRD.md
```

---

## What's Next (P1/P2 - Upcoming)

### P1 - Upcoming Tasks
- [ ] Labour and Vendor/Service Expense Workflows (following Material Expense pattern)
- [ ] Integrate Material Master with Expense Module (dropdown from master list)
- [ ] Add Resend API key for real OTP email delivery

### P2/P3 - Future Enhancements
- [x] **COMPLETED: Mobile-Responsive UI (Feb 13, 2026)** - All pages now mobile-optimized
- [ ] Photo upload for material receipts
- [ ] Email notifications via Resend (requires API key)
- [ ] Enhanced Client Portal with file uploads
- [ ] Advanced audit log viewing
- [ ] Export to Excel/PDF
- [ ] Dashboard charts and graphs
- [ ] Project Timeline/Gantt view
- [ ] Backend refactoring (split server.py into modular API Routers)

---

## Completed Features (February 2026)

### ✅ System Settings Module (Feb 6, 2026)
- Company Profile Settings at `/settings`
- Material Management at `/materials` (12 categories, CRUD operations)
- Vendor Master at `/vendor-management` (CRUD with credit terms)
- Enhanced User Management at `/users` (CRUD, search/filter)

### ✅ Bulk Add with Verification/Approval Workflow (Feb 6, 2026)
- Bulk add 10-15 items at once in Scope, Payments, Additions, Deductions tabs
- Verification flow requiring typing "VERIFY" in caps
- Approval workflow: Draft → Pending Verification → Pending Approval → Approved
- Super Admin approval/rejection capability

### ✅ Site Engineer Board Module (Feb 13, 2026)
- **Site Engineer Dashboard** (`/site-engineer`)
  - My Projects view (max 3 assigned projects)
  - Active orders count per project
  - No access to financial totals
  
- **Material Request Flow**
  - Request popup with material dropdown from Master
  - Auto Order ID generation
  - Status: Requested → Planning → Procurement → Accountant → Ready for Delivery
  
- **Labour Request Flow**
  - Request popup with labour type, workers, days, rate
  - Auto-calculated total
  - Status: Requested → Planning → Accountant → Approved
  
- **Material Receiving Flow**
  - GPS location capture (browser geolocation)
  - Partial/full quantity tracking
  - OTP verification via email (Resend integration - REQUIRES API KEY)
  - Test OTP shown when email not configured
  
- **Project Assignment**
  - Super Admin can assign via User Management
  - Project Manager can assign via Project page
  - Max 3 projects per Site Engineer enforced

---

### ✅ Mobile-Responsive UI (Feb 13, 2026)
- **Full mobile responsiveness across all pages**:
  - Dashboard (Super Admin): Horizontal scrollable nav tabs, stacked cards, mobile card view for projects
  - Projects List: Card-based mobile view with quick stats
  - Project Detail: Compact header, 2-column summary cards, scrollable tabs
  - Settings: Responsive grid, compact cards
  - User Management: Mobile card view with actions
  - Material Management: Mobile card view with actions
  - Expense Management: Compact summary cards, mobile-friendly tabs
  - Site Engineer pages: Already mobile-optimized

### ✅ Procurement Board Module (Feb 13, 2026)
- **Procurement Dashboard** (`/procurement-board`)
  - Role-based access: Procurement and Super Admin only
  - 5 metric cards: Pending, Pricing, Waiting, Approved, Delivered
  - Financial summary: Value in Pricing, Credit Outstanding, Top Vendors
  - Tab navigation for all statuses

- **Procurement Workflow**
  1. Site Engineer creates Material Request
  2. Planning approves → Request appears in Procurement Board (Pending tab)
  3. Procurement clicks "Add Pricing" → Creates pricing record
  4. Procurement adds vendor quotes (multiple vendors for comparison)
  5. Procurement selects best vendor
  6. Procurement submits for Accounts approval
  7. Accounts approves/rejects
  8. Order moves to Approved/Delivered tabs

- **Key Features**
  - Unlimited vendor quotes per material request
  - Vendor pricing comparison with total calculation
  - Quick add vendor from pricing dialog
  - Price history for reference
  - Payment status tracking (Pending, Paid, Credit, Partial)
  - Delivery status tracking (Pending, Partial, Completed)
  - Full audit trail via ProcurementLog

- **Backend API Endpoints**
  - GET `/api/procurement/dashboard` - Dashboard metrics
  - GET `/api/procurement/requests?status=<status>` - Requests by status
  - POST `/api/procurement/start-pricing/{request_id}` - Start pricing process
  - GET `/api/procurement/pricing/{pricing_id}` - Get pricing details
  - POST `/api/procurement/pricing/{pricing_id}/add-quote` - Add vendor quote
  - PATCH `/api/procurement/pricing/{pricing_id}/select-vendor` - Select vendor
  - POST `/api/procurement/pricing/{pricing_id}/submit` - Submit for approval
  - PATCH `/api/procurement/pricing/{pricing_id}/accounts-action` - Approve/reject
  - PATCH `/api/procurement/pricing/{pricing_id}/payment-status` - Update payment
  - PATCH `/api/procurement/pricing/{pricing_id}/delivery-status` - Update delivery
  - POST `/api/procurement/add-vendor` - Quick add vendor

- **Backend Models**
  - ProcurementPricing: Main pricing record with vendor quotes
  - VendorQuote: Individual vendor quote with pricing details
  - VendorPriceHistory: Historical vendor prices per material
  - ProcurementLog: Audit trail for all actions

- **Testing**: 16/16 backend tests passed, 100% frontend success

---

## What's Next (P1/P2 - Upcoming)

### P1 - Upcoming Tasks
- [ ] Unified Approval Dashboard (central view for all pending approvals)
- [ ] Labour and Vendor/Service Expense Workflows implementation
- [ ] Bulk Add with Approval Workflow completion

### P2/P3 - Future Tasks
- [ ] Backend refactoring (split server.py into modular API Routers)
- [ ] Enable Email Notifications (Resend integration - requires API key)
- [ ] Enhanced Client Portal with file uploads
- [ ] Gantt Chart for Project Timelines
- [ ] Accounts Board Module
- [ ] Export to Excel/PDF
- [ ] Dashboard charts and graphs

---

*Last Updated: February 13, 2026*
