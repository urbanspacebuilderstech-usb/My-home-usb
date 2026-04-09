"""
eSSL eTimeTrackLite -> ConstructionOS CRM Auto-Sync Script
============================================================
Run this script on your office PC (same network as the eSSL biometric device).
It reads attendance data from the eTimeTrackLite SQL Server database and
pushes it to your CRM cloud API.

SETUP:
1. Install Python 3.8+ on your office PC
2. pip install pyodbc requests
3. Edit the CONFIG section below with your details
4. Run: python essl_sync.py
5. (Optional) Schedule via Windows Task Scheduler to run daily at 8 PM

REQUIREMENTS:
- pyodbc (pip install pyodbc)
- requests (pip install requests)
- SQL Server ODBC Driver (usually pre-installed with eTimeTrackLite)
"""

import pyodbc
import requests
import json
import sys
import os
import logging
from datetime import datetime, timedelta, date

# ============================================================
# CONFIGURATION - EDIT THESE VALUES
# ============================================================

CONFIG = {
    # eTimeTrackLite SQL Server Database
    "DB_SERVER": r"localhost\SQLEXPRESS",     # e.g., "192.168.1.100\SQLEXPRESS" or ".\SQLEXPRESS"
    "DB_NAME": "eaboraborabora",                         # eTimeTrackLite database name (check SQL Server Management Studio)
    "DB_USER": "",                            # Leave empty for Windows Authentication
    "DB_PASSWORD": "",                        # Leave empty for Windows Authentication
    "DB_DRIVER": "{ODBC Driver 17 for SQL Server}",  # or "{SQL Server}" for older versions

    # ConstructionOS CRM API
    "CRM_API_URL": "https://myhomeusb.com/api",  # Your production CRM URL
    "CRM_EMAIL": "hr@constructionos.com",         # HR user email for authentication
    "CRM_PASSWORD": "USB@123.26",                  # HR user password

    # Sync Settings
    "OFFICE_START_TIME": "09:00",             # Used to calculate "late" arrivals (24hr format)
    "SYNC_DAYS_BACK": 1,                      # How many days back to sync (1 = today only)
    "LOG_FILE": "essl_sync.log",              # Log file path
}

# ============================================================
# DO NOT EDIT BELOW THIS LINE
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(CONFIG["LOG_FILE"], encoding="utf-8"),
    ],
)
log = logging.getLogger("essl_sync")


def connect_db():
    """Connect to eTimeTrackLite SQL Server database."""
    try:
        if CONFIG["DB_USER"]:
            conn_str = (
                f"DRIVER={CONFIG['DB_DRIVER']};"
                f"SERVER={CONFIG['DB_SERVER']};"
                f"DATABASE={CONFIG['DB_NAME']};"
                f"UID={CONFIG['DB_USER']};"
                f"PWD={CONFIG['DB_PASSWORD']};"
                f"TrustServerCertificate=yes;"
            )
        else:
            # Windows Authentication
            conn_str = (
                f"DRIVER={CONFIG['DB_DRIVER']};"
                f"SERVER={CONFIG['DB_SERVER']};"
                f"DATABASE={CONFIG['DB_NAME']};"
                f"Trusted_Connection=yes;"
                f"TrustServerCertificate=yes;"
            )
        conn = pyodbc.connect(conn_str, timeout=10)
        log.info(f"Connected to SQL Server: {CONFIG['DB_SERVER']}/{CONFIG['DB_NAME']}")
        return conn
    except Exception as e:
        log.error(f"Database connection failed: {e}")
        log.info("TIPS:")
        log.info("  1. Check DB_SERVER - try 'localhost\\SQLEXPRESS' or your PC's IP")
        log.info("  2. Check DB_NAME - open SQL Server Management Studio to find it")
        log.info("  3. Check DB_DRIVER - try '{SQL Server}' if ODBC 17 fails")
        log.info("  4. Make sure SQL Server Browser service is running")
        return None


def get_table_names(conn):
    """List all tables in the database (useful for debugging)."""
    cursor = conn.cursor()
    tables = [row.table_name for row in cursor.tables(tableType="TABLE")]
    return tables


