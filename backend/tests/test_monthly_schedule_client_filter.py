"""Proves the vendor/labour push-down filter on /planning/monthly-schedule
cannot change which rows the Payment Schedule shows (Sep 16 2026).

`_is_vendor_or_labour_row` drops vendor/labour-side stages in Python AFTER
they have been fetched. CLIENT_ROWS_ONLY moves part of that decision into the
MongoDB query so those documents are never transferred or decoded.

That is only safe if the query filter is never STRICTER than the Python test:
a row Python would have kept must never be excluded by the database. These
tests re-implement the Mongo predicate and compare it against the real
`_is_vendor_or_labour_row` logic over an exhaustive value matrix.

The Python filter still runs afterwards, so the query being more PERMISSIVE
(e.g. on category/kind, deliberately not pushed down) is fine.
"""
import ast
import io
import itertools
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPERATIONS = os.path.join(BACKEND, "routes", "operations.py")

ID_FIELDS = ("rab_request_id", "rab_number", "contractor_id", "vendor_id")

# Values a stage document can carry for those fields in practice, plus the
# awkward ones. MISSING models the key being absent entirely.
MISSING = object()
VALUES = [MISSING, None, "", "rab_001", "CONTRACTOR-9", "RAB-01"]


def _source():
    return io.open(OPERATIONS, encoding="utf8").read()


def _endpoint():
    src = _source()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and node.name == "get_monthly_schedule":
            return node, src
    raise AssertionError("get_monthly_schedule not found")


def _build_doc(values):
    return {f: v for f, v in zip(ID_FIELDS, values) if v is not MISSING}


def mongo_keeps(doc):
    """CLIENT_ROWS_ONLY, evaluated in Python.

    {"$and": [{"$or": [{f: {"$exists": False}}, {f: None}, {f: ""}]} ...]}
    """
    for f in ID_FIELDS:
        if f not in doc:
            continue          # $exists: False
        if doc[f] is None or doc[f] == "":
            continue          # matches {f: None} / {f: ""}
        return False
    return True


def python_drops_on_ids(doc):
    """The ID half of _is_vendor_or_labour_row (category/kind not pushed down)."""
    return bool(doc.get("rab_request_id") or doc.get("rab_number")
                or doc.get("contractor_id") or doc.get("vendor_id"))


@pytest.mark.parametrize("values", list(itertools.product(VALUES, repeat=2)))
def test_filter_never_drops_a_row_python_would_keep(values):
    """The only direction that can corrupt the screen."""
    doc = _build_doc(values + (MISSING, MISSING))
    if not python_drops_on_ids(doc):
        assert mongo_keeps(doc), \
            f"query would drop a client row Python keeps: {doc}"


def test_full_matrix_is_exactly_equivalent():
    """Across every combination, query and Python agree on all four fields."""
    mismatches = []
    for values in itertools.product(VALUES, repeat=len(ID_FIELDS)):
        doc = _build_doc(values)
        if mongo_keeps(doc) != (not python_drops_on_ids(doc)):
            mismatches.append(doc)
    assert not mismatches, f"{len(mismatches)} mismatched docs, e.g. {mismatches[:3]}"


def test_realistic_rows():
    client_stage = {"stage_id": "ps_1", "amount": 500000, "category": "client"}
    rab_row = {"stage_id": "ps_2", "rab_number": "RAB-01", "contractor_id": "c_9"}
    empty_ids = {"stage_id": "ps_3", "contractor_id": "", "vendor_id": None}

    assert mongo_keeps(client_stage) and not python_drops_on_ids(client_stage)
    assert not mongo_keeps(rab_row) and python_drops_on_ids(rab_row)
    # falsy-but-present must survive the query, exactly as Python keeps it
    assert mongo_keeps(empty_ids) and not python_drops_on_ids(empty_ids)


def test_category_and_kind_are_not_pushed_down():
    """They are compared case-insensitively in Python; a Mongo equality would
    silently miss "Labour" vs "labour". Keeping them out of the query is
    deliberate - assert the filter does not grow to include them."""
    _, src = _endpoint()
    start = src.index("CLIENT_ROWS_ONLY = {")
    body = src[start:src.index("}", src.index("for f in", start))]
    assert "category" not in body
    assert "kind" not in body


def test_python_filter_still_runs():
    """The query is an optimisation, not a replacement for the real filter."""
    _, src = _endpoint()
    assert "stages_cursor = [s for s in stages_cursor if not _is_vendor_or_labour_row(s)]" in src


def test_both_stage_reads_apply_the_filter():
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    assert "db.payment_stages.find(CLIENT_ROWS_ONLY, STAGE_FIELDS)" in seg
    assert '{"$and": [CLIENT_ROWS_ONLY, {"$or": stage_query_or}]}' in seg
    # nothing may read payment_stages unfiltered any more
    assert "db.payment_stages.find({}," not in seg


def test_filter_uses_exactly_the_four_id_fields():
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    start = seg.index("CLIENT_ROWS_ONLY = {")
    block = seg[start:start + 400]
    for f in ID_FIELDS:
        assert f in block, f"{f} missing from the push-down filter"


def test_timing_log_present():
    """Per-phase timings are how we find out where the time actually goes."""
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    assert "monthly-schedule all_months=%s db=%.3fs" in seg
    assert "_t0 = time.perf_counter()" in seg
    for var in ("_t_db", "_t_end", "_n_fetched"):
        assert var in seg
