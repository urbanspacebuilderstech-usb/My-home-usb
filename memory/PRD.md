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

## What's Implemented
- [x] Full CRM pipeline with Google Sheets auto-sync
- [x] Pre-Sales -> Sales transfer, RNR Stage + Pipeline Stage Management
- [x] Deal conversion, project creation, work orders
- [x] Material request/procurement/approval workflow
- [x] Site Engineer Mini Cashbook + Petty Cash
- [x] Accountant Cashbook, Cheque Management, Project Summary
- [x] Income/Expense Approval System
- [x] Masked Financial Values, Super Admin auto-creation
- [x] Forgot Password + Role-based access control
- [x] 360 degree seed data for Murugan Vadapalani project
- [x] CRE Dashboard 5-tab redesign
- [x] Planning Board simplification (tabs-only)
- [x] Dynamic Cheque Entry
- [x] PM Dashboard & Permissions (financial data hidden)
- [x] Gantt Chart for Project Timelines
- [x] Architect Dashboard & Design Workflow
- [x] **Project Detail - Team, Materials, Labours Tabs (Mar 14, 2026)**:
  - Team tab: Shows PM, Sr. Site Engineers, Site Engineers with colored role cards
  - Materials tab: Summary dashboard (Total/Pending/In Progress/Delivered/Cost) + detailed table
  - Labours tab: Summary dashboard (Total/Pending/Approved/Workers/Cost) + detailed table
  - PM role: Financial data (costs, amounts) completely hidden
  - PM can create both Site Engineers and Sr. Site Engineers
  - PM can assign both roles to projects

## Credentials
- Super Admin: `admin@constructionos.com` / `Demo@1234`
- GM: `gm@constructionos.com` / `Demo@1234`
- CRE: `cre@constructionos.com` / `Demo@1234`
- Accountant: `accountant@constructionos.com` / `Demo@1234`
- Project Manager: `pm@constructionos.com` / `Demo@1234`
- Planning: `planning@constructionos.com` / `Demo@1234`
- Procurement: `procurement@constructionos.com` / `Demo@1234`
- Site Engineer: `engineer@constructionos.com` / `Demo@1234`
- Pre-Sales: `presales@constructionos.com` / `Demo@1234`
- Sales: `sales@constructionos.com` / `Demo@1234`
- Architect: `architect@constructionos.com` / `Demo@1234`

## Key API Endpoints - New
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects/{id}/team | Project team (PM, Sr SE, SE) |
| GET | /api/projects/{id}/materials-summary | Materials with stats (cost hidden for PM) |
| GET | /api/projects/{id}/labours-summary | Labours with stats (cost hidden for PM) |

## Backlog
- [ ] Aadhar Document Upload with encrypted storage (P2)
- [ ] UI/UX review across all screens
- [ ] Production deployment guidance
- [ ] Optimize /api/cre/dashboard-summary endpoint (~3.5s response time)
