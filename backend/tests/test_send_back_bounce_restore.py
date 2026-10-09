"""Sending a partly-bounced suspense payment back to Approvals (Oct 9 2026).

SS AGENCY / Cheque #041296 (₹2,00,000, bounced). Its ₹1,22,600 excess funded
four suspense payments: ₹6,000 of a ₹30,600 one (the other ₹24,600 was the
last of #607981's credit) and all of ₹38,700, ₹51,000 and ₹2,300.

The bounce reversal marked the three whole payments cheque_bounced and, for
the ₹30,600 one, left its debit standing and added a +₹6,000 "Restore". The
vendor went from -67,100 to +30,900 (commits f128f475 / 2e07fef5).

That ₹30,600 payment was then sent back to Approvals from the Cashbook. The
send-back deleted its whole -30,600 debit and left the Restore, so ₹6,000
came back twice and the vendor read 61,500 where 55,500 is real. The
send-back now deletes the Restore with its debit.
"""
import ast
import io
import os
import re

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINANCIAL = os.path.join(BACKEND, "routes", "financial.py")
PROCUREMENT = os.path.join(BACKEND, "routes", "procurement.py")
REPAIR = os.path.join(BACKEND, "scripts", "repair_ss_agency_041296_double_restore.py")

EXCLUDED = {"rejected", "accountant_rejected", "accounts_rejected", "under_correction", "cheque_bounced"}


def _read(path):
    return io.open(path, encoding="utf8").read()


def _seg(path, name):
    src = _read(path)
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return ast.get_source_segment(src, node) or ""
    raise AssertionError(f"{name} not found in {path}")


# --------------------------------------------------------------------------
# The arithmetic, mirrored from _live_vendor_suspense_balance and the send-back
# --------------------------------------------------------------------------

def live_balance(entries, legs):
    """entries: [{entry_id, amount, linked_expense_id?}]; legs: {expense_id: status}."""
    live = {eid for eid, st in legs.items() if st not in EXCLUDED}
    return round(sum(e["amount"] for e in entries
                     if not e.get("linked_expense_id") or e["linked_expense_id"] in live), 2)


def send_back(entries, legs, leg_id, delete_restores):
    debits = {e["entry_id"] for e in entries
              if e.get("linked_expense_id") == leg_id and e["amount"] < -0.5}
    out = [e for e in entries if e["entry_id"] not in debits]
    if delete_restores:
        out = [e for e in out if not (e.get("source_type") == "cheque_bounce_reversal"
                                      and e.get("reversed_entry_id") in debits and e["amount"] > 0.5)]
    return out, {k: v for k, v in legs.items() if k != leg_id}


def ss_agency_after_bounce():
    entries = [
        {"entry_id": "earlier", "amount": 55500},  # live total before #041296 arrived
        {"entry_id": "se_f5d352bf06", "amount": 122600, "linked_expense_id": "exp_4d907c1a66c5"},
        {"entry_id": "se_30600", "amount": -30600, "linked_expense_id": "exp_30600"},
        {"entry_id": "se_9934f8b4ed", "amount": -38700, "linked_expense_id": "exp_115ace1fb120"},
        {"entry_id": "se_41efcd6ff4", "amount": -51000, "linked_expense_id": "exp_76bebff13995"},
        {"entry_id": "se_d4733245b8", "amount": -2300, "linked_expense_id": "exp_14fcb2c4409a"},
        {"entry_id": "se_c5b745607a", "amount": 6000, "source_type": "cheque_bounce_reversal",
         "reversed_entry_id": "se_30600"},
    ]
    legs = {
        "exp_4d907c1a66c5": "cheque_bounced",  # the ₹77,400 swipe
        "exp_30600": "approved",               # cut to ₹24,600, still standing
        "exp_115ace1fb120": "cheque_bounced",
        "exp_76bebff13995": "cheque_bounced",
        "exp_14fcb2c4409a": "cheque_bounced",
    }
    return entries, legs


def test_bounce_reversal_lands_on_the_commit_figure():
    entries, legs = ss_agency_after_bounce()
    assert live_balance(entries, legs) == 30900


