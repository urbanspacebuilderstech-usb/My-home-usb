"""Regression test for the new Material Request flow:
   SE submits → Awaiting Planning (initial) → Planning approves → Awaiting Procurement → …
"""
import os
import sys
import pytest
import requests

API = os.environ.get("API_URL") or (
    os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"
) or "http://localhost:8001/api"

SE_CREDS = {"email": "engineer@constructionos.com", "password": "Demo@1234"}
PL_CREDS = {"email": "planning@constructionos.com", "password": "Demo@1234"}


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()


def _se_session():
    s = requests.Session()
    _login(s, SE_CREDS)
    return s


def _planning_session():
    s = requests.Session()
    _login(s, PL_CREDS)
    return s


def _create_request(se_session, project_id, name="TEST-material"):
    r = se_session.post(
        f"{API}/site-engineer/material-requests",
        json={
            "project_id": project_id,
            "material_name": name,
            "quantity": 5,
            "unit": "bags",
            "se_delivery_choice": "48h",
            "se_requested_hours": 48,
            "remarks": "pytest",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def _first_project(se_session):
    r = se_session.get(f"{API}/site-engineer/my-projects")
    assert r.status_code == 200, r.text
    projs = r.json()
    assert projs, "Site Engineer has no assigned projects"
    return projs[0]["project_id"]


def test_new_request_lands_at_planning_initial_pending():
    se = _se_session()
    pid = _first_project(se)
    req = _create_request(se, pid)
    assert req["status"] == "planning_initial_pending", req


def test_planning_initial_approve_routes_to_procurement():
    se = _se_session()
    pl = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid)
    rid = req["request_id"]
    r = pl.patch(
        f"{API}/procurement-simple/material-requests/{rid}/planning-initial-approve",
        json={"notes": "ok"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pm_approved"
    # Confirm it now appears in Procurement's pending queue
    proc_q = pl.get(f"{API}/procurement-simple/queue?queue=pending").json()
    assert any(x["request_id"] == rid for x in proc_q["requests"])


def test_procurement_assign_vendor_goes_to_transit():
    """After Procurement assigns a vendor, status should go directly to in_transit
    (skipping the old Planning Pricing review step) so SE can collect immediately.
    """
    se = _se_session()
    pl = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid, name="TEST-Vendor-Direct")
    rid = req["request_id"]
    # 1. Planning approves initial
    pl.patch(f"{API}/procurement-simple/material-requests/{rid}/planning-initial-approve", json={})
    # 2. Procurement assigns vendor
    proc = requests.Session()
    _login(proc, {"email": "procurement@constructionos.com", "password": "Demo@1234"})
    vendors = proc.get(f"{API}/vendor-master?category=material").json()
    vlist = vendors.get("vendors") if isinstance(vendors, dict) else vendors
    assert vlist, "Need at least one material vendor"
    v = vlist[0]
    r = proc.patch(
        f"{API}/procurement-simple/material-requests/{rid}/assign-vendor",
        json={
            "vendor_id": v["vendor_id"],
            "vendor_name": v.get("name") or v.get("vendor_name"),
            "unit_price": 100,
            "approved_quantity": 5,
            "timeline_type": "days",
            "timeline_value": 5,
            "payment_mode": "pre_paid",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_transit"
    # 3. Verify SE sees it as Transit
    after = se.get(f"{API}/site-engineer/material-requests").json()
    found = next((x for x in after if x["request_id"] == rid), None)
    assert found and found["status"] == "in_transit"


def _drive_to_verifying(payment_mode="pre_paid"):
    """Helper: SE → Planning → Procurement → SE receive → status=procurement_verifying"""
    se = _se_session()
    pl = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid, name=f"TEST-Verify-{payment_mode}")
    rid = req["request_id"]
    pl.patch(f"{API}/procurement-simple/material-requests/{rid}/planning-initial-approve", json={})
    proc = requests.Session()
    _login(proc, {"email": "procurement@constructionos.com", "password": "Demo@1234"})
    vendors = proc.get(f"{API}/vendor-master?category=material").json()
    vlist = vendors.get("vendors") if isinstance(vendors, dict) else vendors
    v = vlist[0]
    assign_body = {
        "vendor_id": v["vendor_id"],
        "vendor_name": v.get("name") or v.get("vendor_name"),
        "unit_price": 100,
        "approved_quantity": 5,
        "timeline_type": "days",
        "timeline_value": 5,
        "payment_mode": payment_mode,
    }
    if payment_mode == "credit":
        assign_body["credit_days"] = 30
    elif payment_mode == "advance":
        assign_body["advance_input_mode"] = "percent"
        assign_body["advance_percent"] = 30
    proc.patch(f"{API}/procurement-simple/material-requests/{rid}/assign-vendor", json=assign_body)
    # SE receives → status becomes procurement_verifying
    r = se.post(
        f"{API}/site-engineer/material-receipts/initiate",
        json={
            "request_id": rid,
            "received_qty": 5,
            "gps_latitude": 13.0,
            "gps_longitude": 80.0,
            "remarks": "ok",
        },
    )
    assert r.status_code == 200, r.text
    return se, proc, rid


def test_verify_approve_pre_paid_routes_to_accountant():
    se, proc, rid = _drive_to_verifying("pre_paid")
    # Confirm status is procurement_verifying
    items = se.get(f"{API}/site-engineer/material-requests").json()
    item = next(x for x in items if x["request_id"] == rid)
    assert item["status"] == "procurement_verifying", item
    # Procurement approves verify
    r = proc.post(
        f"{API}/procurement-simple/material-requests/{rid}/verify-approve",
        json={"invoice_no": "INV-001", "qty_match": True, "price_match": True},
    )
    assert r.status_code == 200, r.text
    # pre_paid → should route to accountant for full payment
    assert r.json()["status"] == "pending_accounts_approval"


def test_verify_reject_requires_reason():
    se, proc, rid = _drive_to_verifying("post_delivery")
    r = proc.post(f"{API}/procurement-simple/material-requests/{rid}/verify-reject", json={"reason": ""})
    assert r.status_code == 400
    r = proc.post(f"{API}/procurement-simple/material-requests/{rid}/verify-reject", json={"reason": "qty short"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "procurement_verify_rejected"


def test_verify_approve_credit_routes_to_delivered():
    _se, proc, rid = _drive_to_verifying("credit")
    r = proc.post(
        f"{API}/procurement-simple/material-requests/{rid}/verify-approve",
        json={"invoice_no": "INV-002"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "delivered"



def test_planning_initial_reject_requires_reason():
    se = _se_session()
    pl = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid)
    rid = req["request_id"]
    r = pl.patch(
        f"{API}/procurement-simple/material-requests/{rid}/planning-initial-reject",
        json={"reason": ""},
    )
    assert r.status_code == 400


def test_planning_initial_reject_then_se_resubmit():
    se = _se_session()
    pl = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid)
    rid = req["request_id"]
    # Reject
    r = pl.patch(
        f"{API}/procurement-simple/material-requests/{rid}/planning-initial-reject",
        json={"reason": "qty too high"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "planning_initial_rejected"
    # SE edits → auto-resubmit
    r = se.patch(
        f"{API}/site-engineer/material-requests/{rid}",
        json={"quantity": 3},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "planning_initial_pending"
    assert r.json()["quantity"] == 3


def test_procurement_cannot_see_initial_pending():
    se = _se_session()
    _ = _planning_session()
    pid = _first_project(se)
    req = _create_request(se, pid)
    # Procurement's pending queue must NOT contain it
    proc = requests.Session()
    _login(proc, {"email": "procurement@constructionos.com", "password": "Demo@1234"})
    proc_q = proc.get(f"{API}/procurement-simple/queue?queue=pending").json()
    assert not any(x["request_id"] == req["request_id"] for x in proc_q["requests"])


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
