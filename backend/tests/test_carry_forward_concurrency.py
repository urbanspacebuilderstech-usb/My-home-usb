"""Guards the Carry Forward row parallelisation (Sep 16 2026).

/accountant/carry-forward/projects used to await one project at a time, and a
single row is expensive: `_compute_project_carry_forward_row` ->
expense_engine.fetch_expense_source_docs reads five collections, each sorted.
At ~60 projects that is ~300 sequential round trips.

The rows are now computed concurrently. The safety argument is that NOTHING
about an individual row changed -- same function, same arguments, same
try/except fallback -- and `asyncio.gather` returns results in input order, so
the name-sorted table is unchanged.

"Returns in input order" is the load-bearing claim: if it were false, every
figure in the table would be attached to the wrong project. So it is tested
against a stub whose completion order is deliberately the REVERSE of its input
order.
"""
import ast
import asyncio
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")


def _source():
    return io.open(FINANCIAL, encoding="utf8").read()


def _endpoint():
    src = _source()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) \
                and node.name == "list_carry_forward_projects":
            return node, src
    raise AssertionError("list_carry_forward_projects not found")


class _StubLogger:
    def __init__(self):
        self.warnings = []

    def warning(self, *args):
        self.warnings.append(args)


def _load_row_helper(compute, cf_map=None, concurrency=8):
    """Execute the REAL nested _carry_forward_row against a stubbed compute."""
    fn, src = _endpoint()
    nested = [n for n in ast.walk(fn)
              if isinstance(n, ast.AsyncFunctionDef) and n.name == "_carry_forward_row"]
    assert len(nested) == 1, "_carry_forward_row not found in the endpoint"
    logger = _StubLogger()
    ns = {
        "asyncio": asyncio,
        "_cf_sem": asyncio.Semaphore(concurrency),
        "_compute_project_carry_forward_row": compute,
        "cf_map": cf_map if cf_map is not None else {},
        "logger": logger,
        "float": float,
    }
    exec(compile(ast.Module(body=nested, type_ignores=[]), "<row>", "exec"), ns)
    return ns["_carry_forward_row"], logger


PROJECTS = [{"project_id": f"p{i}", "name": f"Project {i}",
             "original_estimate": 1000.0 * i} for i in range(12)]


def test_results_keep_input_order_even_when_completion_order_reverses():
    """The claim the whole change rests on."""
    async def compute(p, cf):
        # later projects finish FIRST — the worst case for ordering
        await asyncio.sleep(0.001 * (len(PROJECTS) - int(p["project_id"][1:])))
        return {"project_id": p["project_id"], "project_name": p["name"]}

    row_for, _ = _load_row_helper(compute)

    async def run():
        return list(await asyncio.gather(*(row_for(p) for p in PROJECTS)))

    rows = asyncio.run(run())
    assert [r["project_id"] for r in rows] == [p["project_id"] for p in PROJECTS]
    assert [r["project_name"] for r in rows] == [p["name"] for p in PROJECTS]


def test_every_project_gets_exactly_one_row():
    async def compute(p, cf):
        return {"project_id": p["project_id"]}

    row_for, _ = _load_row_helper(compute)

    async def run():
        return list(await asyncio.gather(*(row_for(p) for p in PROJECTS)))

    rows = asyncio.run(run())
    assert len(rows) == len(PROJECTS)
    assert len({r["project_id"] for r in rows}) == len(PROJECTS)


def test_carry_forward_doc_is_passed_through_per_project():
    """cf_map.get(project_id) must reach the right row."""
    seen = {}
    cf_map = {"p3": {"income_carry_forward": 555.0}}

    async def compute(p, cf):
        seen[p["project_id"]] = cf
        return {"project_id": p["project_id"]}

    row_for, _ = _load_row_helper(compute, cf_map=cf_map)

    async def run():
        await asyncio.gather(*(row_for(p) for p in PROJECTS))

    asyncio.run(run())
    assert seen["p3"] == {"income_carry_forward": 555.0}
    assert seen["p4"] is None


