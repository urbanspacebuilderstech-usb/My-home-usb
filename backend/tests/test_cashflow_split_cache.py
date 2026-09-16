"""Proves the Cashflow Engine split cache resolves exactly like the DB path.

/cashflow/summary used to call `_get_effective_split()` (a find_one, plus a
second one for the global fallback) and a separate has_override find_one for
every project row -- roughly three sequential round trips per project. Those
lookups now come from one preloaded read of `cashflow_config`.

The split decides how every rupee is divided between the Direct and Indirect
pools, so "resolves the same way" cannot be taken on trust. These tests pull
BOTH implementations out of the real source -- the async `_get_effective_split`
and the nested `_split_cached` -- run them against the same stub database, and
compare their answers across a matrix of config states.
"""
import ast
import asyncio
import io
import os
from typing import Any, Dict, List, Optional

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASHFLOW = os.path.join(BACKEND, "routes", "cashflow.py")

DEFAULT_GLOBAL_SPLIT = {"direct_pct": 85.0, "indirect_pct": 15.0}


def _source():
    return io.open(CASHFLOW, encoding="utf8").read()


class StubCollection:
    """Minimal stand-in for db.cashflow_config."""

    def __init__(self, docs):
        self.docs = {d["_id"]: d for d in docs}
        self.find_one_calls = 0
        self.upserted = False

    async def find_one(self, query, projection=None):
        self.find_one_calls += 1
        return self.docs.get(query["_id"])

    async def update_one(self, query, update, upsert=False):
        self.upserted = True
        self.docs.setdefault(query["_id"], {"_id": query["_id"]}).update(update["$set"])


class StubDB:
    def __init__(self, docs):
        self.cashflow_config = StubCollection(docs)


def _load_db_path(docs):
    """Execute the real _get_global_split / _get_effective_split."""
    src = _source()
    tree = ast.parse(src)
    wanted = {"_get_global_split", "_get_effective_split"}
    nodes = [n for n in tree.body
             if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name in wanted]
    assert len(nodes) == 2, f"expected both helpers, found {[n.name for n in nodes]}"
    module = ast.Module(body=nodes, type_ignores=[])
    ns = {"db": StubDB(docs), "DEFAULT_GLOBAL_SPLIT": dict(DEFAULT_GLOBAL_SPLIT),
          "Dict": Dict, "Optional": Optional, "Any": Any, "List": List}
    exec(compile(module, "<db_path>", "exec"), ns)
    return ns


def _load_cached_path(docs):
    """Execute the real _split_cached / _has_override_cached from get_summary,
    fed the same documents the endpoint would have preloaded."""
    src = _source()
    tree = ast.parse(src)
    summary = next(n for n in tree.body
                   if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
                   and n.name == "get_summary")
    nested = [n for n in ast.walk(summary)
              if isinstance(n, ast.FunctionDef)
              and n.name in ("_split_cached", "_has_override_cached")]
    assert len(nested) == 2, f"expected both cache helpers, found {[n.name for n in nested]}"

    cfg_by_id = {d["_id"]: d for d in docs}
    if "global" in cfg_by_id:
        g = cfg_by_id["global"]
        global_split = {"direct_pct": float(g.get("direct_pct", 85.0)),
                        "indirect_pct": float(g.get("indirect_pct", 15.0))}
    else:
        global_split = dict(DEFAULT_GLOBAL_SPLIT)

    ns = {"_cfg_by_id": cfg_by_id, "_global_split": global_split,
          "Dict": Dict, "Optional": Optional, "Any": Any, "List": List}
    exec(compile(ast.Module(body=nested, type_ignores=[]), "<cached>", "exec"), ns)
    return ns


# (label, config docs)
CONFIG_STATES = [
    ("global only", [{"_id": "global", "direct_pct": 85.0, "indirect_pct": 15.0}]),
    ("custom global", [{"_id": "global", "direct_pct": 70.0, "indirect_pct": 30.0}]),
    ("one override", [{"_id": "global", "direct_pct": 85.0, "indirect_pct": 15.0},
                      {"_id": "project:p1", "direct_pct": 60.0, "indirect_pct": 40.0}]),
    ("many overrides", [{"_id": "global", "direct_pct": 85.0, "indirect_pct": 15.0},
                        {"_id": "project:p1", "direct_pct": 60.0, "indirect_pct": 40.0},
                        {"_id": "project:p2", "direct_pct": 100.0, "indirect_pct": 0.0},
                        {"_id": "project:p3", "direct_pct": 0.0, "indirect_pct": 100.0}]),
    ("int percentages", [{"_id": "global", "direct_pct": 85, "indirect_pct": 15},
                         {"_id": "project:p1", "direct_pct": 60, "indirect_pct": 40}]),
    ("global missing fields", [{"_id": "global"}]),
]
PROJECT_IDS = [None, "p1", "p2", "p3", "p_unknown", ""]


