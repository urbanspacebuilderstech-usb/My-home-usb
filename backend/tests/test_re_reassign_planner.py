"""Reassigning a Rough Estimate to another planner (Oct 23 2026).

Planning > Dashboard > Rough Estimates showed WHO had claimed each RE
("Aloysius Clement C J (Planning Person)") but gave no way to change it.
`start_re_work` is self-claim only - a planner takes an unclaimed RE - so when
the assigned person was on leave, had left, or the Planning Head simply wanted
the work moved, the only route was editing the database by hand.

The handover must not disturb the estimate itself: status, estimate lines and
approval history stay exactly as they are. Only `prepared_by` changes.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRM = os.path.join(BACKEND, "routes", "crm.py")
PAGE = os.path.join(BACKEND, "..", "frontend", "src", "pages", "REProjectsPage.jsx")


def _src(path=CRM):
    return io.open(path, encoding="utf8").read()


def _fn(name):
    for node in ast.walk(ast.parse(_src())):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError("%s not found" % name)


# --------------------------------------------------------------------------
# Who may reassign
# --------------------------------------------------------------------------

def test_a_planning_person_cannot_move_someone_elses_work():
    """They claim their own REs through Start Work. Reassigning another
    planner's in-progress estimate is a different authority."""
    src = _src()
    block = src[src.index("RE_REASSIGN_ROLES = ["):]
    block = block[:block.index("]")]
    assert "PLANNING_PERSON" not in block
    for role in ("SUPER_ADMIN", "PLANNING", "GENERAL_MANAGER"):
        assert role in block


def test_the_endpoint_enforces_it_server_side():
    """The UI hides the control, but the rule has to hold without the UI."""
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert "if user.role not in RE_REASSIGN_ROLES:" in body
    assert "status_code=403" in body


def test_the_frontend_gate_matches_the_server():
    src = _src(PAGE)
    assert "const canReassign = ['planning', 'super_admin', 'general_manager'].includes(user?.role);" in src


# --------------------------------------------------------------------------
# Who can receive one
# --------------------------------------------------------------------------

def test_both_planner_roles_can_receive_an_re():
    """The request was 'another planning person OR the planning head'."""
    src = _src()
    assert "RE_PLANNER_ROLES = [UserRole.PLANNING_PERSON.value, UserRole.PLANNING.value]" in src


def test_the_target_must_be_an_active_planner():
    """Otherwise an RE could be parked on a disabled account or on someone
    with no planning role at all."""
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert 'RE_PLANNER_ROLES' in body
    assert 'is_active' in body
    assert "not an active Planning Person or Planning Head" in body


def test_the_planner_list_only_returns_active_planners():
    body = ast.get_source_segment(_src(), _fn("list_re_planners"))
    assert "RE_PLANNER_ROLES" in body
    assert "is_active" in body


def test_each_planner_is_labelled_by_role():
    """So the picker distinguishes the Planning Head from a Planning Person."""
    body = ast.get_source_segment(_src(), _fn("list_re_planners"))
    assert "Planning Head" in body
    assert "Planning Person" in body


# --------------------------------------------------------------------------
# What the handover must NOT touch
# --------------------------------------------------------------------------

def test_the_estimate_itself_is_left_alone():
    """Only the assignee changes - not status, not the estimate lines, not
    the approval history. Reopening an approved RE by reassigning it would
    be a far worse bug than the missing feature."""
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    update = body[body.index("update = {"):body.index("await db.re_projects.update_one")]
    for forbidden in ('"status"', '"items"', '"gm_approved', '"total', '"estimate'):
        assert forbidden not in update
    assert '"prepared_by"' in update
    assert '"prepared_by_name"' in update


def test_only_the_re_projects_collection_is_written():
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    writes = [l for l in body.splitlines() if ".update_one(" in l or ".delete_one(" in l]
    assert writes, "expected at least one write"
    assert all("db.re_projects.update_one" in l for l in writes), writes


def test_reassigning_to_the_same_person_is_a_no_op():
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert "if previous_id == planner" in body
    assert '"changed": False' in body


# --------------------------------------------------------------------------
# Traceability
# --------------------------------------------------------------------------

def test_who_moved_it_and_from_whom_is_recorded():
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    for field in ("reassigned_at", "reassigned_by", "reassigned_from",
                  "reassigned_from_name"):
        assert field in body


def test_both_planners_are_notified():
    """The new owner needs to know they have it; the old owner needs to know
    they no longer do."""
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert body.count("create_notification(") == 2
    assert "was assigned to you by" in body
    assert "was reassigned to" in body


def test_a_failed_notification_does_not_fail_the_reassignment():
    """The write already happened; losing the whole call to a notification
    error would leave the user thinking nothing changed."""
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert body.index("await db.re_projects.update_one") < body.index("create_notification(")
    assert "except Exception as e:" in body


def test_it_writes_an_audit_log():
    body = ast.get_source_segment(_src(), _fn("reassign_re_planner"))
    assert "create_audit_log" in body
    assert "re_reassign_planner" in body


# --------------------------------------------------------------------------
# Routing and UI
# --------------------------------------------------------------------------

def test_planners_route_is_declared_before_the_id_route():
    """FastAPI matches in declaration order - declared after
    /crm/re-projects/{re_project_id}, 'planners' would be read as an id."""
    src = _src()
    assert src.index('@router.get("/crm/re-projects/planners")') < \
        src.index('@router.get("/crm/re-projects/{re_project_id}")')


def test_the_chip_is_clickable_for_permitted_roles():
    src = _src(PAGE)
    assert "onClick={() => openReassign(project)}" in src
    assert "canReassign ? (" in src


def test_everyone_else_still_sees_the_plain_badge():
    """The information must not disappear for a Planning Person."""
    src = _src(PAGE)
    tail = src[src.index("canReassign ? ("):]
    assert "<Badge" in tail[:1600]


def test_save_is_disabled_when_nothing_would_change():
    src = _src(PAGE)
    assert "selectedPlanner === reassignProject?.prepared_by" in src


def test_the_dialog_says_what_is_preserved():
    """A Planning Head reassigning an approved RE needs to know it will not
    be reset."""
    src = " ".join(_src(PAGE).split())
    assert "status and its history stay as they are" in src