def test_old_send_back_returned_the_restored_part_twice():
    entries, legs = ss_agency_after_bounce()
    after, legs_after = send_back(entries, legs, "exp_30600", delete_restores=False)
    assert live_balance(after, legs_after) == 61500  # what the vendor card shows today


def test_send_back_now_returns_only_what_the_payment_still_held():
    entries, legs = ss_agency_after_bounce()
    after, legs_after = send_back(entries, legs, "exp_30600", delete_restores=True)
    # The payment held 24,600 after the bounce; that, and only that, comes back.
    assert live_balance(after, legs_after) == 30900 + 24600 == 55500


def test_send_back_without_a_restore_is_unchanged():
    entries = [{"entry_id": "c", "amount": 50000},
               {"entry_id": "d", "amount": -20000, "linked_expense_id": "exp_d"}]
    legs = {"exp_d": "approved"}
    for flag in (False, True):
        after, legs_after = send_back(entries, legs, "exp_d", delete_restores=flag)
        assert live_balance(after, legs_after) == 50000


# --------------------------------------------------------------------------
# The real code carries the rule
# --------------------------------------------------------------------------

def test_send_back_deletes_the_restore_with_its_debit():
    seg = _seg(FINANCIAL, "_reverse_mirror_cheque_and_suspense")
    debit_branch = seg[seg.index("if amt < -0.5"):seg.index("elif amt > 0.5")]
    assert 'delete_one({"entry_id": r["entry_id"]})' in debit_branch
    assert "delete_many" in debit_branch
    assert '"source_type": "cheque_bounce_reversal"' in debit_branch
    assert '"reversed_entry_id": r["entry_id"]' in debit_branch
    # only the Restore credit — never a debit or a void
    assert '"amount": {"$gt": 0.5}' in debit_branch


def test_delete_dryrun_mirrors_the_restore_deletion():
    seg = _seg(FINANCIAL, "expense_delete_dryrun")
    assert "restores_deleted" in seg
    assert '"reversed_entry_id": {"$in": to_delete}' in seg
    assert 'e.get("entry_id") in restores_deleted' in seg


# --------------------------------------------------------------------------
# The one-off SS AGENCY repair
# --------------------------------------------------------------------------

WRITE_METHODS = ("insert_one", "insert_many", "update_one", "update_many", "replace_one",
                 "delete_one", "delete_many", "find_one_and_update", "bulk_write", "drop")


def test_repair_writes_one_entry_and_only_with_apply():
    src = _read(REPAIR)
    calls = [m for m in WRITE_METHODS for _ in re.finditer(r"\.%s\(" % m, src)]
    assert calls == ["insert_one"]
    assert src.index("if not a.apply:") < src.index("insert_one(")
    assert src.index("if problems:") < src.index("insert_one(")


def test_repair_refuses_when_the_restore_is_still_offsetting_a_debit():
    src = _read(REPAIR)
    assert 'find_one({"entry_id": debit_id}' in src
    assert "exists, so the Restore is still offsetting it and must stay" in src
    assert 'find_one({"restore_tag": RESTORE_TAG}' in src


def test_repair_entry_is_invisible_to_the_bounce_replay_and_nets_the_chip():
    src = _read(REPAIR)
    assert '"source_type": "cheque_bounce_reversal"' in src
    assert '"amount": -AMOUNT' in src
    assert 'f"Void — duplicate Restore after Cheque {CHEQUE_NUMBER} bounced "' in src

    # The chip reads the cheque out of the description; it must find exactly
    # #041296 so the void lands in the same bucket as the Restore.
    m = re.search(r'_CHEQUE_IN_DESCRIPTION = re\.compile\((r"[^"]+"), re\.I\)', _read(PROCUREMENT))
    pattern = re.compile(ast.literal_eval(m.group(1)), re.I)
    void = ("Void — duplicate Restore after Cheque 041296 bounced (se_c5b745607a returned ₹6,000 "
            "of a payment that was later sent back to Approvals, which returned it again)")
    restore = ("Restore — Cheque 041296 bounced (CHEQUE  IS OUT OF ALLOCATED RAN) "
               "(bill partially sent back to Approvals, was funded by voided credit)")
    assert sorted(set(pattern.findall(void))) == ["041296"]
    assert sorted(set(pattern.findall(restore))) == ["041296"]
