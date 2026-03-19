"""
Contact visibility rules:
- Super Admin, Sales, Pre-Sales: ALWAYS see phone/email
- Everyone else: Only see phone/email after project is converted AND payment approved by accountant
"""

PRIVILEGED_ROLES = ["super_admin", "sales", "pre_sales"]
CONTACT_FIELDS = ["phone", "email", "client_phone", "client_email"]


def strip_contact_fields(doc: dict) -> dict:
    """Remove contact fields from a document copy"""
    result = {**doc}
    for field in CONTACT_FIELDS:
        result.pop(field, None)
    if "re_project" in result and isinstance(result.get("re_project"), dict):
        result["re_project"] = {k: v for k, v in result["re_project"].items() if k not in CONTACT_FIELDS}
    if "lead" in result and isinstance(result.get("lead"), dict):
        result["lead"] = {k: v for k, v in result["lead"].items() if k not in CONTACT_FIELDS}
    return result


async def get_approved_re_project_ids(db, re_project_ids: list) -> set:
    """Check which RE projects have linked projects with accountant-verified payments"""
    if not re_project_ids:
        return set()

    re_docs = await db.re_projects.find(
        {"re_project_id": {"$in": re_project_ids}, "converted_project_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "re_project_id": 1, "converted_project_id": 1}
    ).to_list(500)

    project_id_map = {rp["converted_project_id"]: rp["re_project_id"] for rp in re_docs if rp.get("converted_project_id")}
    if not project_id_map:
        return set()

    verified_projects = await db.projects.find(
        {"project_id": {"$in": list(project_id_map.keys())}, "accountant_verified": True},
        {"_id": 0, "project_id": 1}
    ).to_list(500)

    return {project_id_map[p["project_id"]] for p in verified_projects}


async def get_approved_lead_ids(db, lead_ids: list) -> set:
    """Check which leads have linked projects with accountant-verified payments"""
    if not lead_ids:
        return set()

    projects = await db.projects.find(
        {"lead_id": {"$in": lead_ids}, "accountant_verified": True},
        {"_id": 0, "lead_id": 1}
    ).to_list(500)

    return {p["lead_id"] for p in projects}


async def filter_contacts_re_projects(db, projects: list, user_role: str) -> list:
    """Filter contact info from RE projects based on user role and payment status"""
    if user_role in PRIVILEGED_ROLES:
        return projects

    re_ids = [p.get("re_project_id") for p in projects if p.get("re_project_id")]
    approved_ids = await get_approved_re_project_ids(db, re_ids)

    return [
        p if p.get("re_project_id") in approved_ids else strip_contact_fields(p)
        for p in projects
    ]


async def filter_contacts_leads(db, leads: list, user_role: str) -> list:
    """Filter contact info from leads based on user role and payment status"""
    if user_role in PRIVILEGED_ROLES:
        return leads

    lead_ids = [lead.get("lead_id") for lead in leads if lead.get("lead_id")]
    approved_ids = await get_approved_lead_ids(db, lead_ids)

    return [
        lead if lead.get("lead_id") in approved_ids else strip_contact_fields(lead)
        for lead in leads
    ]
