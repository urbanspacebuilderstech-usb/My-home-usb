"""
Canonical project-expense engine — SINGLE SOURCE OF TRUTH.

Aug 25 2026 — Every screen that shows "Total Expense" for a project must
produce the SAME number. Before this module there were two independent
formulas:

  • Finance Board > Project Wise (``/accountant/cashbook-filtered``) —
    a whitelist across FIVE collections plus carry-forward, carrying all the
    accumulated de-duplication rules (material mirrors, pulled-back rows,
    unapproved site-engineer-direct rows).
  • Project > Financial Performance (``/projects/{id}/payment-summary``) —
    a blacklist over ``recorded_expenses`` ALONE, which counted money still
    sitting in the approval queue and ignored labour / material / carry
    forward entirely.

The two disagreed for every project that had anything pending (Mr Sridhar:
₹95,18,529.24 on the project page vs ₹93,31,389.24 on Project Wise).

Both callers now go through the helpers below, so the rules can only ever be
changed in one place.

Money definition (canonical):

    expense = Σ recorded_expenses   (accountant/super-admin approved, or
                                     legacy rows with no status field)
            + Σ labour_expenses     (accounts_approved)
            + Σ material_requests   (accounts_approved → paid, de-duped
                                     against their recorded_expenses mirror)
            + Σ material_expenses   (legacy POs: paid/settled/issued,
                                     de-duped against their mirror)
            + carry-forward expense (material + labour + petty cash +
                                     indirect opening balances)

    ‣ rows pulled back to Approvals are excluded
    ‣ site-engineer-direct rows are excluded until the accountant approves
    ‣ carry-forward is a lump-sum OPENING balance, so it is added only in the
      all-time view — never inside a date-filtered window

``direct_expenses`` (petty cash) is fetched for the cashbook's own listing
but intentionally NOT summed here: every petty-cash item is already mirrored
into ``recorded_expenses`` on submit, and emitting both double-counted it.
"""
from typing import Any, Dict, List, Optional, Tuple

import asyncio

from core.database import db

# Statuses that make a `recorded_expenses` row count as real, settled money.
RECORDED_EXPENSE_APPROVED_STATUSES = ["accounts_approved", "super_admin_approved", "approved"]
# Site-engineer-direct rows only become cashbook spend once the accountant
# clears them; any earlier status is still workflow, not money.
SE_DIRECT_SOURCES = ("site_engineer_direct", "site_engineer", "se_direct")
SE_DIRECT_CLEARED_STATUSES = ("approved", "verified", "recorded_into_cashbook")
LABOUR_EXPENSE_STATUSES = ["accounts_approved"]
MATERIAL_REQUEST_STATUSES = [
    "accounts_approved", "approved_for_po", "po_issued",
    "in_transit", "received", "delivered", "paid",
]
MATERIAL_REQUEST_POST_RELEASE_STATUSES = ("in_transit", "received", "delivered", "paid")
MATERIAL_EXPENSE_LEGACY_STATUSES = ["accounts_approved", "issued", "settled", "completed", "paid"]
DIRECT_EXPENSE_STATUSES = ["accounts_approved", "paid", "completed", "acknowledged", "payment_done"]

# Aug 25 2026 — One cap for every expense fetch, deliberately far above any
# realistic row count. The old per-call caps (2000 recorded / 1000 each for
# labour + materials, applied to the FIRM-WIDE cashbook query but not to the
# per-project ones) meant the two screens truncated different sets of rows:
# Project Wise silently dropped the oldest entries once the firm crossed the
# cap while the project page still counted them. A shared cap keeps every
# caller summing the same rows.
EXPENSE_FETCH_LIMIT = 100000


