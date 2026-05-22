"""Seed a fresh project + payment stage in cre_rejected state for UI re-test."""
import os
import sys
import uuid
import json
import requests
from datetime import datetime, timezone, timedelta

BASE = "https://crm-onboard-flow.preview.emergentagent.com"

def login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return s

def main():
    admin = login("admin@constructionos.com", "Demo@1234")
    planning = login("planning@constructionos.com", "Demo@1234")

    pid = f"TESTproj_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    payload = {
        "project_id": pid,
        "name": f"TEST StaleUI {uuid.uuid4().hex[:6]}",
        "client_name": "TEST Client",
        "client_email": "test_client@example.com",
        "client_phone": "9876500000",
        "location": "TEST City",
        "sqft": 1000,
        "building_type": "residential",
        "total_value": 1000000,
        "advance_amount": 0,
        "current_stage": "yet_to_start",
        "status": "draft",
        "start_date": now.isoformat(),
        "expected_completion": (now + timedelta(days=180)).isoformat(),
        "created_at": now.isoformat(),
        "created_by": "admin",
    }
    r = admin.post(f"{BASE}/api/projects", json=payload)
    assert r.status_code in (200, 201), r.text
    print("Created project:", pid)

    body = {
        "project_id": pid,
        "stage_label": "1",
        "stage_name": "TEST Plastering Stale",
        "percentage": 10.0,
        "amount": 0,
    }
    r = admin.post(f"{BASE}/api/payment-stages", json=body)
    assert r.status_code in (200, 201), r.text
    sid = r.json()["stage_id"]
    print("Created stage:", sid)

    # Planning requests
    r = planning.patch(f"{BASE}/api/payment-stages/{sid}/request", json={})
    assert r.status_code == 200, r.text
    print("Planning requested stage")

    # CRE rejects
    r = admin.post(f"{BASE}/api/payment-stages/{sid}/cre-reject",
                   json={"reason": "Amount mismatch with client agreement - please correct"})
    assert r.status_code == 200, r.text
    print("CRE rejected stage")

    # Verify
    g = admin.get(f"{BASE}/api/projects/{pid}/payment-stages")
    stage = next(s for s in g.json() if s["stage_id"] == sid)
    assert stage["workflow_status"] == "cre_rejected"
    print("Seed OK. workflow_status=", stage["workflow_status"])
    print("REASON:", stage.get("cre_rejection_reason"))

    out = {"project_id": pid, "stage_id": sid}
    with open("/app/test_reports/seed_data.json", "w") as fh:
        json.dump(out, fh)
    print(json.dumps(out))

if __name__ == "__main__":
    main()
