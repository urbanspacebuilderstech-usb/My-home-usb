"""Why the Google Sheets integration drops out every week (Oct 23 2026).

Marketing Board > Google Sheets shows "Reconnect Required" roughly once a
week, and each report started from scratch because the reason only ever
reached the application log.

The OAuth code is already correct: access_type=offline, prompt=consent (so a
refresh_token is always issued), the refresh_token is persisted, it refreshes
on expiry, and on invalid_grant it clears the token and raises the Reconnect
banner. There is no retry or token handling left to fix.

A SEVEN DAY cadence is a Google Cloud Console setting, not a code path:
Google expires the refresh token of an OAuth app whose publishing status is
"Testing" after 7 days, and both scopes this integration requests
(spreadsheets, drive.file) are sensitive, so a Testing app can never hold a
grant longer than that.

So the change here records evidence rather than attempting a fix: Google's
own error text, and how long the grant actually survived. Seven days with
invalid_grant means Testing mode; anything else points at revocation - a
password change, access removed at myaccount.google.com/permissions, or a
rotated client secret.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRM = os.path.join(BACKEND, "routes", "crm.py")


def _src():
    return io.open(CRM, encoding="utf8").read()


def _fn(name):
    for node in ast.walk(ast.parse(_src())):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError("%s not found" % name)


# --------------------------------------------------------------------------
# The OAuth flow must keep asking for a refresh token
# --------------------------------------------------------------------------

def test_the_flow_still_requests_offline_access():
    """Without access_type=offline Google returns no refresh_token at all and
    the connection would die in ONE HOUR, not one week."""
    assert "access_type='offline'" in _src()


def test_the_flow_still_forces_consent():
    """Google only re-issues a refresh_token on a fresh consent."""
    assert "prompt='consent select_account'" in _src()


def test_the_refresh_token_is_persisted():
    assert '"refresh_token": creds.refresh_token,' in _src()


def test_both_sensitive_scopes_are_still_requested():
    """These are why a Testing app is capped at 7 days. If the integration
    ever drops to a non-sensitive scope set, the cap no longer applies and
    this diagnosis changes."""
    src = _src()
    assert "https://www.googleapis.com/auth/spreadsheets" in src
    assert "https://www.googleapis.com/auth/drive.file" in src


# --------------------------------------------------------------------------
# The failure is now recorded, not just logged
# --------------------------------------------------------------------------

def test_the_refresh_error_is_stored():
    body = ast.get_source_segment(_src(), _fn("get_sheets_credentials"))
    assert '"last_refresh_error": err_str[:500],' in body
    assert '"last_refresh_error_at": _now_iso,' in body


def test_the_grant_age_is_stored_with_the_error():
    """7 days vs 40 days is what separates Testing mode from revocation."""
    body = ast.get_source_segment(_src(), _fn("get_sheets_credentials"))
    assert '"last_refresh_error_token_issued_at": token_doc.get("created_at"),' in body


def test_a_non_revoking_error_does_not_wipe_the_connection():
    """A transient network failure must not log the user out of Google. Only
    invalid_grant / revoked / expired clears the token."""
    body = ast.get_source_segment(_src(), _fn("get_sheets_credentials"))
    assert "if is_revoked:" in body
    assert "await db.google_sheets_tokens.delete_one" in body
    # the reconnect banner is only raised on a real revocation
    assert '{"is_connected": False, "needs_reconnect": True,' in body


def test_a_revoking_error_still_raises_the_banner():
    body = ast.get_source_segment(_src(), _fn("get_sheets_credentials"))
    for marker in ("invalid_grant", "revoked", "expired"):
        assert marker in body


# --------------------------------------------------------------------------
# The diagnostic
# --------------------------------------------------------------------------

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "bulk_write", "drop",
    "create_index",
}


def test_the_diagnostic_cannot_write():
    for node in ast.walk(_fn("sheets_connection_health")):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "attr", None) or getattr(node.func, "id", None)
            assert name not in WRITE_METHODS, name


def test_the_diagnostic_leaks_no_secrets():
    """It reports whether a token exists, never its value, and never the
    OAuth client secret."""
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert '"has_refresh_token": bool((tok or {}).get("refresh_token")),' in body
    for secret in ('"access_token": tok', '"refresh_token": tok', "client_secret"):
        assert secret not in body


def test_the_diagnostic_is_super_admin_only():
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "user.role != UserRole.SUPER_ADMIN" in body


def test_it_recognises_the_seven_day_signature():
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "5.0 <= grant_age <= 9.0" in body


def test_it_offers_the_other_explanation_too():
    """If the grant did not live ~7 days, Testing mode is the wrong answer
    and the diagnostic must say so rather than assert its favourite theory."""
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "is NOT the 7-day Testing-mode" in body
    assert "revocation" in body


def test_it_says_where_the_fix_actually_lives():
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "Publishing status" in body
    assert "Internal" in body


def test_it_admits_when_it_has_no_evidence_yet():
    """The field is new, so it is empty until the NEXT disconnection. Saying
    'no failure recorded' must not read as 'nothing is wrong'."""
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "No refresh failure has been recorded yet" in body


def test_it_is_marked_temporary():
    body = ast.get_source_segment(_src(), _fn("sheets_connection_health"))
    assert "TEMPORARY" in body
