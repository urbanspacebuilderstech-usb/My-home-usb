# Routes package - exports all routers
from .auth import router as auth_router
from .crm import router as crm_router
from .cre import router as cre_router
from .projects import router as projects_router

__all__ = [
    "auth_router",
    "crm_router", 
    "cre_router",
    "projects_router"
]
