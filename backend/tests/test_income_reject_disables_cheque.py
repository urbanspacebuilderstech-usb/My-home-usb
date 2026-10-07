"""Accountant rejecting a CRE cheque collection:
   - the cheque leaves Cheque Management's live tabs (disabled, with the reason),
   - the stage carries the rejection reason so CRE sees Re-Collect,
   - a fresh collection clears that reason.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

ACCOUNTANT = {"email": "accountant@constructionos.com", "password": "Demo@1234"}
CRE = {"email": "cre@constructionos.com", "password": "Demo@1234"}


def _session(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code == 429:
        pytest.skip("Rate limited - wait and retry")
    assert r.status_code == 200, r.text
    return s


def _collectible_stage(cre):
    for project in cre.get(f"{BASE_URL}/api/projects").json():
        r = cre.get(f"{BASE_URL}/api/projects/{project['project_id']}/payment-stages")
        if r.status_code != 200:
            continue
        for st in r.json():
            if st.get("is_addition"):
                continue
            if (st.get("amount") or 0) - (st.get("amount_received") or 0) >= 2:
                return project["project_id"], st["stage_id"]
    pytest.skip("No collectible payment stage found")


def _stage(cre, project_id, stage_id):
    stages = cre.get(f"{BASE_URL}/api/projects/{project_id}/payment-stages").json()
    return next(s for s in stages if s["stage_id"] == stage_id)


def _collect_cheque(cre, stage_id, cheque_number):
    ref = f"TEST_{uuid.uuid4().hex[:8]}"
    r = cre.post(f"{BASE_URL}/api/payment-stages/{stage_id}/collect", json={
        "amount_received": 1,
        "payment_mode": "cheque",
        "payment_reference": ref,
        "cheque_details": [{"cheque_number": cheque_number, "bank_name": "TEST", "amount": 1}],
    })
    assert r.status_code == 200, r.text
    return ref


def test_reject_disables_cheque_and_flags_stage_until_recollect():
    cre = _session(CRE)
    time.sleep(1)
    acc = _session(ACCOUNTANT)
    project_id, stage_id = _collectible_stage(cre)

    cheque_number = f"T{uuid.uuid4().hex[:6]}"
    ref = _collect_cheque(cre, stage_id, cheque_number)
    pending = acc.get(f"{BASE_URL}/api/approvals/unified").json().get("income", [])
    income = next((i for i in pending if i.get("payment_reference") == ref), None)
    assert income, "collected income not in the accountant's pending list"

    r = acc.post(f"{BASE_URL}/api/approvals/income/{income['income_id']}/reject", params={"reason": "wrong cheque no"})
    assert r.status_code == 200, r.text
    assert cheque_number in r.json().get("cheques_disabled", [])

    cheque = next(c for c in acc.get(f"{BASE_URL}/api/accountant/cheques").json() if c.get("cheque_number") == cheque_number)
    assert cheque["is_disabled"] is True
    assert "wrong cheque no" in cheque["disable_reason"]

    st = _stage(cre, project_id, stage_id)
    assert st["workflow_status"] == "requested"
    assert st.get("accountant_rejection_reason") == "wrong cheque no"

    # Re-collect with the corrected cheque — the rejection flag clears.
    _collect_cheque(cre, stage_id, f"T{uuid.uuid4().hex[:6]}")
    st = _stage(cre, project_id, stage_id)
    assert not st.get("accountant_rejection_reason")