def test_one_failing_project_does_not_break_the_table():
    async def compute(p, cf):
        if p["project_id"] == "p5":
            raise ValueError("boom")
        return {"project_id": p["project_id"], "project_name": p["name"]}

    row_for, logger = _load_row_helper(compute)

    async def run():
        return list(await asyncio.gather(*(row_for(p) for p in PROJECTS)))

    rows = asyncio.run(run())

    assert len(rows) == len(PROJECTS), "a failure must not drop the row"
    bad = rows[5]
    assert bad["project_id"] == "p5"
    assert bad["note"] == "(computation failed — see backend logs)"
    assert bad["difference"] == 0
    assert bad["project_value"] == 5000.0, "fallback still reports the estimate"
    assert logger.warnings, "the failure must be logged"
    # neighbours unaffected
    assert rows[4]["project_id"] == "p4" and "note" not in rows[4]


def test_fallback_row_has_the_same_keys_as_before():
    """The frontend reads these keys; the fallback shape must not drift."""
    async def compute(p, cf):
        raise RuntimeError("fail")

    row_for, _ = _load_row_helper(compute)
    row = asyncio.run(row_for(PROJECTS[0]))
    for key in ("project_id", "project_name", "project_value", "total_income",
                "income_adjustment", "income_carry_forward", "grand_income",
                "material_expense", "work_order_expense", "petty_cash_expense",
                "direct_expense_total", "material_carry_forward",
                "labour_carry_forward", "petty_cash_carry_forward",
                "indirect_carry_forward", "direct_carry_forward",
                "expense_carry_forward", "expense_adjustment", "grand_expense",
                "difference", "note"):
        assert key in row, f"fallback row lost {key}"


def test_concurrency_is_bounded():
    """Unbounded fan-out would spike MongoDB memory on a tight box."""
    live = 0
    peak = 0

    async def compute(p, cf):
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.005)
        live -= 1
        return {"project_id": p["project_id"]}

    row_for, _ = _load_row_helper(compute, concurrency=8)

    async def run():
        await asyncio.gather(*(row_for(p) for p in PROJECTS))

    asyncio.run(run())
    assert peak <= 8, f"semaphore breached: {peak} concurrent"
    assert peak > 1, "rows are not actually running concurrently"


def test_rows_really_overlap():
    """Sequential execution of 12 rows x 20ms would take >=240ms."""
    async def compute(p, cf):
        await asyncio.sleep(0.02)
        return {"project_id": p["project_id"]}

    row_for, _ = _load_row_helper(compute, concurrency=8)

    async def run():
        start = asyncio.get_running_loop().time()
        await asyncio.gather(*(row_for(p) for p in PROJECTS))
        return asyncio.get_running_loop().time() - start

    elapsed = asyncio.run(run())
    assert elapsed < 0.20, f"rows still look sequential ({elapsed:.3f}s)"


# --------------------------------------------------------------------------
# Structural guards
# --------------------------------------------------------------------------

def test_endpoint_uses_gather_not_a_sequential_loop():
    fn, src = _endpoint()
    seg = ast.get_source_segment(src, fn) or ""
    assert "asyncio.gather(" in seg
    assert "_cf_sem" in seg, "concurrency must stay capped"
    # the old sequential pattern must be gone
    assert "for p in projects:" not in seg


def test_no_await_remains_directly_inside_a_project_loop():
    fn, src = _endpoint()
    offenders = []

    def walk(node, depth):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue  # the row helper is meant to await
            d = depth + 1 if isinstance(child, (ast.For, ast.AsyncFor)) else depth
            if isinstance(child, ast.Await) and depth > 0:
                offenders.append((ast.get_source_segment(src, child) or "")[:70])
            walk(child, d)

    walk(fn, 0)
    assert not offenders, f"sequential awaits inside a loop: {offenders}"


def test_expense_engine_collections_are_indexed_for_this_access_pattern():
    """fetch_expense_source_docs filters project_id and sorts created_at."""
    src = io.open(os.path.join(BACKEND, "server.py"), encoding="utf8").read()
    for coll in ("direct_expenses", "labour_expenses",
                 "material_requests", "material_expenses", "recorded_expenses"):
        needle = f'_safe_index(startup_db.{coll}, [("project_id", 1), ("created_at", -1)])'
        assert needle in src, f"{coll} lacks the (project_id, created_at) index"
