"""Pre Sales > All must list every lead the Total Leads tile counts (Sep 18 2026).

/crm/pre-sales/leads fetched with `.to_list(500)`, so the board only ever
received the newest 500 leads: "All (500)" beside a Total Leads tile of 2,235,
and every stage tab counted from the truncated set (RNR 8 on the tab vs 79 on
the tile). The tile comes from /crm/pre-sales/dashboard.

These tests keep the list and the tiles counted from the same set:
  * the list fetch carries no cap;
  * both endpoints scope leads identically — same base filter, same
    pre_sales-role restriction — so an uncapped list equals the tile count.
"""
import ast
import io
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CRM = os.path.join(BACKEND, "routes", "crm.py")


def _func(name):
    src = io.open(CRM, encoding="utf8").read()
    for node in ast.parse(src).body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == name:
            return node, src
    raise AssertionError(f"{name} not found in routes/crm.py")


def _leads_list_fetch(fn, src):
    """The `leads = await db.leads.find(...)...to_list(X)` assignment."""
    for node in ast.walk(fn):
        if (isinstance(node, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == "leads" for t in node.targets)):
            seg = ast.get_source_segment(src, node) or ""
            if "db.leads.find(" in seg and "to_list(" in seg:
                return node, seg
    raise AssertionError("leads list fetch not found")


def test_list_fetch_is_not_capped():
    fn, src = _func("get_pre_sales_leads")
    node, seg = _leads_list_fetch(fn, src)
    to_list = [c for c in ast.walk(node)
               if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute)
               and c.func.attr == "to_list"]
    assert len(to_list) == 1
    arg = to_list[0].args[0] if to_list[0].args else None
    assert isinstance(arg, ast.Constant) and arg.value is None, (
        f"the Pre Sales list is capped again ({seg.strip()[-30:]}); "
        "'All' will stop matching the Total Leads tile")


def test_list_is_newest_first():
    fn, src = _func("get_pre_sales_leads")
    _, seg = _leads_list_fetch(fn, src)
    assert '.sort("created_at", -1)' in seg


def test_list_and_tile_use_the_same_base_scope():
    """Uncapped only equals the tile if both count the same leads."""
    _, list_src = _func("get_pre_sales_leads")
    list_seg = ast.get_source_segment(list_src, _func("get_pre_sales_leads")[0])
    dash_fn, dash_src = _func("get_pre_sales_dashboard")
    dash_seg = ast.get_source_segment(dash_src, dash_fn)

    assert 'query = {"stage_type": "pre_sales"}' in list_seg
    assert 'base_query = {"stage_type": "pre_sales"}' in dash_seg
    # pre_sales users see only their own leads — in BOTH places
    assert 'if user.role == "pre_sales":\n        query["assigned_to"] = user.user_id' in list_seg
    assert 'if user.role == "pre_sales":\n        base_query["assigned_to"] = user.user_id' in dash_seg


def test_contact_filter_keeps_one_row_per_lead():
    """filter_contacts_leads masks fields; it must never drop leads, or the
    list would fall short of the tile for non-privileged roles."""
    src = io.open(os.path.join(BACKEND, "core", "contact_visibility.py"), encoding="utf8").read()
    fn = next(n for n in ast.parse(src).body
              if isinstance(n, ast.AsyncFunctionDef) and n.name == "filter_contacts_leads")
    seg = ast.get_source_segment(src, fn)
    assert "for lead in leads" in seg
    assert "strip_contact_fields(lead)" in seg
    assert " if lead.get(\"lead_id\") in approved_ids else " in seg


def test_list_is_served_through_the_fast_serializer():
    fn, src = _func("get_pre_sales_leads")
    seg = ast.get_source_segment(src, fn)
    assert "return fast_json(mask_leads_phone(leads, user.role))" in seg
