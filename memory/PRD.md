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
- [x] Project Detail - Team, Materials, Labours Tabs
- [x] Production-Ready Setup Wizard (SetupWizard.jsx)
- [x] **Google Sheets Sync Fix (Mar 15, 2026)**:
  - New tabs in connected Google Sheets are auto-discovered during sync
  - Auto-sync interval reduced to 1 minute (background task)
  - Manual sync trigger discovers + syncs new tabs
  - Frontend displays all tabs including auto-discovered ones
  - Auto-Sync card shows accurate "Every 1 min (background)" label

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
| POST | /api/sheets/auto-sync/run | Manual sync trigger - discovers new tabs |
| GET | /api/sheets/connected | List connected sheets with tab configs |

## Backlog
- [ ] Aadhar Document Upload with encrypted storage (P1)
- [ ] UI/UX review across all screens (P2)
- [ ] Convert to SaaS model (multi-tenancy, subscriptions) (P2)
- [ ] Production deployment guidance (P2)
- [ ] Optimize /api/cre/dashboard-summary endpoint (~3.5s response time)
