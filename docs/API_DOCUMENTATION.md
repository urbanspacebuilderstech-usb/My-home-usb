# ConstructionOS API Documentation

**Version:** 1.0  
**Base URL:** `https://your-domain.com/api`  
**Last Updated:** March 2026  

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Common Response Formats](#common-response-formats)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
   - [Authentication](#authentication-endpoints)
   - [Security](#security-endpoints)
   - [Users](#users-endpoints)
   - [Projects](#projects-endpoints)
   - [CRM & Leads](#crm--leads-endpoints)
   - [Financial](#financial-endpoints)
   - [Procurement](#procurement-endpoints)
   - [Site Operations](#site-operations-endpoints)
   - [HR & Payroll](#hr--payroll-endpoints)
   - [Settings](#settings-endpoints)

---

## Overview

ConstructionOS API is a RESTful API that provides access to all platform features. All requests must be authenticated and use HTTPS.

### Base URL
```
Production: https://your-domain.com/api
Preview: https://labour-materials-hub.preview.emergentagent.com/api
```

### Request Format
- Content-Type: `application/json`
- All dates in ISO 8601 format
- All monetary values in INR (paise for precision)

---

## Authentication

### Session-Based Authentication

All API requests require a valid session cookie or Bearer token.

**Cookie Name:** `session_token`  
**Header Alternative:** `Authorization: Bearer <session_token>`

### Demo Login

```http
POST /api/auth/demo-login
Content-Type: application/json

{
  "email": "admin@constructionos.com"
}
```

**Response:**
```json
{
  "user_id": "user_abc123",
  "email": "admin@constructionos.com",
  "name": "Rajesh Kumar",
  "role": "super_admin",
  "phone": "9876543210",
  "is_active": true,
  "created_at": "2026-01-15T10:30:00Z"
}
```

**Available Demo Users:**

| Email | Role | Description |
|-------|------|-------------|
| admin@constructionos.com | Super Admin | Full access |
| gm@constructionos.com | General Manager | Business oversight |
| accountant@constructionos.com | Accountant | Financial operations |
| pm@constructionos.com | Project Manager | Project oversight |
| cre@constructionos.com | CRE | Client relationships |
| planning@constructionos.com | Planning | Project planning |
| procurement@constructionos.com | Procurement | Material sourcing |
| engineer@constructionos.com | Site Engineer | Site operations |
| presales@constructionos.com | Pre-Sales | Lead qualification |
| sales@constructionos.com | Sales | Lead conversion |
| marketing@constructionos.com | Marketing Head | Lead distribution |

---

## Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "detail": "Error description"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 requests | 60 seconds |
| Login | 5 attempts | 60 seconds |

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1709564400
```

---

## API Endpoints

---

### Authentication Endpoints

#### POST /api/auth/demo-login
Demo login for testing purposes.

**Request:**
```json
{
  "email": "admin@constructionos.com"
}
```

**Response:** User object with session cookie set.

---

#### POST /api/auth/session
Exchange OAuth session for application session.

**Headers:**
```
X-Session-ID: <google-oauth-session-id>
```

**Response:** User object with session cookie set.

---

#### POST /api/auth/logout
End current session.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

#### GET /api/auth/me
Get current authenticated user.

**Response:**
```json
{
  "user_id": "user_abc123",
  "email": "admin@constructionos.com",
  "name": "Rajesh Kumar",
  "role": "super_admin",
  "phone": "9876543210"
}
```

---

#### POST /api/auth/invite-user
Invite a new user (Admin only).

**Request:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "site_engineer"
}
```

---

#### GET /api/auth/invitations
Get pending invitations (Admin only).

---

#### DELETE /api/auth/invitations/{invitation_id}
Cancel an invitation.

---

### Security Endpoints

#### GET /api/security/status
Get security status and metrics (Super Admin only).

**Response:**
```json
{
  "status": "secure",
  "last_24_hours": {
    "failed_login_attempts": 3,
    "successful_logins": 45,
    "active_sessions": 12
  },
  "users": {
    "total": 50,
    "active": 48
  },
  "security_features": {
    "rate_limiting": true,
    "session_expiry": "24 hours",
    "input_validation": true,
    "nosql_injection_prevention": true,
    "audit_logging": true
  }
}
```

---

#### GET /api/security/audit-logs
Get audit logs (Super Admin, GM only).

**Query Parameters:**
- `limit` (int): Number of records (default: 100)
- `action` (string): Filter by action type
- `user_id` (string): Filter by user

**Response:**
```json
[
  {
    "audit_id": "aud_abc123",
    "timestamp": "2026-03-04T10:30:00Z",
    "user_id": "user_xyz",
    "action": "login",
    "resource_type": "auth",
    "ip_address": "192.168.1.1",
    "success": true
  }
]
```

---

### Users Endpoints

#### GET /api/users
Get all users (Admin only).

**Response:**
```json
[
  {
    "user_id": "user_abc123",
    "email": "user@example.com",
    "name": "User Name",
    "role": "site_engineer",
    "is_active": true
  }
]
```

---

#### POST /api/users
Create new user (Admin only).

**Request:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "site_engineer",
  "phone": "9876543210"
}
```

---

#### GET /api/users/{user_id}
Get user by ID.

---

#### PATCH /api/users/{user_id}
Update user details.

**Request:**
```json
{
  "name": "Updated Name",
  "phone": "9876543211"
}
```

---

#### DELETE /api/users/{user_id}
Deactivate user (Super Admin only).

---

#### PATCH /api/users/{user_id}/role
Change user role (Admin only).

**Request:**
```json
{
  "role": "project_manager"
}
```

---

#### GET /api/users/by-role/{role}
Get users by role.

---

#### GET /api/roles
Get available roles.

---

### Projects Endpoints

#### GET /api/projects
Get all projects (filtered by role).

**Query Parameters:**
- `status` (string): Filter by status
- `page` (int): Page number
- `limit` (int): Records per page

**Response:**
```json
[
  {
    "project_id": "proj_abc123",
    "name": "Villa Sunrise",
    "client_name": "Mr. Kumar",
    "location": "Coimbatore",
    "total_value": 5500000,
    "status": "in_progress",
    "created_at": "2026-01-15T10:30:00Z"
  }
]
```

---

#### POST /api/projects
Create new project.

**Request:**
```json
{
  "name": "New Project",
  "client_name": "Client Name",
  "client_email": "client@example.com",
  "client_phone": "9876543210",
  "location": "Chennai",
  "total_value": 5000000
}
```

---

#### GET /api/projects/{project_id}
Get project details.

---

#### GET /api/projects/{project_id}/comprehensive
Get comprehensive project details including financials.

**Response:**
```json
{
  "project": { ... },
  "scope_items": [ ... ],
  "payment_stages": [ ... ],
  "income": [ ... ],
  "expenses": [ ... ],
  "materials": [ ... ],
  "work_orders": [ ... ]
}
```

---

#### PATCH /api/projects/{project_id}
Update project details.

---

#### DELETE /api/projects/{project_id}
Delete project (Admin only).

---

#### GET /api/projects/{project_id}/payment-summary
Get project payment summary.

**Response:**
```json
{
  "total_value": 5500000,
  "total_received": 1650000,
  "balance": 3850000,
  "payment_stages": [ ... ]
}
```

---

#### GET /api/projects/{project_id}/expenses
Get project expenses.

---

#### GET /api/projects/{project_id}/income
Get project income.

---

### CRM & Leads Endpoints

#### GET /api/crm/pre-sales/dashboard
Get pre-sales dashboard.

**Response:**
```json
{
  "total_leads": 150,
  "new_today": 5,
  "contacted": 45,
  "qualified": 30,
  "conversion_rate": 0.2,
  "stages": [ ... ]
}
```

---

#### GET /api/crm/pre-sales/leads
Get pre-sales leads.

**Query Parameters:**
- `stage_id` (string): Filter by stage
- `assigned_to` (string): Filter by assignee

---

#### POST /api/crm/pre-sales/leads
Create new lead.

**Request:**
```json
{
  "name": "Lead Name",
  "email": "lead@example.com",
  "phone": "9876543210",
  "source": "website",
  "city": "Chennai",
  "notes": "Interested in 3BHK"
}
```

---

#### POST /api/crm/leads
Create lead (Admin only).

**Request:**
```json
{
  "name": "Lead Name",
  "email": "lead@example.com",
  "phone": "9876543210",
  "source": "website",
  "city": "Chennai",
  "sqft": 1500,
  "budget": 5000000,
  "stage_type": "pre_sales",
  "assigned_to": "user_abc123"
}
```

---

#### GET /api/crm/leads/{lead_id}
Get lead details.

---

#### PATCH /api/crm/leads/{lead_id}
Update lead.

---

#### PATCH /api/crm/leads/{lead_id}/stage
Move lead to different stage.

**Request:**
```json
{
  "stage_id": "stg_qualified"
}
```

---

#### POST /api/crm/leads/{lead_id}/remarks
Add remark to lead.

**Request:**
```json
{
  "text": "Called, interested in site visit"
}
```

---

#### POST /api/crm/leads/{lead_id}/follow-ups
Schedule follow-up.

**Request:**
```json
{
  "scheduled_at": "2026-03-10T10:00:00Z",
  "type": "call",
  "notes": "Discuss quotation"
}
```

---

#### GET /api/crm/stages
Get CRM stages.

---

#### POST /api/crm/stages
Create custom stage.

---

#### GET /api/crm/re-projects
Get Rough Estimate projects.

---

#### POST /api/crm/re-projects/{re_project_id}/submit-for-approval
Submit RE for GM approval.

---

### Financial Endpoints

#### GET /api/income
Get all income records.

**Query Parameters:**
- `project_id` (string): Filter by project
- `from_date` (string): Start date
- `to_date` (string): End date

---

#### GET /api/income/summary
Get income summary by payment method.

**Response:**
```json
{
  "total": 3500000,
  "cash": 500000,
  "cheque": 1000000,
  "bank_transfer": 1500000,
  "upi": 500000
}
```

---

#### POST /api/income
Record new income (CRE only).

**Request:**
```json
{
  "project_id": "proj_abc123",
  "amount": 500000,
  "payment_mode": "bank_transfer",
  "remarks": "Advance payment"
}
```

---

#### GET /api/expenses
Get all expenses.

**Query Parameters:**
- `project_id` (string): Filter by project
- `category` (string): Filter by category

---

#### POST /api/expenses
Record new expense.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "description": "Cement purchase",
  "amount": 50000,
  "category": "material"
}
```

---

#### GET /api/accounts/dashboard
Get accountant dashboard.

---

#### GET /api/accounts/pending-advance-payments
Get pending advance payment verifications.

---

#### PATCH /api/accounts/verify-advance-payment/{project_id}
Verify advance payment.

**Request:**
```json
{
  "transaction_id": "TXN123456",
  "bank_name": "HDFC Bank"
}
```

---

#### GET /api/accountant/petty-cash
Get petty cash requests.

---

#### PATCH /api/accountant/petty-cash/{petty_cash_id}/issue
Issue petty cash.

**Request:**
```json
{
  "amount": 5000
}
```

---

#### PATCH /api/accountant/petty-cash/{petty_cash_id}/settle
Settle petty cash after expense submission.

---

#### POST /api/accountant/record-expense
Record expense with category.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "category": "material",
  "description": "Steel rods",
  "amount": 75000,
  "payment_method": "bank_transfer",
  "vendor_name": "Steel Corp"
}
```

**Expense Categories:**
- salary, material, labour, transport, utility
- rent, marketing, office, maintenance, other

---

#### GET /api/accountant/recorded-expenses
Get recorded expenses.

---

#### GET /api/financial/suspense
Get suspense account entries.

---

#### POST /api/financial/suspense
Add suspense entry.

**Request:**
```json
{
  "transaction_type": "expense",
  "amount": 5000,
  "description": "Excess petty cash return",
  "source": "petty_cash"
}
```

---

### Procurement Endpoints

#### GET /api/procurement/dashboard
Get procurement dashboard.

---

#### GET /api/procurement/requests
Get material requests pending procurement.

---

#### POST /api/procurement/v2/select-vendor/{request_id}
Select vendor for material request.

**Request:**
```json
{
  "vendor_id": "vendor_abc123",
  "quoted_price": 50000,
  "delivery_days": 3
}
```

---

#### POST /api/procurement/v2/generate-po/{request_id}
Generate purchase order.

---

#### PATCH /api/procurement/v2/dispatch/{request_id}
Mark material as dispatched.

---

#### POST /api/procurement/v2/receive/{request_id}
Confirm material receipt.

---

#### GET /api/vendor-master
Get all vendors.

---

#### POST /api/vendor-master/v2/create
Create new vendor.

**Request:**
```json
{
  "name": "Vendor Name",
  "phone": "9876543210",
  "email": "vendor@example.com",
  "address": "123 Main St",
  "category": "material_supplier",
  "gst_number": "29ABCDE1234F1ZK"
}
```

---

#### GET /api/materials
Get material master list.

---

#### POST /api/materials
Create new material.

**Request:**
```json
{
  "name": "Cement OPC 53",
  "category": "cement",
  "unit": "bag",
  "base_price": 450
}
```

---

### Site Operations Endpoints

#### GET /api/site-engineer/my-projects
Get projects assigned to site engineer.

---

#### GET /api/site-engineer/project/{project_id}
Get project details for site engineer (no financials).

---

#### POST /api/site-engineer/material-requests
Create material request.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "material_id": "mat_xyz789",
  "quantity": 100,
  "unit": "bags",
  "required_by": "2026-03-10",
  "remarks": "Urgent for foundation work"
}
```

---

#### GET /api/site-engineer/material-requests
Get material requests.

---

#### POST /api/site-engineer/labour-requests
Create labour payment request.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "labour_type": "mason",
  "workers": 5,
  "days": 10,
  "rate": 800,
  "remarks": "Brick work for first floor"
}
```

---

#### POST /api/site-engineer/petty-cash/request
Request petty cash.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "amount_requested": 5000,
  "purpose": "Site consumables and transport"
}
```

---

#### GET /api/site-engineer/petty-cash
Get petty cash status.

---

#### POST /api/site-engineer/petty-cash/{petty_cash_id}/expense
Add expense to petty cash.

**Request:**
```json
{
  "description": "Auto fare",
  "amount": 200
}
```

---

#### POST /api/site-engineer/petty-cash/{petty_cash_id}/submit
Submit petty cash for settlement.

---

#### GET /api/work-orders
Get work orders.

---

#### POST /api/work-orders/labour
Create labour work order.

---

#### POST /api/work-orders/material
Create material work order.

---

### HR & Payroll Endpoints

#### GET /api/hr/staff
Get all staff members.

---

#### POST /api/hr/staff
Add new staff.

**Request:**
```json
{
  "name": "Staff Name",
  "designation": "Site Supervisor",
  "department": "operations",
  "base_salary": 25000,
  "phone": "9876543210"
}
```

---

#### GET /api/hr/attendance
Get attendance records.

**Query Parameters:**
- `month` (int): Month (1-12)
- `year` (int): Year

---

#### POST /api/hr/attendance
Mark attendance.

**Request:**
```json
{
  "staff_id": "staff_abc123",
  "date": "2026-03-04",
  "status": "present",
  "overtime_hours": 2
}
```

---

#### GET /api/hr/payroll
Get payroll records.

---

#### POST /api/hr/payroll/generate
Generate monthly payroll.

**Request:**
```json
{
  "month": 3,
  "year": 2026
}
```

---

#### PATCH /api/hr/payroll/{payroll_id}/approve
Approve payroll (Admin).

---

#### PATCH /api/hr/payroll/{payroll_id}/pay
Mark payroll as paid.

---

### Settings Endpoints

#### GET /api/settings/company
Get company settings.

**Response:**
```json
{
  "company_name": "Urban Space Builders",
  "logo_url": "https://...",
  "address": "123 Main St, Chennai",
  "phone": "044-12345678",
  "email": "info@urbanspace.com",
  "gst_number": "33ABCDE1234F1ZK"
}
```

---

#### POST /api/settings/company
Create company settings (first time).

---

#### PATCH /api/settings/company
Update company settings.

---

#### GET /api/settings/summary
Get all settings summary.

---

### Marketing Endpoints

#### GET /api/marketing/dashboard
Get marketing dashboard with lead distribution.

---

#### GET /api/marketing/distribution-settings
Get lead distribution settings.

---

#### PATCH /api/marketing/distribution-settings
Update distribution settings.

**Request:**
```json
{
  "enabled": true,
  "method": "round_robin"
}
```

---

#### GET /api/marketing/all-leads
Get all leads for marketing.

**Query Parameters:**
- `search` (string): Search query
- `stage_type` (string): pre_sales or sales
- `source` (string): Lead source

---

#### POST /api/marketing/assign-lead/{lead_id}
Manually assign lead.

**Request:**
```json
{
  "user_id": "user_abc123"
}
```

---

#### DELETE /api/marketing/leads/{lead_id}
Delete lead (Marketing Head only).

---

### Project Manager Endpoints

#### GET /api/pm/dashboard
Get PM dashboard.

**Response:**
```json
{
  "total_projects": 5,
  "pending_material_requests": 3,
  "pending_labour_requests": 2,
  "team_members": [ ... ]
}
```

---

#### GET /api/pm/projects
Get PM's projects.

---

#### GET /api/pm/material-requests
Get material requests pending PM approval.

---

#### GET /api/pm/labour-requests
Get labour requests pending PM verification.

---

#### POST /api/pm/assign-team
Assign team member to project.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "user_id": "user_xyz789",
  "role": "site_engineer"
}
```

---

### CRE Endpoints

#### GET /api/cre/dashboard
Get CRE dashboard.

---

#### GET /api/cre/new-deals
Get new deals (converted leads + approved REs).

---

#### POST /api/cre/convert-deal/{lead_id}
Convert lead to project.

---

#### POST /api/cre/projects
Create new project directly.

---

#### PATCH /api/cre/projects/{project_id}/send-to-planning
Send project to planning team.

---

#### GET /api/cre/payment-requests
Get pending payment requests.

---

### Planning Endpoints

#### GET /api/planning/dashboard
Get planning dashboard.

---

#### GET /api/planning/projects
Get projects in planning.

---

#### PATCH /api/planning/projects/{project_id}/submit-for-approval
Submit project for GM approval.

---

#### GET /api/planning/stage-dashboard
Get project stages dashboard.

---

#### PATCH /api/planning/projects/{project_id}/update-stage
Update project planning stage.

**Request:**
```json
{
  "stage": "drawing",
  "notes": "Structural drawing started"
}
```

---

### Admin Endpoints

#### GET /api/admin/dashboard-summary
Get admin dashboard summary.

---

#### GET /api/admin/financial-overview
Get financial overview.

---

#### GET /api/approvals/pending
Get all pending approvals.

---

#### GET /api/approvals/projects
Get projects pending approval.

---

#### PATCH /api/approvals/projects/{project_id}/gm-approve
GM approval for project.

---

#### PATCH /api/approvals/projects/{project_id}/final-approve
Final approval for project.

---

### Google Sheets Integration

#### GET /api/sheets/config
Get Google Sheets configuration status.

---

#### GET /api/sheets/oauth/login
Initiate Google OAuth for Sheets access.

---

#### POST /api/sheets/preview
Preview data from a spreadsheet.

**Request:**
```json
{
  "spreadsheet_id": "1abc...",
  "sheet_name": "Leads"
}
```

---

#### POST /api/sheets/import
Import data from spreadsheet.

**Request:**
```json
{
  "spreadsheet_id": "1abc...",
  "sheet_name": "Leads",
  "column_mapping": {
    "A": "name",
    "B": "email",
    "C": "phone"
  }
}
```

---

## Webhooks (Coming Soon)

Webhook support for real-time event notifications is planned for v1.1.

**Planned Events:**
- `project.created`
- `project.status_changed`
- `payment.received`
- `lead.created`
- `lead.converted`

---

## SDKs & Libraries

Official SDKs coming soon:
- Python SDK
- JavaScript/TypeScript SDK

---

## Changelog

### v1.0.0 (March 2026)
- Initial API release
- 370+ endpoints
- Session-based authentication
- RBAC with 11 roles
- Security features (rate limiting, validation)

---

## Support

**API Support:** api-support@urbanspacebuilders.com  
**Documentation Issues:** docs@urbanspacebuilders.com  

---

*© 2026 Urban Space Builders Tech. All rights reserved.*
