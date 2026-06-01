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