def is_countable_recorded_expense(e: dict) -> bool:
    """Does this `recorded_expenses` row represent settled money?

    Mirrors the Mongo whitelist in :func:`fetch_expense_source_docs` and adds
    the two row-level rules. Enforced HERE as well as in the query so a caller
    that fetches its own documents still gets the canonical answer — the old
    project-page formula went wrong precisely by fetching with a different
    filter.
    """
    if e.get("pulled_back_from_cashbook"):
        return False
    status = e.get("status")
    if status not in (None, "") and status not in RECORDED_EXPENSE_APPROVED_STATUSES:
        return False
    # SE-direct expenses only hit the cashbook AFTER the accountant approves
    # them. Any earlier status (`recorded`, `pm_approved`, rejected) is still
    # in the workflow and must not show as a confirmed cashbook spend.
    if (e.get("source") or "") in SE_DIRECT_SOURCES:
        if (status or "").lower() not in SE_DIRECT_CLEARED_STATUSES:
            return False
    return True


def is_countable_labour_expense(l: dict) -> bool:
    """Labour releases count once the accountant has approved them."""
    return (l.get("status") or "") in LABOUR_EXPENSE_STATUSES


def is_countable_material_request(m: dict) -> bool:
    """Approved material requests, minus anything already mirrored."""
    if m.get("pulled_back_from_cashbook"):
        return False
    if (m.get("status") or "") not in MATERIAL_REQUEST_STATUSES:
        return False
    # Feb 28 2026 — Dedupe: every payment release ALREADY inserts a
    # `recorded_expenses` row (the cashbook mirror). Emitting the parent
    # material_request on top of that created duplicate rows (one as
    # "Miscellaneous" from the parent, one with the real payment_method from
    # the mirror). Skip the parent row if a mirror exists or the request is in
    # a post-release state.
    if m.get("last_expense_id"):
        return False
    if (m.get("status") or "") in MATERIAL_REQUEST_POST_RELEASE_STATUSES:
        return False
    return True


def is_countable_material_expense(me: dict, mirrored_mexp_ids: Optional[set] = None) -> bool:
    """Legacy material POs that are not already represented by a payment row."""
    if me.get("pulled_back_from_cashbook"):
        return False
    if (me.get("status") or "") not in MATERIAL_EXPENSE_LEGACY_STATUSES:
        return False
    mirrored_mexp_ids = mirrored_mexp_ids or set()
    if me.get("material_expense_id") in mirrored_mexp_ids or me.get("expense_id") in mirrored_mexp_ids:
        return False
    # Aug 5 2026 — `mirrored_mexp_ids` is built from `recorded_exps`, which is
    # fetched under the SAME date-range filter as this list. A bill created on
    # day 1 but paid on day 2 (common — approval and payment rarely land in the
    # same call) has its recorded_expenses mirror fall outside a narrow
    # single-day filter, so the guard above misses it and the material_expense
    # row leaks through as a duplicate — showing a second "Miscellaneous" copy
    # of a bill already correctly represented under its real mode (SS AGENCY
    # ₹23,800 case: material_expense mexp_308c3818bbd5, payment_method null,
    # vs. its real payment recorded_expenses row exp_242d931adf61 with
    # payment_method "cheque"). `paid_via_expense_id` is stamped on the
    # material_expense document itself by pay_approval once it is settled, so
    # checking it directly is independent of any date window and catches the
    # case the cross-reference set misses.
    if me.get("paid_via_expense_id"):
        return False
    return True


