# My Home USB - Construction Accounting CRM & Project Operations OS

## Original Problem Statement
Build a comprehensive "Construction Accounting CRM & Project Operations OS" named "My Home USB" for managing construction projects end-to-end.

## Tech Stack
- **Frontend**: React 18, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI (Python), MongoDB Atlas
- **Integrations**: Google Sheets API, Resend, Emergent Object Storage, Leaflet/OpenStreetMap

## Roles
| Role | Dashboard Route | Key Capabilities |
|------|----------------|-------------------|
| Super Admin | /dashboard | Full access |
| General Manager | /gm-dashboard | Approvals (RE, projects, payments, design) |
| CRE | /cre-board | Deals, payments, collections |
| Accountant | /accounts-board | Finance, cheques, cashbook |
| Project Manager | /pm-dashboard | Projects (no financials), team, requests |
| Planning | /planning-board | Materials, labour, vendors |
| Procurement | /procurement-board-v2 | Purchase orders |
| Site Engineer | /site-engineer | On-site ops, mini cashbook |
| Pre-Sales | /crm-pre-sales | CRM pipeline |
| Sales | /crm-sales | Sales pipeline |
| Architect | /architect-dashboard | Site plans, 3D/elevation, design workflow |
| HR | /hr-portal | Employee profiles, roles & credentials |
| Client | /client-portal | View project status |

## Financial Model (80/20 Rule)
- Each project: **80% Direct Costs** (Materials, Labour, Site) / **20% Indirect + Profit**
- Indirect expenses auto-distribute across active projects based on value %
- When a project's 20% budget is exhausted, excess redistributes to other projects
- Profit = whatever remains in the 20% bucket after indirect expenses

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync (1-min interval)
- [x] Pre-Sales -> Sales transfer, RNR Stage + Pipeline Stage Management
- [x] Deal conversion, project creation, work orders
- [x] Material request/procurement/approval workflow
- [x] Site Engineer Mini Cashbook + Petty Cash
- [x] Accountant Cashbook, Cheque Management, Project Summary
- [x] Income/Expense Approval System
- [x] Masked Financial Values, Super Admin auto-creation
- [x] Forgot Password + Role-based access control
- [x] Production-Ready Setup Wizard (SetupWizard.jsx)
- [x] Architect Dashboard & Design Workflow
- [x] Gantt Chart for Project Timelines
- [x] PM Dashboard - Team, Materials, Labours Tabs
- [x] Google Sheets Sync Fix (auto-discover new tabs, 1-min interval)
- [x] Dynamic browser tab title (Role | My Home USB)
- [x] Auto-refresh (15s polling) across all 30+ pages
- [x] Loading spinner fix
- [x] Safe error handling for 132 toast error catches
- [x] CRE Board visibility fix
- [x] Planning Board visibility fix
- [x] Indirect Cost Management Module
- [x] Configurable Direct/Indirect Cost Split
- [x] Rough Estimates Tab in Planning Board
- [x] Multi-Mode Payment Collection
- [x] Numeric Input Formatting (Indian commas)
- [x] Cheque Payment Review Bug Fix
- [x] PM Dashboard Team Assignment Enhancement
- [x] Project Detail Team Tab - Editable
- [x] Removed "Generate Payment Schedule" Button
- [x] Planning Payment Schedule Overview Tab
- [x] HR Portal & Employee Management
- [x] Sales Rough Estimate Requirement Popup
- [x] Monthly Payment Schedule System
- [x] Standardized Unit Dropdown Sitewide (UnitSelect.jsx)
- [x] Contact Visibility Rules
- [x] Vendor Management System (CRUD, categories, project assignments)
- [x] Material Request Workflow Fix
- [x] **Contractor Management System (Mar 19, 2026)**:
  - Full CRUD for contractors with categories and labour types
  - Dynamic contractor categories (20 seeded: Mason, Painter, Electrician, etc.)
  - Labour types per contractor with per-day costs (Skilled, Semi-Skilled, Non-Skilled)
  - Contractor detail view with Work Orders and Payment Summary tabs
  - Frontend: /contractor-management page with 3-tab create/edit dialog
  - Backend: 10+ endpoints in /app/backend/routes/contractors.py
- [x] **Labour Work Orders System (Mar 19, 2026)**:
  - Work orders with payment stages (amount + percentage per stage)
  - Stage payment request flow: Site Engineer requests -> Planning approves/rejects
  - Routes: /api/labour-work-orders (separate from material work orders in projects.py)
  - DB collection: labour_work_orders (separate from work_orders)
