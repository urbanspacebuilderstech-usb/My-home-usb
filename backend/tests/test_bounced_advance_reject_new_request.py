"""A rejected bounced advance goes back to New Request (Oct 29 2026).

USB-MR2449 (Harish Test 2, Vinoth Test, full advance ₹143): paid, delivered,
completed, then cheque #1111 bounced and the request came back to Accounts.
Accounts rejected it and it went to Purchase Verification, and its
cheque_bounced flag kept it on the Accountant list as well. Now:
- a bounced advance (full or part) goes to New Request at any stage, and
  re-approving it restarts the order (the SE collects again, qty not doubled);
- a bounced post-payment or balance cheque still goes to Purchase Verification;
- the flag is cleared, so the request leaves the Accountant list.
Checked end to end against a local Mongo with the routes called directly
(full advance, post payment, the old stuck state, a part advance bounced
before verification, a bounced balance).
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(BACKEND, "routes", "procurement.py")
SITE = os.path.join(BACKEND, "routes", "site_ops.py")


def _seg(path, name):
    src = io.open(path, encoding="utf8").read()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found")


def test_bounced_advance_goes_to_new_request():
    seg = _seg(SITE, "accountant_reject_material_request")
    assert 'target_status = "procurement_revision" if await _rejecting_the_advance(request) else "procurement_verifying"' in seg
    assert seg.index("_rejecting_the_advance(request)") < seg.index("await _bills_back_from_accounts(")
    helper = _seg(PROC, "_rejecting_the_advance")
    assert 'req.get("status") == "pending_advance_payment"' in helper
    assert '"payment_phase": "advance", "cheque_bounced": True' in helper


def test_reject_clears_the_bounce_and_takes_the_stuck_state():
    seg = _seg(SITE, "accountant_reject_material_request")
    assert '"cheque_bounced": False,' in seg
    assert 'request.get("cheque_bounced") and current_status in ("procurement_verifying", "accounts_rejected")' in seg
    assert '{"$unset": {"reopened_by_bounce_from_status": ""}} if target_status == "procurement_revision"' in seg


def test_re_approving_it_restarts_the_order():
    ns = {}
    exec(_seg(PROC, "_accounts_rejected_on_site"), ns)
    f = ns["_accounts_rejected_on_site"]
    base = {"status": "procurement_revision", "received_at": "2026-10-29T08:00:00+00:00",
            "accounts_rejected_at": "2026-10-29T10:00:00+00:00"}
    assert f(base)
    assert not f({**base, "received_at": None})  # advance rejected before transit
    assert not f({**base, "se_rejected_verification_at": "2026-10-29T11:00:00+00:00"})
    assert not f({**base, "revision_requested_at": "2026-10-29T11:00:00+00:00"})
    assert not f({**base, "accounts_rejected_at": "2026-10-28T10:00:00+00:00"})
