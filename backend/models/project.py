"""Project-related Pydantic models"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from core.enums import ProjectStatus, ProjectStage


class Project(BaseModel):
    project_id: str
    project_code: Optional[str] = None
    name: str
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: str = "residential"
    
    # Financial
    total_value: float = 0
    advance_amount: float = 0
    additional_cost: float = 0
    income_project: float = 0
    income_additional: float = 0
    total_expense: float = 0
    
    # Stage
    current_stage: str = "yet_to_start"
    status: str = "draft"
    
    # Dates
    start_date: datetime
    expected_completion: datetime
    created_at: datetime
    
    # References
    re_project_id: Optional[str] = None
    lead_id: Optional[str] = None
    package_id: Optional[str] = None
    created_by: str


class ProjectCreate(BaseModel):
    name: str
    client_name: str
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    building_type: str = "residential"
    total_value: float = 0
    expected_completion_months: int = 12


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    location: Optional[str] = None
    sqft: Optional[float] = None
    status: Optional[str] = None
    current_stage: Optional[str] = None
