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
- **Google Login** with invited users only
- **User Invitation System** - Super Admin can add users by email

### User Roles
1. **Super Admin** - Full system access, invite users
2. **General Manager** - Overall management, RE project approvals
3. **CRE** (Customer Relationship Executive) - Client relations, deal conversion, advance payment collection
4. **Accountant** - Approve/reject work orders, manage expenses, verify payments
5. **Project Manager** - Create projects, submit work orders
6. **Planning Department** - Create and manage BOQ, Rough Estimates
7. **Procurement Department** - Create POs, manage vendors
8. **Site Engineer** - Submit site receipts with GPS + photos
9. **Pre-Sales** - Lead generation and qualification
10. **Sales** - Deal negotiation and closure
11. **Vendor** - View assigned orders via Vendor Portal
12. **Client** - Read-only project portal

### Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: React with TailwindCSS + Shadcn UI
- **Database**: MongoDB
- **Authentication**: Custom JWT-based demo login system

---

## Implementation Status

### ✅ COMPLETED (December 2025 - February 2026)

#### Project Details UI Update (February 22, 2026) - NEW
- [x] **Rough Estimate Tab Added**:
  - New "Rough Estimate" tab as first tab in Project Detail view
  - Tab order: Rough Estimate | Scope | Payment Schedule | Additional | Deduction | Payment Summary
  - Shows original RE project data: name, location, area, building type
  - Displays estimated total, handover timeline, status
  - Shows RE scope items table (if available)
  - Shows RE payment schedule (if available)
  - Falls back to "No Rough Estimate Available" for projects without RE

#### CRE Workflow (February 22, 2026)
- [x] **CRE Role Implementation**:
  - Renamed CRO to CRE (Customer Relationship Executive)
  - New CRE Board at `/cre-board`
  - CRE user: cre@constructionos.com (Anita Desai)
  
- [x] **New Deals from Sales**:
  - Sales closes deals → Leads move to CRE's "New Deals" queue
  - CRE can view closed deals waiting for conversion
  - Shows client info, contact details, RE project details if available
  
- [x] **Convert Deal to Project** (Updated Flow):
  - "Convert to Project" button for each new deal
  - Collect advance payment (amount, mode, reference)
  - Accountant confirmation checkbox
  - Creates project with status "pending_payment" (awaiting accountant)
  - Accountant verifies → status becomes "payment_received"
  - CRE sends to Planning → status becomes "in_planning"
  - Income recorded automatically in income_entries collection
  
- [x] **CRE Dashboard**:
  - Status cards: Draft, Pending Payment, Payment Verified, In Planning, Approved
  - Workflow banner: Draft → Submit for Payment → Accountant Verifies → Payment Received → Send to Planning
  - Payment Collection Requests section
  - Total Ongoing Projects and Total Value metrics
  - Project Stages visualization
  
- [x] **API Endpoints**:
  - `GET /api/cre/new-deals` - Get closed deals from Sales
  - `POST /api/cre/convert-deal/{lead_id}` - Convert deal to project
  - `PATCH /api/cre/projects/{id}/accountant-verify` - Accountant verifies advance
  - `PATCH /api/cre/projects/{id}/send-to-planning` - CRE sends to Planning
  - `GET /api/cre/dashboard` - Get CRE dashboard metrics
  - `GET /api/cre/payment-requests` - Get payment collection requests
  - `GET /api/cre/projects/all` - Get all CRE projects

#### Authentication & User Management (February 21, 2026)
- [x] **Google Login Integration**:
  - Emergent-managed Google OAuth
  - Only invited users can login via Google
  - Non-invited users get 403 error with clear message
  
- [x] **User Invitation System**:
  - Super Admin can invite users by email
  - Assign role during invitation
  - User created with `status: "invited"`
  - Invited user can login with Google using that email
  - Email invitation (requires Resend API key - currently MOCKED)
  
- [x] **Demo Login Preserved**:
  - Quick access buttons for testing
  - Demo Mode section on login page
  - Multiple demo users available

- [x] **API Endpoints**:
  - `POST /api/auth/invite-user` - Invite user (Super Admin only)
  - `GET /api/auth/invitations` - List all invitations
  - `DELETE /api/auth/invitations/{id}` - Cancel invitation
  - `POST /api/auth/resend-invitation/{email}` - Resend invitation email
  - `POST /api/auth/session` - Exchange Google OAuth session (rejects non-invited)

- [x] **Frontend Updates**:
  - Login page with Google Login button
  - "Only invited users can login" message
  - User Management uses invite system

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

#### ✅ Planning Department Scope & Project Management (P0 - February 20, 2026)
- [x] **Edit Scope Items** (inline editing in ProjectDetail.jsx)
  - Click edit button to transform row into input fields
  - Edit item_name, quantity, unit, unit_rate, remarks
  - Save/Cancel buttons for each row
  - Auto-calculates total amount on save
  - Planning, Project Manager, Super Admin can edit
- [x] **Delete Scope Items**
  - Planning role now has permission to delete scope items
  - Confirmation dialog before deletion
- [x] **Delete Project**
  - Super Admin can delete ANY project
  - Planning can only delete projects in draft/planning status
  - DELETE confirmation dialog requiring typing "DELETE"
  - Deletes all related data (scope items, payment stages, additions, deductions)
  - Audit log entry created on deletion
- [x] **Backend Endpoints**:
  - `PATCH /api/scope-items/{scope_id}` - Planning, PM, Super Admin
  - `DELETE /api/scope-items/{scope_id}` - Planning, PM, Super Admin
  - `DELETE /api/projects/{project_id}` - Super Admin (any), Planning (draft/planning only)
- [x] **Frontend Features**:
  - Inline edit mode with input fields
  - Delete Project button (red) in project header
  - Role-based visibility of Delete Project button
  - Confirmation dialog with typed confirmation

#### ✅ Construction Stages System for Planning Board (P0 - February 20, 2026)
- [x] **8 Construction Stages**:
  1. Drawing Stage (purple)
  2. Yet to Start (gray)
  3. Foundation (amber)
  4. Basement (stone)
  5. SS - Brick Work (orange)
  6. SS - Plastering (cyan)
  7. Finishing (blue)
  8. Handover (green)
