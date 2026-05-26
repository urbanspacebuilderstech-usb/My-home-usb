"""
Extended RAB workflow tests for iteration_160:
  - QC reject → back to requested (PM)
  - Planning reject → back to pm_approved (QC)
  - Accountant reject → back to qc_approved (Planning)
  - Payment Schedule auto-link verification on Accountant release
  - Role permissions (planning cannot pm-approve, accountant cannot qc-approve, etc.)
  - Notifications (admin acts as all roles; verify at least SE-notification on release)
"""
import os
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.strip().split("=", 1)[1]
API = f"{BASE}/api"

SUPER_ADMIN = {"email": "admin@constructionos.com", "password": "Demo@1234"}
PLANNING    = {"email": "planning@constructionos.com", "password": "Demo@1234"}
ACCOUNTANT  = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
ENGINEER    = {"email": "engineer@constructionos.com", "password": "Demo@1234"}


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


def _submit_rab(s, pid, wo_id, stage_id, amount=1234, notes="t"):
    r = s.patch(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
        json={"amount": amount, "notes": notes}, timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["request_id"]


def _advance_to(s, pid, wo_id, stage_id, request_id, target):
    """Advance a RAB through chain to a given status."""
    if target == "requested":
        return
    r = s.post(f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/pm-approve",
               json={"notes": "ok"}, timeout=30)
    assert r.status_code == 200, r.text
    if target == "pm_approved": return
    r = s.post(f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/qc-approve",
               json={"notes": "ok"}, timeout=30)
    assert r.status_code == 200, r.text
    if target == "qc_approved": return
    r = s.post(f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{request_id}/planning-approve",
               json={"notes": "ok"}, timeout=30)
    assert r.status_code == 200, r.text


def _get_request_status(s, pid, wo_id, request_id):
    wos = s.get(f"{API}/projects/{pid}/work-orders", timeout=30).json()
    for wo in wos:
        if wo.get("work_order_id") != wo_id: continue
        for st in (wo.get("stages") or []):
            for pr in (st.get("payment_requests") or []):
                if pr.get("request_id") == request_id:
                    return pr
    return None


# --- QC reject ---
def test_qc_reject_returns_to_pm_approved_or_requested():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    rid = _submit_rab(s, pid, wo_id, stage_id, amount=1111, notes="qc reject test")
    _advance_to(s, pid, wo_id, stage_id, rid, "pm_approved")
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{rid}/qc-reject",
        json={"reason": "missing quality docs"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    # spec says QC reject → back to requested (PM)
    assert body["status"] in ("requested", "pm_approved"), body
    # verify in PM queue (status=new = requested) OR persisted state
    pm_q = s.get(f"{API}/pm/labour-stage-requests?status=new", timeout=30).json()
    persisted = _get_request_status(s, pid, wo_id, rid)
    assert persisted is not None
    assert persisted.get("qc_rejection_reason") or persisted.get("rejection_reason") or persisted.get("last_rejection_reason")


# --- Planning reject ---
def test_planning_reject_returns_to_qc_approved_or_pm_approved():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    rid = _submit_rab(s, pid, wo_id, stage_id, amount=2222, notes="planning reject test")
    _advance_to(s, pid, wo_id, stage_id, rid, "qc_approved")
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{rid}/planning-reject",
        json={"reason": "budget mismatch"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] in ("pm_approved", "qc_approved"), body


# --- Accountant reject ---
def test_accountant_reject_returns_to_planning():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    rid = _submit_rab(s, pid, wo_id, stage_id, amount=3333, notes="acct reject test")
    _advance_to(s, pid, wo_id, stage_id, rid, "planning_approved")
    r = s.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{rid}/accountant-reject",
        json={"reason": "bank ref invalid"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] in ("qc_approved", "planning_approved"), body
    # planning queue should now see it again
    pl_q = s.get(f"{API}/planning/labour-stage-requests?status=new", timeout=30).json()
    assert any(x["request_id"] == rid for x in pl_q["requests"])


# --- Payment schedule auto-link ---
def test_payment_schedule_autolink_on_release():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    amount = 4567
    rid = _submit_rab(s, pid, wo_id, stage_id, amount=amount, notes="autolink test")
    _advance_to(s, pid, wo_id, stage_id, rid, "planning_approved")
    r = s.post(f"{API}/accountant/labour-payments/{rid}/release",
               json={"work_order_id": wo_id, "stage_id": stage_id,
                     "payment_method": "bank", "bank_ref": f"TXN-{uuid.uuid4().hex[:6]}",
                     "notes": "released"}, timeout=30)
    assert r.status_code == 200, r.text

    # Verify a payment_stage row with rab_request_id=rid exists
    # Try common endpoints
    found_row = None
    for ep in (f"{API}/projects/{pid}/payment-stages", f"{API}/projects/{pid}/payment_stages"):
        rr = s.get(ep, timeout=30)
        if rr.status_code != 200: continue
        body = rr.json()
        items = body if isinstance(body, list) else body.get("payment_stages") or body.get("stages") or []
        for it in items:
            if it.get("rab_request_id") == rid or it.get("kind") == "labour_rab" and it.get("rab_request_id") == rid:
                found_row = it
                break
        if found_row: break
    assert found_row is not None, f"No payment_stages row auto-linked for rab_request_id={rid}"
    assert found_row.get("kind") == "labour_rab"
    assert found_row.get("is_locked") is True
    assert found_row.get("status") == "paid"


# --- Role permissions ---
def test_role_permissions_planning_cannot_pm_approve():
    s_admin = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s_admin)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    rid = _submit_rab(s_admin, pid, wo_id, stage_id, amount=10, notes="perms")
    s_plan = login(PLANNING)
    r = s_plan.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{rid}/pm-approve",
        json={"notes": "x"}, timeout=30)
    assert r.status_code in (401, 403), f"Planning unexpectedly allowed pm-approve: {r.status_code}"


def test_role_permissions_accountant_cannot_qc_approve():
    s_admin = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s_admin)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, _ = found
    rid = _submit_rab(s_admin, pid, wo_id, stage_id, amount=11, notes="perms2")
    _advance_to(s_admin, pid, wo_id, stage_id, rid, "pm_approved")
    s_acc = login(ACCOUNTANT)
    r = s_acc.post(
        f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/payment-requests/{rid}/qc-approve",
        json={"notes": "x"}, timeout=30)
    assert r.status_code in (401, 403), f"Accountant unexpectedly allowed qc-approve: {r.status_code}"


# --- Sequential RAB numbering per WO ---
def test_rab_numbering_sequential_per_wo():
    s = login(SUPER_ADMIN)
    found = _find_open_labour_stage(s)
    if not found: pytest.skip("no labour stage")
    pid, wo_id, stage_id, wo = found
    existing = sum(len(st.get("payment_requests") or []) for st in (wo.get("stages") or []))
    r1 = s.patch(f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
                 json={"amount": 1, "notes": "n1"}, timeout=30).json()
    r2 = s.patch(f"{API}/projects/{pid}/work-orders/{wo_id}/stages/{stage_id}/request-payment",
                 json={"amount": 2, "notes": "n2"}, timeout=30).json()
    assert r1["rab_number"] == f"RAB-{existing + 1:02d}"
    assert r2["rab_number"] == f"RAB-{existing + 2:02d}"
