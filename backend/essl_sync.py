"""
eSSL eTimeTrackLite -> ConstructionOS CRM Auto-Sync Script (SECURE)
=====================================================================
This script does NOT store any passwords. It uses a secure API key
generated from your CRM's HR Portal.

FIRST-TIME SETUP:
1. Install Python 3.8+ on your office PC
2. pip install pyodbc requests
3. Login to CRM as Super Admin -> HR Portal -> Settings
4. Click "Generate Sync Key" — copy the key
5. Set the SYNC_KEY below (or use environment variable ESSL_SYNC_KEY)
6. Run: python essl_sync.py --test (to verify DB connection)
7. Run: python essl_sync.py (to sync attendance)

SCHEDULE (Windows Task Scheduler):
  Action: Start a program
  Program: python
  Arguments: C:\\path\\to\\essl_sync.py
  Trigger: Daily at 8:00 PM
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime, timedelta, date

# ============================================================
# CONFIGURATION
# ============================================================

CONFIG = {
    # eTimeTrackLite SQL Server Database (local network)
    "DB_SERVER": r"localhost\SQLEXPRESS",     # e.g., "192.168.1.100\SQLEXPRESS"
    "DB_NAME": "",                            # eTimeTrackLite database name
    "DB_USER": "",                            # Leave empty for Windows Auth
    "DB_PASSWORD": "",                        # Leave empty for Windows Auth
    "DB_DRIVER": "{ODBC Driver 17 for SQL Server}",

    # ConstructionOS CRM (SECURE - no password stored)
    "CRM_API_URL": "https://myhomeusb.com/api",
    "SYNC_KEY": os.environ.get("ESSL_SYNC_KEY", ""),  # Paste your key here OR set env var

    # Settings
    "OFFICE_START_TIME": "09:00",
    "SYNC_DAYS_BACK": 1,
    "LOG_FILE": "essl_sync.log",
}

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
    """Connect to eTimeTrackLite SQL Server."""
    try:
        import pyodbc
    except ImportError:
        log.error("pyodbc not installed. Run: pip install pyodbc")
        return None

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
            conn_str = (
                f"DRIVER={CONFIG['DB_DRIVER']};"
                f"SERVER={CONFIG['DB_SERVER']};"
                f"DATABASE={CONFIG['DB_NAME']};"
                f"Trusted_Connection=yes;"
                f"TrustServerCertificate=yes;"
            )
        conn = pyodbc.connect(conn_str, timeout=10)
        log.info(f"Connected to: {CONFIG['DB_SERVER']}/{CONFIG['DB_NAME']}")
        return conn
    except Exception as e:
        log.error(f"DB connection failed: {e}")
        return None


def detect_punch_table(conn):
    """Auto-detect eTimeTrackLite punch/attendance table."""
    cursor = conn.cursor()
    tables = [row.table_name for row in cursor.tables(tableType="TABLE")]
    log.info(f"Tables found: {tables}")

    candidates = ["DeviceLogs", "Logins", "AttLogs", "Logins_1"]
    for t in tables:
        if t.startswith("DeviceLogs_"):
            candidates.insert(0, t)

    for table in candidates:
        if table in tables:
            cols = [col.column_name for col in cursor.columns(table=table)]
            log.info(f"Using table: {table} | Columns: {cols}")
            return table, cols

    log.error(f"No punch table found. Available: {tables}")
    return None, None


def fetch_attendance(conn, sync_date):
    """Read punch data for a date, return processed records."""
    table, cols = detect_punch_table(conn)
    if not table:
        return []

    col_map = {c.lower(): c for c in cols}

    # Find user ID column
    uid_col = None
    for c in ["userid", "user_id", "employeecode", "employee_code", "enrollno", "empcode"]:
        if c in col_map:
            uid_col = col_map[c]
            break

    # Find datetime column
    dt_col = None
    for c in ["logdate", "log_date", "datetime", "punchtime", "punch_time", "checktime"]:
        if c in col_map:
            dt_col = col_map[c]
            break

    # Find direction column
    dir_col = None
    for c in ["direction", "inoutmode", "in_out_mode", "mode"]:
        if c in col_map:
            dir_col = col_map[c]
            break

    if not uid_col or not dt_col:
        log.error(f"Cannot map columns. Found: {cols}")
        return []

    date_str = sync_date.strftime("%Y-%m-%d")
    next_date = (sync_date + timedelta(days=1)).strftime("%Y-%m-%d")

    query = f"SELECT [{uid_col}], [{dt_col}]{f', [{dir_col}]' if dir_col else ''} FROM [{table}] WHERE [{dt_col}] >= ? AND [{dt_col}] < ? ORDER BY [{uid_col}], [{dt_col}]"

    cursor = conn.cursor()
    cursor.execute(query, date_str, next_date)
    rows = cursor.fetchall()
    log.info(f"Punches for {date_str}: {len(rows)}")

    # Group by employee
    emp_punches = {}
    for row in rows:
        eid = str(row[0]).strip()
        if eid not in emp_punches:
            emp_punches[eid] = []
        emp_punches[eid].append({
            "time": row[1],
            "dir": str(row[2]).strip() if dir_col and len(row) > 2 else None,
        })

    office_start = datetime.strptime(CONFIG["OFFICE_START_TIME"], "%H:%M").time()
    records = []

    for eid, punches in emp_punches.items():
        punches.sort(key=lambda p: p["time"])
        ci = punches[0]["time"]
        co = punches[-1]["time"] if len(punches) > 1 else None

        work_hours = 0
        if ci and co and isinstance(ci, datetime) and isinstance(co, datetime):
            work_hours = round((co - ci).total_seconds() / 3600, 2)

        is_late = False
        late_min = 0
        if ci and isinstance(ci, datetime) and ci.time() > office_start:
            is_late = True
            late_min = int((datetime.combine(sync_date, ci.time()) - datetime.combine(sync_date, office_start)).total_seconds() / 60)

        def fmt(dt):
            return dt.isoformat() if isinstance(dt, datetime) else (str(dt) if dt else "")

        records.append({
            "employee_code": eid,
            "date": date_str,
            "check_in": fmt(ci),
            "check_out": fmt(co),
            "work_hours": work_hours,
            "status": "half_day" if 0 < work_hours < 4 else "present",
            "is_late": is_late,
            "late_minutes": late_min,
        })

    log.info(f"Processed: {len(records)} employees")
    return records


def push_to_crm(records):
    """Push records to CRM using secure API key (no password needed)."""
    key = CONFIG["SYNC_KEY"]
    if not key:
        log.error("SYNC_KEY is empty! Generate one from CRM: HR Portal > Settings > Generate Sync Key")
        return None

    try:
        resp = requests.post(
            f"{CONFIG['CRM_API_URL']}/hr/attendance/essl-sync-key",
            json={"records": records},
            headers={"X-Sync-Key": key, "Content-Type": "application/json"},
            timeout=30,
        )
        if resp.status_code == 200:
            result = resp.json()
            log.info(f"Synced: {result['synced']}/{result['total']} | Errors: {len(result.get('errors', []))}")
            for err in result.get("errors", []):
                log.warning(f"  {err}")
            return result
        elif resp.status_code == 403:
            log.error("SYNC KEY INVALID or REVOKED. Generate a new one from CRM.")
            return None
        else:
            log.error(f"CRM error: {resp.status_code} - {resp.text}")
            return None
    except Exception as e:
        log.error(f"CRM connection failed: {e}")
        return None


def run_sync():
    """Main sync."""
    log.info("=" * 50)
    log.info("eSSL -> CRM Attendance Sync (Secure)")
    log.info("=" * 50)

    if not CONFIG["SYNC_KEY"]:
        log.error("No SYNC_KEY configured!")
        log.info("Steps:")
        log.info("  1. Login to CRM as Super Admin")
        log.info("  2. Go to HR Portal > Settings")
        log.info("  3. Click 'Generate Sync Key'")
        log.info("  4. Paste the key in this script's CONFIG['SYNC_KEY']")
        log.info("  Or set environment variable: ESSL_SYNC_KEY=your_key_here")
        return False

    conn = connect_db()
    if not conn:
        return False

    today = date.today()
    total = 0
    for i in range(CONFIG["SYNC_DAYS_BACK"]):
        d = today - timedelta(days=i)
        log.info(f"--- {d} ---")
        records = fetch_attendance(conn, d)
        if records:
            result = push_to_crm(records)
            if result:
                total += result.get("synced", 0)

    conn.close()
    log.info(f"Done! Total synced: {total}")
    return True


def test_connection():
    """Test DB connection and show tables."""
    log.info("Testing database connection...")
    conn = connect_db()
    if not conn:
        return
    import pyodbc
    cursor = conn.cursor()
    tables = [row.table_name for row in cursor.tables(tableType="TABLE")]
    for t in tables:
        cols = [col.column_name for col in cursor.columns(table=t)]
        log.info(f"  {t}: {cols}")

    table, cols = detect_punch_table(conn)
    if table:
        cursor.execute(f"SELECT TOP 5 * FROM [{table}] ORDER BY 1 DESC")
        for row in cursor.fetchall():
            log.info(f"  Sample: {row}")
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_connection()
    elif len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("""
eSSL -> CRM Sync (Secure - No Passwords Stored)

Usage:
  python essl_sync.py          Sync today's attendance
  python essl_sync.py --test   Test database connection
  python essl_sync.py --help   Show help

Setup:
  1. Login to CRM as Super Admin
  2. HR Portal > Settings > Generate Sync Key
  3. Paste key in CONFIG['SYNC_KEY'] or set env var ESSL_SYNC_KEY
  4. Set DB_SERVER and DB_NAME for your eTimeTrackLite
  5. Run: python essl_sync.py --test
  6. Run: python essl_sync.py
        """)
    else:
        run_sync()
