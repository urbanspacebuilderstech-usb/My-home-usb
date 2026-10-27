"""A payment row that drew on two cheques must show both (Oct 27 2026).

GST Agency's "Suspense by cheque" chip read #157662 41,517, while the Expense
list rows marked #7662 gave 1,86,359 - 1,50,724.60 = 35,634.40. The chip was
right. USB-MR1113 (M Sand, 16,940) was paid by ONE cheque leg over two
cheques: the 5,882.40 left on another cheque, then 11,057.60 from #157662
(allocation cha_73b5fbffa1). The row's cheque_number is "<other>, 157662"
and the Mode column printed its last four characters, "#7662", so all 16,940
read as #157662's money - exactly the 5,882.40 the chip seemed to be over.
"""
import ast
import os
from typing import Any, Dict, List

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
ACCOUNTS_BOARD = os.path.join(BACKEND, "..", "frontend", "src", "pages", "AccountsBoard.jsx")


class _Cursor:
    def __init__(self, rows):
        self._rows = iter(rows)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._rows)
        except StopIteration:
            raise StopAsyncIteration


class _Allocations:
    def __init__(self, rows):
        self.rows = rows

    def find(self, q, _proj=None):
        return _Cursor([
            r for r in self.rows
            if r["expense_id"] in q["expense_id"]["$in"]
            and r.get("status") == q["status"]
            and r.get("source") != q["source"]["$ne"]])


def _attach(rows, allocations):
    tree = ast.parse(open(FINANCIAL, encoding="utf-8").read())
    fn = next(n for n in tree.body
              if isinstance(n, ast.AsyncFunctionDef) and n.name == "_attach_cheque_split")
    ns = {"Dict": Dict, "Any": Any, "List": List, "_num": lambda v: float(v or 0),
          "db": type("Db", (), {"cheque_allocations": _Allocations(allocations)})()}
    exec(compile(ast.Module(body=[fn], type_ignores=[]), FINANCIAL, "exec"), ns)
    import asyncio
    asyncio.new_event_loop().run_until_complete(ns["_attach_cheque_split"](rows))
    return rows


def _alloc(exp, cid, num, amt, **kw):
    return {"expense_id": exp, "cheque_id": cid, "cheque_number": num, "amount": amt,
            "status": "active", **kw}


def test_usb_mr1113_shows_what_each_cheque_paid():
    rows = _attach(
        [{"expense_id": "exp_2828a9524e8c", "cheque_ids": ["chq_other", "chq_30fd2006"], "amount": 16940}],
        [_alloc("exp_2828a9524e8c", "chq_30fd2006", "157662", 11057.6),
         _alloc("exp_2828a9524e8c", "chq_other", "151234", 5882.4)])
    # In the order the leg drew on them, not the order the rows came back.
    assert rows[0]["cheque_split"] == [
        {"cheque_number": "151234", "amount": 5882.4},
        {"cheque_number": "157662", "amount": 11057.6}]


def test_a_single_cheque_row_gets_no_split():
    rows = _attach(
        [{"expense_id": "exp_5f439124dcf1", "cheque_ids": ["chq_30fd2006"], "amount": 18070}],
        [_alloc("exp_5f439124dcf1", "chq_30fd2006", "157662", 18070)])
    assert "cheque_split" not in rows[0]


def test_the_bulk_backfill_leftover_is_not_a_draw():
    """cha_5c2b0d1ba3 (58,881.40, historical_opening) hangs off a bill's
    expense_id but is the leftover moved to suspense, not that bill's money."""
    rows = _attach(
        [{"expense_id": "e1", "cheque_ids": ["a", "b"]}],
        [_alloc("e1", "a", "1", 100), _alloc("e1", "b", "2", 50),
         _alloc("e1", "b", "2", 58881.4, source="historical_opening")])
    assert rows[0]["cheque_split"] == [{"cheque_number": "1", "amount": 100.0},
                                       {"cheque_number": "2", "amount": 50.0}]


def test_reversed_draws_do_not_count():
    rows = _attach(
        [{"expense_id": "e1", "cheque_ids": ["a", "b"]}],
        [_alloc("e1", "a", "1", 100), {**_alloc("e1", "b", "2", 50), "status": "reversed"}])
    assert "cheque_split" not in rows[0]


def test_the_mode_column_no_longer_cuts_a_joined_number():
    src = open(ACCOUNTS_BOARD, encoding="utf-8").read()
    assert "String(getChequeNumber(e)).slice(-4)" not in src
    assert "String(getChequeNumber(entry)).slice(-4)" not in src
    assert src.count("<ChequeRef e=") == 2
