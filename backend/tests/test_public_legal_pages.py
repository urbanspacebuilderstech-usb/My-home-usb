"""/privacy and /terms must render without a login (Oct 23 2026).

https://myhomeusb.com/privacy fell through to the login screen, because every
route except a short public list is wrapped in <ProtectedRoute>.

That matters for a specific reason: Google fetches the privacy policy and
terms URLs ANONYMOUSLY while reviewing an OAuth consent screen. A URL that
redirects to a sign-in page reads to Google as "no policy published", which
blocks the move out of "Testing" publishing status - and Testing is what
expires the Sheets refresh token every 7 days.

So these are not decorative pages, and wrapping either of them in
ProtectedRoute later would quietly undo the Google Sheets fix.
"""
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(BACKEND, "..", "frontend", "src")
APP = os.path.join(FRONTEND, "App.js")
LEGAL = os.path.join(FRONTEND, "pages", "LegalPage.jsx")


def _src(path):
    return io.open(path, encoding="utf8").read()


@pytest.mark.parametrize("path,component", [("/privacy", "PrivacyPolicy"),
                                            ("/terms", "TermsOfService")])
def test_the_route_exists(path, component):
    assert '<Route path="%s" element={<%s />} />' % (path, component) in _src(APP)


@pytest.mark.parametrize("path", ["/privacy", "/terms"])
def test_the_route_is_public(path):
    """The whole point. If either is ever wrapped, Google stops seeing a
    published policy and the OAuth app cannot leave Testing."""
    src = _src(APP)
    line = next(l for l in src.splitlines() if 'path="%s"' % path in l)
    assert "ProtectedRoute" not in line


def test_both_pages_are_exported():
    src = _src(LEGAL)
    assert "export function PrivacyPolicy()" in src
    assert "export function TermsOfService()" in src


def test_the_limited_use_disclosure_is_present():
    """Google requires this exact disclosure for sensitive scopes, which this
    app requests (spreadsheets + drive.file)."""
    src = " ".join(_src(LEGAL).split())
    assert "Google API Services User Data Policy" in src
    assert "Limited Use requirements" in src


def test_the_requested_scopes_are_described():
    src = _src(LEGAL)
    assert "spreadsheets" in src
    assert "drive.file" in src


def test_it_states_data_is_not_sold():
    src = " ".join(_src(LEGAL).split())
    assert "never sold" in src or "do not sell" in src


def test_it_tells_people_how_to_revoke_access():
    assert "myaccount.google.com/permissions" in _src(LEGAL)


def test_the_pages_carry_a_contact_address():
    src = _src(LEGAL)
    assert "urbanspacebuilderstech@gmail.com" in src


def test_the_pages_do_not_require_app_state():
    """They must render for a signed-out visitor, so no axios call, no auth
    context, no user object."""
    src = _src(LEGAL)
    for forbidden in ("axios", "useAuth", "localStorage"):
        assert forbidden not in src
    # `ProtectedRoute` is named in the file's opening comment, explaining why
    # these pages must NOT be wrapped. Check for real usage, not the word.
    assert "<ProtectedRoute" not in src


def test_they_link_to_each_other_and_back_to_login():
    src = _src(LEGAL)
    assert 'to="/privacy"' in src
    assert 'to="/terms"' in src
    assert 'to="/login"' in src


# --------------------------------------------------------------------------
# The login screen must link to them (Oct 23 2026)
#
# The login page is the ONLY page a signed-out visitor ever reaches, so it is
# the only place a link to the policy can do its job - both for Google's
# review and for a client who wants to read it.
# --------------------------------------------------------------------------

LOGIN = os.path.join(FRONTEND, "pages", "Login.jsx")


@pytest.mark.parametrize("path,label", [("/privacy", "Privacy Policy"),
                                        ("/terms", "Terms of Service")])
def test_login_links_to_the_legal_pages(path, label):
    src = _src(LOGIN)
    assert 'to="%s"' % path in src
    assert label in src


def test_login_uses_router_links_not_anchors():
    """A raw <a href> would full-page reload the SPA."""
    src = _src(LOGIN)
    block = src[src.index('to="/privacy"') - 400:src.index('to="/terms"') + 400]
    assert "<Link" in block
    assert 'href="/privacy"' not in src
    assert 'href="/terms"' not in src


def test_the_links_sit_above_the_background():
    """The login screen's decorative circles are absolutely positioned across
    the whole viewport; without a stacking context the links can end up
    underneath them."""
    src = _src(LOGIN)
    block = src[src.index("absolute bottom-0 left-0"):]
    assert "z-10" in block[:200]
