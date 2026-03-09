# Construction Accounting CRM & Project Operations OS - PRD

## Overview
A comprehensive Construction Accounting CRM & Project Operations OS titled "My Home USB" (Urban Space Builders).

## Tech Stack
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React with TailwindCSS + Shadcn UI on port 3000
- **Database**: MongoDB

## What's Been Implemented (Complete)
- Full project management, BOQ, Work Orders, Approval Workflows
- CRM (Pre-Sales → Sales → RE Projects → Deal Close → CRE → Project)
- Procurement Board V2 with 8-step material flow
- Site Engineer + PM workflows (material/labour requests, petty cash)
- Finance Module (approvals, cashbook, suspense, project finance)
- Client Portal, Vendor Portal, HR Portal
- Google Sheets Zapier-style integration (auto-sync, tab=source, custom fields)
- Role-specific UI for all 14 roles
- E2E flow tested (31/31 passed)

## Recently Completed (March 9, 2026)

### Accountant Dashboard Complete Redesign
- **Financial Overview row**: 9 payment mode columns (Cash, Current A/c, Savings, Cheque, Petty Cash, Misc, DT, Suspense, Total) showing income/expense
- **Project-wise View**: Collapsible table with all projects, Income/Expense/Balance per project
- **Income Tab**: Mode breakdown cards (clickable for details), filters (Project, Mode, Stage), Payment Summary table with S.No, Date/Time, Project, Stage, Mode, Status (Partly/Fully Paid), Txn ID, Amount, View + Print Receipt (PDF)
- **Expense Tab**: Mode breakdown + sub-tabs (All/Materials/Labour/Petty Cash/Indirect), filters (Project, Manual/Approval), records with Type, Way (auto-detected Manual/Approval), Date, Mode, Amount, Txn ID, Vendor, Project, View + Receipt
- **Receipt system**: Printable payment receipts with "My Home USB" branding, downloadable as PDF
- **Backend**: New `GET /api/accountant/overview` endpoint with parallel queries

### Google Sheets Auto-Sync
- Background auto-sync every 5 min for new rows
- Connected sheets tracking with row counts
- Manual "Sync Sheets" button on Pre-Sales board
- Zapier-style import flow with per-tab column mapping

## Pending Tasks

### P1 - Cashbook Page Enhancement
- Update to match new accountant dashboard design
- Income/Expense tabs with same mode breakdown

### P2 - Future/Backlog
- Screen-by-Screen UI/UX Review
- Gantt Chart for project timelines
- Aadhar Document Upload
- Deployment

## Demo Credentials
- All: `Demo@1234`
- Super Admin: admin@constructionos.com
- Accountant: accountant@constructionos.com
- Others: see /app/backend/seed_data.py
