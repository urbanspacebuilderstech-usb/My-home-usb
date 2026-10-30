"""Login-page Diwali animation window (Oct 30 2026).

HR / Super Admin set a start date and a number of days in HR Portal →
Settings → Animation; /api/branding reports whether today (IST) falls inside.
"""
import ast
import io
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

BRANDING = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "routes", "branding.py")


def _load():
    src = io.open(BRANDING, encoding="utf8").read()
    ns = {"date": date, "datetime": datetime, "timedelta": timedelta, "timezone": timezone, "Optional": Optional}
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "IST" for t in node.targets):
            exec(ast.get_source_segment(src, node), ns)
        if isinstance(node, ast.FunctionDef) and node.name == "login_animation_window":
            exec(ast.get_source_segment(src, node), ns)
    return ns["login_animation_window"]


window = _load()
DOC = {"login_animation_start": "2026-11-05", "login_animation_days": 5}


def test_five_days_from_nov_5_ends_nov_9():
    w = window(DOC, date(2026, 11, 5))
    assert w == {"active": True, "start_date": "2026-11-05", "days": 5, "end_date": "2026-11-09"}


def test_active_on_first_and_last_day_only():
    assert window(DOC, date(2026, 11, 4))["active"] is False
    assert window(DOC, date(2026, 11, 5))["active"] is True
    assert window(DOC, date(2026, 11, 9))["active"] is True
    assert window(DOC, date(2026, 11, 10))["active"] is False


def test_not_configured_or_cleared_is_off():
    assert window({}, date(2026, 11, 5))["active"] is False
    assert window({"login_animation_start": None, "login_animation_days": 0}, date(2026, 11, 5))["active"] is False
    assert window({"login_animation_start": "2026-11-05", "login_animation_days": 0}, date(2026, 11, 5))["active"] is False


def test_bad_stored_date_is_off_not_an_error():
    assert window({"login_animation_start": "05-11-2026", "login_animation_days": 3}, date(2026, 11, 5))["active"] is False