@pytest.mark.parametrize("label,docs", CONFIG_STATES)
@pytest.mark.parametrize("pid", PROJECT_IDS)
def test_cached_split_matches_database_split(label, docs, pid):
    db_ns = _load_db_path(docs)
    cached_ns = _load_cached_path(docs)
    from_db = asyncio.run(db_ns["_get_effective_split"](pid))
    from_cache = cached_ns["_split_cached"](pid)
    assert from_cache == from_db, f"[{label}] pid={pid!r}: {from_cache} != {from_db}"


@pytest.mark.parametrize("label,docs", CONFIG_STATES)
@pytest.mark.parametrize("pid", PROJECT_IDS)
def test_cached_has_override_matches_database(label, docs, pid):
    """bool(find_one({"_id": f"project:{pid}"})) — existence, nothing more."""
    stub = StubDB(docs)
    expected = bool(pid) and asyncio.run(
        stub.cashflow_config.find_one({"_id": f"project:{pid}"})) is not None
    got = _load_cached_path(docs)["_has_override_cached"](pid)
    assert got == expected, f"[{label}] pid={pid!r}: {got} != {expected}"


def test_cache_returns_a_copy_not_shared_state():
    """Rows must not be able to mutate each other's split through the cache."""
    docs = [{"_id": "global", "direct_pct": 85.0, "indirect_pct": 15.0}]
    ns = _load_cached_path(docs)
    a = ns["_split_cached"]("p_unknown")
    a["direct_pct"] = 1.0
    b = ns["_split_cached"]("p_other")
    assert b["direct_pct"] == 85.0, "cached split leaked mutation between rows"


def test_missing_global_still_seeds_via_the_db_helper():
    """_get_global_split() upserts the default on first ever read; the endpoint
    must keep that behaviour rather than silently defaulting in memory."""
    src = _source()
    summary = next(n for n in ast.parse(src).body
                   if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
                   and n.name == "get_summary")
    seg = ast.get_source_segment(src, summary) or ""
    assert 'if "global" in _cfg_by_id:' in seg
    assert "_global_split = await _get_global_split()" in seg


def test_no_per_project_awaits_remain_in_get_summary():
    """The whole point: no DB call may sit inside a per-project loop."""
    src = _source()
    summary = next(n for n in ast.parse(src).body
                   if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
                   and n.name == "get_summary")

    offenders = []

    def walk(node, depth):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            d = depth + 1 if isinstance(child, (ast.For, ast.AsyncFor)) else depth
            if isinstance(child, ast.Await) and depth > 0:
                seg = ast.get_source_segment(src, child) or ""
                if "db." in seg or "_get_effective_split" in seg or "_get_global_split" in seg:
                    offenders.append(seg.replace("\n", " ")[:70])
            walk(child, d)

    walk(summary, 0)
    assert not offenders, f"DB calls still inside a loop: {offenders}"


def test_get_config_batches_project_lookups():
    src = _source()
    cfg = next(n for n in ast.parse(src).body
               if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
               and n.name == "get_config")
    seg = ast.get_source_segment(src, cfg) or ""
    assert "db.projects.find_one(" not in seg, "per-override find_one is back"
    assert '{"project_id": {"$in": _pids}}' in seg


def test_get_config_handles_a_missing_project():
    """A deleted project yielded None from find_one; the map must too."""
    src = _source()
    cfg = next(n for n in ast.parse(src).body
               if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))
               and n.name == "get_config")
    seg = ast.get_source_segment(src, cfg) or ""
    assert "proj = _proj_by_id.get(pid)" in seg
    assert '(proj or {}).get("name", "")' in seg
    assert '(proj or {}).get("client_name", "")' in seg
