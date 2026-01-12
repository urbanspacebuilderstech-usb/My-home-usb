class WorkOrderAssignment(BaseModel):
    assignment_id: str = Field(default_factory=lambda: f"assign_{uuid.uuid4().hex[:12]}")
    work_order_id: str
    project_id: str
    assigned_to_user_id: str
    assigned_by_user_id: str
    assignment_date: datetime
    due_date: datetime
    priority: str = "medium"
    status: str = "assigned"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectCommitment(BaseModel):
    commitment_id: str = Field(default_factory=lambda: f"commit_{uuid.uuid4().hex[:12]}")
    project_id: str
    item_name: str
    quantity: float
    units: str
    unit_rate: float
    total_cost: float
    category: str
    committed_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@api_router.get("/work-order-assignments/{project_id}")
async def get_work_order_assignments(project_id: str, user: User = Depends(get_current_user)):
    assignments = await db.work_order_assignments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for assignment in assignments:
        if isinstance(assignment.get("assignment_date"), str):
            assignment["assignment_date"] = datetime.fromisoformat(assignment["assignment_date"])
        if isinstance(assignment.get("due_date"), str):
            assignment["due_date"] = datetime.fromisoformat(assignment["due_date"])
        if isinstance(assignment.get("created_at"), str):
            assignment["created_at"] = datetime.fromisoformat(assignment["created_at"])
    return assignments


@api_router.post("/work-order-assignments")
async def create_work_order_assignment(assignment: WorkOrderAssignment, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    assignment.assigned_by_user_id = user.user_id
    assignment_dict = assignment.model_dump()
    assignment_dict["assignment_date"] = assignment_dict["assignment_date"].isoformat()
    assignment_dict["due_date"] = assignment_dict["due_date"].isoformat()
    assignment_dict["created_at"] = assignment_dict["created_at"].isoformat()
    
    await db.work_order_assignments.insert_one(assignment_dict)
    
    # Notify assigned user
    assigned_user = await db.users.find_one({"user_id": assignment.assigned_to_user_id}, {"_id": 0})
    if assigned_user:
        notif = Notification(
            user_id=assignment.assigned_to_user_id,
            title="New Work Order Assignment",
            message=f"You have been assigned work order {assignment.work_order_id}",
            link=f"/work-orders"
        )
        notif_dict = notif.model_dump()
        notif_dict["created_at"] = notif_dict["created_at"].isoformat()
        await db.notifications.insert_one(notif_dict)
    
    await create_audit_log(user.user_id, "create", "work_order_assignment", assignment.assignment_id, {"work_order_id": assignment.work_order_id})
    return assignment


@api_router.get("/project-commitments/{project_id}")
async def get_project_commitments(project_id: str, user: User = Depends(get_current_user)):
    commitments = await db.project_commitments.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    for commitment in commitments:
        if isinstance(commitment.get("committed_date"), str):
            commitment["committed_date"] = datetime.fromisoformat(commitment["committed_date"])
        if isinstance(commitment.get("created_at"), str):
            commitment["created_at"] = datetime.fromisoformat(commitment["created_at"])
    return commitments


@api_router.post("/project-commitments")
async def create_project_commitment(commitment: ProjectCommitment, user: User = Depends(get_current_user)):
    if user.role not in [UserRole.SUPER_ADMIN, UserRole.PROJECT_MANAGER, UserRole.PLANNING]:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    commitment_dict = commitment.model_dump()
    commitment_dict["committed_date"] = commitment_dict["committed_date"].isoformat()
    commitment_dict["created_at"] = commitment_dict["created_at"].isoformat()
    
    await db.project_commitments.insert_one(commitment_dict)
    await create_audit_log(user.user_id, "create", "project_commitment", commitment.commitment_id, {"item": commitment.item_name})
    
    return commitment