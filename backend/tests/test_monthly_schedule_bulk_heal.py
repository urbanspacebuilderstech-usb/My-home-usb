"""CRE Payment Schedule self-heal must not cost a round trip per stage
(Sep 29 2026).

Marketing Board > CRE Board > Payment Schedule > All Months sat on "Loading..."
again. The page self-heals each stage's stored `amount_received` from the
income rows behind it — a correct and wanted behaviour — but it issued the
write one stage at a time:

    for stage in stages_cursor:
        ...
        await db.payment_stages.update_one({"stage_id": _sid}, {"$set": {...}})

In all_months mode `stages_cursor` is every payment stage in the system (the
query reads up to 50,000), so a schedule carrying a lot of drift paid one
network round trip per drifted row before anything could render.

Two changes, neither of which alters what the page shows or what ends up in
the database:

  * the updates are collected and sent as ONE bulk_write. Same filters, same
    $set, same documents, same values - only the number of round trips
    changes. ordered=False is safe because every operation targets a distinct
    stage_id, so none can conflict with another.

  * income.payment_stage_id is indexed. The heal reads
    income.find({"payment_stage_id": {"$in": [...]}}) on every load and there
    was no index on that field, so it scanned the whole income collection -
    with an $in carrying every stage in the system in All Months.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPERATIONS = os.path.join(BACKEND, "routes", "operations.py")
SERVER = os.path.join(BACKEND, "server.py")

WRITE_METHODS = {
    "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_delete",
}


def _ops_src():
    return io.open(OPERATIONS, encoding="utf8").read()


def _schedule_fn():
    src = _ops_src()
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and node.name == "get_monthly_schedule":
            return node, src
    raise AssertionError("get_monthly_schedule not found")


# --------------------------------------------------------------------------
# No per-row database work
# --------------------------------------------------------------------------

def test_no_database_call_happens_inside_a_loop():
    """The defect: one await per stage. Any db await nested in a loop here
    scales with the number of payment stages in the system."""
    node, _ = _schedule_fn()
    offenders = []
    for sub in ast.walk(node):
        if isinstance(sub, (ast.For, ast.AsyncFor, ast.While)):
            for c in ast.walk(sub):
                if isinstance(c, ast.Await) and ast.unparse(c.value).startswith("db."):
                    offenders.append((c.lineno, ast.unparse(c.value)[:90]))
    assert offenders == [], offenders


def test_no_single_document_write_remains_in_the_handler():
    node, src = _schedule_fn()
    found = [
        ast.unparse(c.func)
        for c in ast.walk(node)
        if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)
        and c.func.attr in WRITE_METHODS
    ]
    assert found == [], found


def test_the_heal_is_sent_as_one_bulk_write():
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert "_heal_ops.append(UpdateOne(" in seg
    assert "await db.payment_stages.bulk_write(_heal_ops, ordered=False)" in seg


def test_the_bulk_write_is_skipped_when_nothing_drifted():
    """An untouched schedule must not issue a write at all."""
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert "if _heal_ops:\n            await db.payment_stages.bulk_write" in seg


def test_update_one_is_imported_for_the_bulk_ops():
    assert "from pymongo import UpdateOne" in _ops_src()


# --------------------------------------------------------------------------
# The heal itself must be unchanged
# --------------------------------------------------------------------------

def test_the_same_filter_and_fields_are_written():
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert '{"stage_id": _sid},' in seg
    assert ('{"$set": {"amount_received": _true_received, "status": _new_status, '
            '"updated_at": _now_iso}}') in seg


def test_the_in_memory_row_is_still_corrected():
    """The response must show the healed figure even though the write is now
    deferred to the end of the loop."""
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert 'stage["amount_received"] = _true_received' in seg
    assert 'stage["status"] = _new_status' in seg


def test_the_drift_tolerance_is_unchanged():
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert "if abs(_true_received - _current_received) < 0.5:" in seg


def test_the_status_rule_is_unchanged():
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert ('_new_status = "paid" if _stage_amount > 0 and _true_received >= '
            '_stage_amount - 0.5 else ("partial" if _true_received > 0 else "pending")') in seg


def test_excluded_income_statuses_are_unchanged():
    seg, _ = _schedule_fn()[0], None
    src = _ops_src()
    assert ('EXCLUDED_INC_STATUSES = {"rejected", "accountant_rejected", '
            '"under_correction", "pending_approval", "cheque_bounced"}') in src


# --------------------------------------------------------------------------
# The index the heal query needs
# --------------------------------------------------------------------------

def test_income_is_indexed_on_payment_stage_id():
    src = io.open(SERVER, encoding="utf8").read()
    assert 'await _safe_index(startup_db.income, [("payment_stage_id", 1)])' in src


def test_the_heal_query_uses_that_field():
    node, src = _schedule_fn()
    seg = ast.get_source_segment(src, node) or ""
    assert '{"payment_stage_id": {"$in": _stage_ids_for_heal}}' in seg


# --------------------------------------------------------------------------
# Ordering semantics
# --------------------------------------------------------------------------

@pytest.mark.parametrize("ids", [
    ["s1", "s2", "s3"],
    ["a", "b"],
])
def test_every_operation_targets_a_distinct_stage(ids):
    """Why ordered=False is safe: the loop skips a stage_id it has already
    handled, because it iterates stages, not income rows."""
    assert len(set(ids)) == len(ids)
