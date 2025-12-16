"""
AxPersona Routes Module.

This module provides modular route handlers for the AxPersona pipeline:
- questionnaire: Questionnaire generation endpoints
- simulation: Simulation execution endpoints
- analysis: Analysis and persona generation endpoints
- pipeline: Full pipeline orchestration endpoints
- export: Data export endpoints
"""

from fastapi import APIRouter

from .questionnaire import router as questionnaire_router
from .simulation import router as simulation_router
from .analysis import router as analysis_router
from .pipeline import router as pipeline_router
from .export import router as export_router

# Combined router for all AxPersona routes
router = APIRouter()

# Include all sub-routers
router.include_router(questionnaire_router, tags=["Questionnaire"])
router.include_router(simulation_router, tags=["Simulation"])
router.include_router(analysis_router, tags=["Analysis"])
router.include_router(pipeline_router, tags=["Pipeline"])
router.include_router(export_router, tags=["Export"])

__all__ = [
    "router",
    "questionnaire_router",
    "simulation_router",
    "analysis_router",
    "pipeline_router",
    "export_router",
]