- [x] **Labour Attendance System (Mar 19, 2026)**:
  - Daily attendance logging by Site Engineers
  - Auto cost calculation based on worker count x per-day cost
  - Daily summary endpoint per project
- [x] **Material Inventory System (Mar 19, 2026)**:
  - Daily opening/closing stock tracking
  - Auto closing stock calculation (opening + received - used)
  - Latest stock per material endpoint
- [x] **Route Conflict Fix (Mar 19, 2026)**:
  - Fixed CRITICAL route conflict: POST /api/work-orders was shared between projects.py and contractors.py
  - Renamed contractor work order routes to /api/labour-work-orders
  - Changed DB collection from work_orders to labour_work_orders
  - Updated all frontend API calls in ProjectDetail.jsx

## Credentials
- Super Admin: `admin@constructionos.com` / `Demo@1234`
- GM: `gm@constructionos.com` / `Demo@1234`
- CRE: `cre@constructionos.com` / `Demo@1234`
- Accountant: `accountant@constructionos.com` / `Demo@1234`
- PM: `pm@constructionos.com` / `Demo@1234`
- Planning: `planning@constructionos.com` / `Demo@1234`
- Procurement: `procurement@constructionos.com` / `Demo@1234`
- Site Engineer: `engineer@constructionos.com` / `Demo@1234`
- Pre-Sales: `presales@constructionos.com` / `Demo@1234`
- Sales: `sales@constructionos.com` / `Demo@1234`
- Architect: `architect@constructionos.com` / `Demo@1234`
- HR: `hr@constructionos.com` / `Demo@1234`
- Client: `raj@client.com` / `Demo@1234`
- Client: `mohan@client.com` / `Demo@1234`

## Key API Endpoints - Labour & Contractor System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | /api/contractor-categories | Manage contractor work type categories |
| GET/POST | /api/contractors | CRUD for contractors |
| GET | /api/contractors/{id} | Single contractor |
| PATCH | /api/contractors/{id} | Update contractor |
| GET | /api/contractors/{id}/summary | Work orders + payment stats |
| GET/POST | /api/labour-work-orders | CRUD for labour work orders |
| PATCH | /api/labour-work-orders/{wo_id} | Update work order |
| PATCH | /api/labour-work-orders/{wo_id}/stages/{stage_id}/request-payment | Site Engineer requests |
| PATCH | /api/labour-work-orders/{wo_id}/stages/{stage_id}/review | Planning approves/rejects |
| GET/POST | /api/labour-attendance | Daily attendance entries |
| GET | /api/labour-attendance/daily-summary | Per-project daily totals |
| GET/POST | /api/material-inventory | Daily stock entries |
| GET | /api/material-inventory/latest | Latest stock per material |
| GET | /api/projects/{project_id}/contractor-assignments | Project's labour work orders |

- [x] **Vendor Auto-Assignment in Material Requests (Mar 19, 2026)**:
  - When SE creates a material request, system auto-looks up vendor assigned for that material category
  - Fuzzy matching: "Cement OPC 53 Grade" matches category "Cement"
  - Assigned vendor info (vendor_id, name, category) attached to request
  - New endpoint: GET /api/projects/{project_id}/vendor-suggestion?material_name=X
  - Frontend: Green vendor suggestion banner in SE material request dialog
- [x] **Auto Purchase Order Flow (Mar 19, 2026)**:
  - When Planning approves a material request with an assigned vendor, PO is auto-generated
  - PO includes: project info, vendor info, material details, quantity
  - Both approval endpoints support auto-PO: /planning-action and /approve?action=planning_approve
  - Procurement notified about auto-PO via notifications
  - New "POs" tab in ProcurementBoardV2 with approve/dispatch/deliver workflow
  - POs marked with "Auto" badge when auto-generated
  - ProjectDetail and SiteEngineerProject show PO badges on material requests

## Backlog
- [ ] Escrow Account Integration (P0)
- [ ] Two-Factor Authentication (2FA) via mobile OTP (P0)
- [ ] Advanced Cybersecurity Practices (P1)
- [ ] Aadhar Document Upload with encrypted storage (P1)
- [ ] Refactor ProjectDetail.jsx (4000+ lines) into sub-components (P1)
- [ ] Cash Denomination feature (P2 - Paused)
- [ ] UI/UX review across all screens (P2)
- [ ] Convert to SaaS model (multi-tenancy, subscriptions) (P2)
- [ ] Production deployment guidance (P2)