- [x] **Planning Board Enhancement** (Tab view like CRO Board):
  - Construction Stages Overview with visual cards and counts
  - Each stage has unique icon and color
  - Clickable stage cards to filter projects
  - "By Stage" tab with horizontal stage filter buttons
  - Other tabs: New Projects, Awaiting Approval, Working, Completed
- [x] **Stage Management**:
  - Update Project Stage dialog with dropdown selector
  - Shows current stage and allows moving to new stage
  - Stage history tracking with timestamps and user info
  - Real-time count updates when stages change
- [x] **Backend Endpoints**:
  - `GET /api/planning/stage-dashboard` - Dashboard with stage counts
  - `GET /api/planning/projects-by-stage` - Filter projects by stage
  - `PATCH /api/planning/projects/{id}/update-stage` - Update project stage
  - `GET /api/planning/projects/{id}/stage-history` - Stage change history
- [x] **Project Model Fields**:
  - `current_stage`: Current construction stage
  - `stage_history`: Array of stage changes with timestamps

#### ✅ Payment Schedule System (P0 - February 20, 2026)
- [x] **13-Stage Payment Schedule** (from user's design):
  1. Advance payment for project confirmation (2%) - 1st shot
  2. Foundation, Plinth Beam and upto Basement (20%)
  2a. Underground water storage sump
  2b. Underground Septic tank
  2c. Additional cost for car parking basement
  3. Super Structure - Ground Floor (18%) - 3rd shot
  4. Super Structure - First Floor (18%) - 4th shot
  5. Super Structure - Second Floor (12%) - 5th shot
  6. Plastering (9%) - 6th shot
  7. Flooring Work (8%) - 7th shot
  8. Electrical, Plumbing, Doors, Windows (7%) - 8th shot
  9. Painting & Electrical commissioning (5%) - 9th shot
  10. Handover (75% Pre + 25% Post) (1%) - 10th shot
- [x] **Payment Schedule Creation by Planning**:
  - Generate Payment Schedule from template
  - Auto-calculates amounts based on project value
  - Planning creates schedule after GM approves project
- [x] **CRO Payment Collection**:
  - Collect Payment button for each pending stage
  - Dialog with: Amount, Payment Mode (Bank/UPI/Cheque/Cash), Reference ID, Remarks
  - Updates status: pending → partial → paid
  - Creates income record automatically
- [x] **Payment Summary Tab in Project Detail**:
  - Summary Cards: Total Scheduled, Total Received, Balance Due, Collection %
  - Progress bar with stages paid count
  - Complete payment schedule table with all details
  - Status badges (Pending, Partial, Paid)
  - CRO sees "Collect" action buttons
- [x] **Planning Team Notifications**:
  - Notified when CRO collects a payment
  - Can track all payment status in project view
- [x] **Income Module Integration**:
  - All collected payments automatically recorded in Income
  - Visible to Super Admin, Admin, Accountant
- [x] **Backend Endpoints**:
  - `POST /api/projects/{id}/payment-schedule/generate` - Planning generates schedule
  - `POST /api/payment-stages/{id}/collect` - CRO collects payment
  - `GET /api/projects/{id}/payment-summary` - Complete payment summary
  - `GET /api/payment-schedule/due-payments` - Due/overdue payments
  - `GET /api/projects/search` - Project ID search
  - `GET /api/projects/list-for-filter` - Project dropdown filter

#### ✅ Manual Payment Schedule & Request Flow (P0 - February 20, 2026)
- [x] **Manual Payment Schedule Creation** (Payments Tab):
  - Planning manually adds payment stages with due dates
  - Auto-calculate: Enter amount → percentage calculated, or Enter percentage → amount calculated
  - Based on project total value
- [x] **Request Payment Flow**:
  - Planning clicks "Req Payment" → status changes to "Requested"
  - CRO receives notification
  - CRO Board shows "Payment Collection Requests" section
  - CRO clicks "Collect" → enters amount, mode, reference
  - Status flow: Draft → Requested → Partially Collected → Collected → Done
- [x] **Balance Tracking**:
  - Shows Amount, Received, Balance columns
  - "Req Balance" button for partially collected payments
  - Green checkmark for fully paid stages
- [x] **Status Badges**:
  - Draft (gray), Requested (blue), Partially Collected (yellow), Done (green)
- [x] **Backend Endpoints**:
  - `PATCH /api/payment-stages/{id}/request` - Request payment from CRO
  - `GET /api/cro/payment-requests` - Get all pending requests for CRO

#### ✅ Payment Schedule Full CRUD (P0 - February 20, 2026)
- [x] **Add Payment Stages**:
  - Bulk add dialog with multiple rows
  - Auto-calculation between percentage and amount
  - Due date field
  - Planning role can add (previously restricted)
- [x] **Edit Payment Stages** (NEW):
  - Edit dialog with form fields (stage name, percentage, amount, due date)
  - Auto-calculation: enter percentage → amount recalculates, enter amount → percentage recalculates
  - Edit button visible only for Draft status items
  - Save Changes updates the payment stage
- [x] **Delete Payment Stages** (NEW):
  - Delete button visible only for Draft status items
  - Confirmation dialog before deletion
  - Planning role can delete (previously restricted to PM/Admin)
- [x] **Submit Payment Schedule** (NEW):
  - "Submit Schedule (N)" button shows count of draft items
  - Confirmation dialog with summary (count and total amount)
  - Submits all draft stages, changing status to "Requested"
  - Notifies CRO users about new payment requests
- [x] **Backend Endpoints**:
  - `PATCH /api/payment-stages/{id}` - Edit payment stage (Planning role added)
  - `DELETE /api/payment-stages/{id}` - Delete payment stage (Planning role added)
  - `POST /api/projects/{id}/payment-schedule/submit` - Submit all draft stages for collection (NEW)

#### ✅ Client Portal & Share as PDF (February 20, 2026)
- [x] **Enhanced Client Portal**:
  - "My Projects" list showing all projects linked to client user
  - Full project detail view with tabbed interface
  - Tabs: Overview, Payment Schedule, Scope of Work, Photos, Documents
  - Construction stage progress visualization
  - Financial summary cards (Project Value, Received, Balance, Progress)
- [x] **Share as PDF**:
  - "Share as PDF" button in Client Portal (uses browser print)
  - "Share as PDF" button in Admin Project Detail view
  - Print-optimized CSS for professional PDF output
- [x] **Client Access Control**:
  - Automatic access to linked projects (no manual sharing needed)
  - Excludes: Work Orders, Expenses, Internal Notes
  - Shows only verified/approved scope items
- [x] **Demo Client Setup**:
  - Mr. Mohan (mohan@client.com) linked to "Mohan Home" project
  - Quick access button on login page
  - Auto-redirect to client portal on login
- [x] **Backend Endpoints**:
  - `GET /api/client-portal/my-projects` - Get all projects for client
  - `GET /api/client-portal/project/{id}` - Get full project details
  - `POST /api/projects/{id}/link-client` - Link client user to project

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
- `POST /api/projects/{id}/link-client` - Link client user to project

### Client Portal
- `GET /api/client-portal/my-projects` - Get all projects for logged-in client
- `GET /api/client-portal/project/{id}` - Get full project details for client (excludes internal notes)

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
| Planning | planning@constructionos.com | BOQ management, Payment Schedule CRUD |
| Procurement | procurement@constructionos.com | Vendors, POs, Transit tracking |
| Site Engineer | engineer@constructionos.com | Site receipts, Material receipt |
| Vendor | vendor@balaji.com | Vendor portal (after linking) |
| Client | raj@client.com | Read-only portal |
| Client (Mohan) | mohan@client.com | Mohan Home project portal |
| CRO | cro@constructionos.com | Project onboarding, payment collection |

---

#### ✅ CRM Lead Management System (February 22, 2026) - NEW
- [x] **CRM Module A - Pre-Sales** (`/crm-pre-sales`):
  - Kanban board with drag-and-drop between stages
  - Default stages: New Lead, Contacted, Proposal, Follow-up, Appointment Booked
  - Custom stage creation (name, color)
  - Lead cards showing name, phone, email, source badge
  - Source filtering (Meta, SEO, Referral, Walk-in, Website, Other)
  - Search by name, email, phone
  - Create lead with custom fields support
  - Lead details dialog with stage change buttons
  - **Auto-transfer to Sales** when moved to "Appointment Booked" (final stage)

- [x] **CRM Module B - Sales** (`/crm-sales`):
  - Kanban board with sales-specific stages
  - Default stages: New Appointment, Discussion, Site Visit, Rough Estimate Requested, Rough Estimate Shared, Negotiation, Deal Closed, Lost
  - RE Stats cards (Requested, In Progress, Approved, Converted)
  - Leads from Pre-Sales automatically appear
  - **RE Project trigger**: Moving to "Rough Estimate Requested" creates RE Project
  - **Main Project conversion**: Moving to "Deal Closed" converts approved RE Project to Main Project
  - RE Project badge on leads with linked estimates

- [x] **RE Project Module** (`/crm/re-projects`):
  - Planning Department dashboard for rough estimates
  - Status cards: New Requests, In Progress, Submitted, Approved, Rejected
  - **Planning Workflow**:
    - View new RE requests from Sales
    - Edit project details (name, location, sqft, building type)
    - Add rough scope items with quantity, unit, rate
    - Enter estimated costs (Material, Labour, Overhead)
    - Auto-calculate total estimate
    - Submit for GM approval
  - **GM Approval**:
    - Review submitted estimates
    - Approve or Reject with reason
    - Approval updates Sales lead stage to "Rough Estimate Shared"
    - Rejection notifies Planning for revision

- [x] **Custom Fields Builder** (`/crm/custom-fields`):
  - No-code field configuration panel
  - Supported field types:
    - Text, Number, Textarea
    - Dropdown, Multi-Select
    - Checkbox, Date
    - Email, Phone, URL
    - Address, GPS Location
  - Field properties: Name, Label, Required, Placeholder, Options
  - Conditional field visibility (show when another field has specific value)
  - Drag-reorder fields

- [x] **CSV Import** (`/crm/import-csv`):
  - 4-step import wizard (Upload → Map → Preview → Result)
  - Download CSV template
  - Auto-detect and map columns
  - Preview imported data before commit
  - Error handling with row-level error report
  - Lead source selection for imports

- [x] **New User Roles**:
  - Pre-Sales (CRM A access)
  - Sales (CRM B access)
  - Demo users: presales@constructionos.com, sales@constructionos.com

- [x] **Backend Endpoints**:
  - CRM Pre-Sales: `GET /api/crm/pre-sales/dashboard`, `GET/POST /api/crm/pre-sales/leads`
  - CRM Sales: `GET /api/crm/sales/dashboard`, `GET /api/crm/sales/leads`
  - Lead Stage: `PATCH /api/crm/leads/{id}/stage` (with auto-triggers)
  - Stages: `GET/POST/PATCH/DELETE /api/crm/stages`
  - Custom Fields: `GET/POST/PATCH/DELETE /api/crm/custom-fields`
  - RE Projects: `GET/PATCH /api/crm/re-projects`, `POST .../submit-for-approval`, `PATCH .../approve`
  - Planning: `GET /api/crm/planning/re-dashboard`
  - Import: `GET /api/crm/import/template`, `POST /api/crm/import/csv`

- [x] **Workflow Automation**:
  - Pre-Sales → "Appointment Booked" → Auto-transfer to Sales CRM
  - Sales → "Rough Estimate Requested" → Auto-create RE Project → Notify Planning
  - Planning → Submit for approval → Notify GM
  - GM → Approve → Update Sales lead → Notify Sales
  - Sales → "Deal Closed" (with approved RE) → Convert RE to Main Project → Notify CRO

- [x] **Testing**: 18/19 backend tests passed (95%), 100% frontend success

#### ✅ CRM UI Enhancements (February 22, 2026) - NEW
- [x] **Inline "Add Field" Button** (Notion-style):
  - Located in "Add Lead" dialog header
  - Opens custom field creation dialog
  - Supports all field types (Text, Number, Dropdown, Textarea, Date, Email, Phone, Checkbox)
  - Dynamic options for Dropdown type
  - Fields immediately available after creation

- [x] **Manage Custom Fields Dialog**:
  - "Manage" button next to Custom Fields section
  - Lists all custom fields with type and ID
  - Delete button for each field
  - **DELETE confirmation**: Must type "DELETE" to confirm deletion
  - Warning about data loss before deletion

- [x] **Lead Detail Dialog with Tabbed Interface**:
  - Opens when clicking on any lead card in Kanban board
  - 4 Tabs: Overview, Remarks, Follow-up, Activity
  - **Overview Tab**:
    - Contact Information (email, phone, address)
    - Custom Fields display
    - Lead Summary textarea with Save Summary button
    - Move to Stage buttons for quick stage change
  - **Remarks Tab**:
    - Add Remark input with send button
    - Remarks list with user name, timestamp
    - Supports general remark type
  - **Follow-up Tab**:
    - Schedule Follow-up form (datetime, note)
    - Follow-ups list with Pending/Completed status
    - Color-coded cards (orange=pending, green=completed)
  - **Activity Tab**:
    - Activity Timeline showing all lead events
    - Stage changes with timestamps
    - Lead created entry

- [x] **Lead Card Enhancements**:
  - Shows badges for remarks count
  - Shows follow-up indicator
  - Visual feedback on hover

- [x] **Backend Endpoints for Lead Details**:
  - `GET /api/crm/leads/{lead_id}` - Get full lead details
  - `PATCH /api/crm/leads/{lead_id}` - Update lead (summary, name, etc.)
  - `POST /api/crm/leads/{lead_id}/remarks` - Add remark
  - `POST /api/crm/leads/{lead_id}/follow-ups` - Schedule follow-up
  - `PATCH /api/crm/leads/{lead_id}/follow-ups/{follow_up_id}/complete` - Mark follow-up complete

- [x] **Lead Model Enhancements**:
  - Added `summary` field for lead summary text
  - Added `remarks` array for notes/comments
  - Added `follow_ups` array for scheduled follow-ups

---

## Recently Completed (February 22, 2026)

### GM Dashboard Redirect Bug Fix
- [x] **Fixed GM redirect issue**: GM users were being redirected to `/approvals` instead of `/gm-dashboard`
- [x] **Location**: `Dashboard.jsx` - Lines 183-186
- [x] **Result**: GM users now correctly redirect to GM Command Center upon login
- [x] **Testing**: 100% frontend success rate verified via testing agent (iteration_17.json)

### GM Dashboard - RE Project Approval Fix
- [x] **Fixed approval API**: Changed from POST to PATCH method in frontend
- [x] **Extended approval status**: Now allows approval for `re_in_progress` status (not just `re_submitted`)
- [x] **Added Approve/Reject buttons**: Now visible for RE Projects with "In Progress" status

### Sales CRM - Deal Close with Advance Collection
- [x] **New Deal Close Dialog**: When moving a lead to "Deal Closed" stage, shows dialog to collect:
  - Project summary (name, location, area, handover months, total value)
  - Advance amount input with percentage calculation
  - Payment mode selection (Cash, UPI, Bank Transfer, Cheque, Card)
  - Payment reference/Transaction ID
  - Balance after advance preview
- [x] **Backend updated**: `LeadStageUpdate` model now accepts advance payment data
- [x] **Project creation updated**: Main projects created with advance amount, payment mode, payment reference, and timestamps

---

## Pending/Backlog Tasks

### P1 - Code Refactoring (HIGH PRIORITY)
- [ ] **Refactor server.py Monolith** - Split 8000+ line file into modular router files:
  - `/app/backend/routes/auth.py`
  - `/app/backend/routes/projects.py`
  - `/app/backend/routes/payments.py`
  - `/app/backend/routes/procurement.py`
  - `/app/backend/routes/work_orders.py`
  - `/app/backend/routes/packages.py`
  - etc.

### P1 - Database Security
- [ ] **Database Security & Production Readiness** - Implement recommendations from `/app/docs/DATABASE_ARCHITECTURE.md`
  - Configure MongoDB authentication
  - Set up backup procedures
  - Review and implement security best practices

### P2 - Features
- [ ] **Google Sheets Integration** for CRM - Sync leads from Google Sheets tabs (Meta, SEO, Other)
- [ ] **Unified Approval Dashboard** for GM/Admin roles
- [ ] **Email Notifications** via Resend (requires API key)
- [ ] **Aadhar Document Upload** for labour contractors (encrypted storage)

### P3 - Future
- [ ] Gantt Chart for Project Timelines
- [ ] Enhanced Client Portal with document upload
- [ ] Bulk-add scope items approval workflow refinement

---

## Recently Completed Features

### Procurement Board V2 (February 20, 2026)
- [x] **Complete 8-Step Material Procurement Flow**:
  1. Site Request (Site Engineer)
  2. Planning Approval
  3. Procurement Board Entry
  4. Vendor Selection & Pricing
  5. Payment Type Selection (Advance/Partial/Credit)
  6. Accounts Approval (for Advance/Partial)
  7. PO Generation
  8. Dispatch & In Transit
  9. Site Receipt with OTP Verification

- [x] **Payment Types**:
  - Advance: Full payment upfront → Accounts approval → PO
  - Partial: Advance + Balance tracking → Accounts approval → PO
  - Credit: No payment → Direct PO → Credit Ledger entry

- [x] **Vendor Management**:
  - Material Vendors (bank details, GST, tags)
  - Labour Contractors (categories: Civil, Electrical, Plumbing, etc.)
  - Bank details: Name, Account, IFSC, Payment Method (Bank/UPI/Cash)
  - Tax & Compliance: GST, PAN

- [x] **Credit Ledger**:
  - Track outstanding credit per vendor
  - Record payments with reference
  - Status: Outstanding → Partially Paid → Paid

- [x] **Transit Tracking**:
  - OTP generation on dispatch
  - Vehicle/driver details
  - Status updates

- [x] **Dashboard Metrics**:
  - Pending, In Progress, Awaiting Payment
  - In Transit, Credit Outstanding, Delivered

- [x] **API Endpoints**:
  - `POST /api/procurement/v2/select-vendor/{id}`
  - `PATCH /api/procurement/v2/accounts-approval/{id}`
  - `POST /api/procurement/v2/generate-po/{id}`
  - `PATCH /api/procurement/v2/dispatch/{id}`
  - `POST /api/procurement/v2/receive/{id}`
  - `GET /api/procurement/credit-ledger`
  - `POST /api/procurement/credit-ledger/{id}/pay`
  - `POST /api/vendor-master/v2/create`
  - `GET /api/vendor-master`
  - `GET /api/procurement/transit`
  - `GET /api/procurement/reports/vendor-spend`
  - `GET /api/procurement/reports/material-spend`

### Comprehensive Accountant Board (February 20, 2026) - NEW
- [x] **Accountant Dashboard** (`/accountant-dashboard`):
  - Total Income, Total Expense, Net Profit, Pending Requests summary cards
  - Income by Payment Method breakdown (Cash, Cheque, Bank Transfer, UPI, Credit Card)
  - HR & Payroll summary (Total Staff, Pending Payroll)
  - Cheque Management summary (Pending Cheques, Bounced)
  - Project-wise Income & Expense table with profit margins
  - Quick action buttons: Record Income, View Expenses, Process Payroll, Pending Approvals
  - Navigation to OTP Payments, Approvals, HR, Cheques

- [x] **HR Portal** (`/hr-portal`):
  - **Staff Management Tab**:
    - Staff Directory with search and department filters
    - Add/Edit Staff dialog with complete details:
      - Basic: Name, Email, Phone, Department, Designation, Date of Joining
      - Salary: Basic Salary, HRA, DA, TA, Other Allowances
      - Deductions: PF, ESI, Professional Tax, TDS, Other Deductions
      - Bank: Bank Name, Account Number, IFSC Code, Payment Method
    - Auto-calculated Gross Salary, Total Deductions, Net Salary
    - Employee code auto-generation (EMP0001, EMP0002, etc.)
  - **Payroll Tab**:
    - Generate Payroll for any month/year
    - Attendance-based pro-rata salary calculation
    - Overtime pay calculation (1.5x rate)
    - Approval workflow: Draft → Approved → Paid
    - Bulk pay all approved payrolls for a month
    - Transaction ID recording after payment

- [x] **Cheque Management** (`/cheque-management`):
  - Summary cards: Total, Incoming, Outgoing, Pending (with amount), Bounced (with amount), Cleared
  - Filter tabs: All, Incoming, Outgoing, Pending, Bounced
  - Search cheques by number, party name, bank
  - **Add Cheque Dialog**:
    - Cheque Details: Number, Amount, Date, Type (Incoming/Outgoing)
    - Bank Details: Bank Name, Branch, Account Number, IFSC
    - Party & Project: Party Name, Party Type (Client/Vendor), Project (optional)
    - Post-Dated Cheque option with reminder date
    - Remarks
  - **Update Cheque Status**:
    - Statuses: Issued, Deposited, Cleared, Bounced, Cancelled, Post-Dated
    - Deposit Date, Clearance Date tracking
    - Bounce Reason and Bounce Charges
  - **Post-Dated Cheque Reminders**:
    - Alert card for cheques due within 7 days
    - Displays details: Number, Party, Amount, Due Date

- [x] **Payment Processing** (`/payment-processing`) - OTP-Verified Payments:
  - Summary cards: Awaiting OTP, OTP Verified, Completed, Total Processed
  - Payment Requests table with status tracking
  - **New Payment Flow**:
    1. Initiate: Enter Payment Type, Party Name, Amount, Email/Phone
    2. OTP Sent: System generates 6-digit OTP (Mock mode shows on screen)
    3. Verify: Enter OTP to verify payment
    4. Complete: Enter Transaction ID, Payment Method, Remarks
  - **Payment Types**: Vendor Payment, Contractor Payment, Material Payment, Salary, Other
  - **Mock OTP**: When no email configured, OTP displays on screen for testing
  - **Email OTP**: Ready for Resend integration (needs API key)

- [x] **Backend Models**:
  - `Transaction` - Unified transaction tracking (income/expense/salary/vendor)
  - `ChequeRecord` - Comprehensive cheque management
  - `Staff` - Employee details with full salary structure
  - `Attendance` - Daily attendance tracking
  - `Payroll` - Monthly payroll with attendance-based calculation
  - `PaymentVerification` - OTP-based payment verification

- [x] **Backend API Endpoints**:
  - **Dashboard**: `GET /api/accountant/comprehensive-dashboard`
  - **Project Financials**: `GET /api/accountant/project-financials/{project_id}`
  - **Transactions**: `GET/POST/DELETE /api/accountant/transactions`
  - **Cheques**: `GET/POST /api/accountant/cheques`, `PATCH /{id}/status`, `GET /reminders`
  - **Staff**: `GET/POST/PATCH/DELETE /api/hr/staff/{id}`
  - **Attendance**: `GET/POST /api/hr/attendance`, `POST /bulk`
  - **Payroll**: `GET/POST /api/hr/payroll`, `PATCH /{id}/approve`, `PATCH /{id}/pay`, `POST /bulk-pay`
  - **Payment Verification**: `POST /api/accountant/payment-request/initiate`, `/verify-otp`, `/complete`, `GET /payment-requests`

- [x] **Frontend Pages**:
  - `/app/frontend/src/pages/AccountantDashboard.jsx`
  - `/app/frontend/src/pages/HRPortal.jsx`
  - `/app/frontend/src/pages/ChequeManagement.jsx`
  - `/app/frontend/src/pages/PaymentProcessing.jsx`

- [x] **Testing**: 100% frontend test success rate (iteration_12.json)

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
│   │   │   ├── ProcurementBoardV2.jsx  # NEW (Feb 20, 2026)
│   │   │   ├── SiteReceipt.jsx
│   │   │   ├── Expenses.jsx
│   │   │   ├── UserManagement.jsx
│   │   │   ├── Notifications.jsx
│   │   │   ├── ClientPortal.jsx
│   │   │   ├── VendorPortal.jsx
│   │   │   ├── FinancialOverview.jsx
│   │   │   ├── ComprehensiveProjectView.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── MaterialManagement.jsx
│   │   │   ├── VendorMasterManagement.jsx
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

### ✅ CRO, GM & Role-Based Boards (Feb 19, 2026)

#### New User Roles
- **CRO (Client Relationship Officer)**: Project onboarding + commercial setup
- **General Manager (GM)**: Approval layer between Planning and Super Admin

#### Package System (Super Admin)
- **Package Management** (`/packages`)
  - Create packages A, B, C with:
    - Scope of Work items (name, qty, unit, rate, total)
    - Default material list
    - Default labour scope
    - Base rate per sqft (optional)
  - Package value = Sum of scope item totals
  - Building types: residential, commercial, villa, apartment, industrial, office

#### CRO Board (`/cro-board`)
- **Dashboard Metrics**: Draft, In Review, Awaiting Approval, Approved
- **Create Project Flow**:
  1. Enter: Name, Client, Location, Sqft, Building Type, Start Date
  2. Select Package (A/B/C)
  3. Package scope auto-loads, project value auto-calculates
  4. Submit for Planning Review
- **Permissions**: Create projects, select package, view value
- **Restrictions**: Cannot modify after planning approval

#### Planning Board (`/planning-board`)
- **Dashboard Metrics**: New Projects, Awaiting Approval, Working, Completed
- **Pending Site Engineer Requests**: Alert with Review button
- **Quick Actions**: Materials, Vendors, Contractors, Work Orders
- **Project Tabs**: New, Awaiting, Working, Completed
- **Workflow**:
  1. Review CRO-created projects
  2. Edit scope, customize materials
  3. Submit for GM/Admin approval

#### GM/Admin Approval Flow
- **Approval Endpoints**:
  - `GET /api/approvals/projects` - Get pending approvals
  - `PATCH /api/approvals/projects/{id}/gm-approve` - GM approval
  - `PATCH /api/approvals/projects/{id}/final-approve` - Super Admin final approval
  - `PATCH /api/approvals/projects/{id}/reject` - Reject with reason
- **Flow**: Planning → GM Approved → Admin Approved → Ready for Execution

#### Accounts Board (`/accounts-board`)
- **Dashboard Metrics**: Material, Labour, Procurement pending counts with totals
- **Payment Processing**:
  - View pending payments by type (Material, Labour, Procurement)
  - Process payment: Full, Partial, or Credit
  - Add payment remarks
- **API**: `PATCH /api/accounts/process-payment/{type}/{id}`

#### Labour Contractor Portal
- **CRUD for Labour Contractors**:
  - Name, work types (masonry, plumbing, electrical, etc.)
  - Contact details, bank details
  - Rate structure per work type
- **API**: `/api/labour-contractors`

#### Updated Project Model
- New fields: sqft, building_type, package_id, package_name
- New statuses: draft, planning_review, awaiting_approval, gm_approved, planning_approved
- Workflow tracking: created_by, planning_modified_by, gm_approved_by, admin_approved_by

#### Improved Bulk Scope Dialog
- Start with 3 rows (not 10)
- X button to remove individual rows
- "Add Row" button (add 1)
- "Add 5 Rows" button (add multiple)
- Flexible: add only what you need

---

## What's Next (P1/P2 - Upcoming)

### P1 - Upcoming Tasks
- [ ] Complete Labour Contractor Management UI (skeleton exists at `/labour-contractors`)
- [ ] Enforce Material Brand Locking (prevent changes after project scope approval)
- [ ] Unified Approval Dashboard (central view for all pending approvals)

### P2/P3 - Future Tasks
- [ ] Backend refactoring (split server.py into modular API Routers - 7000+ lines)
- [ ] Enable Email Notifications (Resend integration - requires API key)
- [ ] Enhanced Client Portal with file uploads
- [ ] Gantt Chart for Project Timelines
- [ ] Export to Excel/PDF
- [ ] Dashboard charts and graphs

---

### ✅ CRO Payment Verification Workflow (Feb 20, 2026)

#### Overview
New workflow where CRO creates project → Accountant verifies payment → CRO submits to Planning

#### Workflow Flow
```
Draft → Submit for Payment → Accountant Verifies → Payment Received → Send to Planning
```

#### New Project Statuses
1. **draft** - CRO created, not submitted
2. **pending_payment** - Submitted, waiting Accountant verification
3. **payment_verified** - Accountant verified, CRO can submit to Planning
4. **planning_review** - Submitted to Planning Department

#### CRO Board Updates
- **5 Status Cards**: Draft, Pending Payment, Payment Received, In Planning, Approved
- **Workflow Banner**: Visual guide showing the flow
- **5 Tabs**: Draft | Pending Payment | Payment Received | In Planning | Approved
- **Action Buttons**:
  - Draft: "Submit for Verification" (sends to Accountant)
  - Pending Payment: "Awaiting Accountant" badge
  - Payment Received: "Send to Planning" button

#### Accounts Board Updates
- **"New Requests" Card**: Highlighted amber card showing pending advance verifications
- **"New Requests" Tab**: Default tab showing projects pending verification
- **Verify Dialog**: Transaction ID (required), Bank Name, Remarks
- **Reject Dialog**: Rejection reason (required)

#### Backend API Endpoints
- `PATCH /api/cro/projects/{id}/submit` - Submit for payment verification
- `PATCH /api/cro/projects/{id}/submit-to-planning` - Submit to Planning (after verification)
- `GET /api/accounts/pending-advance-payments` - Get pending verifications
- `PATCH /api/accounts/verify-advance-payment/{id}` - Verify with transaction ID
- `PATCH /api/accounts/reject-advance-payment/{id}` - Reject with reason

#### Validation Rules
- Cannot submit without advance payment amount
- Cannot submit to Planning without payment verification
- Only Accountant can verify/reject payments
- Rejected projects return to Draft status

#### Testing
- 14/14 backend tests passed
- All UI components verified
- Complete E2E workflow tested

---

### ✅ Enhanced CRO Board Workflow (Feb 20, 2026)

#### Overview
Complete CRO workflow for project onboarding with project stages tracking, auto-generated project codes, advance payment recording, and payment collection workflow.

#### CRO Dashboard Features
1. **Status Cards**: Draft, In Review, Awaiting Approval, Approved counts
2. **Total Ongoing Projects** with "View All Projects" button
3. **Total Project Value** aggregate
4. **Project Stages Section**: 8 stages with project counts
   - Drawing Stage
   - Yet to Start  
   - Foundation
   - Basement
   - SS - Brick Work
   - SS - Plastering
   - Finishing
   - Handover

#### Create Project Dialog
- **Basic Info**: Project Name, Client Name
- **Client Contact**: Phone, Email (with icons)
- **Location** field
- **Square Feet, Building Type, Expected Start Date**
- **Package Selection**: Cards showing Package Code, Name, Rate/sqft
- **Advance Payment Details**: Date Received, Amount, Payment Mode
- **Rough Estimate PDF URL** upload
- **Auto-calculated Project Value**: sqft × rate

#### Auto-Generated Project Code
Format: `USB{serial}{month}{year}` (e.g., USB010226)
- USB = Company prefix
- Serial = Sequential number within month
- Month = 2-digit month
- Year = 2-digit year

#### My Projects Table
- **Tabs**: Draft | In Review | Approved
- **Columns**: PROJECT (with code), CLIENT, LOCATION, PACKAGE, SQFT, VALUE, STATUS, ACTION
- **Actions**: Submit (for draft) | View (for others)

#### Filters Panel
- Search by project/client name
- Date range filter (from/to)
- Stage filter dropdown
- Apply/Clear buttons

#### Backend API Endpoints
- `GET /api/cro/dashboard` - Dashboard metrics with stage counts
- `POST /api/cro/projects` - Create project with all new fields
- `PATCH /api/cro/projects/{id}/submit` - Submit for planning review
- `GET /api/cro/projects/all` - Filtered projects list
- `POST /api/cro/projects/{id}/add-payment-milestone` - Add payment milestone
- `PATCH /api/cro/projects/{id}/notify-client/{milestone_id}` - Notify client
- `PATCH /api/cro/projects/{id}/collect-payment/{milestone_id}` - Record payment

#### Testing
- 18/18 backend tests passed
- All UI components verified
- Stage filter dropdown bug fixed

---

### ✅ Work Order Stage Payment Workflow (Feb 19, 2026)

#### Overview
Complete end-to-end payment flow for work order stages:
**Site Engineer → Planning → Accounts**

#### Site Engineer Dashboard (`/site-engineer`)
- **Work Orders Tab**: View assigned work orders with stages
- **Stage Actions**:
  - Start Work (pending → in_progress)
  - Mark Complete (in_progress → completed)
  - Request Payment (completed → payment_requested)
- **Payment Request Dialog**: Submit request with optional remarks
- **Status Badges**: Pending, In Progress, Completed, Payment Requested, Approved, Paid

#### Planning Board (`/planning-board`)
- **Payment Requests Alert**: Purple alert when stage payments are pending
- **Review Payments Dialog**: Shows all pending payment requests with:
  - Work order number, stage name, amount
  - Contractor name, project name
  - Remarks from site engineer
- **Actions**: Approve (sends to Accounts) or Reject (back to Site Engineer with reason)

#### Accounts Board (`/accounts-board`)
- **New "Stage Payments" Card**: Shows count and total of approved stage payments
- **New "Stage" Tab**: Filters to show only stage payments
- **Process Payment**: Mark approved payments as paid
- **Updated Dashboard Metrics**: 5 cards including Stage Payments + Total Pending

#### Backend API Endpoints
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/start` - Start stage work
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/complete` - Complete stage
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/request-payment` - Request payment
- `GET /api/work-orders/payment-requests` - Get pending requests (Planning)
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/approve-payment` - Approve (Planning)
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/reject-payment` - Reject (Planning)
- `PATCH /api/work-orders/{wo_id}/stages/{stage_id}/process-payment` - Process (Accounts)

#### Backend Bug Fix
- **Route Ordering Fix**: Moved `/work-orders/payment-requests` before parameterized `/work-orders/{work_order_id}` to prevent 404 errors

#### Testing
- 17/17 backend tests passed
- Full E2E flow tested: Site Engineer requests → Planning approves → Accounts processes
- All three dashboards UI verified

---

### ✅ Bug Fixes (February 22, 2026)

#### PDF Download Fix
- [x] **Fixed `doc.autoTable is not a function` error**
  - **Root Cause**: jspdf-autotable v5.x changed API syntax
  - **Fix**: Changed import to `import autoTable from 'jspdf-autotable'` and usage to `autoTable(doc, {...})`
  - **Files Updated**: ProjectDetail.jsx, CRMSales.jsx, GMDashboard.jsx, REProjectsPage.jsx
  - **Testing**: PDF download now works with success toast "Rough Estimate PDF downloaded successfully!"

#### CRE Convert Deal Fix
- [x] **Fixed `TypeError: unsupported operand type(s) for * : NoneType and int` error**
  - **Root Cause**: `handover_months` could be `None` even when using `.get()` with default
  - **Fix**: Changed to `(re_project.get("handover_months") if re_project else None) or 12`
  - **File Updated**: `/app/backend/server.py` line 8762
  - **Testing**: Convert deal workflow now works correctly

### ✅ CRM View Toggle Feature (February 22, 2026)

#### Pre-Sales & Sales CRM List View
- [x] **View Toggle Button**: Kanban | List toggle on the right side of search bar
- [x] **List View Features**:
  - Stage tabs with small font and colored dot indicators
  - Shows stage counts: e.g., "New Lead (1)", "Contacted (3)"
  - Clickable tabs to filter by stage
  - Table columns: Lead, Contact, Source/Stage, Created, Actions
  - Eye icon to view lead details
- [x] **Kanban View**: Original drag-and-drop kanban board preserved
- [x] **Files Updated**: 
  - `/app/frontend/src/pages/CRMPreSales.jsx`
  - `/app/frontend/src/pages/CRMSales.jsx`

### ✅ Enhanced Payment Summary (February 22, 2026)

#### Payment Summary Tab Improvements
- [x] **Advance Payment Card**: Green bordered card prominently displaying advance payment details
  - Amount, Payment Mode (badge), Date Received, Status (Received badge)
  - Only shows when advance payment exists
- [x] **Stage-wise Payment Schedule**: Table showing all payment stages with collect button
- [x] **Payment Collection History**: New section showing all collected payments
  - Advance Payment row with green "Advance" badge
  - Stage Payment rows with blue "Stage Payment" badge
  - Partial payments with yellow "Partial" badge
  - Income records with purple "Income" badge
  - Total Collected footer with sum
- [x] **Files Updated**: `/app/frontend/src/pages/ProjectDetail.jsx`

### ✅ Lead Distribution Engine (February 22, 2026)

#### Marketing Board (Super Admin Only) - ENHANCED
- [x] **New Page**: `/marketing-board` - Lead Distribution Engine dashboard
- [x] **Distribution Settings**:
  - Enable/Disable toggle for auto-distribution
  - Round-robin algorithm for fair lead distribution
  - Separate queues for Pre-Sales and Sales teams
- [x] **Team Performance Dashboard**:
  - Pre-Sales team stats: Total leads, Converted, Conversion rate
  - Sales team stats: Total appointments, Deals closed, Close rate
- [x] **Individual Salesperson View** (ENHANCED February 22, 2026):
  - Click on any team member to view detailed performance
  - Summary stats: Total Leads/Appointments, Converted/Deals Closed, Rate
  - Lead Stage Breakdown with visual badges
  - **Filters**: Date From, Date To, Source, Stage
  - Leads table with name, contact, source, stage, date, edit action
- [x] **All Leads View**: 
  - Search by name, email, phone
  - Filter by Type (Pre-Sales/Sales), Assignee
  - **Reassign leads** via dropdown directly in table
  - **Edit lead** dialog: name, email, phone, city
- [x] **Lead Sources Breakdown**: Visual stats by source with percentages
- [x] **Add Team Member**: Create new Pre-Sales or Sales team members

#### Multi-User Support
- [x] **Pre-Sales Team**: Pre-Sales A (Kavitha), Pre-Sales B (Priya)
- [x] **Sales Team**: Sales A (Vikram), Sales B (Rahul)
- [x] **Round-Robin Assignment**:
  - Lead 1 → Pre-Sales A
  - Lead 2 → Pre-Sales B
  - Lead 3 → Pre-Sales A (cycles back)
- [x] **Role-Based Filtering**:
  - Pre-Sales/Sales users see only their assigned leads
  - Super Admin sees all leads across all users

#### Backend Endpoints Added
- `GET /api/marketing/dashboard` - Marketing Board stats
- `GET /api/marketing/distribution-settings` - Get distribution config
- `PATCH /api/marketing/distribution-settings` - Update distribution config
- `GET /api/marketing/team-members` - List team members
- `POST /api/marketing/team-members` - Add new team member
- `POST /api/marketing/assign-lead/{lead_id}` - Manual lead assignment
- `GET /api/marketing/all-leads` - All leads for Super Admin (filters: stage_type, assigned_to)
- `PATCH /api/crm/leads/{lead_id}` - Edit lead (name, email, phone, city)

#### Files Created/Updated
- **Created**: `/app/frontend/src/pages/MarketingBoard.jsx`
- **Created**: `/app/backend/tests/test_marketing_board.py` - 19 comprehensive tests
- **Updated**: `/app/frontend/src/App.js` - Added route
- **Updated**: `/app/frontend/src/pages/Dashboard.jsx` - Added Quick Actions
- **Updated**: `/app/frontend/src/pages/Login.jsx` - Added Pre-Sales B, Sales B buttons
- **Updated**: `/app/backend/server.py` - Lead distribution engine, filtered CRM endpoints

#### Testing Status
- **Backend Tests**: 19/19 passed (100%)
- **Frontend Tests**: All features verified working
- **API Endpoints**: All 8 endpoints tested via curl and pytest

---

### ✅ Google Sheets Integration (February 22, 2026)

#### Marketing Board - Connect Google Sheets
- [x] **"Connect Google Sheets" Button**: Added to Marketing Board header
- [x] **Connection Dialog**:
  - Shows connection status (Connected/Not Connected)
  - "Setup Required" notice when credentials not configured
  - "Connect Google Account" button for OAuth flow
- [x] **Tabs for Lead Sources**:
  - **Website Tab**: Standard template with Lead Name, Phone, Email, Location, Sqft fields
  - **All Sources Tab**: View configured sheet sources, import leads, delete sources
  - **Add More Tab**: Configure new lead sources from any Google Sheet
- [x] **Sheet Preview**:
  - Enter Google Sheet URL and preview data
  - Auto-detect columns and suggest mappings
  - Shows sample data (first 3 rows)
- [x] **Column Mapping**:
  - Map sheet columns to standard fields (name, phone, email, city, sqft, budget, notes, source)
  - Auto-detect custom fields when column names don't match standard fields
  - Yellow alert shows "Custom Fields Detected" for unmapped columns
- [x] **Lead Import**:
  - Import leads from configured sheet sources
  - Round-robin distribution to Pre-Sales team (if enabled)
  - Skip duplicates (by phone number)
  - Store custom fields in lead document
- [x] **OAuth Flow**:
  - Google OAuth 2.0 with refresh token support
  - Scopes: spreadsheets.readonly, userinfo.email, userinfo.profile

#### Backend Endpoints Added
- `GET /api/sheets/config` - Get Google Sheets configuration
- `GET /api/sheets/oauth/login` - Start OAuth flow
- `GET /api/oauth/sheets/callback` - OAuth callback handler
- `POST /api/sheets/disconnect` - Disconnect Google Sheets
- `POST /api/sheets/preview` - Preview sheet data and columns
- `GET /api/sheets/sources` - List configured sources
- `POST /api/sheets/sources` - Add new sheet source
- `DELETE /api/sheets/sources/{source_id}` - Delete a source
- `POST /api/sheets/import` - Import leads from a source

#### Environment Variables Required
```env
GOOGLE_SHEETS_CLIENT_ID=<your-google-client-id>
GOOGLE_SHEETS_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_SHEETS_REDIRECT_URI=https://<your-app>.preview.emergentagent.com/api/oauth/sheets/callback
```

#### Google Cloud Setup Required
1. Create a project in Google Cloud Console
2. Enable Google Sheets API
3. Configure OAuth consent screen (external, test users)
4. Create OAuth credentials (web application)
5. Add redirect URI to authorized redirect URIs
6. Copy Client ID and Client Secret to backend/.env

#### Testing Status
- **Backend Tests**: 11/11 passed (100%)
- **Frontend Tests**: All features verified working
- **Role Access Control**: Tested (Super Admin only)

---

*Last Updated: February 22, 2026*
