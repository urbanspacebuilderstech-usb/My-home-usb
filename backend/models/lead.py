"""Lead-related Pydantic models"""
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from core.enums import LeadSource, StageType


class Lead(BaseModel):
    lead_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: LeadSource = LeadSource.OTHER
    stage_type: StageType
    current_stage_id: str
    
    # Address
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None
    summary: Optional[str] = None
    
    # Custom fields
    custom_fields: Dict[str, Any] = {}
    
    # References
    re_project_id: Optional[str] = None
    project_created: bool = False
    project_id: Optional[str] = None
    
    # Metadata
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: LeadSource = LeadSource.OTHER
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    notes: Optional[str] = None


class LeadStageUpdate(BaseModel):
    stage_id: str
    notes: Optional[str] = None
