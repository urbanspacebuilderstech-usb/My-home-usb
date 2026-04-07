# Construction CRM - Product Requirements Document

## Original Problem Statement
Automate the "Project Onboarding" workflow for a construction CRM application. The project has expanded to include a full Sales pipeline, Pre-Sales board, Planning board with RE Templates, and comprehensive project management features.

## Core Architecture
- **Frontend**: React + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB Atlas
- **Auth**: Cookie-based session auth with demo-login
- **Key Libraries**: @dnd-kit (drag-and-drop), jsPDF, Leaflet, Resend, Google Sheets API

## What's Been Implemented

### Sales Pipeline (CRMSales.jsx)
- 16-stage automated Kanban board
- Follow-up system with auto-move and date filters
- Site Visit management (Client Land / Our Projects)
- CRE-style Convert to Project popup
- Payment Collect → Accountant Approval → Project Onboarded flow

### Pre-Sales Board (CRMPreSales.jsx)
- Full lead management with custom fields in Edit Lead dialog

### Planning Board (PlanningBoard.jsx)
- RE Templates CRUD
- Sub-tabs: New Projects, Current (Active), Delivered
- Date filtering per sub-tab

### Project Detail (ProjectDetail.jsx)
- Drag-and-Drop reordering for scope items, stages, estimates
- "Final Estimate" tab (renamed from "Scope")
- **Team Assignment**: 7 role-based dropdowns (Architect, PM, Sr. SE, SE, CRE, QC, Procurement)
- Materials, Labour, Vendor, Payment Schedule, Files, Design tabs

### Global Features
- Drag-and-Drop reordering via @dnd-kit across all list UIs
- Stage Management with DnD
- RE Template management with DnD

## Key API Endpoints
- `GET /api/users/by-role/{role}` - Fetch users by role for team assignment
- `PATCH /api/projects/{project_id}/team` - Save 7 team role assignments
- `GET /api/projects/{project_id}/team` - Get current team assignments
- `POST /api/crm/re-templates` / `GET /api/crm/re-templates` - RE Template CRUD
- `POST /api/projects/{project_id}/scope-items/reorder` - DnD reorder
- `POST /api/projects/{project_id}/stages/reorder` - DnD reorder

## DB Schema Additions
- `projects.team`: `{ architect: user_id, project_manager: user_id, sr_site_engineer: user_id, site_engineer: user_id, cre: user_id, qc: user_id, procurement: user_id }`
- `projects.planning_status`: 'new' | 'active' | 'delivered'
- `re_templates` collection: `{ template_id, name, sqft, scope_items: [] }`

## Prioritized Backlog

### P1 (Next Up)
- Refactor CRMSales.jsx (2300+ lines) and ProjectDetail.jsx (4400+ lines)
- Geo-fencing & Location Tracking (Phase 1)
- Pre-Deployment Security Checklist (rate limiting in Mongo, 2FA, disable demo-login)

### P2
- Project Page Package Integration
- Sr. Engineer → Jr. Engineer Assignment
- Aadhar Document Upload (encrypted storage)

### P3 (Deferred)
- Cash Denomination feature (paused)
- UI/UX comprehensive review
- SaaS conversion (paused)

## Credentials
- Demo Access buttons on login page (Sales, Pre-Sales, Planning, Accountant, Super Admin)
- Planning: planning@constructionos.com
- Accountant: accountant@constructionos.com / USB@123.26
