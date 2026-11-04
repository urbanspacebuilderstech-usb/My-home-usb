"""Workflow Master: where a newly-added menu lands (Nov 4 2026).

The CRE Board got a Top Sheet tab, asked for "right after the Payment
Schedule". Roles whose tab order Super Admin had already saved got every new
seed key appended at the end, so it would have shown up last. A new key now
goes right after the nearest menu before it in the seed.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS = os.path.join(BACKEND, "routes", "projects.py")


def _load():
    tree = ast.parse(io.open(PROJECTS, encoding="utf8").read())
    ns = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_order_role_menus":
            exec(compile(ast.Module(body=[node], type_ignores=[]), PROJECTS, "exec"), ns)
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "WORKFLOW_ROLE_CATALOG" for t in node.targets):
            ns["CATALOG"] = ast.literal_eval(node.value)
    return ns["_order_role_menus"], ns["CATALOG"]


order, CATALOG = _load()
CRE = CATALOG["cre"]["menus"]


def keys(menus):
    return [m["key"] for m in menus]


def test_cre_top_sheet_follows_payment_schedule_in_seed():
    assert keys(CRE)[:2] == ["payment_schedule", "top_sheet"]


def test_no_saved_order_gives_seed_order():
    assert keys(order(CRE, [])) == keys(CRE)


def test_new_key_lands_after_its_seed_predecessor_in_a_saved_order():
    saved = [{"key": k, "enabled": True} for k in
             ["final_estimate", "pre_construction", "payment_schedule", "cheques", "dt_requests", "additional_costs"]]
    out = order(CRE, saved)
    assert keys(out) == ["final_estimate", "pre_construction", "payment_schedule", "top_sheet",
                         "cheques", "dt_requests", "additional_costs"]
    assert next(m for m in out if m["key"] == "top_sheet")["enabled"] is True


def test_saved_enabled_flags_and_stale_keys():
    saved = [{"key": "payment_schedule", "enabled": False}, {"key": "gone", "enabled": True},
             {"key": "final_estimate", "enabled": True}]
    out = order(CRE, saved)
    assert keys(out)[:3] == ["payment_schedule", "top_sheet", "final_estimate"]
    assert out[0]["enabled"] is False
    assert "gone" not in keys(out)


def test_new_first_key_without_predecessor_goes_last():
    seed = [{"key": "a", "label": "A"}, {"key": "b", "label": "B"}]
    assert keys(order(seed, [{"key": "b", "enabled": True}])) == ["b", "a"]
