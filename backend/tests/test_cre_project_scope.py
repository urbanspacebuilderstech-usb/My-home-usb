"""A CRE sees only the projects allocated to them (Oct 21 2026).

Divya V was added as CRE on one project via Planning > Project Team, then her
CRE Board showed all 63 projects and 575 payment-schedule rows. Clicking into
a project that was not hers answered "Permission denied — project not
assigned to you", so the board and the project page disagreed.

The codebase contradicted itself. These already scoped strictly:

    GET /projects                 "Legacy strict mode: no orphan-pool visibility"
    /cre/final-estimates          team.cre or created_by
    /cre/additional-costs         team.cre or created_by
    GET /projects/{id}            403 when neither

while the CRE Board's own helper had been blanked:

    def _cre_project_scope_filter(user):
        # Spec change (Feb 8, 2026): CRE users now see the full project pool
        return {}

and /planning/monthly-schedule — the Payment Schedule tab — had never had any
CRE filter at all.

That Feb 2026 reversal answered a real complaint: one login (super admin) saw
25 pending and another (CRE Arthi K) saw 2, because a project with no
`team.cre` is invisible to every CRE. Restoring the scope brings that risk
back, and it was restored on an explicit decision with that trade-off stated.
If a CRE board looks empty, assign a CRE on the Project Team tab - do not
blank the helper again, or the board goes back out of step with the four
screens above.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPS = os.path.join(BACKEND, "routes", "operations.py")
PRECON = os.path.join(BACKEND, "routes", "pre_construction.py")
PROJECTS = os.path.join(BACKEND, "routes", "projects.py")
FE = os.path.join(BACKEND, "routes", "final_estimates.py")


def _src(path=OPS):
    return io.open(path, encoding="utf8").read()


def _fn(name, path=OPS):
    for node in ast.walk(ast.parse(_src(path))):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError("%s not found in %s" % (name, path))


# --------------------------------------------------------------------------
# The filter itself
# --------------------------------------------------------------------------

def scope(role, user_id):
    """Mirrors _cre_project_scope_filter."""
    if role != "cre":
        return {}
    return {"$or": [{"team.cre": user_id}, {"created_by": user_id}]}


def test_a_cre_is_scoped_to_their_own_projects():
    assert scope("cre", "user_divya") == {
        "$or": [{"team.cre": "user_divya"}, {"created_by": "user_divya"}]}


@pytest.mark.parametrize("role", ["super_admin", "sales_head", "accountant",
                                  "planning", "general_manager"])
def test_every_other_role_is_untouched(role):
    """The filter may only ever narrow a CRE login. An empty dict means the
    caller skips the restriction entirely."""
    assert scope(role, "user_x") == {}


def test_the_old_helper_returned_nothing_for_everyone():
    """What the bug was: a CRE got the same unrestricted view as an admin."""
    assert {} == {}          # the previous body, in full
    assert scope("cre", "user_divya") != {}


def test_two_cres_do_not_see_each_others_projects():
    a = scope("cre", "user_divya")["$or"]
    b = scope("cre", "user_arthi")["$or"]
    assert a != b


def test_a_creator_still_sees_what_they_made():
    """Without created_by, a CRE loses a project the moment someone else is
    put in the team slot - including one they raised themselves."""
    assert {"created_by": "user_divya"} in scope("cre", "user_divya")["$or"]


# --------------------------------------------------------------------------
# It is actually applied
# --------------------------------------------------------------------------

def test_the_helper_is_no_longer_a_no_op():
    body = ast.get_source_segment(_src(), _fn("_cre_project_scope_filter"))
    assert '{"$or": [{"team.cre": user.user_id}, {"created_by": user.user_id}]}' in body
    assert "if user.role != UserRole.CRE:" in body


def test_the_payment_schedule_is_scoped():
    """The tab that showed 575 rows. It had no CRE filter of any kind."""
    body = ast.get_source_segment(_src(), _fn("get_monthly_schedule"))
    assert "_cre_scope = _cre_project_scope_filter(user)" in body
    assert "row.get(\"project_id\") in _allowed_ids" in body


def test_the_payment_schedule_filters_before_its_totals():
    """Otherwise the summary and the tab counts would describe rows the CRE
    cannot see."""
    body = ast.get_source_segment(_src(), _fn("get_monthly_schedule"))
    assert body.index("enriched = [row for row in enriched") < body.index("total_planned = sum(")


def test_cheque_management_is_scoped():
    """A cheque carries the client's name and amount."""
    body = ast.get_source_segment(_src(), _fn("get_cre_cheques"))
    assert "_cre_project_scope_filter(user)" in body
    assert '"project_id"' in body


def test_asking_for_someone_elses_project_returns_nothing():
    """?project_id= must not bypass the scope."""
    allowed, asked = {"p1", "p2"}, "p9"
    assert sorted(allowed & {asked}) == []


def test_pre_construction_is_scoped():
    body = ast.get_source_segment(_src(PRECON), _fn("list_pre_construction", PRECON))
    assert '{"team.cre": user.user_id}' in body
    assert "if user.role == UserRole.CRE:" in body


@pytest.mark.parametrize("fn", ["get_cre_income_collected",
                                "get_cre_additional_payment_requests",
                                "get_cre_pending_approvals"])
def test_the_screens_that_already_called_the_helper_still_do(fn):
    """They were written to handle a non-empty filter and were only inert
    because the helper returned {}. If one drops the call, it silently goes
    back to showing everything."""
    try:
        body = ast.get_source_segment(_src(), _fn(fn))
    except AssertionError:
        pytest.skip("%s not present under that name" % fn)
    assert "_cre_project_scope_filter(user)" in body


def test_the_helper_is_called_by_several_screens():
    src = _src()
    assert src.count("_cre_project_scope_filter(user)") >= 7


# --------------------------------------------------------------------------
# The screens that always scoped must keep doing so
# --------------------------------------------------------------------------

def test_the_projects_list_still_scopes():
    src = _src(PROJECTS)
    assert '{"team.cre": user.user_id},' in src
    assert "Legacy strict mode: no orphan-pool visibility" in src


def test_opening_one_project_still_refuses():
    """The 403 that made the inconsistency visible in the first place."""
    src = _src(PROJECTS)
    assert "Permission denied — project not assigned to you" in src


def test_final_estimates_still_scopes():
    assert '{"team.cre": user.user_id},' in _src(FE)


def test_additional_costs_still_scopes():
    src = _src(PROJECTS)
    assert '{"$or": [{"team.cre": user.user_id}, {"created_by": user.user_id}]}' in src


# --------------------------------------------------------------------------
# The reversal risk is written down
# --------------------------------------------------------------------------

def test_the_history_is_documented():
    """This has been changed twice. The next person needs both halves, or
    the first empty-looking board turns it back into `return {}`."""
    body = ast.get_source_segment(_src(), _fn("_cre_project_scope_filter"))
    assert "Feb 8 2026" in body
    assert "Oct 21 2026" in body
    assert "Arthi K" in body
    assert "assign a CRE on the Project" in " ".join(body.split())
    assert "Team tab" in body
