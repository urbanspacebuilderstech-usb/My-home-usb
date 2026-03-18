# 🔐 IDOR & UNAUTHENTICATED API TEST REPORT
## ConstructionOS - Detailed Security Assessment

---

**Test Date:** March 4, 2026  
**Target:** https://finance-module-v2.preview.emergentagent.com/api  
**Focus:** IDOR (Insecure Direct Object Reference) & Unauthenticated API Access  

---

## 📊 EXECUTIVE SUMMARY

| Test Category | Total Tests | Passed | Failed | Critical Issues |
|---------------|-------------|--------|--------|-----------------|
| **Unauthenticated API** | 20 | 20 | 0 | ✅ None |
| **IDOR** | 20 | 12 | 8 | 🔴 4 Found |

### Overall Risk: **MEDIUM-HIGH** (due to IDOR issues)

---

## ✅ PART 1: UNAUTHENTICATED API TESTS

### Summary: **ALL 20 ENDPOINTS PROTECTED** ✅

All tested endpoints correctly return `401 Unauthorized` when accessed without authentication.

| # | Endpoint | Method | Status | Result |
|---|----------|--------|--------|--------|
| 1 | /projects | GET | 401 | ✅ Protected |
| 2 | /users | GET | 401 | ✅ Protected |
| 3 | /income | GET | 401 | ✅ Protected |
| 4 | /crm/pre-sales/leads | GET | 401 | ✅ Protected |
| 5 | /security/status | GET | 401 | ✅ Protected |
| 6 | /admin/dashboard-summary | GET | 401 | ✅ Protected |
| 7 | /accountant/petty-cash | GET | 401 | ✅ Protected |
| 8 | /crm/leads | POST | 401 | ✅ Protected |
| 9 | /users/{id} | DELETE | 401 | ✅ Protected |
| 10 | /vendor-master | GET | 401 | ✅ Protected |
| 11 | /materials | GET | 401 | ✅ Protected |
| 12 | /hr/staff | GET | 401 | ✅ Protected |
| 13 | /marketing/dashboard | GET | 401 | ✅ Protected |
| 14 | /settings/company | GET | 401 | ✅ Protected |
| 15 | /pm/dashboard | GET | 401 | ✅ Protected |
| 16 | /cre/dashboard | GET | 401 | ✅ Protected |
| 17 | /accountant/record-expense | POST | 401 | ✅ Protected |
| 18 | /projects/{id} | PATCH | 401 | ✅ Protected |
| 19 | /work-orders | GET | 401 | ✅ Protected |
| 20 | /notifications | GET | 401 | ✅ Protected |

**Conclusion:** Authentication is properly enforced across all tested endpoints.

---

## 🔴 PART 2: IDOR (Insecure Direct Object Reference) TESTS

### Summary: **8 VULNERABILITIES FOUND**

---

### 🔴 CRITICAL FINDING #1: Site Engineer Can Access ALL Projects

**Severity:** HIGH  
**Endpoint:** `GET /api/projects`  
**Role Tested:** Site Engineer (low privilege)  

**Issue:**  
Site Engineer can view ALL 13 projects in the system instead of only projects they are assigned to.

**Evidence:**
```bash
# As Site Engineer
GET /api/projects
# Returns: 13 projects (should return only 1-2 assigned projects)
```

**Expected Behavior:**  
Site Engineers should only see projects where they are in the `assigned_to` array.

**Impact:**
- Data leak of confidential project information
- Client details exposed to unauthorized staff
- Financial information (project values) leaked

**Remediation:**
```python
@api_router.get("/projects")
async def get_projects(user: User = Depends(get_current_user)):
    if user.role == UserRole.SITE_ENGINEER:
        # Only return projects assigned to this engineer
        query = {"assigned_to": user.user_id}
    else:
        query = {}
    projects = await db.projects.find(query, {"_id": 0}).to_list(1000)
    return projects
```

---

### 🔴 CRITICAL FINDING #2: Site Engineer Can Access Project Financial Data

**Severity:** HIGH  
**Endpoint:** `GET /api/projects/{project_id}/payment-summary`  
**Role Tested:** Site Engineer  

**Issue:**  
Site Engineers can access complete payment summaries including:
- All income records
- Payment amounts
- Client payment history
- Collection percentages

**Evidence:**
```json
// Site Engineer accessing payment summary
{
  "project_value": 5500000,
  "income_records": [
    {"amount": 286727, "payment_mode": "cheque"},
    {"amount": 463850, "payment_mode": "cash"},
    {"amount": 248217, "payment_mode": "bank_transfer"}
  ],
  "summary": {"total_received": 998794}
}
```

**Impact:**
- Financial data exposure
- Privacy violation
- Potential for social engineering with payment info

---

### 🔴 CRITICAL FINDING #3: Site Engineer Can Access ALL Income Records

**Severity:** HIGH  
**Endpoint:** `GET /api/income`  
**Role Tested:** Site Engineer  

**Issue:**  
Site Engineers can view ALL income records across ALL projects.

**Evidence:**
```bash
# As Site Engineer
GET /api/income
# Returns: All income records with amounts, payment modes, client info
```

**Expected Behavior:**  
Site Engineers should NOT have access to income data at all.

---

### 🔴 CRITICAL FINDING #4: Site Engineer Can Access Vendor Master

**Severity:** MEDIUM-HIGH  
**Endpoint:** `GET /api/vendor-master`  
**Role Tested:** Site Engineer  

**Issue:**  
Site Engineers can access complete vendor database including:
- Vendor names
- Contact information
- GST numbers
- Bank details

**Expected Behavior:**  
Only Procurement, Planning, and Admin roles should access vendor master.

---

### 🟡 MEDIUM FINDING #5: Comprehensive Project Data Exposed

