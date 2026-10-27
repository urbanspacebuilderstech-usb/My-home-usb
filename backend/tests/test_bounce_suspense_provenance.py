"""A bounce must send back what its cheque's suspense really paid
(Oct 27 2026, USB-MR2402).

Champion Demo Test's ledger, oldest first (live, Oct 27):

    +9,950  cheque 0001 excess
    -9,950  spent
    +4,950  cheque 0002 excess      <- 0002 bounced; credit dead
      +625  cheque #8882 excess
      -200  Oct 22, "via Cheque #8882 suspense"
       -90  USB-MR2402, 5:36 pm, "via Cheque #8882 suspense"
       -10  USB-MR2402, 5:45 pm, "via Cheque #8882 suspense"

#8882 bounced at 5:47 pm. The bounce's replay ran over every credit, dead
ones too, so it gave the 300 to 0002's 4,950 and sent nothing back:
USB-MR2402 stayed Delivered and paid, and the vendor's suspense read -300.
The payment itself counts only live credits and recorded what it drew on
(`funded_by`), which is #8882's 625.
"""
import ast
import os
from typing import Any, Dict, List

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")

C0001, C0002, C8882 = "se_2775419f84", "se_ea892bb912", "se_f02c73e9c5"


def _provenance():
    tree = ast.parse(open(FINANCIAL, encoding="utf-8").read())
    fn = next(n for n in tree.body
              if isinstance(n, ast.FunctionDef) and n.name == "_suspense_fifo_provenance")
    ns = {"Dict": Dict, "Any": Any, "List": List}
    exec(compile(ast.Module(body=[fn], type_ignores=[]), FINANCIAL, "exec"), ns)
    return ns["_suspense_fifo_provenance"]


def _ledger(with_funded_by=True):
    def debit(eid, amt, credit):
        e = {"entry_id": eid, "amount": -amt}
        if with_funded_by and credit:
            e["funded_by"] = [{"entry_id": credit, "amount": amt}]
        return e
    return [
        {"entry_id": C0001, "amount": 9950},
        debit("se_01794cfdb8", 9950, None),
        {"entry_id": C0002, "amount": 4950},
        {"entry_id": C8882, "amount": 625},
        debit("se_a04fb9a465", 200, C8882),
        debit("se_aef1bf5100", 90, C8882),
        debit("se_cef40b57cf", 10, C8882),
    ]


def test_usb_mr2402_is_paid_from_8882():
    got = _provenance()(_ledger())
    assert got["se_aef1bf5100"] == {C8882: 90}
    assert got["se_cef40b57cf"] == {C8882: 10}
    assert got["se_a04fb9a465"] == {C8882: 200}


def test_without_funded_by_the_oldest_credit_still_pays():
    """Debits written before Oct 20 carry no funded_by; they keep the old
    rule. It is also exactly what the live bounce did to USB-MR2402."""
    got = _provenance()(_ledger(with_funded_by=False))
    assert got["se_01794cfdb8"] == {C0001: 9950}
    assert got["se_aef1bf5100"] == {C0002: 90}


def test_funded_by_beyond_what_the_credit_has_left_falls_back_to_fifo():
    got = _provenance()([
        {"entry_id": "a", "amount": 100},
        {"entry_id": "b", "amount": 50},
        {"entry_id": "d", "amount": -80, "funded_by": [{"entry_id": "b", "amount": 80}]},
    ])
    assert got["d"] == {"b": 50, "a": 30}


def test_a_credit_named_by_funded_by_but_not_in_the_ledger_falls_back():
    got = _provenance()([
        {"entry_id": "a", "amount": 100},
        {"entry_id": "d", "amount": -40, "funded_by": [{"entry_id": "gone", "amount": 40}]},
    ])
    assert got["d"] == {"a": 40}


def test_both_the_bounce_and_its_trace_use_it():
    src = open(FINANCIAL, encoding="utf-8").read()
    assert src.count("consumed = _suspense_fifo_provenance(entries)") == 2