def detect_essl_schema(conn):
    """Auto-detect the eTimeTrackLite table structure."""
    tables = get_table_names(conn)
    log.info(f"Database tables: {tables}")

    # Common eTimeTrackLite table patterns
    punch_tables = [
        "DeviceLogs",      # Newer versions
        "Logins",          # Common in eTimeTrackLite
        "AttLogs",         # Some versions
        "Logins_1",        # Alternate
        "Logins_2",
        "ABORATORYABORABORAB",  # Some eSSL versions
        "Logins",
    ]

    # Also check for tables starting with "DeviceLogs_"
    for t in tables:
        if t.startswith("DeviceLogs_"):
            punch_tables.insert(0, t)

    for table in punch_tables:
        if table in tables:
            cursor = conn.cursor()
            try:
                cols = [col.column_name for col in cursor.columns(table=table)]
                log.info(f"Found punch table: {table} with columns: {cols}")
                return table, cols
            except:
                continue

    log.warning(f"Could not auto-detect punch table. Available tables: {tables}")
    return None, None


def fetch_attendance(conn, sync_date):
    """Fetch attendance records from eTimeTrackLite for a given date."""
    table, cols = detect_essl_schema(conn)
    if not table:
        log.error("Cannot find attendance table. Please check your database.")
        return []

    # Determine column names based on detected schema
    # eTimeTrackLite common column patterns:
    user_id_col = None
    datetime_col = None
    direction_col = None

    col_lower = {c.lower(): c for c in cols}

    # User/Employee ID column
    for candidate in ["userid", "user_id", "employeecode", "employee_code", "enrollno", "enroll_no", "empcode"]:
        if candidate in col_lower:
            user_id_col = col_lower[candidate]
            break

    # DateTime column
    for candidate in ["logdate", "log_date", "datetime", "punchtime", "punch_time", "attdate", "checktime"]:
        if candidate in col_lower:
            datetime_col = col_lower[candidate]
            break

    # Direction column (In/Out)
    for candidate in ["direction", "inoutmode", "in_out_mode", "io_mode", "mode", "status"]:
        if candidate in col_lower:
            direction_col = col_lower[candidate]
            break

    if not user_id_col or not datetime_col:
        log.error(f"Cannot determine column mapping. Columns: {cols}")
        log.info(f"  User ID column candidates: userid, employeecode, enrollno")
        log.info(f"  DateTime column candidates: logdate, datetime, punchtime")
        return []

    log.info(f"Column mapping: UserID={user_id_col}, DateTime={datetime_col}, Direction={direction_col or 'N/A'}")

    # Build query
    date_str = sync_date.strftime("%Y-%m-%d")
    next_date = (sync_date + timedelta(days=1)).strftime("%Y-%m-%d")

    query = f"""
        SELECT [{user_id_col}], [{datetime_col}]
        {f', [{direction_col}]' if direction_col else ''}
        FROM [{table}]
        WHERE [{datetime_col}] >= ? AND [{datetime_col}] < ?
        ORDER BY [{user_id_col}], [{datetime_col}]
    """

    cursor = conn.cursor()
    cursor.execute(query, date_str, next_date)
    rows = cursor.fetchall()
    log.info(f"Fetched {len(rows)} punch records for {date_str}")

    # Group punches by employee
    employee_punches = {}
    for row in rows:
        emp_id = str(row[0]).strip()
        punch_time = row[1]
        direction = str(row[2]).strip() if direction_col and len(row) > 2 else None

        if emp_id not in employee_punches:
            employee_punches[emp_id] = []
        employee_punches[emp_id].append({
            "time": punch_time,
            "direction": direction,
        })

    # Process into check-in / check-out pairs
    records = []
    office_start = datetime.strptime(CONFIG["OFFICE_START_TIME"], "%H:%M").time()

    for emp_id, punches in employee_punches.items():
        punches.sort(key=lambda p: p["time"])

        # Determine check-in (first punch) and check-out (last punch)
        check_in = None
        check_out = None

        if len(punches) >= 1:
            first = punches[0]
            # If direction data available, use it
            if first["direction"] and first["direction"] in ("0", "In", "IN", "in", "I", "CheckIn"):
                check_in = first["time"]
            else:
                check_in = first["time"]  # First punch = check in

        if len(punches) >= 2:
            last = punches[-1]
            if last["direction"] and last["direction"] in ("1", "Out", "OUT", "out", "O", "CheckOut"):
                check_out = last["time"]
            else:
                check_out = last["time"]  # Last punch = check out

        # Calculate work hours
        work_hours = 0
        if check_in and check_out:
            if isinstance(check_in, datetime) and isinstance(check_out, datetime):
                diff = (check_out - check_in).total_seconds() / 3600
                work_hours = round(diff, 2)

        # Check if late
        is_late = False
        late_minutes = 0
        if check_in:
            ci_time = check_in.time() if isinstance(check_in, datetime) else check_in
            if ci_time > office_start:
                is_late = True
                ci_dt = datetime.combine(sync_date, ci_time)
                start_dt = datetime.combine(sync_date, office_start)
                late_minutes = int((ci_dt - start_dt).total_seconds() / 60)

        # Format times as ISO strings
        def fmt(dt):
            if dt is None:
                return ""
            if isinstance(dt, datetime):
                return dt.isoformat()
            return str(dt)

        status = "present"
        if check_in and not check_out:
            status = "present"  # Still at work
        elif work_hours > 0 and work_hours < 4:
            status = "half_day"

        records.append({
            "employee_code": emp_id,
            "date": date_str,
            "check_in": fmt(check_in),
            "check_out": fmt(check_out),
            "work_hours": work_hours,
            "status": status,
            "is_late": is_late,
            "late_minutes": late_minutes,
        })

    log.info(f"Processed {len(records)} employee attendance records")
    return records


