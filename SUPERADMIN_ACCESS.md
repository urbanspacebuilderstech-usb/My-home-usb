# 🔐 ConstructionOS - Super Admin Access Guide

## Quick Access

**Web Portal:** https://build-crm-os.preview.emergentagent.com  
**Super Admin Email:** admin@constructionos.com  
**API Token:** `superadmin_demo_1768204210044`

---

## 📊 Your Dashboard Overview

- **Total Projects:** 1 (Classic Condo - ₹60L)
- **Total Received:** ₹25L
- **Balance:** ₹25L
- **Total BOQ Budget:** ₹7.95L (across all items)
- **Active Work Orders:** 2 (1 submitted, 1 approved)

---

## 👥 System Users (8 Total)

| Name | Role | Email | Access Level |
|------|------|-------|--------------|
| **Super Admin** | super_admin | admin@constructionos.com | Full access |
| Priya Sharma | accountant | accountant@constructionos.com | Approvals, Expenses |
| Rajesh Kumar | project_manager | pm@constructionos.com | Projects, Work Orders |
| Amit Patel | planning | planning@constructionos.com | BOQ Management |
| Sneha Reddy | procurement | procurement@constructionos.com | Purchase Orders |
| Vikram Singh | site_engineer | engineer@constructionos.com | Site Receipts |
| Mr. Raj | client | raj@client.com | Read-only Portal |
| Urban Space Tech | client | urbanspacebuilderstech@gmail.com | Read-only Portal |

---

## 🏢 Active Projects

### Classic Condo
- **Client:** Mr. Raj
- **Location:** Perumbakkam, Chennai
- **Total Value:** ₹60,00,000
- **Status:** Active
- **Start Date:** Dec 13, 2025
- **Completion:** Nov 8, 2026

**BOQ Breakdown:**
- Sand (M-Sand): 10 Loads × ₹18,000 = ₹1,80,000
- Cement (UltraTech): 500 Bags × ₹420 = ₹2,10,000
- Steel TMT Bars: 5 Tons × ₹65,000 = ₹3,25,000
- Mason Labour: 100 Days × ₹800 = ₹80,000
- **Total BOQ:** ₹7,95,000

---

## 📋 Work Orders

### WO-wo_sand001 (Submitted - Awaiting Approval)
- **Item:** Sand (1 Load)
- **Purpose:** Foundation work - First load of M-Sand for site leveling
- **Amount:** ₹18,000
- **Status:** Submitted (Accountant needs to approve)

### WO-wo_5f1e1905081e (Approved)
- **Item:** Steel TMT Bars (1 Ton)
- **Purpose:** Foundation reinforcement
- **Amount:** ₹65,000
- **Status:** Approved
- **PO Created:** po_c0967f483bac (Assigned to Sri Balaji Sand Suppliers)

---

## 🏪 Vendors

### Sri Balaji Sand Suppliers
- **Contact:** Balaji
- **Phone:** +91 9876501234
- **Email:** balaji@sandSuppliers.com
- **Location:** Chengalpattu, Tamil Nadu

---

## ⚡ Super Admin Capabilities

### What You Can Do:

**✅ Project Management**
- Create new projects
- Edit existing projects
- View all project details
- Access project dashboards

**✅ User Management**
- Create new users
- Assign/change user roles
- View all user details
- Manage permissions

**✅ Financial Control**
- View super admin dashboard
- See all expenses
- Access all payment records
- Monitor project budgets
- Override BOQ limits (if needed)

**✅ Workflow Management**
- View all work orders (any status)
- See approval history
- Access audit logs
- Monitor procurement

**✅ Full System Access**
- No restrictions on any module
- Can perform actions of any role
- Access client portal data
- View all notifications

---

## 🚀 Quick Start Guide

### Option 1: Web Interface (Recommended)

1. Go to: https://build-crm-os.preview.emergentagent.com
2. Click "Sign In with Google"
3. Use email: **admin@constructionos.com**
4. Authenticate via Google OAuth
5. You'll be redirected to the Super Admin Dashboard

### Option 2: Direct API Access

