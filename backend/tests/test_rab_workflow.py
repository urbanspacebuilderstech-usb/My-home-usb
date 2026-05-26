"""
End-to-end test for the Labour RAB (Running Account Bill) approval workflow.

  SE creates RAB → PM approves → QC approves → Planning approves → Accountant releases
  Also covers PM-reject → SE-resubmit loop.
"""
import os
import uuid
import requests


BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.strip().split("=", 1)[1]
API = f"{BASE}/api"

SUPER_ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}


def login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _find_open_labour_stage(s):
    projects = s.get(f"{API}/projects", timeout=30).json()
    for p in projects:
        pid = p.get("project_id")
        if not pid:
            continue
        wos = s.get(f"{API}/projects/{pid}/work-orders", timeout=30).json()
        for wo in wos:
            if wo.get("is_active") is False:
                continue
            for st in (wo.get("stages") or []):
                if st.get("is_open") and st.get("stage_status") != "finished":
                    return pid, wo["work_order_id"], st["stage_id"], wo
    return None


def test_rab_full_chain():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found:
        import pytest
        pytest.skip("No active labour WO with an open stage available")
    pid, wo_id, stage_id, wo = found
    rab_count_before = sum(len(st.get("payment_requests") or []) for st in (wo.get("stages") or []))

    # 1. SE submits RAB
    r = s.patch(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
        json={"amount": 4321, "notes": "Test RAB"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    request_id = data["request_id"]
    rab_number = data["rab_number"]
    assert rab_number == f"RAB-{rab_count_before + 1:02d}"

    # 2. PM queue picks it up
    pm_q = s.get(f"{API}/pm/labour-stage-requests?status=new", timeout=30).json()
    assert any(r["request_id"] == request_id for r in pm_q["requests"])

    # 3. PM approves
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/pm-approve",
        json={"notes": "PM ok"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pm_approved"

    # 4. QC queue + approve
    qc_q = s.get(f"{API}/qc/labour-stage-requests?status=new", timeout=30).json()
    assert any(r["request_id"] == request_id for r in qc_q["requests"])
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/qc-approve",
        json={"notes": "QC ok"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "qc_approved"

    # 5. Planning queue + approve (status='new' now maps to qc_approved)
    pl_q = s.get(f"{API}/planning/labour-stage-requests?status=new", timeout=30).json()
    assert any(r["request_id"] == request_id for r in pl_q["requests"])
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/planning-approve",
        json={"notes": "Planning ok"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "planning_approved"

    # 6. Accountant queue + release
    ac_q = s.get(f"{API}/accountant/labour-payments?status=pending", timeout=30).json()
    assert any(r["request_id"] == request_id for r in ac_q["requests"])
    r = s.post(
        f"{API}/accountant/labour-payments/{request_id}/release",
        json={
            "work_order_id": wo_id, "stage_id": stage_id,
            "payment_method": "bank", "bank_ref": f"TXN-{uuid.uuid4().hex[:6]}",
            "notes": "released by test",
        }, timeout=30,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert "approved_amount" in out
    assert out["approved_amount"] == 4321


def test_rab_pm_reject_se_resubmit():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found:
        import pytest
        pytest.skip("No active labour WO with an open stage available")
    pid, wo_id, stage_id, _wo = found

    # 1. SE submits
    r = s.patch(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
        json={"amount": 999, "notes": "reject test"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    request_id = r.json()["request_id"]

    # 2. PM rejects with reason
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/pm-reject",
        json={"reason": "needs more DLR detail"}, timeout=30,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "se_rework"

    # 3. SE queue surfaces it under rework
    rew = s.get(f"{API}/site-engineer/labour-stage-requests?status=rework", timeout=30).json()
    assert any(x["request_id"] == request_id for x in rew["requests"])

    # 4. SE resubmits with updated amount
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/se-resubmit",
        json={"amount": 1500, "notes": "added DLR"}, timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "requested"

    # 5. PM queue picks it up again
    pm_q = s.get(f"{API}/pm/labour-stage-requests?status=new", timeout=30).json()
    found_pr = next((x for x in pm_q["requests"] if x["request_id"] == request_id), None)
    assert found_pr is not None
    assert found_pr["amount"] == 1500
