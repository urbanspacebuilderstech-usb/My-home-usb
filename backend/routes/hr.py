"""
HR Admin Module - Comprehensive HR Management
Features:
- Employee self check-in/check-out with GPS
- Leave management (apply + approve)
- Late tracking with configurable department timings
- Salary auto-calculation from attendance
- Digital payslip generation
- HR Settings (department timings, leave limits)
"""
import uuid
import calendar
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from pydantic import BaseModel, Field
from core.database import db
from core.deps import get_current_user
from core.models import User, UserRole

router = APIRouter()

# ==================== PYDANTIC MODELS ====================

class HRSettingsUpdate(BaseModel):
    department_timings: Optional[Dict] = None
    leave_limits: Optional[Dict] = None
    company_name: Optional[str] = None
    company_address: Optional[str] = None

class CheckInRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

class CheckOutRequest(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None

class LeaveRequest(BaseModel):
    leave_type: str  # PL, SL, CL, WFH
    start_date: str  # ISO date string
    end_date: str
    reason: Optional[str] = None
    is_half_day: bool = False

class LeaveActionRequest(BaseModel):
    action: str  # approve, reject
    remarks: Optional[str] = None

class AdminAttendanceMarkRequest(BaseModel):
    staff_id: str
    date: str  # ISO date
    status: str  # P, PL, SL, CL, WFH, Halfday, A
    remarks: Optional[str] = None

class SalaryCalculateRequest(BaseModel):
    month: int
    year: int

class StaffUpdateExtended(BaseModel):
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    blood_group: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    children_details: Optional[str] = None
    permanent_address: Optional[str] = None
    current_address: Optional[str] = None
    qualification: Optional[str] = None
    previous_experience_years: Optional[float] = None
    total_experience_years: Optional[float] = None
    aadhar_number: Optional[str] = None
    pan_number: Optional[str] = None
    uan_number: Optional[str] = None
    esi_number: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    probation_period_months: Optional[int] = None
    work_location: Optional[str] = None
    reporting_manager: Optional[str] = None
    previous_employer: Optional[str] = None
    notice_period_date: Optional[str] = None
    last_working_day: Optional[str] = None
    reason_for_exit: Optional[str] = None
    rehire_eligibility: Optional[str] = None
    ctc: Optional[float] = None
    pa: Optional[float] = None
    fa: Optional[float] = None
    loan_balance: Optional[float] = None

HR_ROLES = [UserRole.SUPER_ADMIN, UserRole.HR]


# ==================== HR SETTINGS ====================

@router.get("/hr/settings")
async def get_hr_settings(user: User = Depends(get_current_user)):
    """Get HR settings (department timings, leave limits)"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})
    if not settings:
        settings = {
            "settings_id": "hr_global",
            "company_name": "Urbanspace Builders",
            "company_address": "Door No. D2, 17, 1st street, soumya Nagar, Perumbakkam, Chennai- 600100",
            "department_timings": {
                "default": {"start": "09:00", "end": "18:00", "grace_minutes": 15},
                "Engineering": {"start": "09:00", "end": "18:00", "grace_minutes": 15},
                "Accounts": {"start": "10:00", "end": "19:00", "grace_minutes": 10},
                "HR": {"start": "10:00", "end": "19:00", "grace_minutes": 10},
                "Admin": {"start": "10:00", "end": "19:00", "grace_minutes": 10},
                "Sales": {"start": "09:30", "end": "18:30", "grace_minutes": 15},
            },
            "leave_limits": {
                "PL": {"name": "Paid Leave", "annual_limit": 12, "carry_forward": True},
                "SL": {"name": "Sick Leave", "annual_limit": 12, "carry_forward": False},
                "CL": {"name": "Casual Leave", "annual_limit": 6, "carry_forward": False},
                "WFH": {"name": "Work From Home", "annual_limit": 24, "carry_forward": False},
            },
            "salary_structure": {
                "earnings": ["Basic Earned", "HRA", "PA", "FA"],
                "deductions": ["LOP", "Loan", "LD"]
            }
        }
        await db.hr_settings.insert_one(settings)
        settings.pop("_id", None)
    return settings


@router.patch("/hr/settings")
async def update_hr_settings(data: HRSettingsUpdate, user: User = Depends(get_current_user)):
    """Update HR settings"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    update = {}
    if data.department_timings is not None:
        update["department_timings"] = data.department_timings
    if data.leave_limits is not None:
        update["leave_limits"] = data.leave_limits
    if data.company_name is not None:
        update["company_name"] = data.company_name
    if data.company_address is not None:
        update["company_address"] = data.company_address
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.hr_settings.update_one({"settings_id": "hr_global"}, {"$set": update}, upsert=True)
    return {"status": "updated"}


# ==================== EMPLOYEE CHECK-IN/CHECK-OUT ====================

@router.post("/hr/check-in")
async def employee_check_in(data: CheckInRequest, user: User = Depends(get_current_user)):
    """Employee self check-in with GPS location"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="No staff profile linked to your account. Contact HR.")

    existing = await db.attendance.find_one({
        "staff_id": staff["staff_id"],
        "date": today
    }, {"_id": 0})
    if existing and existing.get("check_in"):
        raise HTTPException(status_code=400, detail="Already checked in today")

    now = datetime.now(timezone.utc)
    dept = staff.get("department", "default")
    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})
    dept_timing = {}
    if settings:
        timings = settings.get("department_timings", {})
        dept_timing = timings.get(dept, timings.get("default", {"start": "09:00", "grace_minutes": 15}))

    expected_start = dept_timing.get("start", "09:00")
    grace = dept_timing.get("grace_minutes", 15)
    h, m = map(int, expected_start.split(":"))
    expected_time = now.replace(hour=h, minute=m, second=0, microsecond=0)
    grace_time = expected_time + timedelta(minutes=grace)
    late_minutes = 0
    is_late = False
    if now > grace_time:
        late_minutes = int((now - expected_time).total_seconds() / 60)
        is_late = True

    att_data = {
        "attendance_id": f"att_{uuid.uuid4().hex[:12]}",
        "staff_id": staff["staff_id"],
        "staff_name": staff.get("name"),
        "date": today,
        "check_in": now.isoformat(),
        "check_in_location": {
            "latitude": data.latitude,
            "longitude": data.longitude,
            "address": data.address
        } if data.latitude else None,
        "check_out": None,
        "status": "present",
        "is_late": is_late,
        "late_minutes": late_minutes,
        "work_hours": 0,
        "recorded_by": user.user_id,
        "created_at": now.isoformat()
    }

    if existing:
        await db.attendance.update_one(
            {"staff_id": staff["staff_id"], "date": today},
            {"$set": {"check_in": now.isoformat(), "check_in_location": att_data["check_in_location"],
                       "is_late": is_late, "late_minutes": late_minutes, "status": "present"}}
        )
    else:
        await db.attendance.insert_one(att_data)

    att_data.pop("_id", None)
    return {"status": "checked_in", "time": now.isoformat(), "is_late": is_late, "late_minutes": late_minutes}


@router.post("/hr/check-out")
async def employee_check_out(data: CheckOutRequest, user: User = Depends(get_current_user)):
    """Employee self check-out with GPS location"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="No staff profile linked to your account.")

    existing = await db.attendance.find_one({
        "staff_id": staff["staff_id"],
        "date": today
    }, {"_id": 0})
    if not existing or not existing.get("check_in"):
        raise HTTPException(status_code=400, detail="You haven't checked in today")
    if existing.get("check_out"):
        raise HTTPException(status_code=400, detail="Already checked out today")

    now = datetime.now(timezone.utc)
    check_in_time = datetime.fromisoformat(existing["check_in"].replace("Z", "+00:00")) if isinstance(existing["check_in"], str) else existing["check_in"]
    work_hours = round((now - check_in_time).total_seconds() / 3600, 2)

    update_data = {
        "check_out": now.isoformat(),
        "check_out_location": {
            "latitude": data.latitude,
            "longitude": data.longitude,
            "address": data.address
        } if data.latitude else None,
        "work_hours": work_hours
    }
    await db.attendance.update_one(
        {"staff_id": staff["staff_id"], "date": today},
        {"$set": update_data}
    )
    return {"status": "checked_out", "time": now.isoformat(), "work_hours": work_hours}


@router.get("/hr/my-attendance")
async def get_my_attendance(month: Optional[int] = None, year: Optional[int] = None, user: User = Depends(get_current_user)):
    """Get current user's attendance"""
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        return []
    query = {"staff_id": staff["staff_id"]}
    if month and year:
        start = f"{year}-{str(month).zfill(2)}-01"
        end_month = month + 1 if month < 12 else 1
        end_year = year if month < 12 else year + 1
        end = f"{end_year}-{str(end_month).zfill(2)}-01"
        query["date"] = {"$gte": start, "$lt": end}
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return {"staff": staff, "attendance": records}


@router.get("/hr/my-status")
async def get_my_checkin_status(user: User = Depends(get_current_user)):
    """Get today's check-in status for current user"""
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        return {"has_staff_profile": False, "checked_in": False, "checked_out": False}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    att = await db.attendance.find_one({"staff_id": staff["staff_id"], "date": today}, {"_id": 0})
    return {
        "has_staff_profile": True,
        "staff_id": staff["staff_id"],
        "staff_name": staff.get("name"),
        "checked_in": bool(att and att.get("check_in")),
        "checked_out": bool(att and att.get("check_out")),
        "check_in_time": att.get("check_in") if att else None,
        "check_out_time": att.get("check_out") if att else None,
        "is_late": att.get("is_late", False) if att else False,
        "late_minutes": att.get("late_minutes", 0) if att else 0,
        "work_hours": att.get("work_hours", 0) if att else 0
    }


# ==================== ADMIN ATTENDANCE MANAGEMENT ====================

@router.post("/hr/attendance/mark")
async def admin_mark_attendance(data: AdminAttendanceMarkRequest, user: User = Depends(get_current_user)):
    """HR Admin marks attendance for an employee"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    staff = await db.staff.find_one({"staff_id": data.staff_id}, {"_id": 0, "name": 1, "staff_id": 1})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    existing = await db.attendance.find_one({"staff_id": data.staff_id, "date": data.date}, {"_id": 0})

    status_map = {
        "P": "present", "PL": "paid_leave", "SL": "sick_leave",
        "CL": "casual_leave", "WFH": "wfh", "Halfday": "half_day", "A": "absent"
    }
    leave_types = {"PL": "PL", "SL": "SL", "CL": "CL", "WFH": "WFH"}

    att_status = status_map.get(data.status, "present")
    leave_type = leave_types.get(data.status)

    if existing:
        await db.attendance.update_one(
            {"staff_id": data.staff_id, "date": data.date},
            {"$set": {"status": att_status, "leave_type": leave_type, "remarks": data.remarks,
                       "marked_by": user.user_id, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        att_data = {
            "attendance_id": f"att_{uuid.uuid4().hex[:12]}",
            "staff_id": data.staff_id,
            "staff_name": staff.get("name"),
            "date": data.date,
            "check_in": None,
            "check_out": None,
            "status": att_status,
            "leave_type": leave_type,
            "is_late": False,
            "late_minutes": 0,
            "work_hours": 8 if att_status == "present" else (4 if att_status == "half_day" else 0),
            "remarks": data.remarks,
            "recorded_by": user.user_id,
            "marked_by": user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.attendance.insert_one(att_data)
    return {"status": "marked"}


@router.get("/hr/attendance/monthly")
async def get_monthly_attendance(month: int, year: int, user: User = Depends(get_current_user)):
    """Get monthly attendance for all staff (calendar view)"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    start = f"{year}-{str(month).zfill(2)}-01"
    end_month = month + 1 if month < 12 else 1
    end_year = year if month < 12 else year + 1
    end = f"{end_year}-{str(end_month).zfill(2)}-01"

    staff_list = await db.staff.find({"status": "active"}, {"_id": 0, "staff_id": 1, "name": 1, "department": 1, "employee_code": 1}).sort("name", 1).to_list(500)
    attendance = await db.attendance.find({"date": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(5000)

    att_map = {}
    for a in attendance:
        key = f"{a['staff_id']}_{a['date']}"
        att_map[key] = a

    days_in_month = calendar.monthrange(year, month)[1]
    result = []
    for s in staff_list:
        days = {}
        present = 0
        absent = 0
        half_days = 0
        leaves = 0
        late_count = 0
        total_late_mins = 0
        wfh = 0
        for d in range(1, days_in_month + 1):
            date_str = f"{year}-{str(month).zfill(2)}-{str(d).zfill(2)}"
            key = f"{s['staff_id']}_{date_str}"
            att = att_map.get(key)
            if att:
                days[str(d)] = {
                    "status": att.get("status", "present"),
                    "check_in": att.get("check_in"),
                    "check_out": att.get("check_out"),
                    "is_late": att.get("is_late", False),
                    "late_minutes": att.get("late_minutes", 0),
                    "work_hours": att.get("work_hours", 0),
                    "leave_type": att.get("leave_type"),
                }
                st = att.get("status", "")
                if st == "present":
                    present += 1
                elif st == "half_day":
                    half_days += 1
                    present += 0.5
                elif st == "absent":
                    absent += 1
                elif st in ("paid_leave", "sick_leave", "casual_leave"):
                    leaves += 1
                elif st == "wfh":
                    wfh += 1
                    present += 1
                if att.get("is_late"):
                    late_count += 1
                    total_late_mins += att.get("late_minutes", 0)
        result.append({
            "staff_id": s["staff_id"],
            "name": s["name"],
            "employee_code": s.get("employee_code"),
            "department": s.get("department"),
            "days": days,
            "summary": {
                "present": present,
                "absent": absent,
                "half_days": half_days,
                "leaves": leaves,
                "wfh": wfh,
                "late_count": late_count,
                "total_late_minutes": total_late_mins,
                "working_days": days_in_month
            }
        })
    return {"month": month, "year": year, "days_in_month": days_in_month, "staff": result}



@router.get("/hr/attendance/daily")
async def get_daily_attendance(date: str = None, user: User = Depends(get_current_user)):
    """Get daily attendance for all staff with summary cards"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    staff_list = await db.staff.find(
        {"status": "active"},
        {"_id": 0, "staff_id": 1, "name": 1, "department": 1, "designation": 1, "employee_code": 1, "phone": 1}
    ).sort("name", 1).to_list(500)

    attendance_records = await db.attendance.find(
        {"date": date}, {"_id": 0}
    ).to_list(500)

    att_map = {a["staff_id"]: a for a in attendance_records}

    total = len(staff_list)
    present = 0
    wfh = 0
    absent = 0
    yet_to_login = 0
    on_leave = 0
    late = 0

    employees = []
    for s in staff_list:
        att = att_map.get(s["staff_id"])
        if att:
            status = att.get("status", "present")
            check_in = att.get("check_in", "")
            check_out = att.get("check_out", "")
            work_hours = att.get("work_hours", 0)
            is_late = att.get("is_late", False)
            late_mins = att.get("late_minutes", 0)
            source = att.get("source", "manual")

            if status == "present":
                present += 1
            elif status == "wfh":
                wfh += 1
                present += 1
            elif status in ("paid_leave", "sick_leave", "casual_leave"):
                on_leave += 1
            elif status == "absent":
                absent += 1
            elif status == "half_day":
                present += 0.5

            if is_late:
                late += 1

            # Format check_in/check_out for display
            check_in_display = ""
            check_out_display = ""
            if check_in:
                try:
                    dt = datetime.fromisoformat(check_in.replace('Z', '+00:00'))
                    check_in_display = dt.strftime("%I:%M %p")
                except:
                    check_in_display = check_in
            if check_out:
                try:
                    dt = datetime.fromisoformat(check_out.replace('Z', '+00:00'))
                    check_out_display = dt.strftime("%I:%M %p")
                except:
                    check_out_display = check_out

            employees.append({
                "staff_id": s["staff_id"],
                "name": s["name"],
                "employee_code": s.get("employee_code", ""),
                "department": s.get("department", ""),
                "designation": s.get("designation", ""),
                "status": status,
                "check_in": check_in_display,
                "check_out": check_out_display,
                "check_in_raw": check_in,
                "check_out_raw": check_out,
                "work_hours": round(work_hours, 1) if work_hours else 0,
                "is_late": is_late,
                "late_minutes": late_mins,
                "source": source,
                "remarks": att.get("remarks", ""),
            })
        else:
            yet_to_login += 1
            employees.append({
                "staff_id": s["staff_id"],
                "name": s["name"],
                "employee_code": s.get("employee_code", ""),
                "department": s.get("department", ""),
                "designation": s.get("designation", ""),
                "status": "yet_to_login",
                "check_in": "",
                "check_out": "",
                "check_in_raw": "",
                "check_out_raw": "",
                "work_hours": 0,
                "is_late": False,
                "late_minutes": 0,
                "source": "",
                "remarks": "",
            })

    return {
        "date": date,
        "summary": {
            "total": total,
            "present": present,
            "wfh": wfh,
            "yet_to_login": yet_to_login,
            "absent": absent,
            "on_leave": on_leave,
            "late": late,
        },
        "employees": employees,
    }


@router.post("/hr/attendance/essl-sync")
async def essl_sync_attendance(data: dict, request: Request, user: User = Depends(get_current_user)):
    """Bulk sync attendance from eSSL eTimeTrackLite. Requires authenticated HR/Admin user."""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    records = data.get("records", [])
    if not records:
        raise HTTPException(status_code=400, detail="No records to sync")

    return await _process_essl_records(records, user.user_id)


@router.post("/hr/attendance/essl-sync-key")
async def essl_sync_with_key(data: dict, request: Request):
    """Secure API-key-based sync endpoint for the eSSL auto-sync script.
    No login required - uses a generated sync key stored in DB settings."""
    api_key = request.headers.get("X-Sync-Key", "")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-Sync-Key header")

    settings = await db.settings.find_one({"type": "attendance_sync"}, {"_id": 0})
    if not settings or not settings.get("sync_key_hash"):
        raise HTTPException(status_code=403, detail="Sync key not configured. Generate one from HR Portal > Settings.")

    import hashlib
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    if key_hash != settings.get("sync_key_hash"):
        raise HTTPException(status_code=403, detail="Invalid sync key")

    records = data.get("records", [])
    if not records:
        raise HTTPException(status_code=400, detail="No records to sync")

    return await _process_essl_records(records, "essl_sync_script")


@router.post("/hr/attendance/generate-sync-key")
async def generate_sync_key(user: User = Depends(get_current_user)):
    """Generate a new secure sync key for eSSL auto-sync script. Super Admin only."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can generate sync keys")

    import secrets, hashlib
    raw_key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    await db.settings.update_one(
        {"type": "attendance_sync"},
        {"$set": {
            "type": "attendance_sync",
            "sync_key_hash": key_hash,
            "generated_by": user.user_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    return {
        "sync_key": raw_key,
        "message": "Copy this key now. It will NOT be shown again. Paste it in your essl_sync.py CONFIG."
    }


@router.delete("/hr/attendance/revoke-sync-key")
async def revoke_sync_key(user: User = Depends(get_current_user)):
    """Revoke the current sync key. Super Admin only."""
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only Super Admin can revoke sync keys")

    await db.settings.delete_one({"type": "attendance_sync"})
    return {"message": "Sync key revoked. The script will stop working until a new key is generated."}


async def _process_essl_records(records, synced_by):
    """Process eSSL attendance records (shared logic)."""
    synced = 0
    errors = []
    for rec in records:
        try:
            ecode = str(rec.get("employee_code", "")).strip()
            date = rec.get("date", "").strip()
            check_in = rec.get("check_in", "")
            check_out = rec.get("check_out", "")
            status = rec.get("status", "present")

            if not ecode or not date:
                errors.append(f"Missing employee_code or date: {rec}")
                continue

            staff = await db.staff.find_one(
                {"$or": [{"employee_code": ecode}, {"staff_id": ecode}]},
                {"_id": 0, "staff_id": 1, "name": 1, "department": 1}
            )
            if not staff:
                errors.append(f"Employee not found: {ecode}")
                continue

            work_hours = 0
            if check_in and check_out:
                try:
                    ci = datetime.fromisoformat(check_in.replace('Z', '+00:00'))
                    co = datetime.fromisoformat(check_out.replace('Z', '+00:00'))
                    work_hours = round((co - ci).total_seconds() / 3600, 2)
                except:
                    pass

            att_data = {
                "staff_id": staff["staff_id"],
                "staff_name": staff["name"],
                "department": staff.get("department", ""),
                "date": date,
                "check_in": check_in,
                "check_out": check_out,
                "status": status,
                "work_hours": work_hours,
                "source": "essl",
                "synced_at": datetime.now(timezone.utc).isoformat(),
                "synced_by": synced_by,
            }

            await db.attendance.update_one(
                {"staff_id": staff["staff_id"], "date": date},
                {"$set": att_data},
                upsert=True
            )
            synced += 1
        except Exception as e:
            errors.append(f"Error processing {rec}: {str(e)}")

    return {"synced": synced, "errors": errors, "total": len(records)}


@router.post("/hr/attendance/csv-upload")
async def csv_upload_attendance(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """Upload attendance from CSV exported from eTimeTrackLite.
    Expected columns: EmployeeCode, Date, InTime, OutTime, Status
    """
    import csv
    import io

    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    records = []
    for row in reader:
        # Flexible column name mapping
        ecode = (row.get("EmployeeCode") or row.get("E.Code") or row.get("EmpCode") or row.get("employee_code") or "").strip()
        date_val = (row.get("Date") or row.get("AttDate") or row.get("date") or "").strip()
        in_time = (row.get("InTime") or row.get("CheckIn") or row.get("check_in") or row.get("In Time") or "").strip()
        out_time = (row.get("OutTime") or row.get("CheckOut") or row.get("check_out") or row.get("Out Time") or "").strip()
        status = (row.get("Status") or row.get("status") or "present").strip().lower()

        if ecode and date_val:
            records.append({
                "employee_code": ecode,
                "date": date_val,
                "check_in": in_time,
                "check_out": out_time,
                "status": status if status in ("present", "absent", "half_day", "wfh", "paid_leave", "sick_leave", "casual_leave") else "present",
            })

    if not records:
        raise HTTPException(status_code=400, detail="No valid records found in CSV")

    synced = 0
    errors = []
    for rec in records:
        try:
            staff = await db.staff.find_one(
                {"$or": [{"employee_code": rec["employee_code"]}, {"staff_id": rec["employee_code"]}]},
                {"_id": 0, "staff_id": 1, "name": 1}
            )
            if not staff:
                errors.append(f"Employee not found: {rec['employee_code']}")
                continue

            work_hours = 0
            check_in_iso = ""
            check_out_iso = ""

            if rec["check_in"]:
                try:
                    ci = datetime.strptime(f"{rec['date']} {rec['check_in']}", "%Y-%m-%d %I:%M %p")
                    check_in_iso = ci.isoformat()
                except:
                    try:
                        ci = datetime.strptime(f"{rec['date']} {rec['check_in']}", "%Y-%m-%d %H:%M")
                        check_in_iso = ci.isoformat()
                    except:
                        check_in_iso = rec["check_in"]

            if rec["check_out"]:
                try:
                    co = datetime.strptime(f"{rec['date']} {rec['check_out']}", "%Y-%m-%d %I:%M %p")
                    check_out_iso = co.isoformat()
                except:
                    try:
                        co = datetime.strptime(f"{rec['date']} {rec['check_out']}", "%Y-%m-%d %H:%M")
                        check_out_iso = co.isoformat()
                    except:
                        check_out_iso = rec["check_out"]

            if check_in_iso and check_out_iso:
                try:
                    ci_dt = datetime.fromisoformat(check_in_iso)
                    co_dt = datetime.fromisoformat(check_out_iso)
                    work_hours = round((co_dt - ci_dt).total_seconds() / 3600, 2)
                except:
                    pass

            await db.attendance.update_one(
                {"staff_id": staff["staff_id"], "date": rec["date"]},
                {"$set": {
                    "staff_id": staff["staff_id"],
                    "staff_name": staff["name"],
                    "date": rec["date"],
                    "check_in": check_in_iso,
                    "check_out": check_out_iso,
                    "status": rec["status"],
                    "work_hours": work_hours,
                    "source": "csv",
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                    "synced_by": user.user_id,
                }},
                upsert=True
            )
            synced += 1
        except Exception as e:
            errors.append(str(e))

    return {"synced": synced, "errors": errors, "total": len(records)}



@router.get("/hr/attendance/late-report")
async def get_late_report(month: int, year: int, user: User = Depends(get_current_user)):
    """Get late arrival report for a month"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    start = f"{year}-{str(month).zfill(2)}-01"
    end_month = month + 1 if month < 12 else 1
    end_year = year if month < 12 else year + 1
    end = f"{end_year}-{str(end_month).zfill(2)}-01"

    late_records = await db.attendance.find(
        {"date": {"$gte": start, "$lt": end}, "is_late": True},
        {"_id": 0}
    ).sort("late_minutes", -1).to_list(1000)

    summary = {}
    for r in late_records:
        sid = r["staff_id"]
        if sid not in summary:
            summary[sid] = {"staff_id": sid, "name": r.get("staff_name", ""), "late_days": 0, "total_late_minutes": 0, "records": []}
        summary[sid]["late_days"] += 1
        summary[sid]["total_late_minutes"] += r.get("late_minutes", 0)
        summary[sid]["records"].append({"date": r["date"], "check_in": r.get("check_in"), "late_minutes": r.get("late_minutes", 0)})

    return {"month": month, "year": year, "employees": list(summary.values())}


# ==================== LEAVE MANAGEMENT ====================

@router.post("/hr/leave/apply")
async def apply_leave(data: LeaveRequest, user: User = Depends(get_current_user)):
    """Employee applies for leave"""
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="No staff profile linked. Contact HR.")

    leave = {
        "leave_id": f"lv_{uuid.uuid4().hex[:12]}",
        "staff_id": staff["staff_id"],
        "staff_name": staff.get("name"),
        "department": staff.get("department"),
        "leave_type": data.leave_type,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "is_half_day": data.is_half_day,
        "reason": data.reason,
        "status": "pending",
        "applied_by": user.user_id,
        "approved_by": None,
        "approved_at": None,
        "remarks": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # Calculate days
    start = datetime.fromisoformat(data.start_date)
    end = datetime.fromisoformat(data.end_date)
    days = (end - start).days + 1
    if data.is_half_day:
        days = 0.5
    leave["days"] = days

    await db.leave_requests.insert_one(leave)
    leave.pop("_id", None)
    return leave


@router.get("/hr/leave/my-requests")
async def get_my_leave_requests(user: User = Depends(get_current_user)):
    """Get current user's leave requests"""
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        return []
    requests = await db.leave_requests.find({"staff_id": staff["staff_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return requests


@router.get("/hr/leave/my-balance")
async def get_my_leave_balance(user: User = Depends(get_current_user)):
    """Get current user's leave balance"""
    staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
    if not staff:
        return {}
    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})
    limits = settings.get("leave_limits", {}) if settings else {}

    current_year = datetime.now(timezone.utc).year
    year_start = f"{current_year}-01-01"
    year_end = f"{current_year + 1}-01-01"

    approved = await db.leave_requests.find({
        "staff_id": staff["staff_id"],
        "status": "approved",
        "start_date": {"$gte": year_start, "$lt": year_end}
    }, {"_id": 0, "leave_type": 1, "days": 1}).to_list(200)

    used = {}
    for r in approved:
        lt = r.get("leave_type", "")
        used[lt] = used.get(lt, 0) + r.get("days", 0)

    balance = {}
    for lt, info in limits.items():
        limit = info.get("annual_limit", 0)
        taken = used.get(lt, 0)
        balance[lt] = {
            "name": info.get("name", lt),
            "annual_limit": limit,
            "used": taken,
            "available": max(0, limit - taken)
        }
    return balance


@router.get("/hr/leave/requests")
async def get_all_leave_requests(status: Optional[str] = None, user: User = Depends(get_current_user)):
    """HR Admin: Get all leave requests"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    query = {}
    if status:
        query["status"] = status
    requests = await db.leave_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return requests


@router.patch("/hr/leave/{leave_id}/action")
async def action_leave_request(leave_id: str, data: LeaveActionRequest, user: User = Depends(get_current_user)):
    """HR Admin: Approve or reject leave"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    leave = await db.leave_requests.find_one({"leave_id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    new_status = "approved" if data.action == "approve" else "rejected"
    await db.leave_requests.update_one(
        {"leave_id": leave_id},
        {"$set": {
            "status": new_status,
            "approved_by": user.user_id,
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "remarks": data.remarks
        }}
    )

    if new_status == "approved":
        start = datetime.fromisoformat(leave["start_date"])
        end = datetime.fromisoformat(leave["end_date"])
        current = start
        status_map = {"PL": "paid_leave", "SL": "sick_leave", "CL": "casual_leave", "WFH": "wfh"}
        att_status = status_map.get(leave["leave_type"], "paid_leave")
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            existing = await db.attendance.find_one({"staff_id": leave["staff_id"], "date": date_str})
            if existing:
                await db.attendance.update_one(
                    {"staff_id": leave["staff_id"], "date": date_str},
                    {"$set": {"status": att_status, "leave_type": leave["leave_type"]}}
                )
            else:
                await db.attendance.insert_one({
                    "attendance_id": f"att_{uuid.uuid4().hex[:12]}",
                    "staff_id": leave["staff_id"],
                    "staff_name": leave.get("staff_name"),
                    "date": date_str,
                    "status": att_status,
                    "leave_type": leave["leave_type"],
                    "work_hours": 0 if leave["leave_type"] != "WFH" else 8,
                    "recorded_by": user.user_id,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
            current += timedelta(days=1)

    return {"status": new_status}


@router.get("/hr/leave/balance/{staff_id}")
async def get_staff_leave_balance(staff_id: str, user: User = Depends(get_current_user)):
    """HR: Get specific staff's leave balance"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})
    limits = settings.get("leave_limits", {}) if settings else {}

    current_year = datetime.now(timezone.utc).year
    year_start = f"{current_year}-01-01"
    year_end = f"{current_year + 1}-01-01"

    approved = await db.leave_requests.find({
        "staff_id": staff_id,
        "status": "approved",
        "start_date": {"$gte": year_start, "$lt": year_end}
    }, {"_id": 0, "leave_type": 1, "days": 1}).to_list(200)

    used = {}
    for r in approved:
        lt = r.get("leave_type", "")
        used[lt] = used.get(lt, 0) + r.get("days", 0)

    balance = {}
    for lt, info in limits.items():
        limit = info.get("annual_limit", 0)
        taken = used.get(lt, 0)
        balance[lt] = {
            "name": info.get("name", lt),
            "annual_limit": limit,
            "used": taken,
            "available": max(0, limit - taken)
        }
    return balance


# ==================== SALARY CALCULATION ====================

@router.post("/hr/salary/calculate")
async def calculate_salary(data: SalaryCalculateRequest, user: User = Depends(get_current_user)):
    """Auto-calculate salary for all active staff for a month"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    month, year = data.month, data.year
    days_in_month = calendar.monthrange(year, month)[1]
    sundays = sum(1 for d in range(1, days_in_month + 1) if calendar.weekday(year, month, d) == 6)
    working_days = days_in_month - sundays

    start = f"{year}-{str(month).zfill(2)}-01"
    end_month = month + 1 if month < 12 else 1
    end_year = year if month < 12 else year + 1
    end = f"{end_year}-{str(end_month).zfill(2)}-01"

    staff_list = await db.staff.find({"status": "active"}, {"_id": 0}).to_list(500)
    attendance = await db.attendance.find({"date": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(5000)

    att_by_staff = {}
    for a in attendance:
        sid = a["staff_id"]
        if sid not in att_by_staff:
            att_by_staff[sid] = []
        att_by_staff[sid].append(a)

    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})

    results = []
    for s in staff_list:
        sid = s["staff_id"]
        records = att_by_staff.get(sid, [])

        present = 0
        absent = 0
        half_days = 0
        leaves_taken = 0
        late_days = 0
        total_late_mins = 0

        for r in records:
            st = r.get("status", "")
            if st == "present" or st == "wfh":
                present += 1
            elif st == "half_day":
                half_days += 1
            elif st == "absent":
                absent += 1
            elif st in ("paid_leave", "sick_leave", "casual_leave"):
                leaves_taken += 1
            if r.get("is_late"):
                late_days += 1
                total_late_mins += r.get("late_minutes", 0)

        net_present = present + (half_days * 0.5) + leaves_taken
        lop_days = max(0, working_days - net_present)

        basic = s.get("basic_salary", 0)
        hra = s.get("hra", 0)
        pa = s.get("pa", 0) or s.get("other_allowances", 0)
        fa = s.get("fa", 0)
        gross = basic + hra + pa + fa

        per_day = gross / working_days if working_days > 0 else 0
        lop_deduction = round(per_day * lop_days, 2)
        late_deduction = round((total_late_mins / 60) * (per_day / 8), 2) if total_late_mins > 0 else 0
        loan_deduction = s.get("loan_balance", 0) if s.get("loan_balance", 0) > 0 else 0

        total_deductions = round(lop_deduction + late_deduction + loan_deduction, 2)
        net_pay = round(gross - total_deductions, 2)

        payroll = {
            "payroll_id": f"pay_{uuid.uuid4().hex[:12]}",
            "staff_id": sid,
            "staff_name": s.get("name"),
            "employee_code": s.get("employee_code"),
            "department": s.get("department"),
            "designation": s.get("designation"),
            "month": month,
            "year": year,
            "working_days": working_days,
            "days_present": present,
            "days_absent": absent,
            "half_days": half_days,
            "leaves_taken": leaves_taken,
            "late_days": late_days,
            "total_late_minutes": total_late_mins,
            "net_days_present": net_present,
            "lop_days": lop_days,
            "basic_salary": basic,
            "hra": hra,
            "pa": pa,
            "fa": fa,
            "gross_earnings": gross,
            "per_day_salary": round(per_day, 2),
            "lop_deduction": lop_deduction,
            "late_deduction": late_deduction,
            "loan_deduction": loan_deduction,
            "total_deductions": total_deductions,
            "net_pay": net_pay,
            "status": "draft",
            "bank_name": s.get("bank_name"),
            "account_number": s.get("account_number"),
            "ifsc_code": s.get("ifsc_code"),
            "created_by": user.user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        existing = await db.payroll_v2.find_one({"staff_id": sid, "month": month, "year": year})
        if existing:
            await db.payroll_v2.update_one(
                {"staff_id": sid, "month": month, "year": year},
                {"$set": {**payroll, "payroll_id": existing.get("payroll_id", payroll["payroll_id"])}}
            )
            payroll["payroll_id"] = existing.get("payroll_id", payroll["payroll_id"])
        else:
            await db.payroll_v2.insert_one(payroll)

        payroll.pop("_id", None)
        results.append(payroll)

    return {"month": month, "year": year, "working_days": working_days, "payroll": results}


@router.get("/hr/salary/list")
async def get_salary_list(month: int, year: int, user: User = Depends(get_current_user)):
    """Get salary list for a month"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    payroll = await db.payroll_v2.find({"month": month, "year": year}, {"_id": 0}).sort("staff_name", 1).to_list(500)
    return payroll


@router.get("/hr/payslip/{staff_id}")
async def get_payslip(staff_id: str, month: int, year: int, user: User = Depends(get_current_user)):
    """Get payslip for a specific employee"""
    if user.role not in HR_ROLES and user.user_id != staff_id:
        staff = await db.staff.find_one({"linked_user_id": user.user_id}, {"_id": 0})
        if not staff or staff["staff_id"] != staff_id:
            raise HTTPException(status_code=403, detail="Permission denied")

    payroll = await db.payroll_v2.find_one({"staff_id": staff_id, "month": month, "year": year}, {"_id": 0})
    if not payroll:
        raise HTTPException(status_code=404, detail="Payslip not found")

    staff = await db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    settings = await db.hr_settings.find_one({"settings_id": "hr_global"}, {"_id": 0})

    return {
        "payroll": payroll,
        "staff": staff,
        "company": {
            "name": settings.get("company_name", "") if settings else "",
            "address": settings.get("company_address", "") if settings else ""
        }
    }


# ==================== STAFF EXTENDED FIELDS ====================

@router.patch("/hr/staff/{staff_id}/extended")
async def update_staff_extended(staff_id: str, data: StaffUpdateExtended, user: User = Depends(get_current_user)):
    """Update extended employee fields (personal, financial, exit)"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        return {"status": "no changes"}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.staff.update_one({"staff_id": staff_id}, {"$set": update})
    return {"status": "updated"}


# ==================== DASHBOARD ====================

@router.get("/hr/dashboard")
async def get_hr_dashboard(user: User = Depends(get_current_user)):
    """HR Dashboard with key metrics"""
    if user.role not in HR_ROLES:
        raise HTTPException(status_code=403, detail="Permission denied")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc)
    month_start = f"{now.year}-{str(now.month).zfill(2)}-01"
    end_month = now.month + 1 if now.month < 12 else 1
    end_year = now.year if now.month < 12 else now.year + 1
    month_end = f"{end_year}-{str(end_month).zfill(2)}-01"

    total_staff = await db.staff.count_documents({"status": "active"})
    today_present = await db.attendance.count_documents({"date": today, "status": {"$in": ["present", "wfh"]}})
    today_absent = total_staff - today_present
    today_late = await db.attendance.count_documents({"date": today, "is_late": True})
    pending_leaves = await db.leave_requests.count_documents({"status": "pending"})

    today_attendance = await db.attendance.find({"date": today}, {"_id": 0}).to_list(500)

    dept_stats = {}
    for a in today_attendance:
        dept = "Unknown"
        dept_stats.setdefault(dept, {"present": 0, "absent": 0, "late": 0})
        if a.get("status") in ("present", "wfh"):
            dept_stats[dept]["present"] += 1
        if a.get("is_late"):
            dept_stats[dept]["late"] += 1

    # Get staff by department for dept_stats
    staff_list = await db.staff.find({"status": "active"}, {"_id": 0, "staff_id": 1, "department": 1}).to_list(500)
    staff_dept_map = {s["staff_id"]: s.get("department", "Unknown") for s in staff_list}
    dept_counts = {}
    for s in staff_list:
        d = s.get("department", "Unknown")
        dept_counts[d] = dept_counts.get(d, 0) + 1

    return {
        "total_staff": total_staff,
        "today_present": today_present,
        "today_absent": today_absent,
        "today_late": today_late,
        "pending_leaves": pending_leaves,
        "department_counts": dept_counts,
        "today": today
    }