Use the session token for instant API access:

```bash
# Set your token
TOKEN="superadmin_demo_1768204210044"
API="https://build-crm-os.preview.emergentagent.com/api"

# Get your profile
curl -H "Authorization: Bearer $TOKEN" "$API/auth/me"

# View dashboard
curl -H "Authorization: Bearer $TOKEN" "$API/dashboards/super-admin"

# List all projects
curl -H "Authorization: Bearer $TOKEN" "$API/projects"

# List all users
curl -H "Authorization: Bearer $TOKEN" "$API/users"
```

---

## 📱 Common Tasks

### Create a New Project

```bash
curl -X POST "$API/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Residential Complex",
    "client_name": "ABC Developers",
    "location": "Velachery, Chennai",
    "total_value": 8000000,
    "start_date": "2026-02-01T00:00:00Z",
    "expected_completion": "2027-01-31T00:00:00Z",
    "status": "planning"
  }'
```

### Create a New User

```bash
curl -X POST "$API/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "New User",
    "role": "accountant",
    "phone": "+91 9876543999",
    "created_at": "2026-01-12T00:00:00Z"
  }'
```

### Approve a Work Order (as Accountant)

```bash
curl -X PATCH "$API/work-orders/wo_sand001/approve" \
  -H "Authorization: Bearer $TOKEN"
```

### View Project Dashboard

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/dashboards/project/proj_classic001"
```

---

## 🗂️ All Available Endpoints

### Authentication
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details

### BOQ
- `GET /api/boq/{project_id}` - Get BOQ items
- `POST /api/boq` - Create BOQ item

### Work Orders
- `GET /api/work-orders` - List all work orders
- `POST /api/work-orders` - Create work order
- `PATCH /api/work-orders/{id}/submit` - Submit
- `PATCH /api/work-orders/{id}/approve` - Approve
- `PATCH /api/work-orders/{id}/reject` - Reject

### Users
- `GET /api/users` - List all users (Super Admin only)
- `POST /api/users` - Create user
- `PATCH /api/users/{id}/role` - Update role

### Vendors
- `GET /api/vendors` - List vendors
- `POST /api/vendors` - Create vendor

### Purchase Orders
- `GET /api/purchase-orders` - List POs
- `POST /api/purchase-orders` - Create PO

### Site Receipts
- `POST /api/site-receipts/upload-image` - Upload image
- `GET /api/site-receipts/image/{id}` - Get image
- `POST /api/site-receipts` - Submit receipt

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense

### Dashboards
- `GET /api/dashboards/super-admin` - Super admin metrics
- `GET /api/dashboards/project/{id}` - Project metrics

### Client Portal
- `GET /api/client-portal/project/{id}` - Client view

### Photos & Documents
- `POST /api/site-photos/upload` - Upload photo
- `GET /api/site-photos/{project_id}` - Get photos
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/{project_id}` - Get documents
- `GET /api/files/{file_id}` - Download file

### Notifications
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/{id}/read` - Mark read

---

## 🔍 Demo Script

Run the complete super admin demo:

```bash
/app/superadmin_demo.sh
```

This will show you:
- Your authentication details
- Dashboard metrics
- All projects
- All users
- Work orders
- Vendors
- BOQ summary
- Available capabilities

---

## 📞 Need Help?

**Documentation:**
- `/app/README.md` - Quick start guide
- `/app/PROJECT_DOCUMENTATION.md` - Complete documentation
- `/app/auth_testing.md` - Authentication testing guide

**Logs:**
- Backend: `/var/log/supervisor/backend.err.log`
- Frontend: Browser console

**Database:**
- MongoDB: `mongosh test_database`

---

## 🎯 Next Steps

1. **Explore the Dashboard:** Login and see all metrics
2. **Create a New Project:** Test project creation
3. **Manage Users:** Create users for different roles
4. **Test Workflow:** Follow the complete work order flow
5. **Upload Photos:** Test the enhanced client portal

---

**Token Expiry:** 7 days from creation (Jan 19, 2026)  
**Support:** All features are functional and ready to use!

🏗️ **Happy Building!**
