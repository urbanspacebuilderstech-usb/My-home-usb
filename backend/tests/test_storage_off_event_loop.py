"""Blocking storage I/O must not run on the event loop (Sep 29 2026).

CRE Board > Payment Schedule was slow for a third time. Measuring rather than
guessing ruled out the obvious suspects:

    payment_stages          1,714 docs, queries in milliseconds
    income                  1,043 docs, heal lookup FETCH -> IXSCAN, 2ms
    handler Python          no nested loops, linear over 798 rows
    host                    load 0.42 of 4 CPUs, 9% memory used - idle

But /admin/runtime-health reported:

    event_loop_lag_ms   median 348, max 954   "BLOCKED"
    mongo_ping_ms       894.9

An idle host with a blocked event loop and a slow ping means something
synchronous is holding the loop, not that the machine is short of resources.
core.storage uses the blocking `requests` library, and every handler that
touched it called it directly:

    @router.get("/files/{file_id}/download")
    async def download_file(...):
        data, content_type = get_object(sp)     # blocks the whole worker

Every thumbnail on a card - Approvals and Procurement show four per row -
is one such request, and while any of them is in flight no other request can
be served, including the Payment Schedule.

Each call is now handed to a worker thread with asyncio.to_thread. Same
function, same arguments, same return value; it simply stops occupying the
event loop while it waits on the network.
"""
import ast
import io
import os

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE = os.path.join(BACKEND, "core", "storage.py")
ROUTE_FILES = ["files.py", "operations.py", "projects.py"]

BLOCKING = {"get_object", "put_object"}


def _src(path):
    return io.open(path, encoding="utf8").read()


def _route(name):
    return os.path.join(BACKEND, "routes", name)


# --------------------------------------------------------------------------
# The premise: core.storage really is synchronous
# --------------------------------------------------------------------------

def test_storage_uses_the_blocking_requests_library():
    """If this ever moves to an async client the wrapping below becomes
    unnecessary - but until then it is required."""
    src = _src(STORAGE)
    assert "import requests" in src
    assert "requests.get(" in src
    assert "requests.post(" in src


def test_storage_functions_are_not_coroutines():
    src = _src(STORAGE)
    for node in ast.parse(src).body:
        if isinstance(node, ast.FunctionDef) and node.name in BLOCKING:
            pass  # a plain def, which is the point
        elif isinstance(node, ast.AsyncFunctionDef) and node.name in BLOCKING:
            pytest.fail(f"{node.name} is async - the to_thread wrapping is now wrong")


# --------------------------------------------------------------------------
# No route may call them directly
# --------------------------------------------------------------------------

@pytest.mark.parametrize("mod", ROUTE_FILES)
def test_no_direct_call_to_blocking_storage(mod):
    """A bare get_object(...) / put_object(...) inside an async handler stalls
    every other request on the worker."""
    src = _src(_route(mod))
    offenders = []
    for node in ast.walk(ast.parse(src)):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
            continue
        if node.func.id not in BLOCKING:
            continue
        offenders.append((node.lineno, ast.unparse(node)[:70]))
    assert offenders == [], f"{mod}: {offenders}"


@pytest.mark.parametrize("mod", ROUTE_FILES)
def test_every_storage_call_goes_through_to_thread(mod):
    src = _src(_route(mod))
    for fn in BLOCKING:
        if fn in src:
            # every mention that is a call must be the to_thread form
            assert f"asyncio.to_thread({fn}," in src or f"import {fn}" in src or \
                   f", {fn}," in src or f"{fn}," in src, mod


def test_the_download_path_is_wrapped():
    src = _src(_route("files.py"))
    assert "data, content_type = await asyncio.to_thread(get_object, sp)" in src
    assert "data, _ = await asyncio.to_thread(get_object, sp)" in src


def test_the_upload_paths_are_wrapped():
    assert "await asyncio.to_thread(put_object, storage_path, data, content_type)" \
        in _src(_route("files.py"))
    assert "await asyncio.to_thread(put_object, storage_path, data, content_type)" \
        in _src(_route("operations.py"))
    assert _src(_route("projects.py")).count(
        "await asyncio.to_thread(put_object, storage_path, contents, content_type)") == 3


@pytest.mark.parametrize("mod", ROUTE_FILES)
def test_asyncio_is_imported_where_it_is_used(mod):
    src = _src(_route(mod))
    if "asyncio.to_thread" in src:
        assert "import asyncio" in src, mod


# --------------------------------------------------------------------------
# The arguments must survive the move
# --------------------------------------------------------------------------

def test_to_thread_passes_arguments_positionally_not_as_a_call():
    """`asyncio.to_thread(get_object(sp))` would call it on the loop first and
    then hand the RESULT to the thread - the exact bug being fixed, silently."""
    for mod in ROUTE_FILES:
        src = _src(_route(mod))
        for fn in BLOCKING:
            assert f"asyncio.to_thread({fn}(" not in src, f"{mod}/{fn}"


def test_results_are_awaited():
    """A to_thread call that is not awaited returns a coroutine, so the caller
    would get an object instead of the file bytes."""
    for mod in ROUTE_FILES:
        src = _src(_route(mod))
        for line in src.splitlines():
            if "asyncio.to_thread(" in line:
                assert "await asyncio.to_thread(" in line, f"{mod}: {line.strip()}"
