"""Guards the field projections added to /planning/monthly-schedule (Sep 16 2026).

CRE Board > Payment Schedule opens on "All Months", which reads every payment
stage in the system. That read now uses a field projection instead of pulling
whole documents.

A projection is only safe while it covers every field the endpoint actually
reads. If someone later adds `stage.get("new_field")` without adding it to
STAGE_FIELDS, the value silently arrives as None in production - a data bug
with no error attached, on a finance screen.

So these tests do not hardcode a field list. They re-derive it from the source
by walking every attribute access on a stage-bound variable, and assert the
projection still covers it. The test fails the moment the code outgrows it.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPERATIONS = os.path.join(BACKEND, "routes", "operations.py")

# Variable names that hold a payment_stage document inside the endpoint.
# Verified against the source: `for stage in stages_cursor`, the
# `[s for s in stages_cursor ...]` filter, and `stage = m["stage"]`.
# Every nested helper names its parameter `stage`.
STAGE_VARS = {"stage", "s", "st"}
MANUAL_VARS = {"e", "manual", "entry", "planned_entry"}


def _endpoint():
    src = io.open(OPERATIONS, encoding="utf8").read()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and node.name == "get_monthly_schedule":
            return node, src
    raise AssertionError("get_monthly_schedule not found")


def _fields_read(varnames, subscript_key=None):
    """Every literal field read off `varnames` (and optionally m["stage"])."""
    fn, src = _endpoint()
    found = set()
    for node in ast.walk(fn):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "get" and node.args
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)):
            base, field = node.func.value, node.args[0].value
            if isinstance(base, ast.Name) and base.id in varnames:
                found.add(field)
            elif subscript_key and isinstance(base, ast.Subscript):
                seg = ast.get_source_segment(src, base) or ""
                if f'"{subscript_key}"' in seg or f"'{subscript_key}'" in seg:
                    found.add(field)
        if (isinstance(node, ast.Subscript)
                and isinstance(node.slice, ast.Constant)
                and isinstance(node.slice.value, str)
                and isinstance(node.value, ast.Name)
                and node.value.id in varnames):
            found.add(node.slice.value)
    return found


def _projection(name):
    """The literal dict assigned to STAGE_FIELDS / MANUAL_FIELDS."""
    fn, _ = _endpoint()
    for node in ast.walk(fn):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == name:
                    return {k.value: v.value for k, v in
                            zip(node.value.keys, node.value.values)
                            if isinstance(k, ast.Constant)}
    raise AssertionError(f"{name} not found in get_monthly_schedule")


def test_stage_projection_covers_every_field_read():
    proj = _projection("STAGE_FIELDS")
    included = {k for k, v in proj.items() if v == 1}
    missing = _fields_read(STAGE_VARS, subscript_key="stage") - included
    assert not missing, (
        "These payment_stage fields are read but NOT in STAGE_FIELDS, so they "
        f"would arrive as None in production: {sorted(missing)}"
    )


def test_manual_projection_covers_every_field_read():
    proj = _projection("MANUAL_FIELDS")
    included = {k for k, v in proj.items() if v == 1}
    # `m` is the internal wrapper dict, not a monthly_schedule_entries doc.
    missing = _fields_read(MANUAL_VARS) - included - {"stage", "manual_entry"}
    assert not missing, (
        "These monthly_schedule_entries fields are read but NOT in "
        f"MANUAL_FIELDS: {sorted(missing)}"
    )


@pytest.mark.parametrize("name", ["STAGE_FIELDS", "MANUAL_FIELDS"])
def test_projection_excludes_id_and_is_inclusive(name):
    proj = _projection(name)
    assert proj.get("_id") == 0, f"{name} must exclude _id"
    assert all(v == 1 for k, v in proj.items() if k != "_id"), \
        "mixing exclusions into an inclusion projection is a MongoDB error"


def test_raw_stage_never_spread_into_response():
    """The projection is only safe because rows are built from explicit keys.

    A `{**stage}` anywhere would put unprojected fields on the wire and make
    narrowing the fetch a visible API change.
    """
    fn, src = _endpoint()
    for node in ast.walk(fn):
        if isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if key is None:  # ** unpacking
                    seg = ast.get_source_segment(src, value) or ""
                    assert "stage" not in seg, \
                        f"stage document spread into a response dict: {seg[:60]}"


def test_independent_reads_are_gathered():
    """The three independent reads must overlap, not run back to back."""
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    assert "asyncio.gather(" in seg
    assert "pending_income_task" in seg, "pending rollup should be prefetched"
    # the old serial aggregate must be gone from the row-building section
    assert seg.count("db.income.aggregate(") == 1, \
        "pending-approval rollup should be issued exactly once"


def test_all_months_branch_uses_prefetched_stages():
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    assert "stages_cursor = all_months_stages" in seg
    # no unprojected payment_stages read may remain
    assert 'db.payment_stages.find({}, {"_id": 0})' not in seg
    assert seg.count("db.payment_stages.find(") == 2, \
        "expected exactly the all-months and filtered stage reads"


def test_no_stage_read_without_projection():
    """Every payment_stages read in this endpoint must pass STAGE_FIELDS."""
    fn, src = _endpoint()
    for node in ast.walk(fn):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "find"):
            seg = ast.get_source_segment(src, node) or ""
            if "payment_stages" in seg:
                assert "STAGE_FIELDS" in seg, f"unprojected stage read: {seg[:80]}"