def login_crm():
    """Login to CRM and get session cookie."""
    try:
        resp = requests.post(
            f"{CONFIG['CRM_API_URL']}/auth/login",
            json={"email": CONFIG["CRM_EMAIL"], "password": CONFIG["CRM_PASSWORD"]},
            timeout=15,
        )
        if resp.status_code == 200:
            log.info(f"CRM login successful: {resp.json().get('name', 'OK')}")
            return resp.cookies
        else:
            log.error(f"CRM login failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log.error(f"CRM connection failed: {e}")
        return None


def push_to_crm(records, cookies):
    """Push attendance records to CRM API."""
    try:
        resp = requests.post(
            f"{CONFIG['CRM_API_URL']}/hr/attendance/essl-sync",
            json={"records": records},
            cookies=cookies,
            timeout=30,
        )
        if resp.status_code == 200:
            result = resp.json()
            log.info(f"CRM sync result: {result['synced']} synced, {len(result.get('errors', []))} errors")
            for err in result.get("errors", []):
                log.warning(f"  Sync error: {err}")
            return result
        else:
            log.error(f"CRM sync failed: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log.error(f"CRM sync error: {e}")
        return None


def run_sync():
    """Main sync function."""
    log.info("=" * 60)
    log.info("eSSL -> ConstructionOS CRM Attendance Sync")
    log.info("=" * 60)

    # Step 1: Connect to eTimeTrackLite database
    conn = connect_db()
    if not conn:
        return False

    # Step 2: Login to CRM
    cookies = login_crm()
    if not cookies:
        conn.close()
        return False

    # Step 3: Fetch and sync attendance for each day
    today = date.today()
    total_synced = 0

    for days_back in range(CONFIG["SYNC_DAYS_BACK"]):
        sync_date = today - timedelta(days=days_back)
        log.info(f"\n--- Syncing {sync_date.strftime('%Y-%m-%d')} ---")

        records = fetch_attendance(conn, sync_date)
        if not records:
            log.info(f"No records found for {sync_date}")
            continue

        result = push_to_crm(records, cookies)
        if result:
            total_synced += result.get("synced", 0)

    conn.close()
    log.info(f"\nSync complete! Total records synced: {total_synced}")
    return True


def test_connection():
    """Test database connection and show available tables."""
    log.info("Testing database connection...")
    conn = connect_db()
    if not conn:
        return

    tables = get_table_names(conn)
    log.info(f"\nAvailable tables ({len(tables)}):")
    for t in tables:
        cursor = conn.cursor()
        cols = [col.column_name for col in cursor.columns(table=t)]
        log.info(f"  {t}: {cols}")

    table, cols = detect_essl_schema(conn)
    if table:
        # Show sample data
        cursor = conn.cursor()
        cursor.execute(f"SELECT TOP 5 * FROM [{table}] ORDER BY 1 DESC")
        rows = cursor.fetchall()
        log.info(f"\nSample data from {table}:")
        for row in rows:
            log.info(f"  {row}")

    conn.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_connection()
    elif len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("""
eSSL eTimeTrackLite -> ConstructionOS CRM Auto-Sync

Usage:
  python essl_sync.py          Run the sync (fetch today's attendance and push to CRM)
  python essl_sync.py --test   Test database connection and show table structure
  python essl_sync.py --help   Show this help message

Setup:
  1. Edit the CONFIG section at the top of this file
  2. Set DB_SERVER, DB_NAME to match your eTimeTrackLite installation
  3. Set CRM_API_URL, CRM_EMAIL, CRM_PASSWORD for your CRM login
  4. Run: python essl_sync.py --test  (to verify connection)
  5. Run: python essl_sync.py         (to sync attendance)

Schedule (Windows Task Scheduler):
  Action: Start a program
  Program: python
  Arguments: C:\\path\\to\\essl_sync.py
  Trigger: Daily at 8:00 PM
        """)
    else:
        run_sync()