def build_expense_query(
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """The shared project/date scope applied to every expense collection."""
    expense_q: Dict[str, Any] = {}
    if project_id:
        expense_q["project_id"] = project_id
    if start_date:
        expense_q.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        expense_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    return expense_q


async def fetch_expense_source_docs(expense_q: Dict[str, Any]) -> Tuple[List[dict], ...]:
    """Fetch the five raw expense collections under one shared scope filter.

    Returns ``(recorded_exps, labour_exps, material_reqs, material_exps_legacy,
    direct_exps)`` — the exact set the Cashbook / Project Wise view has always
    been built from.
    """
    return await asyncio.gather(
        # Recorded (manual) expenses: only show those approved by accountant
        # or super admin in the Expense list. Pending/rejected stay in queue.
        # Legacy entries without a status field are surfaced too (backwards-
        # compatible with pre-approval-flow expenses).
        # Labour RAB releases use status="approved"; Material direct
        # accountant approvals use "accounts_approved"; manual / super-admin
        # entries use "super_admin_approved"; legacy rows have no status.
        # Include all four.
        db.recorded_expenses.find(
            {**expense_q, "$or": [
                {"status": {"$in": RECORDED_EXPENSE_APPROVED_STATUSES}},
                {"status": {"$exists": False}},
                {"status": None},
            ]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(EXPENSE_FETCH_LIMIT),
        db.labour_expenses.find(
            {**expense_q, "status": {"$in": LABOUR_EXPENSE_STATUSES}}, {"_id": 0}
        ).sort("created_at", -1).to_list(EXPENSE_FETCH_LIMIT),
        # Materials in Expense list should only include those APPROVED by
        # accountant or already paid. Pending / planning-only / procurement-
        # priced statuses stay in the Approvals queue. Without this filter
        # the same material card showed up in both Approvals AND Expense.
        # Feb 28 2026 — also exclude rows pulled back to Approvals.
        db.material_requests.find(
            {**expense_q, "status": {"$in": MATERIAL_REQUEST_STATUSES}, "pulled_back_from_cashbook": {"$ne": True}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(EXPENSE_FETCH_LIMIT),
        # Feb 20 2026 — Legacy `material_expenses` collection (Cement/Sand/
        # Steel direct POs, pre-material_requests flow). Paid rows here were
        # invisible in Cashbook / Expense > Material card / Project Wise even
        # though Carry Forward already counted them, causing the Mrs.Abinaya
        # ₹93,902.75 mismatch reported on Feb 20. Include paid / settled /
        # accounts_approved so the Material card surfaces them.
        db.material_expenses.find(
            {**expense_q, "status": {"$in": MATERIAL_EXPENSE_LEGACY_STATUSES}, "pulled_back_from_cashbook": {"$ne": True}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(EXPENSE_FETCH_LIMIT),
        # Feb 20 2026 — Petty cash issued items (`direct_expenses.items[]`).
        # Fetched for the cashbook's own Petty Cash card; NOT summed into the
        # canonical total (see module docstring — already mirrored into
        # recorded_expenses). Strict accountant-approval rule: only docs that
        # are accountant-approved (or legacy docs without a status field).
        db.direct_expenses.find(
            {**expense_q, "$or": [
                {"status": {"$in": DIRECT_EXPENSE_STATUSES}},
                {"status": {"$exists": False}},
                {"status": None},
            ]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(EXPENSE_FETCH_LIMIT),
    )


def build_expense_rows_by_source(
    recorded_exps: List[dict],
    labour_exps: List[dict],
    material_reqs: List[dict],
    material_exps_legacy: List[dict],
    project_map: Optional[Dict[str, str]] = None,
) -> Dict[str, List[dict]]:
    """Flatten the raw collections into unified rows, KEYED BY SOURCE.

    Keys: ``recorded`` / ``labour`` / ``material_requests`` / ``material_legacy``.
    Callers that need one flat list use :func:`build_expense_rows`; callers that
    need the per-bucket split (Carry Forward's Material / Labour / Petty Cash
    columns) read the keys directly. Either way the de-duplication and
    exclusion rules below run exactly once, in one place — they are the whole
    reason the screens used to disagree.

    Every row gets a unified `expense_id` so the frontend has a single field
    to send back when deleting, regardless of which collection it came from.

    Pure (no I/O), so it is unit-testable without a database.
    """
    project_map = project_map or {}
    recorded_rows: List[dict] = []
    labour_rows: List[dict] = []
    material_request_rows: List[dict] = []
    material_legacy_rows: List[dict] = []

    for e in recorded_exps:
        if not is_countable_recorded_expense(e):
            continue
        recorded_rows.append({
            **e,
            "expense_id": e.get("expense_id") or str(e.get("_id", "")),
            "expense_type": e.get("category", "other"),
            "project_name": project_map.get(e.get("project_id"), ""),
            "source": e.get("source") or ("approval" if e.get("approval_id") or e.get("from_approval") else "manual"),
        })

    for l in labour_exps:
        if not is_countable_labour_expense(l):
            continue
        labour_rows.append({
            **l,
            "expense_id": l.get("labour_expense_id") or l.get("expense_id"),
            "expense_type": "labour",
            "amount": l.get("total_amount", 0),
            "project_name": project_map.get(l.get("project_id"), ""),
            "source": "approval",
        })

    for m in material_reqs:
        if not is_countable_material_request(m):
            continue
        amt = m.get("estimated_price", 0) or m.get("final_price", 0)
        material_request_rows.append({
            **m,
            "expense_id": m.get("request_id") or m.get("expense_id"),
            "expense_type": "material",
            "amount": amt,
            "project_name": project_map.get(m.get("project_id"), ""),
            "source": "approval",
        })

    # Legacy `material_expenses` collection — paid material POs (Cement,
    # Sand, Steel, etc.) recorded before the material_requests flow.
    # Feb 28 2026 — Dedupe against recorded_expenses mirrors. The unified
    # PayApprovalDialog creates a recorded_expense linked to material_expense
    # via `request_id`; emitting both rows produced the cement-duplicate
    # bug (one as "Miscellaneous" or actual mode from material_expenses,
    # one with real mode from recorded_expenses).
    # Built from the recorded rows that actually COUNT: a mirror that was
    # pulled back / never approved is not representing the PO, so the PO itself
    # must still be counted.
    mirrored_mexp_ids = {
        e.get("request_id") for e in recorded_rows
        if e.get("category") == "material" and (e.get("request_id") or "").startswith("mexp_")
    }
    for me in material_exps_legacy:
        if not is_countable_material_expense(me, mirrored_mexp_ids):
            continue
        amt = me.get("final_amount") or me.get("amount") or 0
        material_legacy_rows.append({
            **me,
            "expense_id": me.get("material_expense_id") or me.get("expense_id") or str(me.get("_id", "")),
            "expense_type": "material",
            "amount": amt,
            "project_name": project_map.get(me.get("project_id"), ""),
            "source": "approval",
        })

    # NOTE: We no longer emit a row per `direct_expenses.items[]` here. Every
    # SE-direct expense already lives in `recorded_expenses` (mirrored on
    # submit) — emitting both produced two cashbook rows per spend (one
    # "Manual", one "Approval"). The `recorded_expenses` mirror is the
    # source of truth and is gated by the accountant-approval filter above.

    return {
        "recorded": recorded_rows,
        "labour": labour_rows,
        "material_requests": material_request_rows,
        "material_legacy": material_legacy_rows,
    }


def build_expense_rows(
    recorded_exps: List[dict],
    labour_exps: List[dict],
    material_reqs: List[dict],
    material_exps_legacy: List[dict],
    project_map: Optional[Dict[str, str]] = None,
) -> List[dict]:
    """The unified expense list, in the cashbook's canonical append order."""
    by_source = build_expense_rows_by_source(
        recorded_exps, labour_exps, material_reqs, material_exps_legacy, project_map
    )
    return (
        by_source["recorded"]
        + by_source["labour"]
        + by_source["material_requests"]
        + by_source["material_legacy"]
    )


def carry_forward_expense(cf: Optional[dict]) -> float:
    """Carry-forward EXPENSE opening balance for one project_carry_forwards doc.

    Feb 20 2026 — CF Expense rolls up the 4 per-bucket fields (material +
    labour + petty cash + indirect) and falls back to the legacy rolled-up
    `expense_carry_forward + expense_adjustment` when the new fields are absent.
    """
    if not cf:
        return 0.0
    mat_cf = float(cf.get("material_carry_forward") or 0)
    lab_cf = float(cf.get("labour_carry_forward") or 0)
    pc_cf = float(cf.get("petty_cash_carry_forward") or 0)
    ind_cf = float(cf.get("indirect_carry_forward") or 0)
    cf_exp = mat_cf + lab_cf + pc_cf + ind_cf
    if cf_exp == 0:
        cf_exp = float(cf.get("expense_carry_forward") or 0) + float(cf.get("expense_adjustment") or 0)
    return cf_exp


def carry_forward_income(cf: Optional[dict]) -> float:
    """CF Income comes from `income_carry_forward + income_adjustment`."""
    if not cf:
        return 0.0
    return float(cf.get("income_carry_forward") or 0) + float(cf.get("income_adjustment") or 0)


def sum_expense_rows(rows: List[dict], project_id: Optional[str] = None) -> float:
    """Sum the unified rows, optionally restricted to one project."""
    if project_id:
        return sum(r.get("amount", 0) or 0 for r in rows if r.get("project_id") == project_id)
    return sum(r.get("amount", 0) or 0 for r in rows)


async def compute_project_expense_buckets(
    project_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, float]:
    """CANONICAL per-bucket LIVE expense for one project (no carry-forward).

    Returns ``{"recorded", "material", "labour", "petty_cash", "total"}`` —
    the shape the Carry Forward table and the project header have always
    consumed. `petty_cash` is always 0.0: those spends are counted through
    their `recorded_expenses` mirror (see module docstring).
    """
    expense_q = build_expense_query(project_id=project_id, start_date=start_date, end_date=end_date)
    recorded_exps, labour_exps, material_reqs, material_exps_legacy, _direct = await fetch_expense_source_docs(expense_q)
    by_source = build_expense_rows_by_source(
        recorded_exps, labour_exps, material_reqs, material_exps_legacy
    )
    recorded = sum_expense_rows(by_source["recorded"])
    labour = sum_expense_rows(by_source["labour"])
    material = sum_expense_rows(by_source["material_requests"]) + sum_expense_rows(by_source["material_legacy"])
    return {
        "recorded": recorded,
        "material": material,
        "labour": labour,
        "petty_cash": 0.0,
        "total": recorded + material + labour,
    }


async def compute_project_expense_total(
    project_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    include_carry_forward: bool = True,
) -> float:
    """CANONICAL project expense — the number Project Wise shows for this project.

    Any screen that needs "Total Expense" for a single project calls this and
    nothing else. Carry-forward is a lump-sum opening balance, not tied to any
    date, so it is folded in only for the all-time view — exactly as the
    Project Wise table does.
    """
    buckets = await compute_project_expense_buckets(project_id, start_date, end_date)
    total = buckets["total"]

    date_filtered = bool(start_date or end_date)
    if include_carry_forward and not date_filtered:
        cf = await db.project_carry_forwards.find_one({"project_id": project_id}, {"_id": 0})
        total += carry_forward_expense(cf)

    return round(total, 2)


async def compute_project_income_total(
    project_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    include_carry_forward: bool = True,
) -> float:
    """CANONICAL project income — the counterpart of :func:`compute_project_expense_total`.

    Income tab shows only APPROVED entries (or legacy entries without an
    explicit status field); pending_approval / rejected stay out so the number
    is strictly "money in the bank".
    """
    income_q: Dict[str, Any] = {"project_id": project_id, "$or": [
        {"status": "approved"},
        {"status": {"$exists": False}},
        {"status": None},
    ]}
    if start_date:
        income_q.setdefault("created_at", {})["$gte"] = start_date
    if end_date:
        income_q.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"

    incomes = await db.income.find(income_q, {"_id": 0, "amount": 1}).to_list(2000)
    total = sum(i.get("amount", 0) or 0 for i in incomes)

    if include_carry_forward and not (start_date or end_date):
        cf = await db.project_carry_forwards.find_one({"project_id": project_id}, {"_id": 0})
        total += carry_forward_income(cf)

    return round(total, 2)