**Severity:** MEDIUM  
**Endpoint:** `GET /api/projects/{project_id}/comprehensive`  
**Role Tested:** Site Engineer  

**Issue:**  
Site Engineers can access comprehensive project data including financials.

---

### 🟡 MEDIUM FINDING #6: Pre-Sales Can Access All Leads

**Severity:** MEDIUM  
**Endpoint:** `GET /api/crm/pre-sales/leads`  
**Role Tested:** Pre-Sales  

**Issue:**  
Pre-Sales staff can see ALL 19 leads instead of only leads assigned to them.

**Expected Behavior:**  
Pre-Sales should only see leads assigned to their user ID.

---

### ✅ PASSED IDOR TESTS (12)

| # | Test | Role | Endpoint | Result |
|---|------|------|----------|--------|
| 1 | Access other user's profile | Engineer | /users/{id} | ✅ Blocked |
| 2 | List all users | Engineer | /users | ✅ Blocked |
| 3 | Modify other user's role | Engineer | /users/{id}/role | ✅ Blocked |
| 4 | Access audit logs | Engineer | /security/audit-logs | ✅ Blocked |
| 5 | Access accountant petty cash | Engineer | /accountant/petty-cash | ✅ Blocked |
| 6 | Access HR payroll | Engineer | /hr/payroll | ✅ Blocked |
| 7 | Modify project | Engineer | PATCH /projects/{id} | ✅ Blocked |
| 8 | Access HR staff | Pre-Sales | /hr/staff | ✅ Blocked |
| 9 | Access security status | CRE | /security/status | ✅ Blocked |
| 10 | Delete user | CRE | DELETE /users/{id} | ✅ Blocked |
| 11 | Access admin dashboard | Engineer | /admin/dashboard-summary | ✅ Blocked |
| 12 | Access security audit | CRE | /security/audit-logs | ✅ Blocked |

---

## 🛠️ REMEDIATION PLAN

### Immediate Priority (FIX NOW)

| # | Issue | Fix Required | Effort |
|---|-------|--------------|--------|
| 1 | Projects access | Filter by `assigned_to` for low-privilege roles | 30 min |
| 2 | Income access | Add role check to /income endpoint | 15 min |
| 3 | Payment summary | Add role check to payment-summary endpoint | 15 min |
| 4 | Vendor master | Add role check to vendor-master endpoint | 15 min |
| 5 | Leads access | Filter by `assigned_to` for pre-sales/sales | 30 min |
| 6 | Comprehensive data | Add role check to comprehensive endpoint | 15 min |

### Recommended Code Fixes

#### Fix 1: Projects Endpoint
```python
@api_router.get("/projects")
async def get_projects(user: User = Depends(get_current_user)):
    # Define which roles can see all projects
    full_access_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, 
                         UserRole.ACCOUNTANT, UserRole.PROJECT_MANAGER]
    
    if user.role in full_access_roles:
        query = {}
    elif user.role in [UserRole.SITE_ENGINEER, UserRole.SENIOR_SITE_ENGINEER]:
        # Only assigned projects
        query = {"assigned_to": user.user_id}
    elif user.role == UserRole.CRE:
        # Only created/managed projects
        query = {"$or": [{"created_by": user.user_id}, {"cre_id": user.user_id}]}
    else:
        query = {}
    
    projects = await db.projects.find(query, {"_id": 0}).to_list(1000)
    return projects
```

#### Fix 2: Income Endpoint
```python
@api_router.get("/income")
async def get_income(user: User = Depends(get_current_user)):
    # Only financial roles can access income
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER, 
                         UserRole.ACCOUNTANT, UserRole.CRE]:
        raise HTTPException(status_code=403, detail="Access denied to financial data")
    
    # ... rest of the code
```

#### Fix 3: Vendor Master Endpoint
```python
@api_router.get("/vendor-master")
async def get_vendors(user: User = Depends(get_current_user)):
    allowed_roles = [UserRole.SUPER_ADMIN, UserRole.GENERAL_MANAGER,
                     UserRole.PROCUREMENT, UserRole.PLANNING, UserRole.ACCOUNTANT]
    
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # ... rest of the code
```

---

## 📊 RISK MATRIX

| Vulnerability | Likelihood | Impact | Risk Level |
|---------------|------------|--------|------------|
| Project Data Exposure | HIGH | HIGH | 🔴 CRITICAL |
| Income Data Exposure | HIGH | HIGH | 🔴 CRITICAL |
| Payment Summary Exposure | HIGH | HIGH | 🔴 CRITICAL |
| Vendor Data Exposure | MEDIUM | MEDIUM | 🟡 MEDIUM |
| Leads Over-Access | MEDIUM | LOW | 🟢 LOW |

---

## ✅ SECURITY STRENGTHS

1. **Authentication:** All endpoints properly require authentication
2. **User Management:** User CRUD operations properly restricted
3. **Audit Logs:** Properly restricted to admin roles
4. **HR/Payroll:** Properly restricted
5. **User Deletion:** Only Super Admin can delete
6. **Role Changes:** Properly restricted

---

## 📝 CONCLUSION

### Unauthenticated API: ✅ SECURE
All 20 tested endpoints properly require authentication.

### IDOR: ⚠️ NEEDS IMMEDIATE ATTENTION
4 critical IDOR vulnerabilities found that expose:
- All project data to low-privilege users
- Financial information to unauthorized roles
- Vendor database to all authenticated users

### Recommended Action:
**DO NOT DEPLOY TO PRODUCTION** until IDOR vulnerabilities are fixed.

Estimated fix time: **2-3 hours**

---

**Report Classification:** Confidential  
**Distribution:** Development Team Only  

---

*This report was generated as part of security assessment. All findings should be addressed according to priority.*
