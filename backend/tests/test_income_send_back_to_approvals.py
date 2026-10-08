"""Cashbook → Income → Main Income delete sends the entry back to Approvals:
   - it returns to the pending queue (and leaves the approved list),
   - its amount comes off the payment stage while it waits,
   - re-approving puts the amount back on the stage.
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


def _received(cre, project_id, stage_id):
    stages = cre.get(f"{BASE_URL}/api/projects/{project_id}/payment-stages").json()
    return float(next(s for s in stages if s["stage_id"] == stage_id).get("amount_received") or 0)


def _find(acc, status_filter, income_id):
    rows = acc.get(f"{BASE_URL}/api/approvals/unified", params={"status_filter": status_filter}).json().get("income", [])
    return next((i for i in rows if i.get("income_id") == income_id), None)


def test_cashbook_income_send_back_requeues_for_approval():
    cre = _session(CRE)
    time.sleep(1)
    acc = _session(ACCOUNTANT)
    project_id, stage_id = _collectible_stage(cre)

    ref = f"TEST_{uuid.uuid4().hex[:8]}"
    r = cre.post(f"{BASE_URL}/api/payment-stages/{stage_id}/collect", json={
        "amount_received": 1, "payment_mode": "cash", "payment_reference": ref,
    })
    assert r.status_code == 200, r.text
    pending = acc.get(f"{BASE_URL}/api/approvals/unified").json().get("income", [])
    income = next((i for i in pending if i.get("payment_reference") == ref), None)
    assert income, "collected income not in the accountant's pending list"
    income_id = income["income_id"]

    assert acc.post(f"{BASE_URL}/api/approvals/income/{income_id}/approve").status_code == 200
    assert _find(acc, "approved", income_id)

    r = acc.post(f"{BASE_URL}/api/cashbook/income/{income_id}/send-back-to-approvals")
    assert r.status_code == 200, r.text
    assert _find(acc, "approved", income_id) is None
    back = _find(acc, "pending", income_id)
    assert back and back["status"] == "pending_approval" and back.get("pulled_back_from_cashbook")
    received_waiting = _received(cre, project_id, stage_id)

    # Sending it back twice is refused — it's no longer in the Cashbook.
    assert acc.post(f"{BASE_URL}/api/cashbook/income/{income_id}/send-back-to-approvals").status_code == 400

    assert acc.post(f"{BASE_URL}/api/approvals/income/{income_id}/approve").status_code == 200
    assert _received(cre, project_id, stage_id) == pytest.approx(received_waiting + 1)
